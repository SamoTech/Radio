import copy
import hashlib
from http.client import IncompleteRead
import importlib.util
import io
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "deployment_provenance", ROOT / "scripts" / "deployment_provenance.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
SHA = "a" * 40
# Test fixture inventory only; production has no second hand-maintained asset list.
FIXTURE_ASSETS = (
    "index.html", "sw.js", "css/styles.css", "manifest.webmanifest", "sitemap.xml",
    "js/app.js", "js/analytics.js", "js/modules/sdr.mjs", "js/modules/sdr-adapters.mjs",
    "js/modules/openwebrx-native.mjs", "js/modules/sdr-waterfall.mjs",
    "js/modules/owrx-adpcm.mjs", "js/modules/kiwi-waterfall.mjs", "js/modules/map.mjs",
    "js/modules/regions.mjs", "data/receiver_audio_checks.json", "data/stations.json",
    "data/stations.manifest.json", "data/stations_head.json", "data/stations_delta/31.json")


def make_fixture(root):
    for name in FIXTURE_ASSETS:
        file = root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(b"var CACHE = 'radio-atlas-v78';" if name == "sw.js" else name.encode())
    (root / "data/stations.manifest.json").write_text(json.dumps({"version": 31, "count": 2}))
    (root / "data/stations.json").write_text(json.dumps({"count": 2, "stations": [{}, {}]}))


class Response(io.BytesIO):
    status = 200

    def __init__(self, data, headers=None):
        super().__init__(data)
        self.headers = headers or {}
        self.max_read = 0

    def read(self, size=-1):
        if size < 0:
            raise AssertionError("unbounded response read")
        self.max_read = max(self.max_read, size)
        return super().read(size)

    def read1(self, size=-1):
        return self.read(size)


class DeploymentProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        make_fixture(self.root)
        self.inventory = patch.object(MODULE, "production_inventory", return_value=sorted(FIXTURE_ASSETS))
        self.inventory.start()
        self.addCleanup(self.inventory.stop)
        self.stamp = MODULE.release_metadata(self.root, SHA)
        self.blobs = {name: (self.root / name).read_bytes() for name in FIXTURE_ASSETS}
        self.blobs[MODULE.STAMP] = json.dumps(self.stamp).encode()

    def opener(self, request, timeout):
        name = request.full_url.removeprefix(MODULE.BASE).split("?", 1)[0]
        if name not in self.blobs:
            raise HTTPError(request.full_url, 404, "missing", {}, None)
        return Response(self.blobs[name])

    def verify(self):
        with patch.object(MODULE, "urlopen", side_effect=self.opener):
            return MODULE.verify_once(self.root, SHA)

    def test_release_metadata_is_bound_to_exact_source_and_asset_bytes(self):
        self.assertEqual(self.stamp["source_commit"], SHA)
        self.assertEqual(self.stamp["schema_version"], 2)
        self.assertEqual(self.stamp["service_worker_cache"], "radio-atlas-v78")
        self.assertEqual(self.stamp["catalog_version"], 31)
        self.assertEqual(self.stamp["catalog_count"], 2)
        for name, digest in self.stamp["asset_sha256"].items():
            self.assertEqual(digest, MODULE.sha256((self.root / name).read_bytes()))
            self.assertEqual(self.stamp["asset_size_bytes"][name], (self.root / name).stat().st_size)
        self.assertEqual(self.stamp, MODULE.release_metadata(self.root, SHA))
        self.assertNotIn(MODULE.STAMP, self.stamp["asset_sha256"])

    def test_rejects_invalid_commit_or_missing_sw_version(self):
        with self.assertRaises(ValueError):
            MODULE.release_metadata(self.root, "not-a-sha")
        (self.root / "sw.js").write_text("bad worker")
        with self.assertRaisesRegex(ValueError, "CACHE"):
            MODULE.release_metadata(self.root, SHA)

    def test_verifies_all_inventory_assets(self):
        result = self.verify()
        self.assertEqual(result["published_commit"], SHA)
        self.assertEqual(set(result["verified_assets"]), set(FIXTURE_ASSETS))
        self.assertEqual(result["verified_asset_count"], len(FIXTURE_ASSETS))

    def test_every_runtime_asset_must_match_even_with_correct_descriptor(self):
        for name in FIXTURE_ASSETS:
            with self.subTest(name=name):
                saved = self.blobs[name]
                self.blobs[name] = bytes([saved[0] ^ 1]) + saved[1:]
                with self.assertRaisesRegex(ValueError, name.replace(".", r"\.")):
                    self.verify()
                self.blobs[name] = saved

    def test_old_commit_descriptor_must_not_be_accepted(self):
        self.stamp["source_commit"] = "b" * 40
        self.blobs[MODULE.STAMP] = json.dumps(self.stamp).encode()
        with self.assertRaisesRegex(ValueError, "published source commit differs"):
            self.verify()

    def test_missing_asset_is_failure(self):
        del self.blobs["data/stations.json"]
        with self.assertRaises(HTTPError) as error:
            self.verify()
        self.assertEqual(error.exception.code, 404)

    def test_corrupted_or_missing_or_extra_descriptor_entries_fail(self):
        for field in ("asset_sha256", "asset_size_bytes"):
            for mutation in ("missing", "unexpected", "wrong"):
                with self.subTest(field=field, mutation=mutation):
                    stamp = copy.deepcopy(self.stamp)
                    if mutation == "missing":
                        del stamp[field]["js/app.js"]
                    elif mutation == "unexpected":
                        stamp[field]["secrets.env"] = "0" * 64 if field == "asset_sha256" else 1
                    else:
                        stamp[field]["js/app.js"] = "0" * 64 if field == "asset_sha256" else 1
                    self.blobs[MODULE.STAMP] = json.dumps(stamp).encode()
                    with self.assertRaisesRegex(ValueError, field):
                        self.verify()

    def test_incorrect_catalog_version_or_count_fail(self):
        for field in ("catalog_version", "catalog_count", "schema_version", "service_worker_cache"):
            with self.subTest(field=field):
                stamp = copy.deepcopy(self.stamp)
                stamp[field] = "incorrect"
                self.blobs[MODULE.STAMP] = json.dumps(stamp).encode()
                with self.assertRaisesRegex(ValueError, field):
                    self.verify()

    def test_invalid_descriptor_rejected(self):
        for data in (b"not json", b"[]", b"null", b"{}", b'{"source_commit":"x","source_commit":"y"}'):
            with self.subTest(data=data):
                self.blobs[MODULE.STAMP] = data
                with self.assertRaises(ValueError):
                    self.verify()

    def test_descriptor_unexpected_fields_are_rejected(self):
        self.stamp["unexpected"] = "value"
        self.blobs[MODULE.STAMP] = json.dumps(self.stamp).encode()
        with self.assertRaisesRegex(ValueError, "fields"):
            self.verify()

    def test_actual_local_catalog_count_must_match_manifest(self):
        for catalog in ({"count": 2, "stations": [{}]}, {"count": 3, "stations": [{}, {}]}):
            (self.root / "data/stations.json").write_text(json.dumps(catalog))
            with self.assertRaisesRegex(ValueError, "station count"):
                MODULE.release_metadata(self.root, SHA)

    def test_local_catalog_invalid_types_rejected(self):
        for version in (True, 0, "31", None):
            (self.root / "data/stations.manifest.json").write_text(json.dumps({"version": version, "count": 2}))
            with self.assertRaisesRegex(ValueError, "version"):
                MODULE.release_metadata(self.root, SHA)

    def test_large_catalog_response_streams_in_bounded_chunks(self):
        data = b"x" * (4 * 1024 * 1024)
        response = Response(data, {"Content-Length": str(len(data))})
        with patch.object(MODULE, "urlopen", return_value=response):
            digest, size = MODULE.http_digest("data/stations.json", SHA, len(data))
        self.assertEqual(size, len(data))
        self.assertEqual(digest, hashlib.sha256(data).hexdigest())
        self.assertLessEqual(response.max_read, MODULE.CHUNK_SIZE)

    def test_oversized_truncated_and_invalid_encoding_responses_fail(self):
        cases = ((b"long", {}, "too large"), (b"x", {"Content-Length": "99"}, "size differs"),
                 (b"x", {"Content-Length": "bad"}, "Content-Length"),
                 (b"x", {"Content-Encoding": "gzip"}, "encoding"))
        for body, headers, message in cases:
            with self.subTest(headers=headers), patch.object(MODULE, "urlopen", return_value=Response(body, headers)):
                with self.assertRaisesRegex(ValueError, message):
                    MODULE.http_digest("x", SHA, 2)
        self.blobs["js/app.js"] = b""
        with self.assertRaisesRegex(ValueError, "js/app.js"):
            self.verify()

    def test_descriptor_size_is_bounded(self):
        with patch.object(MODULE, "urlopen", return_value=Response(b"x" * (MODULE.MAX_DESCRIPTOR_BYTES + 1))):
            with self.assertRaisesRegex(ValueError, "too large"):
                MODULE.http_get(MODULE.STAMP, SHA)

    def test_cache_buster_is_fresh_and_identity_encoding_requested(self):
        urls = []
        def opener(request, timeout):
            urls.append(request.full_url)
            self.assertEqual(request.get_header("Accept-encoding"), "identity")
            self.assertIn("no-cache", request.get_header("Cache-control"))
            self.assertLessEqual(timeout, MODULE.REQUEST_TIMEOUT)
            return Response(b"ok")
        with patch.object(MODULE, "urlopen", side_effect=opener):
            MODULE.http_get("x", SHA)
            MODULE.http_get("x", SHA)
        self.assertNotEqual(urls[0], urls[1])

    def test_deadline_prevents_network_call(self):
        with patch.object(MODULE, "urlopen") as opener:
            with self.assertRaises(TimeoutError):
                MODULE.http_get("x", SHA, deadline=0)
            opener.assert_not_called()

    def test_network_failures_and_stale_deployment_have_bounded_retries(self):
        for failure in (URLError("network"), IncompleteRead(b"partial"), ValueError("published source commit differs"),
                        HTTPError("url", 404, "missing", {}, None)):
            with self.subTest(failure=failure), patch.object(MODULE, "verify_once", side_effect=failure) as verify, patch.object(MODULE.time, "sleep") as sleep:
                result = MODULE.main(["verify", "--root", str(self.root), "--commit", SHA, "--attempts", "3", "--delay", "0"])
                self.assertEqual(result, 1)
                self.assertEqual(verify.call_count, 3)
                self.assertEqual(sleep.call_count, 2)

    def test_permission_failure_does_not_retry(self):
        with patch.object(MODULE, "verify_once", side_effect=HTTPError("url", 403, "denied", {}, None)) as verify:
            self.assertEqual(MODULE.main(["verify", "--root", str(self.root), "--commit", SHA]), 1)
            self.assertEqual(verify.call_count, 1)

    def test_retry_can_recover_without_recomputing_expected_release(self):
        with patch.object(MODULE, "verify_once", side_effect=[URLError("network"), {"status": "DONE"}]) as verify, patch.object(MODULE.time, "sleep"):
            self.assertEqual(MODULE.main(["verify", "--root", str(self.root), "--commit", SHA, "--attempts", "2"]), 0)
            self.assertIs(verify.call_args_list[0].kwargs["expected"], verify.call_args_list[1].kwargs["expected"])

    def test_retry_arguments_are_bounded(self):
        for extra in (["--attempts", "0"], ["--attempts", "21"], ["--delay", "-1"], ["--deadline", "541"]):
            with self.subTest(extra=extra):
                self.assertEqual(MODULE.main(["verify", "--root", str(self.root), "--commit", SHA] + extra), 2)

    def test_parallel_verification_has_four_readers_and_joins_all_work(self):
        lock = threading.Lock()
        active = peak = completed = 0

        def digest(name, token, expected_size, *, deadline):
            nonlocal active, peak, completed
            with lock:
                active += 1
                peak = max(peak, active)
            try:
                time.sleep(0.01)
                self.assertGreater(deadline, time.monotonic())
                return MODULE.sha256(self.blobs[name]), len(self.blobs[name])
            finally:
                with lock:
                    active -= 1
                    completed += 1

        with patch.object(MODULE, "urlopen", side_effect=self.opener), patch.object(MODULE, "http_digest", side_effect=digest):
            result = MODULE.verify_once(self.root, SHA)
        self.assertEqual(peak, 4)
        self.assertEqual(active, 0)
        self.assertEqual(completed, len(FIXTURE_ASSETS))
        self.assertEqual(result["verified_assets"], sorted(FIXTURE_ASSETS))

    def test_parallel_failure_cancels_queued_work_and_joins_active_readers(self):
        lock = threading.Lock()
        active = completed = 0
        failed_name = sorted(FIXTURE_ASSETS)[0]

        def digest(name, token, expected_size, *, deadline):
            nonlocal active, completed
            with lock:
                active += 1
            try:
                if name == failed_name:
                    raise ValueError("corrupt asset")
                time.sleep(0.02)
                return MODULE.sha256(self.blobs[name]), len(self.blobs[name])
            finally:
                with lock:
                    active -= 1
                    completed += 1

        with patch.object(MODULE, "urlopen", side_effect=self.opener), patch.object(MODULE, "http_digest", side_effect=digest):
            with self.assertRaisesRegex(ValueError, failed_name):
                MODULE.verify_once(self.root, SHA)
        self.assertEqual(active, 0)
        self.assertLess(completed, len(FIXTURE_ASSETS))

    def test_local_staging_validation_errors_are_reported_cleanly(self):
        for error in (SyntaxError("invalid precache"), KeyError("stations")):
            with self.subTest(error=error), patch.object(MODULE, "release_metadata", side_effect=error):
                self.assertEqual(MODULE.main(["verify", "--root", str(self.root), "--commit", SHA]), 2)

    def test_self_referential_inventory_is_rejected(self):
        with patch.object(MODULE, "production_inventory", return_value=[MODULE.STAMP]):
            with self.assertRaisesRegex(ValueError, "hash itself"):
                MODULE.release_metadata(self.root, SHA)


class ProductionInventoryCoverageTests(unittest.TestCase):
    def test_real_repository_inventory_covers_omitted_runtime_assets(self):
        paths = set(MODULE.production_inventory(ROOT))
        required = {"js/analytics.js", "js/modules/owrx-adpcm.mjs", "js/modules/kiwi-waterfall.mjs",
                    "js/modules/map.mjs", "js/modules/regions.mjs", "data/stations.json",
                    "data/stations.manifest.json", "data/stations_head.json", "data/kiwisdr.json",
                    "data/web_sdrs.json", "data/space_weather.json", "data/eibi.json", "data/wspr.json"}
        self.assertTrue(required.issubset(paths), required - paths)
        self.assertTrue(any(path.startswith("data/stations_delta/") for path in paths))
        self.assertNotIn(MODULE.STAMP, paths)


if __name__ == "__main__":
    unittest.main()
