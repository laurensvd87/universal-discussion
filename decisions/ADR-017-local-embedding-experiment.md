# ADR-017: First local learned-embedding comparison

Status: **Proposed; awaiting explicit owner selection and approval.**
Date: 2026-09-29. Research does not authorize installation or activation.

Revision: the owner's size/global-language clarification replaces the original
Granite/E5 shortlist with compact multilingual static variants versus E5. This
is a revised proposal, not acceptance of either package. See the
[size-focused research](../research/SMALL_EMBEDDING_FOOTPRINT_2026-09-29.md).

## Context

S3 is implemented under ADR-016. Related-source ranking still uses hand-authored
fixture vectors. The owner requested investigation and options for the next
model/input gate, not model acquisition. See the
[options and primary evidence](../research/LOCAL_EMBEDDING_OPTIONS_2026-09-29.md).

## Proposed bounded package

- Compare compact variants of `sentence-transformers/static-similarity-mrl-multilingual-v1`
  with multilingual-e5-small and a lexical baseline. No winner, global coverage
  or production-quality claim until local evidence exists.
- Static model official revision `bae9c8b1d48e8962a2ce7cb207662ed2a8441ccc`,
  Apache-2.0; `0_StaticEmbedding/model.safetensors` and tokenizer/config/license
  files. Reproducibly derive 128- and 256-dimensional int8 token tables with
  per-row float32 scales. Compare to full/sliced float32 controls, never silently
  use an unrelated community conversion or execute remote model code.
- E5 conversion repository `Xenova/multilingual-e5-small`, revision
  `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, upstream `intfloat/multilingual-e5-small`
  MIT license; `onnx/model_quantized.onnx` plus required tokenizer/config/license
  files. Verify conversion provenance and preserve upstream license attribution.
- CPU-only Node experiment using `@huggingface/transformers@4.3.0` and
  `onnxruntime-node@1.30.0`; inspect and lock transitive packages/native installers
  before execution. E5 uses ONNX; the static path uses a bounded local safetensors
  reader/exporter, compatible tokenizer and token-row pooling, without Python or
  training dependencies. Verify tokenizer/pooling parity and model dimensions;
  incompatible required runtime changes stop for review. No GPU/browser fallback.
- One-time artifact acquisition, approximately 572 MB for source model/tokenizer files,
  runtime additional. Maximum 1 GiB total download and 2 GiB installed experiment
  footprint. No fee, account, API key or paid service. Stop if bounds cannot fit.
  These are development bounds, not end-user installation requirements. Compact
  pack estimates are approximately 16.5/30.1 MB before runtime; measure actuals.
- Download only pinned artifacts from Hugging Face/CDN, npm and identified
  official runtime/native-binary distribution endpoints. Normal connection and
  artifact-request metadata reaches those hosts; no corpus, browsing data or
  vectors. Inspect redirects/install network behavior before allowing them.
- Use 64 project-created descriptors: 32 English, four each German/Dutch/Spanish/
  French/Arabic/Hindi/Chinese/Japanese, with cross-language counterparts. This
  is a small engineering smoke test, not validated global language coverage.
  Each descriptor is at most 4,096 characters and
  512 model tokens including task prefixes and special tokens. No real websites,
  private data, page body capture or extension
  payload expansion. Reject over-limit input; no silent truncation.
- Async CLI adapter/experiment in the service workspace; no new listener, HTTP
  feature, extension permission or change to the current fixture-only UI.
- Store assets/results/vectors only in ignored app-owned experiment directories
  until manual deletion, separate from canonical `demo.sqlite`. Publish neither
  reports nor vectors automatically. Source fixtures and test code may be committed.
- Freeze fixture expectations before inference; report retrieval, hard-negative,
  language/no-match and CPU time/memory evidence. Do not auto-merge Topics or
  call similarity a calibrated confidence. Existing confirmed links must not
  influence evaluation. The completed 6/6 owner task remains untouched.

## Integrity and model configuration

Published artifact metadata currently lists:

- [Static source weights](https://huggingface.co/sentence-transformers/static-similarity-mrl-multilingual-v1/blob/main/0_StaticEmbedding/model.safetensors):
  SHA-256 `8245ab78ee71dded845a82d2270fcb9e785b29dad0e1619f69d5390c47d9ba00`.
- [E5 selected file](https://huggingface.co/Xenova/multilingual-e5-small/blob/main/onnx/model_quantized.onnx):
  SHA-256 `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`.

These are publisher metadata, not hashes verified against locally acquired
bytes. Before loading, verify actual bytes, membership in the pinned revisions,
all required external-data/tokenizer/config files and licenses. Record a complete
manifest; reject mismatch or incomplete artifacts. Do not resolve mutable `main`
at inference time. No implicit first-run download in tests, popup or service.

Static inference averages approved token rows then normalizes, without E5's
prefix. Test preserved token IDs, special-token handling, zero rows, order-blind
hard negatives and quantization/truncation error. Bounded binary parsing must
validate metadata, offsets, dtype, dimensions and finite values before use;
record source and derivative hashes and the exact conversion recipe.
E5 symmetric similarity uses `query: ` on both sides, masked mean pooling and
normalization. Inspect graph output to avoid double-pooling. Vector-space identity
must cover assets, tokenization/prefix/pooling, dimensions and quantization.
Record exact runtime/version separately in execution provenance. Different
Node/WASM/native implementations may share a model ID only after explicit
numeric/ranking parity certification; until then treat them as incompatible.
Never mix model spaces or reuse the fixture 0.65 cutoff as a learned boundary.

Report each variant separately. Do not compare static and E5 vectors directly,
or let clients choose unrelated language models into one index. English quality
is the first priority, but supported cross-language matching must be evaluated
separately; language packs for UI do not change the vector space.

Disable remote loading after acquisition and preserve the existing network-denial
harness. Stop for incompatible CPU/operators, unsafe installer behavior, unknown
licenses, changed assets/runtime, exceeded resource bounds or required input/egress
expansion; report the concrete alternative before seeking additional approval.

## Next checkpoint and exclusions

The local service runs on the developer's device. This experiment does not select
hosted content processing. Preserve separate extraction/embedding and matching/
catalog interfaces: when matching is hosted, raw page/message content stays on
the user's device by default, as already proposed in ADR-013. Validate an
extension/mobile inference adapter before claiming that migration works; the
Node CPU comparison alone does not establish it. Do not add a hosted raw-text
embedding endpoint. Remote vector queries, URLs, titles and Topic lookup history
remain sensitive and separately gated; vectors are not treated as anonymous.

After implementation and local measurements, return to the lead for evidence
review and default-model recommendation. The learned UI/DTO labels, runtime
lifecycle and exact future input flow must be reviewed before activation in the
interactive service. Broader real-page capture requires explicit owner approval;
the comparison itself does not grant it. Ordinary implementation details within
an approved package do not require new votes.

No web search/crawler, arbitrary URLs, automatic Topic joins, provider inference,
accounts, hosting, purchase, publication or store submission follows from this
proposal. ADR-014/016 gates and the deferred provenance-approved R5 review remain.
