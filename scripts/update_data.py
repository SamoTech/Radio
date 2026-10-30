#!/usr/bin/env python3
"""Radio Atlas — data updater.

Pulls the KiwiSDR receiver directory (rx.kiwisdr.com/json) and the most
listened-to stations from Radio-Browser, then writes compact snapshots
into data/. Stdlib only — designed for GitHub Actions.
"""

import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

KIWI_URL = "http://rx.kiwisdr.com/json/"
RB_API = "https://de1.api.radio-browser.info/json/stations/search"
UA = "RadioAtlas/1.0 (https://github.com/SamoTech/Radio)"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def fetch_json(url, params=None):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def write_json(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    ok = False

    # ---- KiwiSDR directory ----
    try:
        raw = fetch_json(KIWI_URL)
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
            for r in raw
        ]
        write_json(
            DATA_DIR / "kiwisdr.json",
            {"updated": now, "source": KIWI_URL, "count": len(receivers), "receivers": receivers},
        )
        print(f"kiwisdr: {len(receivers)} receivers")
        ok = True
    except Exception as e:  # noqa: BLE001
        print(f"kiwisdr FAILED: {e}", file=sys.stderr)

    # ---- Radio-Browser top stations ----
    try:
        raw = fetch_json(
            RB_API,
            {"limit": 1000, "order": "clickcount", "reverse": "true", "hidebroken": "true"},
        )
        stations = [
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
            if s.get("url_resolved") or s.get("url")
        ]
        write_json(
            DATA_DIR / "stations.json",
            {"updated": now, "source": "https://www.radio-browser.info/", "count": len(stations), "stations": stations},
        )
        print(f"stations: {len(stations)} stations")
        ok = True
    except Exception as e:  # noqa: BLE001
        print(f"stations FAILED: {e}", file=sys.stderr)

    if not ok:
        sys.exit(1)


if __name__ == "__main__":
    main()
