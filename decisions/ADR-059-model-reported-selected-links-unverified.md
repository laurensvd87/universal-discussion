# ADR-059: Model-reported selected links remain visibly unverified

Date: 2026-10-08
Status: owner-approved; implemented and one-shot live QA passed

## Decision

The owner clarified that `ref1` is an example, not the only reference. The
local service sends a bounded `ref1`–`ref5` mapping to the already selected
public URLs and asks ChatGPT to place `[ref1]`, `[ref2]`, etc. beside information it
attributes to one of them. The owner explicitly approved displaying such
model-written references as clickable **unverified AI-suggested links** in a
private draft even if ChatGPT's tool source list does not confirm that exact
URL. This supersedes ADR-058's exact consulted-source requirement for these
model-written markers, but not its exact destination binding. The parser
never accepts a URL supplied by the model as the destination: it resolves
only a valid ID present in the server-selected reference map. The older
`[[webref:n]]` spelling remains accepted for existing drafts. Unknown,
malformed, or out-of-range IDs fail closed. A completed web-search call is
still required for the research path; foreign provider `url_citation`
annotations and unsafe raw links still reject the answer.

The extension stores a distinct `[?↗](selected-URL)` marker for these hints.
Its private preview **and any later explicitly shared agent post** render a
number with `?`, an accessible unverified-link label, and a visible
"AI-suggested links · sources not verified" note. Provider-attested citations
retain the ordinary marker. This distinction survives popup closure and
deliberate Share; no post is automatically shared. The model may still be
wrong about having read the article or about whether it supports the claim.
This is a reading suggestion, not a verified citation. The user must review
the draft before sharing, and other readers must see the qualification.

The response no longer requests the full `web_search_call.action.sources`
list solely to validate these hints. This avoids unneeded response metadata;
optional owner-enabled raw debug remains separately governed by ADR-030.
No new extension permission, related-page HTTP fetch, retained page body,
automatic retry, second provider call, or remote publication is authorized.
The source count is five under the current approved research scope; the
reference syntax accepts numeric IDs so a later separately approved scope
could raise it without changing the meaning of existing posts.

## Evidence and limits

The earlier public PCGames QA produced one model ref without a matching tool
source URL, demonstrating why the label must be unverified. A later one-shot
PCGames/GameStar request using the owner's `[refN]` spelling produced one
private 78-word Insight with one selected model-reference link. The bounded
QA printed only counts and categories, not the answer or raw provider data;
it did not share the Insight. No claim is made about its factual quality or
whether the selected GameStar article was actually read. Focused tests
cover exact ID mapping, malformed and foreign-source rejection, a completed
search requirement, persisted marker formatting, accessible visible labels,
and the fifth reference. A model marker does not prove article access or
factual support. The normal local service was restarted with the same Origin,
pairing, and SQLite state after QA.

Full network-denied suites: extension 996/996; local service 262 passed,
four optional skips. Both secret scans reported zero findings. An independent
read-only Trust review found no blocker after the owner-format `[refN]`
change. No live Chrome UI verification was claimed; reload extension 0.13.20
for owner testing.

Official tool contract: https://developers.openai.com/api/docs/guides/tools-web-search
