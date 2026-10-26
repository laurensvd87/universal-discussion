# ADR171 Isolated PostgreSQL HBA window

Date: 2026-10-20. Status: root and independent Trust design accepted for
source-only implementation. The owner explicitly approved a temporary rule for
the new isolated database, configuration reload without restart, and exact
restoration. Actual HBA action still requires complete source and restoration
review; the native proof remains hard-closed until its own gates pass.
The in-place publication design below is now rejected for actual Windows use:
new connections may read intermediate bytes. No HBA mutation has occurred.

## Exact approved change

The active HBA file is `D:/PostgreSQL/17/data/pg_hba.conf`, confirmed through the
existing protected local administrator login. Its original SHA256 is
`aec15425b33033973c99f3e97670437238744f03cde204d544d3835654ee5781`.
Prepend only this literal rule, preserving every original byte as the suffix:

```text
host murmingle_adr167_scoped_test_20261020 postgres,murmingle_app,murmingle_crawler_submitter,murmingle_ingest_worker 127.0.0.1/32 scram-sha-256
```

No IPv6, remote address, wildcard database, new role, trust authentication,
membership, live database or crawler change is authorized. PostgreSQL is an
existing diagnostic administrator login; the three other names are the existing
serving logins. Owner provisioning uses SET ROLE, not an extra owner login.
The occupied older test database remains untouched. No restart is needed.

## Held file lease and authenticated recovery

The root-owned Windows guardian must open only that existing ordinary file as
ReadWrite with FileShare.Read, denying concurrent write and deletion. Verify
nonreparse ancestors, stable volume/file identity and pinned original bytes
through the same held handle before mutation. All writes, truncation,
Flush(true), rereads and restoration use that handle; no path reopen or file
replacement is allowed. A separate isolated proof must show that the lease
permits reads while rejecting foreign write/delete attempts.

Before the first write, persist a create-new, access-restricted, bounded recovery
record outside HBA, flush it, and record original bytes, original/proposed hashes,
file identity and finite phases. Original bytes must match the independently
pinned hash above, never merely a hash supplied by the record. Record each phase
before advancing. Do not print original contents, arbitrary paths or raw errors.
Reject encoding/BOM ambiguity and unknown current bytes or file identity.

An in-place held-handle write is not atomic replacement. PostgreSQL17 on Windows
applies changed HBA bytes to subsequent new connections immediately; avoiding
external reloads cannot prevent a crawler or application reconnect from reading
an incomplete write. The lease denies foreign modification, not reads. Therefore
the reviewed pure state machine does not authorize this publication method on
the active cluster. The owner's exact-rule permission does not authorize
incidental cluster-wide authentication disruption. A separately reviewed atomic
publication method or a separate owned test cluster is required before execution.
See the [PostgreSQL17 HBA documentation](https://www.postgresql.org/docs/17/auth-pg-hba-conf.html).
The recovery record must survive power loss or forced guardian termination;
neither the lease nor a successful pure test proves recovery from those events.

## Bounded child and restoration sequence

Verify every native/source gate before opening the window. Write, flush and
reread the proposed bytes; perform fixed reload and complete parsed-rule checks.
Physically close the guardian's administrator socket before starting the one
fixed reviewed native child, which may use all eight diagnostic clients. No
second child, fallback database or unbudgeted ninth connection is permitted.

A timeout is not child, socket or server settlement. Any child stop mechanism
must affect only the guardian's exact owned process/job and await settlement.
The guardian has finite lease, receipt, child and restoration deadlines. Its
finally path restores verified original bytes under the held lease even after
child failure. If the child is unsettled, restore file bytes but do not open a
potential ninth reload connection; retain recovery and report active policy
unknown. Never overwrite unexplained foreign state.

Keep file restoration and active server policy restoration separate. A true
pg_reload_conf result proves that a signal was accepted, and pg_hba_file_rules
parses the file; neither alone proves the active authentication policy. Required
later native checks must distinguish these outcomes. Failed parse, reload,
identity verification or physical settlement cannot become complete rollback.

Recovery is a separate no-child mode. Reacquire the same exact lease, authenticate
the record against the independent original pin, and accept only the recorded
original or proposed bytes. Unknown identity/content requires reconciliation,
not automatic overwrite. Reload and active-policy proofs remain explicit.

## Ownership and validation

Versions owns only two new pure files under
`apps/local-service/portable/canonical-v4/experimental/hierarchy-scoped-native-v1/`:
`hba-window.js` and `hba-window.test.js`. Root owns this decision and a later fixed
Windows guardian under `apps/local-service/data/`. Pure code receives trusted
lease, receipt, reload and child capabilities; it opens no file, socket, process
or credential on import. It accepts no arbitrary path, SQL, database or role.

Test partial writes, receipt failures before mutation, failed reload, absent or
unknown active-policy proof, child failure/nonsettlement, identity/hash drift,
duplicate invocation, restoration/recovery failure and strict socket sequencing.
Use actual state-machine code with invented capabilities. These tests do not
prove Windows sharing semantics, physical child settlement or PostgreSQL reload.
Those checks and full guardian/source review precede any HBA action or native
proof. No provider, browser, model or live activation follows from this decision.
