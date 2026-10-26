# Synthetic Ridge validation cost screen — inactive

Default/import is inert. No migration registration, runtime dispatch, owner/native
database, model, vector asset, E5 or network action is included. No screen has
been run during implementation. Tests use only invented vectors and SQL sources.

Three prospective variants share the exact current007 candidate/384-coordinate
sequential dot/clamp/threshold/order:

- Original applied001–009 and actual007, unchanged.
- Full validation using a mechanically copied004 unit validator with only its
  per-coordinate/per-norm text finite tests replaced by strict ordered bounds
  `-Infinity < x < Infinity`. PostgreSQL NaN/Infinity behavior is checked in the
  actual isolated screen, not inferred from JavaScript comparison semantics.
- An intentionally **unsafe mock** projection copied after full prevalidation;
  it omits per-reference validation. It is NOT an integrity certificate.

The ordered-comparison variant retains candidate and every stored-reference
check, shape/lower-bound rules, sequential norm arithmetic, sqrt/tolerance and
error propagation.007's final dot finite check remains unchanged. Actual isolated
differentials cover±0, NaN/±Infinity, null/empty/null coordinate, wrong dimension,
non1 lower bound, multidimensional arrays, six tolerance-neighbor values,
subnormal/underflow/overflow behavior and SQLSTATE equality. These checks have
not yet executed; pure tests only verify exact source adaptations/fixtures.

Explicit future execution, only after root review:

    node --max-old-space-size=256 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js ./apps/local-service/portable/canonical-v4/experimental/ridge-validation-cost-screen-v1/run.js --run-isolated

Run that command from repository root.
The driver requires the guard and exact heap flag. It creates one own Worker,
one fresh in-memory PGlite with the existing local vector extension, and no
`dataDir`. No native server or connection is opened; nothing is written to disk.
The parent terminates only that Worker at30s total process CPU or60s wall, then
awaits its exit. Polling can overshoot by scheduler granularity; over-budget
results fail rather than being reported as a successful measurement. Each SQL
statement additionally has an8s limit. Heap256MiB is a Node old-heap bound, not
a claimed WASM/RSS/private-memory cap. There are no retries.

Synthetic sizes64/256/1024 grow in the same disposable engine using bulk O(N)
direct owner-SQL seeding, never O(N²) admission. Generated logical fixtures pass
the existing persisted-state validator before insertion. Sources, embeddings,
Topics/discussions, links, memberships, receipts and fixed-reference mirrors are
seeded consistently. The screen checks all reference unit vectors, actual
signed-zero storage and Source responses outside timing. It does not claim a
new complete canonical-storage certificate or native privilege/concurrency proof.

Fixtures deliberately use simple two-coordinate unit vectors with one signed-zero
coordinate, exact neighboring threshold scores and tied matches. This is a small
cost screen, not realistic dense-catalog or endpoint performance. Reference
validation cost on dense values could differ. Three timed repetitions per
variant/size rotate variant order. Timings include SQL call/result transport,
exclude fixture/prevalidation/migration setup, and compare ordered `float8send`
score bits against the invented exact oracle. No scores or vectors are printed;
only counts, hashes, timing samples and bounded diagnostic metadata are returned.

Finally, the screen corrupts one real synthetic reference parameter. Original
and full-validation fast variants must reject withP1204; the stale unchecked mock
must miss that corruption. This is why the mock cannot be activated without
separately proven protected integrity/completeness. Neither experimental function
replaces canonical007; the disposable engine is closed and discarded.

The output is one bounded≤16KiB JSON report on stdout, not a saved file. Failures
retain safe stage/SQLSTATE metadata where available, not SQL/parameters/stacks.
Root may deliberately persist an approved report later. No speed or equivalence
claim follows until the actual isolated screen is authorized and completes.

Pure tests only (no PGlite creation):

    node --test --test-isolation=none test.js
