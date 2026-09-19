# Phase 0 Evidence Snapshot

Checked: 2026-09-19

This is a decision-oriented snapshot, not an exhaustive market, legal, or vendor review. Prices and platform rules must be rechecked before a purchase, deployment, or store submission. Legal observations are planning inputs, not legal advice.

## Market and history

- [Hypothesis](https://web.hypothes.is/help/quick-start-guide/) remains an active cross-page annotation product with a Chromium extension and bookmarklet flow. Its documentation shows URL/canonical/DOI aliasing and PDF fingerprints to associate annotations across representations ([document metadata behavior](https://web.hypothes.is/help/how-hypothesis-interacts-with-document-metadata/)). This is an important adjacent precedent, but it is still document/annotation centered rather than an evaluated event-topic graph.
- [Komment](https://komment.co/) and [Open Comments](https://open-comments.com/) currently market universal URL-level discussion extensions. Their public positioning validates that the basic "comments anywhere" idea is not differentiated on its own.
- The stable [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) provides interoperable body/target concepts. We should map against it before publishing an external contribution API, without forcing the internal Topic model to become URL-centric.
- Google's browser-sidebar annotation product Sidewiki was explicitly discontinued in 2011 as Google redirected resources to broader social initiatives ([official announcement](https://googleblog.blogspot.com/2011/09/fall-spring-clean.html)). That announcement does not establish why users did or did not adopt it; the planning inference is only that technical browser reach is insufficient evidence of durable demand. The current experiment must measure repeated value, trust, and discussion density rather than installs or generated activity. A deeper history/adoption study remains in the backlog.

Implication: the credible differentiation hypothesis is semantic concentration plus transparent human/agent participation, not the existence of a sidebar or comments on arbitrary URLs.

## Browser feasibility and permission constraints

- Chrome's [Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) supports a persistent extension UI and user-gesture opening. Chrome documents `activeTab` as temporary, gesture-triggered access that avoids an install warning ([activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)).
- Chrome's policy guidance requires the narrowest permissions needed and recommends optional permissions where possible ([permission guidance](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions), [Web Store user-data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)).
- Firefox supports extension sidebars, but its `sidebarAction` API is not API-compatible with Chrome's `sidePanel` ([MDN sidebarAction](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/sidebarAction)). Firefox also documents gesture-scoped `activeTab` access ([MDN permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions)).
- Mozilla's current [Add-on Policies](https://extensionworkshop.com/documentation/publish/add-on-policies/) require necessary permissions, disclosure/control for transmission, and explicit consent for passive/background transmission. They prohibit storing private-browsing data.
- Apple states that Safari Web Extensions reuse common web-extension formats but must be packaged as an app extension for macOS/iOS distribution ([Safari Web Extensions](https://developer.apple.com/documentation/SafariServices/safari-web-extensions)). This makes shared core code plausible, not zero-cost cross-browser parity.

Implication: build a browser-neutral resolver/client contract, but treat each browser's UI/permission adapter separately. A user-gesture prototype is lowest risk, while a passive count indicator needs an explicit privacy/product decision because it requires ongoing page observation.

## Privacy baseline

The GDPR requires purpose limitation, data minimization, storage limitation, and appropriate security in Article 5, and data protection by design/default in Article 25 ([official text](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng)). As a conservative engineering inference, treat URLs and deterministic URL hashes as potentially identifying/sensitive: paths and queries can expose private interests or resource identifiers, and common URLs can be enumerated. Qualified legal review must determine the actual roles and lawful basis for the chosen flow.

Implication: do not build a page-view log and then attempt to anonymize it later. Define allowed contexts, fields, purpose, linkage, retention, and deletion before the first connected extension. Exclude private browsing, local/private network targets, authenticated/sensitive contexts, and raw page text by default.

## Semantic-resolution options

- Sentence Transformers documents embeddings as a fast first stage for similarity/retrieval and notes that a second-stage reranker can follow candidate retrieval ([usage](https://www.sbert.net/docs/sentence_transformer/usage/usage.html)). Its multilingual MiniLM model card describes a 384-dimensional Apache-2.0 model covering 50 languages ([model card](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2)). These are benchmark candidates, not accepted models.
- pgvector provides exact search plus HNSW and IVFFlat approximate indexes, and explicitly recommends monitoring approximate recall against exact results ([pgvector README](https://github.com/pgvector/pgvector/blob/master/README.md)). At private-alpha volume, exact search may be an adequate baseline and avoids premature ANN tuning.
- OpenAI's current embedding reference lists `text-embedding-3-small` at USD 0.02 and `text-embedding-3-large` at USD 0.13 per million input tokens ([official model page](https://developers.openai.com/api/docs/models/text-embedding-3-large)). At 1,500 tokens per new source, 100,000 one-time source embeddings would be approximately USD 3 or USD 19.50 respectively, before retries, verification, taxes, and other processing. This illustrates that evaluation quality and data handling matter more than raw embedding price at early scale; it is not a provider choice.

Required benchmark:

1. deterministic URL and exact-fingerprint baseline;
2. at least one locally runnable English model;
3. optionally one multilingual/local model as a non-gating exploratory run; multilingual quality needs its own labeled slice and cannot be inferred from the English gate;
4. optionally one hosted embedding model only after egress approval;
5. exact candidate search before ANN; and
6. a verifier/abstention rule evaluated on labeled source pairs.

Report precision, recall/coverage, calibration by content class, latency, memory, input length behavior, and projected cost. Do not select a model from generic leaderboard scores alone.

## Hosting and cost references

- Supabase currently advertises a free development tier and a Pro plan from USD 25/month, including a small Postgres instance and daily backups ([pricing](https://supabase.com/pricing)). This reduces setup work but creates platform coupling and still requires data-region/DPA/security review.
- Hetzner's June 2026 price table lists small shared EU cloud instances from EUR 6.53/month including German VAT but excluding IPv4 for the CX23 class ([current adjustment table](https://docs.hetzner.com/de/general/infrastructure-and-availability/price-adjustment/)). Self-hosting can reduce direct spend but transfers patching, backups, availability, and incident response to the team.

Implication: both are candidates whose advertised entry price is below the planning cap; neither source establishes total system fit once database, backups, storage, egress, monitoring, auth, operations, and taxes are included. Choose only after a bottom-up comparison and measured prototype; do not purchase or deploy from this note.

## Evidence gaps before private alpha

- Current competitor adoption/retention evidence and failure interviews;
- browser-store review of the exact manifest and data disclosure;
- German/EU counsel review of legal basis, controller/processor roles, moderation, and notice/takedown;
- provider terms/auth/data-retention review for each proposed AI integration;
- measured hosting load and backup/restore test;
- accessibility research for the indicator and discussion UI; and
- moderation staffing/cost assumptions.
