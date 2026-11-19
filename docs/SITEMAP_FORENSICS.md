# Radio Atlas sitemap incident — evidence and verification

Scope: [ROADMAP.md P2-2](../ROADMAP.md), property `https://samotech.github.io/Radio/`.
Date first inspected: 2026-11-19. **Search Console result: NOT VERIFIED** without authenticated browser access.

## Independent runner evidence (2026-11-19, UTC)

- [Sitemap live-audit run](https://github.com/SamoTech/Radio/actions/runs/44571413772) checked all 160 live page URLs.
- Published `/Radio/sitemap.xml`: HTTP 200, `application/xml`, and URL set equal to the source sitemap at test time.
- Host-root `https://samotech.github.io/robots.txt`: HTTP 200 with `User-agent: *`, `Allow: /`, and sitemap directives for both `/sitemap.xml` and `/Radio/sitemap.xml`.
- All 160 live pages returned HTTP 200 with the expected final URL and canonical. There were no observed HTTP `X-Robots-Tag: noindex` or HTML `noindex` directives.
- [Earlier audit run](https://github.com/SamoTech/Radio/actions/runs/44571267145) saw one intermittent HTTP 503 on `/Radio/genres/top40.html`; the subsequent audit returned HTTP 200. **Do not infer permanent failure or Googlebot behavior from this transient response.**
- Google Search Console selected-property details, Google's fetch status and last-read time were not accessible to the repository runner. A successful independent HTTP probe does not prove Google ingestion.

## What the source establishes (not a Google processing claim)

- `sitemap.xml` at repository root contains 160 unique absolute URLs under the exact case-sensitive `/Radio/` project path. Each URL corresponds to a tracked static HTML file or index in the repository.
- Every sampled source HTML page has a self-referencing canonical. The automated test now verifies all sitemap URLs, detects noindex directives, and fails on missing title or mismatched canonical.
- `scripts/update_data.py` writes `sitemap.xml` during `generate_country_pages()`, and appends the genre/language pages during `generate_genre_language_pages()`. A later data-refresh commit may change this XML; do not hand-edit generated output.
- `.github/workflows/deploy.yml` uploads the checkout root as-is and does not itself regenerate the sitemap. The auto update-data workflow can regenerate it before the Pages publication; verify the actual deployed artifact/version separately.
- Repository `robots.txt` contains `Sitemap: https://samotech.github.io/Radio/sitemap.xml`. **Important:** on GitHub Pages project sites, `/Radio/robots.txt` is not the controlling robots file for `samotech.github.io`. The controlling endpoint is **`https://samotech.github.io/robots.txt`**. Do not infer the host-root file content from this repository.
- A valid `200` HTTP status for the sitemap, when independently observed, does not demonstrate Googlebot access, Search Console successful ingestion, or indexed page count.

## Competing hypotheses

| Hypothesis | Current source evidence | Missing test | Status |
| --- | --- | --- | --- |
| Duplicate or out-of-property loc URLs | All 160 local loc URLs are unique and start with `https://samotech.github.io/Radio/` | Live generated artifact comparison | Unlikely from source |
| Missing page targets | Repository has matching HTML for all 160 source locs | Live HTTP+redirect checks | Unlikely from source |
| Invalid XML structure | Standard 0.9 namespace and escaped locs in generator | Fetch live XML independently | Unlikely from source |
| Mismatched Search Console property | User-facing report referenced URL-prefix `/Radio/`; property selection not accessible here | Read currently selected property and exact submitted sitemap | NOT VERIFIED |
| Root robots restrictions | Repository project-level robots is not authoritative for host-root rules | Fetch `/robots.txt` and inspect applicable group | NOT VERIFIED |
| Published artifact / CDN mismatch | Source generator and deploy stages distinct | Compare full live loc set and headers with source | NOT VERIFIED |
| Canonical or noindex mismatch | Repository HTML locally auditable | Verify live response after redirects | NOT VERIFIED |
| Temporary Google fetch or processing issue | Public status alone cannot rule this in or out | Search Console last read, error detail, URL Inspection | NOT VERIFIED |

No defensible root cause has been isolated. **Do not resubmit repeatedly or claim DONE.**

## Reproducible tests

Run locally (Python 3.12+, standard library only):

```bash
python scripts/sitemap_audit.py --output sitemap-source-audit.json
python -m unittest tests.test_sitemap_forensics
```

Run only when external requests are authorized and reachable:

```bash
python scripts/sitemap_audit.py --live --timeout 12 --output sitemap-production-audit.json
```

`--live` requests the published sitemap, all listed HTML pages, and the host-root robots file, recording HTTP status, final URL, content type, published `<loc>` set, canonical and robots metadata. It uses ordinary HTTP requests: **it cannot impersonate or verify Googlebot and cannot access Search Console**. This tool does not submit a sitemap or mutate remote state.

## Authenticated Search Console checklist

1. Select exactly the URL-prefix property `https://samotech.github.io/Radio/`, not `https://samotech.github.io/`.
2. In Sitemaps, inspect exact submitted URL, date submitted, date last read, and specific `Couldn't fetch` detail. Record screenshots.
3. Inspect the home page and examples `/countries/eg.html`, `/genres/quran.html` via URL Inspection, including crawler and selected canonical when available.
4. If the published XML, page responses and canonical/robots checks all pass, **do not manufacture a code fix**; classify the remaining Google processing as uncertain until GSC confirms a last read or a useful error.
5. Only resubmit once a verified defect has been corrected, or Google specifically recommends resubmission. Track discovery and indexability separately.

## Operational acceptance

A local passing test is only source integrity. A passing published audit establishes site HTTP delivery from an independent client, **not Search Console processing**. Close the incident as DONE only after the selected Search Console property reports successful sitemap processing and the representative pages are checked.
