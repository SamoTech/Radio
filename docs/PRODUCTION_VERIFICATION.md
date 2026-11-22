# Production release verification (GitHub Pages)

**Goal:** establish the **actual files served by** `https://samotech.github.io/Radio/`, rather than assuming a successful merge or a successful workflow means production is current.

## How it works

1. In `update-data.yml`, scheduled/manual refreshes publish after the data step; a push to `main` takes the fast code-deploy path without a full crawl. The deployment job checks out the current `main` HEAD. The legacy manual `deploy.yml` is a separate fallback and does not implement this entire provenance pipeline.
2. `scripts/deployment_provenance.py stamp --commit "$(git rev-parse HEAD)"` creates a temporary **`build-info.json`** in the artifact. It records the exact checkout commit SHA, Service Worker cache version, catalog version/count and SHA-256 hashes of the application shell, JS modules and sitemap. The file is not committed into the repository.
3. GitHub Pages deploys that artifact.
4. A separate read-only `verify` job checks out **that exact SHA** and fetches live `build-info.json` and every recorded asset from GitHub Pages. It retries during CDN propagation and validates SHA-256 hashes, not just HTTP 200.
5. The job publishes a `radio-atlas-production-provenance` log. Only `DONE` in that report establishes that the checked files are actually deployed.

The verifier has no credentials to Search Console and cannot establish Google sitemap ingestion. It does not test whether live streaming sources work, and it does not clear users' favorites or IndexedDB.

## Manual reproduction

On the exact source commit being deployed:

```bash
python3 scripts/deployment_provenance.py stamp --commit <40-character-commit-sha>
python3 scripts/deployment_provenance.py verify --commit <same-sha> --attempts 20 --delay 6
```

**Interpretation**

- `DONE`: the public descriptor commit, local source hash set, published Service Worker version, and all tracked public asset bytes agree.
- `NOT VERIFIED`: deployment job did not complete or verification was not run.
- `BLOCKED`: network/permission prevents independent checks.
- `IN PROGRESS`: new artifact deployed but the CDN has not yet served all expected bytes; retry.
- `FAIL`: attempts exhausted or actual bytes differ. Do not claim success until identified.

A source commit is not a production commit until the verifier reports that exact SHA.
