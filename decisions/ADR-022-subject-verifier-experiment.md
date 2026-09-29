# ADR-022: Separate subject verification from embedding retrieval

Date: 2026-09-29.
Status: **Proposed; explicit owner approval requested, not yet received.**

## Evidence and direction

The owner wants opposing opinions about the same subject to share a discussion.
ADR-019 A's approved comparison now has 32 invented documents, including recurring
events, products/versions, disputed findings, delayed commentary and multilingual
opposing views. [Results](../apps/local-service/experiments/topic-identity/RESULTS.md)
show overlapping positive/negative scores. A title/lead vector retrieves all 12
held-out partners in the top five of this tiny pool, but the current 0.94/0.04
grouping rule produces false joins in every tested arrival order. No useful safe
automatic threshold was established. This is a failure-mode experiment, not a
general accuracy estimate or the provenance-approved human review task.

Preserve embeddings for candidate retrieval. A separate, measured subject check
must distinguish the referenced issue/event/product from the author's stance.
Potential evidence includes the entity and relationship, referenced occurrence,
product/version and question being debated. Publication time is not event time;
opposing judgments or disputed quantities alone cannot split an otherwise shared
subject. Missing/conflicting evidence must support abstention. Neither an E5
instruction prefix nor a second cosine threshold implements such a verifier.

This is an architectural hypothesis, not a claim that a small language model
solves it. Research supports combining representations and contextual/event
evidence rather than equating relatedness with identity: [entity-aware event
clustering](https://aclanthology.org/2021.eacl-main.198/) and [time-aware event
representations](https://aclanthology.org/2024.lrec-main.1416/). E5's own
[model card](https://huggingface.co/intfloat/multilingual-e5-small) says absolute
cosines are not calibrated probabilities and documents its compressed score range.

## Exact proposed experiment gate

- Acquire **one** additional model: `onnx-community/Qwen3-0.6B-ONNX`, quantized
  CPU-compatible graph (listed about 618 MB), tokenizer/config and license evidence.
  The [publisher's file listing](https://huggingface.co/onnx-community/Qwen3-0.6B-ONNX/tree/main/onnx)
  and [upstream model card](https://huggingface.co/Qwen/Qwen3-0.6B) establish artifact
  availability and upstream Apache-2.0 licensing, not quality for this task.
  Pin exact revisions, sizes and SHA-256 before acquisition; do not download all
  variants. Maximum **750 MiB additional retained/acquired files**. No assets
  are committed, bundled into the extension or automatically installed for users.
- Use the already installed pinned local runtime/tokenizer only. If unsupported,
  stop rather than acquire another runtime, dependency or model without approval.
  Acquisition contacts Hugging Face and its documented artifact delivery hosts;
  no page text, token or experiment inputs accompany those requests. Inference
  runs offline on this PC with no provider, listener or paid API.
- Freeze a small fresh project-created test set, prompts, output schema and
  scoring rule before inference. The first corpus's held-out families are now
  observed and must not be called unseen evidence for a newly tuned verifier.
  Compare title-only information with bounded invented article context, opposing
  stances, conflicting/missing anchors, multilingual text and prompt injection.
  No owner history, real pages, private material or repeated 6/6 review.
- Bound inputs and generated output, disable tools, validate decoded output as
  untrusted data, and reject unsupported invented facts. Use at most 64 synthetic
  documents, 1,024 input tokens/192 output tokens per call, one model session,
  at most 128 calls and 20 minutes total inference wall time. Report memory and
  latency rather than promising mobile suitability or a hard process-memory cap.
- Retain only model assets and clearly labeled synthetic fixtures/results in the
  development workspace until explicit manual removal. No production Source,
  Topic, comment, credential, capture policy, API payload or SQLite schema changes.

## Later boundary

Actual deployment of any verifier remains a separate gate. A neutral subject
card or structured anchors can expose page meaning even if they are not verbatim
quotes. Sending/storing them, a second vector, extra capture fields or raw text is
**not approved** by this proposed experiment. Decide exact on-device computation,
candidate evidence, output fields, retention/deletion, package size and performance
only after measurements. No silent historical Topic merges or comment movement.
If this small model fails, report it; do not silently download a larger one.

ADR-019 A remains approved but its proposed input change is retained only in the
isolated experiment; active capture/grouping is unchanged. Five-state toolbar work
can ship independently. Durable pairing/private/provider/remote/release gates stay.
