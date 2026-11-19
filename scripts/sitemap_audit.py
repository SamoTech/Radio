#!/usr/bin/env python3
"""Radio Atlas sitemap diagnostics; no Search Console access or Googlebot claims.

Default: validate the exact repository sitemap and canonical HTML files offline.
--live: independently probe GitHub Pages and record redirect/content-type/canonical,
including /robots.txt on the actual host root. No submissions or state changes.
"""
from __future__ import annotations

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

SITE = "https://samotech.github.io/Radio/"
HOST_ROOT_ROBOTS = "https://samotech.github.io/robots.txt"
NS = "{http://www.sitemaps.org/schemas/sitemap/0.9}"
MAX_BODY = 2 * 1024 * 1024


class Metadata(HTMLParser):
    """Read HTML metadata without executing JavaScript."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.canonical = ""
        self.robots = ""
        self.title = ""
        self._title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title":\n            self._title = True
        if tag == "link" and "canonical" in attrs.get("rel", "").lower().split():
            self.canonical = attrs.get("href", "")
        if tag == "meta" and attrs.get("name", "").lower() == "robots":
            self.robots = attrs.get("content", "")

    def handle_endtag(self, tag):
        if tag == "title":
            self._title = False

    def handle_data(self, data):
        if self._title:
            self.title += data

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)


def read_metadata(html):
    parser = Metadata()
    parser.feed(html)
    return parser


def sitemap_locs(source):
    """Fail closed on broken XML, unexpected namespace, duplicate/empty loc."""
    root = ET.fromstring(source)
    if root.tag != NS + "urlset":
        raise ValueError("unexpected XML namespace/root: " + root.tag)
    locs = []
    for node in root.findall(NS + "url"):
        element = node.find(NS + "loc")
        if element is None or not element.text or not element.text.strip():
            raise ValueError("missing or empty sitemap <loc>")
        locs.append(element.text.strip())
    if not locs:
        raise ValueError("empty sitemap")
    if len(locs) != len(set(locs)):
        raise ValueError("duplicate sitemap URLs")
    return locs


def source_page(root, loc):
    parsed = urlsplit(loc)
    if not loc.startswith(SITE) or parsed.scheme != "https" or parsed.netloc != "samotech.github.io":
        raise ValueError("URL outside /Radio/ property: " + loc)
    if parsed.query or parsed.fragment:
        raise ValueError("sitemap URL has query or fragment: " + loc)
    relative = parsed.path[len("/Radio/"):]
    if not relative or relative.endswith("/"):
        relative += "index.html"
    if ".." in Path(relative).parts:
        raise ValueError("invalid relative path: " + loc)
    return root / relative


def audit_source(root):
    root = Path(root)
    issues = []
    locs = sitemap_locs((root / "sitemap.xml").read_text(encoding="utf-8-sig"))
    for loc in locs:
        try:
            path = source_page(root, loc)
            if not path.is_file():
                issues.append({"url": loc, "reason": "HTML file not present in repository"})
                continue
            page = path.read_text(encoding="utf-8")
            meta = read_metadata(page)
            if meta.canonical != loc:
                issues.append({"url": loc, "reason": "canonical mismatch", "canonical": meta.canonical})
            if "noindex" in meta.robots.lower():
                issues.append({"url": loc, "reason": "HTML robots noindex"})
            if not meta.title.strip():
                issues.append({"url": loc, "reason": "missing <title>"})
        except (OSError, ValueError, UnicodeError) as exc:
            issues.append({"url": loc, "reason": str(exc)})
    robots = root / "robots.txt"
    if robots.exists():
        body = robots.read_text(encoding="utf-8")
        if "Sitemap: " + SITE + "sitemap.xml" not in body:
            issues.append({"reason": "local robots.txt has no correct project sitemap directive"})
    return {"urls": len(locs), "issues": issues,
            "note": "Repository /Radio/robots.txt is NOT the host-root /robots.txt controlling Googlebot."}


def fetch(url, timeout):
    """Independent HTTP request, not a claim about Google's fetch."""
    req = Request(url, headers={"User-Agent": "RadioAtlas-Sitemap-Diagnostics/1.0",
                                "Accept": "application/xml,text/xml,text/html,*/*"})
    try:
        with urlopen(req, timeout=timeout) as response:
            return {"status": response.status, "final_url": response.url,
                    "content_type": response.headers.get("Content-Type", ""),
                    "body": response.read(MAX_BODY).decode("utf-8-sig", errors="replace")}
    except HTTPError as exc:
        return {"status": exc.code, "final_url": exc.url,
                "content_type": exc.headers.get("Content-Type", ""),
                "body": exc.read(1024).decode("utf-8", errors="replace")}
    except (OSError, URLError) as exc:
        return {"status": None, "final_url": url, "content_type": "",
                "error": str(exc), "body": ""}


def audit_live(locs, timeout):
    report = {"sitemap": {}, "host_root_robots": {}, "pages_checked": 0,
              "issues": [], "google_search_console": "NOT VERIFIED"}
    sitemap = fetch(SITE + "sitemap.xml", timeout)
    report["sitemap"] = {k: v for k, v in sitemap.items() if k != "body"}
    if sitemap["status"] != 200 or "xml" not in sitemap["content_type"].lower():
        report["issues"].append({"url": SITE + "sitemap.xml", "reason": "sitemap HTTP/content type"})
    else:
        try:
            published = sitemap_locs(sitemap["body"])
            if set(published) != set(locs):
                report["issues"].append({"url": SITE + "sitemap.xml",
                                         "reason": "published sitemap differs from repository",
                                         "published_count": len(published), "source_count": len(locs)})
        except (ET.ParseError, ValueError) as exc:
            report["issues"].append({"url": SITE + "sitemap.xml", "reason": "invalid published sitemap: " + str(exc)})
    robots = fetch(HOST_ROOT_ROBOTS, timeout)
    report["host_root_robots"] = {k: v for k, v in robots.items() if k != "body"}
    if robots["status"] == 200 and "Disallow: /Radio/" in robots["body"]:
        report["issues"].append({"url": HOST_ROOT_ROBOTS, "reason": "host root robots.txt disallows /Radio/"})
    for loc in locs:
        response = fetch(loc, timeout)
        report["pages_checked"] += 1
        reason = None
        if response["status"] != 200:
            reason = "unexpected HTTP response"
        elif response["final_url"] != loc:
            reason = "redirected sitemap URL"
        elif "text/html" not in response["content_type"].lower():
            reason = "unexpected HTML content type"
        else:
            meta = read_metadata(response["body"])
            if meta.canonical != loc:
                reason = "published canonical mismatch: " + meta.canonical
            elif "noindex" in meta.robots.lower():
                reason = "published robots noindex"
        if reason:
            report["issues"].append({"url": loc, "reason": reason,
                                     "status": response["status"],
                                     "final_url": response["final_url"]})
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--live", action="store_true", help="probe public GitHub Pages, not Search Console")
    parser.add_argument("--timeout", type=int, default=12)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args(argv)
    try:
        local = audit_source(args.root)
        report = {"checked_at": datetime.now(timezone.utc).isoformat(),
                  "property_scope": SITE, "source": local, "google_search_console": "NOT VERIFIED"}
        if args.live:
            locs = sitemap_locs((args.root / "sitemap.xml").read_text(encoding="utf-8-sig"))
            report["live"] = audit_live(locs, args.timeout)
        output = json.dumps(report, ensure_ascii=False, indent=2)
        if args.output:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(output + "\n", encoding="utf-8")
        print(output)
        return 1 if local["issues"] or (args.live and report["live"]["issues"]) else 0
    except (OSError, ValueError, ET.ParseError) as exc:
        print("sitemap audit failed: " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
