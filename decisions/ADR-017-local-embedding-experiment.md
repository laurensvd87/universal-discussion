# ADR-017: First local learned-embedding comparison

Status: **Proposed; awaiting explicit owner selection and approval.**
Date: 2026-09-29. Research does not authorize installation or activation.

## Context

S3 is implemented under ADR-016. Related-source ranking still uses hand-authored
fixture vectors. The owner requested investigation and options for the next
model/input gate, not model acquisition. See the
[options and primary evidence](../research/LOCAL_EMBEDDING_OPTIONS_2026-09-29.md).

## Proposed bounded package

- Compare IBM Granite Embedding 97M Multilingual R2 and multilingual-e5-small,
  plus a lexical baseline. Both output 384-dimensional vectors. No winner or
  production-quality claim until local evidence exists.
- IBM official repository `ibm-granite/granite-embedding-97m-multilingual-r2`,
  revision `835ad14087e140460703cf0fae09f97d469d65c2`, Apache-2.0;
  `onnx/model_quint8_avx2.onnx` plus required tokenizer/config/license files.
- E5 conversion repository `Xenova/multilingual-e5-small`, revision
  `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, upstream `intfloat/multilingual-e5-small`
  MIT license; `onnx/model_quantized.onnx` plus required tokenizer/config/license
  files. Verify conversion provenance and preserve upstream license attribution.
- CPU-only Node experiment using `@huggingface/transformers@4.3.0` and
  `onnxruntime-node@1.30.0`; inspect and lock transitive packages/native installers
  before execution. No GPU/browser fallback or arbitrary remote model code.
- One-time artifact acquisition, approximately 260 MB for model/tokenizer files,
  runtime additional. Maximum 1 GiB total download and 2 GiB installed experiment
  footprint. No fee, account, API key or paid service. Stop if bounds cannot fit.
- Download only pinned artifacts from Hugging Face/CDN, npm and identified
  official runtime/native-binary distribution endpoints. Normal connection and
  artifact-request metadata reaches those hosts; no corpus, browsing data or
  vectors. Inspect redirects/install network behavior before allowing them.
- Use 48 project-created EN/DE/NL descriptors, each at most 4,096 characters and
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

- [IBM selected file](https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2/blob/main/onnx/model_quint8_avx2.onnx):
  SHA-256 `a6022dd8220ea6f6595562a1328ee216f4a94faa55362f2f4747c80f1e78772e`.
- [E5 selected file](https://huggingface.co/Xenova/multilingual-e5-small/blob/main/onnx/model_quantized.onnx):
  SHA-256 `f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193`.

These are publisher metadata, not hashes verified against locally acquired
bytes. Before loading, verify actual bytes, membership in the pinned revisions,
all required external-data/tokenizer/config files and licenses. Record a complete
manifest; reject mismatch or incomplete artifacts. Do not resolve mutable `main`
at inference time. No implicit first-run download in tests, popup or service.

IBM uses CLS pooling plus normalization without an E5 prefix; E5 symmetric
similarity uses `query: ` on both sides, masked mean pooling and normalization.
Inspect graph output to avoid double-pooling. Identity must cover assets,
tokenization/prefix/pooling, dimensions, quantization and runtime. Never mix model
spaces or reuse the fixture 0.65 cutoff as a learned decision boundary.

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
