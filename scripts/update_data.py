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

import gzip
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
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
EIBI_URLS = [
    "http://eibispace.de/ski/b22.csv",
    "http://eibispace.de/ski/b21.csv",
    "http://www.eibispace.de/ds/ski.zip",
    "http://eibispace.de/ds/ski.zip",
]
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
        return [s for s in raw if isinstance(s, dict) and s.get("url")]
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
    s = str(s).strip().replace(":", "")
    if len(s) != 4 or not s.isdigit():
        return None
    return int(s[:2]) * 60 + int(s[2:])


def parse_eibi(text, now):
    """Parse an EIBI schedule CSV and keep only on-air rows.

    Tolerant parser: first column = frequency in kHz, then start (HHMM),
    end (HHMM), an optional 7-char day pattern, then free text that
    carries language/station details.
    """
    wd = now.weekday()  # 0 = Monday
    nowm = now.hour * 60 + now.minute
    seen = set()
    rows = []
    for line in text.splitlines():
        parts = re.split(r"[,;	]", line.strip())
        if len(parts) < 4:
            continue
        try:
            freq = int(float(parts[0]))
        except ValueError:
            continue
        if not (2000 <= freq <= 30000):
            continue
        st = _hhmm_to_min(parts[1])
        en = _hhmm_to_min(parts[2])
        if st is None or en is None:
            continue
        on_air = (st <= nowm < en) if st <= en else (nowm >= st or nowm < en)
        if not on_air:
            continue
        days = parts[3].strip()
        if len(days) == 7 and set(days) <= {"0", "1"}:
            if days[wd] != "1":
                continue
        rest = [p.strip() for p in parts[4:] if p.strip()]
        name = " | ".join(rest)[:90]
        key = (freq, parts[1].strip(), parts[2].strip(), name)
        if key in seen:
            continue
        seen.add(key)
        rows.append(
            {
                "f": freq,
                "s": parts[1].strip(),
                "e": parts[2].strip(),
                "n": name,
            }
        )
    rows.sort(key=lambda r: r["f"])
    return rows[:EIBI_MAX_ROWS]


def fetch_eibi(now):
    """Best-effort EIBI shortwave schedule download (try several URLs)."""
    for url in EIBI_URLS:
        try:
            data = fetch_bytes(url, timeout=25)
            if url.endswith(".zip"):
                with zipfile.ZipFile(io.BytesIO(data)) as z:
                    names = sorted(n for n in z.namelist() if n.lower().endswith(".csv"))
                    if not names:
                        continue
                    text = z.read(names[0]).decode("utf-8", "replace")
            else:
                text = data.decode("utf-8", "replace")
            if not text or len(text) < 1000:
                continue
            rows = parse_eibi(text, now)
            if rows:
                return rows
        except Exception as e:  # noqa: BLE001
            print(f"eibi {url} failed: {e}", file=sys.stderr)
    return None


def merge_curated_into_snapshot(curated, path):
    """Radio-Browser unreachable: re-merge curated stations into the last good snapshot."""
    try:
        old = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    stations = old.get("stations")
    if not isinstance(stations, list) or len(stations) < 10_000:
        return None
    fresh = [s for s in curated if isinstance(s, dict) and s.get("url")]
    seen = {s.get("url") for s in fresh}
    out = list(fresh)
    for s in stations:
        if (
            isinstance(s, dict)
            and s.get("url")
            and s.get("cc") != "IL"
            and s.get("url") not in seen
        ):
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
            print("eibi: disabled until a verified schedule source is available")
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
