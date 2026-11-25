#!/usr/bin/env python3
"""Deploy one exact uploaded artifact through the official GitHub Pages REST API.

Only idempotent reads retry. A create request is sent once; uncertain delivery is
an explicit failure requiring inspection, never an automatic second deployment.
"""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

TRANSIENT_HTTP = {408, 429, 500, 502, 503, 504}
PENDING = {"queued", "pending", "in_progress", "building", "deployment_in_progress",
           "deployment_pending", "deployment_queued", "deployment_attempt_error",
           "unknown_status", "not_found"}
TERMINAL = {"deployment_failed", "deployment_content_failed", "deployment_cancelled",
            "deployment_lost", "failed", "cancelled"}


class DeploymentError(RuntimeError):
    pass


class RetryableRead(DeploymentError):
    pass


class API:
    def __init__(self, base, token, opener=urlopen):
        self.base = base.rstrip("/")
        self.token = token
        self.opener = opener

    def request(self, method, path, payload=None, *, missing_retryable=False):
        data = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(self.base + path, data=data, method=method, headers={
            "Authorization": "Bearer " + self.token,
            "Accept": "application/vnd.github+json", "Cache-Control": "no-cache",
            "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json",
            "User-Agent": "RadioAtlas-Pages/1.0",
        })
        try:
            with self.opener(request, timeout=12) as response:
                body = response.read(1024 * 1024 + 1)
                if len(body) > 1024 * 1024:
                    raise DeploymentError("API response exceeded 1 MiB")
                result = json.loads(body)
                if not isinstance(result, dict):
                    raise DeploymentError("API response must be a JSON object")
                return result
        except HTTPError as exc:
            # Never print a request, payload, response body or OIDC URL/token.
            request_id = exc.headers.get("X-GitHub-Request-Id", "unavailable")
            message = f"{method} {path.split('?')[0]} HTTP {exc.code}; request-id={request_id}"
            if method == "GET" and (exc.code in TRANSIENT_HTTP or
                                    (missing_retryable and exc.code == 404)):
                raise RetryableRead(message) from None
            raise DeploymentError(message) from None
        except (URLError, TimeoutError, OSError) as exc:
            message = f"{method} {path.split('?')[0]} transport {type(exc).__name__}"
            if method == "GET":
                raise RetryableRead(message) from None
            raise DeploymentError(message + "; creation outcome unknown; inspect Pages before rerunning") from None
        except (ValueError, UnicodeError):
            raise DeploymentError(f"{method} returned invalid JSON; inspect Pages before rerunning") from None


def wait_for_artifact(api, prefix, run_id, name, artifact_id, *, attempts=12,
                      sleep=time.sleep, log=print):
    """Require three consecutive exact-ID observations; retry only absence/read failures."""
    deadline = time.monotonic() + 180
    stable = 0
    last = "not visible"
    path = prefix + f"/actions/runs/{run_id}/artifacts?" + urlencode({"name": name, "per_page": 100})
    for attempt in range(attempts):
        if time.monotonic() >= deadline:
            break
        try:
            listing = api.request("GET", path)
            artifacts = listing.get("artifacts")
            if not isinstance(artifacts, list) or type(listing.get("total_count")) is not int:
                raise DeploymentError("Invalid artifact listing schema")
            if not all(isinstance(a, dict) for a in artifacts):
                raise DeploymentError("Invalid artifact entry schema")
            matches = [a for a in artifacts if a.get("name") == name]
            if listing["total_count"] > 100 or len(matches) > 1:
                raise DeploymentError("Ambiguous artifact listing; refusing deployment")
            if not matches:
                raise RetryableRead("expected artifact absent")
            artifact = matches[0]
            if artifact.get("id") != artifact_id:
                raise DeploymentError("Artifact ID differs from upload output; refusing deployment")
            if artifact.get("expired") is not False:
                raise DeploymentError("Artifact expired or invalid expiry metadata")
            if artifact.get("workflow_run", {}).get("id") != run_id:
                raise DeploymentError("Artifact belongs to another workflow run")
            if type(artifact.get("size_in_bytes")) is not int or artifact["size_in_bytes"] <= 0:
                raise DeploymentError("Artifact empty or invalid size")
            # Independent exact-ID lookup must agree with the run/name listing.
            direct = api.request("GET", prefix + f"/actions/artifacts/{artifact_id}", missing_retryable=True)
            for key in ("id", "name", "expired", "size_in_bytes"):
                if direct.get(key) != artifact.get(key):
                    raise DeploymentError("Artifact metadata disagree for " + key)
            if direct.get("workflow_run", {}).get("id") != run_id:
                raise DeploymentError("Exact-ID artifact belongs to another workflow run")
            stable += 1
            log(f"Artifact {name}, id={artifact_id}: stable observation {stable}/3")
            if stable == 3:
                return artifact
        except RetryableRead as exc:
            stable = 0
            last = str(exc)
            log(f"Artifact read retry {attempt + 1}/{attempts}: {last}")
        if attempt + 1 < attempts:
            sleep(max(0, min(2 ** (attempt + 1), 15, deadline - time.monotonic())))
    raise DeploymentError(f"Artifact readiness exhausted {attempts} attempts: {last}")


def oidc_token(env, opener=urlopen):
    # Match @actions/core.getIDToken(): use the runner URL unchanged, with the
    # default GitHub audience. Do not substitute a cloud-provider audience.
    url = env["ACTIONS_ID_TOKEN_REQUEST_URL"]
    if urlsplit(url).scheme != "https":
        raise DeploymentError("OIDC endpoint must use HTTPS")
    request = Request(url, headers={"Authorization": "Bearer " + env["ACTIONS_ID_TOKEN_REQUEST_TOKEN"]})
    try:
        with opener(request, timeout=12) as response:
            data = json.loads(response.read(65537))
        token = data.get("value")
        if not isinstance(token, str) or not token or len(token) > 65536:
            raise ValueError()
        return token
    except (HTTPError, URLError, TimeoutError, OSError, ValueError, AttributeError):
        raise DeploymentError("OIDC request failed; ensure id-token:write; token withheld") from None


def deploy(api, prefix, artifact_id, source_sha, token, state_file, *,
           attempts=40, sleep=time.sleep, log=print):
    # Exclusive durable marker prevents step retries from repeating an uncertain
    # POST on this runner. Workflow reruns require operator inspection if unknown.
    try:
        with state_file.open("x", encoding="utf-8") as state:
            state.write(json.dumps({"source_sha": source_sha, "artifact_id": artifact_id,
                                    "creation_started": True}) + "\n")
    except FileExistsError:
        raise DeploymentError("Deployment journal already exists; inspect existing Pages deployment before rerunning") from None
    log(f"Creating one Pages deployment: source={source_sha}, artifact={artifact_id}")
    # POST errors, including 5xx/timeout/invalid JSON, MUST NOT retry.
    result = api.request("POST", prefix + "/pages/deployments", {
        "artifact_id": artifact_id, "pages_build_version": source_sha, "oidc_token": token,
    })
    deployment_id = result.get("id")
    if not isinstance(deployment_id, (str, int)) or not re.fullmatch(r"[A-Za-z0-9_-]+", str(deployment_id)):
        raise DeploymentError("Creation response lacks valid deployment ID; inspect Pages before rerunning")
    state_file.write_text(json.dumps({"source_sha": source_sha, "artifact_id": artifact_id,
                                     "deployment_id": str(deployment_id)}) + "\n", encoding="utf-8")
    log(f"Pages deployment id={deployment_id}; polling this deployment only")
    deadline = time.monotonic() + 600
    for attempt in range(attempts):
        if time.monotonic() >= deadline:
            break
        try:
            status = api.request("GET", prefix + "/pages/deployments/" + str(deployment_id), missing_retryable=True)
            value = status.get("status")
            log(f"Pages deployment {deployment_id}: {value}")
            if value == "succeed":
                return result
            if value in TERMINAL:
                raise DeploymentError(f"Pages deployment {deployment_id} terminal failure: {value}")
            if value not in PENDING:
                raise DeploymentError(f"Pages deployment {deployment_id} unknown status: {value}")
        except RetryableRead as exc:
            log(f"Pages status read retry {attempt + 1}/{attempts}: {exc}")
        if attempt + 1 < attempts:
            sleep(max(0, min(2 ** (attempt + 1), 15, deadline - time.monotonic())))
    raise DeploymentError(f"Pages deployment {deployment_id} status exhausted {attempts} attempts; inspect this deployment, do not blindly rerun")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifact-id", required=True, type=int)
    parser.add_argument("--artifact-name", required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--descriptor", type=Path, default=Path("build-info.json"))
    parser.add_argument("--state-file", required=True, type=Path)
    args = parser.parse_args(argv)
    try:
        env = os.environ
        run_id = int(env["GITHUB_RUN_ID"])
        attempt = int(env["GITHUB_RUN_ATTEMPT"])
        if args.artifact_id <= 0 or run_id <= 0 or attempt <= 0:
            raise DeploymentError("Run/attempt/artifact IDs must be positive")
        if args.artifact_name != f"github-pages-{run_id}-{attempt}":
            raise DeploymentError("Artifact name must identify this exact workflow run and attempt")
        if not re.fullmatch(r"[0-9a-f]{40}", args.source_sha):
            raise DeploymentError("Source SHA must be a complete lowercase commit SHA")
        checkout = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
        if checkout != args.source_sha:
            raise DeploymentError("Source SHA differs from actual checkout")
        if json.loads(args.descriptor.read_text(encoding="utf-8")).get("source_commit") != checkout:
            raise DeploymentError("Artifact descriptor source differs from actual checkout")
        repo = env["GITHUB_REPOSITORY"]
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
            raise DeploymentError("Invalid repository")
        api_base = env.get("GITHUB_API_URL", "https://api.github.com")
        if urlsplit(api_base).scheme != "https":
            raise DeploymentError("GitHub API must use HTTPS")
        api = API(api_base, env["GITHUB_TOKEN"])
        prefix = "/repos/" + repo
        wait_for_artifact(api, prefix, run_id, args.artifact_name, args.artifact_id)
        result = deploy(api, prefix, args.artifact_id, checkout, oidc_token(env), args.state_file)
        page_url = result.get("page_url", "")
        if not isinstance(page_url, str) or "\n" in page_url or "\r" in page_url or urlsplit(page_url).scheme != "https":
            raise DeploymentError("Deployment succeeded but page_url is invalid; inspect Pages")
        with open(env["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
            output.write("page_url=" + page_url + "\n")
        print("Pages deployment succeeded; production provenance verification may now run")
        return 0
    except (DeploymentError, KeyError, ValueError, OSError, subprocess.CalledProcessError) as exc:
        print("Pages deployment failed: " + str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
