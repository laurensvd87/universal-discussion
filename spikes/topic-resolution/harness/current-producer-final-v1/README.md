# Current-producer final32 collector (prospective, inert)

This new namespace implements ADR143's fixed 32-article paired observation, not
classification or application integration. The closed DEV controls and all older
cohorts remain immutable. No final request, source freeze or browser launch has
been performed by this implementation.

Root must review all sources, create the exact exported source-map freeze, and
independently authorize each invocation. Defaults are inert. Only these modes
exist: `python supervise.py --static-batch N` and
`python supervise.py --browser-batch N`, with literal N=1..8. Do not execute
before review. Output directories are exclusive and persistent; no automatic
replay, retry, substitution, rescue, deletion, or invocation of later batches.

## Schedule and eligibility

Eight fixed batches of four follow metadata ordinal order. All eight complete
static batches precede browser batch 1; each later batch validates prior result,
packet and cleaned-up supervisor bytes. Static uses <=360s per batch, <=2880s for
the full phase, <=64 policy requests and <=32 page requests. Browser uses eight
independent <=180s Jobs, <=60s complete policy work including pacing, <=80s for
four absolute 20s leases, <=35s other child work and <=5s own-tree drain. Node
cutoffs165/345s and supervisor170/350s leave final checks inside180/360s.

Origin policies are cached only within a batch; page-specific robots/TDM matches
are evaluated per URL. Same-origin page spacing shares one request clock.
Policy delay is never shortened. Static missing text after clean rights checks
can permit browser; unknown or refused static rights/transport cannot. Browser
refreshes policies and checks its own response headers, exact final URL/status,
public observed remote address, secure TLS, frame/loader, fixed matching DCL+2s,
DOM directives and post-snapshot identity. Fresh browser refusal does not erase a
previously valid static input. Every four-row result accounts for collected,
unavailable, fatal or not-attempted rows; all32 remain each producer denominator.
No unattempted or fatal prefix input may be classified.

After guard setup, the initial root about:blank frame establishes the one main
frame ID. Each article synchronously reserves at most one matching GET/HEAD
Document request in that frame with a valid network ID, before any continuation
RPC. Same-URL iframes, duplicate/reload, late and cross-frame requests are blocked
before GET. Own response matching uses the admitted network ID, frame and URL;
Fetch request/response IDs are recorded separately and are not assumed equal.

## Scope and retention

Browser scope is restricted-single-document-dom-reader/v1, **not ordinary dynamic
browser transfer validation** (ordinaryDynamicBrowserProducerValidated:false).
Only GET/HEAD Document requests to the current exact URL within the four pinned
batch URLs are allowed. All external scripts, stylesheets, XHR, Fetch, Other,
images, media, fonts, workers and sockets are blocked, even on the same origin.
Inline scripts may execute, but their external requests are blocked. Some pages
may consequently be unavailable or produce incomplete yet evaluable input.
Credentials, account and telemetry routes remain blocked.
No extension, owner profile, account, pairing, app, local server, provider,
canonical DB, model, vector or encoder is accessed. Chrome runs a fresh D profile,
ordinary TLS, CDP pipe and reviewed guard setup; no unsafe sandbox/certificate flags.

Public-fetch DNS pinning plus observed Chrome remote addresses does not prove
Chrome DNS pinning or complete Chrome/OS/background-network isolation. No native
extension attestation or production/canonical assignment authority is claimed.

Checked-policy actual title<=200/body<=4096 are retained only in an exclusive
`input.packet.json` <=128KiB/four rows, for the separate reviewed local encoding
handoff. Metadata result<=64KiB, combined stdout/stderr<=64KiB, total<=256KiB.
No HTML, raw headers, cookie/IP/error text or vectors are retained. Prefixes in
metadata are <=160 UTF16 with surrogate backoff. Packets are **not automatically
deleted**: root first verifies encoding and source checks, then decides explicit
retention. A public response is not a blanket text-licence grant. Rights remain
per-observation robots/TDM/header/DOM decisions. Valid noisy/generic bounded
reader output remains evaluable; wrong roots count, no post-score exclusion.

## Identities and supervisor

Freeze exact fields are in protocol.json. SOURCE_FILES uses fixed repo-relative
paths: own nine sources, all pure producer transitive dependencies, root producer
profile recipe, taxonomy, ADR143, candidate+sealed labels+selected receipt, closed
DEV seven sources and five completion-evidence files. Input paths never include
old final bodies/vectors/outcomes. Initial bounded nonreparse buffers are hashed
and parsed once; fresh checks precede publication and supervisor completion.
Root profiles derive only actual collector/reader/policy sources, not collector
freeze or selection receipt, avoiding a hash cycle. The separate freeze binds the
receipt and profiles. The fixed fitter freeze and successful fit-current
supervisor receipt are separately pinned outside the target-profile recipe;
cleanup/source/exit/result receipt SHA, actual freeze bytes, selfhash and protocol
links must all match before any final request. Stored-byte identity is not runtime
attestation.

Supervisor assigns Node to an unnamed kill-on-close1536MiB Win32 Job before the
stdin handshake permits any network/browser creation. It checks max128 own PIDs,
verifies opened HANDLE Job membership before sampling, and enforces summed RSS,
private usage, Job commit, host physical+commit1GiB, C768MiB/D512MiB reserves.
RSS may double-count shared pages conservatively. Fresh D TEMP and empty inherited
environment prevent owner credentials/profile reuse. Only own Job/exact child
may be terminated; <=5s drain must prove zero own Job members. Failure receipts
remain persistent. Profile/cache disk growth is not the metadata budget and is
bounded by drive reserves; no automatic cleanup occurs.

Pure tests use invented text and fake transports/clocks only:
`node --max-old-space-size=256 --test --experimental-test-isolation=none
run.test.mjs policy.test.mjs manifest.test.mjs`.
No successful collection, browser eligibility, quality or activation is claimed.
