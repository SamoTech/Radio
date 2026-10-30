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

Failures never wipe the last good snapshot: files are written only
after a successful fetch, and the scheduled run retries every 30 min
(mirroring the origin cache policy of max-age=1800).
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
UA = "RadioAtlas/1.0 (https://github.com/SamoTech/Radio)"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
OFFICIAL_PATH = Path(__file__).resolve().parent / "official_stations.json"


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


def fetch_stations():
    """Fetch ALL non-broken Radio-Browser stations.

    Offset pagination with per-batch server failover (de1 -> de2 -> nl1).
    If every server fails on a batch we raise so the caller keeps the
    last good full snapshot instead of writing a partial catalog.
    """
    out = []
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
            if not url:
                continue
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


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat(timespec="seconds")
    ok = False

    src, receivers, fetched_at = fetch_kiwi()
    if src:
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
        print("kiwisdr FAILED: no source worked, keeping last good snapshot", file=sys.stderr)

    try:
        stations = load_official() + fetch_stations()
        if len(stations) < 10_000:
            # A partial fetch must never wipe the full catalog snapshot.
            raise RuntimeError(f"suspiciously small catalog: {len(stations)}")
        write_json(
            DATA_DIR / "stations.json",
            {"updated": now_iso, "source": "https://www.radio-browser.info/", "count": len(stations), "stations": stations},
        )
        print(f"stations: {len(stations)} stations (full catalog)")
        ok = True
    except Exception as e:  # noqa: BLE001
        print(f"stations FAILED: {e} — keeping last good snapshot", file=sys.stderr)

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
            print("space weather: no data this run — keeping last good snapshot", file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print(f"space weather FAILED: {e} — keeping last good snapshot", file=sys.stderr)

    try:
        eibi = fetch_eibi(now)
        if eibi:
            write_json(
                DATA_DIR / "eibi.json",
                {
                    "updated": now_iso,
                    "source": "EIBI (eibispace.de)",
                    "count": len(eibi),
                    "rows": eibi,
                },
            )
            print(f"eibi: {len(eibi)} on-air broadcasts")
        else:
            print("eibi: no data this run — keeping last good snapshot", file=sys.stderr)
    except Exception as e:  # noqa: BLE001
        print(f"eibi FAILED: {e} — keeping last good snapshot", file=sys.stderr)

    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
