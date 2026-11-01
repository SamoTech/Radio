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


class CommunityPlaylistTests(unittest.TestCase):
    FAKE_M3U = (
        "#EXTM3U\n"
        '#EXTINF:-1 tvg-logo="x.png" group-title="Rock",Test Rock One\n'
        "https://rock.example.com/stream\n"
        "#EXTINF:-1,Plain Name\n"
        "https://plain.example.com/aac\n"
        "http://insecure.example.com/stream\n"
        "#EXTINF:-1,Dup\n"
        "https://rock.example.com/stream\n"
        "#EXTINF:-1,Israel Radio\n"
        "https://stream.example.co.il/live\n"
        "#EXTINF:-1,Dead\n"
        "https://webradio.tda.dz/x_64K.mp3\n"
    )

    def test_parse_community_m3u_https_names_groups(self):
        rows = module.parse_community_m3u(self.FAKE_M3U)
        self.assertEqual(
            [row["url"] for row in rows],
            ["https://rock.example.com/stream", "https://plain.example.com/aac"],
        )
        self.assertEqual(rows[0]["name"], "Test Rock One")
        self.assertEqual(rows[0]["tags"], "Rock")
        self.assertEqual(rows[1]["name"], "Plain Name")
        self.assertEqual(rows[1]["tags"], "community")

    def test_community_playlist_is_pinned_and_capped(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("junguler/m3u-radio-music-playlists", source)
        self.assertIn("COMMUNITY_MAX = 5000", source)
        self.assertIn("COMMUNITY_IL_MARKERS", source)
        self.assertIn("officials + arabic + arab_extra + community + rb_stations", source)


if __name__ == "__main__":
    unittest.main()
