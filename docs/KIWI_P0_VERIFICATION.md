# KiwiSDR P0 verification — 2026-11-20

Status: **OPEN for final acceptance**. The hardened Worker is deployed according to the owner's authenticated read-back report, and post-deployment audio playback passed external browser tests. Exact live quota ceilings and human listening remain unverified. P1–P3 have not started.

## Latest live receiver and quota evidence — 2026-11-21

- **Owner-confirmed live playback after v87:** The owner explicitly confirmed that Radio Atlas is receiving and playing audio. The attached live-page capture marks `EA8BFK — Fuerteventura` as **«صوت اتأكد في الجلسة دي»** at 18:06:34, with 8/40 users and SNR 38 dB. This is human confirmation of actual audible output for this receiver/session; it is not a fleet-wide availability claim or proof of exact quota ceilings.
- **Independent GitHub Actions:** [Live QA run 44920315155](https://github.com/SamoTech/Radio/actions/runs/44920315155), one EA8BFK receiver, FAILED. Chromium opened the bridge WebSocket URL but timed out at 20 s: `frames=0`, `samples=0`, `nonZeroSamples=0`, `sampleRate=0`, `contextState=closed`. In the previous QA version the handshake HTTP response status was **not captured**, so this failure cannot be attributed to audio decoding alone.
- **Owner-provided Cloudflare Observability:** A distinct later HeadlessChrome/loopback-Origin request to EA8BFK returned **HTTP 429**, with successful Worker execution outcome and adjacent `KiwiQuota.jsrpc` invocation entries. This request originated from a cloud QA runner, **not** the owner's earlier Android request. The record confirms an admission rejection but does **not** identify whether it was IP attempt, per-receiver attempt, or concurrency quota; the adjacent `warn` detail/code was not expanded.
- **P0 v87 frontend improvements:** automatic retries after **previously decoded PCM** use 8 s then 65 s (max two), rather than 1.5 s then 3 s; 1000/1008/1009/1013 close categories, timeout and transport failures display localized actionable messages; `kiwiDiagnostics()` adds `failureCode` and `closeCode`. Browser WebSocket events cannot expose the handshake HTTP status, so no UI label falsely asserts a specific 429.
- **P0 v87 QA improvements:** the existing opt-in live Chromium script observes handshake HTTP response status and `Retry-After` via Chrome DevTools Protocol **on the same WebSocket attempt**; no extra probes or credentials/IP addresses are retained, and after a 429 it stops testing further receivers. Report classifications do not substitute for a passed PCM graph test.
- **Acceptance remaining:** the current receiver/session has human-confirmed audible output. Still verify packet/authorization details on the reported Cloudflare version, close/release and lease expiry, exact global admission limits and `Retry-After`, and a small compatibility sample across distinct receiver models. **Do not modify Cloudflare quotas based on one 429 or stress public receivers.** No new Cloudflare Worker deployment is part of this frontend change.

## P0 deployment update — Cloudflare AI authenticated report, 2026-11-21

**Reported status: DEPLOYED WITH OPEN RISKS. P0 remains OPEN.**

The project owner supplied an authenticated Cloudflare AI Agent deployment report. The following are **owner-supplied Cloudflare read-back details, not independently retrieved from the Cloudflare account by the repository agent**:

| Field | Latest reported value |
| --- | --- |
| Existing Worker | `radio-atlas-kiwi-bridge` (unchanged) |
| New Worker version | `6767a1d1-58f7-4b86-ac1f-c81ad8027b52` |
| New deployment | `82e3ea07-eefc-4d4a-848e-ffe2b247d1b0` |
| Deployed UTC | `2026-11-21T15:09:27.898Z` |
| Previous Worker version | `2dbe0921-40bc-47f2-8425-11506c5da4a4` |
| Previous deployment | `c066198f-3126-4ee3-aa56-7dffd25c851a` |
| New source SHA-256 | `84b84114b05fdd50adfaba8aa37c1efee755799679437884bcfe0e8bdb31d802` (reported 24,473 bytes) |
| Main module | `worker.js` |
| DO binding | `KIWI_QUOTAS` → `KiwiQuota` |
| SQLite DO namespace | confirmed by owner report; `use_sqlite: true` (namespace ID intentionally omitted from public docs) |
| Migration | `kiwi-global-quota-v1`, `new_sqlite_classes: ["KiwiQuota"]` |
| Compatibility | `2025-09-01` |
| Plan | Free |
| Rollback | `2dbe0921-40bc-47f2-8425-11506c5da4a4` |

The owner reports `/healthz` returning HTTP 200 through Cloudflare URL Scanner after deployment. Scanner did not expose the body; exact `ok` and any direct Durable Object invocation were **NOT VERIFIED** in that report. Deployed source readback/diff could not be independently verified. Migration and binding were reported as successfully uploaded together, but their runtime invocation is a separate acceptance gate.

**Unverified at deployment-report cutoff:** upgraded WebSocket requests, 403/400/426/429/502/503 from the new Worker, actual IP/receiver/fleet quotas (24/12/2/2/32), `Retry-After`, DNS/SSRF behavior under the new version, live PCM, browser AudioContext graph, human audibility and Free-plan runtime consumption. DNS TOCTOU remains unresolved. Do not conflate the older 2026-11-20 PCM evidence below with a live session on this new version.

### Independent, non-disruptive production acceptance

`scripts/kiwi_production_smoke.cjs` sends **six sequential HTTP requests only** via `.github/workflows/kiwi-production-smoke.yml` (PR-change gated and manual dispatch; no scheduled load). It checks exact `/healthz` body, unknown route, missing upgrade, forbidden Origin, a malformed receiver with valid Origin (which must first call `KiwiQuota.checkIp`), and an unlisted otherwise well-formed receiver. It never upgrades a permitted SDR receiver and cannot consume an operator's slot. **Test results must be copied here from the actual run before declaring any PASS.** Quota thresholds, PCM, and human listening remain separate requirements.

### Independent live results — GitHub Actions, 2026-11-21 15:19 UTC

[Read-only acceptance run 44918568490](https://github.com/SamoTech/Radio/actions/runs/44918568490) completed **SUCCESS** on the branch `5c4037e27df704f30dd267b1e5521b19ed6bce1d`. The test used six sequential requests to the deployed Worker and preserved the returned bodies, with **no approved SDR receiver contacted**:

| Check | Actual HTTP | Latency |
| --- | --- | ---: |
| `/healthz` exact body `ok` | **200 PASS** | 106ms |
| Unknown endpoint | **404 PASS** | 55ms |
| Missing WebSocket upgrade | **426 PASS** | 71ms |
| Disallowed Origin in WebSocket handshake | **403 PASS** | 74ms |
| Approved Origin + malformed receiver | **400 PASS** | 289ms |
| Approved Origin + catalog-unlisted public host | **403 PASS** | 508ms |

The 400 response is important: **under the uploaded source's documented control flow**, the Worker invokes `KIWI_QUOTAS.checkIp(ip)` before receiver normalization, so this is strong indirect evidence that the quota RPC succeeded rather than returning 503. **However, the exact deployed source has not been independently read back**; a different deployed implementation could also return 400. Treat direct Durable Object RPC execution as **LIKELY, NOT INDEPENDENTLY PROVEN** until authenticated source readback or targeted Worker logs confirm the path. This does **not** establish actual quota thresholds, distributed concurrency, receiver-level `reserve`, long-lived session cleanup, PCM output or physical audibility. Those tests remain **NOT VERIFIED**. The new read-only acceptance automation can be rerun manually via GitHub Actions without load on public receivers.

## Previous P0 global-quota implementation background (historical)


The follow-up source adds a SQLite-backed `KiwiQuota` Durable Object in `proxy/kiwi-quota.js`, configures its `KIWI_QUOTAS` binding and migration, and keeps per-isolate quotas as a second boundary. The coordinator enforces 24 attempts/min/IP, 12 attempts/min/receiver, 2 active/IP, 2 active/receiver and 32 fleet admission leases. SQLite-backed Durable Objects are supported on Cloudflare Workers Free, subject to Free quotas.

**Historical note:** these source/CI results alone were not deployment evidence; the owner's subsequent authenticated deployment report appears above. The historical runtime evidence below predates the new SQLite rollout and must not be misattributed to the new version. DNS rebinding TOCTOU and physical speaker listening remain open independently.

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
