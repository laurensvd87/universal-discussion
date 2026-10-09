# Topic identity needs a different representation, not just a lower cosine

Status: research direction, not a model or live-matcher decision. 2026-10-09.

## Evidence from this project

Across synthetic multilingual viewpoint sets and the approved GlobeSumm
research corpus, the existing E5 vector often retrieves a same-event article
near the top while precision-first admission either abstains heavily or makes
adjacent-event false joins. A single cosine threshold is therefore useful for
candidate discovery but not a reliable definition of one shared discussion.
The [frozen local results](../apps/local-service/experiments/topic-encoder/globesumm-graph-v1/RESULTS.md)
and [v6 holdout results](../apps/local-service/experiments/topic-encoder/adaptive-topic-graph-v1/RESULTS.md)
show the tradeoff. More threshold tuning on these spent sets would overfit.

## Relevant published approach

The [ACL 2025 Matryoshka news-clustering paper](https://aclanthology.org/2025.acl-long.124/)
explicitly distinguishes *same story*, *same topic* and *same theme*, and its
authors train a multilingual embedding with different granularity levels.
The paper's task definition treats framing and tone as separate from whether
articles cover the same substantive news story. This aligns with the owner's
opposing-viewpoint requirement, but its reported SemEval correlation is not
our false-Topic-join or whole-discussion-routing metric. The authors'
[repository](https://github.com/hanshanley/multilingual-matryoshka-news)
lists model weights by request and currently warns that earlier shared files
may have been corrupted. Its fine-tuned base model is not a ready extension
drop-in: the [upstream multilingual-E5-base weight file](https://huggingface.co/intfloat/multilingual-e5-base/blob/main/model.safetensors)
is about 1.11 GB before browser packaging/optimization, versus this project's
already packaged roughly 135 MB small model/tokenizer. No model, weights,
code or dataset from that research was downloaded or incorporated.
The paper reports collecting publisher articles from live URLs for training;
its academic experiment is not publisher-rights or store-policy clearance for
this product, so that acquisition path is not adopted here.

## Candidate architecture to test, not activate

1. Compute a compact, on-device **event/story representation** from the
   article's title and bounded lead/body, separately from the broad semantic
   vector already used for candidate retrieval. The event representation
   should emphasize named actors, action, object, location and distinctive
   quantities while resisting sentiment/framing changes. This is a model
   objective, not a promise that these facts can be extracted reliably in all
   languages without an LLM. First measure whether simply running the
   *already packaged* encoder on the title alone helps; this would avoid a
   new model download, though it still adds on-device inference and would
   require explicit approval before retaining/uploading a second vector.
   That first [offline GlobeSumm train comparison](../apps/local-service/experiments/topic-encoder/globesumm-title-v1/RESULTS.md)
   was negative: title-only lost true-event joins and retrieval versus
   title+lead under all three frozen rules, so it was stopped before
   validation. It is not a proposed extra vector.
2. Keep broad semantic proximity as `related`, possibly with overlapping
   nearby Topics. Route a root post to a single hard Topic only when event
   evidence distinguishes that Topic from nearby competing developments;
   otherwise abstain and show related discussions separately.
3. Treat news-event identity, enduring product identity and broad claims as
   distinct evaluation strata. Publication time may help news-event evidence
   but must not become a universal product cutoff.
4. Evaluate on independent cross-publisher story labels, adjacent-event hard
   negatives, opposing viewpoints, multiple languages, large same-story
   cohorts and catalog growth. Score false *group* joins and root-route churn,
   not only pair ranking. With no rights-cleared real data, leave this at a
   proposal.

If training is attempted later, positive examples should pair different
languages and viewpoints of one precisely identified event. Hard negatives
should share the actor or broad theme but differ in the central action,
announcement, product variant or outcome. A random unrelated negative is
too easy and does not teach the boundary that has failed in our tests.
Evaluate a compact adapter/distillation against unchanged small E5 before
considering a larger client asset. Prior small synthetic-only heads did not
establish enough gain, so no such model is authorized for shipping now.

An additional retained vector/signature, changed capture payload, model asset,
or live regrouping would each require the owner/Trust review and migration
plan in ADR-064. The current owner-local experiments do **not** make those
changes.
