# Bounded CDP transport diagnostics prototype

Injected-only source experiment. No process creation, Chrome, filesystem, network,
clock timers or IO are created by this module. Tests supply invented wire replies,
write callbacks and a deterministic scheduler. Nothing imports or modifies frozen
collectors, capture outputs, models, artifacts, credentials or runtime sources.

`createBoundedCdpTransport({write,clock,schedule,cancel,onDiagnostic,limits})`
requires explicit dependencies and exact limit keys. Production defaults are
128 total reserved commands,4MiB frame/wire,32 diagnostics/16KiB and10s absolute
per RPC. Tests may only reduce these limits. `send(stage,params,sessionId)` uses
fixed exported stage/method pairs. `receive(Uint8Array)` consumes NUL-delimited
strict UTF8 JSON request/reply frames. Reply admission requires both exact request
ID and expected session: root commands require absence of sessionId (not null),
session commands require the exact declared session for results AND errors.
Mismatches are fatal invalid-frame, never command results. `pipeEnded`, `childExited` and `abort` are
explicit injected failure signals. No raw child status/error/message is accepted.
Receive accepts genuine non-proxy Uint8Array or Node Buffer objects with their
ordinary prototypes, not subclasses. Bounds use the intrinsic TypedArray length
getter and bounded integer-index reads, never caller byteLength/length/iterator.
Own extensions are ignored without invoking them; no full byte-index property
enumeration is performed. Proxy/subclass input fails closed as invalid-frame.

This is deliberately **request/reply diagnostics first**, not a drop-in complete
Chrome coordinator. CDP notifications/events have no request ID and are refused
as invalid-frame in this prototype. A reviewed event-routing adapter, actual pipe
backpressure integration and target/session lifecycle must be designed separately.
The module neither enforces nor replaces synchronous one-use Document admission,
request allowlists, TLS/rights guards, own-job ownership or page incarnation checks.
Clock/scheduler/write dependencies are trusted implementation seams, not authority.
The scheduler must fire callbacks at or after the requested monotonic deadline.

`deny(requestId,sessionId)` reserves from the SAME128-command total and serializes
`Fetch.failRequest` with fixed `BlockedByClient`. Only one denial RPC is in flight;
queued denials count against existing capacity, and their10s deadlines include
queue wait. `send('block-request',...)` is rejected so callers cannot bypass the
denial lane. This is bounded backpressure, NOT permission to accumulate unbounded
paused requests. A full total fails the entire transport. Any denial failure also
fails the entire transport and rejects all queued work; never silently ignore a
failure or infer that a request was actually blocked. There are no retries,
fallbacks, raised caps or automatic replay. A late write failure remains fatal.
This does not fully solve arbitrary pending bursts: the129th total reserved
command still fails closed. It is not a demonstrated fix or diagnosis of ADR145.

Parameter copying uses cumulative escaped-JSON UTF8 byte accounting while visiting
values and keys, bounded by messageBytes, and a cumulative node/key visit budget
of min(65,536,messageBytes). String UTF16 lower bounds are checked before scanning
or allocating serialized copies. Object/array width and depth remain separately
bounded. Capacity rejection occurs before final wire serialization, with the same
message-cap category; final wire-size validation still includes protocol overhead.

Finite typed `BoundedCdpError.category` distinguishes pipe-ended, child-exited,
write-failed, invalid-frame, invalid-code, message-cap, pending-cap, rpc-deadline,
resource-abort and preserved integer cdp-command-rejected. Errors and bounded
diagnostics expose ONLY fixed method/stage/category, integer CDP code and counter
snapshots. Successful sent/completed diagnostics support high-water observations.
No raw message, URL, parameters, headers, session/request IDs, exception text or
stack is copied into diagnostic metadata. Error.stack is the generic local Error
stack, never a supplied error stack. Inspector metadata is detached/frozen and
explicitly experimental, productionValidated:false, assignmentAuthority:false.
Diagnostic observer throws/rejected native Promises are noninterfering. Arbitrary
thenables are not invoked. Callers still receive real operation rejections; internal
safety handlers prevent abandoned internal chains producing unhandled rejections.

Raw wire exists transiently only for injected writes and a fixed bounded incoming
frame buffer. Caller-provided write implementations may retain their own bytes;
this module cannot attest them. No wire persistence, study receipt, source freeze,
actual pending-cap diagnosis or producer-quality/authority claim is made here.

Pure test command:

    node --max-old-space-size=256 --test --experimental-test-isolation=none spikes/topic-resolution/harness/experimental/bounded-cdp-transport-v1/test.js

Future integration needs root approval, explicit event/close semantics, reviewed
coordinator admission fences and resource ownership, source pins, fresh DEV-only
permission and tests before any new actual study. This code does not repair or
reopen the closed ADR145 attempt.
