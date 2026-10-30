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


if __name__ == "__main__":
    unittest.main()
