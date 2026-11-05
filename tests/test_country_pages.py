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
            self.assertLess(
                page.index("regions:"),
                page.index('analytics_storage:"granted"'),
            )
            self.assertIn('name="keywords"', page)
            self.assertNotIn("il.example", page)
            self.assertEqual(len(page.split("<li>")) - 1, 60)
            sitemap = (root / "sitemap.xml").read_text(encoding="utf-8")
            self.assertIn("countries/eg.html", sitemap)
            self.assertIn("about.html", sitemap)
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

class SeoGenreLanguagePagesTests(unittest.TestCase):
    def _write_snapshot(self, tmp, stations):
        path = Path(tmp) / "stations.json"
        path.write_text(
            json.dumps(
                {"updated": "2026-11-05T00:00:00Z", "count": len(stations),
                 "stations": stations}
            ),
            encoding="utf-8",
        )
        return path

    def test_seo_fold_and_slug(self):
        self.assertEqual(MODULE._seo_slug("Café Français"), "cafe-francais")
        self.assertEqual(MODULE._language_slug("Français"), "francais")
        self.assertEqual(MODULE._language_slug("العربية"), "arabic")
        self.assertEqual(MODULE._language_slug("中文（繁体）"), "chinese")
        self.assertEqual(MODULE._language_slug(""), "")
        self.assertEqual(MODULE._language_slug("unknown"), "")

    def test_genre_keys_fold_aliases_and_skip_junk(self):
        self.assertEqual(MODULE._genre_key_for_tag("Top 40"), "top40")
        self.assertEqual(MODULE._genre_key_for_tag("  NEWS "), "news")
        self.assertEqual(MODULE._genre_key_for_tag("iprd"), "")
        self.assertEqual(MODULE._genre_key_for_tag("official"), "")
        # only curated genres (keys of GENRE_TITLES_AR) can ever produce a page
        for key in MODULE.GENRE_ALIASES.values():
            self.assertIn(key, MODULE.GENRE_TITLES_AR)

    def test_generate_pages_files_sitemap_and_il_exclusion(self):
        with tempfile.TemporaryDirectory() as tmp:
            stations = []
            for i in range(100):
                stations.append({
                    "name": f"News Radio {i}",
                    "url": f"https://news{i}.test/live",
                    "cc": "EG",
                    "tags": "Top 40,news,iprd",
                    "language": "Français,العربية",
                })
            # small groups stay below the page minimum — no page for them
            stations.append({"name": "Jazz Corner", "url": "https://jazz.test/live",
                             "cc": "EG", "tags": "jazz", "language": "english"})
            # Israeli stations must never reach any generated page
            stations.append({"name": "ILX Station", "url": "https://ilx.test/live",
                             "cc": "IL", "tags": "news", "language": "english"})
            MODULE.generate_genre_language_pages(self._write_snapshot(tmp, stations), out_root=tmp)

            news_html = (Path(tmp) / "genres" / "news.html").read_text(encoding="utf-8")
            self.assertIn("راديو الأخبار", news_html)
            self.assertIn("News Radio 5", news_html)
            self.assertNotIn("ILX Station", news_html)
            self.assertTrue((Path(tmp) / "genres" / "top40.html").exists())
            self.assertFalse((Path(tmp) / "genres" / "jazz.html").exists())
            self.assertTrue((Path(tmp) / "languages" / "francais.html").exists())
            self.assertTrue((Path(tmp) / "languages" / "arabic.html").exists())
            self.assertFalse((Path(tmp) / "languages" / "english.html").exists())
            self.assertTrue((Path(tmp) / "genres" / "index.html").exists())
            self.assertTrue((Path(tmp) / "languages" / "index.html").exists())
            sitemap = (Path(tmp) / "sitemap.xml").read_text(encoding="utf-8")
            self.assertIn("genres/news.html", sitemap)
            self.assertIn("languages/arabic.html", sitemap)
            self.assertNotIn("languages/english.html", sitemap)

    def test_generate_pages_skips_small_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            stations = [
                {"name": "A", "url": "https://a.test/live", "cc": "EG",
                 "tags": "news", "language": "english"}
                for _ in range(50)
            ]
            MODULE.generate_genre_language_pages(self._write_snapshot(tmp, stations), out_root=tmp)
            self.assertFalse((Path(tmp) / "genres").exists())

    def test_write_sitemap_dedup_and_lastmod(self):
        with tempfile.TemporaryDirectory() as tmp:
            MODULE.write_sitemap(tmp, ["https://x.test/", "https://x.test/", "https://y.test/"],
                                 "2026-11-05T00:00:00Z")
            sitemap = (Path(tmp) / "sitemap.xml").read_text(encoding="utf-8")
            self.assertEqual(sitemap.count("https://x.test/"), 1)
            self.assertIn("2026-11-05", sitemap)

if __name__ == "__main__":
    unittest.main()
