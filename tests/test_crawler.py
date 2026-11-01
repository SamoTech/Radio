import importlib.util
import unittest
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
        with mock.patch.object(module, "fetch_bytes", return_value=payload.encode("utf-8")):
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


if __name__ == "__main__":
    unittest.main()
