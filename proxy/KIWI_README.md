# KiwiSDR WebSocket bridge — Radio Atlas

This is a **separate Cloudflare Worker** for KiwiSDR hardware which is HTTP/WS-only. GitHub Pages cannot host WebSockets, so this service is not part of the static deployment and is **not currently active**.

## Design
1. Browser makes a secure WSS request to `/kiwi/ws?receiver=<encoded original URL>` with the Radio Atlas Origin.
2. Worker reads the published receiver catalogue `/Radio/data/kiwisdr.json`, caches its allowed origin list for two minutes, verifies the receiver advertises `ext_api > 0`, isn't explicitly offline and has a free receiver slot when known.
3. Worker rejects forbidden/private/loopback/test literal hostnames, credentials, arbitrary URL paths and non-catalogued receivers. Only the server chooses the `/<timestamp>/SND` WebSocket path.
4. Worker upgrades to the receiver's native WebSocket and relays Kiwi frames both directions without storing audio.
5. The radio page decodes native SND audio and exposes volume, mode and tuning in its own interface. The original receiver page remains an optional external link.

**Restrictions:** no iframe proxying, no bypass of receiver login/password or owner API restrictions, and no proxying OpenWebRX/WebSDR proprietary APIs. The worker does not record sessions. Rate limiting is *per-isolate* and is not sufficient for a high-traffic public production service; use Cloudflare WAF or Durable Objects for robust global quotas. HTTP receiver connections from the Worker to hardware are not encrypted on that leg; prefer HTTPS receivers where possible. DNS-rebinding checks are bounded by the hosting platform's networking controls — consider dedicated curated host allowlists for high-assurance deployments.

## Deployment
Deploy `proxy/kiwi-worker.js` to its own Cloudflare Worker (Workers & Pages). Do not overwrite the radio audio relay worker in `proxy/worker.js`. On a successful deployment, verify `https://<your-worker>.workers.dev/healthz` returns `ok`.

Before production activation: run origin-spoof and non-catalogue rejection tests; validate that a **consenting public KiwiSDR with ext_api enabled** delivers playable audio over WSS through the bridge; inspect Cloudflare costs/limits; use a managed security rate limit. Only then set the `KIWI_WS_RELAY` value in `js/modules/sdr.mjs` to the tested HTTPS origin, bump `sw.js`, and merge a separate frontend activation PR. Until then HTTP Kiwi devices retain their original link, while HTTPS Kiwi devices can play directly.

## Contract
- GET `/healthz` — plain `ok`.
- WebSocket `/kiwi/ws?receiver=https%3A%2F%2Fexample.org%2F` — origin-validated, allowlisted, binary/text WebSocket passthrough. HTTP receiver URLs are allowed only through this secure browser-facing WSS relay.
- Unknown/unapproved receiver: HTTP 403. Non-WebSocket request: 426. Directory failure: 503.

No claims of live functionality are made until the worker URL and end-to-end audio are verified.
