# Pure seven-file native stage recipe

`buildSpecificityStage` performs no IO. Supply the authenticated canonical
manifest/batch, separately trusted panel/manifest hashes, and exact `sources`
and `expectedSourceHashes` maps for these six literal stage-source names:

- `manifest.json` (the reviewed nonlaunchable empty-permission template)
- `worker.js`
- `native-adapter.js`
- `native-rights.js`
- `chromium/page-content-reader.js`
- `core/page-content-policy.js`

The future fixed-source inventory maps these names to their reviewed repository
sources. Caller-selected filesystem paths are not accepted. All six exact UTF8
texts authenticate before template parsing or manifest validation. A caller who
supplies its own matching hashes has not established trusted source provenance.
Limit128KiB per source,16KiB template and512KiB aggregate before generation.

Only two outputs are generated: the template's host permissions become the
current four-case batch's exact primary origins followed by `/*`, and
`batch-config.js` is a static `export const BATCH = <JSON literal>;`. Native1..4
and all original global identities are retained. No support origin, CDN,
`<all_urls>`, dynamic import or message-based configuration is added. Other five
source texts remain byte-identical. Generated files each stay below16KiB and
the complete seven-file stage below512KiB. Returned strings and metadata are
immutable; no claim is made that mutable byte-array elements can be frozen.

The recipe binds external source pins, canonical panel/manifest/batch/scope,
exact output paths/lengths/hashes and its own stage identity. It is not native
permission evidence, a source freeze, a published stage or a layout proof.
Future trusted IO must create a fresh owned directory, validate every ancestor
against reparse/link escapes, publish files exclusively, rehash the actual
bytes immediately before use, and check the exact seven-file/two-subdirectory
layout before and after launch. Stage/source mutation or extra entries fail;
no existing profile or file is overwritten or deleted.

Run invented-only checks:

```text
node --max-old-space-size=128 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./spikes/topic-resolution/harness/experimental/native-specificity-study-v3/stage.test.mjs
```

These tests use invented source text, panel metadata and URLs. They do not read
actual metadata/artifacts/assets, stage files, launch browsers or make requests.
