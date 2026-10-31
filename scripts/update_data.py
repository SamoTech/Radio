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
- NOAA SWPC: planetary Kp index + 10.7cm solar flux -> band conditions.
- EIBI (eibispace.de): shortwave broadcast schedule, filtered to the
  broadcasts that are on air at crawl time.

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
    "MR": ["mr.m3u"], "SO": ["so.m3u"],
}
IPRD_MAX = 1500
CHECK_THREADS = 16
CHECK_TIMEOUT = 8
UA = "RadioAtlas/1.0 (https://github.com/SamoTech/Radio)"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OFFICIAL_PATH = Path(__file__).resolve().parent / "official_stations.json"
ARABIC_PATH = Path(__file__).resolve().parent / "arabic_stations.json"


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

        gps = r.get("gps")
        has_gps = False
        if (
            isinstance(gps, list)
            and len(gps) == 2
            and num(gps[0]) is not None
            and num(gps[1]) is not None
        ):
            has_gps = abs(gps[0]) > 0.001 or abs(gps[1]) > 0.001

        receivers.append(
            {
                "name": r.get("name", ""),
                "url": r.get("url", ""),
                "online": not bool(r.get("offline")),
                "users": r.get("users") if isinstance(r.get("users"), int) else 0,
                "max_users": r.get("users_max") if isinstance(r.get("users_max"), int) else 0,
                "snr": snr,
                "gps": has_gps,
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
                "gps": bool(r.get("gps")),
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
            stations = []
            seen_urls = set()
            for station in officials + arabic + arab_extra + rb_stations:
                key = station_url_key(station.get("url"))
                if key and key not in seen_urls:
                    seen_urls.add(key)
                    stations.append(station)
            print(
                f"stations: {len(stations)} total "
                f"(officials {len(officials)} + arabic {len(arabic)} + "
                f"iprd-arab {len(arab_extra)} + radio-browser {len(rb_stations)})"
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
                curated = load_official() + load_arabic() + fetch_iprd_arab()
                merged = merge_curated_into_snapshot(curated, DATA_DIR / "stations.json")
                if merged:
                    write_json(DATA_DIR / "stations.json", merged)
                    print(f"stations: merged curated data into existing snapshot ({merged['count']})")
                    ok = True
                else:
                    print("stations: fallback merge unavailable — keeping last snapshot", file=sys.stderr)
            except Exception as fallback_error:  # noqa: BLE001
                print(f"stations fallback FAILED: {fallback_error}", file=sys.stderr)

    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
