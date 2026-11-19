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
- Full two-tab Service Worker waiting/activation migration under simultaneous app use
- GSC sitemap ingestion, GA4 Realtime receipt, or actual Pages deployment SHA
- Real alarms firing while the app is backgrounded or the device is asleep

For acceptance, inspect the artifact screenshots, compare live Pages site, and run manual playback/PWA checks on actual devices. Do not label production deployment `DONE` solely from the local browser run.
