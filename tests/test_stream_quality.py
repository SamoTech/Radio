"""Regression tests for safe observable stream quality and catalog preservation."""
import importlib.util
import json
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


health = load_module("radio_stream_quality", "scripts/stream_quality.py")
crawler = load_module("radio_crawler_guard", "scripts/update_data.py")


def public_dns(host, port, type=None):
    return [(None, None, None, None, ("93.184.216.34", int(port)))]


class FakeResponse:
    def __init__(self, content=b"ID3\x04\x00\x00", content_type="audio/mpeg",
                 url="https://radio.example.test/live.mp3", status=200):
        self.content = content
        self.headers = {"Content-Type": content_type}
        self.url = url
        self.status = status
        self.read_bytes = None

    def getcode(self):
        return self.status

    def geturl(self):
        return self.url

    def read(self, n=-1):
        self.read_bytes = n
        return self.content[:n]

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeOpener:
    def __init__(self, *responses):
        self.responses = list(responses)
        self.calls = []

    def open(self, req, timeout=0):
        self.calls.append((req.full_url, timeout))
        reply = self.responses.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return reply


class StreamSafetyTests(unittest.TestCase):
    def test_private_dns_and_local_hosts_are_rejected(self):
        for url in ("http://127.0.0.1/", "http://169.254.169.254/",
                    "http://192.168.1.2/", "http://[::1]/",
                    "http://localhost/", "file:///etc/passwd",
                    "http://user:pass@example.test/private"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                health.public_stream_url(url, public_dns)

    def test_public_https_host_permitted(self):
        self.assertEqual(
            health.public_stream_url("https://radio.example.test:8443/live", public_dns),
            "https://radio.example.test:8443/live",
        )

    def test_redirect_blocks_private_target_and_downgrade(self):
        handler = health.SafeStreamRedirect(public_dns)
        request = urllib.request.Request("https://radio.example.test/start")
        with self.assertRaises(ValueError):
            handler.redirect_request(request, None, 302, "", {},
                                     "http://127.0.0.1/admin")
        handler = health.SafeStreamRedirect(public_dns)
        with self.assertRaises(ValueError):
            handler.redirect_request(request, None, 302, "", {},
                                     "http://radio.example.test/live")

    def test_redirect_budget_bounded(self):
        handler = health.SafeStreamRedirect(public_dns)
        request = urllib.request.Request("https://radio.example.test/start")
        for _ in range(3):
            next_req = handler.redirect_request(
                request, None, 302, "", {},
                "https://radio.example.test/live")
            self.assertIsNotNone(next_req)
        with self.assertRaises(ValueError):
            handler.redirect_request(request, None, 302, "", {},
                                     "https://radio.example.test/live")


class StreamEvidenceTests(unittest.TestCase):
    URL = "https://radio.example.test/live.mp3"

    def probe(self, *replies, previous=None):
        return health.probe_stream(self.URL, previous, opener=FakeOpener(*replies),
                                   resolver=public_dns,
                                   now_iso="2026-11-19T17:35:19+00:00")

    def test_audio_mp3_bytes_verified_not_just_mime(self):
        response = FakeResponse()
        result = self.probe(response)
        self.assertEqual(result["status"], "VERIFIED")
        self.assertEqual(result["codec"], "MP3")
        self.assertTrue(result["browser_compatible"])
        self.assertEqual(response.read_bytes, health.SAMPLE_BYTES)
        self.assertEqual(result["consecutive_failures"], 0)

    def test_audio_aac_and_ogg_bytes_detected(self):
        aac = self.probe(FakeResponse(b"\xff\xf1\x50\x80", "audio/aac"))
        ogg = self.probe(FakeResponse(b"OggS" + b"\x00" * 32, "audio/ogg"))
        self.assertEqual(aac["codec"], "AAC")
        self.assertEqual(aac["status"], "VERIFIED")
        self.assertEqual(ogg["codec"], "OGG")
        self.assertEqual(ogg["status"], "DEGRADED")

    def test_html_and_empty_200_not_verified(self):
        for data, mime in [(b"<html>ok</html>", "audio/mpeg"),
                           (b"", "audio/mpeg"),
                           (b"<html>ok</html>", "text/html")]:
            with self.subTest(data=data, mime=mime):
                result = self.probe(FakeResponse(data, mime))
                self.assertEqual(result["status"], "UNVERIFIED")
                self.assertEqual(result["evidence"], "no_audio_signature")

    def test_hls_manifest_only_not_called_verified_playable(self):
        hls = b"#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nchunk0.ts\n"
        result = self.probe(FakeResponse(
            hls, "application/vnd.apple.mpegurl",
            "https://radio.example.test/stream.m3u8"))
        self.assertEqual(result["status"], "DEGRADED")
        self.assertEqual(result["evidence"], "hls_manifest")
        self.assertIsNone(result["browser_compatible"])

    def test_playlist_resolves_one_safe_hop(self):
        opener = FakeOpener(
            FakeResponse(b"#EXTM3U\nhttps://radio.example.test/real.mp3\n",
                         "audio/x-mpegurl", "https://radio.example.test/list.m3u"),
            FakeResponse(b"ID3\x04\x00", "audio/mpeg",
                         "https://radio.example.test/real.mp3"))
        result = health.probe_stream(
            "https://radio.example.test/list.m3u",
            opener=opener, resolver=public_dns,
            now_iso="2026-11-19T17:35:19+00:00")
        self.assertEqual(result["status"], "VERIFIED")
        self.assertEqual(result["playlist_url"], "https://radio.example.test/list.m3u")
        self.assertEqual(len(opener.calls), 2)

    def test_not_found_requires_three_independent_failures(self):
        error = lambda: urllib.error.HTTPError(self.URL, 404, "Not Found", {}, None)
        first = self.probe(error())
        second = self.probe(error(), previous=first)
        third = self.probe(error(), previous=second)
        self.assertEqual(first["status"], "TEMPORARILY_UNAVAILABLE")
        self.assertEqual(second["status"], "TEMPORARILY_UNAVAILABLE")
        self.assertEqual(third["status"], "BROKEN")

    def test_access_denied_does_not_prove_broken(self):
        error = urllib.error.HTTPError(self.URL, 403, "Forbidden", {}, None)
        result = self.probe(error)
        self.assertEqual(result["status"], "UNVERIFIED")
        self.assertNotEqual(result["status"], "VERIFIED")


class IntegrityTests(unittest.TestCase):
    def test_large_catalog_drop_is_quarantined(self):
        previous = [{}] * 20000
        fresh = [{"url": "https://radio.example.test/" + str(i), "cc": "EG"}
                 for i in range(15000)]
        with self.assertRaisesRegex(RuntimeError, "quarantine"):
            crawler.guard_catalog_snapshot(fresh, previous)

    def test_valid_station_count_passes_and_duplicate_rejected(self):
        stations = [{"url": "https://radio.example.test/" + str(i), "cc": "EG"}
                    for i in range(10000)]
        crawler.guard_catalog_snapshot(stations, [])
        stations[1] = dict(stations[0])
        with self.assertRaisesRegex(RuntimeError, "duplicated"):
            crawler.guard_catalog_snapshot(stations, [])

    def test_incremental_sample_is_unique_and_excludes_IL(self):
        rows = [{"url": "https://radio.example.test/" + str(i), "cc": "EG"}
                for i in range(100)]
        rows += [dict(rows[1]), {"url": "https://radio.example.test/il", "cc": "IL"}]
        selected = health.select_incremental(rows, {}, "2026-11-19T17:35:19+00:00", 12)
        self.assertEqual(len(selected), 12)
        self.assertEqual(len({x["url"] for x in selected}), 12)
        self.assertTrue(all(x["cc"] != "IL" for x in selected))

    def test_quality_report_records_only_sample_not_false_global_success(self):
        stations = [{"url": "https://radio.example.test/" + str(i), "cc": "EG"}
                    for i in range(30)]
        immutable = json.dumps(stations)

        def fake_probe(url, previous, official, now_iso):
            return {"status": "VERIFIED", "last_checked": now_iso,
                    "consecutive_failures": 0}

        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "quality.json"
            report = health.update_quality_report(
                stations, path, "2026-11-19T17:35:19+00:00",
                limit=6, probe=fake_probe)
            self.assertEqual(report["checked_this_run"], 6)
            self.assertEqual(report["status_counts"]["VERIFIED"], 6)
            self.assertEqual(report["not_checked"], 24)
            self.assertEqual(json.dumps(stations), immutable)


if __name__ == "__main__":
    unittest.main()
