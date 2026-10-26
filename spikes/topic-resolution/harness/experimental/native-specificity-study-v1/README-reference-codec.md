# Selected TRAIN reference codec

Pure ADR179 transport for the selected local-detail artifact. No files, model,
capture, scoring, calibration, app/database access or authority are supplied.

`createTrainReferenceCodec({expectedManifestHash,expectedInputConstructionHash,
trainingCases})` copies exactly48 external TRAIN case/group/reference-annotation
joins. The reviewed manifest/builder supplies those associations independently;
the packet cannot expand them. Original24 MEMBER/12 STOP/12 scoped OUTSIDE
annotations stay exact. Available references may be a nonempty subset; CAL/TEST,
duplicate case occurrences or another annotation are rejected.

`encode(artifact)` accepts the exact existing local-artifact schema and fixed
12-node forest, at most48 TOTAL vector occurrences, and unchanged policy fields.
It validates ordinary descriptors, dense finite unit384-vectors and exact TRAIN
joins before invoking the unchanged local compiler once. It returns canonical
JSON text, packet/artifact hashes and finite counts, never query/raw-field data.

Each fused TRAIN vector is3072 little-endian binary64 bytes, encoded as4096
canonical base64 characters. Every bit, including signed zero and subnormal
coordinates, survives. A separate domain-bound vector-bit hash checks the payload;
the packet hash binds all metadata and bit strings without a self-hash cycle.
This is selected TRAIN-reference persistence, not CAL/TEST query persistence.

`decode(text,expectedPacketHash)` requires an independently pinned packet hash,
the external manifest/construction/TRAIN mapping identities, canonical JSON and
base64, unit vectors, exact byte round-trip and the unchanged local compiler's
artifact identity. It compiles once on this side and returns a detached frozen
artifact. Input is capped at1MiB before hashing/parsing, depth16/2048 containers
before JSON materialization, and12 nodes/48 vector occurrences before allocation
or compilation. Duplicate decoded keys, alternative lexical encodings, unknown
fields, proxies, accessors and coercive keys are refused. No normalization occurs.

Hashes and joins authenticate only the supplied identities when the trusted
owner has pinned them independently. The codec does not establish actual TRAIN
collection, native document/rights, text-to-vector provenance, semantic quality
or canonical assignment authority. The complete source review and separate
artifact/model phase gates still apply. Tests use invented48-row geometry only.

```text
node --max-old-space-size=128 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./spikes/topic-resolution/harness/experimental/native-specificity-study-v1/reference-codec.test.mjs
```
