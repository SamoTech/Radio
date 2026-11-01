import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "radio_atlas_country_pages",
    Path(__file__).resolve().parents[1] / "scripts" / "update_data.py",
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def snapshot(stations):
    return {"updated": "2026-10-31T00:00:00+00:00", "count": len(stations), "stations": stations}


def station(name, url, cc):
    return {"name": name, "url": url, "cc": cc, "language": "", "tags": "", "codec": "MP3", "bitrate": 0}


class CountryPagesTests(unittest.TestCase):
    def test_generates_country_pages_sitemap_and_robots(self):
        stations = [
            station("Radio " + str(i), "https://radio.example/stream" + str(i), "EG")
            for i in range(120)
        ]
        stations.append(station("Excluded", "https://il.example/live", "IL"))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            snapshot_path = root / "stations.json"
            snapshot_path.write_text(json.dumps(snapshot(stations)), encoding="utf-8")
            MODULE.generate_country_pages(snapshot_path, root)
            page = (root / "countries" / "eg.html").read_text(encoding="utf-8")
            self.assertIn("راديو مصر", page)
            self.assertIn("Radio 0", page)
            self.assertIn("#play=", page)
            self.assertIn("G-1NG4ZXNVGD", page)
            self.assertIn("ad_storage", page)
            self.assertNotIn("il.example", page)
            self.assertEqual(len(page.split("<li>")) - 1, 60)
            sitemap = (root / "sitemap.xml").read_text(encoding="utf-8")
            self.assertIn("countries/eg.html", sitemap)
            robots = (root / "robots.txt").read_text(encoding="utf-8")
            index_page = (root / "countries" / "index.html").read_text(encoding="utf-8")
            self.assertIn("(120 محطة)", index_page)
            self.assertLess(len(index_page), 50000)
            self.assertIn("Sitemap: https://samotech.github.io/Radio/sitemap.xml", robots)

    def test_skips_snapshots_that_are_too_small(self):
        stations = [station("Only One", "https://radio.example/live", "EG")]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            snapshot_path = root / "stations.json"
            snapshot_path.write_text(json.dumps(snapshot(stations)), encoding="utf-8")
            MODULE.generate_country_pages(snapshot_path, root)
            self.assertFalse((root / "countries" / "eg.html").exists())


if __name__ == "__main__":
    unittest.main()

