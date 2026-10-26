# ADR146 native finite-validator proof — inactive

Four NEW files; no activation or existing-source changes. Defaults are inert.
No native server, utility, connection or model runs during the pure test suite.
Actual execution requires root/Trust review, a root-written fixed source freeze,
then the explicit owned supervisor. No command here creates a freeze or retries.

## Reviewed lifecycle reuse

The unchanged `../hierarchy-shadow-isolated-postgres.js` helper supplies its
existing `--run-isolated-server` lifecycle. Its ADR132 directory/marker names
identify ownership machinery, not a claim that this is the old study. It creates
a fresh random D: directory and private cluster, generated password held in RAM,
local authentication `reject`, host SCRAM, offline password setup, then127.0.0.1
on an ephemeral port explicitly excluding55432. No owner cluster, HBA, service,
DPAPI, stored credential, crawler or application is accessed.

Before callback use, that helper binds SQL data_directory/port/start time to its
captured postmaster PID and ownership marker. It creates its fixed scratch DB
only inside that proven new instance. After checks it closes its own pools,
rechecks marker/PID/start proof, uses only smart stop, awaits postmaster exit and
retains the stopped directory plus metadata-only lifecycle evidence. No recursive
deletion exists. This wrapper does not weaken or override the helper's identities.

The lifecycle helper alone has cooperative limits; the new outer Job supervisor
is essential. Node waits for Job assignment before importing/invoking it. That
Job includes initdb, single-user password setup, postmaster and descendants.
No breakaway is enabled. Installed PostgreSQL17.11 and pgvector0.8.2 files are
read-only byte-pinned (binaries, vector.dll, control and install SQL); nothing is
downloaded, installed, copied over an existing server or globally configured.

## Resource and failure boundaries

Node old heap256MiB; Job commit768MiB and conservatively summed RSS/private768MiB.
Shared DLL pages may be double-counted in summed RSS. Aggregate CPU60s uses
JobObjectBasicAccountingInformation class1 TotalUserTime+TotalKernelTime divided
by10,000,000; exited utilities remain included. Supervisor CPU is added separately.
Wall180s, active150s, reserving30s for final cleanup/evidence. Each lifecycle SQL
connection already has10s statement/lock timeouts; no production timeout changes.

Continuous preflight/monitoring requires host physical/commit1GiB and C768/D512MiB
free. Child TEMP/TMP point only to fresh retained D output/temp. Owned cluster
plus temp/output are bounded512MiB/8192 entries, with no reparse traversal. The
fixed old run-parent directory is baselined by names only; existing directories
are never walked. A single new valid-name/marker directory is metadata-budgeted
from startup and must match the final lifecycle result. Another concurrently
created experimental directory causes conservative failure, never deletion or
process action. The marker discovery is NOT the later SQL/PID ownership proof.

On normal completion the helper must prove smart stop and the Job must be empty.
Only bound/cleanup failure permits emergency termination of the captured assigned
Job, and that ALWAYS produces failure, never graceful-success evidence. Before
assignment, only the exact captured handshake-blocked Node may be killed; it
cannot yet invoke native code. Empty-Job and child exit proofs are required.
Monitoring is sampled, not an impossible zero-overshoot disk/RSS/CPU guarantee;
final exceedances invalidate success. Hard Job commit/kill-on-close also bounds
escape on supervisor failure. Cleanup failures retain bounded metadata and the
fresh directory for root inspection; nothing targets an unrelated PID or port.

## Source freeze and output

`freeze.json` is absent during implementation. Root may create it after review:

    {schema:'ridge-finite-native-source-freeze/v1',sourceHashes,binaryHashes,
     settings,freezeHash}

Fields are in that order; freezeHash=SHA256(JSON.stringify(object excluding
freezeHash)). `sourceHashes` must exactly match exported112 literal SOURCE_KEYS;
`binaryHashes` exactly BINARY_PINS; `settings` exactly SETTINGS. Node/Python lists
are tested equal. The closure pins nine migration files, unchanged lifecycle/db/
index and relative dependencies, frozen cost-screen helpers/tests/docs, reviewed
supervisor provenance, ADR146, new four files, package manifests/lock, and58 fixed
installed pg-client JavaScript/JSON files. A source-only resolution test walks49
runtime files, including package-resolution metadata, pg-pool, pg-connection-string,
the pg ESM entry, and pg-protocol parser/serializer/messages/buffer helpers. The
Cloudflare-only transport and unselected optional native branch are excluded:
the isolated Windows Node path uses neither. There are no receipt-supplied paths.
This is a current-byte chain, not attestation of arbitrary already-loaded modules
or every Windows/Node shared library. Initial buffers and fresh final rechecks
remain mandatory; migrations/clones use the SAME captured SQL buffers.

After root review only, from repository root:

    python apps/local-service/portable/integration/ridge-finite-native-v1/supervise.py --run-isolated-server

The exclusive output directory, started marker and wx results forbid replay,
including failures. No default invocation reads freeze/artifacts/DB. Native use
does not import the deny-network guard because its single proven private server
needs loopback TCP; sources expose no host/path/password/SQL override. Environment
credentials/NODE_OPTIONS/NODE_PATH are not forwarded.

Reports retain hashes, counts, timings, all differential outcomes, lifecycle and
resource/cleanup evidence—never passwords, SQL parameters, vectors, raw utility
output or stacks. Result≤64KiB, each log≤64KiB. Both helper and wrapper persist
their own metadata; supervisor links actual result bytes, including available
failure results. No model, E5, real page or owner Source data is involved.

## Synthetic proof

Apply actual captured001–009 to the newly created empty scratch database. Install
only separately named experimental functions. Compare original007 against frozen
cost-screen's exact004 text-finiteness→ordered-comparison adaptation; retain all
other shape, validation, norm, dot, clamp, threshold and ordering operations.
There is no unchecked mock or certificate shortcut in this native comparison.

All22 scalar-validator and request-scan cases compare outcomes/SQLSTATEs. Existing
subnormal/underflow/overflow failures must remain errors, not “supported” inputs.
Seed1024 logically validated sparse Source/topic/discussion/embedding/link/
membership/receipt/reference fixtures, at most32 rows/2MiB each. Dense reference
rows are generated and discarded per chunk—no60MiB dense JSON graph or clipping.
The source fixture is synthetic; it is not a complete new storage-integrity proof.

For sparse/dense families, atomically select64/256/1024 active fixed references;
inactive references and Topic mirrors become NULL. Sources stored remain1024,
reported separately from active references; that fixed-table cost is not hidden.
Both families run threshold-axis and dense candidates, three rotating repetitions.
Timings include SQL call/result transport, not seeding/prevalidation/traces.
Outputs compare ordered IDs and exact float8send bits. Separate all-score clones
replace only the threshold branch with true for diagnostic trace equality; they
are NOT acceptance functions. Threshold neighbors, ties, actual input/stored -0
transport, dense accumulation and malformed stored-referenceP1204 are checked.

This is native synthetic equivalence/cost evidence only, not real catalog/endpoint
performance, production activation, privilege/concurrency proof or hierarchy
quality. Nothing changes matching geometry or confidence thresholds.

Pure tests, from repository root (no native action):

    node --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./apps/local-service/portable/integration/ridge-finite-native-v1/test.js
