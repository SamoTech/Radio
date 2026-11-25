import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('stage_production', ROOT / 'scripts/stage_production.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def make_fixture(root):
    for name in MODULE.REQUIRED_FILES:
        file = root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text('{}' if name.endswith('.json') else '', encoding='utf-8')
    (root / 'sw.js').write_text("var CACHE = 'radio-atlas-v103'; var SHELL = ['./', './offline.html', './js/app.js'];")
    (root / 'manifest.webmanifest').write_text(json.dumps({'icons': [{'src': 'icons/icon.svg'}], 'start_url': '.', 'scope': '.'}))
    (root / 'sitemap.xml').write_text('<urlset><url><loc>' + MODULE.BASE + '</loc></url></urlset>')
    (root / 'robots.txt').write_text('User-agent: *\nAllow: /\nSitemap: ' + MODULE.BASE + 'sitemap.xml\n')
    (root / 'data/stations.manifest.json').write_text(json.dumps({'version': 2, 'keep': 2, 'count': 1, 'full': 'data/stations.json'}))
    for name in ('data/stations.json', 'data/stations_head.json'):
        (root / name).write_text(json.dumps({'count': 1, 'stations': [{'name': 'test', 'url': 'https://example.org/radio', 'cc': 'EG'}]}))
    for number in (1, 2):
        file = root / ('data/stations_delta/' + str(number) + '.json')
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(json.dumps({'version': number, 'added': [], 'updated': [], 'removed': []}))
    for directory in MODULE.SEO_DIRECTORIES:
        file = root / directory / 'index.html'
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text('<a href="../index.html">Radio</a>')


def snapshot(root):
    return {p.relative_to(root).as_posix(): (hashlib.sha256(p.read_bytes()).hexdigest(), p.stat().st_mtime_ns)
            for p in root.rglob('*') if p.is_file()}


class ProductionStagingTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name)
        self.root = self.base / 'source'
        self.root.mkdir()
        make_fixture(self.root)

    def test_explicit_inventory_includes_runtime_and_excludes_development_and_credentials(self):
        for name in ('tests/fixtures/audio.json', 'scripts/update_data.py', 'docs/evidence.json',
                     'proxy/kiwi-wrangler.toml', '.env', 'data/credentials.json',
                     'js/private-config.json', 'icons/credentials.pem', 'AGENTS.md', 'ROADMAP.md', 'build-info.json'):
            file = self.root / name
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text('private')
        result = MODULE.stage(self.root, self.base / 'public')
        names = result['inventory']
        self.assertTrue(set(MODULE.REQUIRED_FILES).issubset(names))
        self.assertIn('data/stations_delta/2.json', names)
        self.assertIn('countries/index.html', names)
        self.assertNotIn('build-info.json', names)
        self.assertEqual(set(names), {p.relative_to(self.base / 'public').as_posix() for p in (self.base / 'public').rglob('*') if p.is_file()})
        self.assertFalse(any(n.startswith(('tests/', 'scripts/', 'docs/', 'proxy/')) or '.env' in n or 'credentials' in n for n in names))

    def test_optional_public_advertising_files_are_preserved(self):
        (self.root / 'ads.txt').write_text('example.org, 123, DIRECT')
        self.assertIn('ads.txt', MODULE.production_inventory(self.root))

    def test_missing_required_asset_fails_before_writing_output(self):
        (self.root / 'icons/icon.svg').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing required production file: icons/icon.svg'):
            MODULE.stage(self.root, self.base / 'public')
        self.assertFalse((self.base / 'public').exists())

    def test_service_worker_precache_must_exist(self):
        (self.root / 'sw.js').write_text("var SHELL = ['./absent.html'];")
        with self.assertRaisesRegex(ValueError, 'sw.js -> absent.html'):
            MODULE.production_inventory(self.root)

    def test_html_relative_paths_must_exist(self):
        (self.root / 'countries/index.html').write_text('<script src="../js/new-runtime.js"></script>')
        with self.assertRaisesRegex(ValueError, 'countries/index.html -> js/new-runtime.js'):
            MODULE.production_inventory(self.root)

    def test_css_and_es_import_paths_must_exist(self):
        (self.root / 'css/styles.css').write_text('body { background: url(../icons/missing.png); }')
        with self.assertRaisesRegex(ValueError, 'icons/missing.png'):
            MODULE.production_inventory(self.root)
        (self.root / 'css/styles.css').write_text('')
        (self.root / 'js/modules/player.mjs').write_text("import {decode} from './missing.mjs';")
        with self.assertRaisesRegex(ValueError, 'js/modules/missing.mjs'):
            MODULE.production_inventory(self.root)

    def test_runtime_fixed_fetch_paths_must_be_allowlisted(self):
        (self.root / 'js/app.js').write_text("fetchJSON('data/new-runtime.json');")
        (self.root / 'data/new-runtime.json').write_text('{}')
        with self.assertRaisesRegex(ValueError, 'data/new-runtime.json'):
            MODULE.production_inventory(self.root)

    def test_lazy_module_dependencies_must_be_allowlisted(self):
        (self.root / 'js/app.js').write_text("loadModule('new-feature').then(start);")
        with self.assertRaisesRegex(ValueError, 'js/modules/new-feature.mjs'):
            MODULE.production_inventory(self.root)

    def test_sitemap_destinations_must_exist_and_be_on_our_site(self):
        for url in (MODULE.BASE + 'countries/missing.html', 'https://example.org/'):
            with self.subTest(url=url):
                (self.root / 'sitemap.xml').write_text('<urlset><url><loc>' + url + '</loc></url></urlset>')
                with self.assertRaises(ValueError):
                    MODULE.production_inventory(self.root)

    def test_catalog_retained_deltas_and_versions_must_resolve(self):
        (self.root / 'data/stations_delta/1.json').unlink()
        with self.assertRaisesRegex(ValueError, 'Missing retained catalog delta'):
            MODULE.production_inventory(self.root)
        (self.root / 'data/stations_delta/1.json').write_text(json.dumps({'version': 99, 'added': [], 'updated': [], 'removed': []}))
        with self.assertRaisesRegex(ValueError, 'Invalid catalog delta'):
            MODULE.production_inventory(self.root)

    def test_catalog_full_path_and_station_count_are_validated(self):
        manifest = self.root / 'data/stations.manifest.json'
        original = json.loads(manifest.read_text())
        for key, value, expected in [('full', '../secret.json', 'Unexpected full catalog path'), ('count', 2, 'Catalog station count')]:
            with self.subTest(key=key):
                manifest.write_text(json.dumps({**original, key: value}))
                with self.assertRaisesRegex(ValueError, expected):
                    MODULE.production_inventory(self.root)

    def test_paths_cannot_traverse_and_symlinks_are_rejected(self):
        for path in ('../secret', '/etc/passwd', 'js/../sw.js', 'js//app.js', 'js\\app.js'):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, 'Unsafe production path'):
                MODULE.public_file(self.root, path)
        (self.root / 'icons/icon.svg').unlink()
        (self.root / 'icons/icon.svg').symlink_to(self.root / 'sw.js')
        with self.assertRaisesRegex(ValueError, 'Symlinks are forbidden'):
            MODULE.production_inventory(self.root)

    def test_symlink_directories_and_output_parents_are_rejected(self):
        shutil.rmtree(self.root / 'countries')
        (self.root / 'countries').symlink_to(self.root / 'genres', target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'unsafe production directory'):
            MODULE.production_inventory(self.root)
        link = self.base / 'link'
        link.symlink_to(self.base, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'Symlink staging destination'):
            MODULE.stage(self.root, link / 'public')

    def test_credential_like_content_in_allowlisted_file_is_rejected(self):
        (self.root / 'js/analytics.js').write_text('-----BEGIN PRIVATE KEY-----')
        with self.assertRaisesRegex(ValueError, 'Credential-like content rejected.*analytics.js'):
            MODULE.production_inventory(self.root)

    def test_staging_is_reproducible_and_does_not_modify_source(self):
        before = snapshot(self.root)
        first = MODULE.stage(self.root, self.base / 'one')
        second = MODULE.stage(self.root, self.base / 'two')
        self.assertEqual(first['inventory'], sorted(first['inventory']))
        self.assertEqual(first['bytes'], second['bytes'])
        self.assertEqual(snapshot(self.base / 'one'), snapshot(self.base / 'two'))
        self.assertEqual(before, snapshot(self.root))
        for file in (self.base / 'one').rglob('*'):
            self.assertEqual(file.stat().st_mtime_ns, 0)

    def test_output_cannot_mutate_source_or_erase_existing_files(self):
        for output in (self.root, self.root / 'public', self.base):
            with self.subTest(output=output), self.assertRaisesRegex(ValueError, 'outside the source tree'):
                MODULE.stage(self.root, output)
        output = self.base / 'public'
        output.mkdir()
        (output / 'keep').write_text('important')
        with self.assertRaisesRegex(ValueError, 'absent or empty'):
            MODULE.stage(self.root, output)
        self.assertEqual((output / 'keep').read_text(), 'important')

    def test_current_repository_inventory_resolves(self):
        names = MODULE.production_inventory(ROOT)
        self.assertIn('js/modules/owrx-adpcm.mjs', names)
        self.assertIn('data/stations.json', names)
        self.assertIn('languages/arabic.html', names)
        self.assertNotIn('scripts/update_data.py', names)


if __name__ == '__main__':
    unittest.main()
