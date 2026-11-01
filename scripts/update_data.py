#!/usr/bin/env python3
"""Radio Atlas — data updater.

Sources:
- KiwiSDR public directory via the AetherSDR CDN mirror
  (https://cdn.aethersdr.com/kiwi.json — CORS-open hourly mirror of
  kiwisdr.com/public, schema 1). PRIMARY: the legacy rx.kiwisdr.com/json
  origin has been intermittently down during KiwiSDR server changes.
- rx.kiwisdr.com/json/ — legacy origin endpoint, kept as fallback.
- Radio-Browser: FULL catalog of all non-broken stations, fetched with
  offset pagination and server failover (de1 -> de2 -> nl1), stored with
  trimmed fields so the whole directory ships as one client-side
  searchable snapshot.
- Community world playlists (junguler/m3u-radio-music-playlists on GitHub):
  extra worldwide HTTPS streams from community-checked aggregate playlists,
  merged after the curated lists with URL dedupe (they carry no country
  metadata; Israeli entries are excluded by name markers).
- Own website scraper: broadcaster portals and curated station sites are
  fetched and scanned for direct HTTPS stream URLs (audio manifests,
  icecast status-json.xsl mounts), verified live, saved to
  data/discovered_streams.json; named seeds join the catalog merge.
- Dailymotion live radios (maspero/ERTU simulcasts, channel NMA): fresh
  signed HLS manifests are resolved at crawl time from the Dailymotion
  player metadata endpoint — signatures expire within hours, so URLs are
  never hardcoded — verified live, merged into the catalog.
- NOAA SWPC: planetary Kp index + 10.7cm solar flux -> band conditions.
- EIBI (eibispace.de): shortwave broadcast schedule, filtered to the
  broadcasts that are on air at crawl time.
- WSPR spots via the public wspr.live ClickHouse endpoint (db1.wspr.live)
  — observed HF propagation: per-band spot counts over the last 2 hours
  plus the longest heard paths.
- WebSDR + OpenWebRX receiver directories from receiverbook.de (map pages
  embed the full receiver list as a JSON variable), with the
  morria/multi-sdr receiver catalog as fallback.
- SatNOGS online ground stations (network.satnogs.org API). Israeli
  stations are excluded by name markers only: the API has no country
  field and a lat/lng bounding box would wrongly drop nearby Palestinian
  stations in the same region.
- Receiver world map: Natural Earth land outlines (world-atlas land-110m
  TopoJSON, public domain) via jsdelivr; GPS coordinates are now kept for
  KiwiSDR and WebSDR/OpenWebRX entries instead of being reduced to a flag.

Failures never wipe the last good snapshot. Station catalogs refresh daily;
KiwiSDR receivers, space weather, and shortwave schedules refresh every 6 hours.
"""

import csv
import gzip
import io
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

KIWI_MIRROR_URL = "https://cdn.aethersdr.com/kiwi.json"
KIWI_LEGACY_URLS = ["http://rx.kiwisdr.com/json/", "https://rx.kiwisdr.com/json/"]
RB_APIS = [
    "https://de1.api.radio-browser.info/json/stations/search",
    "https://de2.api.radio-browser.info/json/stations/search",
    "https://nl1.api.radio-browser.info/json/stations/search",
]
RB_BATCH = 1000
RB_MAX = 500_000
SWPC_KP_URLS = [
    "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json",
    "https://services.swpc.noaa.gov/json/noaa-planetary-k-index.json",
]
SWPC_F107_URLS = [
    "https://services.swpc.noaa.gov/json/f107_cm_flux.json",
    "https://services.swpc.noaa.gov/json/f_10_7_cm_flux.json",
]
EIBI_BASE = "http://www.eibispace.de/dx"
EIBI_FALLBACK_URL = f"{EIBI_BASE}/eibi.txt"
EIBI_MAX_ROWS = 3000
IPRD_BASE = "https://raw.githubusercontent.com/iprd-org/iprd/master/streams"
ARAB_IPRD = {
    "MA": ["ma.m3u"],
    "EG": ["eg.m3u"], "SA": ["sa.m3u"], "DZ": ["dz.m3u"], "TN": ["tn.m3u"],
    "LY": ["ly.m3u"], "SD": ["sd.m3u"], "AE": ["ae.m3u"], "QA": ["qa.m3u"],
    "KW": ["kw.m3u"], "BH": ["bh.m3u"], "OM": ["om.m3u"], "JO": ["jo.m3u"],
    "LB": ["lb.m3u"], "PS": ["ps.m3u"], "IQ": ["iq.m3u"], "YE": ["ye.m3u"],
    "MR": ["mr.m3u"], "SO": ["so.m3u"], "SY": ["sy.m3u"],
}
IPRD_MAX = 1500

COMMUNITY_PLAYLISTS = (
    "https://raw.githubusercontent.com/junguler/m3u-radio-music-playlists/main/---everything-checked-repo.m3u",
)
COMMUNITY_MAX = 5000
# Community playlists carry no country metadata, so Israeli entries are
# excluded by name/URL markers only (same good-faith policy as SatNOGS).
COMMUNITY_IL_MARKERS = (
    "israel",
    "tel aviv",
    "tel-aviv",
    "jerusalem",
    "haifa",
    "\u05d9\u05e9\u05e8\u05d0\u05dc",
)

CHECK_THREADS = 16
CHECK_TIMEOUT = 8
UA = "RadioAtlas/1.0 (https://github.com/SamoTech/Radio)"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OFFICIAL_PATH = Path(__file__).resolve().parent / "official_stations.json"
ARABIC_PATH = Path(__file__).resolve().parent / "arabic_stations.json"

# URL patterns of streams known to be permanently dead (expired signatures,
# unreachable hosts) — skipped in community playlist merges (IPRD).
DEAD_URL_PATTERNS = (
    "webradio.tda.dz",
    "vo-live-media.cdb.cdn.orange.com/Content",
    "rj-tok=",
    "live.medi1.com",
    "chadafm.ice.infomaniak.ch",
    "jowradio",
    "stream.alkafeel.net",
    "ch1-32.aac",
    "ch2-32.aac",
    "ch3-32.aac",
    "laghouat.ice.infomaniak.ch",
    "bejaia.ice.infomaniak.ch",
    "biskra.ice.infomaniak.ch",
    "adrar.ice.infomaniak.ch",
    "elbahdja.ice.infomaniak.ch",
    "jil-fm.ice.infomaniak.ch",
    "rai.ice.infomaniak.ch",
    "coran.ice.infomaniak.ch",
    "culture.ice.infomaniak.ch",
    "5c7b683162943.streamlock.net",
    "dcunilive93-lh.akamaihd.net",
    "live-hls-audio-aje-ak.getaj.net",
)


# ---------------------------------------------------------------------------
# Static country landing pages (SEO): generated from the stations snapshot
# into countries/, plus sitemap.xml and robots.txt at the repo root. Pages
# are regenerated on every stations refresh and committed by the workflow.
# ---------------------------------------------------------------------------

SITE_URL = "https://samotech.github.io/Radio/"
REPO_ROOT = Path(__file__).resolve().parent.parent
COUNTRY_PAGE_STATIONS = 60

# Countries that get a landing page: the Arab world plus the biggest
# broadcast markets. Countries not in this map simply get no page.
COUNTRY_NAMES_AR = {
    "EG": "مصر", "SA": "السعودية", "AE": "الإمارات", "KW": "الكويت",
    "QA": "قطر", "BH": "البحرين", "OM": "عُمان", "JO": "الأردن",
    "LB": "لبنان", "PS": "فلسطين", "SY": "سوريا", "IQ": "العراق",
    "YE": "اليمن", "SD": "السودان", "LY": "ليبيا", "TN": "تونس",
    "DZ": "الجزائر", "MA": "المغرب", "MR": "موريتانيا", "SO": "الصومال",
    "DJ": "جيبوتي", "KM": "جزر القمر",
    "US": "الولايات المتحدة", "GB": "المملكة المتحدة", "FR": "فرنسا",
    "DE": "ألمانيا", "IT": "إيطاليا", "ES": "إسبانيا", "PT": "البرتغال",
    "NL": "هولندا", "BE": "بلجيكا", "CH": "سويسرا", "AT": "النمسا",
    "SE": "السويد", "NO": "النرويج", "DK": "الدنمارك", "FI": "فنلندا",
    "IE": "أيرلندا", "PL": "بولندا", "CZ": "التشيك", "GR": "اليونان",
    "RU": "روسيا", "TR": "تركيا", "UA": "أوكرانيا", "RO": "رومانيا",
    "RS": "صربيا", "HR": "كرواتيا", "BG": "بلغاريا", "HU": "المجر",
    "CA": "كندا", "MX": "المكسيك", "BR": "البرازيل", "AR": "الأرجنتين",
    "CL": "تشيلي", "CO": "كولومبيا", "PE": "بيرو", "VE": "فنزويلا",
    "IN": "الهند", "PK": "باكستان", "BD": "بنغلاديش", "LK": "سريلانكا",
    "NP": "نيبال", "AF": "أفغانستان", "IR": "إيران", "CN": "الصين",
    "JP": "اليابان", "KR": "كوريا الجنوبية", "ID": "إندونيسيا",
    "MY": "ماليزيا", "TH": "تايلاند", "VN": "فيتنام", "PH": "الفلبين",
    "SG": "سنغافورة", "AU": "أستراليا", "NZ": "نيوزيلندا",
    "HK": "هونغ كونغ", "TW": "تايوان",
    "ZA": "جنوب أفريقيا", "NG": "نيجيريا", "KE": "كينيا", "GH": "غانا",
    "TZ": "تنزانيا", "ET": "إثيوبيا", "SN": "السنغال", "ML": "مالي",
    "NE": "النيجر", "TD": "تشاد", "CM": "الكاميرون",
    "CI": "ساحل العاج", "UG": "أوغندا", "CD": "الكونغو الديمقراطية",
    "AO": "أنغولا", "MZ": "موزمبيق", "ZM": "زامبيا", "ZW": "زيمبابوي",
    "NA": "ناميبيا", "BW": "بوتسوانا", "MG": "مدغشقر",
}


def _cp_escape(value):
    return (
        str(value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _cp_flag(cc):
    cc = (cc or "").upper()
    if len(cc) != 2 or not cc.isalpha():
        return ""
    return chr(0x1F1E6 + ord(cc[0]) - 65) + chr(0x1F1E6 + ord(cc[1]) - 65)


_CP_STYLE = (
    ":root{--bg:#0b1220;--panel:#111a2c;--line:#22304d;--text:#e6edf7;"
    "--muted:#8fa3c0;--accent:#22d3ee;--accent-text:#04222b}"
    "*{box-sizing:border-box}"
    "body{margin:0;font-family:'Segoe UI',Tahoma,system-ui,sans-serif;"
    "background:var(--bg);color:var(--text);line-height:1.7}"
    "a{color:var(--accent)}"
    ".hero{padding:26px 16px 10px;text-align:center;border-bottom:1px solid var(--line)}"
    "h1{margin:0 0 6px;font-size:1.5rem}"
    "h1 .n{color:var(--accent);font-size:1rem}"
    ".tag{color:var(--muted);margin:.2rem 0 1rem;font-size:.95rem}"
    ".cta{margin:0 0 10px}"
    ".btn{display:inline-block;background:var(--accent);color:var(--accent-text);"
    "border-radius:10px;padding:9px 18px;text-decoration:none;font-weight:700}"
    ".btn.ghost{background:var(--panel);color:var(--text);border:1px solid var(--line)}"
    "main{max-width:860px;margin:0 auto;padding:16px}"
    "ol.stations{margin:0;padding:0 20px}"
    "ol.stations li{padding:10px 4px;border-bottom:1px solid var(--line);"
    "display:flex;gap:10px;flex-wrap:wrap;align-items:baseline}"
    ".nm{flex:1;min-width:200px;font-weight:600}"
    ".mt{color:var(--muted);font-size:.82rem}"
    ".go{font-size:.85rem;font-weight:700;white-space:nowrap}"
    ".more,.upd{color:var(--muted);font-size:.85rem;margin:14px 0}"
    ".countries{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));"
    "gap:10px;padding:0;margin:0;list-style:none}"
    ".countries a{display:block;background:var(--panel);border:1px solid var(--line);"
    "border-radius:10px;padding:10px 14px;text-decoration:none}"
    ".countries .cnt{color:var(--muted);font-size:.8rem}"
    "footer{color:var(--muted);text-align:center;font-size:.8rem;"
    "padding:16px;border-top:1px solid var(--line)}"
)


def _cp_head(title, description, canonical):
    return (
        '<!DOCTYPE html>\n<html lang="ar" dir="rtl">\n<head>\n'
        '<meta charset="UTF-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<meta name="theme-color" content="#0b1220">\n'
        "<title>" + _cp_escape(title) + "</title>\n"
        '<meta name="description" content="' + _cp_escape(description) + '">\n'
        '<link rel="canonical" href="' + canonical + '">\n'
        '<meta property="og:title" content="' + _cp_escape(title) + '">\n'
        '<meta property="og:description" content="' + _cp_escape(description) + '">\n'
        '<meta property="og:type" content="website">\n'
        '<meta property="og:url" content="' + canonical + '">\n'
        '<link rel="icon" type="image/svg+xml" href="../icons/icon.svg">\n'
        "<style>" + _CP_STYLE + "</style>\n"
        "</head>\n<body>\n"
    )


def _cp_station_li(station):
    name = station.get("name") or "—"
    url = str(station.get("url") or "")
    bits = []
    codec = str(station.get("codec") or "").strip()
    if codec:
        bits.append(codec.upper())
    bitrate = station.get("bitrate") or 0
    if bitrate:
        bits.append(str(bitrate) + " kbps")
    language = str(station.get("language") or "").split(",")[0].strip()
    if language:
        bits.append(language)
    meta = " · ".join(bits)
    play = ""
    if url.lower().startswith("https://"):
        deep = urllib.parse.quote(url, safe="")
        play = (
            ' <a class="go" href="' + SITE_URL + '#play=' + deep
            + '">استمع مباشر ↗</a>'
        )
    line = '<li><span class="nm">' + _cp_escape(name) + "</span>"
    if meta:
        line += '<span class="mt">' + _cp_escape(meta) + "</span>"
    return line + play + "</li>"


def _cp_index_page(ranked):
    items = []
    for cc, group in ranked:
        items.append(
            '<li><a href="./' + cc.lower() + '.html">' + _cp_flag(cc) + " "
            + _cp_escape(COUNTRY_NAMES_AR[cc])
            + ' <span class="cnt">(' + str(len(group)) + " محطة)</span></a></li>"
        )
    title = "محطات الراديو حسب الدولة — دليل عربي | راديو أطلس"
    description = (
        "تصفح محطات البث الإذاعي حسب الدولة: مصر، السعودية، المغرب، الجزائر،"
        " تونس ودول أخرى — مع تشغيل مباشر على راديو أطلس."
    )
    return (
        _cp_head(title, description, SITE_URL + "countries/")
        + '<header class="hero"><h1>🌍 محطات الراديو حسب الدولة</h1>'
        + '<p class="tag">صفحات لكل دولة مع أشهر المحطات وروابط تشغيل مباشر داخل التطبيق.</p>'
        + '<p class="cta"><a class="btn" href="' + SITE_URL + '">📻 افتح راديو أطلس</a></p></header>'
        + '<main><ul class="countries">\n' + "\n".join(items) + "\n</ul></main>"
        + '<footer>صفحات متولدة آليًا من كتالوج <a href="' + SITE_URL + '">راديو أطلس</a></footer>'
        + "</body>\n</html>\n"
    )


def generate_country_pages(snapshot_path, out_root=None):
    """Generate static country landing pages, sitemap.xml and robots.txt."""
    snapshot = json.loads(Path(snapshot_path).read_text(encoding="utf-8"))
    stations = snapshot.get("stations") or []
    if len(stations) < 100:
        print("country pages: snapshot too small — skipping", file=sys.stderr)
        return
    root = Path(out_root) if out_root else REPO_ROOT
    countries_dir = root / "countries"
    by_cc = {}
    for station in stations:
        cc = str(station.get("cc") or station.get("countrycode") or "").upper()
        if cc == "IL" or cc not in COUNTRY_NAMES_AR:
            continue
        by_cc.setdefault(cc, []).append(station)
    if not by_cc:
        print("country pages: no mapped countries found — skipping", file=sys.stderr)
        return
    updated = str(snapshot.get("updated") or "")
    ranked = sorted(by_cc.items(), key=lambda kv: len(kv[1]), reverse=True)

    countries_dir.mkdir(parents=True, exist_ok=True)
    sitemap_urls = [SITE_URL, SITE_URL + "countries/"]
    for cc, group in ranked:
        count = len(group)
        name_ar = COUNTRY_NAMES_AR[cc]
        title = (
            "راديو " + name_ar + " مباشر — " + str(count)
            + " محطة إذاعة | راديو أطلس"
        )
        description = (
            "استمع لأشهر محطات الراديو من " + name_ar + " مباشرة: " + str(count)
            + " محطة إذاعية مع تشغيل فوري وبحث وتصنيف حسب اللغة والفئة على راديو أطلس."
        )
        shown = group[:COUNTRY_PAGE_STATIONS]
        items = "\n".join(_cp_station_li(s) for s in shown)
        more = ""
        if count > len(shown):
            more = (
                '<p class="more">تُعرض أشهر ' + str(len(shown))
                + " محطة من أصل " + str(count) + ' — كل المحطات متاحة في <a href="'
                + SITE_URL + '">التطبيق الرئيسي</a>.</p>'
            )
        canonical = SITE_URL + "countries/" + cc.lower() + ".html"
        page = (
            _cp_head(title, description, canonical)
            + '<header class="hero"><h1>' + _cp_flag(cc) + " راديو "
            + _cp_escape(name_ar) + ' <span class="n">' + str(count)
            + " محطة بث مباشر</span></h1>"
            + '<p class="tag">دليل محطات الإذاعة من ' + _cp_escape(name_ar)
            + " — روابط تشغيل مباشر تعمل داخل التطبيق مع مؤشر حالة البث.</p>"
            + '<p class="cta"><a class="btn" href="' + SITE_URL + '">📻 افتح راديو أطلس</a> '
            + '<a class="btn ghost" href="./">كل الدول</a></p></header>'
            + '<main><ol class="stations">\n' + items + "\n</ol>" + more
            + '<p class="upd">آخر تحديث للكتالوج: ' + _cp_escape(updated) + "</p></main>"
            + '<footer>صفحة متولدة آليًا من كتالوج <a href="' + SITE_URL
            + '">راديو أطلس</a></footer>'
            + "</body>\n</html>\n"
        )
        (countries_dir / (cc.lower() + ".html")).write_text(page, encoding="utf-8")
        sitemap_urls.append(canonical)

    (countries_dir / "index.html").write_text(
        _cp_index_page(ranked), encoding="utf-8"
    )

    lastmod = updated[:10] if len(updated) >= 10 else ""
    sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for url in sitemap_urls:
        entry = "<url><loc>" + url + "</loc>"
        if lastmod:
            entry += "<lastmod>" + lastmod + "</lastmod>"
        sitemap.append(entry + "</url>")
    sitemap.append("</urlset>")
    (root / "sitemap.xml").write_text("\n".join(sitemap) + "\n", encoding="utf-8")

    robots = "User-agent: *\nAllow: /\n\nSitemap: " + SITE_URL + "sitemap.xml\n"
    (root / "robots.txt").write_text(robots, encoding="utf-8")
    print("country pages: " + str(len(ranked)) + " country pages + sitemap + robots")

def fetch_json(url, params=None, attempts=3, timeout=90):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    last = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": UA,
                    "Accept": "application/json",
                    "Accept-Encoding": "identity",
                },
            )
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
                if r.headers.get("Content-Encoding", "").lower() == "gzip":
                    data = gzip.decompress(data)
                return json.loads(data.decode("utf-8", "replace"))
        except Exception as e:  # noqa: BLE001
            last = e
            print(f"attempt {i + 1}/{attempts} for {url} failed: {e}", file=sys.stderr)
            time.sleep(5 * (i + 1))
    raise last


def fetch_bytes(url, timeout=90):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Accept": "*/*",
            "Accept-Encoding": "identity",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
        if r.headers.get("Content-Encoding", "").lower() == "gzip":
            data = gzip.decompress(data)
        return data


def as_rows(raw):
    """Normalize whatever a source returns into a list of dicts."""
    if isinstance(raw, list):
        return [r for r in raw if isinstance(r, dict)]
    if isinstance(raw, dict):
        for key in ("nodes", "receivers", "list", "results", "data"):
            if isinstance(raw.get(key), list):
                return [r for r in raw[key] if isinstance(r, dict)]
        lists = [v for v in raw.values() if isinstance(v, list)]
        if lists:
            biggest = max(lists, key=len)
            return [r for r in biggest if isinstance(r, dict)]
    return []


def fmt_hz(hz):
    if hz >= 1_000_000:
        s = f"{hz / 1_000_000:.2f}".rstrip("0").rstrip(".")
        return f"{s} MHz"
    s = f"{hz / 1_000:.2f}".rstrip("0").rstrip(".")
    return f"{s} kHz"


def band_label(bands):
    if not isinstance(bands, list) or len(bands) < 2:
        return ""
    low, high = bands[0], bands[1]
    if not isinstance(low, (int, float)) or not isinstance(high, (int, float)):
        return ""
    if high <= low:
        return ""
    if low <= 0:
        return f"0-{fmt_hz(high)}"
    return f"{fmt_hz(low)}-{fmt_hz(high)}"


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def gps_value(v):
    """Keep [lat, lon] coordinates when the source provides them, else False."""
    if (
        isinstance(v, list)
        and len(v) == 2
        and num(v[0]) is not None
        and num(v[1]) is not None
        and (abs(v[0]) > 0.001 or abs(v[1]) > 0.001)
    ):
        return [v[0], v[1]]
    return False


def from_mirror(data):
    """Map AetherSDR mirror schema 1 entries to our snapshot shape."""
    receivers = []
    for r in as_rows(data.get("receivers")):
        if r.get("flagged"):
            continue
        snr = None
        s = r.get("snr")
        if isinstance(s, list) and s and num(s[0]) is not None:
            snr = s[0]
        elif num(s) is not None:
            snr = s
        if snr is None:
            snr = num(r.get("snr_all"))
        if snr is None:
            snr = num(r.get("snr_hf"))

        gps_val = gps_value(r.get("gps"))

        receivers.append(
            {
                "name": r.get("name", ""),
                "url": r.get("url", ""),
                "online": not bool(r.get("offline")),
                "users": r.get("users") if isinstance(r.get("users"), int) else 0,
                "max_users": r.get("users_max") if isinstance(r.get("users_max"), int) else 0,
                "snr": snr,
                "gps": gps_val,
                "band": band_label(r.get("bands")),
                "loc": r.get("loc", "") or "",
                "antenna": r.get("antenna", "") or "",
                "ext_api": r.get("ext_api") if isinstance(r.get("ext_api"), int) else None,
            }
        )
    return receivers, data.get("fetched_at")


def from_legacy(rows):
    return (
        [
            {
                "name": r.get("name", ""),
                "url": r.get("url", ""),
                "online": bool(r.get("online")),
                "users": r.get("users", 0),
                "max_users": r.get("max_users", 0),
                "snr": r.get("snr"),
                "gps": gps_value(r.get("gps")),
                "band": r.get("band", ""),
                "loc": "",
                "antenna": "",
                "ext_api": None,
            }
            for r in rows
        ],
        None,
    )


def fetch_kiwi():
    # 1) AetherSDR CDN mirror — primary (origin often down during server changes)
    try:
        data = fetch_json(KIWI_MIRROR_URL, attempts=2, timeout=30)
        if isinstance(data, dict) and isinstance(data.get("receivers"), list):
            receivers, fetched_at = from_mirror(data)
            return KIWI_MIRROR_URL, receivers, fetched_at
        raise ValueError("unexpected mirror payload shape")
    except Exception as e:  # noqa: BLE001
        print(f"kiwi mirror {KIWI_MIRROR_URL} failed: {e}", file=sys.stderr)

    # 2) legacy origin endpoints — fallback
    for url in KIWI_LEGACY_URLS:
        try:
            receivers, fetched_at = from_legacy(as_rows(fetch_json(url, attempts=1, timeout=20)))
            return url, receivers, fetched_at
        except Exception as e:  # noqa: BLE001
            print(f"kiwi legacy {url} failed: {e}", file=sys.stderr)
    return None, [], None


def load_official():
    """Curated official/national broadcasters — always merged into the catalog."""
    try:
        raw = json.loads(OFFICIAL_PATH.read_text(encoding="utf-8"))
        return [s for s in raw if isinstance(s, dict) and station_url_key(s.get("url"))]
    except Exception as e:  # noqa: BLE001
        print(f"official stations file failed: {e}", file=sys.stderr)
        return []


def load_arabic():
    """Curated Arabic stations - merged after the official broadcasters."""
    try:
        raw = json.loads(ARABIC_PATH.read_text(encoding="utf-8"))
        return [s for s in raw if isinstance(s, dict) and s.get("url")]
    except Exception as e:  # noqa: BLE001
        print(f"arabic stations file failed: {e}", file=sys.stderr)
        return []



def station_url_key(value):
    """Canonicalize a station URL for catalog-level duplicate detection."""
    try:
        parsed = urllib.parse.urlsplit(str(value or '').strip())
        if parsed.scheme.lower() not in {'http', 'https'} or not parsed.hostname or parsed.username or parsed.password:
            return ''
        host = parsed.hostname.lower()
        port = parsed.port
        if port and not ((parsed.scheme.lower() == 'http' and port == 80) or (parsed.scheme.lower() == 'https' and port == 443)):
            host = f'{host}:{port}'
        return urllib.parse.urlunsplit((parsed.scheme.lower(), host, parsed.path or '/', parsed.query, ''))
    except (TypeError, ValueError):
        return ''


def fetch_stations():
    """Fetch ALL non-broken Radio-Browser stations.

    Offset pagination with per-batch server failover (de1 -> de2 -> nl1).
    If every server fails on a batch we raise so the caller keeps the
    last good full snapshot instead of writing a partial catalog.
    """
    out = []
    seen_urls = set()
    offset = 0
    server = 0
    while offset < RB_MAX:
        raw = None
        while server < len(RB_APIS):
            try:
                raw = fetch_json(
                    RB_APIS[server],
                    {
                        "limit": RB_BATCH,
                        "offset": offset,
                        "order": "clickcount",
                        "reverse": "true",
                        "hidebroken": "true",
                    },
                    attempts=2,
                    timeout=45,
                )
                break
            except Exception as e:  # noqa: BLE001
                print(
                    f"radio-browser server {RB_APIS[server]} failed at offset {offset}: {e}",
                    file=sys.stderr,
                )
                server += 1
        if raw is None:
            raise RuntimeError(f"all Radio-Browser servers failed at offset {offset}")
        if not isinstance(raw, list):
            raise RuntimeError("unexpected Radio-Browser payload shape")
        for s in raw:
            if not isinstance(s, dict):
                continue
            if s.get("countrycode", "").upper() == "IL":
                continue
            url = s.get("url_resolved") or s.get("url", "")
            key = station_url_key(url)
            if not key or key in seen_urls:
                continue
            seen_urls.add(key)
            out.append(
                {
                    "name": s.get("name", ""),
                    "url": url,
                    "cc": s.get("countrycode", ""),
                    "language": s.get("language", ""),
                    "tags": s.get("tags", ""),
                    "codec": s.get("codec", ""),
                    "bitrate": s.get("bitrate", 0) or 0,
                }
            )
        print(f"radio-browser: fetched {len(out)} stations so far (offset {offset})")
        if len(raw) < RB_BATCH:
            return out
        offset += RB_BATCH
    return out


def _last_float(rows, keys):
    for r in reversed(rows):
        if isinstance(r, dict):
            for k in keys:
                v = r.get(k)
                if isinstance(v, (int, float)) and not isinstance(v, bool):
                    return float(v)
    return None


def fetch_space():
    """NOAA SWPC space weather: latest Kp + F10.7 flux (best effort)."""
    kp = None
    f107 = None
    for url in SWPC_KP_URLS:
        try:
            rows = as_rows(fetch_json(url, attempts=1, timeout=20))
            kp = _last_float(rows, ["kp_index", "estimated_kp", "kp"])
            if kp is not None:
                break
        except Exception as e:  # noqa: BLE001
            print(f"swpc kp {url} failed: {e}", file=sys.stderr)
    for url in SWPC_F107_URLS:
        try:
            rows = as_rows(fetch_json(url, attempts=1, timeout=20))
            f107 = _last_float(rows, ["f107", "flux", "observed", "value"])
            if f107 is not None:
                break
        except Exception as e:  # noqa: BLE001
            print(f"swpc f107 {url} failed: {e}", file=sys.stderr)
    if kp is None and f107 is None:
        return None
    return {"kp": kp, "f107": f107}


def _hhmm_to_min(s):
    """Convert EiBi HHMM to minutes; 2400 is valid as an end time."""
    value = str(s).strip().replace(":", "")
    if not value.isdigit() or len(value) not in (3, 4):
        return None
    value = value.zfill(4)
    hour, minute = int(value[:2]), int(value[2:])
    if minute > 59 or hour > 24 or (hour == 24 and minute != 0):
        return None
    return hour * 60 + minute


def _last_sunday(year, month):
    from calendar import monthrange
    last_day = monthrange(year, month)[1]
    return date(year, month, last_day) - timedelta(days=(date(year, month, last_day).weekday() + 1) % 7)


def eibi_season_candidates(now):
    """Return current EiBi season, previous season, then the timeless text feed."""
    summer_start = _last_sunday(now.year, 3)
    summer_end = _last_sunday(now.year, 10)
    if summer_start <= now.date() < summer_end:
        current = ("a", now.year)
        previous = ("b", now.year - 1)
    elif now.date() >= summer_end:
        current = ("b", now.year)
        previous = ("a", now.year)
    else:
        current = ("b", now.year - 1)
        previous = ("a", now.year - 1)
    urls = [
        f"{EIBI_BASE}/sked-{code}{year % 100:02d}.csv"
        for code, year in (current, previous)
    ]
    urls.append(EIBI_FALLBACK_URL)
    return urls


def _eibi_date_parts(value):
    """Parse EiBi date fields, including yearless DDMon values."""
    value = str(value or "").strip()
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%Y%m%d", "%d.%m.%Y", "%d/%m/%Y",
                "%d-%b-%Y", "%d%b%Y", "%d.%m.%y", "%d/%m/%y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            pass
    for fmt in ("%d%b", "%d-%b", "%d.%m", "%d/%m"):
        try:
            parsed = datetime.strptime(value.title(), fmt)
            return (parsed.month, parsed.day)
        except ValueError:
            pass
    return None


def _eibi_validity_contains(start_value, stop_value, day):
    start = _eibi_date_parts(start_value)
    stop = _eibi_date_parts(stop_value)
    if start is None and stop is None:
        return True
    # When both endpoints carry a year, honor the exact calendar dates.
    if isinstance(start, date) and isinstance(stop, date):
        return start <= day <= stop

    def key(value):
        return (value.month, value.day) if isinstance(value, date) else value
    current = (day.month, day.day)
    if start is not None and stop is not None:
        a, b = key(start), key(stop)
        return (a <= current <= b) if a <= b else (current >= a or current <= b)
    if isinstance(start, date):
        return day >= start
    if isinstance(stop, date):
        return day <= stop
    if start is not None:
        return current >= key(start)
    return current <= key(stop)


def _eibi_days_match(value, day):
    """Accept EiBi weekday abbreviations, numeric weekdays, and DDMon dates."""
    token = re.sub(r"\s+", "", str(value or "")).strip()
    if not token:
        return True
    # Date-specific entries such as 24Oct. Multiple DDMon tokens are accepted.
    dates = re.findall(r"(?i)(\d{1,2})(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)", token)
    if dates:
        return any(int(d) == day.day and m.lower() == day.strftime("%b").lower()
                   for d, m in dates)

    # Numeric weekday notation: 1=Monday ... 7=Sunday; ranges such as 1-5.
    if re.fullmatch(r"[1-7,-]+", token):
        selected = set()
        for item in token.split(","):
            if "-" in item:
                a, b = item.split("-", 1)
                if a.isdigit() and b.isdigit():
                    lo, hi = int(a), int(b)
                    selected.update(range(lo, hi + 1) if lo <= hi else list(range(lo, 8)) + list(range(1, hi + 1)))
            else:
                selected.update(int(ch) for ch in item if ch.isdigit())
        return day.isoweekday() in selected

    names = {"mo": 1, "tu": 2, "we": 3, "th": 4, "fr": 5, "sa": 6, "su": 7}
    normalized = token.title()
    selected = set()
    # Expand explicit weekday ranges, including wrap-around ranges.
    range_pattern = re.compile(r"(?i)(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)")
    for match in range_pattern.finditer(normalized):
        a, b = names[match.group(1).lower()], names[match.group(2).lower()]
        selected.update(range(a, b + 1) if a <= b else list(range(a, 8)) + list(range(1, b + 1)))
    without_ranges = range_pattern.sub("", normalized)
    selected.update(names[m.lower()] for m in re.findall(r"(?i)Mo|Tu|We|Th|Fr|Sa|Su", without_ranges))
    if selected:
        return day.isoweekday() in selected
    # Unknown special codes are not silently interpreted as daily.
    return False


def parse_eibi(text, now):
    """Parse the real semicolon-separated EiBi schedule and keep broadcasts on air now."""
    if isinstance(text, bytes):
        text = text.decode("latin-1", "replace")
    now = now.astimezone(timezone.utc) if now.tzinfo else now.replace(tzinfo=timezone.utc)
    now_day = now.date()
    now_minutes = now.hour * 60 + now.minute
    rows, seen = [], set()
    reader = csv.reader(io.StringIO(text), delimiter=";", quotechar='"')
    for parts in reader:
        if len(parts) < 11:
            continue
        try:
            freq = int(float(parts[0].strip().replace(",", ".")))
        except (ValueError, TypeError):
            continue
        if not 2000 <= freq <= 30000:
            continue
        time_match = re.fullmatch(r"\s*(\d{3,4})\s*-\s*(\d{3,4})\s*", parts[1])
        if not time_match:
            continue
        start_text, end_text = time_match.groups()
        start_min, end_min = _hhmm_to_min(start_text), _hhmm_to_min(end_text)
        if start_min is None or end_min is None or start_min == end_min:
            continue

        # For an overnight transmission, the post-midnight segment belongs
        # to the previous UTC broadcast day and validity date.
        if start_min < end_min:
            schedule_day = now_day
            on_air = start_min <= now_minutes < end_min
        elif now_minutes >= start_min:
            schedule_day = now_day
            on_air = True
        elif now_minutes < end_min:
            schedule_day = now_day - timedelta(days=1)
            on_air = True
        else:
            schedule_day = now_day
            on_air = False
        if not on_air:
            continue
        if not _eibi_days_match(parts[2], schedule_day):
            continue
        if not _eibi_validity_contains(parts[9], parts[10], schedule_day):
            continue

        itu = parts[3].strip()
        if itu.upper() == "ISR":
            continue
        station = parts[4].strip()
        language = parts[5].strip()
        target = parts[6].strip()
        name_parts = [p for p in (itu, station, language) if p]
        if target and target.lower() not in {"all", "ww", "world"}:
            name_parts.append(target)
        name = " | ".join(name_parts)[:110] or "Unknown station"
        start_out = start_text.zfill(4)
        end_out = end_text.zfill(4)
        key = (freq, start_out, end_out, name)
        if key in seen:
            continue
        seen.add(key)
        rows.append({"f": freq, "s": start_out, "e": end_out, "n": name})
        if len(rows) >= EIBI_MAX_ROWS:
            break
    rows.sort(key=lambda row: row["f"])
    return rows


def fetch_eibi(now):
    """Fetch the current EiBi season, previous season, then eibi.txt over HTTP."""
    for url in eibi_season_candidates(now):
        for attempt in range(3):
            try:
                data = fetch_bytes(url, timeout=25)
                if len(data) < 1000:
                    raise ValueError(f"schedule payload too small ({len(data)} bytes)")
                text = data.decode("latin-1", "replace")
                rows = parse_eibi(text, now)
                if not rows:
                    raise ValueError("no active EiBi rows parsed")
                print(f"eibi: {len(rows)} active rows from {url}")
                return url, rows
            except Exception as e:  # noqa: BLE001
                print(f"eibi {url} attempt {attempt + 1}/3 failed: {e}", file=sys.stderr)
                if attempt < 2:
                    time.sleep(2 * (attempt + 1))
    return None, None

def merge_curated_into_snapshot(curated, path):
    """Radio-Browser unreachable: re-merge curated stations into the last good snapshot."""
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    stations = old.get("stations")
    if not isinstance(stations, list) or len(stations) < 10_000:
        return None
    fresh = [s for s in curated if isinstance(s, dict) and station_url_key(s.get("url"))]
    seen = {station_url_key(s.get("url")) for s in fresh}
    out = list(fresh)
    for s in stations:
        if (
            isinstance(s, dict)
            and s.get("url")
            and s.get("cc") != "IL"
            and station_url_key(s.get("url"))
            and station_url_key(s.get("url")) not in seen
        ):
            seen.add(station_url_key(s.get("url")))
            out.append(s)
    return {
        "updated": old.get("updated"),
        "source": old.get("source"),
        "count": len(out),
        "stations": out,
    }


def _extinf_name(line):
    """Extract the station title from an #EXTINF line (strip quoted attrs)."""
    s = re.sub(r'[a-z-]+="[^"]*"', "", line)
    s = s.replace("#EXTINF:-1", "")
    return s.split(",", 1)[-1].strip()[:80]


def parse_m3u(text, cc):
    """Parse an M3U playlist into station dicts. HTTPS streams only (mixed content)."""
    out = []
    seen = set()
    name = ""
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#EXTINF"):
            name = _extinf_name(line)
            continue
        if line.startswith("#"):
            continue
        url = line.split()[0] if line.split() else ""
        if not url.lower().startswith("https://"):
            continue
        if any(p in url for p in DEAD_URL_PATTERNS):
            continue
        if url in seen:
            continue
        seen.add(url)
        out.append(
            {
                "name": name or "—",
                "url": url,
                "cc": cc,
                "language": "arabic",
                "tags": "عربي,arab",
                "codec": "",
                "bitrate": 0,
            }
        )
        name = ""
    return out


def fetch_iprd_arab():
    """Curated Arab radio playlists from the IPRD community database (https-only)."""
    out = []
    for cc, files in ARAB_IPRD.items():
        for fname in files:
            url = f"{IPRD_BASE}/{cc.lower()}/{fname}"
            try:
                text = fetch_bytes(url, timeout=25).decode("utf-8", "replace")
                rows = parse_m3u(text, cc)
                out.extend(rows)
                print(f"iprd {cc}/{fname}: {len(rows)} https streams")
            except Exception as e:  # noqa: BLE001
                print(f"iprd {cc}/{fname} failed: {e}", file=sys.stderr)
    return out[:IPRD_MAX]


def _community_group_title(line):
    m = re.search(r'group-title="([^"]*)"', line)
    return m.group(1).strip()[:40] if m else ""


def parse_community_m3u(text):
    """Parse a worldwide community playlist: HTTPS streams only, EXTINF names."""
    out = []
    seen = set()
    name = ""
    group = ""
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith("#EXTINF"):
            name = _extinf_name(line)
            group = _community_group_title(line)
            continue
        if line.startswith("#"):
            continue
        url = line.split()[0] if line.split() else ""
        if not url.lower().startswith("https://"):
            continue
        if any(p in url for p in DEAD_URL_PATTERNS):
            continue
        if url in seen:
            continue
        blob = (name + " " + url).lower()
        if ".il/" in url or any(m in blob for m in COMMUNITY_IL_MARKERS):
            continue
        if re.search(r"(?:^|[^a-z0-9])4[xz][0-9]", blob):
            continue
        seen.add(url)
        out.append(
            {
                "name": name or "\u2014",
                "url": url,
                "cc": "",
                "language": "",
                "tags": group or "community",
                "codec": "",
                "bitrate": 0,
            }
        )
        name = ""
        group = ""
    return out


def fetch_community_stations():
    """Extra worldwide stations from community-checked playlists (GitHub raw)."""
    out = []
    for url in COMMUNITY_PLAYLISTS:
        try:
            text = fetch_bytes(url, timeout=120).decode("utf-8", "replace")
            rows = parse_community_m3u(text)
            out.extend(rows)
            print(f"community {url.rsplit('/', 1)[-1]}: {len(rows)} https streams")
        except Exception as e:  # noqa: BLE001
            print(f"community playlist {url} failed: {e}", file=sys.stderr)
    return out[:COMMUNITY_MAX]

def check_stream(url):
    """Lightweight liveness probe for a stream URL (auth-gated servers count as alive)."""
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": UA, "Range": "bytes=0-511", "Icy-MetaData": "1"},
        )
        with urllib.request.urlopen(req, timeout=CHECK_TIMEOUT) as resp:
            code = resp.getcode()
            resp.read(64)
            return {"alive": code < 400, "code": code}
    except urllib.error.HTTPError as e:
        # 401/403/405 usually mean the server exists but gates requests;
        # the stream may still play fine in the browser.
        return {"alive": e.code in (401, 403, 405), "code": e.code}
    except Exception:  # noqa: BLE001
        return {"alive": False, "code": 0}


def run_stream_checks(stations):
    """Probe curated stations concurrently; token-gated streams are skipped."""
    from concurrent.futures import ThreadPoolExecutor

    urls, seen = [], set()
    for s in stations:
        if not isinstance(s, dict):
            continue
        url = str(s.get("url") or "")
        if not url.lower().startswith("https://"):
            continue
        if "easybroadcast.io" in url or s.get("tokenType") == "easy_b":
            continue
        if url in seen:
            continue
        seen.add(url)
        urls.append(url)
    results = {}
    if not urls:
        return results
    with ThreadPoolExecutor(max_workers=CHECK_THREADS) as pool:
        for url, res in zip(urls, pool.map(check_stream, urls)):
            results[url] = res
    return results


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")


# ================= Website stream scraper (own source extractor) =================

# Our own scraper: broadcaster websites are fetched and scanned for direct
# HTTPS stream URLs (audio manifests, icecast mounts, status-json.xsl feeds).
# Seeds are portals that never publish direct URLs to the aggregate
# directories. Extend via the maintenance workflow: hunt stream links per
# country / language / category, always excluding Israeli sources.
SCRAPER_SEEDS = (
    {"name": "صوت العرب", "cc": "EG", "language": "arabic", "site": "https://maspero.eg/stream/9", "tags": "رسمي,official,scraper", "official": True, "catalog": True},
    {"name": "البرنامج العام", "cc": "EG", "language": "arabic", "site": "https://maspero.eg/stream/10", "tags": "رسمي,official,scraper", "official": True, "catalog": True},
    {"name": "إذاعة الشرق الأوسط", "cc": "EG", "language": "arabic", "site": "https://maspero.eg/stream/16", "tags": "رسمي,official,scraper", "official": True, "catalog": True},
    {"name": "إذاعة القرآن الكريم", "cc": "EG", "language": "arabic", "site": "https://maspero.eg/stream/7", "tags": "رسمي,official,scraper", "official": True, "catalog": True},
    {"name": "راديو مصر", "cc": "EG", "language": "arabic", "site": "https://maspero.eg/stream/8", "tags": "رسمي,official,scraper", "official": True, "catalog": True},
    {"name": "إذاعة الشباب والرياضة", "cc": "EG", "language": "arabic", "site": "https://maspero.eg/stream/11", "tags": "رسمي,official,scraper", "official": True, "catalog": True},
    {"name": "إذاعة القاهرة الكبرى", "cc": "EG", "language": "arabic", "site": "https://maspero.eg/stream/14", "tags": "رسمي,official,scraper", "official": True, "catalog": True},
    {"name": "إذاعة الأغاني", "cc": "EG", "language": "arabic", "site": "https://maspero.eg/stream/13", "tags": "رسمي,official,scraper", "official": True, "catalog": True},
    {"name": "إذاعة البرنامج الثقافي", "cc": "EG", "language": "arabic", "site": "https://maspero.eg/stream/12", "tags": "رسمي,official,scraper", "official": True, "catalog": True},
    {"name": "بوابة ماسبيرو", "cc": "EG", "site": "https://maspero.eg/", "catalog": False},
    {"name": "بوابة الإذاعة السعودية", "cc": "SA", "site": "https://sba.sa/", "catalog": False},
)
SCRAPER_DYNAMIC_MAX = 60
SCRAPER_TIMEOUT = 20
SCRAPER_CANDIDATE_MAX = 6
# Hints that a scraped URL points at an audio stream rather than an asset.
SCRAPER_HINTS = (
    ".mp3", ".aac", ".ogg", ".m3u8", ".mpd", "/stream", "/listen", "/live",
    ";stream", "/radio", ":8000", ":8443", ":8080", "icecast", "broadcast",
)
SCRAPER_SKIP = (
    ".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".gif", ".woff", ".woff2",
    ".ttf", ".pdf", ".mp4", "facebook", "twitter", "x.com", "youtube",
    "apple.com", "googletagmanager", "google-analytics", "w3.org", "schema.org",
)
STREAM_URL_RE = re.compile(r"https://[^\s\x22\x27<>]+")


def extract_stream_candidates(html):
    """Pull direct HTTPS stream URLs out of a station website's HTML."""
    candidates, seen = [], set()
    for url in STREAM_URL_RE.findall((html or "").replace("&amp;", "&")):
        url = url.rstrip(",);.'")
        low = url.lower()
        try:
            host = urllib.parse.urlsplit(url).hostname or ""
        except ValueError:
            host = ""
        if host.endswith(".il") or any(m in low for m in COMMUNITY_IL_MARKERS):
            continue
        if any(p in low for p in DEAD_URL_PATTERNS):
            continue
        if any(p in low for p in SCRAPER_SKIP):
            continue
        if not any(h in low for h in SCRAPER_HINTS):
            continue
        key = station_url_key(url)
        if not key or key in seen:
            continue
        seen.add(key)
        candidates.append(url)
    return candidates


def _icecast_mounts(site):
    """Probe a site for an icecast status-json.xsl feed of live mounts."""
    try:
        origin = urllib.parse.urlsplit(site)
        status_url = f"{origin.scheme}://{origin.netloc}/status-json.xsl"
        data = json.loads(fetch_bytes(status_url, timeout=SCRAPER_TIMEOUT).decode("utf-8", "replace"))
        mounts = data.get("icestats", {}).get("source") or []
        if isinstance(mounts, dict):
            mounts = [mounts]
        urls = []
        for mount in mounts:
            if not isinstance(mount, dict):
                continue
            url = str(mount.get("listenurl") or "")
            if url.lower().startswith("https://") and "easybroadcast.io" not in url.lower():
                urls.append(url)
        return urls
    except Exception:  # noqa: BLE001
        return []


def scrape_site(seed):
    """Scrape one broadcaster website for direct stream candidates."""
    site = str(seed.get("site") or "")
    if not site.lower().startswith("https://"):
        return None
    html = ""
    try:
        html = fetch_bytes(site, timeout=SCRAPER_TIMEOUT).decode("utf-8", "replace")
    except Exception:  # noqa: BLE001
        html = ""
    candidates = extract_stream_candidates(html) + _icecast_mounts(site)
    deduped, seen = [], set()
    for url in candidates:
        if "easybroadcast.io" in url.lower():
            continue
        key = station_url_key(url)
        if key and key not in seen:
            seen.add(key)
            deduped.append(url)
    return {
        "site": site,
        "name": str(seed.get("name") or ""),
        "cc": str(seed.get("cc") or ""),
        "lang": str(seed.get("language") or ""),
        "tags": str(seed.get("tags") or ""),
        "official": bool(seed.get("official")),
        "catalog": bool(seed.get("catalog")),
        "candidates": deduped[:SCRAPER_CANDIDATE_MAX],
    }


def scrape_website_streams(seeds):
    """Scrape all seeds concurrently, then verify every candidate stream."""
    from concurrent.futures import ThreadPoolExecutor

    with ThreadPoolExecutor(max_workers=CHECK_THREADS) as pool:
        rows = [r for r in pool.map(scrape_site, list(seeds)) if r]
    urls, seen = [], set()
    for row in rows:
        for url in row["candidates"]:
            if url not in seen:
                seen.add(url)
                urls.append(url)
    results = {}
    if urls:
        with ThreadPoolExecutor(max_workers=CHECK_THREADS) as pool:
            for url, res in zip(urls, pool.map(check_stream, urls)):
                results[url] = res
    for row in rows:
        row["streams"] = [u for u in row["candidates"] if results.get(u, {}).get("alive")]
        del row["candidates"]
    return rows


def scraper_catalog_entries(rows):
    """Catalog station entries for the named scraper seeds with live streams."""
    entries = []
    for row in rows:
        if not row.get("catalog"):
            continue
        name = str(row.get("name") or "").strip()
        streams = [u for u in (row.get("streams") or []) if str(u).lower().startswith("https://")]
        if not name or not streams:
            continue
        entry = {"name": name, "url": streams[0], "cc": str(row.get("cc") or ""), "language": str(row.get("lang") or "")}
        if len(streams) > 1:
            entry["fallbacks"] = streams[1:]
        if row.get("official"):
            entry["official"] = True
        if row.get("tags"):
            entry["tags"] = str(row["tags"])
        entries.append(entry)
    return entries


def scraper_dynamic_seeds():
    """Curated stations that link their own websites become extra seeds."""
    seeds, seen = [], set()
    for station in load_official() + load_arabic():
        site = str(station.get("website") or station.get("officialUrl") or "")
        if not site.lower().startswith("https://") or site in seen:
            continue
        seen.add(site)
        seeds.append({"name": str(station.get("name") or ""), "cc": str(station.get("cc") or ""), "site": site})
    return seeds[:SCRAPER_DYNAMIC_MAX]

# ============ Dailymotion live radios (maspero/ERTU simulcasts) ============

# ERTU (بوابة ماسبيرو) simulcasts its radio channels live on Dailymotion
# (channel NMA). The player metadata endpoint hands out a fresh, signed
# HLS manifest per request; signatures expire within hours, so the m3u8
# URLs are resolved at crawl time — never hardcoded. Direct metadata
# requests are tried first; the r.jina.ai text proxy is the fallback for
# datacenter IPs that Dailymotion blocks, all inside a time budget.
DAILYMOTION_RADIOS = (
    {"name": "إذاعة الأغاني", "video": "x8n6dyz"},
    {"name": "إذاعة القرآن الكريم", "video": "x84wyku"},
    {"name": "البرنامج العام", "video": "x8n6dt3"},
    {"name": "إذاعة البرنامج الثقافي", "video": "x8n6eci"},
    {"name": "راديو مصر", "video": "x8n6dpk"},
    {"name": "إذاعة الشرق الأوسط", "video": "x8n6drt"},
    {"name": "إذاعة الشباب والرياضة", "video": "x8n6dzo"},
    {"name": "إذاعة القاهرة الكبرى", "video": "x8n6ebs"},
    {"name": "إذاعة صوت العرب", "video": "x8n6dqq"},
    {"name": "إذاعة الوادي الجديد", "video": "x9p4ebk"},
    {"name": "الإذاعة التعليمية", "video": "xakfzv2"},
    {"name": "البرنامج الأوروبي", "video": "x8n6e6w"},
    {"name": "الإذاعات الموجهة 1", "video": "x8n6ea6"},
    {"name": "الإذاعات الموجهة 2", "video": "x8of06x"},
    {"name": "الإذاعات الموجهة 8", "video": "x8n6e96"},
)
DAILYMOTION_TIMEOUT = 20
DAILYMOTION_BUDGET = 180
DAILYMOTION_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


def _dailymotion_parse_json(text):
    """Parse a metadata payload that may be wrapped in a Markdown preamble."""
    start = text.find("{")
    if start < 0:
        raise ValueError("no JSON payload in response")
    return json.loads(text[start:])


def _dailymotion_metadata(video_id):
    """Fetch the player metadata JSON for one Dailymotion live video.

    Direct first, then through the r.jina.ai text proxy (the proxy wraps
    the JSON in a Markdown preamble, hence the first-brace parse).
    """
    target = (
        "https://www.dailymotion.com/player/metadata/video/" + video_id
        + "?embedder=" + urllib.parse.quote("https://www.dailymotion.com", safe="")
        + "&locale=en-US"
    )
    last = None
    for url in (target, "https://r.jina.ai/" + target):
        try:
            req = urllib.request.Request(
                url,
                headers={
                    "User-Agent": DAILYMOTION_UA,
                    "Accept": "application/json, text/plain, */*",
                    "Accept-Encoding": "identity",
                },
            )
            with urllib.request.urlopen(req, timeout=DAILYMOTION_TIMEOUT) as r:
                text = r.read().decode("utf-8", "replace")
            data = _dailymotion_parse_json(text)
            if isinstance(data, dict) and not data.get("error"):
                return data
            last = ValueError(str(data.get("error") or "metadata error payload"))
        except Exception as e:  # noqa: BLE001
            last = e
    print(f"dailymotion {video_id} metadata failed: {last}", file=sys.stderr)
    return None


def _dailymotion_qualities(metadata):
    """Collect signed HLS manifest URLs from player metadata qualities."""
    urls = []
    qualities = metadata.get("qualities")
    if not isinstance(qualities, dict):
        return urls
    for streams in qualities.values():
        if not isinstance(streams, list):
            continue
        for stream in streams:
            if not isinstance(stream, dict):
                continue
            url = str(stream.get("url") or "")
            if url.startswith("https://") and ".m3u8" in url and url not in urls:
                urls.append(url)
    return urls


def resolve_dailymotion_radios():
    """Resolve a fresh signed manifest for every Dailymotion live radio.

    Sequential on purpose (the proxy fallback is rate-limited), with a
    total time budget so a slow crawl never stalls the data refresh.
    """
    entries = []
    started = time.time()
    for seed in DAILYMOTION_RADIOS:
        if time.time() - started > DAILYMOTION_BUDGET:
            print("dailymotion: time budget reached — stopping early", file=sys.stderr)
            break
        video_id = str(seed.get("video") or "")
        name = str(seed.get("name") or "").strip()
        metadata = _dailymotion_metadata(video_id)
        if not metadata:
            continue
        seen, alive = set(), []
        for url in _dailymotion_qualities(metadata):
            key = station_url_key(url)
            if not key or key in seen:
                continue
            seen.add(key)
            if check_stream(url).get("alive"):
                alive.append(url)
            if len(alive) >= SCRAPER_CANDIDATE_MAX:
                break
        if not name or not alive:
            continue
        entry = {
            "name": name,
            "url": alive[0],
            "cc": "EG",
            "language": "arabic",
            "tags": "رسمي,official,dailymotion",
            "official": True,
        }
        if len(alive) > 1:
            entry["fallbacks"] = alive[1:]
        entries.append(entry)
        print(f"dailymotion {name}: live manifest ok ({video_id})")
    return entries

# ================= WSPR observed propagation + WebSDR/OpenWebRX directories =================

WSPR_DB_URL = "https://db1.wspr.live/"
RECEIVERBOOK_BASE = "https://www.receiverbook.de/map?type="
WEB_SDR_FALLBACK_URL = (
    "https://raw.githubusercontent.com/morria/multi-sdr/main/data/receivers-full.json"
)
WSPR_WINDOW_SECONDS = 7200
WSPR_TOP_MIN_KM = 15000
WEB_SDR_MAX_PER_TYPE = 400
SATNOGS_API_URL = "https://network.satnogs.org/api/stations/?format=json"
SATNOGS_MAX = 400
# The SatNOGS stations API has no country field. A lat/lng bounding box
# would also exclude Palestinian stations in the same region, so Israeli
# stations are excluded by explicit name markers only.
SATNOGS_IL_MARKERS = (
    "israel",
    "tel aviv",
    "tel-aviv",
    "jerusalem",
    "haifa",
    "beersheba",
    "beer-sheva",
    "herzliya",
    "herzliyya",
    "herzlia",
    "rishon lezion",
    "petah tikva",
    "rehovot",
    "technion",
    "tau ",
)
LAND_MAP_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json"


def _wspr_rows(query):
    payload = fetch_json(WSPR_DB_URL, params={"query": query}, attempts=2, timeout=25)
    rows = payload.get("data") if isinstance(payload, dict) else None
    return rows if isinstance(rows, list) else []


def fetch_wspr():
    cutoff = str(int(time.time()) - WSPR_WINDOW_SECONDS)
    bands_rows = _wspr_rows(
        "SELECT band, count() AS c, round(avg(distance), 0) AS avg_km, "
        "max(distance) AS max_km FROM wspr.rx WHERE time >= " + cutoff
        + " GROUP BY band ORDER BY c DESC FORMAT JSON"
    )
    top_rows = _wspr_rows(
        "SELECT tx_sign, tx_loc, rx_sign, rx_loc, band, "
        "max(distance) AS max_km, max(snr) AS snr "
        "FROM wspr.rx WHERE time >= " + cutoff
        + " AND distance >= " + str(WSPR_TOP_MIN_KM)
        + " GROUP BY tx_sign, tx_loc, rx_sign, rx_loc, band"
        + " ORDER BY max_km DESC LIMIT 12 FORMAT JSON"
    )
    if not bands_rows:
        return None
    bands = [
        {
            "band": row.get("band"),
            "c": int(row.get("c") or 0),
            "avg_km": int(float(row.get("avg_km") or 0)),
            "max_km": int(float(row.get("max_km") or 0)),
        }
        for row in bands_rows
        if isinstance(row, dict)
    ]
    top = [
        {
            "tx": row.get("tx_sign") or "",
            "tx_loc": row.get("tx_loc") or "",
            "rx": row.get("rx_sign") or "",
            "rx_loc": row.get("rx_loc") or "",
            "km": int(float(row.get("max_km") or 0)),
            "band": row.get("band"),
            "snr": row.get("snr"),
        }
        for row in top_rows
        if isinstance(row, dict)
    ]
    return {"bands": bands, "top": top}


def _receiverbook_rows(html):
    match = re.search(r"var\s+receivers\s*=\s*(\[[\s\S]*?\]);", html)
    if not match:
        return []
    try:
        sites = json.loads(match.group(1))
    except (ValueError, TypeError):
        return []
    if not isinstance(sites, list):
        return []
    rows = []
    for site in sites:
        if not isinstance(site, dict):
            continue
        label = str(site.get("label") or "").strip()
        coords = (site.get("location") or {}).get("coordinates") or []
        if not isinstance(coords, list) or len(coords) < 2:
            coords = [None, None]
        for rx in site.get("receivers") or [site]:
            if not isinstance(rx, dict):
                continue
            name = str(rx.get("label") or label).strip()
            url = str(rx.get("url") or site.get("url") or "").strip()
            if not name or not url.startswith("http"):
                continue
            rows.append(
                {
                    "name": name[:120],
                    "url": url,
                    "loc": (label if label and label != name else "")[:80],
                    "lat": coords[1],
                    "lon": coords[0],
                }
            )
    return rows


def _multi_sdr_rows(kind):
    data = fetch_json(WEB_SDR_FALLBACK_URL, attempts=2, timeout=30)
    rows = []
    for rx in data if isinstance(data, list) else []:
        if not isinstance(rx, dict) or str(rx.get("type") or "").lower() != kind:
            continue
        name = str(rx.get("name") or "").strip()
        url = str(rx.get("url") or "").strip()
        if not name or not url.startswith("http"):
            continue
        rows.append(
            {"name": name[:120], "url": url, "loc": "", "lat": rx.get("lat"), "lon": rx.get("lon")}
        )
    return rows


def _web_sdr_type_rows(kind):
    try:
        html = fetch_bytes(RECEIVERBOOK_BASE + kind, timeout=25).decode("utf-8", "replace")
        rows = _receiverbook_rows(html)
        if rows:
            return rows, "receiverbook.de"
    except Exception as e:  # noqa: BLE001
        print(f"receiverbook {kind} FAILED: {e}", file=sys.stderr)
    return _multi_sdr_rows(kind), "morria/multi-sdr"


def fetch_web_sdrs():
    out = {"websdr": [], "openwebrx": []}
    sources = {}
    seen = set()
    for kind in ("websdr", "openwebrx"):
        rows, src = _web_sdr_type_rows(kind)
        sources[kind] = src
        kept = []
        for rx in rows:
            url = rx["url"]
            blob = (rx["name"] + " " + rx["loc"]).lower()
            if url in seen or "israel" in blob or re.search(r"(?:^|[^a-z0-9])4[xz][0-9]", blob):
                continue
            seen.add(url)
            entry = {"name": rx["name"], "url": url, "loc": rx["loc"], "https": url.startswith("https")}
            entry_lat = num(rx.get("lat"))
            entry_lon = num(rx.get("lon"))
            if entry_lat is not None and entry_lon is not None:
                entry["lat"] = entry_lat
                entry["lon"] = entry_lon
            kept.append(entry)
            if len(kept) >= WEB_SDR_MAX_PER_TYPE:
                break
        out[kind] = kept
    if not out["websdr"] and not out["openwebrx"]:
        return None
    out["sources"] = sources
    return out

def fetch_satnogs():
    rows = fetch_json(SATNOGS_API_URL)
    if not isinstance(rows, list):
        return None
    kept = []
    seen_ids = set()
    for st in rows:
        # The live API returns capitalized statuses ("Online"/"Testing"/
        # "Offline"); compare case-insensitively so real payloads are kept.
        if not isinstance(st, dict) or str(st.get("status") or "").lower() != "online":
            continue
        sid = st.get("id")
        name = str(st.get("name") or "").strip()
        if sid is None or sid in seen_ids or not name:
            continue
        blob = name.lower()
        if any(m in blob for m in SATNOGS_IL_MARKERS):
            continue
        seen_ids.add(sid)
        bands = []
        for ant in st.get("antenna") or []:
            band = str((ant or {}).get("band") or "").strip()
            if band and band not in bands:
                bands.append(band)
        grid = str(st.get("qthlocator") or "").strip()
        loc = " · ".join(x for x in (grid, " / ".join(bands[:4])) if x)
        kept.append(
            {
                "id": sid,
                "name": name,
                "loc": loc or "—",
                "lat": st.get("lat"),
                "lng": st.get("lng"),
                "alt": st.get("altitude"),
                "url": f"https://network.satnogs.org/stations/{sid}/",
                "https": False,
            }
        )
        if len(kept) >= SATNOGS_MAX:
            break
    kept.sort(key=lambda s: s["name"].lower())
    return kept

def fetch_land_map():
    topo = fetch_json(LAND_MAP_URL, attempts=2, timeout=60)
    if not isinstance(topo, dict) or not isinstance(topo.get("arcs"), list) or not isinstance(topo.get("objects"), dict):
        return None
    return topo

def main():
    mode = (sys.argv[1] if len(sys.argv) > 1 else "all").lower()
    if mode not in {"all", "stations", "sdr"}:
        raise SystemExit("Usage: update_data.py [all|stations|sdr]")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat(timespec="seconds")
    ok = False

    if mode in {"all", "sdr"}:
        src, receivers, fetched_at = fetch_kiwi()
        if src and receivers:
            write_json(
                DATA_DIR / "kiwisdr.json",
                {
                    "updated": now_iso,
                    "source": src,
                    "origin_fetched_at": fetched_at,
                    "count": len(receivers),
                    "receivers": receivers,
                },
            )
            print(f"kiwisdr: {len(receivers)} receivers from {src}")
            ok = True
        else:
            print("kiwisdr FAILED or empty: keeping last good snapshot", file=sys.stderr)

        try:
            sw = fetch_space()
            if sw:
                write_json(
                    DATA_DIR / "space_weather.json",
                    {
                        "updated": now_iso,
                        "source": "NOAA SWPC (https://www.swpc.noaa.gov/)",
                        "kp": sw["kp"],
                        "f107": sw["f107"],
                    },
                )
                print("space weather: ok")
            else:
                print("space weather: no data — keeping last good snapshot", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"space weather FAILED: {e} — keeping last good snapshot", file=sys.stderr)

        try:
            eibi_source, eibi_rows = fetch_eibi(now)
            if eibi_source and eibi_rows:
                write_json(
                    DATA_DIR / "eibi.json",
                    {
                        "updated": now_iso,
                        "source": "EiBi (eibispace.de)",
                        "count": len(eibi_rows),
                        "rows": eibi_rows,
                    },
                )
                print(f"eibi: wrote {len(eibi_rows)} active rows from {eibi_source}")
            else:
                print("eibi: no usable active schedule — keeping last good snapshot", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"eibi FAILED: {e} — keeping last good snapshot", file=sys.stderr)

        try:
            wspr = fetch_wspr()
            if wspr:
                write_json(
                    DATA_DIR / "wspr.json",
                    {
                        "updated": now_iso,
                        "source": "wspr.live (db1.wspr.live ClickHouse)",
                        "window_hours": WSPR_WINDOW_SECONDS // 3600,
                        "bands": wspr["bands"],
                        "top": wspr["top"],
                    },
                )
                print(f"wspr: {len(wspr['bands'])} active bands")
                ok = True
            else:
                print("wspr: no rows — keeping last good snapshot", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"wspr FAILED: {e} — keeping last good snapshot", file=sys.stderr)

        try:
            web_sdrs = fetch_web_sdrs()
            if web_sdrs:
                write_json(
                    DATA_DIR / "web_sdrs.json",
                    {
                        "updated": now_iso,
                        "source": "receiverbook.de + morria/multi-sdr fallback",
                        "sources": web_sdrs["sources"],
                        "websdr": web_sdrs["websdr"],
                        "openwebrx": web_sdrs["openwebrx"],
                    },
                )
                print(
                    "web sdrs: "
                    + str(len(web_sdrs["websdr"])) + " websdr, "
                    + str(len(web_sdrs["openwebrx"])) + " openwebrx"
                )
                ok = True
            else:
                print("web sdrs: no receivers — keeping last good snapshot", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"web sdrs FAILED: {e} — keeping last good snapshot", file=sys.stderr)

        try:
            satnogs = fetch_satnogs()
            if satnogs:
                write_json(
                    DATA_DIR / "satnogs.json",
                    {
                        "updated": now_iso,
                        "source": "SatNOGS network (https://network.satnogs.org/)",
                        "count": len(satnogs),
                        "stations": satnogs,
                    },
                )
                print(f"satnogs: {len(satnogs)} online ground stations")
                ok = True
            else:
                print("satnogs: no online stations — keeping last good snapshot", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"satnogs FAILED: {e} — keeping last good snapshot", file=sys.stderr)

        try:
            land_topo = fetch_land_map()
            if land_topo:
                write_json(
                    DATA_DIR / "land_map.json",
                    {
                        "updated": now_iso,
                        "source": "world-atlas@2 land-110m (Natural Earth, public domain)",
                        "topo": land_topo,
                    },
                )
                print("land map: ok")
            else:
                print("land map: unexpected payload — keeping last good snapshot", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"land map FAILED: {e} — keeping last good snapshot", file=sys.stderr)

    if mode in {"all", "stations"}:
        try:
            officials = load_official()
            arabic = load_arabic()
            rb_stations = fetch_stations()
            total = len(officials) + len(arabic) + len(rb_stations)
            if total < 10_000:
                raise RuntimeError(f"suspiciously small catalog: {total}")

            arab_extra = fetch_iprd_arab()
            existing_urls = {s["url"] for s in officials + arabic + rb_stations}
            arab_extra = [
                s for s in arab_extra if s["url"] not in existing_urls
            ][:IPRD_MAX]
            community = fetch_community_stations()
            community = [
                s for s in community if s["url"] not in existing_urls
            ][:COMMUNITY_MAX]
            discovered = []
            try:
                scrape_rows = scrape_website_streams(SCRAPER_SEEDS + tuple(scraper_dynamic_seeds()))
                write_json(
                    DATA_DIR / "discovered_streams.json",
                    {
                        "updated": now_iso,
                        "source": "own website scraper (broadcaster portals + curated station sites)",
                        "count": sum(len(r.get("streams") or []) for r in scrape_rows),
                        "sites": scrape_rows,
                    },
                )
                discovered = scraper_catalog_entries(scrape_rows)
                print(f"scraper: {len(discovered)} catalog streams from websites")
            except Exception as e:  # noqa: BLE001
                print(f"scraper FAILED: {e} — continuing without discovered streams", file=sys.stderr)
            dm_entries = []
            try:
                dm_entries = resolve_dailymotion_radios()
                if dm_entries:
                    print(f"dailymotion: {len(dm_entries)} live radios resolved")
            except Exception as e:  # noqa: BLE001
                print(f"dailymotion FAILED: {e} — continuing without dailymotion radios", file=sys.stderr)
            stations = []
            seen_urls = set()
            for station in officials + arabic + arab_extra + discovered + dm_entries + community + rb_stations:
                key = station_url_key(station.get("url"))
                if key and key not in seen_urls:
                    seen_urls.add(key)
                    stations.append(station)
            print(
                f"stations: {len(stations)} total "
                f"(officials {len(officials)} + arabic {len(arabic)} + "
                f"iprd-arab {len(arab_extra)} + community {len(community)} + "
                f"scraper {len(discovered)} + dailymotion {len(dm_entries)} + "
                f"radio-browser {len(rb_stations)})"
            )
            write_json(
                DATA_DIR / "stations.json",
                {
                    "updated": now_iso,
                    "source": "https://www.radio-browser.info/",
                    "count": len(stations),
                    "stations": stations,
                },
            )
            head = stations[:2500]
            write_json(
                DATA_DIR / "stations_head.json",
                {
                    "updated": now_iso,
                    "source": "https://www.radio-browser.info/",
                    "count": len(head),
                    "stations": head,
                },
            )
            ok = True
            try:
                checks = run_stream_checks(officials + arabic + arab_extra)
                if checks:
                    alive = sum(1 for v in checks.values() if v.get("alive"))
                    write_json(
                        DATA_DIR / "stream_checks.json",
                        {
                            "updated": now_iso,
                            "checked": len(checks),
                            "alive": alive,
                            "results": checks,
                        },
                    )
                    print(f"stream checks: {alive}/{len(checks)} streams alive")
            except Exception as e:  # noqa: BLE001
                print(f"stream checks FAILED: {e} — keeping last good snapshot", file=sys.stderr)
        except Exception as e:  # noqa: BLE001
            print(f"stations FAILED: {e} — preserving last good snapshot", file=sys.stderr)
            try:
                curated = load_official() + load_arabic() + fetch_iprd_arab() + fetch_community_stations()
                merged = merge_curated_into_snapshot(curated, DATA_DIR / "stations.json")
                if merged:
                    write_json(DATA_DIR / "stations.json", merged)
                    print(f"stations: merged curated data into existing snapshot ({merged['count']})")
                    ok = True
                else:
                    print("stations: fallback merge unavailable — keeping last snapshot", file=sys.stderr)
            except Exception as fallback_error:  # noqa: BLE001
                print(f"stations fallback FAILED: {fallback_error}", file=sys.stderr)

    if mode in {"all", "stations"}:
        try:
            generate_country_pages(DATA_DIR / "stations.json")
        except Exception as e:  # noqa: BLE001
            print(f"country pages FAILED: {e} — keeping last generated pages", file=sys.stderr)

    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
