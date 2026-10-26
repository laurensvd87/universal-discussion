# ADR208 Falsy article callback failures

Date: 2026-10-24. Status: SOURCE design accepted by Root, Native and Trust.
Root authorizes Native to implement only the three new files below. Runtime
integration and actual capture remain unauthorized by this source decision.

## Verified defect

The frozen study-v17 callback observer uses null-initialized error values,
nullish selection and a truthiness check to decide whether callbacks failed.
Root's capability-denied pure reproduction authenticates baseline FILE
adb3b67caab942a2e61311e633cb6642ca56aaa63b41a89690a9fc993e331565,
13057 bytes, before importing its actual exported observer. Actions throwing
undefined, null, false,0,-0,NaN or an empty string run but do not call onFailure.
An ordinary ArticleOwnerError is reported unchanged. An emission error followed
by an action throwing false suppresses both errors. The baseline stays unchanged.
Finite evidence is saved in native-callback-falsy-source-observation-20261024.json.
Independent reproduction also finds null action failure replaced by an emission
error, and the4097th capacity error suppressed by an action throwing false.

This is a source defect, not an explanation of ADR205's actual nominal error.
ADR206 deliberately reuses the frozen observer; its navigation witness does not
fix or claim correct transport of falsy callback failures. The correction needs
its own reviewed source and future fresh-study integration.

## Minimal pure successor

Create only observer.mjs, test.mjs and README.md under
spikes/topic-resolution/harness/experimental/article-callback-observation-v1.
Export only createCallbackObservation. Import the frozen baseline's original
ArticleOwnerError, fail, fields, identity and CALLBACK_KINDS plus built-in util.types.
Copy only its exact closed FAULT_CODES literal and observer function, then make
the following correction inside callback(). Authenticate baseline FILE before
derivation and before importing either module in tests.

Add invocation-local observationFailed/actionFailed booleans. Each corresponding
catch sets its flag and retains its exact thrown value. Select the action error
if actionFailed, otherwise the observation error. Report whenever either flag
is true, not when the value is truthy or non-nullish. Pass that exact value to
the existing fault projection and onFailure. Do not wrap, coerce, serialize,
inspect or add properties to the original thrown value.

All original validation, action execution and counter order remain unchanged.
The action still runs exactly once after observation failure, even capacity or
malformed payload failure. An action error has priority even when falsy. When
only observation fails, report that original. onFailure throws still propagate
normally; never retry an action or handler. The finite firstFault summary remains
the first successfully recorded closed observation, not a retained raw exception.
Arbitrary/falsy/forged/proxied values project to the existing native-failure code
without hooks. Keep default error prototypes and nominal class identity intact.

No new retained history, error reference, row, callback, promise or function slot
is added. The two booleans are synchronous invocation locals, not retained state.
Keep32 summary rows,4096 original calls, all closed kinds/codes and existing
snapshot grammar. Summary drops never suppress validation/action/reporting.
No change to the32KiB aggregate, deadlines, processes, native rights or admission
follows. All consumed sources and the accepted ADR206 implementation stay intact.

## Checks and review

Use invented pure callbacks only under the64MiB external-capability denial guard.
Tests must authenticate the old bytes before importing either module and recheck
them at the end. Prove the new wrapper and fault literal contain only reviewed
code; reverse the presence-latch edits to reproduce the exact original
function and reconstruct the complete baseline byte/hash with its unchanged
surrounding bytes. Do not hide unrelated changes in a differential model.

Differentially preserve ordinary success and truthy failures, every kind's payload
validation, summary32/33 behavior and4096/4097 counters. Exercise all seven falsy
values independently and combined with successful, failing and falsy emissions.
The action must always run once; when both fail, the exact action value wins.
Test getter/proxy/coercion traps with zero hooks, late failures after summaries
fill, nominal/forged error projection, sticky firstFault, throwing onFailure,
and exact propagation into a caller first-primary latch including a false first
primary followed by a nominal navigation error. The latter is a pure composition
check, not integrated browser compatibility or historical fault attribution.

Root owns this ADR and acceptance evidence. After Root, Native and Trust accept
the design, Native may own the three new files. Root independently reads and runs
the checks; Trust independently reviews final source and executes focused tests.
No existing source or runtime import changes. A later fresh study must review
the complete join, original budgets, source closure and separate actual phases.
No browser, network, model, database, crawler action, TEST or live activation is
authorized by this slice. The fixed96/72 quality gate remains unchanged.
