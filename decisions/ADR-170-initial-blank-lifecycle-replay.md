# ADR170 Initial blank lifecycle replay

Date: 2026-10-20. Status: root and independent Trust design accepted for
source-only implementation. Preparation, freeze audit and one actual owned
browser invocation remain separate gates.

## Initial document replay

ADR169's one actual invented-article run failed while enabling lifecycle events,
before navigation, native document lookup or text reading. Its finite report
identifies an unrecognized lifecycle name in the prepared phase. It does not
retain the name or prove equality with the initial blank loader: name validation
failed before that comparison. ADR169 source, freeze and output are closed and
immutable; this decision does not reinterpret ADR168's earlier unknown failure.

Chromium's enable handler replays available lifecycle timings for existing
documents, including commit, before returning success. A lifecycle callback
during setup is therefore supported behavior, but this does not identify the
actual rejected ADR169 event. See the
[Chromium enable implementation](https://raw.githubusercontent.com/chromium/chromium/main/third_party/blink/renderer/core/inspector/inspector_page_agent.cc)
at lines555–599, checked2026-10-20.

## Narrow initial blank exception

Keep the independently captured initial frame and blank loader. Validate event
descriptors without invoking getters or proxy traps, the exact authenticated
frame, valid loader syntax, finite timestamp and a printable bounded token name
matching `/^[A-Za-z0-9._:-]{1,64}$/` before considering any exception.

Only while the journey is prepared and the loader equals that exact initial
blank loader may any structurally valid name be counted as initial replay.
Such an event supplies no navigation fact, candidate loader, readiness, phase
advancement or reading authority. It cannot reset the original lease.

After navigation begins, retain ADR169's strict literal article event enum and
all five independent navigation facts. Blank-loader events after begin,
prepared events with a different loader, wrong frames, stale incarnations,
malformed events and unknown post-dispatch names remain fatal. Do not broaden
the article allowlist or infer navigation from a lifecycle name.

## Finite evidence and tests

Add fixed initial-replay name-category counters for commit, the original known
literal names and other-bounded; no per-name map or raw names, IDs or hashes.
Expose blankLoaderMatch as null until safely parsed, false for a validated
different loader and true for exact equality. Preserve that finite projection
on first failure and success; an enum failure alone cannot infer equality.

Every callback is counted exactly once against the existing4096 whole-journey
event cap. Keep the2KiB first-fault projection,32KiB combined registry and all
original target, report, process, CPU, memory, output and absolute lease limits.

Execute the real new runner under invented clients across all120 fact orders.
Test arbitrary bounded initial names and commit without supplying any fact;
empty/control/overlong/malformed/getter/proxy names; wrong frame, loader and
phase; post-dispatch unknown names;4097 events; physical fulfill failure or
nonsettlement; late contradictions and maximum serialization. Execute the
actual parsed Python report validator separately. Refusals publish no input.

## Ownership and unchanged execution gates

Matcher owns exactly six new files under
`spikes/topic-resolution/harness/experimental/native-article-blank-replay-dev-v1/`:
run.mjs, journey.mjs, source-ledger.js, supervise.py, test.mjs and README.md.
Root owns this decision and compact evidence outside the closure. Mechanically
derive the successor from169 without importing or executing169's runner,
journey, guardian or main, or reading its generated outputs.

Reuse the unchanged pinned168 article owner, fixtures, adapter, worker and
manifest. The literal execution closure remains217 entries: the authenticated
original168209, its fixed freeze metadata, the new six files and this decision.
Nonexecuted169 source ancestry is not an executed dependency. Authenticate the
original168 freeze before following inherited paths and preserve every earlier
pin. All169217 source entries, freeze and output remain unchanged.

Root and independent Trust must read all six files and consequential imports,
review mechanical deltas and pass focused guarded tests before one metadata
preparation. Both actual217-source inventories and exact freeze bytes must pass
before root may authorize ONE owned DEV. Any actual attempt closes the version,
pass or fail, with no automatic retry or evidence rewrite. No public network,
model, provider, rights, semantic-quality, HBA or live-runtime authority follows.

A successful diagnostic would establish four invented native article journeys,
not hierarchical matching quality. Held-out root, child, STOP, sibling and
outside cases plus canonical, producer, owner-control, crawler and client
integration remain required for the full goal.
