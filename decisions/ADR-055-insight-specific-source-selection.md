# ADR-055: Article-aware Insight source selection and evidence indicator

Date: 2026-10-07
Status: implemented locally in extension 0.13.18; release approval remains separate

## Context and decision

The owner observed that a current article could consume an Insight source slot
again under a different URL, while broadly related pages about the same person
or product displaced pages about the article's specific event. This is especially
visible in the Kyiv article and GTA 6/Game Informer examples. It is an Insight
candidate-selection problem, not evidence that the provisional Topic or the
underlying embedding is calibrated to event identity.

For an explicit **Get insights** request, the shared client/service context
builder now removes exact/tracking-URL duplicates and same-host alternate
slugs with a matching stable article number. It excludes recognizable search
result URLs from Insight candidates without changing background capture or
Topic membership. Remaining candidates are ordered by distinctive overlap in
headlines, with weaker overlap from URL paths, then existing vector/retrieval
order and modest source diversity. Generic terms common to many candidates
contribute little. The choice pool is still at most 20 locally visible,
reversible candidates; the five URLs sent to ChatGPT are drawn only from that
pool after exclusions. The service independently reconstructs and validates
the selection. No additional page content or URLs are obtained.

If a specific metadata match is strong, weak filler is not sent just to reach
five. If no match is strong, up to five vector-ranked candidates remain for
translated or differently framed reports; the model must still assess whether
they concern the same specific subject. This is an explicit precision/recall
trade-off, not a claim that vector similarity alone proves event identity.

A generated private Insight with zero validated outside citations displays a
small **No outside sources cited** indicator. This is presentation metadata,
not part of the draft or any shared contribution. It means no external source
is cited in the accepted draft; it cannot prove the provider never looked at a link.
The indicator is hidden for cited, manually entered, edited or stale drafts.

## Limits and gates

Title/path overlap is a bounded heuristic. It cannot establish same-event
identity, and translated headlines or opposing viewpoints without shared
terms fall back to vector order. A publisher may still block ChatGPT, and a
citation proves neither full-page access nor claim correctness. The current
article remains the Insight subject; ADR-054's exact-URL citation checks,
private preview, explicit Share, one-request limit and provider/data gates
remain unchanged. No new permission, automatic AI call, Topic merge,
retention change, model download or release approval follows from this ADR.

## Verification

Synthetic tests cover the Kyiv alternate-slug duplicate, GTA 6/Game Informer
headline-versus-path evidence, generic related pages, search-result tabs,
tracking URLs, multilingual/viewpoint fallback and client/service selection
consistency. UI tests cover cited versus uncited versus manual and
stale drafts. An isolated Chrome smoke found and then confirmed the fix for
an adjacent stale-context issue: after a coherent Source switch, the old
Insight is purged and the new ready Source is prepared without a provider
call. Full-suite and browser evidence are recorded in STATUS.
