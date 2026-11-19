"""Conservative, bounded stream-health evidence for the Radio Atlas crawler.

A server returning HTTP 200 is not sufficient to call it verified playable.
Only recognizable audio bytes are VERIFIED; HLS manifests remain DEGRADED
until a browser or media segment test is available. No catalog rows are deleted.
"""
import ipaddress
import json
import socket
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

SAMPLE_BYTES = 2048
CHECKS_PER_RUN = 48
FAILURE_THRESHOLD = 3


def public_stream_url(url, resolver=None):
    """Disallow non-global IPs, host credentials and non HTTP(S) schemes."""
    parts = urllib.parse.urlsplit(str(url or "").strip())
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ValueError("invalid stream URL")
    if parts.username or parts.password:
        raise ValueError("embedded URL credentials")
    port = parts.port
    if port is not None and (port < 80 or port > 65535):
        raise ValueError("restricted port")
    host = parts.hostname.strip(".").lower()
    if host == "localhost" or host.endswith((".localhost", ".internal", ".local")):
        raise ValueError("local hostname")
    try:
        addresses = [ipaddress.ip_address(host)]
    except ValueError:
        lookup = resolver or socket.getaddrinfo
        rows = lookup(host, port or (443 if parts.scheme == "https" else 80),
                      type=socket.SOCK_STREAM)
        addresses = [ipaddress.ip_address(x[4][0].split("%")[0]) for x in rows]
    if not addresses or any(not ip.is_global for ip in addresses):
        raise ValueError("private or unresolved destination")
    return parts.geturl()


class SafeStreamRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, resolver=None):
        self.resolver = resolver
        self.hops = 0

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        self.hops += 1
        if self.hops > 3:
            raise ValueError("too many redirects")
        target = urllib.parse.urljoin(req.full_url, newurl)
        public_stream_url(target, self.resolver)
        if req.full_url.startswith("https://") and target.startswith("http://"):
            raise ValueError("HTTPS downgrade")
        return super().redirect_request(req, fp, code, msg, headers, target)


def audio_evidence(sample, content_type="", url=""):
    """Return (codec, evidence, contains_audio) using bytes, not status/MIME."""
    data = bytes(sample or b"")
    if data.startswith(b"OggS"):
        return "OGG", "ogg_header", True
    if data.startswith(b"ID3") or (
        len(data) > 1 and data[0] == 255 and data[1] & 0xE0 == 0xE0
        and data[1] not in (0xF1, 0xF9)
    ):
        return "MP3", "mpeg_frame", True
    if len(data) > 1 and data[0] == 255 and data[1] in (0xF1, 0xF9):
        return "AAC", "adts_frame", True
    if data.startswith(b"RIFF") and data[8:12] == b"WAVE":
        return "WAV", "wave_header", True
    if data.startswith(b"fLaC"):
        return "FLAC", "flac_header", True
    if len(data) >= 12 and data[4:8] == b"ftyp" and str(content_type).startswith("audio/"):
        return "MP4", "audio_mp4_header", True
    if data.lstrip(b"\xef\xbb\xbf \r\n").startswith(b"#EXTM3U"):
        lines = data.decode("utf-8", "replace").splitlines()
        hls = ".m3u8" in url.split("?", 1)[0].lower() or any(
            line.startswith("#EXT-X-") for line in lines
        )
        if hls:
            marker = any(line.startswith(("#EXT-X-TARGETDURATION",
                                          "#EXT-X-STREAM-INF")) for line in lines)
            segment = any(line.strip() and not line.startswith("#") for line in lines)
            return "HLS", "hls_manifest" if marker and segment else "invalid_hls", False
        return "M3U", "playlist", False
    if data.lstrip().lower().startswith(b"[playlist]"):
        return "PLS", "playlist", False
    return "", "no_audio_signature", False


def first_playlist_url(data, base, kind):
    lines = data.decode("utf-8", "replace").splitlines()
    if kind == "PLS":
        lines = [line.split("=", 1)[1].strip() for line in lines
                 if line.lower().startswith("file") and "=" in line]
    for line in lines[:50]:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        url = urllib.parse.urljoin(base, line)
        if url != base and url.startswith(("http://", "https://")):
            return url
    return ""


def quality_score(result, official=False):
    """0-100: audio 45, TLS 15, browser 15, startup 10, official 15."""
    score = 0
    if result.get("evidence") in ("ogg_header", "mpeg_frame", "adts_frame",
                                  "wave_header", "flac_header", "audio_mp4_header"):
        score += 45
    elif result.get("evidence") == "hls_manifest":
        score += 15
    if str(result.get("final_url", "")).startswith("https://"):
        score += 15
    if result.get("browser_compatible") is True:
        score += 15
    if result.get("startup_ms") is not None and result["startup_ms"] < 3000:
        score += 10
    if official and result.get("status") in ("VERIFIED", "DEGRADED"):
        score += 15
    return score


def probe_stream(url, previous=None, official=False, timeout=6, opener=None,
                 resolver=None, now_iso=None, depth=0):
    """Safe limited read (<= 2KiB); one playlist hop; no live-stream drain."""
    previous = previous or {}
    now_iso = now_iso or datetime.now(timezone.utc).isoformat(timespec="seconds")
    res = {"status": "UNVERIFIED", "http_status": 0, "final_url": url,
           "codec": "", "evidence": "", "startup_ms": None,
           "browser_compatible": None, "last_checked": now_iso,
           "last_successful_verification": previous.get("last_successful_verification"),
           "consecutive_failures": int(previous.get("consecutive_failures") or 0)}
    start = time.monotonic()
    try:
        public_stream_url(url, resolver)
        client = opener or urllib.request.build_opener(SafeStreamRedirect(resolver))
        request = urllib.request.Request(url, headers={
            "User-Agent": "RadioAtlasHealth/1.0",
            "Range": "bytes=0-2047",
            "Icy-MetaData": "0",
            "Accept-Encoding": "identity",
        })
        with client.open(request, timeout=timeout) as response:
            res["http_status"] = int(response.getcode() or 0)
            final = response.geturl() if hasattr(response, "geturl") else url
            public_stream_url(final, resolver)
            if url.startswith("https://") and final.startswith("http://"):
                raise ValueError("insecure final URL")
            res["final_url"] = final
            sample = response.read(SAMPLE_BYTES)
            res["startup_ms"] = round((time.monotonic() - start) * 1000)
            codec, evidence, proven = audio_evidence(
                sample, response.headers.get("Content-Type", ""), final
            )
            res.update(codec=codec, evidence=evidence)
            if not 200 <= res["http_status"] < 300:
                raise ValueError("unexpected HTTP status")
            if codec in ("M3U", "PLS") and depth == 0:
                target = first_playlist_url(sample, final, codec)
                if target:
                    public_stream_url(target, resolver)
                    if final.startswith("https://") and target.startswith("http://"):
                        res["evidence"] = "mixed_content_playlist"
                    else:
                        nested = probe_stream(target, previous, official, timeout,
                                              opener, resolver, now_iso, 1)
                        nested["playlist_url"] = url
                        return nested
            if proven:
                res["browser_compatible"] = codec in ("MP3", "AAC", "WAV", "MP4")
                res["status"] = ("VERIFIED" if res["browser_compatible"]
                                 and final.startswith("https://") else "DEGRADED")
                res["last_successful_verification"] = now_iso
                res["consecutive_failures"] = 0
            elif evidence == "hls_manifest":
                res["status"] = "DEGRADED"
                res["consecutive_failures"] = 0
            else:
                res["status"] = "UNVERIFIED"
    except (ValueError, OSError, urllib.error.URLError, urllib.error.HTTPError) as error:
        code = int(getattr(error, "code", 0) or 0)
        res["http_status"] = code or res["http_status"]
        res["consecutive_failures"] += 1
        res["evidence"] = type(error).__name__
        if code in (401, 403, 405, 429, 451):
            res["status"] = "UNVERIFIED"
        elif code in (404, 410) and res["consecutive_failures"] >= FAILURE_THRESHOLD:
            res["status"] = "BROKEN"
        else:
            res["status"] = "TEMPORARILY_UNAVAILABLE"
    res["quality_score"] = quality_score(res, official)
    return res


def select_incremental(stations, previous, now_iso, limit=CHECKS_PER_RUN):
    """Prioritize curated, previous failures, then rotate across whole world."""
    urls, seen = [], set()
    for station in stations:
        if not isinstance(station, dict):
            continue
        url = station.get("url") or ""
        if url in seen or not url.startswith(("https://", "http://")):
            continue
        if station.get("cc", "").upper() == "IL":
            continue
        if "dailymotion.com" in url or station.get("tokenType") == "easy_b":
            continue
        seen.add(url)
        urls.append(station)
    chosen, taken = [], set()
    def add(station):
        if len(chosen) < limit and station["url"] not in taken:
            chosen.append(station)
            taken.add(station["url"])
    for row in urls[:132]:
        if len(chosen) >= min(16, limit // 3):
            break
        last = previous.get(row["url"], {}).get("last_checked", "")[:10]
        if not last or (datetime.fromisoformat(now_iso[:10]).date()
                        - datetime.fromisoformat(last).date()).days >= 3:
            add(row)
    for row in urls:
        if len(chosen) >= min(24, limit // 2):
            break
        info = previous.get(row["url"], {})
        if info.get("status") in ("TEMPORARILY_UNAVAILABLE", "BROKEN") and (
            info.get("last_checked", "")[:10] != now_iso[:10]
        ):
            add(row)
    if urls:
        day = datetime.fromisoformat(now_iso[:10]).date().toordinal()
        start = (day * 97 * limit) % len(urls)
        for i in range(len(urls)):
            row = urls[(start + i) % len(urls)]
            if previous.get(row["url"], {}).get("last_checked", "")[:10] != now_iso[:10]:
                add(row)
            if len(chosen) == limit:
                break
    return chosen


def update_quality_report(stations, path, now_iso, limit=CHECKS_PER_RUN,
                          probe=probe_stream):
    """Observational rolling report: never mutates/drops a station catalog."""
    try:
        old = json.loads(path.read_text(encoding="utf-8")).get("results", {})
        if not isinstance(old, dict):
            old = {}
    except (OSError, ValueError):
        old = {}
    picked = select_incremental(stations, old, now_iso, limit)
    results = dict(old)
    for row in picked:
        results[row["url"]] = probe(
            row["url"], old.get(row["url"]), bool(row.get("official")
                     or "رسمي" in str(row.get("tags", ""))),
            now_iso=now_iso,
        )
    keys = {s.get("url") for s in stations if isinstance(s, dict)}
    results = {key: value for key, value in results.items() if key in keys}
    statuses = ("VERIFIED", "DEGRADED", "UNVERIFIED",
                "TEMPORARILY_UNAVAILABLE", "BROKEN")
    counts = {s: sum(1 for v in results.values() if v.get("status") == s)
              for s in statuses}
    report = {"updated": now_iso, "catalog_count": len(stations),
              "checked_this_run": len(picked), "ever_checked": len(results),
              "not_checked": max(0, len(stations) - len(results)),
              "status_counts": counts, "results": results}
    temporary = path.with_name(path.name + ".tmp")
    try:
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=1),
                             encoding="utf-8")
        temporary.replace(path)
    finally:
        if temporary.exists():
            temporary.unlink()
    return report
