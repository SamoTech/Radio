import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "deployment_provenance", ROOT / "scripts" / "deployment_provenance.py"
)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SHA = "a" * 40


def make_fixture(root: Path):
    for name in MODULE.ASSETS:
        file = root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        content = b"var CACHE = 'radio-atlas-v78';" if name == "sw.js" else name.encode("utf-8")
        file.write_bytes(content)
    manifest = root / "data" / "stations.manifest.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps({"version": 31, "count": 60726}), encoding="utf-8")


class DeploymentProvenanceTests(unittest.TestCase):
    def test_release_metadata_is_bound_to_exact_source_and_asset_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_fixture(root)
            stamp = MODULE.release_metadata(root, SHA)
            self.assertEqual(stamp["source_commit"], SHA)
            self.assertEqual(stamp["service_worker_cache"], "radio-atlas-v78")
            self.assertEqual(stamp["catalog_version"], 31)
            self.assertEqual(stamp["catalog_count"], 60726)
            for name, digest in stamp["asset_sha256"].items():
                self.assertEqual(digest, MODULE.sha256((root / name).read_bytes()))

    def test_rejects_invalid_commit_or_missing_sw_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_fixture(root)
            with self.assertRaises(ValueError):
                MODULE.release_metadata(root, "not-a-sha")
            (root / "sw.js").write_text("bad worker", encoding="utf-8")
            with self.assertRaises(ValueError):
                MODULE.release_metadata(root, SHA)

    def test_verification_detects_stale_assets_even_if_build_descriptor_matches(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_fixture(root)
            stamp = MODULE.release_metadata(root, SHA)
            blobs = {
                MODULE.STAMP: json.dumps(stamp).encode("utf-8"),
                **{name: (root / name).read_bytes() for name in MODULE.ASSETS},
            }
            with patch.object(MODULE, "http_get", side_effect=lambda name, token: blobs[name]):
                verified = MODULE.verify_once(root, SHA)
                self.assertEqual(verified["published_commit"], SHA)
                self.assertEqual(len(verified["verified_assets"]), len(MODULE.ASSETS))
                blobs["sw.js"] = b"var CACHE = 'radio-atlas-v77';"
                with self.assertRaisesRegex(ValueError, "sw.js"):
                    MODULE.verify_once(root, SHA)

    def test_native_sdr_runtime_assets_are_covered_and_checked(self):
        required = {
            "js/modules/sdr.mjs", "js/modules/sdr-adapters.mjs",
            "js/modules/openwebrx-native.mjs", "js/modules/sdr-waterfall.mjs",
            "data/receiver_audio_checks.json",
        }
        self.assertTrue(required.issubset(set(MODULE.ASSETS)))
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_fixture(root)
            stamp = MODULE.release_metadata(root, SHA)
            blobs = {
                MODULE.STAMP: json.dumps(stamp).encode("utf-8"),
                **{name: (root / name).read_bytes() for name in MODULE.ASSETS},
            }
            # A correct release descriptor alone is not sufficient: every
            # advertised native SDR runtime asset must match the live bytes.
            blobs["js/modules/openwebrx-native.mjs"] = b"stale receiver adapter"
            with patch.object(MODULE, "http_get", side_effect=lambda name, token: blobs[name]):
                with self.assertRaisesRegex(ValueError, "openwebrx-native.mjs"):
                    MODULE.verify_once(root, SHA)

    def test_waterfall_module_must_match_the_production_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_fixture(root)
            stamp = MODULE.release_metadata(root, SHA)
            blobs = {
                MODULE.STAMP: json.dumps(stamp).encode("utf-8"),
                **{name: (root / name).read_bytes() for name in MODULE.ASSETS},
            }
            blobs["js/modules/sdr-waterfall.mjs"] = b"stale waterfall code"
            with patch.object(MODULE, "http_get", side_effect=lambda name, token: blobs[name]):
                with self.assertRaisesRegex(ValueError, "sdr-waterfall.mjs"):
                    MODULE.verify_once(root, SHA)

    def test_old_commit_descriptor_must_not_be_accepted(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            make_fixture(root)
            stamp = MODULE.release_metadata(root, SHA)
            stamp["source_commit"] = "b" * 40
            blobs = {MODULE.STAMP: json.dumps(stamp).encode("utf-8")}
            with patch.object(MODULE, "http_get", side_effect=lambda name, token: blobs[name]):
                with self.assertRaisesRegex(ValueError, "published source commit differs"):
                    MODULE.verify_once(root, SHA)


if __name__ == "__main__":
    unittest.main()
