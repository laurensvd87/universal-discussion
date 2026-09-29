# Local browser embedding assets

ADR-018 owner-local use only. Generated `.assets/` contents are ignored and are
not published with source-code commits. `package-browser-embedding.js` copies
existing, hash-verified local assets; it never downloads packages or models.

- Xenova conversion of intfloat/Microsoft `multilingual-e5-small`: upstream MIT
  declaration, conversion revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`.
- Hugging Face Tokenizers.js 0.2.0: Apache-2.0.
- Microsoft ONNX Runtime Web `1.31.0-dev.20260914-8d85527a0`: MIT; CPU WASM only,
  one thread, no proxy/GPU fallback. This is a prerelease, separately pinned from
  the experiment's Node runtime. Browser/Node vector spaces are not interchangeable.

Exact archive integrity, retained model cards, license declarations and installer
review are recorded in the [local experiment review](../../../../apps/local-service/experiments/embeddings/THIRD_PARTY.md).
The browser adapter verifies packaged assets before use. This is not a full
dependency/security certification or a completed license/notice redistribution
audit. Shipping model/runtime packs, hosting and store submission require their
later explicit review and approval; local copying does not authorize them.
