# ADR-057: Hosted search citations outside selected article URLs

Date: 2026-10-08
Status: diagnosis complete; owner chose strict selected-URL IDs in ADR-058

## Evidence

The owner repeated `response-web-citation` on a public PCGames GTA 6 article.
The content-free service trace reported `citationFailure: unselected-url`
after a completed web-search call and completed assistant message. This rules
out ADR-056's missing-display-title cause for this attempt.

A fixed, one-shot public QA case supplied the PCGames article extract and the
one GameStar Game Informer article selected in the owner's local catalog.
Three agent-run Responses requests reproduced `response-web-citation`; none
cited the exact selected URL or an alternate URL with its stable article ID.
The final request's bounded, in-memory classification placed the sole citation
on another GameStar URL. The first two probes grouped the current and selected
hosts together, so their particular hosts are **not** established. No raw
provider text, URL, token or page extract was logged or shared, and no result
was posted. One earlier default-sandbox attempt stopped before inference;
it is not counted as a Responses request. The regular local service was
restored with its previous Origin, pairing and SQLite state.

The official Responses `web_search` interface supports domain filters and
returns `url_citation` annotations, but does not promise that a cited URL is
one of the exact URLs supplied in a prompt. A different same-publisher article
may be relevant or may concern another event; a citation by itself does not
establish same-Topic identity or full-page access.

## Boundary and historical decision point

The owner subsequently directed strict `ref1`/`ref2` links only to supplied
URLs. [ADR-058](ADR-058-selected-web-reference-ids.md) records the bounded
implementation and live evidence; same-publisher citations were not approved.
The options below are retained as the historical decision point.

ADR-054's exact-selected-URL rule remains active. No parser relaxation,
automatic retry, second provider call, unselected-source retention or sharing
is implemented. At this point the owner was asked whether to allow bounded
public same-publisher citations as **private, editable** drafts with exact
clickable links and exclusion/sensitive-path checks, or to keep exact URLs
and offer a separate user-invoked current-page-only fallback. The former
risks incorporating a different article/event and needs a trust/policy change;
the latter preserves strict provenance but frequently loses related context
and may need a second deliberate plan-usage call. No choice is inferred from
the request to fix an error. Later provider, privacy, spending, publication
and deployment gates remain separate.

Official tool contract: https://developers.openai.com/api/docs/guides/tools-web-search
