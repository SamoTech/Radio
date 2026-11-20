# KiwiSDR WebSocket bridge — Radio Atlas

This is a **separate Cloudflare Worker** for KiwiSDR hardware which is HTTP/WS-only. GitHub Pages cannot host WebSockets, so this service is not part of the static deployment and is **deployed and configured in the frontend**.

## Design
1. Browser makes a secure WSS request to `/kiwi/ws?receiver=<encoded original URL>` with the Radio Atlas Origin.
2. Worker reads the published receiver catalogue `/Radio/data/kiwisdr.json`, caches its allowed origin list for two minutes, verifies the receiver advertises `ext_api > 0`, isn't explicitly offline and has a free receiver slot when known.
3. Worker rejects forbidden/private/loopback/test literal hostnames, malformed DNS labels, credentials and non-catalogued receiver origins. Incoming paths are discarded. Only the server chooses the `/<timestamp>/SND` WebSocket path.
4. Worker upgrades to the receiver's native WebSocket and relays Kiwi frames both directions without storing audio.
5. The radio page decodes native SND audio and exposes volume, mode and tuning in its own interface. The original receiver page remains an optional external link.

**Restrictions:** no iframe proxying, no bypass of receiver login/password or owner API restrictions, and no proxying OpenWebRX/WebSDR proprietary APIs. The worker does not record sessions. Rate limiting is *per-isolate* and is not sufficient for a high-traffic public production service; use Cloudflare WAF or Durable Objects for robust global quotas. HTTP receiver connections from the Worker to hardware are not encrypted on that leg; prefer HTTPS receivers where possible. DNS-rebinding checks are bounded by the hosting platform's networking controls — consider dedicated curated host allowlists for high-assurance deployments.

## Deployment
Deploy `proxy/kiwi-worker.js` to its own Cloudflare Worker (Workers & Pages). Do not overwrite the radio audio relay worker in `proxy/worker.js`. On a successful deployment, verify `https://<your-worker>.workers.dev/healthz` returns `ok`.

Production route: `https://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev`. The website has already activated this endpoint (PR #146). Public GitHub Actions CI previously independently verified health, origin rejection, noncatalogue rejection, and missing upgrade; **real SND/audio sessions have not yet been verified**. A failed receiver must stay on-site with an explicit error, and the original receiver link remains optional. Cloudflare Agent reported Worker deployment version `3e349979-4861-4f78-aa7d-8dc1fdc42b56` on 2026-11-20 10:36 UTC. Cloudflare code was corrected to fail closed on absent `ext_api`, bound handshake timeouts, prune counters and distinguish 403/429. That version is the prior deployment baseline. The P0 source hardening below still needs separate Worker deployment and live verification; a GitHub Pages deployment does not update this Worker. Managed global limits and real browser/audio QA remain outstanding.

## Contract
- GET `/healthz` — plain `ok`.
- WebSocket `/kiwi/ws?receiver=https%3A%2F%2Fexample.org%2F` — origin-validated, allowlisted, binary/text WebSocket passthrough. HTTP receiver URLs are allowed only through this secure browser-facing WSS relay.
- Unknown/unapproved receiver: HTTP 403. Non-WebSocket request: 426. Directory failure: 503.

Worker reachability/security tests do not establish functional playback. An actual permitted KiwiSDR audio session is the completion gate.


## P0 security controls (source revision 2026-11-20)

- Both catalogue and upstream fetches explicitly disallow redirects. The catalogue is fetched only from the fixed Pages URL, with a nine-second deadline, 4.5 MB size check and shared in-flight request. Only exact normalized catalogue origins with finite, numeric `ext_api > 0`, a receiver not explicitly offline and a free known slot are approved.
- Literal IPv4 blocks include loopback, unspecified, RFC1918, link-local/metadata, CGNAT, multicast/reserved, benchmarking, documentation and deprecated 6to4 relay ranges. IPv6 URL literals are rejected; DNS IPv6 answers must be in global unicast space and outside special-purpose, documentation and transition blocks. DNS names require canonical nonempty labels of at most 63 characters; trailing dots and local/internal names are rejected.
- Immediately before each upstream handshake, fresh DNS-over-HTTPS A and AAAA queries go to the fixed `https://cloudflare-dns.com/dns-query` endpoint. Resolution failure, redirection, no addresses, or **any** non-public address in either family fails closed. This adds no Cloudflare secret, database or binding.
- **Residual DNS rebinding limitation:** checking DNS first mitigates private/mixed-answer DNS, but `fetch()` resolves the hostname again when opening the WebSocket. It does not expose an IP pin for arbitrary external HTTPS origins. A DNS change between those operations remains possible; this implementation must not be described as eliminating rebinding. Stronger guarantees require a separately controlled egress layer that connects to the validated IP while preserving Host/TLS verification, or a vetted stable IP-only receiver allowlist. Cloudflare networking restrictions remain a further platform boundary, not a substitute for this application check.

### Abuse limits

All limits are **per Worker isolate**, reset on eviction/deploy, and are neither global quotas nor authentication. Browser Origin checks are an application boundary; non-browser clients can forge Origin. `CF-Connecting-IP` must come from Cloudflare, not a caller-controlled trusted proxy header.

| Guard | Limit |
|---|---:|
| Attempts per client IP | 24/minute |
| Attempts per approved receiver | 12/minute |
| Concurrent sessions per IP | 2 |
| Concurrent sessions per receiver | 2 |
| Concurrent sessions per isolate | 32 |
| Entries in each rate-limit map | 4,096, refuse new keys when full |
| DNS/upgrade establishment deadline | 9 seconds each |
| Session lifetime | 30 minutes; reconnect explicitly afterward |
| Client command messages | 180/minute; text only; 4,096 bytes/message |
| Receiver messages | 65,536 bytes/message |

Concurrency slots are reserved synchronously **before DNS/upgrade work**, include pending handshakes, and are released exactly once on connection failure, refused upgrade, peer close/error, message limit or session expiry. Upstream redirects and responses other than a real HTTP 101 upgrade are rejected. A client cannot hold an indefinite connection through missing close events because of the session deadline. Frame checks preserve accepted native Kiwi messages byte-for-byte; they do not implement a second audio protocol.

For strict fleet-wide quotas, use Cloudflare's available global rate-limiting/coordination controls separately. No paid service is required by this source change. Never infer a deployed security fix from local tests or the public `/healthz` alone: redeploy this standalone Worker, repeat security tests against its public endpoint, and run the audio smoke test through `/kiwi/ws`.

### Automated audio checks

The regular **Radio Atlas Mobile Browser QA** workflow runs `scripts/kiwi_audio_qa.cjs` in recorded mode against the actual app in Chromium. This exercises binary protocol parsing, PCM scheduling and browser audio output with a captured Kiwi SND fixture; it does not establish receiver or deployed Worker availability.

Use the manual **Radio Atlas KiwiSDR Live Audio QA** workflow for live verification through the public Worker. Its optional `receivers` input is a JSON array of catalogue URLs; absent that input it selects three eligible catalogue receivers. Live runs are serialized and are not triggered on every PR, to avoid unnecessarily occupying operators' receiver slots. Each run uploads its JSON measurements and screenshots under the `radio-atlas-kiwi-live-audio-evidence` artifact.

For a minimal local reproduction, serve the checkout at the permitted development origin and run:

```sh
python -m http.server 8000 --bind 127.0.0.1
# In another terminal at the checkout root:
KIWI_QA_LIVE=1 RADIO_QA_BASE=http://127.0.0.1:8000/ node scripts/kiwi_audio_qa.cjs
```

The script requires the same ephemeral Playwright/Chromium installation as the browser QA workflow. Read `artifacts/kiwi-audio-qa/report.json` for exact receiver failures and measured audio evidence. Recorded success cannot substitute for the live P0 completion gate.
