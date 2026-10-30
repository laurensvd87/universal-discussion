# ADR-231: Measure compressed-write space before another full recovery

Date: 2026-10-30

The one ADR230 full attempt exits1 at retained primary C free-space floor
2138091520 bytes, with cleanup observing2137894912. It records194 complete numeric
samples:192 COPY observations and one index observation. Last validated aggregate
Job CPU is229.609375 seconds, including206.140625 user and23.46875 kernel seconds;
this is not per-process attribution or proof of a speedup over the earlier run.
Full restoration, migration, HTTP and browser acceptance remain absent.

The failed cluster's final read-only census reports2477490774 logical bytes and
2072903680 allocated bytes. Available C space falls much more than that reported
allocation. The pagefile remains3668MiB allocated. Exact retired PGDATA is
2477439099 logical bytes; eight original control/progress pins remain unchanged.
Free C space returns to roughly6.8GB after disposition. These volume observations
do not identify the discrepancy's filesystem or host cause.

Before a new full native attempt, run one separate public synthetic filesystem
probe. Compare one plain deterministic-random file with compressed random and
compressed zero files, each8MiB, total24MiB. Observe free C bytes and the same
FileCompressionInfo size before writing, before durable flush, after Flush(true)
and after close. All phases retain the same file handles and verified compression
modes. Record numeric metadata only. A detected reservation pattern establishes
that behavior for this probe, not the complete PostgreSQL failure's cause.

The fixed SourceCheck mode compiles declarations and tests nine path guards
without native calls. The distinct actual switch creates only one fresh private
nonce directory below the existing owner+SYSTEM parent; it never adopts a prior
run. Cleanup checks exact root/file identities, closes the original stream, removes
only the three fixed public files and deletes the empty directory without recursive
removal. Any identity mismatch refuses cleanup and is recorded. Retain a bounded
exclusive receipt on D. Sampled30-second budget and original C2/D4GiB and physical/
commit1GiB floors remain. No archive, database, live service, pagefile or host
settings are changed. A separate Root ONE execution decision is required.

ADR230 source/catalog/output and both failed full attempts remain immutable.
There is no successor full-run permission, automatic retry, cap increase or
partial-data substitution. The full hierarchical matching goal remains active.

## One public actual probe

The fixed SourceCheck passes9 guards and compiles declarations without native
calls. Separate Root decisionce10076a...e1c3b5 authorizes one actual probe. It
exits0 with15 observations, no failure and successful cleanup; Root independently
verifies the fresh root absent and source pin unchanged. Source11282 bytes hashes
`1fc8ffaa8df200228fab8d978cbdd72e9074b30653f03946225f42e9568c3a44`;
receipt hashes`2b3ac7db6b3987c4566f3de1e0dca5f4910e1b36a9e64dc3b4b79a105534db90`.
Root audit hashes`3e54e813f0920dc7f1308265c922567e5c8ad0e7b912fc6d553e1799ddecc4c2`.

| Public8MiB case | Available C debit before durable flush | Reported compressed bytes then | Available C debit after flush | Available C debit after close |
| --- | ---: | ---: | ---: | ---: |
| Plain random | 9371648 | 8388608 | 9371648 | 8388608 |
| Compressed random | 17793024 | 8388608 | 17793024 | 16809984 |
| Compressed zero | 17797120 | 8388608 | 9408512 | 8425472 |

After durable flush the zero file reports983040 compressed bytes. After-close
samples retain free-volume values only, not post-close file allocation. Counters
are point observations with other host activity possible. They reproduce a marked
available-space discrepancy for these compressed controls; they do not identify
a reservation/quota mechanism or establish the full PostgreSQL failure's cause.
An uncompressed candidate is justified for review by the observed plain control;
no full PostgreSQL compatibility, fit, speed or semantic readiness follows.
