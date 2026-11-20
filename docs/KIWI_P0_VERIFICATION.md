# KiwiSDR P0 — implementation and verification, 2026-11-20

Status: **INCOMPLETE / pending runtime gates**. P1–P3 have not started.

## Changes

- Native client recognizes binary `MSG` controls, waits for successful auth and `audio_rate`, negotiates the actual AudioContext output rate, rejects compressed/IQ payloads, and handles PCM endian flags.
- Failure closes the socket/context and keepalive. Read-only `kiwiDiagnostics()` exposes frame/sample counts for QA, with no audio upload or persistent telemetry.
- Worker enforces catalogue origin opt-in, public hostname/address checks, fresh A/AAAA DNS verification, no redirects, bounded attempt/concurrency/command/frame limits and session cleanup. See `proxy/KIWI_README.md` for exact limits and remaining DNS TOCTOU/isolate-local restrictions.
- Service Worker v82. No framework, backend, database, content-policy or catalog-storage changes.

## Observed evidence

| Check | Result |
| --- | --- |
| Native Kiwi tests | 8 passed, including captured PCM and binary handshake lifecycle |
| Worker tests | 20 passed; mocked Cloudflare WebSocket lifecycle, DNS and abuse cases |
| JS suite | 90 passed |
| Python suite | 125 passed |
| Existing deployed bridge checks | 4 passed: health, Origin, catalog rejection, missing upgrade |
| Local sitemap audit | 160 URLs, no issues; GSC not verified |
| EA8BFK via deployed WSS bridge | Auth successful, audio_rate 12000, tune sent; 32 decoded PCM frames / 7,670 nonzero samples |
| Other live attempts | Cortland `71.127.178.35`, `oh1rj.proxy.kiwisdr.com`, `23175.proxy.kiwisdr.com`, `mtkiwi.proxy.kiwisdr.com`: no completed WebSocket handshake; client emitted `WebSocket was closed before the connection was established` / close 1006 after timeout |
| Production app via cloud browser | EA8BFK player reached explicit connection-failed status; production still contains old binary-control bug |
| Local Chromium | Launch blocked: `socket() failed: Operation not permitted (1)`; headless-shell download returned HTTP 403 `Site Unavailable` |
| Chromium Browser QA | 21 PASS in CI run 44762345891 |
| Chromium PWA Upgrade QA | 9 PASS in CI run 44762345891 |
| Lighthouse accessibility | 92 in Validate run 44762346050 |
| Recorded Kiwi browser smoke | Initial run hit a test-trigger overlay; fixture timer teardown also corrected. Later Browser QA exposed a head/full-catalog fixture insertion race before the Kiwi check could run. QA now waits for full catalog and stream-check rendering; rerun pending |
| Live Chromium (run 44762784484) | EA8BFK PASS: 6 frames / 1,429 nonzero samples; Heppen PASS: 5 frames / 1,195 nonzero samples. Both: running AudioContext, playing element and nonzero graph output. DFM FAIL: timeout 20s, 0 frames, context closed. Overall three-receiver run failed. |
| Hardened Worker deployment | Pending; no claim of successful production playback |

The transport probe used a WebSocket client with site Origin, auth, compression disabled, AR negotiation and 10000 kHz AM tuning. It is **not** evidence of physical speaker output. `tests/fixtures/kiwi-snd-recording.json` contains only captured SND packets and receiver/rate/time metadata (no client IP or receiver configuration messages).

## Reproduce browser audio verification

Install ephemeral test dependencies and start a static server in the checkout:

```sh
npm install --no-save --no-package-lock playwright@1.62.1
npx playwright install --with-deps chromium
python3 -m http.server 8000 --bind 127.0.0.1
```

In another terminal, exercise the actual client graph using captured Kiwi audio:

```sh
node scripts/kiwi_audio_qa.cjs
```

Run the full live pipeline through the deployed bridge against the two receivers verified active in Chromium:

```sh
KIWI_QA_LIVE=1 KIWI_QA_RECEIVERS='["http://ea8bfk.ddns.net:8073/","http://websdr.heppen.be:8073/"]' node scripts/kiwi_audio_qa.cjs
```

This exits nonzero if any session lacks nonzero decoded PCM **and** nonzero AnalyserNode output with a running AudioContext and playing HTMLAudioElement. Reports and screenshots are written to `artifacts/kiwi-audio-qa/`. Recorded mode does not allocate receiver slots; live mode does. These are distinct evidence categories. The `Radio Atlas KiwiSDR Live Audio QA` workflow runs manually or when its own workflow file changes (three receiver slots maximum per run), with EA8BFK and Heppen as defaults after the observed DFM timeout; regular Browser QA includes recorded mode.

To reproduce the third-receiver failure, set `KIWI_QA_RECEIVERS='["http://kiwisdr.dfm.hu/"]'` with `KIWI_QA_LIVE=1` and run the same script. No selected receiver is skipped. Human speaker audibility is still not established by headless CI.

## Remaining completion gates

1. Recorded browser smoke, Browser QA, PWA Upgrade QA and Lighthouse must pass against the changed source.
2. Complete a green live run for the two confirmed active receivers, preserving the failed three-receiver result above. Repeat after deploying the hardened Worker; receiver availability and ext_api permissions must be honored.
3. Deploy the hardened Worker separately and recheck its live security/runtime behavior. No new secret/binding is required; this session has no Cloudflare deployment connector or authenticated CLI credential.
4. Merge through a reviewed green PR, verify Validate on main and production provenance, then check audible output in the published app. Human listening confirmation must be reported separately from graph measurements.
