# KiwiSDR WebSocket bridge — Radio Atlas

This is a **separate Cloudflare Worker** for KiwiSDR hardware which is HTTP/WS-only. GitHub Pages cannot host WebSockets, so this service is not part of the static deployment and is **deployed and configured in the frontend**.

## Design
1. Browser makes a secure WSS request to `/kiwi/ws?receiver=<encoded original URL>` with the Radio Atlas Origin.
2. Worker reads the published receiver catalogue `/Radio/data/kiwisdr.json`, caches its allowed origin list for two minutes, verifies the receiver advertises `ext_api > 0`, isn't explicitly offline and has a free receiver slot when known.
3. Worker rejects forbidden/private/loopback/test literal hostnames, credentials, arbitrary URL paths and non-catalogued receivers. Only the server chooses the `/<timestamp>/SND` WebSocket path.
4. Worker upgrades to the receiver's native WebSocket and relays Kiwi frames both directions without storing audio.
5. The radio page decodes native SND audio and exposes volume, mode and tuning in its own interface. The original receiver page remains an optional external link.

**Restrictions:** no iframe proxying, no bypass of receiver login/password or owner API restrictions, and no proxying OpenWebRX/WebSDR proprietary APIs. The worker does not record sessions. Rate limiting is *per-isolate* and is not sufficient for a high-traffic public production service; use Cloudflare WAF or Durable Objects for robust global quotas. HTTP receiver connections from the Worker to hardware are not encrypted on that leg; prefer HTTPS receivers where possible. DNS-rebinding checks are bounded by the hosting platform's networking controls — consider dedicated curated host allowlists for high-assurance deployments.

## Deployment
Deploy `proxy/kiwi-worker.js` to its own Cloudflare Worker (Workers & Pages). Do not overwrite the radio audio relay worker in `proxy/worker.js`. On a successful deployment, verify `https://<your-worker>.workers.dev/healthz` returns `ok`.

Production route: `https://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev`. The website has already activated this endpoint (PR #146). Public GitHub Actions CI previously independently verified health, origin rejection, noncatalogue rejection, and missing upgrade; **real SND/audio sessions have not yet been verified**. A failed receiver must stay on-site with an explicit error, and the original receiver link remains optional. Cloudflare Agent reported Worker deployment version `3e349979-4861-4f78-aa7d-8dc1fdc42b56` on 2026-11-20 10:36 UTC. Cloudflare code was corrected to fail closed on absent `ext_api`, bound handshake timeouts, prune counters and distinguish 403/429. The repository must retain the same source code. Managed rate limits and real browser/audio QA remain outstanding.

## Contract
- GET `/healthz` — plain `ok`.
- WebSocket `/kiwi/ws?receiver=https%3A%2F%2Fexample.org%2F` — origin-validated, allowlisted, binary/text WebSocket passthrough. HTTP receiver URLs are allowed only through this secure browser-facing WSS relay.
- Unknown/unapproved receiver: HTTP 403. Non-WebSocket request: 426. Directory failure: 503.

Worker reachability/security tests do not establish functional playback. An actual permitted KiwiSDR audio session is the completion gate.
