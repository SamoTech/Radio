import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "radio_atlas_satnogs_sources",
    Path(__file__).resolve().parents[1] / "scripts" / "update_data.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

FAKE_STATIONS = [
    {
        "id": 1,
        "name": "Cairo Ground Station",
        "status": "online",
        "qthlocator": "KM72ts",
        "lat": 30.0,
        "lng": 31.2,
        "altitude": 75,
        "antenna": [{"band": "UHF"}, {"band": "VHF"}, {"band": "UHF"}],
    },
    {"id": 2, "name": "Sleepy RX", "status": "offline", "qthlocator": "JO01", "antenna": []},
    {"id": 3, "name": "Tel Aviv Uni Rooftop", "status": "online", "qthlocator": "KM72", "antenna": []},
]


class SatnogsSourceTests(unittest.TestCase):
    def _fetch(self, rows):
        original = MODULE.fetch_json
        MODULE.fetch_json = lambda url: rows
        try:
            return MODULE.fetch_satnogs()
        finally:
            MODULE.fetch_json = original

    def test_keeps_only_online_non_israeli_stations(self):
        out = self._fetch(FAKE_STATIONS)
        self.assertEqual([s["name"] for s in out], ["Cairo Ground Station"])
        self.assertEqual(out[0]["url"], "https://network.satnogs.org/stations/1/")
        self.assertIn("UHF", out[0]["loc"])
        self.assertIn("VHF", out[0]["loc"])
        self.assertEqual(out[0]["loc"].count("UHF"), 1)
        self.assertEqual(out[0]["https"], False)

    def test_returns_none_without_a_list(self):
        self.assertIsNone(self._fetch({"detail": "not found"}))

    def test_pins_api_url_and_exclusion_policy(self):
        import inspect
        self.assertIn("network.satnogs.org/api/stations/", MODULE.SATNOGS_API_URL)
        src = inspect.getsource(MODULE.fetch_satnogs)
        self.assertIn("SATNOGS_API_URL", src)
        self.assertIn('!= "online"', src)
        self.assertIn("SATNOGS_IL_MARKERS", src)
        self.assertIn("israel", inspect.getsource(MODULE))


if __name__ == "__main__":
    unittest.main()
