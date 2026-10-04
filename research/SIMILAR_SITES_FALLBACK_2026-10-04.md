# SimilarSites-like discovery: useful analogy, not a Topic fallback

Date: 2026-10-04. Read-only research; no integration or provider request.

## Finding

[SimilarSites describes](https://www.similarsites.com/about) a blend of page
content, keyword density, tags, hyperlink structures and co-visit/traffic
patterns. Its documented [Similar Sites API](https://docs.similarweb.com/api-v5/api-reference/website-analysis-api/website-performance/similar-sites)
takes a **domain** and returns other domains with similar audience/traffic
patterns. It requires an API key and uses data credits. This could identify
alternative publishers or shops, but not the specific article/product page
about the current semantic Topic. Returning `rtl.nl` peers would not discover
the other report about a particular military decree.

Do not scrape the public SimilarSites/Similarweb pages into this product or
embed its extension as a data source: [Similarweb's published terms](https://www.similarweb.com/corp/legal/terms/)
restrict automated scraping, redistribution and competing uses. That is a
terms reading for engineering scope, not a legal opinion. A licensed API
would add spend, vendor dependency and a separate owner/provider gate.

## Ownable candidate experiment (not implemented)

1. On an explicitly eligible public page, inspect only its bounded outbound
   article links/anchor text and canonical/structured related links already
   present in the rendered document. No generic search-engine automation.
2. Locally rank these URLs by semantic similarity of safe titles/anchor text
   to the current article. They are **discovery candidates**, never same-Topic
   proof. Deduplicate and show provenance ("linked from this page").
3. Only after a separate bounded permission/data review, fetch the best public
   candidates anonymously for a real article extract/vector and add them to
   the catalog. A final semantic match, not a website/domain affinity score,
   determines Topic association.

This could improve early source coverage without a central search API, but
depends on what pages actually link to; it cannot create a complete cross-web
index. A small synthetic and signed-out public-page coverage/precision study
should precede activation, with explicit privacy/publisher/store review if
candidate URLs or content are newly retained or sent off-device.
