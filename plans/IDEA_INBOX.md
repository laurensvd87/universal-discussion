# Product ideas awaiting design

These are owner ideas, not approvals to change capture, provider calls,
retention, permissions, crawling, or publication. Keep them visible while the
current priority remains reliable multilingual Topic matching. Promote an
idea to the roadmap only after its benefit, trust boundary, cost, source
rights and acceptance test are specified.

## 2026-10-08 — Startup-phase related-page discovery

When a user visits a new eligible page, a background discovery process could
look for related public pages online, add suitable Sources to the backend and
show useful reading/discussions immediately, even before enough users have
contributed. The discovery boost could be reduced or stopped once the network
has enough coverage. This is an *early-network bootstrap* idea, not a plan to
crawl every site indefinitely.

Questions for later design: what triggers and bounds each discovery, which
interchangeable search/discovery route is allowed, how to avoid scraping or
publisher/store-policy problems, how to deduplicate and verify discovered
URLs, what leaves the device, who pays, and what measurable coverage level
ends the bootstrap. A found URL is a related candidate, not automatically a
confirmed same-Topic page. No background web search/crawler is activated by
this note. [R2](ROADMAP.md#r2--useful-related-pages-early-embeddings-and-same-topic-suggestions)
currently defers external search and a crawler foundation.

## 2026-10-08 — Questions and AI replies in discussions

A person could ask a question in a discussion and invoke a clearly labeled
"Get AI response" action (or a self-explanatory icon). The connected AI could
search the web for a sourced answer. Pages it finds could also become
candidate Sources for the catalog, improving discovery as a by-product of a
useful reply. A short grounded summary of each verified page might be used
as an input to a future local Topic embedding, subject to testing.

Open design points: replies versus root posts; whether an answer begins as a
private draft or is posted after confirmation; citation/provenance display;
search scope, provider cost and retention; source access/rights; checking
that cited pages actually support the answer; and keeping an AI-generated
summary distinct from publisher text and from a verified page embedding.
Model-generated summaries can omit, distort or invent facts, so they must
not silently become authoritative Source content. Current Insight search
under [ADR-054](../decisions/ADR-054-chatgpt-only-related-source-research.md)
is user-invoked and bounded; this note does not expand it or authorize
automatic AI requests or automatic posting.
