# Local embedding options

Date: 2026-09-29. Research only; no model/runtime downloaded or activated.
Scope: the next model/input gate after S3, not external search or real-page capture.

## Recommendation

Compare **IBM Granite Embedding 97M Multilingual R2** with
**multilingual-e5-small**, plus a simple lexical baseline, on a small frozen
project-created English/German/Dutch corpus. Both offer permissively licensed,
384-dimensional embeddings. Prefer the smaller official IBM artifact as the
first candidate, but select the eventual default from measured local results,
not model-card leaderboards. No paid inference provider or API key is needed.

The useful first capability is finding related known Sources across wording and
languages. Similarity alone must not merge Topics: a product launch and a recall
can be close in vector space but concern different events. Embeddings do not
discover URLs absent from the catalog; catalog coverage remains separate work.

## Shortlist

| Candidate | Relevant characteristics | Selected/illustrative ONNX weights | Assessment |
| --- | --- | --- | --- |
| IBM Granite Embedding 97M Multilingual R2 | Apache-2.0; 384 dimensions; 52 enhanced languages including EN/DE/NL; 32,768-token model limit | Official AVX2 uint8: 98.2 MB; tokenizer approximately 25.3 MB | Recommended lightweight candidate; check CPU/operator/runtime compatibility |
| multilingual-e5-small | MIT; 384 dimensions; 100 languages, uneven performance; 512-token limit | Xenova quantized export: 118 MB; tokenizer approximately 17.1 MB | Established small multilingual comparison; converted artifact needs provenance verification |
| EmbeddingGemma 300M | Gemma custom terms; 768 dimensions with supported truncation; 100+ languages; 2,048-token limit | Community q4 graph plus data approximately 198 MB, tokenizer extra | Worth a later quality comparison; extra license/distribution obligations |
| Qwen3-Embedding-0.6B | Apache-2.0; up to 1,024 dimensions with supported truncation; 100+ languages; 32K context | Community int8 export approximately 614 MB, tokenizer extra | Larger fallback if lightweight quality is inadequate; local CPU cost unmeasured |

Sizes are decimal artifact listings, not installed footprint, peak RAM or
measured speed. Export quantization can alter rankings. A q4 label does not
guarantee a smaller complete artifact: inspect every graph and external-data file.
Long advertised context is not permission to capture long/private pages.

Primary evidence:

- IBM [author card](https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2),
  [official ONNX files](https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2/tree/main/onnx)
  and [tokenizer/config files](https://huggingface.co/ibm-granite/granite-embedding-97m-multilingual-r2/tree/main).
  The 97M model uses CLS pooling and normalization; unlike the 311M variant it
  does not advertise Matryoshka dimension truncation. Published GPU throughput
  does not predict our Windows/Node CPU latency.
- E5 [author card](https://huggingface.co/intfloat/multilingual-e5-small),
  [export](https://huggingface.co/Xenova/multilingual-e5-small) and
  [ONNX files](https://huggingface.co/Xenova/multilingual-e5-small/tree/main/onnx).
  Use attention-masked mean pooling and normalization. Symmetric similarity uses
  `query: ` on both sides, not a query/passage split. Its score distribution is
  not a probability and does not justify the demo's existing 0.65 threshold.
- Gemma [author card](https://huggingface.co/google/embeddinggemma-300m),
  [export files](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX/tree/main/onnx)
  and [terms](https://ai.google.dev/gemma/terms). The upstream download requires
  license acceptance; a community conversion does not remove upstream terms.
  Local inference is not a Google API dependency. Nevertheless, use and
  redistribution/hosted-service conditions need review if selected. Do not
  confuse Gemma 4 licensing with EmbeddingGemma licensing.
- Qwen [author card](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B) and
  [export files](https://huggingface.co/onnx-community/Qwen3-Embedding-0.6B-ONNX/tree/main/onnx).
  Its pooling/instruction recipe differs from E5; sharing an adapter interface
  does not mean sharing preprocessing.

Also screened [pplx-embed-v1-0.6b](https://huggingface.co/perplexity-ai/pplx-embed-v1-0.6b).
It is MIT-licensed but adds architecture/runtime and output-quantization review
for our Node path; it is not the simplest first comparison. This does not imply
that every possible integration requires executing remote Python code.

These license observations are engineering selection evidence, not a legal or
store-approval guarantee. Downloaded asset licenses do not grant website rights.

## Runtime and acquisition proposal

Use an explicit CPU experiment runner in the local-service workspace, outside
the synchronous HTTP request path. Proposed pinned runtime:
`@huggingface/transformers@4.3.0` with `onnxruntime-node@1.30.0`.
The [release](https://github.com/huggingface/transformers.js/releases/tag/4.3.0)
and [tagged manifest](https://raw.githubusercontent.com/huggingface/transformers.js/4.3.0/packages/transformers/package.json)
were checked; the manifest also includes native dependencies and a prerelease
browser ONNX dependency. Inspect and lock the complete dependency tree and
installer behavior before executing it. This is not a dependency-security audit.
Verify registry availability, required CPU instructions, graph inputs/outputs
and pooling before inference. Do not silently substitute versions or GPU/browser
fallbacks. A graph already producing pooled vectors must not be pooled twice.

The two proposed models plus JSON tokenizers total approximately 260 MB, with
runtime/native dependencies additional. Proposed ceiling: **1 GiB total download,
2 GiB installed experiment footprint**; stop if insufficient. No subscription,
API key or paid account. Local disk, CPU, memory and electricity are still costs.
Keep model assets in an ignored app-owned directory, not the extension or git.

Acquisition contacts Hugging Face/CDN and the package registry/identified official
binary hosts; those servers see normal connection and artifact-request metadata.
No descriptors/vectors are uploaded. After acquisition, use explicit local model
paths, disable remote model loading and retain the network-denial tests. See
[offline configuration](https://huggingface.co/docs/transformers.js/custom_usage)
and [Node runtime](https://onnxruntime.ai/docs/get-started/with-javascript/node.html).
No implicit first-run download in popup startup, service startup or `npm test`.

## Device versus hosted-server boundary

The owner raised raw-content privacy on 2026-09-29. ADR-013 already rejects raw
page/message upload as the default. A local service on the developer's own PC
is on-device processing, not permission to move that processing to a hosted
server later. Even local inter-process capture needs an approved input contract;
the proposed comparison only uses synthetic descriptors.

Separate extraction/embedding from catalog/matching/discussions. Keep the former
on the user's device when the latter is hosted. An extension/mobile runtime
adapter must be validated separately; the proposed Node CPU experiment does not
prove browser/mobile feasibility. Prefer a compact model that can ultimately
run there, and include browser/mobile compatibility in the default-model review.
Do not implement a hosted raw-text embedding endpoint as the migration path.

Potential later choices, none activated here:

- Entirely local matching: greatest data minimization; shared-Topic discovery
  can use an approved public catalog, but coverage is limited to that local
  catalog. Do not download a sensitive/private server index.
- On-device embedding plus controlled remote matching: preserves shared-Topic
  utility without raw-page upload, but still discloses a sensitive derived signal.
  Requires a separate exact payload/access/retention approval. Do not publish
  vectors or automatically retain every user's query.
- Hosted raw-content embedding: not the default; increases content disclosure
  and is unnecessary for this experiment.

Vectors are not anonymization: [embedding-inversion research](https://aclanthology.org/2023.emnlp-main.765/)
recovered text and personal information for the studied models/settings. This is
not a measured attack success rate for our shortlist. URLs, titles, metadata,
Topic lookups and shared contributions can also reveal private information.
TLS and restricted vector access do not hide inputs from the server itself.
Private contexts therefore default to no remote matching pending their gate;
local transformation alone does not settle website rights or store policy.

## Repository fit and first experiment

Read-only inspection and a synthetic-vector compatibility probe found:

- Existing ranker/state validation supports up to 1,536 dimensions and 100 Sources;
  the 384/768/1,024-dimensional structural probes passed. No model ran.
- Vectors require finite nonzero values, exact model identity and compatible
  dimensions. The aggregate snapshot is bounded at 8 MiB. The probe is not a
  dense-vector capacity, inference-memory or quality benchmark.
- Application/handler code is synchronous. First precompute in an async CLI
  experiment; do not silently make HTTP handlers asynchronous.
- Current DTOs/UI only label hand-authored fixture vectors. Learned-model UI
  needs an explicit contract/label change after the experiment review.
- Confirmed Topic links override similarity ordering. Remove those links in
  retrieval evaluation so existing answers cannot inflate model accuracy.
- Keep a complete model/config manifest outside the strict `{modelId, values}`
  record. Derive model identity from pinned assets and preprocessing/pooling,
  dimensions, quantization and runtime; never compare unrelated vector spaces.

Proposed corpus: **48 project-created EN/DE/NL title/description-style descriptors**,
each at most 4,096 characters and 512 model tokens including task prefixes and
special tokens, rejecting excess rather than silently truncating. Freeze fixture
relationships and scoring before model runs.
Include paraphrases/translations, related-but-different events, product versions,
negation/identifiers, time-separated same-product descriptions and no-match cases.

Measure top-3/top-5 retrieval, hard-negative ordering, language-specific results,
no-match behavior, cold/warm latency and peak process memory. Compare against
lexical retrieval; inspect a simple rank fusion only if it adds value. Do not
turn cosine scores into confidence percentages or automatic Topic assignment.
Use separate caches/reports, not canonical `demo.sqlite` or existing user state.

This is an engineering smoke experiment, not another owner-labeling assignment,
not the deferred 200–250-pair provenance review and not real-world accuracy
evidence. Actual model usefulness, Windows runtime compatibility and resource
requirements remain unmeasured. The approval proposal is
[ADR-017](../decisions/ADR-017-local-embedding-experiment.md).
