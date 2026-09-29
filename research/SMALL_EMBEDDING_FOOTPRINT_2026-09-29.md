# Smaller on-device embeddings for a global app

Date: 2026-09-29. Research only: no assets, packages or inference activated.

## Outcome

The owner highlighted per-device download size, then clarified that the app is
global: English is most important, but broader language coverage is preferable.
Do not silently make English-only inference the product default. UI language
packs and the encoder's language capabilities are separate concerns.

Revise the proposed comparison to **a compact multilingual static encoder versus
multilingual-e5-small**, with a lexical baseline. Granite remains a contextual
alternative, but comparing two approximately 125–135 MB packages alone would
not answer the newly emphasized size question. There is no selected winner.

Keep one compatible multilingual vector space across users/platforms. Different
languages may share a Topic; language is not a reason to create duplicate Topics.
Every inference adapter must preserve pinned model/preprocessing identity and
pass numeric/ranking parity checks before claiming interoperability.
Runtime/version is execution provenance; validated equivalent implementations
may share the same vector-space ID. A common API or equal dimensions alone is
not that validation, and unverified variants must remain separate.

## Candidates and size evidence

| Candidate | Size evidence, not final app size | Language/quality trade-off |
| --- | --- | --- |
| Ternlight mini/base | Author reports 5.0/7.2 MB gzip for its WASM bundle | English only, short input; not the global default |
| Sentence Transformers static multilingual, compact export | Calculated approximately 16.5 MB at 128 dimensions or 30.1 MB at 256, including tokenizer; custom export not built | About 50 listed languages including EN/DE/NL; context/order limitations need hard-negative tests |
| multilingual-e5-small | Previously checked quantized weights 118 MB + JSON tokenizer 17.1 MB | 100-language author claim; contextual multilingual baseline, not equal quality in every language |
| Granite 97M Multilingual R2 | Previously checked selected weights 98.2 MB + tokenizer 25.3 MB | 52 enhanced languages; earlier candidate retained as fallback |

Ternlight's [author card](https://huggingface.co/wenshutang/ternlight) documents
English-only training, a 128-token cap with silent truncation, custom runtime,
MIT license and author-measured performance. Its compressed transfer size is
not installed size/RAM. An adapter would need to reject excess input explicitly.
No claim that its English benchmark proves Topic quality or multilingual ability.

The [static multilingual author card](https://huggingface.co/sentence-transformers/static-similarity-mrl-multilingual-v1)
lists Apache-2.0, EN/DE/NL and many other languages, a 105,879-row by
1,024-column table and Matryoshka training supporting reduced dimensions. It
targets similarity/classification, not general retrieval; related-page ranking
must be evaluated rather than assumed. Its language list is not global validation.

The [official assets](https://huggingface.co/sentence-transformers/static-similarity-mrl-multilingual-v1/tree/main/0_StaticEmbedding)
are approximately 434 MB float32 weights and a 2.56 MB tokenizer. The proposed
smaller pack is a reproducible derivative, NOT an existing verified download:

`105879 rows * dimensions * 1 byte + 105879 * 4-byte row scale + ~2.56 MB tokenizer`

- 128-dimensional int8 rows: approximately 16,536,028 bytes before small headers/runtime.
- 256-dimensional int8 rows: approximately 30,088,540 bytes before small headers/runtime.

This is arithmetic, not a measured compressed/installed package or accuracy
claim. Slice the trained dimensions, quantize each row, dequantize only accessed
rows, mean-pool and normalize. Compare against full and sliced float32 controls.
Quantization and truncation each need independent error/ranking checks.
Merely truncating output vectors after loading a normal Transformer does NOT
shrink its downloaded weights. Here the stored token table itself is reduced.

The [authors' technical explanation](https://huggingface.co/blog/static-embeddings)
describes mean pooling of fixed token vectors rather than contextual attention.
Engineering implication: word-order permutations with the same token multiset
cannot be distinguished by that mean. For example, "Orion acquires Vega" and
"Vega acquires Orion" must not be merged merely because similarity is high.
Negation, model numbers, events and mixed-language input are further test cases.
Author speed/benchmark claims are not measurements on our machines.

An existing [community repackaging](https://huggingface.co/gregtatum/static-embeddings)
and [quantization report](https://huggingface.co/gregtatum/static-embeddings/blob/main/models/sentence-transformers/static-similarity-mrl-multilingual-v1/README.md)
support the general lower-precision approach. Their pooled-vector agreement is
not same-Topic accuracy or proof of our proposed 128/256-dimensional int8 export.
Prefer a reproducible derivative of pinned official assets over an opaque binary.

Other checked options:

- [Multilingual MiniLM ONNX](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2/tree/main/onnx)
  still lists approximately 118 MB quantized weights; its name does not solve size.
- [Potion multilingual](https://huggingface.co/minishlab/potion-multilingual-128M)
  offers broad language coverage and static inference, but fast is not necessarily
  small; it is not an already verified sub-30-MB replacement.
- [Distilled E5 16M](https://huggingface.co/cnmoro/multilingual-e5-small-distilled-16m)
  is a community static model. Sparse task-specific evidence and conversion work
  make it less compelling than the documented official static candidate initially.
- [MongoDB LEAF](https://huggingface.co/MongoDB/mdbr-leaf-mt) is an English compact
  model, not a multilingual default. Its explicit teacher alignment demonstrates
  a possible future approach to different encoders sharing one space; this needs
  training and validation, not just equal dimensions or a common API wrapper.
- [Gist](https://huggingface.co/desert-ant-labs/gist) predicts a fixed 36-category
  taxonomy and has source-available commercial terms. Broad labels such as
  technology are not our open-ended same-Topic identities; it is not a substitute.

## Built-in APIs do not remove the cross-platform model problem

- [Chrome's documented inventory](https://developer.chrome.com/docs/ai/built-in-apis)
  contains language/generation tools, not a general embedding-vector API.
  [Requirements](https://developer.chrome.com/docs/ai/get-started) still include
  model acquisition/device constraints; do not assume a shared preinstalled model.
- Apple has [NLEmbedding](https://developer.apple.com/documentation/naturallanguage/nlembedding)
  and [contextual multilingual models](https://developer.apple.com/videos/play/wwdc2023/10042/).
  Availability/revisions and asset acquisition matter. No documented matching
  encoder on Chrome/Android was established; current language coverage needs
  device checks, not an old WWDC language list.
- [ML Kit's catalogue](https://developers.google.com/ml-kit/guides) does not
  document a general text-vector endpoint. MediaPipe's [Web](https://developers.google.com/edge/mediapipe/solutions/text/text_embedder/web_js)
  and [Android](https://developers.google.com/edge/mediapipe/solutions/text/text_embedder/android)
  embedders are runtimes requiring a selected model, not zero-download encoders.

Equal dimensions do not make unrelated language/vendor models compatible. Later
aligned language specialists or separate model-specific indexes are possible,
but add training, storage, migration and cross-language recall work. A shared
multilingual baseline is simpler. No automatic cloud translation fallback: that
would reintroduce content egress; local translation also has model/quality costs.

## Distribution and evaluation recommendation

End users should not install Node or manage a server. A future app-managed model
pack should be optional, cached and removable, with its download size disclosed.
Known-page/discussion access can remain useful without new semantic derivation.
One selected compatible model per client, not the whole development comparison.

Chrome [remote-code guidance](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code)
and [MV3 rules](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)
require bundled executable logic. A numeric table with fixed bundled inference
is easier to audit than remote interpreter instructions, but neither this design
nor an ONNX graph is automatically store-approved. Bundle JS/WASM; model-data
download, CSP, permissions, integrity and cache lifecycle need exact review.
[Current extension CSP rules](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
also matter for WASM. No permission/CSP/package change is made by this research.

Evaluate English first without hiding other-language failures. Proposed small
engineering corpus: 64 project-created descriptors (32 English; four each in
German, Dutch, Spanish, French, Arabic, Hindi, Chinese and Japanese). Include
cross-language counterparts, scripts, identifiers and hard negatives. Four items
per additional language is only a smoke test, not validation of language support.
Freeze expectations before inference and report per-language/cross-language
results separately. This does not reopen the owner's 6/6 task or the R5 review.

Compare compact variants with E5 and lexical retrieval on identical descriptors.
Measure actual transfer/installed bytes, cold/warm CPU latency and peak memory;
browser/mobile startup and battery remain separate device evidence. Do not trade
away core matching usefulness solely to hit a small package target. If static
ranking fails, prefer a disclosed larger optional model over false same-Topic joins.

The development acquisition is approximately **572 MB of source models/tokenizers**
before dependencies: the full static table is needed once to build compact packs.
End users would receive only the selected derivative, not that build input. The
existing 1 GiB download / 2 GiB installed development caps remain stop limits, not
end-user budgets. [ADR-017](../decisions/ADR-017-local-embedding-experiment.md)
contains the revised, still-unapproved package. No actual model-quality evidence
or production packaging claim exists yet.
