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
Deploy `proxy/kiwi-worker.js` to its own Cloudflare Worker (Workers & Pages). The dedicated configuration `proxy/kiwi-wrangler.toml` names **only** `radio-atlas-kiwi-bridge`, uses compatibility date `2025-09-01`, enables workers.dev, disables preview URLs and enables observability at 100% sampling. It requires no bindings or secrets.

From the repository root, after authenticating Wrangler to the Cloudflare account that owns `ossam-hashim.workers.dev`, deploy with:

```sh
npx wrangler deploy --config proxy/kiwi-wrangler.toml
curl --fail --show-error https://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev/healthz
```

The health response must be exactly `ok`; then repeat the security and live audio checks below. This command is the deployment procedure, not evidence that deployment occurred. Do not use the existing `proxy/wrangler.toml` for KiwiSDR: that configuration targets `radio-atlas-stream-relay` and `proxy/worker.js`.

Production route: `https://radio-atlas-kiwi-bridge.ossam-hashim.workers.dev` (activated in the website by PR #146). The owner reports deployment version `2dbe0921-40bc-47f2-8425-11506c5da4a4`, deployment ID `c066198f-3126-4ee3-aa56-7dffd25c851a`, at `2026-11-20T16:05:22.228585Z`. The owner also reports a deployed-source readback matching the 14,224-byte source with SHA-256 `ea1ad562d179d8c0faba11cb13d8e5692cb74df70586e3d5db4b3273fcd69496`. This replaces the earlier owner-reported deployment baseline `3e349979-4861-4f78-aa7d-8dc1fdc42b56`; GitHub Pages deployments do not update this standalone Worker.

Independent post-deployment raw WebSocket probes passed all four public health/origin/unlisted-receiver/upgrade checks, rejected six private-address receiver inputs with HTTP 400, and obtained 32 decoded PCM frames each from `ea8bfk.ddns.net:8073` and `websdr.heppen.be:8073` through the Worker, with 7,672 and 7,675 non-zero PCM samples respectively. A 4,097-byte client message closed with WebSocket code 1008; opening another connection after close also succeeded. These results verify raw transport/PCM behavior, not a human listening confirmation or the complete Radio Atlas browser audio path. Live Chromium CI rerun [44763385912](https://github.com/SamoTech/Radio/actions/runs/44763385912), attempt 2 / job `136405182087`, subsequently passed for both receivers after deployment: 1,192 and 1,191 nonzero samples at 12,000 Hz, running AudioContexts, playing elements and nonzero graph output. Human listening and exact live quota ceilings remain unverified.

The live concurrency probe accepted three sockets from the same test network to one receiver. Isolate assignment and Cloudflare client-IP attribution were not established, so the per-isolate concurrency implementation must **not** be represented as a verified service-wide cap. Global limits are not guaranteed. The source limitations below, including DNS rebinding TOCTOU, remain applicable. P0 is not marked complete by these raw probes; failed receivers must stay on-site with an explicit error and an optional original-receiver link.

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

Use the **Radio Atlas KiwiSDR Live Audio QA** workflow for live verification through the public Worker. Its optional `receivers` input is a JSON array of catalogue URLs; absent that input the workflow tests the two receivers verified active in Chromium (`ea8bfk.ddns.net:8073` and `websdr.heppen.be:8073`). The first three-receiver run failed because `kiwisdr.dfm.hu` timed out with zero frames; that failure remains recorded in `docs/KIWI_P0_VERIFICATION.md`. Live runs are serialized and triggered only manually after the initial P0 verification runs, to avoid unnecessarily occupying operators' receiver slots on unrelated PRs. Any selected receiver failure fails the run; none is silently skipped. Each run uploads its JSON measurements and screenshots under the `radio-atlas-kiwi-live-audio-evidence` artifact.

For a minimal local reproduction, serve the checkout at the permitted development origin and run:

```sh
python -m http.server 8000 --bind 127.0.0.1
# In another terminal at the checkout root:
KIWI_QA_LIVE=1 RADIO_QA_BASE=http://127.0.0.1:8000/ node scripts/kiwi_audio_qa.cjs
```

The script requires the same ephemeral Playwright/Chromium installation as the browser QA workflow. Read `artifacts/kiwi-audio-qa/report.json` for exact receiver failures and measured audio evidence. Recorded success cannot substitute for the live P0 completion gate.
