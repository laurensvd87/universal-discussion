# ADR167 Native scoped ingestion proof

Date: 2026-10-20. Status: independently accepted for source-only implementation
after the bounded clarifications below. Native execution and production activation
remain separate gates.

Current endpoint amendment: ADR173 replaces the active-cluster55432/DPAPI boundary
below with a fresh owned PostgreSQL17 cluster at55433 and generated cluster-local
credentials. No active HBA edit or credential access will be used. Preserve this
decision's SQL, cases, grants, protocols, controls and exact scratch cleanup;
the original active-cluster provisioning paragraphs are historical.

## Outcome

Exercise ADR165 against actual PostgreSQL with multiple connections and real
non-owner logins in one fresh synthetic database. Prove complete new-policy
admission, addressed update and an unrelated canonical reply can commit while
an actual legacy enqueue/claim/apply transaction owns its lane and is held before
its final watermark. A fabricated leased row or a separately locked lane is not
that proof. Preserve existing discussion destinations and exact vector wires.

This is the next integration gate, not a substitute for actual hierarchy quality,
existing-Source migration, authenticated producer authority, UI integration or
the full goal. The owner runtime and running crawler are outside the fixture.

## Exact disposable boundary

Create only `murmingle_adr167_scoped_test_20261020`, owned by the existing
`murmingle_owner`, from template0 after proving that exact name absent. Record its
OID and refuse reuse. Bootstrap and seed actual canonical001–009, then install
the separately pinned ADR165 schema and boundary as owner. Do not weaken the
PGlite-only initializer to accept native connections. A new diagnostic installer
checks exact database name, creation OID, current_database, schema owner and all
source hashes before mutation. No applied migration or held experiment edit.

Use loopback127.0.0.1:55432 and the established fixed-role DPAPI password provider
for postgres, murmingle_app, murmingle_crawler_submitter and murmingle_ingest_worker.
No raw credential, environment credential, new login, HBA edit, database restore,
live-store query or service/crawler action. If existing HBA or roles reject the
scratch connection, stop and report that boundary rather than editing them.
Use existing admin authority only to provision and observe this scratch database.

The completed read-only feasibility check found the proposed name absent, but
the complete14-rule HBA inventory rejects it at the loopback reject rule. The
old explicitly allowed test name is already occupied and must not be reused.
No database creation or serving connection was attempted. A separate owner
approval request for a temporary exact-name loopback rule and byte-exact restore
is pending. This source decision authorizes no HBA edit/reload. Keep native
execution gated until that separate boundary is reviewed and approved.

All sessions use explicitly checked READ COMMITTED. Bound the diagnostic to
eight client connections, SQL statements to5s, lock waits to3s and each observed
barrier to2s. Preconnect all clients and seed all fixtures before opening a
measured barrier. Tests of deliberately held transaction deadlines use at most2s
authorities/leases, never extend the original deadline or claim physical-WAL
deadline enforcement. Stop admitting cases at165s; the180s SQL wall limit reserves
15s for awaiting actual outstanding statements and releasing own barriers,
rollback and client closure. Allow15 further seconds only for checked database
cleanup; retain and report on uncertainty. No unbounded pool.end wait. The
controller must release its exact barriers in finally and close every client.
Timeouts are failed
observations, not permission to start another diagnostic or terminate a foreign
process. Run Node with256MiB maximum old-space; bound its observed RSS to512MiB,
CPU to30s, report to256KiB and named cases to64. Check these ceilings before every
case and at bounded controller observation intervals; loops and output encoders
also have explicit finite input bounds. Exhaustion is failure, never a rerun.
Keep resource use separate from live crawler performance claims.

Revoke PUBLIC CONNECT, CREATE and TEMP only on this newly created database;
grant CONNECT only to its owner and the three existing serving logins. Revoke
PUBLIC CREATE on its public schema. The scratch-only grant manifest enumerates
the exact new scoped functions needed by app/worker/submitter, not all private
functions. New arguments remain synthetic actor/producer fixtures and do not
prove API authentication. Existing canonical wrappers keep their original grants.

Before any serving mutation, audit actual session_user/current_user, LOGIN and
superuser/CREATEROLE/CREATEDB/REPLICATION/BYPASSRLS flags, role memberships and
owner SET ROLE escape, inherited privileges, database CREATE/TEMP, schema CREATE,
owned objects, table/column/sequence mutation and private function EXECUTE.
Probe CREATE TEMP, CREATE SCHEMA, protected table DML, private helper invocation,
SET ROLE owner and replication-role setting from actual serving connections;
each must fail. Scratch grants must not change global role membership or any
other database's grants. Owner SET ROLE is provisioning, never serving evidence.

Cleanup closes only clients owned by this invocation, checks exact name plus
the recorded creation OID and zero remaining sessions, then drops that database
without FORCE. Never enumerate databases for deletion, terminate other sessions
or drop a pre-existing database. Report a retained scratch database if safe
cleanup cannot be proved. The synthetic fixture is disposable; no owner data is
removed and no recovery/rollback claim follows.

## Accepted cooperative watchdog contract

The global controller is accepted for source-only implementation with sampled
event-loop limits, not an independent OS scheduler or instantaneous CPU cap.
Arm one monotonic absolute epoch before inventory, client factories and work;
do not restart its clock when constructing Run. On any fault, close work
admission immediately. SQL cleanup ends at the earlier of faultTime+15s and the
original180s boundary. Checked DROP has at most15 additional seconds and never
extends beyond195s from the original epoch. An early fault does not create a
longer cleanup allowance. The measured2s barrier checks likewise refuse success,
not prove that a timer physically cancelled a query.

Separate private AsyncLocalStorage work and cleanup capabilities. Every actual
SQL dispatch must check a valid lane and its current absolute deadline immediately
before raw.query; a late work continuation cannot borrow cleanup authority after
a rejected Promise.race. Retain each actual query until physical settlement and
observe all late rejections. Reserve an already connected controller within the
eight-client ceiling for checked DROP and confirmation. Ordinary post-provision
work cannot occupy it. The independently accepted source refinement removes
PID-based SQL cancellation entirely: checking backend identity before
pg_cancel_backend(pid) does not make that cancellation atomic against PID reuse.
Await the actual establishment/setup/query promises within the same original
cleanup deadline; no fresh allowance is granted per operation. Configured5s
statement/3s lock timeouts are not proof of client promise or socket settlement.

Stopping new dispatch is not stopping or cancelling existing server work. Await both physical
queries and the original work continuation before making DROP eligible. A timed-
out establishment, an unsettled work/controller query or ambiguous acquisition
requires retained/unknown cleanup; a zero-session observation alone cannot erase
that uncertainty. If an issued DROP outlives its client deadline, report its
outcome as uncertain rather than asserting either successful removal or definite
retention. No detached DROP or post-timeout success claim is permitted.

A final195s exit may fail only this diagnostic invocation as a last resort. It
does not prove server cancellation, socket drain, normal cleanup or an independent
hard wall. Full source/native acceptance requires injected virtual-time and lane
tests for early faults, late continuations, cleanup-lane isolation, every dispatch
deadline, pending physical work, busy/absent controller, uncertain establishment
and late DROP. SOURCE_STATUS stays closed until full review and all earlier
provisioning/owner gates pass. No HBA or native action follows from this design.

## Instrumentation and concurrency evidence

Fixture-only owner instrumentation may replace the private copied legacy apply
body at one unique, hash-checked pre-watermark marker. Its only added statement
waits on a fixed diagnostic advisory barrier `(914092167,1)`. Retain the actual
legacy enqueue, claim, scan and mutation. Record before/after function digests
and prove the replacement is exactly the declared insertion, not altered logic.
The root source files and canonical001–009 remain unchanged. The controller's
session advisory lock and observed pg_blocking_pids/wait graph prove arrival.
An independent NOWAIT lane probe must fail55P03 while this actual apply is held.

While held, enqueue and complete an unrelated new-policy admission and addressed
update, then execute the actual canonical runtime repository reply. Assert their
committed receipts and tuples before releasing legacy apply. Observe that the
legacy backend still waits at the barrier. Release, await its real receipt and
verify all outcomes and strictly advancing watermark revisions. The legacy
reply uses a Topic and Discussion disjoint from BOTH the updating Source and the
held legacy apply's affected destinations/rows. Record these synthetic IDs and
verify actual domain locks so intended same-destination serialization is not
confused with global coupling.

A separate fixture-only scoped pre-publication barrier `(914092167,2)` proves
another new enqueue can commit while scoped completion is held, and a short
independent growth-lock transaction succeeds. Deliberately hold the real
watermark last in another case and observe only the expected publication wait;
release it before lease expiry and record final tuples. Never remove a real
authority, Source, actor or destination fence merely to make a race pass.

Exercise both orderings of update/root/reply; root replay/Topic deletion;
completion/forget, account revocation and authority revocation; and clear against
enqueue/post/update. Use server wait graphs or committed first outcome rather
than sleeps as proof that an operation reached its intended boundary. Assert
atomic outcomes, minimal retirement and no resurrected Source/job/proof. Verify
actual existing lifecycle repository/router methods with a local explicit
transaction-envelope adapter; also record that the old implicit envelope fails
when it touches scoped bindings. Do not silently change production consumers.

Reproduce the slot snapshot race using two actual connections: hold the selected
slot row in one transaction, start the candidate-selection statement with its
old occupancy snapshot, commit an occupant before row-lock acquisition, and
observe the fresh occupancy statement reject that candidate and choose another.
The fixture barrier must be INSIDE the candidate-selection statement after its
snapshot is established and before row-lock acquisition. A preceding PERFORM is
not sufficient: the next READ COMMITTED statement refreshes its snapshot. Review
the exact volatile/MATERIALIZED instrumentation and native plan before execution;
holding the row alone with SKIP LOCKED does not establish this schedule. Preserve
the original core selection predicate and use no old in-memory conflict injection.
Record native isolation and actual distinct slots. Bounded exhaustion is still
covered separately; native timing is not a throughput guarantee.

## Protocol and lifecycle cases

Use pg's actual simple and extended protocols. Test separate literal COMMIT and
COMMIT; success, unsupported variants, implicit completion, early SET CONSTRAINTS,
savepoint recovery and the nested-trigger counterexample, checking exact SQLSTATE
and zero partial canonical effects. An owner-created callback is adversarial
fixture instrumentation; serving roles must not be able to create it.

Hold after mutation and before literal commit to verify authority/lease expiry
rolls back Source/history/bindings/receipts. Exercise stale epoch after reclaim,
lost-response reconciliation without repeating mutations, A/B/C replay without
rewind, changed actor/proof conflicts, and replay after every erasure path.
Compare canonical post IDs/authors/bodies/destinations and exact binary64 body and
title array_send bytes, including negative zero. Report every required case as
passed, failed or not executed; no partial pass becomes activation acceptance.

## Source and execution gates

After design review, Platform owns a new native check module, focused invented
adapter tests and README under
`apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-native-v1/`.
Root owns this ADR, the exact-name diagnostic driver under apps/local-service/data
and the later sanitized result receipt. The check module is inert on import and
refuses any database other than the freshly minted checked fixture. No passwords,
untrusted SQL, model, browser, provider or production store parameter is accepted.

Root and independent Trust inspect complete source, run guarded tests and verify
the literal source allowlist before any native execution. Capture a fixed source
and package-code inventory, exact SQL buffers and their hashes, including all
executed local transitive imports and dependencies. Check ordinary source drift
before installation, each case group and after cleanup. Install only captured
SQL buffers after validating owner, fixed search_path and exact function grants.
Never traverse an old experiment's generated output as code. Root alone invokes
the reviewed driver once; uncertain observation reconciles the same process and
scratch OID, never retries the mutation. A closed actual run is immutable. A
failed run needs a new reviewed correction decision, not an automatic rerun.
Only sanitized named-case outcomes, bounded timings/wait graphs, exact synthetic
receipts/wires, source digests and cleanup status may be retained. No credentials
or arbitrary server error/parameter dumps. Wait graphs retain only own backend
PIDs, own blocker PIDs and finite wait-state classifications; never query text,
pg_stat_activity.query, parameters or unrelated connection metadata.
