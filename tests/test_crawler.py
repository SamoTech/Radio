import email.message
import json
import importlib.util
import sys
import tempfile
import unittest
import urllib.error
import urllib.request
from unittest import mock
from pathlib import Path

MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "update_data.py"
spec = importlib.util.spec_from_file_location("radio_update_data", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class StationUrlTests(unittest.TestCase):
    def test_rejects_unsafe_schemes_and_credentials(self):
        self.assertEqual(module.station_url_key("javascript:alert(1)"), "")
        self.assertEqual(module.station_url_key("https://user:pass@example.test/live"), "")

    def test_normalizes_hosts_ports_and_fragments(self):
        self.assertEqual(
            module.station_url_key("HTTPS://Example.Test:443/live#player"),
            "https://example.test/live",
        )
        self.assertEqual(
            module.station_url_key("http://EXAMPLE.test:80/live"),
            "http://example.test/live",
        )

    def test_playlist_parser_accepts_only_https_streams(self):
        rows = module.parse_m3u(
            "#EXTM3U\n#EXTINF:-1,Secure\nhttps://radio.test/live\n"
            "#EXTINF:-1,Insecure\nhttp://radio.test/live\n"
            "#EXTINF:-1,Script\njavascript:alert(1)\n",
            "EG",
        )
        self.assertEqual([row["name"] for row in rows], ["Secure"])


    def test_dead_stream_patterns_cover_known_dead_hosts(self):
        expected = (
            "chadafm.ice.infomaniak.ch",
            "stream.alkafeel.net",
            "5c7b683162943.streamlock.net",
            "live-hls-audio-aje-ak.getaj.net",
        )
        for pattern in expected:
            self.assertIn(pattern, module.DEAD_URL_PATTERNS)

    def test_syria_playlist_is_included_in_iprd_merge(self):
        self.assertIn("SY", module.ARAB_IPRD)

    def test_dead_urls_are_skipped_in_playlist_merge(self):
        rows = module.parse_m3u(
            "#EXTM3U\n#EXTINF:-1,Dead\nhttps://stream.alkafeel.net/live/radio/playlist.m3u8\n"
            "#EXTINF:-1,Alive\nhttps://radio.test/live\n",
            "SY",
        )
        self.assertEqual([row["name"] for row in rows], ["Alive"])


class MultiSourceTests(unittest.TestCase):
    def setUp(self):
        self._orig_fetch_json = module.fetch_json
        self._orig_fetch_bytes = module.fetch_bytes

    def tearDown(self):
        module.fetch_json = self._orig_fetch_json
        module.fetch_bytes = self._orig_fetch_bytes

    def test_radio_browser_failover_includes_extra_mirrors(self):
        servers = " ".join(module.RB_APIS)
        self.assertIn("at1.api.radio-browser.info", servers)
        self.assertIn("fi1.api.radio-browser.info", servers)

    def test_multi_source_tier_is_pinned(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("rb_stations + world_extra", source)
        self.assertIn("IPRD_WORLD_MAX = 4000", source)
        self.assertIn("VERIFIED_MAX = 6000", source)
        self.assertIn("ICECAST_MAX = 1500", source)
        self.assertIn("COMMUNITY_IL_MARKERS", source)

    def test_iprd_world_discovers_countries_and_skips_arab_and_il(self):
        def fake_fetch_json(url, params=None, attempts=3, timeout=90):
            return {"countries": [
                {"code": "US", "count": 10},
                {"code": "IL", "count": 5},
                {"code": "EG", "count": 5},
                {"code": "DJ", "count": 3},
            ]}

        def fake_fetch_bytes(url, timeout=90):
            return "#EXTM3U\n#EXTINF:-1,Dj Station\nhttps://dj.test/live\n".encode("utf-8")

        module.fetch_json = fake_fetch_json
        module.fetch_bytes = fake_fetch_bytes
        rows = module.fetch_iprd_world()
        self.assertEqual([row["cc"] for row in rows], ["US", "DJ"])
        self.assertEqual(rows[0]["language"], "")
        self.assertEqual(rows[0]["tags"], "iprd,community")
        self.assertEqual(rows[1]["language"], "arabic")
        self.assertIn("عربي", rows[1]["tags"])

    def test_iprd_world_drops_il_stream_hosts(self):
        def fake_fetch_json(url, params=None, attempts=3, timeout=90):
            return {"countries": [{"code": "US", "count": 2}]}

        def fake_fetch_bytes(url, timeout=90):
            return (
                "#EXTM3U\n#EXTINF:-1,Good\nhttps://ok.test/live\n"
                "#EXTINF:-1,Host IL\nhttps://stream.example.co.il/live\n"
            ).encode("utf-8")

        module.fetch_json = fake_fetch_json
        module.fetch_bytes = fake_fetch_bytes
        rows = module.fetch_iprd_world()
        self.assertEqual([row["name"] for row in rows], ["Good"])

    def test_verified_streams_use_stream_url_and_skip_il(self):
        def fake_fetch_json(url, params=None, attempts=3, timeout=90):
            return {"countries": [
                {"countryCode": "DE", "stations": [
                    {"name": "Test FM", "stream": "https://t.test/live",
                     "codec": "aac", "bitrate": 128, "langs": ["german"],
                     "genre": ["pop"]},
                    {"name": "No Stream", "url": "https://w.test/page"},
                ]},
                {"countryCode": "IL", "stations": [
                    {"name": "Blocked", "stream": "https://il.test/live"}]},
            ]}

        module.fetch_json = fake_fetch_json
        rows = module.fetch_verified_streams()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["url"], "https://t.test/live")
        self.assertEqual(rows[0]["language"], "german")
        self.assertIn("verified", rows[0]["tags"])

    def test_icecast_yp_keeps_https_listen_urls_only(self):
        fake_xml = (
            "<yp><entry><server_name>Secure FM</server_name>"
            "<listen_url>https://s.test/live</listen_url></entry>"
            "<entry><server_name>Insecure FM</server_name>"
            "<listen_url>http://i.test/live</listen_url></entry>"
            "<entry><server_name>Israel Radio</server_name>"
            "<listen_url>https://il1.test/live</listen_url></entry>"
            "<entry><server_name>Tel Aviv FM</server_name>"
            "<listen_url>https://il2.test/live</listen_url></entry>"
            "<entry><server_name>Neutral Name</server_name>"
            "<listen_url>https://stream.example.co.il:8000/live</listen_url></entry></yp>"
        ).encode("utf-8")

        def fake_fetch_bytes(url, timeout=90):
            return fake_xml

        module.fetch_bytes = fake_fetch_bytes
        rows = module.fetch_icecast_yp()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["name"], "Secure FM")
        self.assertEqual(rows[0]["tags"], "icecast,yp")


class HeadSnapshotTests(unittest.TestCase):
    def test_main_writes_head_snapshot_for_fast_first_paint(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn('DATA_DIR / "stations_head.json"', source)
        self.assertIn("head = stations[:2500]", source)


class CommunityPlaylistTests(unittest.TestCase):
    FAKE_M3U = (
        "#EXTM3U\n"
        '#EXTINF:-1 tvg-logo="x.png" group-title="Rock",Test Rock One\n'
        "https://rock.example.com/stream\n"
        "#EXTINF:-1,Plain Name\n"
        "https://plain.example.com/aac\n"
        "http://insecure.example.com/stream\n"
        "#EXTINF:-1,Dup\n"
        "https://rock.example.com/stream\n"
        "#EXTINF:-1,Israel Radio\n"
        "https://stream.example.co.il/live\n"
        "#EXTINF:-1,Dead\n"
        "https://webradio.tda.dz/x_64K.mp3\n"
    )

    def test_parse_community_m3u_https_names_groups(self):
        rows = module.parse_community_m3u(self.FAKE_M3U)
        self.assertEqual(
            [row["url"] for row in rows],
            ["https://rock.example.com/stream", "https://plain.example.com/aac"],
        )
        self.assertEqual(rows[0]["name"], "Test Rock One")
        self.assertEqual(rows[0]["tags"], "Rock")
        self.assertEqual(rows[1]["name"], "Plain Name")
        self.assertEqual(rows[1]["tags"], "community")

    def test_community_playlist_is_pinned_and_capped(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("junguler/m3u-radio-music-playlists", source)
        self.assertIn("COMMUNITY_MAX = 5000", source)
        self.assertIn("COMMUNITY_IL_MARKERS", source)
        self.assertIn("officials + arabic + arab_extra + discovered + dm_entries + community + rb_stations", source)


class ScraperTests(unittest.TestCase):
    FAKE_HTML = (
        "<html>https://stream.example.com/live.mp3 https://cdn.example.com/app.js "
        "http://insecure.example.com/live.mp3 https://portal.example.co.il/stream "
        "https://stream.example.com/live https://stream.example.com/live "
        "https://webradio.tda.dz/one_64K.mp3 https://img.example.com/logo.png "
        "https://radio.example.com:8000/mount</html>"
    )

    def test_extract_stream_candidates_filters_and_dedupes(self):
        urls = module.extract_stream_candidates(self.FAKE_HTML)
        self.assertEqual(
            urls,
            [
                "https://stream.example.com/live.mp3",
                "https://stream.example.com/live",
                "https://radio.example.com:8000/mount",
            ],
        )

    def test_icecast_mounts_keeps_https_and_skips_easybroadcast(self):
        payload = (
            '{"icestats":{"source":['
            '{"listenurl":"https://radio.example.com/main.mp3"},'
            '{"listenurl":"http://radio.example.com/relay.mp3"},'
            '{"listenurl":"https://cdn.easybroadcast.io/ts_live/x/playlist.m3u8"}'
            "]}}"
        )
        with mock.patch.object(
            module, "fetch_bytes_strategies",
            return_value=(payload.encode("utf-8"), "browser"),
        ):
            urls = module._icecast_mounts("https://radio.example.com/")
        self.assertEqual(urls, ["https://radio.example.com/main.mp3"])

    def test_scraper_rows_flow_into_catalog_entries(self):
        rows = [
            {
                "site": "https://a.test/",
                "name": "صوت العرب",
                "cc": "EG",
                "lang": "arabic",
                "tags": "رسمي,official,scraper",
                "official": True,
                "catalog": True,
                "streams": ["https://a.test/one.mp3", "https://a.test/two.mp3"],
            },
            {"site": "https://b.test/", "name": "", "cc": "", "catalog": False, "streams": ["https://b.test/x.mp3"]},
        ]
        entries = module.scraper_catalog_entries(rows)
        self.assertEqual(len(entries), 1)
        self.assertEqual(entries[0]["url"], "https://a.test/one.mp3")
        self.assertEqual(entries[0]["fallbacks"], ["https://a.test/two.mp3"])
        self.assertEqual(entries[0]["official"], True)
        self.assertEqual(entries[0]["tags"], "رسمي,official,scraper")

    def test_scraper_is_pinned(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("SCRAPER_SEEDS", source)
        self.assertIn("maspero.eg", source)
        self.assertIn("SCRAPER_DYNAMIC_MAX = 60", source)
        self.assertIn("discovered_streams.json", source)
        self.assertIn("status-json.xsl", source)


class StreamCheckTests(unittest.TestCase):
    def test_stream_checks_cover_curated_plus_catalog_head(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("CHECK_HEAD_MAX = 1200", source)
        self.assertIn("stations[:CHECK_HEAD_MAX]", source)


class AliveOverrideTests(unittest.TestCase):
    def test_override_is_pinned_to_the_false_dead_curated_station(self):
        self.assertIn("https://radioshamfm.grtvstream.com:8400/;", module.ALIVE_OVERRIDE_URLS)

    def test_false_dead_probe_flips_to_alive_with_override_flag(self):
        checks = {
            "https://radioshamfm.grtvstream.com:8400/;": {"alive": False, "code": 0},
            "https://dead.example/live": {"alive": False, "code": 404},
        }
        module.apply_alive_overrides(checks)
        self.assertTrue(checks["https://radioshamfm.grtvstream.com:8400/;"]["alive"])
        self.assertTrue(checks["https://radioshamfm.grtvstream.com:8400/;"]["override"])
        self.assertFalse(checks["https://dead.example/live"]["alive"])

    def test_alive_rows_are_untouched_by_the_override(self):
        checks = {"https://radioshamfm.grtvstream.com:8400/;": {"alive": True, "code": 200}}
        module.apply_alive_overrides(checks)
        self.assertNotIn("override", checks["https://radioshamfm.grtvstream.com:8400/;"])

    def test_write_stream_checks_applies_the_override(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("apply_alive_overrides(run_stream_checks(stations))", source)


class DailymotionTests(unittest.TestCase):
    def test_parse_json_accepts_jina_preamble(self):
        text = (
            "Title: \n\nURL Source: https://www.dailymotion.com/x\n\n"
            'Markdown Content:\n{"url":"https://www.dailymotion.com/video/x1","qualities":{}}'
        )
        data = module._dailymotion_parse_json(text)
        self.assertEqual(data["url"], "https://www.dailymotion.com/video/x1")

    def test_parse_json_rejects_missing_payload(self):
        with self.assertRaises(ValueError):
            module._dailymotion_parse_json("no payload here")

    def test_resolve_builds_video_page_entries(self):
        live = {"qualities": {"auto": [{"type": "application/x-mpegURL", "url": "https://cdn.example.com/live.m3u8?sec=abc"}]}}
        with mock.patch.object(module, "_dailymotion_metadata", side_effect=lambda v: live):
            entries = module.resolve_dailymotion_radios()
        self.assertEqual(len(entries), len(module.DAILYMOTION_RADIOS))
        self.assertEqual(entries[0]["name"], module.DAILYMOTION_RADIOS[0]["name"])
        self.assertEqual(
            entries[0]["url"],
            "https://www.dailymotion.com/video/" + module.DAILYMOTION_RADIOS[0]["video"],
        )
        self.assertEqual(entries[0]["cc"], "EG")
        self.assertEqual(entries[0]["official"], True)
        self.assertEqual(entries[0]["website"], "https://www.dailymotion.com/video/" + module.DAILYMOTION_RADIOS[0]["video"])
        self.assertIn("dailymotion", entries[0]["tags"])
        self.assertNotIn("fallbacks", entries[0])

    def test_resolve_skips_videos_reported_unavailable(self):
        dead = {"error": {"code": 404, "message": "Content not Available"}}
        with mock.patch.object(module, "_dailymotion_metadata", side_effect=lambda v: dead):
            entries = module.resolve_dailymotion_radios()
        self.assertEqual(entries, [])

    def test_resolve_keeps_entries_when_metadata_unreachable(self):
        with mock.patch.object(module, "_dailymotion_metadata", side_effect=lambda v: None):
            entries = module.resolve_dailymotion_radios()
        self.assertEqual(len(entries), len(module.DAILYMOTION_RADIOS))
        prefix = "https://www.dailymotion.com/video/"
        self.assertTrue(all(e["url"].startswith(prefix) for e in entries))

    def test_dailymotion_resolver_is_pinned(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("DAILYMOTION_RADIOS", source)
        self.assertIn("player/metadata/video/", source)
        self.assertIn("https://www.dailymotion.com/video/", source)
        self.assertIn("resolve_dailymotion_radios()", source)
        self.assertIn("dailymotion FAILED", source)


class _FakeStreamResp:
    def __init__(self, code, ctype):
        self.code = code
        self.headers = {"Content-Type": ctype}

    def getcode(self):
        return self.code

    def read(self, n=0):
        return b""

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class StreamContentTypeTests(unittest.TestCase):
    def test_html_page_rejected_when_audio_required(self):
        with mock.patch.object(
            module.urllib.request, "urlopen",
            return_value=_FakeStreamResp(200, "text/html; charset=utf-8"),
        ):
            res = module.check_stream("https://example.test/live", require_audio=True)
        self.assertFalse(res["alive"])
        self.assertEqual(res["code"], 200)

    def test_audio_type_accepted_when_required(self):
        with mock.patch.object(
            module.urllib.request, "urlopen",
            return_value=_FakeStreamResp(200, "audio/mpeg"),
        ):
            res = module.check_stream("https://example.test/live", require_audio=True)
        self.assertTrue(res["alive"])

    def test_octet_stream_accepted_when_required(self):
        with mock.patch.object(
            module.urllib.request, "urlopen",
            return_value=_FakeStreamResp(200, "application/octet-stream"),
        ):
            res = module.check_stream("https://example.test/live", require_audio=True)
        self.assertTrue(res["alive"])

    def test_html_page_still_alive_without_the_flag(self):
        with mock.patch.object(
            module.urllib.request, "urlopen",
            return_value=_FakeStreamResp(200, "text/html"),
        ):
            res = module.check_stream("https://example.test/live")
        self.assertTrue(res["alive"])

    def test_scraper_verify_pins_the_audio_content_type_gate(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("require_audio", source)
        self.assertIn("AUDIO_CT_RE", source)
        self.assertIn("pool.map(lambda u: check_stream(u, True), urls)", source)


class StrategyTierTests(unittest.TestCase):
    """The fetch strategy-tier engine (the "direct-first" philosophy ported
    from the Deals Radar scraper): polite bot identity first, realistic
    browser profiles rotate in on failure, curl_cffi Chrome-TLS as the last
    tier, and every answer records which client profile produced it."""

    def test_fetch_bytes_strategies_rotates_and_reports_the_tier(self):
        calls = []

        def fake_urlopen(req, timeout=0):
            calls.append(req)
            if len(calls) == 1:
                raise urllib.error.URLError("blocked")
            return _FakeStreamResp(200, "text/html")

        with mock.patch.object(module.urllib.request, "urlopen", side_effect=fake_urlopen):
            data, strategy = module.fetch_bytes_strategies("https://example.test/", timeout=5)
        self.assertEqual(strategy, "browser")
        self.assertEqual(len(calls), 2)
        self.assertIn("RadioAtlas", calls[0].headers.get("User-agent", ""))
        self.assertIn("Chrome/124", calls[1].headers.get("User-agent", ""))

    def test_fetch_bytes_strategies_raises_after_every_tier_fails(self):
        with mock.patch.dict(sys.modules, {"curl_cffi": None}):
            with mock.patch.object(
                module.urllib.request, "urlopen",
                side_effect=urllib.error.URLError("blocked"),
            ):
                with self.assertRaises(urllib.error.URLError):
                    module.fetch_bytes_strategies("https://example.test/", timeout=2)

    def test_curl_cffi_tier_rescues_when_every_urllib_tier_fails(self):
        class _FakeCffiResp:
            status_code = 200
            headers = {"Content-Type": "text/html"}
            content = b"<html>ok</html>"

        class _FakeCffiRequests:
            @staticmethod
            def get(url, timeout=0, impersonate=None, headers=None):
                return _FakeCffiResp()

        fake = mock.MagicMock()
        fake.requests = _FakeCffiRequests()
        with mock.patch.dict(sys.modules, {"curl_cffi": fake}):
            with mock.patch.object(
                module.urllib.request, "urlopen",
                side_effect=urllib.error.URLError("blocked"),
            ):
                data, strategy = module.fetch_bytes_strategies("https://example.test/", timeout=2)
        self.assertEqual(strategy, "curl_cffi")
        self.assertEqual(data, b"<html>ok</html>")

    def test_check_stream_escalates_network_failure_to_browser_profile(self):
        calls = []

        def fake_urlopen(req, timeout=0):
            calls.append(req)
            if len(calls) == 1:
                raise urllib.error.URLError("connection reset")
            return _FakeStreamResp(200, "audio/mpeg")

        with mock.patch.object(module.urllib.request, "urlopen", side_effect=fake_urlopen):
            res = module.check_stream("https://example.test/live", require_audio=True)
        self.assertTrue(res["alive"])
        self.assertEqual(res["strategy"], "browser")
        self.assertEqual(len(calls), 2)
        self.assertIn("Chrome/124", calls[1].headers.get("User-agent", ""))
        self.assertEqual(calls[1].headers.get("Icy-metadata"), "1")
        self.assertEqual(calls[1].headers.get("Range"), "bytes=0-511")

    def test_check_stream_dead_404_never_escalates(self):
        with mock.patch.object(
            module.urllib.request, "urlopen",
            side_effect=urllib.error.HTTPError(
                "https://example.test/live", 404, "Not Found", None, None
            ),
        ):
            res = module.check_stream("https://example.test/live")
        self.assertFalse(res["alive"])
        self.assertEqual(res["strategy"], "bot")

    def test_check_stream_curl_cffi_tier_counts_alive(self):
        class _FakeCffiResp:
            status_code = 200
            headers = {"Content-Type": "audio/mpeg"}

        class _FakeCffiRequests:
            @staticmethod
            def get(url, timeout=0, impersonate=None, headers=None):
                return _FakeCffiResp()

        fake = mock.MagicMock()
        fake.requests = _FakeCffiRequests()
        with mock.patch.dict(sys.modules, {"curl_cffi": fake}):
            with mock.patch.object(
                module.urllib.request, "urlopen",
                side_effect=urllib.error.URLError("blocked"),
            ):
                res = module.check_stream("https://example.test/live", require_audio=True)
        self.assertTrue(res["alive"])
        self.assertEqual(res["strategy"], "curl_cffi")

    def test_scrape_site_records_fetch_failure_honestly(self):
        seed = {"name": "Test Radio", "cc": "EG", "site": "https://example.test/"}
        with mock.patch.object(
            module, "fetch_bytes_strategies",
            side_effect=urllib.error.URLError("blocked on every tier"),
        ):
            with mock.patch.object(module, "extract_stream_candidates", return_value=[]):
                with mock.patch.object(module, "_icecast_mounts", return_value=[]):
                    row = module.scrape_site(seed)
        self.assertEqual(row["fetch_strategy"], "")
        self.assertIn("blocked on every tier", row["fetch_error"])
        self.assertEqual(row["candidates"], [])

    def test_scrape_site_reports_the_working_tier(self):
        seed = {"name": "Test Radio", "cc": "EG", "site": "https://example.test/"}
        with mock.patch.object(
            module, "fetch_bytes_strategies",
            return_value=(b"<html>stream https://radio.test/live</html>", "mobile"),
        ):
            with mock.patch.object(
                module, "extract_stream_candidates",
                return_value=["https://radio.test/live"],
            ):
                with mock.patch.object(module, "_icecast_mounts", return_value=[]):
                    row = module.scrape_site(seed)
        self.assertEqual(row["fetch_strategy"], "mobile")
        self.assertEqual(row["fetch_error"], "")
        self.assertEqual(row["candidates"], ["https://radio.test/live"])

    def test_strategy_engine_is_pinned(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("FETCH_STRATEGY_PROFILES", source)
        self.assertIn("GOOGLEBOT_HEADERS", source)
        self.assertIn("fetch_bytes_strategies", source)
        self.assertIn('impersonate="chrome"', source)


class MaybeAliveTests(unittest.TestCase):
    """Blocked-for-us verdicts: redirects get manual hops (browsers follow
    them anyway), and dead answers that are not real 404/410 carry a
    maybe_alive flag so the UI can offer the stream as "جرّبها أنت"."""

    def test_probe_stream_follows_redirect_to_live_audio(self):
        calls = []
        headers = email.message.Message()
        headers["Location"] = "https://cdn.example.test/live.mp3"

        def fake_urlopen(req, timeout=0):
            calls.append(req)
            if len(calls) == 1:
                raise urllib.error.HTTPError(
                    "https://example.test/live", 301, "Moved", headers, None
                )
            return _FakeStreamResp(200, "audio/mpeg")

        with mock.patch.object(module.urllib.request, "urlopen", side_effect=fake_urlopen):
            res = module._probe_stream(
                "https://example.test/live",
                {"User-Agent": module.UA}, 5, True,
            )
        self.assertTrue(res["alive"])
        self.assertEqual(res["code"], 200)
        self.assertEqual(len(calls), 2)
        self.assertEqual(calls[1].full_url, "https://cdn.example.test/live.mp3")

    def test_check_stream_tags_network_failure_as_maybe_alive(self):
        with mock.patch.dict(sys.modules, {"curl_cffi": None}):
            with mock.patch.object(
                module.urllib.request, "urlopen",
                side_effect=urllib.error.URLError("connection reset by peer"),
            ):
                res = module.check_stream("https://example.test/live")
        self.assertFalse(res["alive"])
        self.assertEqual(res["code"], 0)
        self.assertTrue(res["maybe_alive"])

    def test_check_stream_404_is_dead_without_maybe_alive(self):
        with mock.patch.object(
            module.urllib.request, "urlopen",
            side_effect=urllib.error.HTTPError(
                "https://example.test/live", 404, "Not Found", None, None
            ),
        ):
            res = module.check_stream("https://example.test/live")
        self.assertFalse(res["alive"])
        self.assertEqual(res["code"], 404)
        self.assertNotIn("maybe_alive", res)
        self.assertEqual(res["strategy"], "bot")



class ErrorReportTests(unittest.TestCase):
    def test_compute_error_daily_tracks_deltas_and_counter_resets(self):
        previous = {"err-total": 10, "err-network": 4, "err-src": 2}
        current = {"err-total": 15, "err-network": 3, "err-decode": 2, "err-src": 2}
        daily = module.compute_error_daily(previous, current)
        self.assertEqual(daily["err-total"], 5)
        self.assertEqual(daily["err-network"], 0)  # counter reset — never negative
        self.assertEqual(daily["err-decode"], 2)
        self.assertEqual(daily["err-src"], 0)
        self.assertNotIn("err-abort", daily)

    def test_fetch_abacus_count_parses_value_and_treats_missing_key_as_zero(self):
        class _FakeResp:
            def __init__(self, payload):
                self._payload = payload

            def read(self):
                return json.dumps(self._payload).encode("utf-8")

            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

        with mock.patch.object(
            module.urllib.request, "urlopen", return_value=_FakeResp({"value": 7})
        ):
            self.assertEqual(module.fetch_abacus_count("err-total"), 7)
        with mock.patch.object(
            module.urllib.request,
            "urlopen",
            side_effect=urllib.error.HTTPError(
                "https://abacus.test/get", 404, "Not Found", None, None
            ),
        ):
            self.assertEqual(module.fetch_abacus_count("err-hls"), 0)
        with mock.patch.object(
            module.urllib.request,
            "urlopen",
            side_effect=urllib.error.URLError("service down"),
        ):
            self.assertIsNone(module.fetch_abacus_count("err-token"))

class StationDeltaTests(unittest.TestCase):
    def test_compute_catalog_delta_classifies_added_updated_removed(self):
        old_rows = [
            {"name": "A", "url": "https://a.test/one"},
            {"name": "B", "url": "https://b.test/two"},
            {"name": "C", "url": "https://c.test/three"},
        ]
        new_rows = [
            {"name": "A", "url": "https://a.test/one"},
            {"name": "B2", "url": "https://b.test/two"},
            {"name": "D", "url": "https://d.test/four"},
        ]
        delta = module.compute_catalog_delta(old_rows, new_rows)
        self.assertEqual(
            [row["url"] for row in delta["added"]],
            ["https://d.test/four"],
        )
        self.assertEqual(
            [row["name"] for row in delta["updated"]],
            ["B2"],
        )
        self.assertEqual(delta["removed"], ["https://c.test/three"])

    def test_compute_catalog_delta_is_pure_and_ignores_bad_rows(self):
        old_rows = [{"name": "A", "url": "https://a.test/one"}, "not-a-dict"]
        new_rows = [
            {"name": "A2", "url": "HTTPS://A.TEST:443/one#x"},
            {"url": "javascript:alert(1)"},
        ]
        delta = module.compute_catalog_delta(old_rows, new_rows)
        self.assertEqual(delta["added"], [])
        self.assertEqual(
            delta["updated"],
            [{"name": "A2", "url": "HTTPS://A.TEST:443/one#x"}],
        )
        self.assertEqual(delta["removed"], [])
        self.assertEqual(len(old_rows), 2)  # pure: inputs untouched

    def test_write_station_deltas_versions_prunes_and_feeds_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            rows_v1 = [{"name": "A", "url": "https://a.test/one"}]
            module.write_station_deltas(
                rows_v1, [], "2026-11-03T00:00:00+00:00", data_dir=tmp
            )
            manifest_v1 = json.loads(
                (Path(tmp) / "stations.manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest_v1["version"], 1)
            self.assertEqual(manifest_v1["count"], 1)
            self.assertEqual(manifest_v1["keep"], module.DELTA_KEEP)
            self.assertEqual(manifest_v1["full"], "data/stations.json")
            delta_v1 = json.loads(
                (Path(tmp) / "stations_delta" / "1.json").read_text(encoding="utf-8")
            )
            self.assertEqual(delta_v1["added"], rows_v1)
            self.assertEqual(delta_v1["removed"], [])

            rows_v2 = [
                {"name": "A", "url": "https://a.test/one"},
                {"name": "E", "url": "https://e.test/five"},
            ]
            module.write_station_deltas(
                rows_v2, rows_v1, "2026-11-03T00:01:00+00:00", data_dir=tmp
            )
            manifest_v2 = json.loads(
                (Path(tmp) / "stations.manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest_v2["version"], 2)
            delta_v2 = json.loads(
                (Path(tmp) / "stations_delta" / "2.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                [row["url"] for row in delta_v2["added"]], ["https://e.test/five"]
            )
            self.assertEqual(delta_v2["updated"], [])
            self.assertEqual(delta_v2["removed"], [])

            for version in range(3, module.DELTA_KEEP + 3):
                module.write_station_deltas(
                    rows_v2, [], f"2026-11-03T00:0{version}:00+00:00", data_dir=tmp
                )
            manifest_last = json.loads(
                (Path(tmp) / "stations.manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest_last["version"], module.DELTA_KEEP + 2)
            kept = sorted(
                p.stem for p in (Path(tmp) / "stations_delta").glob("*.json")
            )
            expected = sorted(
                str(v)
                for v in range(
                    manifest_last["version"] - module.DELTA_KEEP + 1,
                    manifest_last["version"] + 1,
                )
            )
            self.assertEqual(kept, expected)


class KiwiArchiveMirrorTests(unittest.TestCase):
    """P2-6 / R-03: the third KiwiSDR mirror is the archived snapshot
    published from this repository (raw + GitHub Pages). When both upstream
    mirrors (AetherSDR CDN + legacy origin) are down, the crawler re-serves
    it with honest archived timestamps instead of inventing freshness."""

    def setUp(self):
        self._orig_fetch_json = module.fetch_json

    def tearDown(self):
        module.fetch_json = self._orig_fetch_json

    def test_third_mirror_is_the_repo_archive_pinned_to_two_hosts(self):
        self.assertEqual(
            module.KIWI_ARCHIVE_URLS,
            [
                "https://raw.githubusercontent.com/SamoTech/Radio/main/data/kiwisdr.json",
                "https://samotech.github.io/Radio/data/kiwisdr.json",
            ],
        )
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn("archive_served = src in KIWI_ARCHIVE_URLS", source)
        self.assertIn("repo archive", source)

    def test_fetch_kiwi_falls_back_to_repo_archive_when_upstreams_die(self):
        archived_at = "2026-11-01T00:00:00+00:00"

        def fake_fetch_json(url, params=None, attempts=3, timeout=90):
            if url in module.KIWI_ARCHIVE_URLS:
                return {
                    "updated": archived_at,
                    "origin_fetched_at": archived_at,
                    "receivers": [
                        {"name": "Arch RX", "url": "https://arch.test/",
                         "online": True, "users": 1, "max_users": 4}
                    ],
                }
            raise urllib.error.URLError("upstream down")

        module.fetch_json = fake_fetch_json
        src, receivers, fetched_at = module.fetch_kiwi()
        self.assertEqual(src, module.KIWI_ARCHIVE_URLS[0])
        self.assertEqual(receivers[0]["name"], "Arch RX")
        self.assertEqual(fetched_at, archived_at)

    def test_fetch_kiwi_survives_a_corrupt_archive_payload(self):
        def fake_fetch_json(url, params=None, attempts=3, timeout=90):
            if url in module.KIWI_ARCHIVE_URLS:
                return {"updated": "x", "receivers": []}
            raise urllib.error.URLError("upstream down")

        module.fetch_json = fake_fetch_json
        src, receivers, _ = module.fetch_kiwi()
        self.assertIsNone(src)
        self.assertEqual(receivers, [])

    def test_archive_re_serve_keeps_honest_updated_timestamp(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertIn(
            '"updated": (fetched_at or now_iso) if archive_served else now_iso', source
        )
        self.assertIn(
            '"repo archive " + src + " (upstream mirrors down)"', source
        )


class CuratedCatalogTests(unittest.TestCase):
    """P2-3 / R-10: curated catalog hygiene — the hand-curated tiers
    (official_stations.json + arabic_stations.json) merge ABOVE the
    community and Radio-Browser tiers, so every row must be a clean
    https stream with a real name, a unique canonical URL, and no
    Israeli station may ever appear (content policy — AGENTS.md)."""

    FILES = ("official_stations.json", "arabic_stations.json")

    def _rows(self, name):
        path = MODULE_PATH.parent / name
        return json.loads(path.read_text(encoding="utf-8"))

    def test_curated_rows_are_named_https_streams(self):
        for name in self.FILES:
            rows = self._rows(name)
            self.assertTrue(rows, name)
            for row in rows:
                self.assertGreater(len(str(row.get("name", "")).strip()), 2, name)
                url = str(row.get("url", ""))
                self.assertTrue(url.startswith("https://"), name + ": " + url)

    def test_curated_urls_are_unique_and_canonical(self):
        for name in self.FILES:
            keys = [module.station_url_key(r.get("url")) for r in self._rows(name)]
            self.assertNotIn("", keys, name)
            self.assertEqual(len(keys), len(set(keys)), name)

    def test_curated_catalog_never_contains_israel(self):
        for name in self.FILES:
            for row in self._rows(name):
                self.assertNotEqual(str(row.get("cc", "")).upper(), "IL", name)

    def test_p2_3_expansion_batch_is_pinned(self):
        """PR #119 — the 49-station P2-3 first batch: a few pinned URLs so
        a future curation regression is caught by name."""
        rows = self._rows("arabic_stations.json")
        urls = {r["url"] for r in rows}
        self.assertGreaterEqual(len(rows), 100)
        for url in (
            "https://stream-40.zeno.fm/xa4yhh4k838uv",
            "https://streaming2.toutech.net:8000/jawharafm",
            "https://stream.dabangasudan.org/",
            "https://radio.mp3islam.com/listen/abdulbasit/radio.mp3",
        ):
            self.assertIn(url, urls)


if __name__ == "__main__":
    unittest.main()





