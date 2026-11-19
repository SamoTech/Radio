# Mobile browser QA — evidence protocol

Roadmap: P1-3 professional mobile interface, P1-6 PWA upgrade verification.

This is an **automated Chromium application test**, not a manual Search Console or production inspection. A local Python HTTP server serves the exact checked-out HTML/CSS/JS/assets, and Playwright uses a real headless Chromium browser to capture reproducible screenshots.

Run manually through **Actions → Radio Atlas Mobile Browser QA → Run workflow** or on a related PR.

## Tested behavior

1. Mobile home (Arabic RTL) and populated real catalog
2. Explore and rendered station cards
3. Country-filtered station list
4. Favorites screen after saving a station
5. SDR screen
6. Mini-player with one HTMLAudioElement playing across navigation
7. Fullscreen expanded player and favorite control
8. English LTR
9. Horizontal overflow at 320, 360, 375, 390, 430, 488, 768, 960, 1280px
10. Landscape screenshot, offline app shell and favorite persistence

A deterministic 30-second WAV file is intercepted at `https://qa.radio.invalid/test-live.wav`. This proves playback continuity inside the application player, **not that a third-party live station is reachable**. It does not send audio through a proxy or make a false radio-stream health claim.

Screenshots and `browser-qa.json` are uploaded in the GitHub Actions artifact. The report includes any browser failures and overflow measurements.

## Not established by this automated run

- Physical device appearance or browser-specific iOS/Android behavior
- Real station stream reliability or Media Session integration with hardware keys
- Browser/OS differences outside the tested Chromium multi-tab Service Worker lifecycle
- GSC sitemap ingestion, GA4 Realtime receipt, or actual Pages deployment SHA
- Real alarms firing while the app is backgrounded or the device is asleep

For acceptance, inspect the artifact screenshots, compare live Pages site, and run manual playback/PWA checks on actual devices. Do not label production deployment `DONE` solely from the local browser run.

## Two-tab Service Worker upgrade QA

The companion `scripts/pwa_upgrade_qa.cjs` runs in the same checked-out localhost Chromium workflow and verifies a waiting updated worker with two old clients open, no forced takeover while one tab remains, activation after both tabs close, favorites preservation, failed precache update keeping the working active worker, and offline reopening after upgrade.

It constructs temporary local `sw-upgrade-qa.js` and `sw-broken-qa.js` test fixtures, deletes both at completion, and uploads `radio-atlas-pwa-upgrade-evidence` with JSON results and real browser screenshots. It never pushes or deploys the synthetic test workers and does not measure real-stream offline playback (live radio requires connectivity).
