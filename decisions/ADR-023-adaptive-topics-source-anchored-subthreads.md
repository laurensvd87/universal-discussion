# ADR-023: Adaptive Topic grouping and source-anchored subthreads

Date: 2026-09-29.
Status: **Owner-requested direction; concrete local data/migration package proposed,
not activated.** No threshold, schema or existing discussion changes in this turn.

## Request and current gap

The owner proposes a looser same-Topic threshold when few similar pages exist,
tightening as similar pages accumulate, with dynamic regrouping. Every root post
and its replies should follow the page on which that root was started. A reply
written while viewing another page still belongs to its root's conversation.

This deliberately revisits ADR-018/019's stable-assignment/no-comment-movement
boundary. It does not revive ADR-022's declined Qwen experiment. Capture scope,
model, one current vector per Source, pairing and local-only service stay unchanged.
The user's direction is not authority to guess missing historical provenance or
silently migrate the owner's database before the concrete package is approved.

Current `create-root` accepts only Topic ID and body. Contributions retain
Discussion/root/reply IDs, but no originating Source. `discussionView` filters by
Discussion ID; Source correction and ordinary revisits deliberately leave comments
in their old discussion. SQLite validators require these exact existing shapes.
This therefore requires a versioned domain/API/persistence change, not just a cutoff.

## Proposed model

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

## Proposed local migration and lifecycle boundary

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
  Before implementation, define Clear's exact treatment of learned-source threads
  explicitly linked to manual/fixture Topics; neither their learned origin nor
  deliberate manual destination can be silently ignored by the purge contract.
- Change Source membership and root projection in one SQLite transaction. Reject
  stale drafts/replies/mutations with a fresh-read requirement; never retarget an
  unsent draft automatically. Derive counts/icons/catalog/discussion from one
  coherent revision. Apply existing size/capacity limits before committing.

## Gate and bounded next slice

Before implementation, ask the owner to approve: the added persistent post-to-page
association, versioned local migration leaving old unanchored roots fixed, and
automatic whole-subthread reclassification under an evaluated bounded rule.
Explain that comments may appear under a different current Topic, within the same
local audience, and how Forget/withdrawal removes the new association. No existing
owner database migration/reset/regrouping occurs in this advisory turn.

After approval, stage a pure synthetic partition experiment and source-anchor
contract tests before activation: singleton/sparse/dense cases; opposing views;
distinct recurring events; duplicate flooding; arrival order; split/merge stability;
manual pins; legacy roots; changed page representations; replies from another page;
withdrawn roots; Forget/Clear/deletion; stale drafts and restart/transaction failure.
Freeze rule constants before judging hold-out results. Preserve separate fixture
and learned spaces. Lead Trust/Quality review precedes app activation. If the rule
cannot improve useful grouping without unacceptable churn/false joins, report it
rather than claim increasing density establishes correctness.
