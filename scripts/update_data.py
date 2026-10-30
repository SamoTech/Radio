#!/usr/bin/env python3
"""Radio Atlas — data updater.

Sources:
- KiwiSDR public directory via the AetherSDR CDN mirror
  (https://cdn.aethersdr.com/kiwi.json — CORS-open hourly mirror of
  kiwisdr.com/public, schema 1). PRIMARY: the legacy rx.kiwisdr.com/json
  origin has been intermittently down during KiwiSDR server changes.
- rx.kiwisdr.com/json/ — legacy origin endpoint, kept as fallback.
- Radio-Browser top-click stations.

Failures never wipe the last good snapshot: files are written only
after a successful fetch, and the scheduled run retries every 30 min
(mirroring the origin cache policy of max-age=1800).
"""

import gzip
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

KIWI_MIRROR_URL = "https://cdn.aethersdr.com/kiwi.json"
KIWI_LEGACY_URLS = ["http://rx.kiwisdr.com/json/", "https://rx.kiwisdr.com/json/"]
RB_API = "https://de1.api.radio-browser.info/json/stations/search"
UA = "RadioAtlas/1.0 (https://github.com/SamoTech/Radio)"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


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
        data = fetch_json(KIWI_MIRROR_URL)
        if isinstance(data, dict) and isinstance(data.get("receivers"), list):
            receivers, fetched_at = from_mirror(data)
            return KIWI_MIRROR_URL, receivers, fetched_at
        raise ValueError("unexpected mirror payload shape")
    except Exception as e:  # noqa: BLE001
        print(f"kiwi mirror {KIWI_MIRROR_URL} failed: {e}", file=sys.stderr)

    # 2) legacy origin endpoints — fallback
    for url in KIWI_LEGACY_URLS:
        try:
            receivers, fetched_at = from_legacy(as_rows(fetch_json(url)))
            return url, receivers, fetched_at
        except Exception as e:  # noqa: BLE001
            print(f"kiwi legacy {url} failed: {e}", file=sys.stderr)
    return None, [], None


def fetch_stations():
    raw = fetch_json(
        RB_API,
        {"limit": 1000, "order": "clickcount", "reverse": "true", "hidebroken": "true"},
    )
    return [
        {
            "name": s.get("name", ""),
            "url": s.get("url_resolved") or s.get("url", ""),
            "favicon": s.get("favicon", ""),
            "country": s.get("country", ""),
            "language": s.get("language", ""),
            "tags": s.get("tags", ""),
            "codec": s.get("codec", ""),
            "bitrate": s.get("bitrate", 0),
        }
        for s in raw
        if isinstance(s, dict) and (s.get("url_resolved") or s.get("url"))
    ]


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    ok = False

    src, receivers, fetched_at = fetch_kiwi()
    if src:
        write_json(
            DATA_DIR / "kiwisdr.json",
            {
                "updated": now,
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
        stations = fetch_stations()
        write_json(
            DATA_DIR / "stations.json",
            {"updated": now, "source": "https://www.radio-browser.info/", "count": len(stations), "stations": stations},
        )
        print(f"stations: {len(stations)} stations")
        ok = True
    except Exception as e:  # noqa: BLE001
        print(f"stations FAILED: {e} — keeping last good snapshot", file=sys.stderr)

    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
