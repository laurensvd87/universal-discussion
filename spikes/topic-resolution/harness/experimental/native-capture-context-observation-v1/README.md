# ADR213 single context observation prototype

SOURCE behavior only: no collector integration, lifecycle relaxation, native
provenance, execution entry or actual-study permission.

`createCaptureContextObservation()` returns one callable. Its command forms are
`slot('navigation', original, symbol, site, state, balance, urlRelation)`,
`slot('terminal', original, symbol, site, predicate, frameRelation, mainDetached)`,
`slot('selectPrimary', original, symbol)`, `slot('selectCleanup', original)`,
`slot('release')` and `slot('retainedBytes')`.

Every actual first-global catch must synchronously select at its existing latch,
including unrelated and cleanup-first failures. A selection before a claim
blocks all future claims. Primary selection succeeds at most once, with exact
`Object.is` original and Symbol identity. Invalid context/projection is sticky
null. Errors and bindings are never inspected. Release permanently clears the
holder; a previously issued frozen view remains caller-owned. There is no refund.
Claims only validate and pack, then return without allocating any view. Matching
primary selection consumes eligibility and clears retained original/binding
before constructing the sole view. Nested primary/cleanup selection returns null
without replacing the outer selected first primary. Reentrant release revokes
the outer result. Projection fault consumes selection permanently, with no retry.
Primitive Symbol bindings include globally guessable `Symbol.for` values; matching
them is not private issuance proof. `Object.is` distinguishes signed zeros and
matches NaN. Exact arities including command are7/7/3/2/1/1 in the order above.
Malformed claims latch sticky null; malformed selections still consume. Arity
uses only scalar `arguments.length`, never retains/traverses an arguments object.

Navigation data constraints reproduce the old schema, not its native authority.
Terminal data has exactly six legal tuples: CDP frame main / parent-absent /
parent-mismatch, CDP within main, PW main-detached / main. CDP mainDetached is
null (unexamined); PW is true / false respectively. A future port must preserve
typed-main-before-parent and PW-detached-before-main evaluation order, actual
private terminal gates, Symbol-to-owned-article binding, and first-global order.

## Logical lifetime inventory

The full256 remains reserved in every state, including release and issued views.
Control128 covers one callable and at most eight scalar/reference cells (actual
persistent cells: phase, first, bound, packed, view). The separate128 allowance
covers the sole view (maximum six fields:64 header +48 slots =112) plus at most16
scalar decoding scratch. Actual views have five fields. The claim frame has
returned before view allocation; context is a single packed scalar. No per-instance
helper closure, argument rest array, descriptor map, enum array or copied record
is allocated. Projection failure keeps no partial view or replacement error.
Shared literal decoder functions/enums are code, not per-instance payloads.
These are explicit logical allowances, not measurements of JavaScript heap use.
Named-parameter clearing is not used as lifetime proof: strict-mode unmapped
arguments indices can retain incoming values independently. The later selection
frame has only already-owned original/Symbol identity inputs. VM-frame and
arguments-object overhead remain outside this logical metadata inventory; no
physical heap bound, reference reclamation or garbage collection is claimed.
The retained original is an opaque identity reference, not a claim that arbitrary
thrown object graphs cost256. The external global-first-error owner must separately
account for and release those graphs. Decoder scratch is at most two numeric
parameters at once (makeView plus one shared literal decoder); no field-selector
parameter or intermediate normalization container remains live beside the view.

Wire-projector copies, surrounding diagnostics and transport allocations are
outside this proof. Tests of invented envelopes do not prove actual collector
32768-byte overlap. A future port needs its own complete source/lifetime review,
unchanged full collector fixtures and700/900/1024 transport checks. It must replace
the old256 holder genuinely, not retain two candidates or claim released views
have been reclaimed. This prototype imports no frozen source or runtime helper.

## Source-only verification

Run from the repository root:

```powershell
& 'C:\Program Files\nodejs\node.exe' --max-old-space-size=96 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test-isolation=none --test --test-concurrency=1 ./spikes/topic-resolution/harness/experimental/native-capture-context-observation-v1/observation.test.mjs
```

The test authenticates fixed v19 list/map FILE hashes before decoding/following
their128 literal CODE keys, authenticates all128 before frozen imports, and
rechecks all end pins. It runs the complete unchanged26-test frozen driver entry
plus prototype tests. The old navigation cross-product independently checks450
inputs against the actual frozen projector (96 valid). The terminal Cartesian
matrix admits exactly six tuples. Signed zeros, NaN, all falsy originals, wrong
same-description Symbols, preclaim/cleanup selection, projection fault/reentry,
exact arity, zero view construction in claims, later selection-only projection,
nested selection ownership, unsafe zero-hook values, issued-view ownership and permanent release
are exercised.

A test-only external union projector delegates every nonunion field to the
authenticated frozen projector; the actual collector still rejects terminal
union views. All six views cross the real driver's JSON-text boundary without
changing that boundary. Finite stage/RPC dimensions and independently validated
maximum cleanup length give a terminal capture maximum599 UTF8 bytes, with
driver and generic-refusal envelopes within900/1024; unchanged driver fixtures cover existing
diagnostic variants. These are wire-data/source tests, not actual callback wiring,
terminal revocation evidence, native quality or collector aggregate proof.
