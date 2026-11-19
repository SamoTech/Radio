# Radio Atlas — Global radio source audit (2026-11-19)

Baseline from repository tracked assets at 17:35:19 UTC.

| Metric | Before | Meaning |
| --- | ---: | --- |
| Catalog declared count | 60,732 | data/stations.manifest.json v34 AND stations.json count field |
| Actual station rows in stations.json | 60,741 | full JSON array parsed in CI 2026-11-19; mismatch of +9 rows, existing before PR |
| Historical stream checks | 1,185 | data/stream_checks.json |
| Historical results classified alive | 1,071 (90.4%) | HTTP probe, NOT verified browser playback |
| Historical results not classified alive | 114 (9.6%) | Includes blocks, no proof these are broken |
| Official manual catalog | 26 | scripts/official_stations.json |
| Arabic manual catalog | 106 | scripts/arabic_stations.json |
| Manual catalogs with missing language | 0 | 26 + 106 entries |
| Manual catalog duplicate URLs (within each file) | 0 | Case-insensitive literal URL comparison |
| Manual catalog HTTP-only URLs | 0 | 26 + 106 entries |
| Manual catalogs without explicit logo field | 132 | UI fallback exists |
| Global verified playable stations | NOT MEASURED | Historic alive is not audio proof |
| Global country/language/genre completeness | NOT MEASURED | Requires full catalog aggregation |
| Global duplicate broadcaster identities | NOT MEASURED | Same name does not mean same broadcast |
| Before/after real playback success | NOT MEASURED | Needs browser trials |

## Existing station source registry

- Official broadcaster endpoints in the hand-curated official registry.
- Arabic curated stations and IPRD Arab-country country playlists.
- Radio Browser API with five server mirrors, pagination, source failover.
- IPRD country playlists globally (excluding forbidden country).
- Community playlists by junguler (unstructured stream discovery).
- Broadcaster portal scraper with seed inventory; Maspero official video pages
  use Dailymotion and cannot be interpreted as direct audio.
- eyalev/verified-radio-streams community directory.
- Icecast YP public index.
- Live Radio Browser search (client side; separate from daily snapshot).

These are existing providers. This PR does not add an unvalidated provider.

## Root causes found

- Historic HTTP-based checks can classify 200 and certain access errors
  as alive without actual sound bytes.
- 1,185 historic checks are just a small curated/head subset.
- The old absolute minimum of 10,000 catalog records would still permit a
  severe incomplete rebuild from 60k to 40k.
- Station identity is URL-based; collapsing records by broadcaster name would
  break favorites, history and deep links, and could merge unrelated stations.
- Regional/datacenter IP blocking requires uncertain statuses and repeated
  observations; one failed network check is not evidence of a broken stream.
- Official/Arabic curated stations have no explicit logo field, but UI
  supplies flags and fallback artwork.

## Improvements in this PR

- Safe sampled stream-evidence verification, maximum 48 distinct URLs per
  station refresh with curated/failure priorities plus rotating world discovery.
- Bounded 2 KiB sample, 6-second timeout, safe DNS and redirects, one playlist hop.
- Signatures for MP3, AAC, OGG, WAV, FLAC, audio MP4; HLS manifest structural
  checks alone are labelled DEGRADED (not verified browser playback).
- Separate 0-100 score and five internal statuses: VERIFIED, DEGRADED,
  UNVERIFIED, TEMPORARILY_UNAVAILABLE, BROKEN.
- No delete-on-failure; 404/410 needs three consecutive checked failures to
  reach BROKEN; historical last success preserved.
- Observational sample stored separately in data/stream_quality.json.
- Detect major incomplete source crawls: a new catalog over 20% smaller than
  previous is quarantined before writing the new stations.json/head/deltas.
- Old URL-based station IDs and player schema remain unchanged.

## Limits and follow-up

- Sampling is incremental, not a random population sample. Do not generalize
  sample success percentages to 60,732 stations.
- Existing stream_checks.json alive flag is unchanged and NOT the VERIFIED flag.
- HLS segment decode and real mobile/browser playback remain to test.
- URL DNS validation with stdlib has a DNS rebinding TOCTOU limitation.
- GitHub Actions CI and deployment must pass before release is called complete.
- Before/after country and language coverage must be computed from full
  catalog during a separate audit job; do not invent coverage figures.
- No alternative stream is accepted without proof it belongs to the same
  broadcaster and independent playback evidence.
