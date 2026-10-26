# Isolated native scoped ingestion proof

Source is accepted by root and Trust:115 guarded Node tests and108 Python AST
checks pass. Native execution, source freeze and preparation remain separate
gates. ADR173 replaces active-cluster access with a freshly initialized owned
PostgreSQL17 instance at127.0.0.1:55433. The live server at55432, its HBA,
credentials, databases and crawler are never used by this proof.

`cluster.js` owns only a fresh `adr173-` directory under portable/data/
scoped-native-isolated. It generates cluster-local SCRAM credentials in RAM and
sets them offline through stdin without SQL logging. Bootstrap must physically
close before handing off the fixed eight-client connector. Existing ADR167 SQL,
case schedules, role audits, binary64 assertions and exact scratch-OID cleanup
remain authoritative. A serving connection proves synthetic login separation,
not the production account configuration.

`supervise.py` authenticates a fixed reviewed source-ledger FILE SHA256 before
following any source name. The ledger and separate freeze bind the complete
source/package closure, fixed binaries and resource limits. The root driver
imports only Node builtins before an exact bounded stdin handshake. The guardian
assigns that captured child to its own Windows Job, verifies membership and only
then releases the handshake. Node is not suspended; its preassignment runtime
bootstrap is outside the Job accounting/containment guarantee.

The outer limits are startup120s, SQL195s (including its existing cleanup),
smart-stop20s and reporting25s. SQL statement5s/lock3s/barrier2s and eight clients
are unchanged. The guardian limits aggregate CPU to60s and Job/tree memory to
1536MiB, with512MiB fresh generated data and420s final wall including emergency
cleanup. The actual SQL controller retains its separate512MiB RSS/30s CPU limits.

Normal success requires all native cases and source endchecks, actual client and
callback settlement, checked scratch removal, exact postmaster ownership recheck,
smart stop, physical process exit and an empty Job. Timeouts never prove physical
settlement. Emergency termination targets only the guardian's owned Job and is
always failure. No recursive cleanup exists; retain stopped cluster metadata and
protect that directory because its catalog contains credential verifiers.

Root owns the driver, ADR173, this README and later source/freeze/evidence metadata.
Versions owns cluster.js and cluster.test.js; Matcher owns supervise.py and its
source-only supervise.test.py. Complete root/Trust source review and guarded tests
precede one prospective freeze and one actual invocation. Source acceptance
does not itself execute or activate anything.
No model, browser, provider, public collection or production activation follows.
