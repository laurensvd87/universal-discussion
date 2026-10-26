# ADR206 Exact article navigation observation

Date: 2026-10-24. Status: SOURCE design accepted by Root, Native and Trust.
Root authorizes Native to implement only the three new files below. Runtime
integration and actual capture are not authorized by this source decision.

## Purpose and evidence

The hierarchy needs the fixed native quality study before live activation.
ADR205 completed three four-page batch drains, then failed during the fourth
batch with article-owner/article-navigation. Root and independent saved audits
authenticate18 canonical control pairs,443 bytes of stderr and all243 unchanged
source/package endpins. Cleanup passed without emergency termination; no final
cohort, embeddings, calibration, selection or TEST completed. The exact failed
predicate is unretained. The last RPC Fetch.failRequest does not identify it.

The current pageNavigation method refuses six distinct conditions with the same
code. Guessing which condition failed would not justify admitting another event.
A finite observation at the actual refusal site makes the next action depend on
evidence. It must not change a navigation decision, error or lifecycle transition.

## Bounded source slice

Create only three new files under
`spikes/topic-resolution/harness/experimental/article-owner-observation-v1`:
`article-owner.mjs`, `test.mjs` and `README.md`. Authenticate the complete frozen
study-v17 article-owner source before deriving its createArticleOwner function.
Import and re-export that frozen module's original error class, validators and
callback helpers rather than creating incompatible nominal error classes.
Record its FILE hash and bytes in the source review receipt. Do not copy a study,
map, output, profile or model.
The new owner is a source-only successor; nothing imports it from the application
or the actual study. All consumed source/maps/output stay immutable.

The owner adds one private observation and one reader method. Existing exported
helpers and callback behavior are reused unchanged; all other owner methods remain byte-equivalent
after reversing the explicitly reviewed edits. Tests authenticate the baseline
FILE bytes before importing it for differential checks.

## Refusal order and original error

Preserve check() first, then the original short-circuit order:

1. Missing pending slot: predicate `pending`.
2. Frame identity differs from the main frame: `frame`.
3. The existing single initial-blank exception runs unchanged.
4. Missing target: `target`.
5. State is neither navigating nor reading: `state`.
6. A page commit was already seen: `repeat`.
7. URL differs from the exact declared case URL: `url`.

The first two and last four conditions still call the original
fail('article-navigation'). A private helper catches that exact newly generated
error, records a best-effort finite observation, then rethrows the same object.
No caller-supplied error, message parsing, extra error property, asynchronous
handler, clock call or external hook participates. The helper is not exported.
Split the original boolean expressions only as needed to name their first true
predicate; preserve every accepted event and mutation, including the initial
blank exception and pageCommitSeen assignment followed by bounded().

## Exact private association and lifetime

Only the first pageNavigation failure per owner may retain an error and
observation. A guard, clock or bounded() failure latches that first failure with
a null observation, including a falsy thrown value. Later refusals throw normally
without replacing that association. The new
navigationWitnessFor(error) method requires exactly one argument; wrong arity
returns null without reflecting on arguments. It returns the frozen observation only when its
argument is that exact original error and the owner has not been released.
Identity comparison must not inspect the argument, including proxies, getters,
falsy values and forged or equal-code errors. Another owner cannot supply it.
release() clears both retained references and permanently revokes the reader
BEFORE calling infrastructure.release(). A throwing or reentrant delegated
cleanup cannot preserve or recreate the association.

This is an observation, not native admission or callback authority. Later capture
integration must separately establish that this exact error is its first primary;
an earlier falsy, unrelated or cleanup-first primary cannot borrow this witness.
That integration is not implemented or authorized by this source slice.

## Finite observation and resource bounds

The observation has exactly these ordered fields:

```
{
  schema: 'native-article-navigation-witness/v1',
  predicate: 'pending' | 'frame' | 'target' | 'state' | 'repeat' | 'url',
  state: 'unexamined' | 'absent' | 'provisional' | 'authenticated' | 'navigating' |
         'reading' | 'retiring' | 'terminal',
  urlRelation: 'unexamined' | 'blank' | 'other' | 'unavailable'
}
```

For pending/frame, state and URL relation are unexamined. For target, state is
absent; for state/repeat/url, state is the existing private state already read by
the original state predicate. URL relation stays unexamined for state/repeat;
only target/url refusals classify the input as blank (exact about:blank), other
(another primitive string) or unavailable (non-string). These classifications
use only typeof and strict equality, never a skipped caseUrl comparison. A URL
refusal cannot have an exact case URL. Do not serialize, parse or coerce a URL. No actual URL, case ID,
target/frame/loader ID, page text, hash, time, counter, stack or raw error enters
the observation. It carries no caller-controlled strings.

Reserve512 logical bytes in owner accounting from construction, before callbacks
or dispatch, within the unchanged32768-byte retained ceiling. The reservation
covers the private association, frozen DTO and a conservative projected copy;
it is a logical charge, not a V8 heap-size assertion. No new per-owner allowance,
process, deadline or output cap follows. Keep the reservation after release;
the original release path's authority and infrastructure cleanup are unchanged.

Measure maximum witness UTF8 JSON bytes in tests. Future capture integration must
prove the existing700-byte capture,900-byte driver and1KiB stderr ceilings still
hold, with this witness only for its matching primary and all other witness gates
unchanged. This slice neither edits nor claims that integration.

## Required checks and review

Exercise the actual new owner, not a copied predicate model. Compare its accepted
events, first error codes and lifecycle snapshots to the authenticated frozen
owner across all six refusal branches, overlapping conditions, initial blank
timing, repeated main commits, differing URL/state/order and full four-article
retirement. The snapshot delta is the reserved512 logical bytes; near the
original32768 ceiling, that reservation may cause an earlier registry-capacity
refusal. This is the intended stricter resource accounting, not a navigation
admission difference. Prove that boundary explicitly rather than hiding it in
the ordinary-behavior differential checks.

Verify exact-original-error identity, sticky first refusal, same-code forgery,
other-owner isolation, wrong reader arity, zero accessor/proxy/coercion hooks,
no witness for other owner errors, frozen exact-key DTO, closed enums and
irreversible release including throwing/reentrant delegated cleanup.
Prove a source reversal reproduces the entire baseline byte-for-byte and hash;
the entire frozen baseline must remain unchanged after tests. Use invented HTTPS
fixtures and inert infrastructure only, no browser, database, model or network.

Root owns this ADR, evidence and status. After Native and Trust accept the design,
Native may own the three new files; Root independently executes and reviews the
tests, and Trust independently reviews the final implementation and bounds.
Acceptance means this source observation is correct, not that the hierarchy has
passed quality tests. A later fresh capture/study contract, complete closure,
source review, separate actual decision and official tool approval remain needed
before any native invocation. Do not weaken the fixed96/72 quality gates, splice
three drained batches into another run, rerun consumed output or activate live.
