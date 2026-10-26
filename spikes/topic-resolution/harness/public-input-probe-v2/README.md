# Public input probe v2 — code-only, default inert

Version 1 and the separate blank-only compatibility v1 sources/outputs are
immutable. The compatibility attempt safely observed
`ServiceWorker.stopAllWorkers` rejection with CDP code `-32000`; the domain was
not enabled first. Chromium's handler checks domain enablement, which strongly
supports that explanation, but a successful v2 execution is not yet proven.
This is a separate prospective run, not a retry/splice or change to old evidence.

The only main-target setup behavior change is `ServiceWorker.enable` immediately
before `ServiceWorker.stopAllWorkers`. The exported deeply frozen
`MAIN_SETUP_PLAN` preserves every prior setup command/parameter and keeps Fetch
interception before renderer resume. Navigation requires private setup completion.
No guard is removed, disabled, retried or substituted on rejection.

Typed CDP errors now expose only a fixed method name and integer error code.
The fixed first-failure stage/method/code is safely logged without server error
text, parameters, page URLs, headers or stacks. An early rejected setup promise
is explicitly observed before its later await. The unchanged best-effort
Browser.close ACK behavior additionally records a safe `closeDiagnostic` in
the result; the supervisor still must prove own Job-tree cleanup. The explicit
v2 result schema is checked in supervisor metadata linkage.

This is a prospective input/extraction diagnostic for exactly three public
YouTube DEV videos (`1y58ztVt5QU`, `rd5EWR83AGs`, `A0fECnj5sas`) and the public
Leukerecepten `/recepten/kapsalon-maken/` page. These are already-consumed DEV
examples, not independent quality evidence. Implementation does not authorize
launch/navigation. Root review and explicit browser/network execution approval
must precede a single supervised run.

Default `node run.mjs` and `python supervise.py` do nothing except report inert
status. The only active mode is `python supervise.py --run-public-input-probe-v2`.
Do not execute it during code review. No existing output can be reused, erased
or automatically retried. A failed attempt retains its evidence/profile too.

## Isolation and resource boundaries

The Python standard-library supervisor creates a new, exclusive D: `output`
directory, persistent marker and stdout/stderr files. It owns an unnamed Win32
Job with kill-on-close and 1536 MiB job committed-memory limit; breakaway is not
enabled. It starts hidden Node (256 MiB JS heap), assigns Node to the Job, and
only then sends an exact stdin handshake. Node has no Chrome-spawn path before
that handshake. Chrome and descendants inherit the Job; assignment failure
means no browser launch. Only the exact own child/Job is terminated.

Every 50 ms the supervisor checks at most 128 Job PIDs, summed current RSS and
private usage (1536 MiB each), 180-second wall limit, 1 GiB available physical
and commit reserves, C: free >=768 MiB and D: free >=512 MiB. Unverifiable tree
memory, including a process-exit sampling race, fails closed. Each opened handle
must be confirmed by `IsProcessInJob` against this exact Job before memory is
read; a reused PID does not authorize reading an unrelated process. Summed RSS
can double-count shared pages, so the RSS limit is intentionally conservative.
After terminating its own Job the supervisor polls its bounded PID list for
at most five seconds, requires zero members and the own Node exit, then closes
the Job handle. Unconfirmed cleanup still writes a failure receipt, not success.
Logs plus result
are bounded to 256 KiB, with an independently bounded 192 KiB result. Profiles
and Chrome cache are not covered by this metadata limit; the D: reserve is
checked while running, and all temporary paths are under the fresh D: output.
Small supervisor/marker receipts are additional fixed metadata. No cleanup is
automatic.

Only Chrome in the two fixed installed Program Files Google Chrome paths is
eligible. It gets a fresh D: profile, no extensions/owner profile/app/pairing,
no inherited provider credentials, no debug TCP port, no existing-browser
attachment, no sandbox/security bypass. There is no cookie-store/token/profile
read API or login/consent automation. Browser requests have Cookie and
Authorization headers removed before continuation; a fresh site may still set
its own anonymous cookies within this isolated profile. This is not an
authenticated owner-browser reproduction.

## Network and page behavior

Before target creation, browser auto-attach pauses new targets. Non-main page,
worker and service-worker targets are closed while paused. Before navigation,
the main session enables Fetch interception, disables cache, bypasses service
workers and stops existing workers. Downloads are denied; permission overrides
are empty and permission prompts denied; dialogs are dismissed. Browser flags
disable background networking, component update, domain reliability, sync,
phishing updates/default apps and automatic media playback. No unsafe extension
debugging, no `--no-sandbox`, and no disabled web security.

Only GET/HEAD HTTPS and these literal hosts are allowed:

- `www.youtube.com`, `youtube.com`, `www.leukerecepten.nl` for explicit allowed
  request types; Document requests must be one of the exact four fixed URLs.
- `www.gstatic.com`, `i.ytimg.com`, `s.ytimg.com` for Script/Stylesheet only.

Consent (`consent.youtube.com`), account/login paths, known `/api/stats`,
`/gen_204` and `/generate_204` telemetry paths, all other hosts, non-read
methods, media/images/fonts/manifests/workers/WebSockets are blocked. No wildcard
Google/YouTube allow, googlevideo, accounts host, analytics or loopback. Missing
scripts, blocked POST APIs and consent can prevent useful capture: report this
honestly instead of bypassing, expanding hosts or retrying. Tab Fetch/CDP and
flags do **not** prove all Chrome/OS background network egress is intercepted.
Account/telemetry path checks use one bounded percent decode and NFKC; malformed
encoding, residual/double encoding and ambiguous path separators are refused.

## Observations, not attestation

The current packaged `collectPageContent` is imported only after its whole-file
SHA256 matches `c7946a7e19adb3fd9c14b2304101dbd3bf8b7c92fd1ab7c3ba679104b55e428f`.
Its exact function source runs in a CDP-created isolated world; no copied or
relaxed extractor is substituted. A changed reader requires fresh review.
This is not extension/native document attestation.
Node rechecks runner, supervisor and reader bytes after browser shutdown and
pending protocol callbacks have drained, before publishing result JSON. Python
independently rechecks those three source hashes before its completion receipt.
These detect ordinary source drift; they are not an adversarial loaded-module
or executable attestation. A callback timeout/failure cannot publish success.

One navigation per fixed URL, no automatic retry. Snapshots are scheduled at
the matching main-frame navigation loader's DOMContentLoaded, +2 and +8 seconds
(an initial about:blank event cannot satisfy the navigation). A missing DCL records failure without a
fallback body. Persisted metadata includes the reader result/status/extractor,
title (<=200), full bounded-text hash/length and prefix <=160, current/canonical
origin/path/video ID, watch/meta video IDs, heading <=160, mismatch flag, elapsed
timings and aggregate request/status counts. Arbitrary URL query strings and
request headers/bodies, full DOM/body, cookies and vectors are not persisted.
Missing video identity is distinct from a proven matching identity. Redirects,
SPA state, consent, missing regions and timing differences may be visible; none
alone establish the historical cause of a reported wrong topic.

No DB, app service, ingestion, crawler, classifier, encoder/provider, matching
or canonical writes. No native/owner-profile fidelity or quality-repair claim.

## Safe checks

From repository root, guarded pure URL-policy/snapshot tests:

```text
node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none spikes/topic-resolution/harness/public-input-probe-v2/run.test.mjs
node --check spikes/topic-resolution/harness/public-input-probe-v2/run.mjs
python -c "import ast,pathlib; ast.parse(pathlib.Path('spikes/topic-resolution/harness/public-input-probe-v2/supervise.py').read_text())"
```

These checks do not validate live Win32 Job behavior, Chrome/CDP compatibility,
public page availability, extraction or resource compliance of a future run.
