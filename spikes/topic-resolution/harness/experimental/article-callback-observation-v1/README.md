# ADR208 falsy callback failures

Pure source-only callback successor, unregistered and not integrated into a
browser, study or application. Only createCallbackObservation is exported.
No capture, process, network, model, database, crawler or TEST action exists.
This corrects a verified source defect; it does not attribute ADR205's actual
nominal article-navigation refusal or authorize rerunning consumed output.

Baseline is frozen study-v17 article-owner.mjs,13057 bytes, FILE SHA256
adb3b67caab942a2e61311e633cb6642ca56aaa63b41a89690a9fc993e331565.
The original ArticleOwnerError, fail, fields, identity and CALLBACK_KINDS are
imported unchanged, preserving nominal class and validation identity. The exact
closed FAULT_CODES literal and original observer function are derived from those
authenticated bytes. Only invocation-local failure presence is corrected.

callback() now sets observationFailed/actionFailed independently of the values
thrown. Each catch retains its exact value; action failure wins whenever present,
otherwise observation failure wins. Reporting occurs when either failure exists,
including undefined, null, false,0,-0,NaN and the empty string. The exact value is
passed to the unchanged fault projector and onFailure, without wrapping, coercion,
serialization or new properties. Undefined/null no longer mean success or allow
an emission error to replace an actual action failure.

Observation validation and emission still occur before the action. The action
runs exactly once even after malformed input, emission failure or capacity
refusal. Summary drops never suppress validation, action or reporting. Throwing
onFailure propagates normally without retries; onFault retains its existing
best-effort behavior. FirstFault remains only the first frozen finite summary,
not a raw retained exception. Forged/proxied/arbitrary failures keep the original
native-failure projection and do not acquire nominal ArticleOwnerError codes.

Both new booleans are synchronous invocation locals. No retained history, error
reference, callback, promise, row or function slot is added. Keep32 summary rows,
4096 calls, all closed kinds/codes, snapshot shape and every existing resource,
deadline, process and admission limit. Accepted ADR206 source is not changed;
it deliberately continues reusing its authenticated frozen observer. Future
integration of these separate slices needs its own complete reviewed contract.

Tests authenticate the entire baseline FILE BEFORE importing either module,
then compare all closed callback kinds, ordinary/truthy paths, validation and
counter order with the actual baseline. They exercise all seven falsy values,
the success/truthy/falsy emission/action Cartesian matrix, summary32/33 and
call4096/4097 boundaries, late malformed/action failures, zero proxy/accessor/
coercion hooks, sticky finite summaries and throwing handlers. An actual corrected
observer delivers false into a caller first-primary latch before an actual
baseline owner's nominal navigation refusal; this is pure composition, not
integrated browser or capture evidence.

The test proves that the new module is exactly its reviewed import wrapper,
unchanged FAULT_CODES literal and minimally edited function. Inverting the
presence-latch changes reconstructs the entire13057-byte baseline and hash using
its authenticated unchanged surrounding bytes. Baseline end bytes are checked
again. All fixtures are invented and external capabilities are denied.

```text
node --max-old-space-size=64 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test-isolation=none --test --test-concurrency=1 ./spikes/topic-resolution/harness/experimental/article-callback-observation-v1/test.mjs
```

Root and Trust must independently review the complete implementation. Source
acceptance grants no runtime integration, browser compatibility, semantic quality,
96-case retry, automatic TEST or live activation. The fixed96/72 quality gates
and all consumed sources/maps/output remain unchanged.
