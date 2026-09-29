# ADR-021: Bounded generic article-container fallback

Date: 2026-09-29.
Status: **Explicitly owner-approved on 2026-09-29; 0.9.0 implemented and reviewed;
full-service browser regression pending the owner's free test port.**

The owner answered the exact bounded-fallback request: "Approve the bounded
generic fallback". This approves the package below, not wider ADR-019 A/C or
later external/private/release gates.

## Problem and evidence

The owner requests embedding support for public pages rejected as `capture-budget`
and supplies a GameStar article. ADR-018's 0.8.1 efficiency correction addresses
two reproduced avoidable costs and separates diagnostics, but cannot establish
support for that page within its existing main/article/main-role-only policy.

Two bounded anonymous HTTP reads of the exact supplied public page returned a
361,054-byte response. In a temporary inert browser DOM, with all browser network
and page scripts disabled, the old reader exhausted 1,500 visits in region
discovery (about 7.5 ms); the optimized reader returns `capture-node-budget`
(about 6.5 ms). These times are individual observations, not benchmarks. There
were 145 head children and 1,389 elements, but no MAIN, ARTICLE, role=main,
itemprop articleBody, or Article/NewsArticle itemtype markers. Ten class values
contained "article"; counts alone do not establish which contains the article.

This is anonymous static HTML, not the owner's live rendered DOM. External CSS,
scripts, consent and dynamic structure can differ. No raw HTML/article text or
attribute values were printed, committed, retained or sent to a model/backend.
Only fixed categories/counts were returned; the diagnostic profile was removed.
The research reader's access to public text does not validate our extractor.

## Approved scope

Permit a generic, bounded article-container detector for public pages without
the current eligible semantic regions. No website-specific adapters are proposed.

- Raise structural traversal from 1,500 to at most **10,000 work steps**, keeping
  the **40 ms** checked time limit. These limits still stop rather than promise
  universal coverage. Do not create an unbounded document materialization or
  claim native operations can be preempted at exactly the deadline.
- Choose a likely article container from bounded structural evidence, then read
  at most **4,096 characters**. Never fall back to unrestricted whole-body text.
  Recheck all excluded ancestors/subtrees, including forms, editables, comments,
  login/paywall-marked, hidden, navigation and frame content. A class name alone
  is not proof of publicness or a reliable article boundary; ambiguity abstains.
- Preserve the existing public-only/dedicated-profile scope, Start/Stop/window/
  permission/document fences, maximum 200-character title and 512 model tokens.
  No private-page or access-control bypass, new permission, model/runtime download,
  provider, external search or per-site integration.
- Raw sample remains transient on-device. The existing URL/title/384D-vector/
  version payload goes only to the paired local service, retained until deletion.
  No new outbound field or history is introduced. More pages/sections may now
  qualify, and the heuristic can choose the wrong section; disclose this limitation.
- Preserve existing Topic links/comments/manual corrections. Do not bulk recapture,
  reset data, merge discussions or lower the Topic-similarity threshold.

## Implementation rule and input compatibility

Version 0.9.0 preserves the first eligible MAIN/ARTICLE/role=main path. Only a
complete bounded search with no such region can select a fallback; an empty
semantic region or budget/attribute failure never unlocks a second choice.
Single-pass stack aggregates use native text-node lengths, not raw text, before
selecting a region. All work shares 10,000 steps and the checked 40 ms deadline.

- Candidate: DIV/SECTION with whole whitespace/hyphen/underscore-delimited
  article/story/post/entry **and** body/content/text tokens in id/class.
- Require at least two paragraphs of 80 native characters, at least 300 paragraph
  characters, paragraph density at least 60%, and link density at most 25%.
  Additional fallback-only related/recommended/teaser/card/list/grid/promo
  token exclusions supplement, never remove, the existing exclusions.
- Nested qualifying wrappers collapse only if the narrower candidate retains at
  least 90% of outer paragraph evidence. Multiple disjoint candidates, or a
  wrapper with substantial separate prose, abstain. No body/HTML root qualifies.
- Selected fallback sampling also checks normalized length/density to reject
  whitespace-inflated evidence, with no extra raw-text sample allowance.

Legacy captures retain `main-text-prefix/v1`; fallback captures record
`article-container-prefix/v1`. These **two exact versions are deliberately
vector-compatible**, because E5 weights, tokenizer, query prefix, 512-token cap,
pooling, normalization and 384D model space are unchanged. Region selection has
different provenance, not a different embedding transform. The existing model ID
and historical asset-manifest identity remain; no assets need repackaging.
Reader projection, client ingestion, backend ingestion/persistence, all-member
matching, competing-member checks and related candidates share the reviewed
allowlist. Unknown versions and other same-dimensional models remain rejected.
No automatic reassignment, threshold change, migration or re-embedding of stored
Sources occurs. A fresh backend process is required to accept the new tag.

A further inert-DOM structural diagnostic found one exact dual-token candidate:
17 paragraphs, 14 with native length >=80, 3,240 paragraph characters out of
4,242 eligible characters, and 928 link characters (21.88%). These counts pass
the rule; they are not proof of live extraction or semantic matching quality.

## Required implementation review

Define and test the generic candidate rule before activation. Establish how input
versioning separates any changed successful sampling; preserve exact existing
main/article behavior where possible. No version identity may falsely claim
unchanged inputs, and no silent incompatible-vector comparison is permitted.
Use bounded Sol Medium coding slices with independent Trust review, synthetic
positive/hard-negative container fixtures and actual isolated-world Chrome tests.
Verify candidates cannot import excluded descendants/ancestors, broad page chrome
or stale documents. Test ambiguity, traversal/time/attribute failures, and the
normal embedding/shared-comment flow without the owner's database/profile.

## Checkpoint evidence

Independent Sol Medium Trust review finds no material blocker (65 scoped checks).
Separate QA review checks fixture/assertion wiring; lead adds an explicit
mixed-capture-policy Topic/comment assertion after SQLite restart. Offline
restricted suite: 659/659; normal: 658 plus one intentional skip; indicator:
471/471; socket-denied backend: 69/69; secret scans: 153 + 48 files, zero findings.
Actual Chrome 154: 47 eligibility/isolated-world reader checks and 15 session
checks pass, without external requests, runtime errors, inference or model loads.
Existing manual reload/restart/native-permission-dialog evidence gaps remain.

The **unmodified**, serialized production collector succeeds 3/3 on a further
anonymous static GameStar response (360,829 bytes): `article-container-prefix/v1`,
3,796 text characters, 141 title characters, elapsed 8.4/6.4/4.9 ms. These are
individual observations, not performance guarantees. The temporary DOM used
`about:blank` for expected identity; all browser network and page scripts were
disabled, external styles absent. No raw sample/title/HTML/attribute values were
printed or retained, embedded or sent to the backend; the temporary profile was
removed. This establishes fallback extraction on that inert snapshot, not live
owner-page extraction quality, model matching quality or final Topic assignment.

Full 0.9.0 embedding/shared-comment/restart browser and loopback transport checks
await owner shutdown of their running service on port 4174. Do not stop or contact
it, claim the new full-loop assertions passed, or reset its data. The checkpoint
preserves prior full-loop evidence as historical, not current verification.

No GameStar success is promised before a faithful check. If the new candidate rule
needs larger time/text budgets, private scope, another dependency/provider/model
or a materially broader fallback, stop and ask rather than treating this proposal
as blanket authority. ADR-019 A was subsequently separately approved and measured;
its title/lead proposal remains experiment-only after false joins. C durable pairing
and every later external/privacy/release gate remain pending.
