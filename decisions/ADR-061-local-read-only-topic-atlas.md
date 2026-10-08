# ADR-061: Standalone local Topic Atlas

Date: 2026-10-08. Status: owner-requested local implementation; verification in STATUS.

## Decision

The owner requested a separate visual program showing the growing catalog,
Topic proximity and clickable source pages. `apps/topic-dashboard` is a
standalone, dependency-free Node 24 program. Each invocation reads the existing
SQLite `demo_state` document **read-only**, creates an interactive, self-contained
HTML snapshot in the user's OS temporary directory, and opens that file in the
default browser. It does not use the extension, the loopback service, pairing,
ChatGPT, a new listener, or an external asset/CDN. Re-running the program
refreshes the snapshot; an already open file is not live-synchronized.

The report includes only the currently retained owner-local learned
Sources: bounded title, URL, host, current Topic association and approximate
2D coordinates. It includes Topic titles/kinds/counts and a small set of
nearest-neighbor edges computed from original-vector cosine scores. Synthetic
fixture Sources are counted separately but not drawn. Vectors, page text,
comments, AI drafts, account identifiers, operation IDs and pairing/provider
secrets are not exported. Links open only after user interaction. The HTML
snapshot itself is a local retained copy of page titles and URLs in the OS
temporary directory; the owner can delete it and must avoid sharing it if
their catalog contains sensitive browsing. The original public-profile policy
cannot prove every retained URL/title is public; historical captures may
include unwanted material. The temporary file is outside Git.

## Limitations and gates

2D PCA is a visualization, not the production Topic algorithm; nearby screen
positions need not imply Topic identity. Edges show vector proximity, not a
verified same-Topic judgment. The catalog currently includes many single-page
Topics. The dashboard's bounded in-memory all-pairs graph reports an explicit
capacity error above 1,000 learned Sources rather than silently hiding pages;
this is a dashboard limit, not a storage quota. A scalable graph/index and
live synchronization require separate work. No new private-page capture,
hosting, distribution, store/policy clearance or provider permission follows.

Synthetic offline/restricted tests and a separate headless-Chrome smoke pass.
The read-only owner-catalog export produced 110 plotted pages and 253 nearest
edges. The real-data screenshot and its temporary Chrome profile were removed
after visual inspection; the generated dashboard HTML remains in the user's
OS temp folder for viewing.
