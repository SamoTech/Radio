import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "radio_atlas_wspr_sources",
    Path(__file__).resolve().parents[1] / "scripts" / "update_data.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

RB_HTML = (
    "<html><script>var receivers = "
    + '[{"label": "Test Site, Germany", "location": {"coordinates": [13.4, 52.5]}, '
    + '"url": "https://site.example/", "receivers": ['
    + '{"label": "RX One", "url": "https://rx1.example/"}]}];'
    + "</script></html>"
)


class ReceiverbookParsingTests(unittest.TestCase):
    def test_extracts_embedded_receivers(self):
        rows = MODULE._receiverbook_rows(RB_HTML)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "RX One")
        self.assertEqual(rows[0]["url"], "https://rx1.example/")
        self.assertEqual(rows[0]["loc"], "Test Site, Germany")
        self.assertEqual(rows[0]["lat"], 52.5)
        self.assertEqual(rows[0]["lon"], 13.4)

    def test_returns_empty_without_embedded_json(self):
        self.assertEqual(MODULE._receiverbook_rows("<html>nothing here</html>"), [])

    def test_site_without_receivers_array_is_used_directly(self):
        html = '<script>var receivers = [{"label": "Solo", "url": "http://solo.example/"}];</script>'
        rows = MODULE._receiverbook_rows(html)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Solo")

    def test_israel_receivers_are_excluded_by_name_or_location(self):
        html = (
            '<script>var receivers = ['
            + '{"label": "Site, Israel", "url": "https://il.example/", '
            + '"receivers": [{"label": "IL RX", "url": "https://il.example/rx"}]}];</script>'
        )
        rows = MODULE._receiverbook_rows(html)
        seen = set()
        kept = []
        for rx in rows:
            blob = (rx["name"] + " " + rx["loc"]).lower()
            if rx["url"] in seen or "israel" in blob:
                continue
            seen.add(rx["url"])
            kept.append(rx)
        self.assertEqual(kept, [])


if __name__ == "__main__":
    unittest.main()