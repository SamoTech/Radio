#!/usr/bin/env python3
"""Create deterministic release metadata and verify the actual public bytes.

The staging inventory is the single source of asset paths. The public descriptor
is compared with the expected checkout before any of its hashes are trusted.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
from http.client import HTTPException
import json
import re
import sys
import time
import uuid
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

# Also works when tests load this module through importlib rather than as a CLI.
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
from stage_production import production_inventory

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://samotech.github.io/Radio/"
STAMP = "build-info.json"
SCHEMA_VERSION = 2
CHUNK_SIZE = 64 * 1024
MAX_ASSET_BYTES = 64 * 1024 * 1024
MAX_DESCRIPTOR_BYTES = 1024 * 1024
REQUEST_TIMEOUT = 12
VERIFY_WORKERS = 4
RETRYABLE_HTTP = {404, 408, 425, 429, 500, 502, 503, 504}
CACHE_RE = re.compile(r"var CACHE = ['\"](radio-atlas-v\d+)['\"]")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def cache_version(source: bytes) -> str:
    match = CACHE_RE.search(source.decode("utf-8"))
    if not match:
        raise ValueError("sw.js CACHE version not detected")
    return match.group(1)


def digest_stream(stream, limit: int, *, deadline: float | None = None):
    """Hash bounded chunks, rejecting oversized streams even without Content-Length."""
    digest, size = hashlib.sha256(), 0
    while True:
        if deadline is not None and time.monotonic() >= deadline:
            raise TimeoutError("verification deadline exceeded")
        reader = getattr(stream, "read1", stream.read)
        chunk = reader(min(CHUNK_SIZE, limit - size + 1))
        if not chunk:
            return digest.hexdigest(), size
        size += len(chunk)
        if size > limit:
            raise ValueError("response too large (limit " + str(limit) + " bytes)")
        digest.update(chunk)


def release_metadata(root: Path, commit: str) -> dict:
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("expected a full 40-character lowercase Git commit SHA")
    assets, sizes = {}, {}
    for name in production_inventory(root):
        if name == STAMP:
            raise ValueError("build-info.json must not hash itself")
        with (root / name).open("rb") as stream:
            assets[name], sizes[name] = digest_stream(stream, MAX_ASSET_BYTES)
    manifest = json.loads((root / "data/stations.manifest.json").read_text(encoding="utf-8"))
    catalog = json.loads((root / "data/stations.json").read_text(encoding="utf-8"))
    if not isinstance(manifest, dict) or not isinstance(catalog, dict):
        raise ValueError("catalog and manifest must be JSON objects")
    if type(manifest.get("version")) is not int or manifest["version"] < 1:
        raise ValueError("invalid catalog version")
    rows = catalog.get("stations")
    count = manifest.get("count")
    if (not isinstance(rows, list) or type(count) is not int or count < 1
            or len(rows) != count or type(catalog.get("count")) is not int
            or catalog["count"] != count):
        raise ValueError("catalog station count differs from manifest/actual rows")
    return {
        "schema_version": SCHEMA_VERSION,
        "source_commit": commit,
        "service_worker_cache": cache_version((root / "sw.js").read_bytes()),
        "catalog_version": manifest["version"],
        "catalog_count": count,
        "asset_sha256": assets,
        "asset_size_bytes": sizes,
    }


def _request(relative, token, deadline):
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("verification deadline exceeded")
    # A new nonce per HTTP request prevents a stale descriptor/asset from being
    # accepted by caches that key on the earlier source-only verification token.
    request = Request(
        BASE + quote(relative, safe="/") + "?provenance=" + token + "-" + uuid.uuid4().hex,
        headers={"Cache-Control": "no-cache, no-store", "Pragma": "no-cache",
                 "Accept-Encoding": "identity", "User-Agent": "RadioAtlas-Release-QA/2.0"},
    )
    return urlopen(request, timeout=min(REQUEST_TIMEOUT, remaining))


def _check_response(response, relative, limit, *, exact=False):
    if response.status != 200:
        raise ValueError(relative + " HTTP " + str(response.status))
    encoding = response.headers.get("Content-Encoding", "identity")
    if encoding not in ("identity", ""):
        raise ValueError(relative + " unexpected content encoding: " + encoding)
    length = response.headers.get("Content-Length")
    if length is not None:
        try:
            size = int(length)
        except ValueError as exc:
            raise ValueError(relative + " invalid Content-Length") from exc
        if size < 0 or size > limit or (exact and size != limit):
            raise ValueError(relative + " response size differs from checkout")


def http_get(relative: str, token: str, *, deadline=None) -> bytes:
    """Only small release descriptors are buffered; runtime assets stream below."""
    deadline = deadline if deadline is not None else time.monotonic() + 30
    with _request(relative, token, deadline) as response:
        _check_response(response, relative, MAX_DESCRIPTOR_BYTES)
        body = bytearray()
        while True:
            if time.monotonic() >= deadline:
                raise TimeoutError("verification deadline exceeded")
            reader = getattr(response, "read1", response.read)
            chunk = reader(min(CHUNK_SIZE, MAX_DESCRIPTOR_BYTES - len(body) + 1))
            if not chunk:
                return bytes(body)
            body.extend(chunk)
            if len(body) > MAX_DESCRIPTOR_BYTES:
                raise ValueError(relative + " response too large")


def http_digest(relative: str, token: str, expected_size: int, *, deadline=None):
    deadline = deadline if deadline is not None else time.monotonic() + 30
    with _request(relative, token, deadline) as response:
        _check_response(response, relative, expected_size, exact=True)
        return digest_stream(response, expected_size, deadline=deadline)


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate descriptor key: " + key)
        result[key] = value
    return result


def verify_once(root: Path, commit: str, *, expected=None, deadline=None) -> dict:
    expected = expected if expected is not None else release_metadata(root, commit)
    deadline = deadline if deadline is not None else time.monotonic() + 480
    published = json.loads(http_get(STAMP, commit, deadline=deadline).decode("utf-8"),
                           object_pairs_hook=_unique_object)
    if not isinstance(published, dict):
        raise ValueError("invalid provenance descriptor: expected an object")
    if published.get("source_commit") != commit:
        raise ValueError("published source commit differs: " + str(published.get("source_commit")))
    if set(published) != set(expected):
        raise ValueError("published descriptor has missing or unexpected fields")
    for key in expected:
        if type(published[key]) is not type(expected[key]) or published[key] != expected[key]:
            raise ValueError("published descriptor mismatch for " + key)
    for name, size in published["asset_size_bytes"].items():
        if type(size) is not int or size < 0:
            raise ValueError("invalid published asset_size_bytes: " + name)
    def verify_asset(name):
        try:
            actual_hash, size = http_digest(name, commit, expected["asset_size_bytes"][name],
                                            deadline=deadline)
            if (actual_hash != expected["asset_sha256"][name]
                    or size != expected["asset_size_bytes"][name]):
                raise ValueError("published asset does not match checkout: " + name)
        except (OSError, HTTPException, ValueError) as exc:
            # HTTPError/URLError retain their types for retry classification.
            if isinstance(exc, (HTTPError, URLError)):
                raise
            raise ValueError("Asset verification failed: " + name + "; " + str(exc)) from exc

    # Four readers bound both load on Pages and aggregate in-flight memory.
    # Consume in inventory order so the first reported failing path is stable.
    # A shared deadline applies to queued work as well as active HTTP reads.
    executor = ThreadPoolExecutor(max_workers=VERIFY_WORKERS)
    futures = []
    try:
        futures = [executor.submit(verify_asset, name)
                   for name in sorted(expected["asset_sha256"])]
        for future in futures:
            future.result()
    finally:
        # Cancel queued work on failure, then join every active reader. A running
        # reader is limited by the shared deadline and socket timeout; no thread
        # or response outlives this verification attempt.
        for future in futures:
            future.cancel()
        executor.shutdown(wait=True, cancel_futures=True)
    return {
        "status": "DONE", "published_commit": commit,
        "service_worker_cache": expected["service_worker_cache"],
        "catalog_version": expected["catalog_version"],
        "catalog_count": expected["catalog_count"],
        "verified_assets": list(expected["asset_sha256"]),
        "verified_asset_count": len(expected["asset_sha256"]), "site": BASE,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("stamp", "verify"))
    parser.add_argument("--commit", required=True)
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--attempts", type=int, default=20)
    parser.add_argument("--delay", type=float, default=6)
    parser.add_argument("--deadline", type=float, default=480,
                        help="Total verification budget in seconds (default 480)")
    args = parser.parse_args(argv)
    try:
        if not 1 <= args.attempts <= 20 or not 0 <= args.delay <= 60 or not 0 < args.deadline <= 540:
            raise ValueError("require attempts 1..20, delay 0..60, deadline >0..540")
        expected = release_metadata(args.root, args.commit)
        if args.mode == "stamp":
            (args.root / STAMP).write_text(
                json.dumps(expected, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                encoding="utf-8")
            print(json.dumps({"source_commit": args.commit, "assets": len(expected["asset_sha256"])}))
            return 0
        deadline = time.monotonic() + args.deadline
        for attempt in range(1, args.attempts + 1):
            try:
                data = verify_once(args.root, args.commit, expected=expected, deadline=deadline)
                print(json.dumps(data, indent=2))
                return 0
            except (HTTPError, URLError, HTTPException, OSError, ValueError) as exc:
                print("Published release not yet verified (attempt " + str(attempt) + "/"
                      + str(args.attempts) + "): " + str(exc), file=sys.stderr)
                # Retry read-only propagation/network failures. Authentication and
                # permanent HTTP errors fail immediately, never concealed by retries.
                if isinstance(exc, HTTPError) and exc.code not in RETRYABLE_HTTP:
                    return 1
                remaining = deadline - time.monotonic()
                if attempt == args.attempts or remaining <= 0:
                    return 1
                time.sleep(min(args.delay, remaining))
    except (OSError, ValueError, SyntaxError, KeyError) as exc:
        print("Release provenance error: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
