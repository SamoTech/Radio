#!/usr/bin/env python3
"""Offline, read-only catalog audit. No external requests or station deletion."""
import collections
import json
import re
import sys
import unicodedata
import urllib.parse
from pathlib import Path


def url_key(url):
    try:
        parts = urllib.parse.urlsplit(str(url or "").strip())
        if parts.scheme.lower() not in ("http", "https") or not parts.hostname:
            return ""
        if parts.username or parts.password:
            return ""
        port = parts.port
        host = parts.hostname.lower()
        if port and port not in (80 if parts.scheme == "http" else 443,):
            host += ":" + str(port)
        return urllib.parse.urlunsplit((parts.scheme.lower(), host, parts.path or "/",
                                        parts.query, ""))
    except (TypeError, ValueError):
        return ""


def normalize_name(name):
    text = unicodedata.normalize("NFKC", str(name or "")).casefold()
    return re.sub(r"\s+", " ", text).strip()


def audit_catalog(stations):
    """Counts metadata completeness, URL duplicates and POSSIBLE name collisions.

    Different streams with the same name are NOT merged: country/name is only
    a manual review candidate, not evidence of a duplicate station.
    """
    countries = collections.Counter()
    languages = collections.Counter()
    tags = collections.Counter()
    codec = collections.Counter()
    names = collections.defaultdict(set)
    known_urls = set()
    duplicate_urls = 0
    missing_country = missing_language = missing_logo = missing_name = http_only = 0
    invalid_url = 0
    for station in stations:
        if not isinstance(station, dict):
            continue
        cc = str(station.get("cc") or "").strip().upper()
        country = cc if len(cc) == 2 else "(missing)"
        countries[country] += 1
        if country == "(missing)":
            missing_country += 1
        langs = [part.strip().casefold() for part in
                 re.split(r"[,;|]", str(station.get("language") or "")) if part.strip()]
        if not langs:
            missing_language += 1
        languages.update(set(langs))
        tags.update(set(t.strip().casefold() for t in
                        str(station.get("tags") or "").split(",") if t.strip()))
        codec[str(station.get("codec") or "").strip().upper() or "(missing)"] += 1
        if not station.get("favicon") and not station.get("logo"):
            missing_logo += 1
        name = normalize_name(station.get("name"))
        if not name or name == "—":
            missing_name += 1
        key = url_key(station.get("url"))
        if not key:
            invalid_url += 1
        elif key in known_urls:
            duplicate_urls += 1
        known_urls.add(key)
        if str(station.get("url") or "").lower().startswith("http://"):
            http_only += 1
        if name and name != "—" and key:
            names[(country, name)].add(key)
    potential_same_names = sum(1 for urls in names.values() if len(urls) > 1)
    result = {
        "total": len(stations),
        "countries": len([c for c in countries if c != "(missing)"]),
        "languages": len(languages),
        "missing_country": missing_country,
        "missing_language": missing_language,
        "missing_logo_field": missing_logo,
        "missing_name": missing_name,
        "http_only": http_only,
        "invalid_url": invalid_url,
        "duplicate_stream_urls": duplicate_urls,
        "potential_same_country_name_groups_not_merged": potential_same_names,
        "country_counts": dict(countries.most_common()),
        "language_counts": dict(languages.most_common()),
        "codec_counts": dict(codec.most_common()),
        "top_tags": dict(tags.most_common(40)),
    }
    return result


def main():
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else (
        Path(__file__).resolve().parents[1] / "data" / "stations.json")
    with source.open(encoding="utf-8") as handle:
        payload = json.load(handle)
    stations = payload.get("stations") if isinstance(payload, dict) else payload
    if not isinstance(stations, list):
        raise SystemExit("invalid catalog shape")
    result = audit_catalog(stations)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
