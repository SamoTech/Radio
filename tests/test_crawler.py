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


class HeadSnapshotTests(unittest.TestCase):
    def test_main_writes_head_snapshot_for_fast_first_paint(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn('DATA_DIR / "stations_head.json"', source)
        self.assertIn("head = stations[:2500]", source)


if __name__ == "__main__":
    unittest.main()
