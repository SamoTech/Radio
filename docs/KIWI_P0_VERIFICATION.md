# KiwiSDR P0 verification — 2026-11-20

Status: **OPEN for final acceptance**. The hardened Worker is deployed according to the owner's authenticated read-back report, and post-deployment audio playback passed external browser tests. Exact live quota ceilings and human listening remain unverified. P1–P3 have not started.

## P0 follow-up — SQLite global quota source (not live)

The follow-up source adds a SQLite-backed `KiwiQuota` Durable Object in `proxy/kiwi-quota.js`, configures its `KIWI_QUOTAS` binding and migration, and keeps per-isolate quotas as a second boundary. The coordinator enforces 24 attempts/min/IP, 12 attempts/min/receiver, 2 active/IP, 2 active/receiver and 32 fleet admission leases. SQLite-backed Durable Objects are supported on Cloudflare Workers Free, subject to Free quotas.

**Source and CI evidence are not production deployment evidence.** No authenticated Cloudflare deployment or live global-acceptance probe is performed as part of this repository-only change. The earlier deployment provenance and runtime evidence below apply to the old version until a new owner-authorized rollout. Re-run the bounded safety/audio tests, collect a new Worker version ID and update this report after deployment. DNS rebinding TOCTOU and physical speaker listening remain open independently.

## Deployment provenance

The owner reports deploying repository commit `5dbdbd720f42ae380c7e93dd78f0b7530e91fd18` through the Cloudflare Workers API:

| Field | Value |
| --- | --- |
| Worker | `radio-atlas-kiwi-bridge` |
| Version | `2dbe0921-40bc-47f2-8425-11506c5da4a4` |
| Deployment | `c066198f-3126-4ee3-aa56-7dffd25c851a` |
| Deployed UTC | `2026-11-20T16:05:22.228585Z` |
| Main module | `kiwi-worker.js` |
| Source size | 14,224 bytes |
| Source SHA256 | `ea1ad562d179d8c0faba11cb13d8e5692cb74df70586e3d5db4b3273fcd69496` |
| Rollback version | `3e349979-4861-4f78-aa7d-8dc1fdc42b56` |
| Compatibility date | `2025-09-01` |
| Configuration | No bindings; workers.dev enabled; previews disabled; observability sampling 1 |

The owner computed the same hash from supplied bytes and authenticated `content/v2` read-back. This session did not independently query that authenticated API; the external observations below are separate runtime evidence.

## Post-deployment runtime evidence

Raw observations: [machine-readable evidence](evidence/kiwi-worker-2026-11-20-postdeploy.json).

| Check | Observed result |
| --- | --- |
| Existing live HTTP suite | 4 PASS: health 200/body `ok`, foreign Origin 403, unlisted receiver 403, missing upgrade 426 |
| Private/local destinations | 6 probes rejected with 400: loopback, RFC1918, metadata/link-local, IPv6 loopback and localhost |
| Oversized client command | 4,097-byte text message closed with code 1008 / `Client message limit` |
| Cleanup/reconnection | A fresh session succeeded after the held sessions closed |
| EA8BFK transport | Auth successful; 32 PCM frames / 7,672 nonzero samples at 12,000 Hz |
| Heppen transport | Auth successful; 32 PCM frames / 7,675 nonzero samples at 12,000 Hz |
| POST WebSocket | Cloudflare edge rejected with 400; the Worker's 405 branch was not independently reached |
| Concurrent-session ceilings | NOT VERIFIED across the service: three simultaneous sessions were accepted. Isolate identity and Worker-observed IP attribution were unavailable |
| Request-rate ceiling / Retry-After | NOT VERIFIED live: bounded unauthorized-host probe stopped after 6 requests over 33,467 ms, all 403; no 429 was observed |

The bounded unauthorized-host probe allocated no receiver slots. The concurrency probe did not establish that its connections shared a Worker isolate or the same Worker-observed IP; it must not be presented as a successful global-cap test. Quotas are explicitly isolate-local, not global.

## Live browser audio after hardening

GitHub Actions run `44763385912`, attempt **2**, job `136405182087` completed successfully after deployment. Measurements were logged at `2026-11-20T16:15:27Z` and `16:15:28Z`. Artifact ID: `14647692047`.

| Receiver | PCM frames | Samples | Nonzero samples | PCM Hz | Context | Element / graph |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| `http://ea8bfk.ddns.net:8073/` | 5 | 1,200 | 1,192 | 12,000 | running | playing / nonzero output |
| `http://websdr.heppen.be:8073/` | 5 | 1,200 | 1,191 | 12,000 | running | playing / nonzero output |

The rerun uses earlier QA commit `68472754af2d33975ffed0d369bb4be07dcaf300`; its native player module bytes were compared with deployed frontend commit `5dbdbd72` and are identical (SHA256 `dff0c3a6961bfcff4e5b6ef2e37113f87ccda50e40556b13cd9fe16367d40b8f`). These are real Worker/receiver connections, not the recorded fixture.

The actual production website was also exercised with fresh connections after Worker deployment:

- EA8BFK reached live status with an unmuted, playing audio element and readyState 4. Playback advanced from 21.738 to 28.282 seconds after tuning to 10,000 kHz.
- Heppen reached live status with an unmuted, playing element, readyState 4 and currentTime 15.404 seconds.
- Both sessions were closed through the application controls after evidence collection.

Playback/graph measurements are not a claim that a human listened to physical speakers.

## Regression evidence

| Suite | Result |
| --- | --- |
| JS unit suite, rerun after Worker deployment | 90 PASS, including 8 native Kiwi and 20 mocked Worker tests |
| Python suite, rerun after Worker deployment | 125 PASS |
| Browser QA / PWA Upgrade QA on unchanged application source | 21 / 9 PASS; run `44765192083` |
| Recorded Kiwi Chromium smoke | PASS; run `44765192083` |
| Lighthouse accessibility | 92; Validate green |
| Initial frontend deployment / provenance | Commit `5dbdbd72`, Service Worker v82 and nine public assets verified; SDR module additionally hash-matched |
| Local sitemap audit | 160 URLs, no source issues; GSC not verified |

The recorded fixture contains 32 captured Kiwi SND packets and receiver/rate/time metadata only. Earlier checks before the frontend repair failed; those historical failures do not describe the current published player. The initial three-receiver run `44762784484` also recorded DFM timing out after 20 seconds with zero frames; that failure was not silently skipped. Subsequent two-receiver runs explicitly selected the two confirmed active receivers.

## Reproduction

Install ephemeral QA dependencies and serve the checkout in one terminal:

```sh
npm install --no-save --no-package-lock playwright@1.62.1
npx playwright install --with-deps chromium
python3 -m http.server 8000 --bind 127.0.0.1
```

Recorded smoke in another terminal:

```sh
node scripts/kiwi_audio_qa.cjs
```

Live smoke, allocating receiver slots sequentially:

```sh
KIWI_QA_LIVE=1 KIWI_QA_RECEIVERS='["http://ea8bfk.ddns.net:8073/","http://websdr.heppen.be:8073/"]' node scripts/kiwi_audio_qa.cjs
```

The manual `Radio Atlas KiwiSDR Live Audio QA` workflow runs the same test. Every selected receiver must produce nonzero PCM and nonzero graph output, with a running context and playing audio element. Reports/screenshots are saved to `artifacts/kiwi-audio-qa/`. Recorded success cannot substitute for live verification.

## Remaining limits and acceptance

- Exact request/concurrency ceilings, private/mixed DNS-answer rejection, redirect rejection, isolate-wide 32-session ceiling and 30-minute session timeout are not all proven by induced public runtime tests. Source/mocked-test evidence is identified separately.
- DNS preflight mitigates rebinding but `fetch` resolves again; no IP pinning or complete TOCTOU protection is claimed.
- No global rate/concurrency enforcement is claimed. Accepting three test sessions is preserved in the evidence.
- Human listening is unconfirmed. P0 is not marked complete and P1–P3 have not started.
