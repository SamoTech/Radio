import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "radio_atlas_map_sources",
    Path(__file__).resolve().parents[1] / "scripts" / "update_data.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class GpsValueTests(unittest.TestCase):
    def test_keeps_lat_lon_pair_and_drops_zero_or_invalid(self):
        self.assertEqual(MODULE.gps_value([50.8, -0.66]), [50.8, -0.66])
        self.assertIs(MODULE.gps_value([0.0, 0.0]), False)
        self.assertIs(MODULE.gps_value(True), False)
        self.assertIs(MODULE.gps_value(None), False)

    def test_from_mirror_keeps_gps_coordinates(self):
        receivers, fetched_at = MODULE.from_mirror(
            {
                "fetched_at": "2026-10-31T00:00:00Z",
                "receivers": [
                    {"name": "Map RX", "url": "https://rx.example/", "gps": [50.8, -0.66], "bands": []},
                    {"name": "No GPS", "url": "https://rx2.example/", "gps": True, "bands": []},
                ],
            }
        )
        self.assertEqual(fetched_at, "2026-10-31T00:00:00Z")
        self.assertEqual(receivers[0]["gps"], [50.8, -0.66])
        self.assertIs(receivers[1]["gps"], False)

    def test_from_legacy_keeps_gps_coordinates(self):
        rows, _ = MODULE.from_legacy(
            [{"name": "Map RX", "url": "https://rx.example/", "gps": [40.1, 3.2], "online": True}]
        )
        self.assertEqual(rows[0]["gps"], [40.1, 3.2])


class WebSdrCoordinateTests(unittest.TestCase):
    def test_fetch_web_sdrs_keeps_lat_lon(self):
        original = MODULE._web_sdr_type_rows

        def fake_rows(kind):
            return (
                [
                    {
                        "name": "Map RX One",
                        "url": "https://rx1.example/",
                        "loc": "Test City",
                        "lat": 52.5,
                        "lon": 13.4,
                    }
                ],
                "test",
            )

        MODULE._web_sdr_type_rows = fake_rows
        try:
            out = MODULE.fetch_web_sdrs()
        finally:
            MODULE._web_sdr_type_rows = original
        for kind in ("websdr", "openwebrx"):
            self.assertEqual(out[kind][0]["lat"], 52.5)
            self.assertEqual(out[kind][0]["lon"], 13.4)
            self.assertIs(out[kind][0]["https"], True)


class LandMapTests(unittest.TestCase):
    def test_land_map_url_is_pinned(self):
        self.assertIn("land-110m", MODULE.LAND_MAP_URL)
        self.assertIn("jsdelivr", MODULE.LAND_MAP_URL)

    def test_land_fetch_validates_topology_shape(self):
        import inspect
        src = inspect.getsource(MODULE.fetch_land_map)
        self.assertIn("LAND_MAP_URL", src)
        self.assertIn("arcs", src)


if __name__ == "__main__":
    unittest.main()
