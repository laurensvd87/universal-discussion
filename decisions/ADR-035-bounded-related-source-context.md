# ADR-035: Five-source insight context and honest related-page evidence

Date: 2026-10-03
Status: implemented local prototype rule; external discovery deferred

## Decision

An insight receives at most five source references in total: the currently
displayed page plus up to four additional pages. Confirmed same-Topic pages
take priority, followed by vector-related pages; within each group the local
service's ranking order is preserved. The current page contributes its bounded
visible article extract. Additional pages contribute only their catalog title
and URL, never their stored vector or article text. Users may exclude related
candidate links in the existing settings.

The ChatGPT web-search tool may verify a candidate on allowlisted public
domains, but a title or URL in the request does not establish that ChatGPT
opened or read it. Only returned, validated URL citations are rendered as
source icons; even a citation does not prove that the entire article was
available. The model must not present an unverified candidate as evidence.
No automatic retrieval of other tabs, website scraping service, Google
search workaround, extra provider request or paid fallback is added.

## Evidence and consequence

The latest captured completed local-service `INSIGHT_TRACE` on 2026-10-03
recorded zero `response.web_search_call` events. That particular response
therefore did not retrieve related-page content through the provider's web
tool, although candidate titles and URLs were supplied. It does not show
whether future requests will use the optional tool or whether a specific
publisher blocks it. Focused source-selection and context-rebuild tests cover
the five-reference boundary and server-side validation.

Google's original [Related extension](https://www.google.com/related/) was
discontinued; the [`related:` operator](https://developers.google.com/search/updates)
is unsupported and Custom Search [`relatedSite`](https://developers.google.com/custom-search/v1/reference/rest/v1/cse/list)
is deprecated. A Google fallback is not part of this prototype. A future
mechanism to read or retain linked-page text, force additional provider
research, or use another discovery service requires its own privacy,
provider-usage and policy review.
