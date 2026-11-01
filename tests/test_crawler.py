import importlib.util
import unittest
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "update_data.py"
spec = importlib.util.spec_from_file_location("radio_update_data", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StationUrlTests(unittest.TestCase):
    def test_rejects_unsafe_schemes_and_credentials(self):
        self.assertEqual(module.station_url_key("javascript:alert(1)"), "")
        self.assertEqual(module.station_url_key("https://user:pass@example.test/live"), "")

    def test_normalizes_hosts_ports_and_fragments(self):
        self.assertEqual(
            module.station_url_key("HTTPS://Example.Test:443/live#player"),
            "https://example.test/live",
        )
        self.assertEqual(
            module.station_url_key("http://EXAMPLE.test:80/live"),
            "http://example.test/live",
        )

    def test_playlist_parser_accepts_only_https_streams(self):
        rows = module.parse_m3u(
            "#EXTM3U\n#EXTINF:-1,Secure\nhttps://radio.test/live\n"
            "#EXTINF:-1,Insecure\nhttp://radio.test/live\n"
            "#EXTINF:-1,Script\njavascript:alert(1)\n",
            "EG",
        )
        self.assertEqual([row["name"] for row in rows], ["Secure"])


    def test_dead_stream_patterns_cover_known_dead_hosts(self):
        expected = (
            "chadafm.ice.infomaniak.ch",
            "stream.alkafeel.net",
            "5c7b683162943.streamlock.net",
            "live-hls-audio-aje-ak.getaj.net",
        )
        for pattern in expected:
            self.assertIn(pattern, module.DEAD_URL_PATTERNS)

    def test_syria_playlist_is_included_in_iprd_merge(self):
        self.assertIn("SY", module.ARAB_IPRD)

    def test_dead_urls_are_skipped_in_playlist_merge(self):
        rows = module.parse_m3u(
            "#EXTM3U\n#EXTINF:-1,Dead\nhttps://stream.alkafeel.net/live/radio/playlist.m3u8\n"
            "#EXTINF:-1,Alive\nhttps://radio.test/live\n",
            "SY",
        )
        self.assertEqual([row["name"] for row in rows], ["Alive"])


class MultiSourceTests(unittest.TestCase):
    def setUp(self):
        self._orig_fetch_json = module.fetch_json
        self._orig_fetch_bytes = module.fetch_bytes

    def tearDown(self):
        module.fetch_json = self._orig_fetch_json
        module.fetch_bytes = self._orig_fetch_bytes

    def test_radio_browser_failover_includes_extra_mirrors(self):
        servers = " ".join(module.RB_APIS)
        self.assertIn("at1.api.radio-browser.info", servers)
        self.assertIn("fi1.api.radio-browser.info", servers)

    def test_iprd_world_discovers_countries_and_skips_arab_and_il(self):
        def fake_fetch_json(url, params=None, attempts=3, timeout=90):
            return {"countries": [
                {"code": "US", "count": 10},
                {"code": "IL", "count": 5},
                {"code": "EG", "count": 5},
                {"code": "DJ", "count": 3},
            ]}

        def fake_fetch_bytes(url, timeout=90):
            return "#EXTM3U\n#EXTINF:-1,Dj Station\nhttps://dj.test/live\n".encode("utf-8")

        module.fetch_json = fake_fetch_json
        module.fetch_bytes = fake_fetch_bytes
        rows = module.fetch_iprd_world()
        self.assertEqual([row["cc"] for row in rows], ["US", "DJ"])
        self.assertEqual(rows[0]["language"], "")
        self.assertEqual(rows[0]["tags"], "iprd,community")
        self.assertEqual(rows[1]["language"], "arabic")
        self.assertIn("عربي", rows[1]["tags"])

    def test_verified_streams_use_stream_url_and_skip_il(self):
        def fake_fetch_json(url, params=None, attempts=3, timeout=90):
            return {"countries": [
                {"countryCode": "DE", "stations": [
                    {"name": "Test FM", "stream": "https://t.test/live",
                     "codec": "aac", "bitrate": 128, "langs": ["german"],
                     "genre": ["pop"]},
                    {"name": "No Stream", "url": "https://w.test/page"},
                ]},
                {"countryCode": "IL", "stations": [
                    {"name": "Blocked", "stream": "https://il.test/live"}]},
            ]}

        module.fetch_json = fake_fetch_json
        rows = module.fetch_verified_streams()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["url"], "https://t.test/live")
        self.assertEqual(rows[0]["language"], "german")
        self.assertIn("verified", rows[0]["tags"])

    def test_icecast_yp_keeps_https_listen_urls_only(self):
        fake_xml = (
            "<yp><entry><server_name>Secure FM</server_name>"
            "<listen_url>https://s.test/live</listen_url></entry>"
            "<entry><server_name>Insecure FM</server_name>"
            "<listen_url>http://i.test/live</listen_url></entry></yp>"
        ).encode("utf-8")

        def fake_fetch_bytes(url, timeout=90):
            return fake_xml

        module.fetch_bytes = fake_fetch_bytes
        rows = module.fetch_icecast_yp()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Secure FM")
        self.assertEqual(rows[0]["tags"], "icecast,yp")


class HeadSnapshotTests(unittest.TestCase):
    def test_main_writes_head_snapshot_for_fast_first_paint(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn('DATA_DIR / "stations_head.json"', source)
        self.assertIn("head = stations[:2500]", source)


if __name__ == "__main__":
    unittest.main()
