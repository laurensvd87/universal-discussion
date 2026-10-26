# Invented Playwright route-burst DEV prototype

Source-only ADR149 implementation. Default commands are inert. The sole future
mode is supervised `--run-dev`; source review, a new byte freeze and separate
actual-run permission are required. It neither resumes ADR148 nor visits any
public page. No account, app, native document authority, provider, E5 or database
is used. No existing capture/packet/model inputs are read.

The unchanged installed playwright-core 1.64.1 drives installed sandboxed Chrome.
Its import is after the supervisor's owned-Job handshake. A fresh ephemeral
profile lives under the supervisor's new D: TEMP; no owner profile, extensions,
credentials, tracing, HAR or persistent context is opened. Package-owned profile
cleanup is permitted; this harness never deletes it itself.

One owned browser executes two contexts sequentially. Routing and socket denial
are installed before a blank page exists. `setContent` supplies an invented
string containing only 1000, then 256, unique `.invalid` image references. All
routes must be exact owned main-frame GET/image references with unique ordinals;
no request continues. Unexpected request/dialog/crash/navigation/socket or native
abort failure fails. Deliberate aborts normally emit `requestfailed`; this probe
does not interpret those events as independent transport evidence. Successful
abort counts come only from fulfilled actual `route.abort` promises.

The normal burst requires all 1000 native aborts and callbacks to settle before
ordinary-lane context close; neither fatal cleanup slot is spent. The second
context waits until its first native abort actually succeeds and then holds
only adapter completion. At least one later route must queue. Another 125
injected barriers fill the 126 normal adapter slots; they are not Chrome RPCs.
The unique private intentional fatal rejects normal callers. Exactly two
reserved operations attempt current context close then browser close, even if
the former fails. Finally releases invented barriers and demands genuine zero
physical accounting. No wrapper timeout frees an unresolved native slot.

An independently retained unexpected-failure flag wins over the expected fatal,
including late abort/callback/deadline/cleanup/source failures. Retired context
callbacks cannot enter a new owner's route set. Task registry entries are copied,
one-use and private; ordinary return values are preserved outside the scheduling
core, which intentionally only returns completion.

Each burst has 45 seconds, ordinary operations 10 seconds and each fatal close
2 seconds, all within the original Node 165-second limit and supervisor's
180-second Job contract. See protocol.json for exact resource/evidence bounds.
There are 12 fixed source keys plus all 115 installed package files (127 total),
with package/lock integrity and initial/end source checks. Only bounded counters,
fixture/source hashes and safe finite failures are persisted, never fixture DOM,
raw URLs, headers or error strings. The supervisor independently enforces owned
tree resources, metadata/profile bounds and normal zero-descendant cleanup.

This is not complete OS egress isolation, Playwright-internal IPC/pending capacity
enforcement, native attestation, semantic quality validation, or a public capture
implementation. Synthetic tests are not browser compatibility evidence. No
automatic repeat follows failure.
