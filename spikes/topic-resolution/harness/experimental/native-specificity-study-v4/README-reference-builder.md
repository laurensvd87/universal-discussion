# ADR179 producer, root reuse and TRAIN references

SOURCE ONLY; pending complete root/Trust source review. Import is inert. These
modules perform no IO, encoding, fit, classification, browser/native/provider
action or automatic preparation. Invented tests are not quality, actual-file,
native-rights or original-fit execution evidence. Accepted semantic five and
earlier frozen sources remain unchanged.

`buildSpecificityProducerProfile({panelIdentity,manifestHash,encoderHash,sourceHashes})`
returns `{producerProfile,construction,recipeHash}` under a new profile-set
namespace while keeping the unchanged scorer's exact native profile DTO. The29
literal `CONSTRUCTION_SOURCE_KEYS` are data keys, never followed as paths.
They include future root-owned run.mjs/stage.js: invented tests may assign
invented pins before those exist, but actual preparation must authenticate all
literal files. `validateSpecificityProducerProfile({profileSet,expectedRecipeHash,
expectedPanelIdentity,expectedManifestHash})` requires independently held owner
identities. No future CAL artifact, audit receipt or reference-construction hash
enters the native recipe; the larger full-source inventory is a separate gate.

`createSpecificityArtifactReuse({expectedOldFileHashes,expectedOldSourceHashes})`
returns a frozen `bind({oldFit,profileSet,expectedRecipeHash,panelIdentity,
manifestHash,protocolHash})` facade. oldFit has exactly freezeBytes,
supervisorBytes,selectionReceiptBytes (64KiB each), selectionBytes/modelBytes
(256KiB each), policyBytes (64KiB), inputDefinitionBytes (16KiB), and sourceHashes.
All seven byte pins and exact independent original SOURCE-map links authenticate
before parsing; aggregate maximum802816 bytes. Buffers are privately copied.
The unchanged original-fit validator and original/new compilers are delegated,
not an old same32 reuse receipt/creator. New receipt fields keep original cohort,
fit/model/policy/selection provenance separate from the new168 panel and profile.
Encoder identity, .75/.25 weights, lambda.1 and the16-root inventory must agree.
The output `{receipt,rootCandidate}` contains no old raw text or query vectors.
Hashes verify supplied bytes/program links; actual filesystem authentication and
permission to read original artifacts remain root's separate fixed allowlist gate.
No caller boolean establishes original training truth or historical no-refit.

`buildSpecificityTrainReferences({manifest,expectedPanelIdentity,
expectedManifestHash,profileSet,expectedRecipeHash,rootCandidate,trainingRows})`
requires all48 ordered TRAIN rows. Available rows are exactly
`{id,groupId,status:'available',nativeInput,vectorBindings}`; nativeInput is the
unchanged12-field prepared-native DTO including bodyVector/titleVector.
vectorBindings is `{bodyVectorHash,titleVectorHash}`, copied independently from
the accepted cohort row, not invented from the new vectors on demand. Unavailable
rows are `{id,groupId,status:'unavailable',reason,inputIdentity}`. Native metadata,
Source-input hash, observation nonce Source version, URLs, profile, case/group,
batch/native1..4 ordinal and raw pair bits are checked; actual rights/capture truth
was established by trusted owner admission, not by these hashes.

Copy bounds:200000 values,1MiB string units,depth24,48 pairs of384 coordinates;
native metadata16KiB per available row before compilation/fusion. Output1MiB.
The original24 MEMBER/12 direct STOP/12 scoped OUTSIDE annotations are retained
exactly; complete gold never rewrites MEMBER to STOP. Unchanged paired input
performs .75/.25 fusion. All48 availability rows/case IDs remain; trainingGroupIds
equals exactly usable reference groups. At most48 TOTAL fused examples are
returned, no raw pair vectors. The offline construction identity binds actual
native/field/vector-bit associations and is deliberately distinct from the raw
native producer namespace and original training builder.

The return contains status,detailTemplate,templateArtifactHash,construction,
constructionHash,trainingCases,trainingCaseIds,trainingGroupIds,availability and
referenceCount. The12-node seed uses calibrationStatus:experimental, an honest
adr179-unfitted version and all12 policies disabled. Zero references return
no-reference-set/nulltemplate/calibrationAllowed:false, not an empty compiled
artifact or permission to advance to TEST. Exact zero fusion cannot occur for
valid unit vectors under fixed .75/.25; defensive omission is not claimed as an
exercised valid-vector branch and weights are never changed to force that test.

Codec config is `{expectedManifestHash,expectedInputConstructionHash:constructionHash,
trainingCases}`. Use root's exact-bit codec for selected TRAIN material, including
signed zero. The fitter consumes detailTemplate/trainingCaseIds/trainingGroupIds;
this module does not call it. Keep selected artifacts in the separately reviewed
owner closure/codec retention path, not the cohort's compact receipt return.
CAL/TEST queries are never saved. Actual fit/selection audit, stage/preparation,
capture/encoding and final assessment remain separate unfinished gates.

Guarded invented-only suite (the profile test module also supplies shared pure
fixtures; no test module is imported by production modules):

```powershell
node --max-old-space-size=256 --import ./spikes/topic-resolution/harness/deny-external-capabilities.js --test --test-isolation=none ./spikes/topic-resolution/harness/experimental/native-specificity-study-v4/producer-profile.test.mjs ./spikes/topic-resolution/harness/experimental/native-specificity-study-v4/reference-builder.test.mjs ./spikes/topic-resolution/harness/experimental/native-specificity-study-v4/artifact-reuse.test.mjs
```
