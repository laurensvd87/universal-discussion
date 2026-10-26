# ADR206 exact article navigation observation

Pure source-only successor, unregistered and not integrated into capture or the
application. Import has no browser, network, model, database or runtime action.
This component does not explain the historical ADR205 failure or authorize a
retry, another study, TEST, new navigation admission or live activation.

Only createArticleOwner is derived from the frozen study-v17 article-owner.mjs.
Baseline FILE SHA256 is
adb3b67caab942a2e61311e633cb6642ca56aaa63b41a89690a9fc993e331565,
13057 bytes. Original ArticleOwnerError, fail, fields, dense, identity,
CALLBACK_KINDS and createCallbackObservation are imported/re-exported directly,
preserving nominal identity. All other owner methods reverse byte-for-byte to
the authenticated baseline. No consumed file is edited or adopted.

The owner adds navigationWitnessFor(error). It requires exactly one argument,
otherwise returns null without inspecting arguments. The first pageNavigation
throw owns a private exact-error association; later throws cannot replace it.
Guard, clock and bounded-accounting failures, including falsy originals, latch
null. Only the actual article-navigation refusal helper can create a witness:
it catches the original fail-generated error, records best-effort finite data,
and rethrows the SAME object. Observation failure cannot replace that error.

The frozen DTO has exactly ordered schema,predicate,state,urlRelation fields.
Schema is native-article-navigation-witness/v1. Refusal priority remains:

1. Missing pending slot: pending.
2. Non-main frame identity: frame.
3. The existing single initial-blank acceptance, unchanged.
4. Missing target: target.
5. State outside navigating/reading: state.
6. Previously seen Page commit: repeat.
7. URL unequal to declared case URL: url.

Pending/frame leave state and urlRelation unexamined. Target reports absent;
state/repeat/url use only the existing private state enum. State/repeat leave
URL unexamined. Only target/url classify the input using typeof and strict
equality as blank, other or unavailable; no skipped case URL comparison, parsing
or coercion is added. No URL, ID, text, hash, clock, counter, stack, raw error or
caller-controlled string enters the DTO. It confers no rights or facts.

The exact reader performs no clock, guard, event or native operation and never
reflects on its argument. Same-class/equal-code/forged/other-owner errors return
null. Repeated correct reads return the same frozen data while the owner is
live. Release clears the error and snapshot and permanently revokes the reader
BEFORE delegated infrastructure cleanup. Throwing or reentrant cleanup cannot
restore the association. A previously returned finite frozen DTO remains data,
not a reusable admission or error-association capability.

Owner accounting reserves512 logical bytes from construction, before callbacks
or dispatch, and retains that fixed charge after release. This covers the
association, DTO and conservative projected copy, not a V8 heap measurement.
The ceiling remains32768; a refusal may therefore occur512 bytes earlier than
the old owner. Future capture would include this once through its existing
owner.snapshot().retainedBytes sum; this slice does not edit that integration.
Maximum observed witness UTF8 JSON is120 bytes. Future capture integration must
independently prove its unchanged700/900/1024 output limits and exact-first-primary
gates; no such integrated acceptance or quality claim is made here.

Tests authenticate the entire baseline FILE BEFORE importing either module,
compare actual accepted/refused flows and snapshots (only the512 charge differs),
and reverse the new function into the authenticated baseline prefix to reproduce
all13057 bytes and SHA256. A closed import/re-export wrapper plus that derived
function accounts for the entire new module. Baseline bytes are rechecked at
the end. Invented HTTPS fixtures and inert infrastructure exercise all six
branches, overlapping priorities, blank timing, Page/CDP order, full four-article
retirement, sticky falsy clock/guard/bounded errors, reader arity, exact identity,
zero proxy/accessor/coercion hooks, release-before-throw/reentry and actual
32768/32769 accounting boundaries. No process or browser is launched.

Additional pure tests evaluate the EXACT production createArticleOwner function
string with frozen baseline helpers and test-only lexical fail/Object facades.
Only witness freezing throws false, undefined or an Error: the recorded original
fail error still escapes unchanged, gains no properties, and retains a sticky
null witness even after projection would succeed. This is not a runtime hook or
production injection interface. The actual reused createCallbackObservation
also joins the new owner: its action error reaches onFailure unchanged with the
finite fault summary. An explicit caller first-primary selector demonstrates
that an earlier unrelated or false global primary cannot borrow a later owner's
witness. The false case initializes that selector directly; it does not claim
the unchanged callback helper transports falsy throws, nor implement capture's
future first-primary integration.

```text
node --max-old-space-size=64 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test-isolation=none --test --test-concurrency=1 ./spikes/topic-resolution/harness/experimental/article-owner-observation-v1/test.mjs
```

Root and Trust must review the complete implementation. Later integration needs
a fresh capture/study contract, source closure/review, separate phase decisions
and supported tool approval. No partial-batch splice, consumed-output rerun,
redirect exception or relaxation of fixed96/72 quality gates follows.
