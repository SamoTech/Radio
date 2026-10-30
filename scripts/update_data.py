#!/usr/bin/env python3
"""Radio Atlas — data updater.

Pulls the KiwiSDR receiver directory (rx.kiwisdr.com/json) and the most
listened-to stations from Radio-Browser, then writes compact snapshots
into data/. Stdlib only — designed for GitHub Actions.

Failures never wipe the last good snapshot: files are written only
after a successful fetch, and the scheduled run retries every 30 min.
"""

import gzip
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

KIWI_URLS = ["http://rx.kiwisdr.com/json/", "https://rx.kiwisdr.com/json/"]
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
    """Normalize whatever the directory returns into a list of dicts."""
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


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")


def fetch_kiwi():
    for url in KIWI_URLS:
        try:
            rows = as_rows(fetch_json(url))
        except Exception as e:  # noqa: BLE001
            print(f"kiwisdr source {url} failed: {e}", file=sys.stderr)
            continue
        receivers = [
            {
                "name": r.get("name", ""),
                "url": r.get("url", ""),
                "online": bool(r.get("online")),
                "users": r.get("users", 0),
                "max_users": r.get("max_users", 0),
                "snr": r.get("snr"),
                "gps": bool(r.get("gps")),
                "band": r.get("band", ""),
            }
            for r in rows
        ]
        return url, receivers
    return None, []


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


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    ok = False

    src, receivers = fetch_kiwi()
    if src:
        write_json(
            DATA_DIR / "kiwisdr.json",
            {"updated": now, "source": src, "count": len(receivers), "receivers": receivers},
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
