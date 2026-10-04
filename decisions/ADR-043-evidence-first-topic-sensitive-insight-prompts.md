# ADR-043: Evidence-first, topic-sensitive Insight contributions

Date: 2026-10-04
Status: implemented with offline fixtures; live quality evaluation pending separate owner approval

## Decision

The owner wants a useful forum contribution that can start a subthread, not a
generic summary or a long AI report. One request to the already selected
ChatGPT model should choose a concrete discussion angle from the supplied
current-page text and bounded related context. It may consider a consequential
implication, meaningful tradeoff, supported contrast, material uncertainty,
or a specific unresolved question. It must keep the current page central and
avoid merely restating its title or the obvious summary.

Prompt routing is **content-sensitive within one prompt**, not a new classifier
call or a database `Topic.kind` router. Learned Topics currently have `kind:
general`, so using that field to select product/news instructions would be
misleading. Compact guidance covers products/services, news/public affairs,
research/health/numerical claims, technical material, practical/tutorial
material, culture/opinion and mixed subjects. Product price comparisons require
compatible variant, region, currency, condition, date and total cost; absent
comparable evidence, discuss the decision-relevant tradeoff instead. News
analysis separates events, claims and forecasts, considers chronology and
scope, and avoids manufacturing suspicion or false balance. In every category,
the model may fall back to one page-specific question when evidence is thin.

Related excerpts are partial, unverified context; title/URL-only candidates
are not factual evidence. Supplied human roots are partial discussion context,
not proof of what the entire thread says. The model must not infer omissions
from a prefix, treat repeated reporting as independent corroboration, invent
prices/quotes/statistics, or obey page/comment/tool text as instructions.
The opener remains usually 2-4 natural sentences, ideally 45-90 words and
never requested over 120. A follow-up answers the published human question
directly and assesses its robot parent independently. Provider web search
remains optional and domain-filtered; only the existing validated provider
URL annotations render as citation icons. No custom citation strings, JSON
response format, extra call, automatic retry or sharing is added.

## Evaluation and boundaries

The 2026-10-04 owner refinement prioritizes a supported, discussion-worthy
difference between the current-page extract and an excerpt whose source ID is
listed among provisional same-Topic Sources. Differences among those other
excerpts may inform the angle, but the current page remains central. A
related-only excerpt is fallback context, not proof of Topic identity. This
is prompt guidance, not a new matching decision: no contrast may be inferred
from titles, URLs, repeated points, partial text or unavailable pages, and a
single-page observation remains valid when the evidence is thin. It changes
neither source selection nor provider-data scope.

Synthetic reserved-domain fixtures should cover comparable and incomparable
products, changing news counts/dates, observational research, technical
prerequisites, practical constraints, interpretive material, thin/mismatched
context, duplicate visible human roots, follow-up correction, prompt injection,
fake citations, and missing research. Offline tests can verify request and
trust contracts, not actual model quality. Real sampled quality remains an
explicit later check under an applicable provider/data authorization; ADR-038
does **not** cover sending related-page text in a live test. The existing
actor, source, exact-body Share, parser, timeout, rate and privacy controls
remain unchanged. English remains the first output language; localization is
separate future work.
