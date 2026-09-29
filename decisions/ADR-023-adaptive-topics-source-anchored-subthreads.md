# ADR-023: Adaptive Topic grouping and source-anchored subthreads

Date: 2026-09-29.
Status: **Local source-association/migration and whole-subthread regrouping package
explicitly owner-approved on 2026-09-29; implemented/reviewed in 0.11.0.**

The owner answered "yes" to the explicit local source-link, automatic whole-thread
regrouping, fixed legacy threads and removal-lifecycle package. They additionally
request a small clickable icon on each post, directly opening its originating
page in a new tab. This approves the following post-origin extension, not private
inputs, a provider, another model or an external deployment.

## Approved clickable source provenance

- New roots and replies may retain an opaque reference to the deliberately
  selected, already known public Source at publication. Root provenance determines
  its grouping anchor; reply provenance is only the reply's link and never changes
  its root/destination. Manual Topic-only posts and legacy posts have no invented
  origin. No new tab read, arbitrary URL submission, screenshot or vector is needed.
- Visible posts expose only that retained Source's existing URL/title through the
  authenticated local discussion DTO. This makes the post-to-page association
  visible in the same local discussion audience. The composer discloses the source.
  Deleted/forgotten/unknown origins have no link; editing does not rewrite origin.
- A small keyboard-accessible link uses a localized accessible name and destination
  tooltip, validated HTTP(S) URL, `_blank`, `noopener noreferrer` and no-referrer.
  Nothing navigates, prefetches or loads favicons until the user clicks. The target
  is the current live page, not an archived copy or a promise of unchanged content.
- Forget removes all root/reply references to that Source and pins dependent
  subthreads at their current Topic. Withdrawal removes that post's source reference;
  root withdrawal pins surviving replies. Logical deletion is not forensic erasure.
- First migration is versioned/transactional, validates exact legacy shape, and
  leaves existing roots Topic-pinned. No owner database is used in agent tests.
  A root may keep a non-identifying learned-origin flag so Clear can remove learned
  threads even after an explicit move to a manual Topic or Source removal. Legacy
  manual/fixture contributions remain outside that learned cleanup scope.
- Root/reply IDs and original publication reference remain stable. A cached
  `discussionId` routing field may be updated atomically across the subtree as the
  materialized current projection; bodies, authorship and reply identity never move
  through copy/delete/recreation. Every client read/count uses the same revision.

## Request and pre-implementation gap

The owner proposes a looser same-Topic threshold when few similar pages exist,
tightening as similar pages accumulate, with dynamic regrouping. Every root post
and its replies should follow the page on which that root was started. A reply
written while viewing another page still belongs to its root's conversation.

This deliberately revisits ADR-018/019's stable-assignment/no-comment-movement
boundary. It does not revive ADR-022's declined Qwen experiment. Capture scope,
model, one current vector per Source, pairing and local-only service stay unchanged.
Approval is not authority to guess missing historical provenance or reset data.

Before this change, `create-root` accepted only Topic ID and body. Contributions retained
Discussion/root/reply IDs, but no originating Source. `discussionView` filters by
Discussion ID; Source correction and ordinary revisits deliberately leave comments
in their old discussion. SQLite validators require these exact existing shapes.
This therefore requires a versioned domain/API/persistence change, not just a cutoff.

## Approved model

`Source -> current Topic <- source-anchored root -> all replies`

- A root's stable contribution ID is its subthread ID. A new root deliberately
  started from a known Source records that opaque Source reference, a bounded
  representation stamp, and its original Topic reference. This is an association
  between the post/author and an already retained page, not a full browsing log.
  No extra body text, raw page text, second vector, model or network recipient.
- A root started by choosing a Topic directly has a Topic anchor instead. Do not
  silently attach the currently open website to a manually chosen Topic. The
  posting UI names the selected source/destination; the server validates the
  reference, allowed mode and expected version against its state.
- Replies inherit the root's destination irrespective of their authors' current
  pages. Roots/replies keep IDs, authors, bodies, timestamps, edit/withdrawal state
  and reply order. Regrouping changes the current Topic projection, never copies,
  reauthors, embeds comment text or splits a reply tree.
- Current Topic discussions derive their root set from these anchors. A page can
  move between Topics and take its anchored roots with it; root/reply identities
  remain stable. Manual Topic roots remain pinned. Explicit manual Source links
  override automatic regrouping. Topic IDs cannot be reused for unrelated groups;
  keep bounded change context and deterministic split/merge routing.
- Preserve original publication context and show a regrouping indication. Apply
  existing visibility/withdrawal/deletion rules at every projection; no new
  audience, AI publication or private-discussion capability is introduced.

## Adaptive grouping hypothesis — not calibrated semantic identity

Use existing compatible vectors in the local service. No recapture, model
download, new dependency or external search is required merely to recompute a
candidate partition of the bounded catalog.

The useful adaptation signal is the structure of the nearby embeddings, not
global page count or popularity. A proposed range such as 0.90–0.94 is an initial
experiment, not a confidence scale. More pages can justify a finer split only if
there are sufficiently supported, cohesive subgroups with a meaningful separation.
Duplicate URLs/copies cannot be independent corroboration; count distinct sample
support conservatively. Compute neighborhood evidence independently of the current
Topic membership to avoid a split lowering its own threshold and immediately merging.

Require a deterministic bounded evaluation, minimum support, an ambiguity fallback
and stronger evidence for changing an existing assignment than retaining it.
Separate transition thresholds/cooldown can limit oscillation; they do not make
an incorrect split semantically correct. Do not silently replace all-member and
competing-Topic guards without a measured rule and explicit acceptance criteria.

Hierarchical/density-aware clustering provides relevant algorithm families, not a
guarantee for these vectors; see the [primary clustering documentation](https://scikit-learn.org/stable/modules/clustering.html#hdbscan).
No scikit-learn/HDBSCAN installation or production algorithm choice follows.
The measured E5 failures include closer scores for different events than for
opposing views of one event. A denser corpus may separate opinions rather than
events. Adaptive grouping manages granularity and reversible mistakes; it does
not by itself solve viewpoint-independent Topic identity.

## Approved local migration and lifecycle boundary

- Old roots have no reliable Source lineage: migrate as pinned legacy Topic
  roots with all replies, never infer a source from text or present membership.
  Any later explicit source attachment is a separate deliberate correction.
- A Source URL may change meaning (especially live blogs/homepages). The root's
  representation stamp detects a changed stored representation; it cannot recover
  old text/vectors. For the first one-vector version, conservatively pin affected
  existing threads to their last Topic rather than retarget them from new content.
  Reclassification of historical versions needs a separate retention design.
- Retain the source-root link locally until explicit removal. Forget Source
  converts dependent roots to their current Topic anchors and purges their Source
  references/stamps, preserving the existing promise that forgetting does not
  delete comments. Root withdrawal likewise removes its source-origin association
  and pins surviving reply topology; it cannot erase others' replies.
- Topic deletion and Clear must operate on the explicitly disclosed current
  thread set, with expected-version checks. They purge associated lineage/receipts
  and cannot resurrect moved/deleted bodies. Reversal restores mappings only for
  still-existing allowed records, never deleted content or removed Source links.
  Clear also purges learned-origin root sets explicitly moved to manual/fixture
  Topics, while unrelated manual/fixture comments remain. A non-identifying root
  flag preserves this classification after Source removal; the UI discloses it.
- Change Source membership and root projection in one SQLite transaction. Reject
  stale drafts/replies/mutations with a fresh-read requirement; never retarget an
  unsent draft automatically. Derive counts/icons/catalog/discussion from one
  coherent revision. Apply existing size/capacity limits before committing.

## Implemented rule, verification and limits

`adaptive-supported-partitions/v1` runs over the retained bounded compatible
one-vector Source catalog on normal ingestion, correction, Forget and Topic
deletion. Opening/migrating a database alone does not run regrouping. It uses:

- 0.90 complete-link sparse floor; 0.94 cohesive subgroups, with 0.04 minimum
  separation and two nonduplicate representatives in each supported subgroup.
  Identical URLs or cosine >=0.995 cannot manufacture independent support.
- Candidate merging must satisfy all cross-pairs, internal cohesion and a 0.04
  margin over the nearest outside member. Manually pinned Topics never expand
  automatically. Previously incoherent provisional groups can split below 0.90.
- A bounded `retainTight` boolean on learned Topics makes supported tightening
  sticky: deleting support does not immediately remerge groups at the looser floor.
  This deliberately favors stability over automatic loosening at lower density.
- Deterministic overlap-based Topic-ID reuse, never reuse of an unrelated orphan
  container. Topic-only/legacy roots stay put; source-root routing updates all
  replies in the same repository revision. Capacity failure rolls back, not eviction.
- `demo-state/v2` first-open migration validates exact v1 state, increments its
  revision once and pins old roots. Representation stamps cover URL/vector/
  extractor, not display title; even small vector drift conservatively pins old
  threads. One current vector cannot reconstruct old content or certify identity.

Four frozen invented-vector cases plus 11 planner tests prove structural mechanics
and stability, not semantic quality. The duplicate-flooding fixture deliberately
retains four false joined pairs in an already incorrect group: repeated copies
provide insufficient independent evidence to split it. The earlier learned E5
synthetic experiment still shows overlapping event/opinion scores. This owner-local
activation accepts a reversible experimental grouping rule, **not** a validated
viewpoint-independent classifier. No additional inference/model package is added.

Backend 93/93, extension restricted 763/763, indicator 501/501 and loopback 2/2 pass.
Actual Chrome checks cover 21 full matching/comment areas and 20 legacy discussion
areas, including real keyboard source-icon navigation, whole-thread correction,
per-reply origin, Forget and SQLite restart. Independent Trust review fixes stored
receipt/learned-origin corruption checks and then reports no material finding.
See [STATUS](../plans/STATUS.md) for evidence scope and remaining manual boundaries.

## Completed gate and future boundaries

The owner approved the added persistent post-to-page association, versioned local
migration leaving old unanchored roots fixed, and whole-subthread reclassification.
Do not repeat this approval. Mechanics measurement and Trust review precede activation;
new privacy/provider/model scopes still require separate approval. No owner data
is used for implementation tests or silently regrouped by an agent tool call.

The staged mechanics and lifecycle work above is complete. No owner database was
used by agent tests. Next is owner feedback after restart/reload, not another
synthetic review or additional model. New real training/provenance corpora,
private content, remote audiences, durable credentials and publication retain
their separate gates. Report wrong joins/splits; increasing density alone does
not establish correctness or justify an undisclosed representation change.
