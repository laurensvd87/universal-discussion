# ADR-138: Bounded metadata-only preparation for real hierarchy inputs

Date: 2026-10-20. Status: v3 complete and closed; inadequate matching quality.
No live parser, matching, database or crawler change.

Final execution supersedes the intermediate checkpoints below. Both fresh capture
sets completed:96TRAIN/CAL and32TEST. Both CAL views yield36correct assigned roots
out of48; the declared tie rule selects current-static before TEST. Locked32 gives
13correct assigned roots and19unresolved for both root-only and consensus. The
four child anchors give consensus1exact,1safe broader,1wrong sibling,1unresolved.
Fixed C baseline has19correct assigned roots but one wrong sibling. These results
do not support activation. No post-test retuning or replay; frozen sources remain
immutable. ResultSHA`0280c5397f417b0582a0f6040bd8c516575595214f143b79539df304e8ecdf29`.
Stored-only verifier validates72source hashes,67files and three saved assessments.
Consensus classifierp95.411ms excludes encoding/capture/compilation/queue/database.
The metadata preparation fixes the measured capture failure, not matching quality
or live latency. Independent stored-evidence review is pending.

Execution: root and Trust pass39offline checks (capture13/pruner13/model-verifier13).
Final exact NLcanonical hash pin also passed the model/verifier suite before
freeze`6892118af0326115f1bc40d19db30956b319157efde7991e6128d9823b4fb92a`.
Fresh96TRAIN/CAL capture COMPLETE in143.266s,peakRSS243,400,704B/noerrors:
SHA`6659f34a3e800bc447eb5331500c647194d1fe71164e8c7ca2b08a28d1418955`.
Root started supervised encode-traincal once; fitting/selection/final TEST have
not run at this checkpoint. All frozen source files are immutable.

## Concrete failure, not a model result

ADR137's fresh collection stopped88/96 before any model encoding/fit/test.
The fixed Semantics diagnostic isolated static-capture.js31: an attribute section
exceeded the existing16KiB guard. A separately reviewed, one-page diagnostic then
compared unchanged extraction with metadata-only preparation on the SAME response:
HTML SHA256`70e7f9d6721415526eb8296820f49ffccc6978132d17be40f449f2f60899fe03`.

One span has93,630attribute characters; its sole oversized field is a quoted
`data-mw` value of93,546characters. Removing quoted `data-mw`/`data-parsoid`
transport metadata makes unchanged static and lead extractors pass, with4096/
2269characters respectively.745metadata attributes/199,804characters removed;
no body, title, attribute values or raw HTML persisted by this diagnostic.

Result SHA256:
`cf35a87a86dc75468fc07b4e91f2a47286e1982fff7869d4052416881322e76f`.
Reviewed pruner source SHA256:
`1f553a8d4febbb32bceaf44a20622bf0d04598273c32be01c857bf0d756d1b8e`.
Root and Trust independently pass13synthetic preservation/refusal tests each.
[MediaWiki's HTML specification](https://www.mediawiki.org/wiki/Specs/HTML/2.8.0)
describes these data attributes as structural metadata, distinct from rendered
content. This is still a limited experimental lexical adapter, not a general DOM
parser, browser visibility simulator or production sanitization claim.

## Exact bounds and preservation

Only complete quoted attributes with those two exact names may be removed.
Text, comments, CDATA, directives, ordinary attributes, hidden/style/ARIA flags,
tag names and order remain unchanged. Exact HTML ASCII whitespace is used;
ambiguous adjacency, duplicate attributes, malformed states, unsupported
declarations, raw-script transitions and self-closing raw-text syntax fail closed.
Raw-text/RCDATA contents are not searched for removable attributes.

Original input<=2MiB,100,000tokens,depth256 and128original attributes per tag,
INCLUDING removed ones. The original static parser's16KiB guard still applies
AFTER preparation. Oversized ordinary/style/content attributes remain failures;
no cap increase or ignoring policy-bearing metadata. Negative header/meta/TDM/
robots evidence remains decisive. Output equivalence is asserted where both
constructions accept; stricter refusal means not every legacy page is supported.

## Prospective v3 run

Root authorizes separate public-capture-v3 and real-root-v3 code/review, followed
by one NEW96TRAIN/CAL collection only after review and source freeze. All earlier
freezes/partials/diagnostics stay immutable. No old88splice, dropped rows or hidden
retry. The original gold128,48/48/32split, lambda.1,16root-only heads, two body views,
CAL-only input choice and frozen C/D detail artifacts remain unchanged.

Both extractors consume prepared HTML. Retain the ORIGINAL fetched HTML hash,
decoded HTML hash and exact preparation receipt: version, input/output hashes,
counts and arithmetic. Bind the receipt hash into the Source input identity, and
pruner/collector/repair/wrapper/supervisor sources into input construction.
Do not replace original transport provenance with the prepared hash.

New experiment/capture/result/selection/construction identities are version3;
fixed capture/selection filenames use ADR138. The v2 known-NL-deny repair module
is imported unchanged, not retuned. Exact selected receipt is still required
before any32TEST capture. No real model/test phase has run at this checkpoint.

All existing resource guards, public-access checks and no-provider/no-canonical-
write boundaries remain. Crawler26616 and runtime schema9/ADR128seal stay live.
Owner-approved graceful consumer restart is reserved for an actually reviewed
future cutover. The full fast hierarchical matching/integration goal is unfinished.
