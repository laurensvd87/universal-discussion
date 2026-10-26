# ADR-144: Bounded late-renewal receipt recovery and crawler diagnostics

Date: 2026-10-20. Status: reviewed source and separately sealed crawler-only
package; NOT activated. The running old-operator crawler must stay running.

## Evidence and limits

Crawler43012 self-exited on service-unavailable/renewal-error after221 ingestions.
Its exact11-stage audit found one complete durable receipt with the matching
Source URL and ten never queued. The lost underlying SQLSTATE was not retained.
The renew/apply functions share lane-before-job locking; no inversion was found.
Contention is plausible, not a proved historical cause.

Crawler40344 later self-exited on timeout-leased after22 ingestions. Its exact13
stages were twelve never queued plus one authority-revoked cancellation without
receipt or any Source for its URL. After independent review, only that definite
failed local stage was retired using the existing checked terminal API. The other
twelve remained byte-identical and all accepted progress remained intact. The
minimal audit is data/crawler-terminal-stage-disposition-20261020.json. One normal
unchanged-operator resume4368 started10:20:07 Berlin and ingested those twelve.
No active crawler was interrupted and no canonical records were changed/replayed.

A read-only probe of an actual crawler-role connection found statement_timeout
1min and lock_timeout5s, application_name murmingle-crawler. The earlier owner-role
5s statement timeout was not a crawler setting. No GUC was changed. Existing
worker logs include an apply-uncertain duration536842ms near revision31837; that
wall-clock observation alone does not establish SQL execution time, lock cause,
SQLSTATE, host suspension or either historical crawler failure's exact cause.

## Narrow recovery

The source client privately brands only an actual storage-failure thrown by
renewAuthority. Its existing first exact-status recovery remains unchanged.
If the same original failure survives, await existing best-effort revocation.
Only literal false or uncertain revocation permits ONE additional exact
operationId/operationDigest status read. Accept only a complete receipt through
the unchanged strict v4 decoder and generation/revision checks. Otherwise retain
the original renewal failure. Abort wins before/after all recovery boundaries.

Definite successful or malformed revocation, false renewal, forbidden/corrupt/
conflict errors, terminal/invalid first proofs and timeouts do not gain this read.
No reenqueue, authority renewal, lease extension, timeout increase, old-job replay,
provider call or general retry follows. This handles one proven-completion race;
it does not promise continuous success or fix arbitrary timeout-leased failures.

## Separate checked package

New data/crawler-late-renewal-overlay-v1 contains a crawler/preflight-only inert
operator, copied client, query diagnostics and tests. The copied client differs
from the reviewed worktree source only in four imports redirected exclusively to
the original checked snapshot. The full existing base seal verification remains,
including the ORIGINAL operator in EXTERNAL_FILES. No active snapshot, operator,
applied001–009, service, worker, dashboard or unrelated dirty code is replaced.

Base seal a1d301bc315ed497832b9aba60ecfeb79aa1b28f43678b91e6f1155c3f09909d.
A separate overlay-manifest pins exactly four files and the original base/operator
identities. Preflight reads files only; a later crawler start requires the normal
no-duplicate and durable-stage disposition audit. Do not interrupt4368 merely to
load this package. The future reviewed model-cutover restart grant is unconsumed.

Diagnostics wrap three literal raw query operations before repository error
masking: renew, status and revoke. Emit only fixed operation/outcome, allowlisted
SQLSTATE/Node code or other, and bounded duration. Never emit SQL, parameters,
operation IDs/digests, authority tokens, URLs, content, raw error text or stacks.
Separate budgets retain128 failure and32 success events; fast status successes
are omitted and aggregate dropped counters are bounded. Startup reads only the
five approved role/database/application/timeout fields on one actual session.
No SET, credential logging or all-pool-session attestation. Sync/async diagnostic
sink or clock failures never replace query results/errors or await the sink.

## Checks

Root and independent review accepted the21 source-client tests. The package's12
pure tests check import-only copying, unchanged external seal verification/state
paths, inert CLI, exact-query labels, secret canaries, error/result identity,
separate budgets and synchronous/asynchronous sink non-interference. Root reran
all33 together under the external-capability guard:33pass. This is source/package
evidence, not historical-cause proof or live recovery success.
