#!/usr/bin/env python3
"""Stamp GitHub Pages release provenance and independently verify published assets.

Usage:
  python scripts/deployment_provenance.py stamp --commit "$(git rev-parse HEAD)"
  python scripts/deployment_provenance.py verify --commit "$(git rev-parse HEAD)" --attempts 20

Read-only verification runs AFTER deploy-pages. Do not claim the deployment is
verified from Actions success, source SHA, or HTTP 200 alone.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://samotech.github.io/Radio/"
STAMP = "build-info.json"
ASSETS = (
    "index.html", "sw.js", "sitemap.xml", "manifest.webmanifest",
    "css/styles.css", "js/app.js", "js/modules/player.mjs",
    "js/modules/mobile.mjs", "js/modules/tools.mjs",
    "js/modules/sdr.mjs", "js/modules/sdr-adapters.mjs",
    "js/modules/openwebrx-native.mjs", "js/modules/sdr-waterfall.mjs",
    "data/receiver_audio_checks.json",
)
CACHE_RE = re.compile(r"var CACHE = ['\"](radio-atlas-v\d+)['\"]")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def cache_version(source: bytes) -> str:
    match = CACHE_RE.search(source.decode("utf-8"))
    if not match:
        raise ValueError("sw.js CACHE version not detected")
    return match.group(1)


def release_metadata(root: Path, commit: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("expected a full 40-character lowercase Git commit SHA")
    assets = {}
    for name in ASSETS:
        assets[name] = sha256((root / name).read_bytes())
    manifest = json.loads((root / "data/stations.manifest.json").read_text(encoding="utf-8"))
    return {
        "source_commit": commit,
        "service_worker_cache": cache_version((root / "sw.js").read_bytes()),
        "catalog_version": manifest.get("version"),
        "catalog_count": manifest.get("count"),
        "built_at_utc": datetime.now(timezone.utc).isoformat(),
        "asset_sha256": assets,
    }


def http_get(relative: str, token: str, timeout: int = 12) -> bytes:
    # Avoid a cached old Pages artifact; the SHA is a stable verification token.
    request = Request(
        BASE + relative + "?provenance=" + token,
        headers={"Cache-Control": "no-cache", "User-Agent": "RadioAtlas-Release-QA/1.0"},
    )
    with urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise ValueError(relative + " HTTP " + str(response.status))
        body = response.read(3 * 1024 * 1024 + 1)
        if len(body) > 3 * 1024 * 1024:
            raise ValueError(relative + " response too large")
        return body


def verify_once(root: Path, commit: str) -> dict:
    expected = release_metadata(root, commit)
    published = json.loads(http_get(STAMP, commit).decode("utf-8"))
    if published.get("source_commit") != commit:
        raise ValueError("published source commit differs: " + str(published.get("source_commit")))
    for key in ("service_worker_cache", "catalog_version", "catalog_count", "asset_sha256"):
        if published.get(key) != expected[key]:
            raise ValueError("published descriptor mismatch for " + key)
    for name, expected_hash in expected["asset_sha256"].items():
        actual = http_get(name, commit)
        if sha256(actual) != expected_hash:
            raise ValueError("published asset does not match checkout: " + name)
    return {
        "status": "DONE", "published_commit": commit,
        "service_worker_cache": expected["service_worker_cache"],
        "catalog_version": expected["catalog_version"],
        "catalog_count": expected["catalog_count"],
        "verified_assets": list(expected["asset_sha256"]),
        "site": BASE,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("stamp", "verify"))
    parser.add_argument("--commit", required=True)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--attempts", type=int, default=20)
    parser.add_argument("--delay", type=float, default=6)
    args = parser.parse_args(argv)
    try:
        if args.mode == "stamp":
            data = release_metadata(args.root, args.commit)
            (args.root / STAMP).write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
            print(json.dumps(data, indent=2))
            return 0
        if args.attempts < 1:
            raise ValueError("--attempts must be >= 1")
        for attempt in range(1, args.attempts + 1):
            try:
                data = verify_once(args.root, args.commit)
                print(json.dumps(data, indent=2))
                return 0
            except (HTTPError, URLError, OSError, ValueError, json.JSONDecodeError) as exc:
                print("Published release not yet verified (attempt "
                      + str(attempt) + "/" + str(args.attempts) + "): " + str(exc),
                      file=sys.stderr)
                if attempt == args.attempts:
                    return 1
                time.sleep(args.delay)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print("Release provenance error: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
