# Experiment sources and dependency review

2026-09-29. Local development only; no model/runtime redistribution or store
approval is claimed. Packages and model data stay in ignored directories.

## Models

- Sentence Transformers `static-similarity-mrl-multilingual-v1`, Apache-2.0.
  Pinned revision and every acquired file hash are in `src/acquire.js` and the
  local acquisition ledger. The verified author card retains license metadata.
  [Author card](https://huggingface.co/sentence-transformers/static-similarity-mrl-multilingual-v1).
  The [official StaticEmbedding implementation](https://github.com/huggingface/sentence-transformers/blob/main/sentence_transformers/sentence_transformer/modules/static_embedding.py)
  disables special tokens and averages token rows. Our adapter follows that
  recipe and adds L2 normalization for cosine ranking. It does not claim numeric
  parity with the Python/Rust implementation or other device runtimes.
- Microsoft/intfloat `multilingual-e5-small`, MIT. The verified Xenova conversion
  card identifies that upstream model. Its own card does not repeat the license;
  upstream card revision `614241f622f53c4eeff9890bdc4f31cfecc418b3` is separately
  pinned, hash-verified and retained at `.cache/licenses/e5-upstream-README.md`.
  The offline runner checks retained license metadata before any learned run.
  [Upstream card](https://huggingface.co/intfloat/multilingual-e5-small) and
  [conversion](https://huggingface.co/Xenova/multilingual-e5-small).
  Symmetric matching uses `query: ` on both sides, masked hidden-state mean and
  L2 normalization. The graph remains local and CPU-only.

These model repositories expose license declarations in model cards, not
separate acquired LICENSE/NOTICE texts. This records author attribution and the
basis for this approved local experiment, not a completed redistribution audit.
Before distributing an app-managed pack, review required license/notice material
for the exact original/derived assets and executable runtime.

## Runtime

Exact packages and SHA-512 archive integrities: `runtime/package-lock.json`.
Direct pins: Transformers.js 4.3.0 (Apache-2.0), ONNX Runtime Node 1.30.0 (MIT).
The thin runner uses the approved transitive Tokenizers.js 0.2.0 (Apache-2.0)
and ONNX Runtime directly, avoiding automatic model loading and unrelated image/
browser backends. Transformers.js stays pinned but is not imported by inference.

All applicable Windows x64 archives were verified before offline installation.
`npm ci --offline --ignore-scripts --no-audit --no-fund` installed 42 packages.
No install script ran. Inspection found:

- ONNX Runtime's installer can download missing native/GPU components; disabled.
  Windows x64 CPU binding/runtime are already bundled and were inspected by name.
  Runner explicitly selects CPU with one intra/inter-op thread; no GPU fallback.
- Protobuf.js postinstall only checks dependent version conventions; also disabled.
- Other lockfile licenses: MIT, Apache-2.0, BSD-3-Clause, ISC, 0BSD and an
  MIT-or-CC0 option. Optional Sharp native packages also contain LGPL-3.0-or-later
  components; no Sharp code is imported by this text-only runner. Distribution
  obligations are a later packaging review, not erased by optional status.

This was an integrity, license-inventory and installer review, not a full source
audit or vulnerability certification. The existing JavaScript network/DNS/
subprocess denial guard is active during inference. It is not an OS sandbox for
native binaries. No telemetry or profiling is configured by the experiment.
