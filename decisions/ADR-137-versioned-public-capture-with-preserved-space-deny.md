# ADR-137: Versioned public capture preserving a malformed space-containing deny

Date: 2026-10-20. Status: implemented/reviewed/frozen; capture CLOSED at88/96; NOT live.

## Execution checkpoint

Root independently passed19capture/repair and10manifest/verifier fixture checks;
Trust independently accepted the same29checks and the source/evidence boundaries.
The exact retained NL snapshot was reconstructed offline with its original UTF8
BOM, matching BOTH pinned hashes. The default repair preserves33groups/253rules;
the percent-encoded published path remains denied. No live policy was changed.
The body/text hash difference is the BOM, not evidence of a changed text decoder.

New real-root-v2 freeze:
`f3542413ee2c0ed76cfd929ae7a2c30c1879721b89d56a3398c2658b662fcb22`.
It binds27top-level and40manifest source identities. The fresh supervised96
TRAIN/CAL collection stopped with88successful inputs (48TRAIN+40CAL),137.953s,
at `real-cal-041`/Semantics, HTTP200, extractor stage. Result SHA256
`4dc58622de3ad86897252e287718ebc899402613d9ef051eddf8f872fe3278eb`.
Independent stored audit confirms exact successful prefix, source/input hashes,
all18actual NLrepair receipts and unchanged older evidence. No encoding, fitting,
selection or TEST capture occurred. Do not salvage/drop eight or fit40CAL cases.

All88prose leads are available;13lead openings are absent from the existing4096
prefix. This proves input differences, not improved model quality. The separate
one-page diagnostic identifies the Semantics failure at static-capture.js31:
the HTML attribute section exceeds16KiB. Its content-free result SHA256 is
`5dcb2c626f4d3d70286694ef50c569237bdb9a984b223f953067cc75edf6e0e4`.
The exact oversized attribute name is not yet established. A new experimental
metadata-only pruner/diagnostic is being reviewed; no frozen source is changed,
no cap is raised and no new collection is authorized before actual cause proof.

Owner reported setting a one-week Windows pause. Read-only verification instead
observed UX expiry2026-11-24T04:56:24Z with start2026-10-20T04:56:31Z (35days).
Root asked owner to correct/confirm the intended27October date, without registry
edits or automatic resume/scan. Do not claim the seven-day pause is verified.
Owner subsequently confirmed24November and asked why it mattered. Root explained
the longer security-update delay and left the owner-selected setting unchanged.

## Evidence and reason

The observed-cutpoint experiment is closed under freeze
`46a96411d0a43194c7be6526c5b57f5007f5b04f64d2c7987f789b33fdd93c02`.
Its new142 authored test cases give83assignments/81safe,24/24leafcorrect and
8exact depth-three outcomes. The unchanged fixed baseline gives101/96safe,
12/13leafcorrect and0exact depth-three outcomes. Coverage, specificity and
statistical/independent-web gates still fail. No release, retuning or replay.

ADR136's real-root experiment froze before collection, but collection stopped
after2/96TRAIN/CAL inputs. NLrobots returned200; its published line469 contains
an ASCII space inside a Disallow path. The existing parser rejects the whole
document. A robots-only diagnostic isolated this cause; it is not a size, group,
delay, DNS or HTTP failure. The original freeze, failed collection, markers and
two successful inputs remain immutable. No real-root encoding, fitting, model
selection or TEST capture occurred.

Raw robots body SHA256:
`5b208e484c176e5fdcea5ba86f9ba5aa370117b03b706b37da2451baeb4b88b4`.
Existing transport decoded-text SHA256 (distinct encoding identity):
`5bd4fdfe000f3371420eb68a396513fac4a3c75ef5a0c9324ce2eb8be8b6a5dd`.
Do not silently change the existing transport's decoding contract.

[RFC9309](https://www.rfc-editor.org/rfc/rfc9309.html#section-2.3.1.5)
requires using parseable rules; its grammar does not make an embedded ASCII
space a valid path character. This experiment does NOT claim RFC requires the
normalization below. It explicitly preserves a known intended denial rather
than discarding that rule or treating the policy as absent.

## Narrow experimental decision

Create separate public-capture-v2 and real-root-v2 artifacts. No production
parser/fetcher/crawler or previously frozen experiment source changes.

First apply the unchanged strict parser. A fallback is permitted ONLY for
invalid-robots, the exact NL origin, BOTH pinned body/text identities, and one
exact occurrence of the documented Disallow line. Encode only its single
embedded ASCII space as `%20`. No Allow transformation, line removal, group
reordering, wildcard widening, policy-absence inference, generic error recovery
or automatic retry. Reject unknown/mutated policy bytes, controls, malformed
percent escapes, extra failures and changed groups. Retain all253rules/33groups
and existing parsing/size/transport/TDM/indexing/resource limits.

Capture provenance must retain original body/text hashes, normalized policy
hash and repair identity. Hash the body before clearing its buffer. The fixed
collector uses the reviewed built-in manifest, not an untrusted repair map.
Synthetic fixture seams are not a live configuration mechanism.

## New prospective run, not a hidden retry

The root explicitly authorizes a fresh96-page collection ONLY after reviewing
the new code/tests and independent Trust findings. New source freeze, namespace,
output names and one-shot receipts identify this operation. Do not splice the
old two inputs into it or overwrite any previous result. Gold128metadata and
48/48/32 entity split remain unchanged because no real model/final test was run.

All ADR136 modelling choices remain predeclared: fixed lambda.1,16root-only heads,
separate title/body E5 with .75/.25weight, two body constructions selected on CAL
only, and independent root support before frozen detail refinement. No child
negatives from root-only labels. Exactly four terminal test anchors have
specificity labels; other children remain unscored.

Namespace: `hierarchy-real-root-public-capture/v2`.
Capture result schema: `hierarchy-real-root-public-capture-result/v2`.
Model protocol: `hierarchical-e5-real-root-experiment/v2`.
Selection schema: `hierarchy-real-root-selection/v2`, fixed file
`data/hierarchy-real-root-selection-adr137.json`.
Input construction hash includes actual repair/collector source identities.
TEST collection remains forbidden until the exact selected model/policy/input
receipt exists; no test-driven choices or missing-view fallback.

## Operational boundaries

No canonical migration, assignment activation, provider request, post, credential
change, old-discussion move or crawler restart follows from this experiment.
Owner approved a future single graceful crawler consumer restart only when the
reviewed actual cutover is ready, retaining saved progress and no duplicate.

The already-approved repeat cache cleanup completed04:42:41Z, reclaimed
2,252,054,528physical bytes and restored prior service states. A seven-day update
pause is now authorized but NOT yet performed: the agent's isolated desktop
cannot access the owner's Settings controls. Owner was asked to set the supported
one-week pause manually. No registry hack, desktop security bypass, paging-file
change or pending Windows reboot is authorized/performed by this decision.

Runtime schema9, ADR128seal and crawler26616/API19868/worker36616/dashboard6644
remain unchanged. Model classification timing alone is not application latency,
and these purposive Wikipedia inputs are not representative population proof.
