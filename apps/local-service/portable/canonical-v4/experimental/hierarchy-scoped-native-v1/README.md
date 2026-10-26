# ADR167 native scoped proof — incomplete source work

Source is accepted under ADR173; metadata preparation and native execution still
require separate gates. No native result,
serving-role assurance, concurrency proof or production activation is established
by this directory. The accepted ADR165 five-file prototype remains unchanged.

Root owns `check.js`, `test.js`, this README and the separate thin driver.
The controller slice owns `run-control.js` and `run-control.test.js`.
The module exports
`SOURCE_STATUS='accepted-for-native-proof'`; `runNativeScopedProof` still rejects
an unminted source seal before any connector call. The fixed driver additionally
requires Job assignment, authenticated source/binary freeze and the fresh owned
cluster. HBA permission alone supplies none of those capabilities.

## Local helper slice

The guarded tests import the inert module and use invented in-memory clients.
They do not call inventory capture, open PostgreSQL, read credentials, start a
server/browser/process, or perform privilege tests. One test calls only the
native runner with an unminted seal and verifies zero connector calls.
They cover the exact scratch-name helper, single-marker byte-preserving source
insertion, finite result-byte limits, resource ceiling comparisons, bounded
failure classification and the local explicit transaction adapter.
The combined driver/controller run on2026-10-20 passed90/90 guarded tests, with no failures or
skips. Focused cases reject nonfinite/negative/nonnumeric budget metrics and
fractional case counts without coercion, reject unknown uppercase failure labels,
and verify error-code getters are not executed. This is only local helper
evidence; inventory capture and native execution were not performed.

The actual measured-barrier helper now checks the entire observed interval from
before lock acquisition through successful release against the original2s cap.
Tests execute that helper with invented acquire/action/observe/release functions,
including expiry, failed release, original-error retention and an action still
physically outstanding after refusal. An expired observation cannot pass, but
these checks do not independently cancel a query or prove a hard wall limit.
The cooperative watchdog is now source-integrated; complete integration review
and native settlement remain open.

The invented adapter tests check separate BEGIN/isolation/command/literal-COMMIT
messages, rollback on callback/isolation/commit failures, original-error retention
when rollback fails, no callback after failed BEGIN, and no client shutdown by
the transaction adapter. These are JavaScript adapter contracts, not PostgreSQL
protocol or rollback evidence. No real client cleanup or database-drop safety is
proved by a transaction test. The actual root cleanup and Run query facade now
execute with invented sockets and the real cooperative controller. They cover
physical query retention, late WORK refusal, absence of SQL cancellation,
rollback before restoration, exact-OID DROP refusal and unknown timed-out DROP.
These are not real PostgreSQL results. The separate driver's
pre-handoff establishment contract is covered below.

## Thin-driver establishment helper

`establishFixedClient` is inert until called. The actual driver delegates to it
with a fixed pg constructor and generated owned-cluster RAM credentials. Local tests
supply invented factories and virtual timers only; they never invoke the real
connector, protected provider or password callback.

The helper validates the exact request fields, role/database pair, application
name and5s/3s statement/lock settings before creating a provider or client. Its
production configuration is loopback127.0.0.1:55433, SSL false and5s connect
timeout. Connect plus READ COMMITTED setup share one5s establishment deadline.
Success hands the unchanged client to the runner without closing it.

On establishment failure or timeout, an owned client's `end()` is invoked exactly
once and awaited for at most15s. A close rejection or unsettled close is a fixed
uncertainty classification, never a successful cleanup assertion. Original
provider/connect/setup/close errors, messages, causes and credentials are not
returned. There is no automatic retry. A late connect completion cannot initiate
setup after timeout. Timer injection exists only for invented tests; request
fields cannot change the fixed production deadlines.

Invented cases cover connect/setup rejection, successful handoff, close rejection,
unsettled/fulfilled awaited close, connect/setup timeout, invalid requests before
factory creation and sanitized provider-factory rejection. This does not prove
real socket shutdown, cancellation, server session disappearance or database-drop
safety. Broader cleanup and native execution remain separately gated.

Run only this local suite from repository root:

```powershell
node --max-old-space-size=256 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-native-v1/test.js
node --max-old-space-size=256 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-native-v1/run-control.test.js
```

Importing a named native case ledger does not execute it. No native invocation
command is provided in this incomplete helper-slice README.

## Native implementation and evidence still incomplete

Protocol, replay and the complete native case source have passed root and
independent review, including committed-first erasure replay and exact committed
tuples while the actual legacy apply remains held. Native execution and the
endpoint/provisioning gate are still closed. Root
separately reports a source-only inventory capture of124 files/about1.174MB,
including pins for all five ADR165 files. This helper suite neither repeats nor
validates that capture. Source inventory success is not native proof or complete
source acceptance.

The actual open review controls include the integrated private WORK/cleanup/DROP
lanes, original source-capture epoch, sampled resource watchdog,
physical/original settlement and exact database
cleanup. True native concurrent schedules are still unproved. The thin-driver
establishment cleanup now has source code and invented-client tests, but its
real-client behavior and the orchestrator's cleanup remain unproved.

Root retains cleanup/DROP capabilities outside Run. All ordinary SQL uses the
WORK-only facade; the maintenance connection is unavailable to ordinary case
SQL after provisioning. Bootstrap counts against the same eight lifetime slots
before its factory starts. Setup and backend identity checks stay inside that
tracked establishment. Failed or timed-out acquisition permanently prevents
DROP, even after known sockets close.

On failure, cleanup awaits physical establishment/setup/SQL and the original
callback within its unchanged absolute deadline, then rolls
back, unlocks barriers, restores fixture definitions and closes known clients.
DROP requires settled work, closed noncontroller clients, the matching creation
OID and zero sessions. Every SQL dispatch checks its lane and absolute deadline.
A last-resort195s timer may exit only this opt-in diagnostic, reporting unknown
cleanup; it proves neither an OS wall, server cancellation nor socket drain.
No pg_cancel_backend call is dispatched: a prior backend-incarnation predicate
would not make PID-based cancellation atomic. Configured5s statement and3s lock
timeouts are not evidence of physical client/socket settlement. Unsettled work
prevents restoration/closure on busy sockets and prevents DROP or reuse.

The following native evidence remains wholly unproved by these local tests:

- closed source/package inventory, privately captured SQL, source drift checks,
  fresh creation/name/OID refusal, owner installation and exact function grants;
- actual non-owner login/privilege/ownership audit, denied escape probes, bounded
  preconnected clients and exact session READ COMMITTED checks;
- actual legacy enqueue/claim/nonempty scan/apply held before its watermark,
  with admission/update/unrelated canonical repository reply committed while held;
- scoped growth availability, last-watermark contention and deterministic native
  post-snapshot/pre-row-lock SKIP LOCKED slot race with reviewed instrumentation;
- update/root/reply orderings, root replay/Topic deletion, completion/forget,
  account and authority revocation, clear versus enqueue/post/update;
- actual legacy repository lifecycle methods through a local explicit envelope,
  plus rejection of the old implicit envelope when it changes semantic bindings;
- simple/extended literal COMMIT and unsupported/implicit/early/savepoint/nested
  protocol cases, including exact SQLSTATE and zero partial canonical effects;
- post-mutation authority/lease expiry, stale epoch, ambiguous/lost-response
  reconciliation, A/B/C replay, changed actor/proof rejection and erasure replay;
- exact body/title binary64 signed-zero wires and canonical IDs/authors/bodies/
  destinations, minimal retirement, proof erasure and final tuple assertions;
- bounded settlement, own-client closure, barrier restoration and
  exact creation-OID/zero-session cleanup without FORCE or foreign termination.

A named case or an implemented function is not evidence that its source review
is complete or that its native behavior has passed. Role/privilege and protocol
behavior are entirely not native-proved. Review the authoritative current module
and ADR before any later source or execution gate.

The planned scratch name is a single fixed constant, with no fallback to an old
reserved or owner database. HBA/credential/provisioning failure is a boundary,
not permission to alter the configuration or switch databases. This helper slice
authorizes no HBA, role, credential, native connection, runtime or crawler action.

ADR173 now replaces the old active-cluster endpoint/DPAPI plan with a fresh owned
cluster. The driver imports only builtins until the guardian's exact bounded
stdin handshake, authenticates ledger bytes before JSON parsing/path following,
and rejects SOURCE_STATUS before importing or starting the cluster. Actual
orchestration tests cover each refusal with zero later capability calls. A fixed
SQL-start marker lets the guardian's original monotonic clock enforce startup
including inventory/imports, without resetting at cluster construction. The new
cluster/guardian and complete source/binary freeze still require acceptance.
