# ADR-081: Citation syntax and post reveal across delayed topic views

Date: 2026-10-10.
Status: implemented and independently reviewed; final verification complete
2026-10-11 in extension 0.13.39.

## Evidence

The owner reports another uncited product-price reply and a branch that does
not remain unfolded. A read-only inspection of that exact saved post finds no
persisted links or selected-reference markers. The selected message/root and
public product Source exist. Its normal service trace records completed search
and assistant output, text/content completion and a successful strict fallback
from empty terminal output. Original raw annotations are unavailable; do not
claim an exact replay, prove the original provider omitted annotations, or
invent/backfill a merchant URL.

The previous visual fixture directly injected a ready created-post cue. An
integrated controller/service/panel regression reveals the actual sequence:
canonical refresh first opens the accepted reply, then the delayed experimental
topic projection changes the renderer's transient view key and clears branch
expansion after its one-time cue was consumed. This is a reproduced client bug,
not evidence that command IDs or canonical posting authority failed.

## Correction

- Identify the selected view by matching mode, Source and Topic, not temporary
  availability of its alternate projection. Clear expansion only for a changed
  coherent selected view, not same-context loading/refresh or projection arrival.
  Preserve deliberate later collapse, typing focus and feed position. Bind the
  visible-post anchor to actor, Source, Topic and discussion, and invalidate it
  on context change. The accepted created-post cue remains one-time RAM
  presentation only.
- Explain the native inline web-search citation syntax in broad reply instructions.
  A model writes tool-reference markers; OpenAI attaches URL annotations. Asking
  for the metadata name alone does not specify that syntax. Require real tool IDs,
  adjacent claim citations and no invented IDs/URLs. Opening Insights keep their
  selected `[refN]` instructions; research-off remains tool-free.
- Reject loose/malformed native citation controls before returning a result. An
  exact renderer-supported marker may pass only inside its exact already-valid
  provider `url_citation` span, with renderer-compatible Unicode offsets. No new
  URL, tool-source-list, delta or intermediate-annotation authority is introduced.
- Add fixed bounded numeric counts to the existing content-free trace: annotations
  at content/item/final completion and accepted citations. These counts contain
  no text, URL, account, identifier or raw output. Acceptance remains unchanged
  apart from the tighter unresolved-marker rejection. Persistent/raw diagnostics
  still require the existing explicit debug mode.

## One live diagnostic

ADR-079 permits at most two agent diagnostic Responses calls; one earlier MDN
probe was used. The remaining call uses the already-connected protected account,
the cheapest account-listed `gpt-6-luna`, a fixed public Meross product URL and
synthetic bounded product/question context about delivery to Germany. It sends
no stored comments, browser cookies or additional related candidates and does
not fetch page text through the service. It is not a replay of the owner's
actual browser extraction or a new price-quality guarantee.

The diagnostic exclusively claims port 4174 before protected credential restore;
the normal verified service has no active provider connection before stopping.
Exactly one Responses dispatch completes: 631 answer characters, two accepted
citations; content-done and item-done each contain two URL annotations, terminal
output contains zero, and the existing strict completed-stream fallback succeeds.
The stream includes two annotation events; no unresolved marker remains in text.
Only counts/model/fixed codes are printed. No answer is posted or archived, no
raw log is enabled, and the normal service is restored with its original pairing,
protected login and SQLite. Both diagnostic calls are now used; do not run another
agent inference automatically under this checkpoint's approval.

This supports fresh citation transport with the revised syntax, not factual
price accuracy, attribution of every claim or an identified historical merchant
URL. Future owner clicks remain deliberate one-shot application operations.

## Verification and boundaries

Independent Trust reviews the narrower marker guard and unchanged citation/
account/Source/Topic/target/sharing fences. Normal and strict-fallback tests cover
unannotated/exact/broad/partial/malformed markers; integrated panel tests cover
accepted generated command, fresh canonical read, delayed projection and later
same-context refresh/manual collapse. Trust catches and verifies the full-context
viewport-anchor fence and exact annotated multi-source-marker compatibility.
Final full service: 397 pass/4 optional skips; extension: 1,111 pass/1 optional
skip; restricted extension: 1,112 pass. Disposable Chrome verifies the integrated
accepted-command sequence with synthetic data and no provider call. Compact dock
screenshots are reviewed; an optional end-of-flow screenshot times out without
failing the browser assertions. Secret scans and diff checks pass. Top STATUS/
HANDOFF record exact evidence and the normal service activation.

No automatic inference/retry/duplicate sharing, guessed URL, old-post rewrite,
new provider scope, retention, permission, model, migration, catalog ingestion,
remote deployment or release gate follows. The new diagnostic entry point is
explicit-only, single-dispatch and counts-only, not a background app action.

OpenAI Docs informs native tool-reference syntax and output annotations:
[citation formatting](https://developers.openai.com/api/docs/guides/citation-formatting),
[web search](https://developers.openai.com/api/docs/guides/tools-web-search).
