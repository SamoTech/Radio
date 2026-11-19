import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("sitemap_audit", ROOT / "scripts" / "sitemap_audit.py")
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


class SitemapForensicsTests(unittest.TestCase):
    def test_repository_sitemap_urls_are_unique_canonical_and_indexable(self):
        report = AUDIT.audit_source(ROOT)
        self.assertGreaterEqual(report["urls"], 100)
        self.assertEqual(report["issues"], [], report["issues"][:10])

    def test_parser_rejects_sitemaps_with_bad_namespace_and_duplicates(self):
        with self.assertRaises(ValueError):
            AUDIT.sitemap_locs('<urlset><url><loc>https://example.test/</loc></url></urlset>')
        xml = (
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            '<url><loc>https://samotech.github.io/Radio/</loc></url>'
            '<url><loc>https://samotech.github.io/Radio/</loc></url></urlset>'
        )
        with self.assertRaises(ValueError):
            AUDIT.sitemap_locs(xml)

    def test_source_scope_rejects_host_root_and_query_urls(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                AUDIT.source_page(Path(tmp), "https://samotech.github.io/")
            with self.assertRaises(ValueError):
                AUDIT.source_page(Path(tmp), "https://samotech.github.io/Radio/?q=1")
            self.assertEqual(
                AUDIT.source_page(Path(tmp), "https://samotech.github.io/Radio/countries/"),
                Path(tmp) / "countries" / "index.html"
            )

    def test_metadata_extracts_canonical_robots_and_title(self):
        parsed = AUDIT.read_metadata(
            '<html><head><title>Radio Atlas</title>'
            '<link rel="canonical" href="https://samotech.github.io/Radio/">'
            '<meta name="robots" content="index, follow"></head></html>'
        )
        self.assertEqual(parsed.canonical, "https://samotech.github.io/Radio/")
        self.assertEqual(parsed.robots, "index, follow")
        self.assertEqual(parsed.title, "Radio Atlas")

    def test_local_audit_detects_canonical_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "sitemap.xml").write_text(
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
                '<url><loc>https://samotech.github.io/Radio/</loc></url></urlset>',
                encoding="utf-8"
            )
            (base / "index.html").write_text(
                '<html><head><title>Page</title>'
                '<link rel="canonical" href="https://samotech.github.io/"></head></html>',
                encoding="utf-8"
            )
            report = AUDIT.audit_source(base)
            self.assertEqual(report["urls"], 1)
            self.assertTrue(any("canonical mismatch" in issue["reason"] for issue in report["issues"]))


if __name__ == "__main__":
    unittest.main()
