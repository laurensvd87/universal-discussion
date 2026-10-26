# ADR-139: Local exemplar evidence instead of another sparse root-head gate

Date: 2026-10-20. Status: implementation and development screen only.

## Why change the method

ADR138 completed its real128 experiment without capture failures, but accepted
only13/32 held-out pages. All accepted roots were correct; the fixed baseline
accepted19/32 with correct roots too, so root precision did not improve. The
consensus still chose a wrong sibling for Azul. Only four cases have child gold;
the other28 cannot establish child quality. All previous experiments stay closed.

Three training and three calibration positives per root inadequately describe a
broad semantic union. A mandatory independent root-head veto also prevents useful
child evidence from recovering an abstention. We will not fix that by changing
the closed test's cutpoints or declaring a smaller vector a semantic hierarchy.

## New candidate method

Use bounded, reviewed, grouped real exemplars and explicit scope evidence. Keep
separate MEMBER (partial membership), STOP (maximum supported node), and OUTSIDE
(outside a declared subtree) annotations. Parent-only membership must not become
a negative child example. Descendant evidence may support approved ancestors;
a broad centroid is not a mandatory gate. Multiple translations or captures of
one entity contribute one group maximum, not repeated votes.

Calculate exact positive support, explicit negative contrast and contrast with
incompatible positive evidence. Per-node cuts are fitted outside the scorer;
scores and cutpoints are not probabilities. Preserve all supported competing
paths and choose their lowest common ancestor. Plausible explicit STOP evidence
can keep the result broad. Conflicting top-level branches remain unresolved.
Disabled independent node nomination does not erase approved ancestry of a
supported descendant. Cap topology, evidence, work and output before scoring.

A separate reviewed exact-title/opening-token alias inventory provides additional
entity cues. It does not infer semantic centrality, normalize away unknown site
suffixes, accept ambiguous acronyms automatically, or establish canonical write
authority. Even an incidental/code/list mention can satisfy a lexical cue when
the title matches: an external semantic/negative gate is still necessary. Exact
captured text hashes, builder identity and Source/version bind every result.

Both components are experimental, immutable after compilation, have no production
imports and cannot silently replace canonical Topic assignment. Owner broad/specific
cuts remain presentation choices, separate from deepest supported semantic identity.

## First development screen, not another held-out claim

Before obtaining new independent evaluation data, reuse already consumed saved
vectors for an explicitly developmental comparison. No new model inference,
recapture, provider, owner database or crawler action is involved.

Compare two declared evidence sets using the existing .75body/.25title paired
representation and current-static input view:

1. Real TRAIN48, root-only MEMBER labels,16root topology.
2. Those48 plus closed C TRAIN130,63nodes. C's complete maximum-node annotations
   become STOP evidence; its four outside cases may explicitly annotate each
   root as outside. Scope-specific outside group IDs do not count as independent
   positive support. No C calibration/development/test vectors become exemplars.

Use existing real CAL48 and, for the augmented candidate, C CAL193 to fit node
cuts. Declared grid: minimum similarity .70 through .98 in .02 steps; minimum
rival contrast0/.005/.01/.02/.03/.05; minimum explicit-negative contrast0/.01/.03;
minimum positive groups1/2. Require at least three distinct accepted positive
calibration groups and no known calibration errors for an enabled independent
cut. Unknown child labels are excluded from that child's fit, never fabricated
as negatives. Maximize accepted positives, then prefer larger similarity,
rival contrast, negative contrast and support, in that order. This is optimization
on reused development data, not a confidence or release guarantee.

Report consumed real32 separately as diagnostic development evidence, including
root coverage, wrong roots and all four partial child anchors. No alias inventory
is fitted from those outcomes and no alias results are mixed into this first
semantic screen. Hash all inputs, sources, declared settings and saved decisions;
exclusive output creation prevents accidental overwrites. New code is reviewed
and tested before the screen; old frozen files are never modified or replayed.
Input parsing uses the originally pinned bytes. Complete results require final
input/source hash rechecks; this detects ordinary drift, not adversarial filesystem
ABA or loaded-module attestation. The pure-JavaScript development runner requires
a256MiB heap, checks RSS384MiB/physical reserve1GiB and90seconds cooperatively, with
bounded grid/scorer work. These are not an external hard-termination supervisor.

## Subsequent evidence and integration gates

Real child-level labels must cover generic parents, unseen children, siblings,
ambiguous names and multiple page types before specificity can be enabled. Entity
translations/derivatives stay in one split group. Evaluate known-entity recognition
separately from unseen-entity semantic generalization. Obtain new blind evaluation
data after method selection; the consumed32 are no longer an independent test.

The full requested outcome still requires actual fast admission, an atomic canonical
root/provenance bridge, consumer transition, parent feeds, owner controls and UI/load
tests. Fresh Source titles cannot reconstruct historical originating inputs. Keep
old discussion IDs/destinations; no new semantic metadata grants posting/provider
authority. No edits to applied001-009, live migration or crawler interruption here.
