"""Maintained, fixed native hierarchy check. Import is inert; no automatic retry.

Historical controllers and WinAPI retirement logic remain pinned dependencies.
This driver owns only its new paths/launch and normal-source catalog bindings.
"""
import ctypes
import hashlib
import json
import os
import re
from pathlib import Path
import stat
import sys
import time
import types

STARTED = time.monotonic()  # One original epoch before any authenticated read.
HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
OWN = 'apps/local-service/portable/integration/'
NEW = OWN + 'compressed-owner-recovery-v1/'
COMPRESSED_SOURCE_REVIEW_COMPLETE = True
OLD = OWN + 'native-hierarchy-postgres-v2/'
NODE = 'C:/Program Files/nodejs/node.exe'
ENTRY = OWN + 'semantic-native-check.js'
SEMANTIC_LEDGER = 'apps/local-service/portable/test/semantic-native-cases.json'
PUBLIC_SUBJECT_LEDGER = 'apps/local-service/portable/test/public-subject-native-cases.json'
PUBLIC_SOURCE_LEDGER = 'apps/local-service/portable/test/public-subject-source-native-cases.json'
AUTOMATIC_SUBJECT_LEDGER = 'apps/local-service/portable/test/automatic-subject-native-cases.json'
AUTOMATIC_RETRIEVAL_LEDGER = 'apps/local-service/portable/test/automatic-retrieval-native-cases.json'
AUTOMATIC_AUTHOR_CONTEXT_LEDGER = 'apps/local-service/portable/test/automatic-author-context-native-cases.json'
AUTOMATIC_AUTHOR_INSIGHT_LEDGER = 'apps/local-service/portable/test/automatic-author-insight-native-cases.json'
AUTOMATIC_TOPIC_FEED_LEDGER = 'apps/local-service/portable/test/automatic-topic-feed-native-cases.json'
AUTOMATIC_TOPIC_PUBLIC_LEDGER = 'apps/local-service/portable/test/automatic-topic-public-native-cases.json'
AUTOMATIC_PAGE_TOPIC_LEDGER = 'apps/local-service/portable/test/automatic-page-topic-native-cases.json'
PUBLISHED_TOPIC_EVIDENCE_LEDGER = 'apps/local-service/portable/test/published-topic-evidence-native-cases.json'
RUNS_ROOT = REPO / 'apps/local-service/portable/data/hierarchy-native-runs'
PRIVATE_ENTRY = OWN + 'owner-restore-native-check.js'
HTTP_ENTRY = OWN + 'owner-http-native-check.js'
AUTOMATIC18_OWNER_ENTRY = NEW + 'automatic-topics-owner-native-check.js'
BACKUP_ROOT = REPO / 'apps/local-service/data/canonical-migration-backups'
PRIVATE_RUNS_ROOT = Path(r'C:\Users\Laurens\AppData\Local\MurmingleRecovery\compressed-automatic18-v1')
PRIVATE_RECEIPT = REPO / 'apps/local-service/data/postgres-hierarchy-backup-receipt-20261027.json'
PRIVATE_ARCHIVE = BACKUP_ROOT / 'postgres-canonical-2026-10-27T05-31-32-647Z-62729438-e09b-428d-b39e-9bdbe7f40677.murmingle-pgbackup'
PRIVATE_INPUTS = (
    (PRIVATE_RECEIPT,6249,'7783f57371f1284c39892bcafae89b22c1976e4136897cecca65d4a6a211933e'),
    (PRIVATE_ARCHIVE,779153511,'e8026bc09c4ad53049d44bb5870cc28928ea0427ebd0d14a647a8bb1128ad831'),
)
AUTOMATIC18_OWNER_INPUTS = (
    (REPO/'apps/local-service/data/hierarchy-nature-backup-final-20261029-result.json',7445,
        'e3401fc4a8a2ee6815362fddc82c019b279b9dc34f8a7f2019a4a03a607ba6e4'),
    (BACKUP_ROOT/'postgres-canonical-2026-10-29T02-06-29-777Z-0c3c99b5-781a-46bb-bb85-ed6b516feda7.murmingle-pgbackup',1354426025,
        '88600b8b3c31b3a3327611b0abe0730b1cf63bc2915d34c3f126d4f74ee8393c'),
)
# Explicit additional execution/data closure, independently locked and hashed.
# These bytes are NOT hidden in, or charged to, the 320MiB code catalog.
MODEL_INPUTS = (
    (REPO/'apps/local-service/data/hierarchy-real-root-capture-adr138.traincal.json',838989,'6659f34a3e800bc447eb5331500c647194d1fe71164e8c7ca2b08a28d1418955'),
    (REPO/'apps/local-service/experiments/topic-encoder/hierarchical-e5-capacity-real-root-v1/output/training-eligibility.json',27005,'ef73b44936579c39ec054031f79864abb9f15c9dfce86eca0450d724341dd6cd'),
    (REPO/'apps/local-service/data/hierarchy-real-root-training-gold-adr136.json',39418,'62ff96d3b98d197c4c90ea2db7f5a9adb7615bf8e18fce7f66c3c1681b1f53e8'),
    (REPO/'apps/local-service/data/ridge1-topic-adapter-v1.json',3129386,'c25618bc0f897998dced3f2f8ab47ef50d706606e4c21299654c5bc516af7569'),
    (REPO/'spikes/topic-resolution/browser/embedding/.assets/manifest.json',1716,'5766e675660a8fbe74842a69b670a84ce5f9eb457b77032337e4a69d6180b984'),
    (REPO/'spikes/topic-resolution/browser/embedding/.assets/model.onnx',118308185,'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193'),
    (REPO/'spikes/topic-resolution/browser/embedding/.assets/tokenizer.json',17082730,'0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39'),
    (REPO/'spikes/topic-resolution/browser/embedding/.assets/tokenizer_config.json',443,'a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b'),
    (REPO/'spikes/topic-resolution/browser/embedding/.assets/config.json',658,'cb99455288675345e1a4f411438d5d0adbba5fbd3a67ea4fb03c015433b996c1'),
    (REPO/'spikes/topic-resolution/browser/embedding/.assets/special_tokens_map.json',167,'d05497f1da52c5e09554c0cd874037a083e1dc1b9cfd48034d1c717f1afc07a7'),
    (REPO/'spikes/topic-resolution/browser/embedding/.assets/tokenizers.mjs',98937,'1c4a848f86156201c033d6cd08c4cf81ae1088552acec3367f31ef086edf5af0'),
    (REPO/'spikes/topic-resolution/browser/embedding/.assets/ort.wasm.min.mjs',50195,'1617c813ada08592706d29a9963ab6258864dce4299bd402d2196bd648b63bfe'),
    (REPO/'spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.mjs',24381,'c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f'),
    (REPO/'spikes/topic-resolution/browser/embedding/.assets/ort-wasm-simd-threaded.wasm',14264838,'06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3'),
)
# The fixed executable is held through parent end-pins. Its installed DLL and
# resource tree remains the trusted local Chrome installation, not a cataloged
# or fully pinned runtime. No claim of complete Chrome binary closure follows.
BROWSER_INPUTS = ((Path('C:/Program Files/Google/Chrome/Application/chrome.exe'),4525720,
    '177e4939361ccac7b37bb68b0642dff418856d7792c89ccde70d9aabeb14b159'),)
RESTORED_TABLES = ('schema_migrations','meta','id_registry','topics','discussions','sources',
    'embeddings','source_links','topic_memberships','fixed_references','contributions',
    'revisions','operation_receipts','import_ledger','runtime_state','command_receipts',
    'runtime_source_stamps','ingestion_jobs','catalog_ingest_lane')
PRIVATE_PHASES = ('callback-enter','archive-hash-start','archive-hash-complete','backup-auth-start',
    'archive-authenticated','empty-target-verified','restore-dispatched','restore-retired',
    'schema-verified','grants-verified') + tuple('table-'+name+'-verified' for name in RESTORED_TABLES) + (
    'sequences-verified','scratch-a-retired','scratch-b-retired','inputs-closed')
UPGRADE_TABLES = RESTORED_TABLES[1:]
UPGRADE_GROUPS = (
    ('Private schema9 upgrade entry boundaries',(
        'Original schema9 identities and primary-key collations',
        'Original owner and execute-only role boundaries')),
    ('Private migrated snapshot equality',('Installed hierarchy17 manifest and original runtime version',)
        + tuple('Preserved original snapshot table: '+name for name in UPGRADE_TABLES)),
    ('Private migrated generated ordinal safety',('Migrated identity and ordinal sequences cannot reuse stored keys',)),
)
UPGRADE_PHASES = PRIVATE_PHASES[:8] + (
    'schema9-identity-verified','schema9-grants-verified','hierarchy17-installed','hierarchy17-manifest-verified',
) + tuple('legacy-table-'+name+'-verified' for name in UPGRADE_TABLES) + (
    'migrated-sequences-verified','application-verified','scratch-a-retired','scratch-b-retired','inputs-closed')
HTTP_CASES = ('hierarchy17-http-health','independent-semantic-directory','saved-page-canonical-read',
    'normal-login-unavailable','named-private-session','human-root-and-reply',
    'cross-actor-edit-withdraw-denied','human-edit-and-withdraw','forged-session-denied',
    'demo-actor-denied','reserved-ai-names-denied','host-origin-pairing-denied',
    'owner-policy-refresh','bounded-concurrent-public-reads','revoked-session-denied','provider-unavailable')
AUTOMATIC18_OWNER_PHASES = PRIVATE_PHASES[:8] + ('automatic18-upgrade-verified','application-verified',
    'scratch-a-retired','scratch-b-retired','inputs-closed')
AUTOMATIC18_HTTP_CASES = ('automatic18-http-health',) + HTTP_CASES[1:] + ('automatic18-capabilities','automatic18-global-search')
MAP_KEY = NEW + 'reviewed-sources.json'
NORMAL_SCOPE_ABSENCES = frozenset([
    NEW+'package.json',
    'apps/local-service/experiments/automatic-topic-discovery-v1/package.json',
    'apps/local-service/experiments/automatic-topic-discovery-v2/package.json',
    'apps/local-service/experiments/automatic-topic-discovery-v3/package.json',
    'apps/local-service/src/http/package.json',
    'apps/local-service/test/package.json',
    'apps/local-service/src/ai/package.json',
    'apps/local-service/src/ops/package.json',
    'apps/local-service/src/crawler/package.json',
    'apps/local-service/src/discovery/package.json',
    'apps/local-service/src/metrics/package.json',
    'apps/local-service/src/private/package.json',
    'apps/topic-dashboard/src/data/package.json',
    'apps/topic-dashboard/src/package.json',
    'spikes/topic-resolution/browser/fixtures/package.json',
    'apps/local-service/harness/package.json',
    'spikes/topic-resolution/harness/package.json',
    'spikes/topic-resolution/browser/chromium/package.json',
    'spikes/topic-resolution/browser/locales/package.json',
])
MIB = 1048576
CREATE_FLAGS = 0x8040C
NORMAL_KEYS = frozenset([
    OWN+'hierarchy-native-supervisor.py', OWN+'hierarchy_native_supervisor_test.py',
    OWN+'private-model-rehearsal.js', OWN+'private-model-rehearsal.test.js',
    OWN+'private-model-training-inputs.js', OWN+'private-model-training-inputs.test.js',
    OWN+'private-legacy-adoption-rehearsal.js', OWN+'private-legacy-adoption-rehearsal.test.js',
    'apps/local-service/harness/run-semantic-workspace-browser-smoke.js',
    'apps/local-service/harness/semantic-browser-containment.js',
    'apps/local-service/test/semantic-browser-boundary.test.js',
    'apps/local-service/test/semantic-browser-containment.test.js',
    'spikes/topic-resolution/harness/chromium-pipe.js',
    'spikes/topic-resolution/browser/manifest.json',
    'spikes/topic-resolution/browser/chromium/assistant-voice-picker.js',
    'spikes/topic-resolution/browser/chromium/canonical-history-panel.js',
    'spikes/topic-resolution/browser/chromium/discussion-panel.js',
    'spikes/topic-resolution/browser/chromium/popup-shell.js',
    'spikes/topic-resolution/browser/chromium/popup.css',
    'spikes/topic-resolution/browser/chromium/popup.html',
    'spikes/topic-resolution/browser/chromium/popup.js',
    'spikes/topic-resolution/browser/chromium/semantic-topic-panel.js',
    'spikes/topic-resolution/browser/chromium/semantic-topic-workspace.js',
    'spikes/topic-resolution/browser/chromium/ui-mode.js',
    'spikes/topic-resolution/browser/core/account-client.js',
    'spikes/topic-resolution/browser/core/canonical-history-contract.js',
    'spikes/topic-resolution/test/canonical-history-contract.test.js',
    'spikes/topic-resolution/test/canonical-history-panel.test.js',
    'spikes/topic-resolution/test/indicator-package.test.js',
    'apps/local-service/portable/canonical-v4/semantic-owner-maintenance.js',
    'apps/local-service/portable/test/semantic-owner-maintenance.test.js',
    'apps/local-service/test/postgres-runtime-operator.test.js',
    'spikes/topic-resolution/browser/core/active-tab-policy.js',
    'spikes/topic-resolution/browser/core/discussion-mentions.js',
    'spikes/topic-resolution/browser/core/discussion-readiness.js',
    'spikes/topic-resolution/browser/core/discussion-target.js',
    'spikes/topic-resolution/browser/core/indicator-contract.js',
    'spikes/topic-resolution/browser/core/insight-controller.js',
    'spikes/topic-resolution/browser/core/local-ai-client.js',
    'spikes/topic-resolution/browser/core/local-discussion-controller.js',
    'spikes/topic-resolution/browser/core/page-resolution-contract.js',
    'spikes/topic-resolution/browser/core/topic-view-mode.js',
    'spikes/topic-resolution/browser/fixtures/indicator-fixtures.js',
    'spikes/topic-resolution/browser/fixtures/local-service-fixture-bridge.js',
    'spikes/topic-resolution/browser/locales/en.js',
    'apps/local-service/src/crawler/postgres-ingest-client.js',
    'apps/local-service/src/crawler/local-ingest-client.js',
    'apps/topic-dashboard/package.json',
    'apps/local-service/portable/canonical-v4/hierarchy-schema-source.js',
    'apps/local-service/portable/canonical-v4/hierarchy-repository.js',
    'apps/local-service/portable/test/hierarchy-schema-source.test.js',
    'apps/local-service/portable/test/hierarchy-native-composition.test.js',
    'apps/local-service/portable/test/hierarchy-native-call.test.js',
    'apps/local-service/portable/test/hierarchy-native-assertions.js',
    OWN + 'hierarchy-native-context.js', OWN + 'hierarchy-native-cluster.js',
    OWN + 'hierarchy-native-check.js',
    ENTRY, OWN + 'hierarchy-native-driver.py', OWN + 'hierarchy_native_driver_test.py',
    OWN + 'hierarchy-native-run.js',
    'apps/local-service/portable/test/hierarchy-native-run.test.js',
    OWN + 'semantic-native-context.js', OWN + 'semantic-native-check.test.js',
    SEMANTIC_LEDGER,
    PUBLIC_SUBJECT_LEDGER,
    PUBLIC_SOURCE_LEDGER,
    'apps/local-service/portable/test/public-subject-source-native-assertions.js',
    'apps/local-service/portable/test/public-subject-source-repository.test.js',
    'apps/local-service/portable/canonical-v4/public-subject-source-repository.js',
    'apps/local-service/portable/canonical-v4/drafts/public-subject-source-bindings.sql',
    'apps/local-service/portable/test/automatic-subject-native-cases.json',
    'apps/local-service/portable/test/automatic-subject-native-assertions.js',
    'apps/local-service/portable/test/automatic-subject-native-source.test.js',
    'apps/local-service/portable/test/automatic-named-subject-repository.test.js',
    'apps/local-service/portable/canonical-v4/automatic-named-subject-repository.js',
    'apps/local-service/portable/canonical-v4/drafts/automatic-named-subjects.sql',
    'apps/local-service/portable/test/automatic-retrieval-native-cases.json',
    'apps/local-service/portable/test/automatic-retrieval-native-assertions.js',
    'apps/local-service/portable/canonical-v4/drafts/automatic-subject-retrieval.sql',
    'apps/local-service/portable/canonical-v4/automatic-subject-retrieval-repository.js',
    'apps/local-service/portable/canonical-v4/drafts/AUTOMATIC-TOPIC-FEEDS.md',
    'apps/local-service/portable/canonical-v4/drafts/AUTOMATIC-TOPIC-PUBLIC.md',
    'apps/local-service/src/application/published-topic-evidence.js',
    'apps/local-service/portable/canonical-v4/drafts/named-owner-grouping.sql',
    'apps/local-service/portable/canonical-v4/drafts/unified-topic-search.sql',
    'apps/local-service/portable/canonical-v4/drafts/combined-author-hierarchy.sql',
    'apps/local-service/portable/canonical-v4/drafts/automatic-topic-dashboard.sql',
    'apps/local-service/portable/canonical-v4/drafts/combined-topic-breadcrumbs.sql',
    'apps/local-service/src/ops/automatic-topics-runtime-operator.js',
    'apps/local-service/src/ops/postgres-runtime-operator.js',
    'apps/local-service/src/ops/automatic-topics-backup-operator.js',
    'apps/local-service/test/automatic-topics-runtime-operator.test.js',
    'apps/local-service/test/automatic-topics-backup-operator.test.js',
    'apps/local-service/src/ops/automatic-topics-local-state-backup.js',
    'apps/local-service/src/ops/automatic-topics-local-state-read-lease.js',
    'apps/local-service/src/ops/automatic-topics-quiesced-backup.js',
    'apps/local-service/src/ops/automatic-topics-process-absence.py',
    'apps/local-service/test/automatic-topics-local-state-backup.test.js',
    'apps/local-service/test/automatic-topics-local-state-read-lease.test.js',
    'apps/local-service/test/automatic-topics-quiesced-backup.test.js',
    'apps/local-service/test/automatic_topics_process_absence_test.py',
    AUTOMATIC18_OWNER_ENTRY, OWN+'automatic-topics-owner-native-check.test.js',
    OWN+'automatic-topics-owner-upgrade.js', OWN+'automatic-topics-owner-upgrade.test.js',
    'apps/local-service/portable/canonical-v4/automatic-topics-installation.js',
    'apps/local-service/portable/canonical-v4/automatic-topics-migration-source.js',
    'apps/local-service/portable/canonical-v4/migrations/018-automatic-topics.sql',
    'apps/local-service/portable/canonical-v4/AUTOMATIC-TOPICS-INSTALLATION.md',
    'apps/local-service/portable/test/automatic-topics-fixture-input.js',
    'apps/local-service/portable/test/automatic-topics-migration-native-assertions.js',
    'apps/local-service/portable/test/automatic-topics-installation.test.js',
    'apps/local-service/test/hierarchy-startup.test.js',
    'apps/local-service/test/hierarchy-worker-resources.test.js',
    'apps/local-service/test/installed-hierarchy-runtime.test.js',
    'apps/local-service/portable/canonical-v4/drafts/COMBINED-AUTHOR-HIERARCHY.md',
    'apps/local-service/portable/test/combined-author-hierarchy-fixture.js',
    'apps/local-service/portable/test/combined-author-hierarchy-native-assertions.js',
    'apps/local-service/portable/test/combined-author-hierarchy.test.js',
    'apps/local-service/portable/canonical-v4/drafts/UNIFIED-TOPIC-SEARCH.md',
    'apps/local-service/portable/canonical-v4/unified-topic-search-maintenance.js',
    'apps/local-service/portable/test/unified-topic-search-native-assertions.js',
    'apps/local-service/portable/test/unified-topic-search.test.js',
    'apps/local-service/portable/canonical-v4/drafts/NAMED-OWNER-GROUPING.md',
    'apps/local-service/portable/test/named-owner-grouping-native-assertions.js',
    'apps/local-service/src/application/single-source-topic-focus.js',
    'apps/local-service/test/single-source-topic-focus.test.js',
    'apps/local-service/portable/canonical-v4/single-source-topic-repository.js',
    'apps/local-service/portable/canonical-v4/drafts/single-source-topic-match.sql',
    'apps/local-service/portable/canonical-v4/drafts/SINGLE-SOURCE-TOPIC-MATCH.md',
    'apps/local-service/portable/test/single-source-topic-native-assertions.js',
    'apps/local-service/src/application/published-topic-recovery-plan.js',
    'apps/local-service/test/published-topic-recovery-plan.test.js',
    'apps/local-service/portable/test/published-topic-recovery-native-assertions.js',
    'apps/local-service/portable/canonical-v4/drafts/published-topic-recovery.sql',
    'apps/local-service/portable/canonical-v4/drafts/PUBLISHED-TOPIC-RECOVERY.md',
    'apps/local-service/src/application/published-topic-maintenance.js',
    'apps/local-service/portable/canonical-v4/published-topic-evidence-repository.js',
    'apps/local-service/portable/canonical-v4/drafts/published-topic-evidence.sql',
    'apps/local-service/portable/canonical-v4/drafts/PUBLISHED-TOPIC-EVIDENCE.md',
    'apps/local-service/portable/test/published-topic-evidence.test.js',
    'apps/local-service/portable/test/published-topic-evidence-native-assertions.js',
    'apps/local-service/portable/test/published-topic-evidence-native-cases.json',
    'apps/local-service/experiments/public-topic-recovery-v1/recovery.js',
    'apps/local-service/portable/canonical-v4/drafts/AUTOMATIC-PAGE-TOPIC.md',
    'apps/local-service/portable/canonical-v4/drafts/automatic-page-topic-membership.sql',
    'apps/local-service/portable/test/automatic-page-topic.test.js',
    'apps/local-service/portable/test/automatic-page-topic-native-assertions.js',
    'apps/local-service/portable/test/automatic-page-topic-native-cases.json',
    'apps/local-service/portable/canonical-v4/drafts/automatic-topic-replies.sql',
    'apps/local-service/portable/canonical-v4/drafts/automatic-topic-public-reads.sql',
    'apps/local-service/portable/test/automatic-topic-replies.test.js',
    'apps/local-service/portable/test/automatic-topic-public-native-assertions.js',
    'apps/local-service/portable/test/automatic-topic-public-native-cases.json',
    'apps/local-service/test/automatic-topic-public.test.js',
    'spikes/topic-resolution/test/automatic-topic-public-contract.test.js',
    'spikes/topic-resolution/test/semantic-topic-panel.test.js',
    'apps/local-service/portable/canonical-v4/drafts/automatic-topic-feeds.sql',
    'apps/local-service/portable/canonical-v4/automatic-topic-feed-repository.js',
    'apps/local-service/portable/test/automatic-topic-feed-native-cases.json',
    'apps/local-service/portable/test/automatic-topic-feed-native-assertions.js',
    'apps/local-service/portable/test/automatic-topic-feed-repository.test.js',
    'apps/local-service/portable/canonical-v4/drafts/automatic-author-context.sql',
    'apps/local-service/portable/canonical-v4/automatic-author-context-repository.js',
    'apps/local-service/portable/test/automatic-author-context-native-cases.json',
    'apps/local-service/portable/test/automatic-author-context-native-assertions.js',
    'apps/local-service/portable/test/automatic-author-context-repository.test.js',
    'apps/local-service/portable/canonical-v4/drafts/automatic-author-insight.sql',
    'apps/local-service/portable/test/automatic-author-insight-native-cases.json',
    'apps/local-service/portable/test/automatic-author-insight-native-assertions.js',
    'apps/local-service/portable/test/automatic-author-insight.test.js',
    'apps/local-service/test/generated-share-runtime.test.js',
    'apps/local-service/test/authored-topic-application.test.js',
    'spikes/topic-resolution/test/authored-topic-contract.test.js',
    'spikes/topic-resolution/test/local-discussion-controller.test.js',
    'spikes/topic-resolution/test/insight-controller.test.js',
    'spikes/topic-resolution/test/discussion-panel.test.js',
    'apps/local-service/portable/test/automatic-subject-retrieval-repository.test.js',
    'apps/local-service/src/application/automatic-subject-cohort.js',
    'apps/local-service/src/application/automatic-subject-coordinator.js',
    'apps/local-service/test/automatic-subject-cohort.test.js',
    'apps/local-service/test/automatic-subject-coordinator.test.js',
    'apps/local-service/test/fixtures/automatic-subject-cohort.js',
    'apps/local-service/src/application/automatic-named-subject-plan.js',
    'apps/local-service/test/automatic-named-subject-plan-v2.test.js',
    'apps/local-service/test/automatic-named-subject-plan-v3.test.js',
    'apps/local-service/experiments/automatic-topic-discovery-v3/focus-subjects.js',
    'apps/local-service/experiments/automatic-topic-discovery-v3/focus-subjects.test.js',
    'apps/local-service/harness/stored-topic-screen.js',
    'apps/local-service/harness/run-stored-topic-screen.js',
    'apps/local-service/harness/stored-topic-screen.test.js',
    'apps/local-service/harness/run-stored-topic-label-refinement.js',
    'apps/local-service/portable/canonical-v4/drafts/named-subject-label-quality.sql',
    'apps/local-service/portable/test/named-label-quality-source.test.js',
    'apps/local-service/portable/test/named-label-quality-native-assertions.js',
    'apps/local-service/test/automatic-named-subject-plan.test.js',
    'apps/local-service/experiments/automatic-topic-discovery-v1/focus-subjects.js',
    'apps/local-service/experiments/automatic-topic-discovery-v2/focus-subjects.js',
    'apps/local-service/portable/test/public-subject-native-assertions.js',
    'apps/local-service/portable/test/public-subject-registry.test.js',
    'apps/local-service/portable/canonical-v4/public-subject-registry.js',
    'apps/local-service/portable/canonical-v4/drafts/public-subject-registry.sql',
    'apps/local-service/experiments/automatic-topic-discovery-v1/wiki-entity-subjects.js',
    'apps/local-service/portable/test/semantic-native-assertions.js',
    'apps/local-service/portable/canonical-v4/migrations/010-semantic-hierarchy.sql',
    'apps/local-service/portable/canonical-v4/semantic-repository.js',
    'apps/local-service/portable/canonical-v4/ingestion-repository.js',
    'apps/local-service/portable/canonical-v4/bootstrap/001-admin.sql',
    'apps/local-service/src/application/hierarchy-ingestion-preparation.js',
    'apps/local-service/src/domain/hierarchy-rooted-matcher.js',
    'apps/local-service/src/domain/hierarchy-binary-detail.js',
    'apps/local-service/src/domain/hierarchical-e5-observed-head-policy.js',
    'spikes/topic-resolution/browser/core/local-service-contract.js',
    'apps/local-service/portable/canonical-v4/migrations/011-semantic-discussion-feeds.sql',
    'apps/local-service/portable/canonical-v4/semantic-discussion-repository.js',
    'apps/local-service/portable/test/semantic-discussion-repository.test.js',
    'apps/local-service/src/domain/semantic-topic-grouping.js',
    'apps/local-service/src/domain/semantic-topic-grouping.test.js',
    'apps/local-service/portable/canonical-v4/migrations/012-semantic-stored-source-preparation.sql',
    'apps/local-service/portable/canonical-v4/semantic-source-preparation.js',
    'apps/local-service/portable/canonical-v4/semantic-source-repository.js',
    'apps/local-service/portable/test/semantic-source-preparation.test.js',
    'apps/local-service/portable/test/semantic-source-repository.test.js',
    'apps/local-service/src/application/create-postgres-canonical-service.js',
    'apps/local-service/src/http/request-handler.js',
    'apps/local-service/test/semantic-public-reads.test.js',
    'apps/local-service/src/accounts/account-errors.js',
    'apps/local-service/src/accounts/account-routes.js',
    'apps/local-service/src/application/postgres-public-read-flights.js',
    'apps/local-service/portable/canonical-v4/migrations/013-semantic-public-topic-metadata.sql',
    'apps/local-service/portable/canonical-v4/semantic-metadata-repository.js',
    'apps/local-service/portable/test/semantic-metadata-repository.test.js',
    'apps/local-service/src/domain/semantic-topic-directory.js',
    'apps/local-service/test/semantic-topic-directory.test.js',
    'apps/local-service/portable/canonical-v4/migrations/014-semantic-source-containers.sql',
    'apps/local-service/portable/test/semantic-source-container-migration.test.js',
    'apps/local-service/test/semantic-source-container-policy.test.js',
    'apps/local-service/portable/canonical-v4/migrations/015-semantic-reply-witness.sql',
    'apps/local-service/portable/test/semantic-reply-witness.test.js',
    'spikes/topic-resolution/browser/core/local-service-client.js',
    'spikes/topic-resolution/browser/core/local-service-session.js',
    'spikes/topic-resolution/browser/core/account-auth-response.js',
    'spikes/topic-resolution/browser/core/community-contract.js',
    'spikes/topic-resolution/browser/core/topic-space-contract.js',
    'spikes/topic-resolution/test/semantic-local-client.test.js',
    'apps/local-service/portable/test/semantic-insight-native-assertions.js',
    'apps/local-service/portable/canonical-v4/migrations/016-semantic-insight-reply.sql',
    'apps/local-service/portable/test/semantic-insight-reply.test.js',
    'apps/local-service/src/ai/chatgpt-connection.js',
    'apps/local-service/src/ai/chatgpt-insights.js',
    'apps/local-service/src/ai/chatgpt-runtime.js',
    'apps/local-service/src/ai/insight-prompts.js',
    'apps/local-service/src/ai/reply-research-policy.js',
    'spikes/topic-resolution/browser/core/insight-citations.js',
    'spikes/topic-resolution/browser/core/insight-context.js',
    'spikes/topic-resolution/browser/core/insight-preferences.js',
    'spikes/topic-resolution/browser/core/insight-voices.js',
    'apps/local-service/test/chatgpt-bridge.test.js',
    'apps/local-service/test/cited-reply-roundtrip.test.js',
    'apps/local-service/test/insight-response-language.test.js',
    'apps/local-service/portable/canonical-v4/hierarchy-installation.js',
    'apps/local-service/portable/test/hierarchy-installation.test.js',
    'apps/local-service/src/application/installed-hierarchy-matcher.js',
    'apps/local-service/assets/hierarchy/root-model.json',
    'apps/local-service/assets/hierarchy/root-policy.json',
    'apps/local-service/assets/hierarchy/input-definition.json',
    'apps/local-service/assets/hierarchy/gta-detail.json',
    'apps/local-service/assets/hierarchy/animals-detail.json',
    'apps/local-service/assets/hierarchy/koalas-detail.json',
    'spikes/topic-resolution/browser/embedding/.assets/manifest.json',
    'apps/local-service/portable/canonical-v4/migrations/017-semantic-dashboard-counts.sql',
    'apps/local-service/portable/test/semantic-dashboard-counts.test.js',
    'apps/topic-dashboard/src/data/postgres-catalog.js',
    'apps/topic-dashboard/test/postgres-catalog.test.js',
    'apps/topic-dashboard/src/local-postgres-watch.mjs',
    'apps/topic-dashboard/test/assignment-counts-web-smoke.mjs',
    'apps/topic-dashboard/test/cli.test.js',
    'apps/topic-dashboard/test/refresh-health.test.js',
    'apps/topic-dashboard/web/index.html',
    'apps/topic-dashboard/web/app.js',
    'apps/topic-dashboard/web/style.css',
    PRIVATE_ENTRY, OWN + 'owner-restore-native-check.test.js',
    OWN + 'private-owner-storage.js',
    'apps/local-service/portable/test/private-owner-storage.test.js',
    'apps/local-service/portable/test/hierarchy-native-cluster.test.js',
    'apps/local-service/src/ops/postgres-backup-operator.js',
    'apps/local-service/test/postgres-backup-operator.test.js',
    'apps/local-service/src/ops/windows-backup-protection.js',
    'apps/local-service/portable/src/windows-dpapi-password.js',
    OWN + 'hierarchy-private-retire-pgdata.ps1',
    OWN + 'hierarchy-private-retire-pgdata.test.ps1',
    HTTP_ENTRY,OWN + 'owner-http-native-check.test.js',
    OWN + 'private-application-rehearsal.js',OWN + 'private-application-rehearsal.test.js',
    'apps/local-service/src/accounts/account-lifecycle.js',
    'apps/local-service/src/accounts/account-repository.js',
    'apps/local-service/src/accounts/account-service.js',
    'apps/local-service/src/accounts/protected-account-key.js',
    'apps/local-service/src/adapters/fixture-catalog.js',
    'apps/local-service/src/adapters/fixture-ranking.js',
    'apps/local-service/src/adapters/sqlite-repository.js',
    'apps/local-service/src/application/canonical-pages.js',
    'apps/local-service/src/application/canonical-read-queue.js',
    'apps/local-service/src/application/create-sqlite-demo-service.js',
    'apps/local-service/src/application/discussion-service.js',
    'apps/local-service/src/application/hierarchy-worker-resources.js',
    'apps/local-service/src/application/ingestion-worker-queue.js',
    'apps/local-service/src/application/installed-hierarchy-runtime.js',
    'apps/local-service/src/application/matching-precompute.js',
    'apps/local-service/src/application/owner-topic-configuration.js',
    'apps/local-service/src/application/postgres-ingestion-worker-loop.js',
    'apps/local-service/src/application/postgres-interactive-ingestion.js',
    'apps/local-service/src/application/stored-hierarchy-coordinator.js',
    'apps/local-service/src/application/stored-source-preparation-requests.js',
    'apps/local-service/test/stored-source-preparation-requests.test.js',
    'apps/local-service/test/semantic-preparation-http.test.js',
    'apps/local-service/test/stored-hierarchy-coordinator.test.js',
    'spikes/topic-resolution/test/semantic-topic-workspace.test.js',
    'apps/local-service/src/application/topic-space-discovery.js',
    'apps/local-service/src/application/topic-space-policy.js',
    'apps/local-service/src/crawler/packaged-e5.js',
    'apps/local-service/src/discovery/public-index.js',
    'apps/local-service/src/domain/incremental-adaptive-topics.js',
    'apps/local-service/src/domain/prior-discussions.js',
    'apps/local-service/src/domain/topic-space-grouping.js',
    'apps/local-service/src/http/loopback-listener.js',
    'apps/local-service/src/http/pairing-store.js',
    'apps/local-service/src/http/startup-config.js',
    'apps/local-service/src/metrics/catalog-growth.js',
    'apps/local-service/src/ops/backup-image.js',
    'apps/local-service/src/ops/backup-retention.js',
    'apps/local-service/src/ops/canonical-backup-worker.js',
    'apps/local-service/src/ops/canonical-backup.js',
    'apps/local-service/src/private/private-repository.js',
    'apps/local-service/src/private/private-service.js',
    'apps/local-service/src/startup.js',
    'spikes/topic-resolution/browser/fixtures/related-source-fixtures.js',
])

NORMAL_KEYS = NORMAL_KEYS | frozenset(NEW + name for name in ['archive-capacity-causal.test.js', 'automatic-topics-owner-native-check.js', 'automatic-topics-owner-native-check.test.js', 'compressed-data-directory.js', 'compressed-data-directory.test.js', 'compressed_driver_test.py', 'fixed-archive-pump.js', 'fixed-archive-pump.test.js', 'hierarchy-native-cluster.js', 'hierarchy-native-cluster.test.js', 'hierarchy-native-driver.py', 'hierarchy-native-run.js', 'hierarchy-native-run.test.js', 'hierarchy_native_driver_test.py', 'prepare-compressed-root.ps1', 'private-application-rehearsal.js', 'private-application-rehearsal.test.js', 'private-owner-storage.js', 'private-owner-storage.test.js', 'probe-owned-compression-v2.ps1', 'probe-owned-compression.ps1', 'run-semantic-workspace-browser-smoke.js', 'semantic-browser-boundary.test.js', 'storage_policy.py', 'storage_policy_test.py', 'windows_storage.py', 'windows_storage_test.py'])
PINS = {
    'storage-native': (NEW+'windows_storage.py', '436e03c339fe66a0e3d71823fcaccd0422024928991a1bc93ea66eefc50242d4'),
    'storage-policy': (NEW+'storage_policy.py', '06c2b6e7f0da8c716c918f92f49a39ea721159cf138cedb226925442d3141248'),
    'inventory': (OLD+'inventory.py', '3dfc2dcdb0c09a46d6215b5cf0781829f27a70f03c8106e6bb70db18bf28f385'),
    'supervisor': (OWN+'hierarchy-native-supervisor.py', '41b7b11c078adc54422d511f768e21ac489da5f0411364e1b0b3a410e4b2b1b8'),
    'windows': (OLD+'windows.py', '890cca5fe58a938ba3b6be960d951d35265a7217cc9a831e31358b1fee79c433'),
    'baseline': ('spikes/topic-resolution/harness/experimental/native-job-list-observation-v2/run.py',
                 '8e0cf0aefd09a80c1c4971fa8515024b47ca47ab8eed28e4065acae02373c940'),
}
NATIVE_FAILURE_CODES = frozenset([
    'abi', 'assign-state', 'assignment', 'attribute-handles', 'attribute-init',
    'attribute-size', 'census-state', 'checkpoint', 'checkpoint-return',
    'close-descendants-or-pipes', 'close-handle', 'close-handles', 'close-live-process',
    'create-process', 'initialize-state', 'job-limit', 'job-members', 'launch-state',
    'limit-readback', 'membership', 'normal-empty-job', 'output-capacity',
    'pipe-create', 'pipe-inheritance', 'pipe-peek', 'pipe-read', 'pipe-state',
    'pipe-stream', 'poll-state', 'resume', 'sample-state', 'stdin-create',
    'terminate-job', 'terminate-process',
])


def diagnostic_controller_type(supervisor, windows, private=False):
    """Keep finite exact-class failures at original first-failure selection.

    No operation is caught/retried here. Unknown exceptions still use the
    frozen generic classification; no messages, filenames or SQL are inspected.
    """
    if type(private) is not bool:
        raise ValueError('controller-purpose')
    require,number,uint,MIB = supervisor.require,supervisor.number,supervisor.uint,supervisor.MIB
    class Controller(supervisor.Controller):
        def remember(self, error, cleanup=False, fallback='controller-failure'):
            translated = error
            if type(error) is windows.BoundaryFailure:
                fields = object.__getattribute__(error, '__dict__')
                code = dict.get(fields, 'code') if type(fields) is dict else None
                if type(code) is str and code in NATIVE_FAILURE_CODES:
                    translated = supervisor.Refusal('native-' + code)
            else:
                for exact, category in (
                    (FileNotFoundError, 'filesystem-missing'),
                    (PermissionError, 'filesystem-denied'),
                    (NotADirectoryError, 'filesystem-not-directory'),
                    (IsADirectoryError, 'filesystem-is-directory'),
                    (json.JSONDecodeError, 'owned-json-invalid'),
                ):
                    if type(error) is exact:
                        translated = supervisor.Refusal(category)
                        break
            return super().remember(translated, cleanup, fallback)
    if not private:
        return Controller

    class PrivateController(Controller):
        # Exact frozen resource checks, with only the purpose-specific CPU
        # ceiling changed. Tests prove the inverse; samples remain truthful.
        def job(self):
            row = self.boundary.sample()
            require(type(row) is dict, 'resource-shape')
            cpu, peak, account = row.get('cpu'), row.get('committed'), row.get('accounting')
            require(number(cpu) and uint(peak) and type(account) is dict, 'resource-shape')
            keys = ('totalProcesses', 'activeProcesses', 'totalTerminatedProcesses', 'user100ns', 'kernel100ns')
            require(set(account) == set(keys) and all(uint(account[key]) for key in keys), 'resource-shape')
            require(account['activeProcesses'] <= 32 and account['activeProcesses'] <= account['totalProcesses'] and
                    account['totalTerminatedProcesses'] <= account['totalProcesses'], 'job-accounting')
            require(cpu == (account['user100ns'] + account['kernel100ns'])/10000000,
                    'job-accounting')
            require(cpu >= self.last_cpu and peak >= self.last_peak, 'resource-regression')
            if self.last_accounting is not None:
                require(all(account[key] >= self.last_accounting[key] for key in keys
                            if key != 'activeProcesses'), 'resource-regression')
            self.last_cpu, self.last_peak, self.last_accounting = cpu, peak, dict(account)
            require(cpu <= 300, 'resource-limit', 'jobCpuSeconds', cpu)
            require(peak <= self.job_memory_bytes, 'resource-limit', 'historicalPeakJobMemoryBytes', peak)
            # These are sampled independently of host_sample; neither is a reservation.
            for key, floor in (('physicalFree', 1024*MIB), ('commitFree', 1024*MIB),
                               ('cFree', 2048*MIB), ('dFree', 4096*MIB)):
                require(uint(row.get(key)), 'resource-shape')
                require(row[key] >= floor, 'resource-floor', key, row[key])
    return PrivateController


def semantic_completion(stdout, stderr, exit_code):
    """Validate this production suite, never alias historical synthetic cases.

    The frozen supervisor's transport record still has25/3 fields. Acceptance
    additionally binds the shared *new* ledger, exact semantic proof schema,
    actual restricted roles, bounded lock-contention scope and normal cleanup.
    It deliberately makes no multi-user throughput or matching-quality claim.
    """
    result = {'schema':'native-hierarchy-postgres-json-report/v2', 'accepted':False,
        'code':'input-type', 'stdoutBytes':0, 'stderrBytes':0,
        'stdoutSha256':None, 'stderrSha256':None, 'testPoints':0, 'outerTests':0}
    def refused(code):
        result['code'] = code
        return result
    def pairs(items):
        out = {}
        for key, value in items:
            if key in out:
                raise ValueError('duplicate')
            out[key] = value
        return out
    def parse(raw):
        return json.loads(raw.decode('utf8'), object_pairs_hook=pairs,
            parse_constant=lambda _: (_ for _ in ()).throw(ValueError('constant')))
    def shape(value, keys):
        return type(value) is dict and set(value) == set(keys.split())
    def integer(value, expected):
        return type(value) is int and value == expected
    if type(stdout) is not bytes or type(stderr) is not bytes:
        return result
    result.update(stdoutBytes=len(stdout), stderrBytes=len(stderr),
        stdoutSha256=hashlib.sha256(stdout).hexdigest(), stderrSha256=hashlib.sha256(stderr).hexdigest())
    if len(stdout) > 262144:
        return refused('stdout-limit')
    if len(stderr) > 65536:
        return refused('stderr-limit')
    if type(exit_code) is not int or exit_code != 0:
        return refused('exit-status')
    try:
        if not stdout.endswith(b'\n') or stdout.count(b'\n') != 1:
            return refused('json-encoding')
        value = parse(stdout)
    except (ValueError, UnicodeError, RecursionError):
        return refused('json-encoding')
    if not shape(value, 'schema accepted primary server cleanup proof'):
        return refused('json-shape')
    if value['schema'] != 'canonical-semantic-postgres-result/v1' or value['accepted'] is not True or value['primary'] is not None:
        return refused('json-proof')
    server = value['server']
    if (not shape(server, 'port version ownershipVerified') or not integer(server['port'],55433)
            or not integer(server['version'],170011) or server['ownershipVerified'] is not True):
        return refused('json-proof')
    cleanup = value['cleanup']
    if (not shape(cleanup,'reason stopped childExited clientsClosed physicalSettled directoryRetained')
            or cleanup['reason'] != 'verified-own-server-smart-stopped'
            or not all(cleanup[key] is True for key in cleanup if key != 'reason')):
        return refused('json-cleanup')
    proof = value['proof']
    if not shape(proof, 'schema status nativeExecuted pendingAssertions cases publicSubjectCases publicSourceBindingCases automaticSubjectCases automaticRetrievalCases automaticAuthorContextCases automaticAuthorInsightCases automaticTopicFeedCases automaticTopicPublicCases automaticPageTopicCases publishedTopicEvidenceCases restrictedRoleValidated concurrencyScope multiUserLoadValidated semanticQualityMeasured lastObservedSqlFailure cleanup'):
        return refused('json-shape')
    if (proof['schema'] != 'canonical-semantic-postgres-proof/v1' or proof['status'] != 'passed'
            or proof['nativeExecuted'] is not True or not integer(proof['pendingAssertions'],0)
            or proof['restrictedRoleValidated'] is not True
            or proof['concurrencyScope'] != 'head-switch-vs-apply-and-mvcc-read'
            or proof['multiUserLoadValidated'] is not False or proof['semanticQualityMeasured'] is not False
            or proof['lastObservedSqlFailure'] is not None):
        return refused('json-proof')
    # This fixed file is part of the authenticated catalog and end pins. Reading
    # it grants no authority and does not permit caller-selected case names.
    try:
        raw = (REPO/SEMANTIC_LEDGER).read_bytes()
        if not 0 < len(raw) <= 16384:
            return refused('json-cases')
        groups = parse(raw)
        if type(groups) is not list or len(groups) != 3:
            return refused('json-cases')
        expected = []
        for index, group in enumerate(groups):
            if (not shape(group, 'name children') or type(group['name']) is not str
                    or type(group['children']) is not list or len(group['children']) != (8,8,6)[index]
                    or any(type(name) is not str for name in group['children'])):
                return refused('json-cases')
            expected.append({'name':group['name'], 'depth':0, 'status':'passed'})
            expected.extend({'name':name, 'depth':1, 'status':'passed'} for name in group['children'])
        cases = proof['cases']
        if (type(cases) is not list or len(cases) != 25 or cases != expected
                or len({row['name'] for row in expected}) != 25
                or any(not shape(row,'name depth status') or type(row['depth']) is not int for row in cases)):
            return refused('json-cases')
    except (OSError, ValueError, UnicodeError, RecursionError):
        return refused('json-cases')
    try:
        raw = (REPO/PUBLIC_SUBJECT_LEDGER).read_bytes()
        if not 0 < len(raw) <= 4096:
            return refused('json-public-subject-cases')
        names = parse(raw)
        observed = proof['publicSubjectCases']
        if (type(names) is not list or len(names) != 8 or len(set(names)) != 8
                or any(type(name) is not str for name in names)
                or type(observed) is not list or len(observed) != 8
                or observed != [{'name':name,'status':'passed'} for name in names]
                or any(not shape(row,'name status') for row in observed)):
            return refused('json-public-subject-cases')
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        return refused('json-public-subject-cases')
    try:
        raw = (REPO/PUBLIC_SOURCE_LEDGER).read_bytes()
        if not 0 < len(raw) <= 4096:
            return refused('json-public-source-cases')
        names = parse(raw)
        observed = proof['publicSourceBindingCases']
        if (type(names) is not list or len(names) != 10 or len(set(names)) != 10
                or any(type(name) is not str for name in names)
                or type(observed) is not list or len(observed) != 10
                or observed != [{'name':name,'status':'passed'} for name in names]
                or any(not shape(row,'name status') for row in observed)):
            return refused('json-public-source-cases')
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        return refused('json-public-source-cases')
    try:
        raw = (REPO/AUTOMATIC_SUBJECT_LEDGER).read_bytes()
        if not 0 < len(raw) <= 4096:
            return refused('json-automatic-subject-cases')
        names = parse(raw)
        observed = proof['automaticSubjectCases']
        if (type(names) is not list or len(names) != 12 or len(set(names)) != 12
                or any(type(name) is not str for name in names)
                or type(observed) is not list or len(observed) != 12
                or observed != [{'name':name,'status':'passed'} for name in names]
                or any(not shape(row,'name status') for row in observed)):
            return refused('json-automatic-subject-cases')
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        return refused('json-automatic-subject-cases')
    try:
        raw = (REPO/AUTOMATIC_RETRIEVAL_LEDGER).read_bytes()
        if not 0 < len(raw) <= 4096:
            return refused('json-automatic-retrieval-cases')
        names = parse(raw)
        observed = proof['automaticRetrievalCases']
        if (type(names) is not list or len(names) != 20 or len(set(names)) != 20
                or any(type(name) is not str for name in names)
                or type(observed) is not list or len(observed) != 20
                or observed != [{'name':name,'status':'passed'} for name in names]
                or any(not shape(row,'name status') for row in observed)):
            return refused('json-automatic-retrieval-cases')
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        return refused('json-automatic-retrieval-cases')
    try:
        raw = (REPO/AUTOMATIC_AUTHOR_CONTEXT_LEDGER).read_bytes()
        if not 0 < len(raw) <= 4096:
            return refused('json-automatic-author-context-cases')
        names = parse(raw)
        observed = proof['automaticAuthorContextCases']
        if (type(names) is not list or len(names) != 10 or len(set(names)) != 10
                or any(type(name) is not str for name in names)
                or type(observed) is not list or len(observed) != 10
                or observed != [{'name':name,'status':'passed'} for name in names]
                or any(not shape(row,'name status') for row in observed)):
            return refused('json-automatic-author-context-cases')
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        return refused('json-automatic-author-context-cases')
    try:
        raw = (REPO/AUTOMATIC_AUTHOR_INSIGHT_LEDGER).read_bytes()
        if not 0 < len(raw) <= 4096:
            return refused('json-automatic-author-insight-cases')
        names = parse(raw)
        observed = proof['automaticAuthorInsightCases']
        if (type(names) is not list or len(names) != 7 or len(set(names)) != 7
                or any(type(name) is not str for name in names)
                or type(observed) is not list or len(observed) != 7
                or observed != [{'name':name,'status':'passed'} for name in names]
                or any(not shape(row,'name status') for row in observed)):
            return refused('json-automatic-author-insight-cases')
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        return refused('json-automatic-author-insight-cases')
    try:
        raw = (REPO/AUTOMATIC_TOPIC_FEED_LEDGER).read_bytes()
        if not 0 < len(raw) <= 4096:
            return refused('json-automatic-topic-feed-cases')
        names = parse(raw)
        observed = proof['automaticTopicFeedCases']
        if (type(names) is not list or len(names) != 9 or len(set(names)) != 9
                or any(type(name) is not str for name in names)
                or type(observed) is not list or len(observed) != 9
                or observed != [{'name':name,'status':'passed'} for name in names]
                or any(not shape(row,'name status') for row in observed)):
            return refused('json-automatic-topic-feed-cases')
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        return refused('json-automatic-topic-feed-cases')
    try:
        raw = (REPO/AUTOMATIC_TOPIC_PUBLIC_LEDGER).read_bytes()
        if not 0 < len(raw) <= 4096:
            return refused('json-automatic-topic-public-cases')
        names = parse(raw)
        observed = proof['automaticTopicPublicCases']
        if (type(names) is not list or len(names) != 59 or len(set(names)) != 59
                or any(type(name) is not str for name in names)
                or type(observed) is not list or len(observed) != 59
                or observed != [{'name':name,'status':'passed'} for name in names]
                or any(not shape(row,'name status') for row in observed)):
            return refused('json-automatic-topic-public-cases')
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        return refused('json-automatic-topic-public-cases')
    try:
        raw = (REPO/AUTOMATIC_PAGE_TOPIC_LEDGER).read_bytes()
        if not 0 < len(raw) <= 4096:
            return refused('json-automatic-page-topic-cases')
        names = parse(raw)
        observed = proof['automaticPageTopicCases']
        if (type(names) is not list or len(names) != 10 or len(set(names)) != 10
                or any(type(name) is not str for name in names)
                or type(observed) is not list or len(observed) != 10
                or observed != [{'name':name,'status':'passed'} for name in names]
                or any(not shape(row,'name status') for row in observed)):
            return refused('json-automatic-page-topic-cases')
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        return refused('json-automatic-page-topic-cases')
    try:
        raw = (REPO/PUBLISHED_TOPIC_EVIDENCE_LEDGER).read_bytes()
        if not 0 < len(raw) <= 4096:
            return refused('json-published-topic-evidence-cases')
        names = parse(raw)
        observed = proof['publishedTopicEvidenceCases']
        if (type(names) is not list or len(names) != 20 or len(set(names)) != 20
                or any(type(name) is not str for name in names)
                or type(observed) is not list or len(observed) != 20
                or observed != [{'name':name,'status':'passed'} for name in names]
                or any(not shape(row,'name status') for row in observed)):
            return refused('json-published-topic-evidence-cases')
    except (OSError, ValueError, TypeError, UnicodeError, RecursionError):
        return refused('json-published-topic-evidence-cases')
    # Preserve the frozen transport's25/3 counters. The additional actual
    # registry checks are separately required above and retained in child JSON.
    result.update(testPoints=25, outerTests=3)
    dbs = proof['cleanup']
    if (not shape(dbs, 'status used finished adminClosed failureCount databases') or dbs['status'] != 'passed'
            or not integer(dbs['used'],2) or dbs['finished'] is not True or dbs['adminClosed'] is not True
            or not integer(dbs['failureCount'],0) or type(dbs['databases']) is not list or len(dbs['databases']) != 2):
        return refused('json-cleanup')
    for index, row in enumerate(dbs['databases']):
        if (not shape(row, 'name oid created closed dropped pending cleanupFailures')
                or row['name'] != 'murmingle_hierarchy_fixture_20261026_'+('a' if index == 0 else 'b')
                or type(row['oid']) is not str or not 1 <= len(row['oid']) <= 10
                or not all('0' <= char <= '9' for char in row['oid']) or row['oid'].startswith('0')
                or not 0 < int(row['oid']) <= 4294967295
                or not all(row[key] is True for key in ('created','closed','dropped'))
                or not integer(row['pending'],0) or not integer(row['cleanupFailures'],0)):
            return refused('json-cleanup')
    if dbs['databases'][0]['oid'] == dbs['databases'][1]['oid']:
        return refused('json-cleanup')
    result.update(accepted=True, code='complete')
    return result


def private_completion(stdout, stderr, exit_code, upgrade=False):
    """Distinct fixed recovery/upgrade proofs; no cross-mode case aliases."""
    result = {'schema':'native-hierarchy-postgres-json-report/v2','accepted':False,
        'code':'input-type','stdoutBytes':0,'stderrBytes':0,'stdoutSha256':None,
        'stderrSha256':None,'testPoints':0,'outerTests':0}
    def refuse(code):
        result['code'] = code
        return result
    def shape(value, names):
        return type(value) is dict and set(value) == set(names.split())
    def integer(value, expected):
        return type(value) is int and value == expected
    def unique(items):
        value = {}
        for key, item in items:
            if key in value:
                raise ValueError('duplicate')
            value[key] = item
        return value
    if type(upgrade) is not bool:
        return refuse('purpose-type')
    if type(stdout) is not bytes or type(stderr) is not bytes:
        return result
    result.update(stdoutBytes=len(stdout),stderrBytes=len(stderr),
        stdoutSha256=hashlib.sha256(stdout).hexdigest(),stderrSha256=hashlib.sha256(stderr).hexdigest())
    if len(stdout) > 262144:
        return refuse('stdout-limit')
    if len(stderr) > 65536:
        return refuse('stderr-limit')
    if type(exit_code) is not int or exit_code != 0:
        return refuse('exit-status')
    try:
        if not stdout.endswith(b'\n') or stdout.count(b'\n') != 1:
            return refuse('json-encoding')
        value = json.loads(stdout.decode('utf8'),object_pairs_hook=unique,
            parse_constant=lambda _: (_ for _ in ()).throw(ValueError('constant')))
    except (ValueError,UnicodeError,RecursionError):
        return refuse('json-encoding')
    if not shape(value,'schema accepted primary server cleanup proof'):
        return refuse('json-shape')
    result_schema = 'owner-upgrade-postgres-result/v1' if upgrade else 'owner-restore-postgres-result/v1'
    if value['schema'] != result_schema or value['accepted'] is not True or value['primary'] is not None:
        return refuse('json-proof')
    server = value['server']
    if (not shape(server,'port version ownershipVerified') or not integer(server['port'],55433)
            or not integer(server['version'],170011) or server['ownershipVerified'] is not True):
        return refuse('json-proof')
    cleanup = value['cleanup']
    if (not shape(cleanup,'reason stopped childExited clientsClosed physicalSettled directoryRetained')
            or cleanup['reason'] != 'verified-own-server-smart-stopped'
            or not all(cleanup[key] is True for key in cleanup if key != 'reason')):
        return refuse('json-cleanup')
    proof = value['proof']
    fields = 'schema status primary cases pendingAssertions ownerData syntheticOnly archiveAuthenticated receiptBound completeInput cleanup '
    fields += 'migratedLegacyDataVerified schema9RecoveryRepeated schemaVersion preservedLegacyTables' if upgrade else 'restoreVerified'
    if not shape(proof,fields):
        return refuse('json-shape')
    proof_schema = 'owner-upgrade-postgres-proof/v1' if upgrade else 'owner-restore-postgres-proof/v1'
    if (proof['schema'] != proof_schema or proof['status'] != 'passed'
            or proof['primary'] is not None or not integer(proof['pendingAssertions'],0)
            or proof['ownerData'] is not True or proof['syntheticOnly'] is not False
            or not all(proof[key] is True for key in ('archiveAuthenticated','receiptBound','completeInput'))):
        return refuse('json-proof')
    if upgrade:
        if (proof['migratedLegacyDataVerified'] is not True or proof['schema9RecoveryRepeated'] is not False
                or not integer(proof['schemaVersion'],17) or not integer(proof['preservedLegacyTables'],18)):
            return refuse('json-proof')
    elif proof['restoreVerified'] is not True:
        return refuse('json-proof')
    expected = []
    groups = UPGRADE_GROUPS if upgrade else (
        ('Private restored schema and grant boundaries',(
            'Restored fixed schema9 identities and primary-key collations',
            'Restored owner and execute-only role boundaries')),
        ('Private full-data snapshot fingerprints',tuple('Restored snapshot table: '+name for name in RESTORED_TABLES)),
        ('Private restored generated ordinal safety',('Restored identity and ordinal sequences cannot reuse stored keys',)),
    )
    for name, children in groups:
        expected.append({'name':name,'depth':0,'status':'passed'})
        expected.extend({'name':child,'depth':1,'status':'passed'} for child in children)
    cases = proof['cases']
    if (type(cases) is not list or len(cases) != 25 or cases != expected
            or any(not shape(row,'name depth status') or type(row['depth']) is not int for row in cases)):
        return refuse('json-cases')
    result.update(testPoints=25,outerTests=3)
    dbs = proof['cleanup']
    if (not shape(dbs,'status used finished adminClosed failureCount databases') or dbs['status'] != 'passed'
            or not integer(dbs['used'],2) or dbs['finished'] is not True or dbs['adminClosed'] is not True
            or not integer(dbs['failureCount'],0) or type(dbs['databases']) is not list or len(dbs['databases']) != 2):
        return refuse('json-cleanup')
    for index, row in enumerate(dbs['databases']):
        if (not shape(row,'name oid created closed dropped pending cleanupFailures')
                or row['name'] != 'murmingle_hierarchy_fixture_20261026_'+('a' if index == 0 else 'b')
                or type(row['oid']) is not str or not 1 <= len(row['oid']) <= 10
                or not all('0' <= char <= '9' for char in row['oid']) or row['oid'].startswith('0')
                or not 0 < int(row['oid']) <= 4294967295
                or not all(row[key] is True for key in ('created','closed','dropped'))
                or not integer(row['pending'],0) or not integer(row['cleanupFailures'],0)):
            return refuse('json-cleanup')
    if dbs['databases'][0]['oid'] == dbs['databases'][1]['oid']:
        return refuse('json-cleanup')
    result.update(accepted=True,code='complete')
    return result


def automatic18_owner_completion(stdout,stderr,exit_code):
    """Distinct fixed17 full-data proof; old restore assertions stay unchanged.

    As for semantic_completion, the frozen supervisor's25/3 fields are a
    transport ABI, not the table/HTTP case count of this separate purpose.
    """
    result={'schema':'native-hierarchy-postgres-json-report/v2','accepted':False,'code':'json-proof',
        'stdoutBytes':len(stdout) if type(stdout) is bytes else 0,'stderrBytes':len(stderr) if type(stderr) is bytes else 0,
        'stdoutSha256':None,'stderrSha256':None,'testPoints':0,'outerTests':0}
    def shape(value,fields):return type(value) is dict and set(value)==set(fields.split())
    def integer(value,expected):return type(value) is int and value==expected
    def unique(items):
        value={}
        for key,item in items:
            if key in value:raise ValueError('duplicate')
            value[key]=item
        return value
    if type(stdout) is not bytes or type(stderr) is not bytes:return result
    result.update(stdoutSha256=hashlib.sha256(stdout).hexdigest(),stderrSha256=hashlib.sha256(stderr).hexdigest())
    if type(exit_code) is not int or exit_code!=0 or len(stdout)>262144 or len(stderr)>65536:return result
    try:
        if not stdout.endswith(b'\n') or stdout.count(b'\n')!=1:return result
        v=json.loads(stdout.decode('utf8'),object_pairs_hook=unique,parse_constant=lambda _: (_ for _ in ()).throw(ValueError('constant')))
        if not shape(v,'schema accepted primary server cleanup proof') or v['schema']!='owner-automatic18-postgres-result/v1' or v['accepted'] is not True or v['primary'] is not None:return result
        s,c,p=v['server'],v['cleanup'],v['proof']
        if not shape(s,'port version ownershipVerified') or not integer(s['port'],55433) or not integer(s['version'],170011) or s['ownershipVerified'] is not True:return result
        if not shape(c,'reason stopped childExited clientsClosed physicalSettled directoryRetained') or c['reason']!='verified-own-server-smart-stopped' or not all(c[k] is True for k in c if k!='reason'):return result
        if not shape(p,'status archiveAuthenticated completeInput ownerData syntheticOnly upgrade application databases databaseCleanupPassed') or p['status']!='passed' or p['syntheticOnly'] is not False or not all(p[k] is True for k in ('archiveAuthenticated','completeInput','ownerData','databaseCleanupPassed')):return result
        u=p['upgrade']
        if not shape(u,'schema status schemaVersion restoredTables preservedLegacyTables legacyRowsUnchanged matcherUnchanged policyUnchanged runtimeVersionUnchanged generatedSequencesSafe testComposition') or u['schema']!='private-restored-automatic18-upgrade/v1' or u['status']!='passed' or u['testComposition'] is not False:return result
        if not integer(u['schemaVersion'],18) or not integer(u['restoredTables'],28) or not integer(u['preservedLegacyTables'],27) or not all(u[k] is True for k in ('legacyRowsUnchanged','matcherUnchanged','policyUnchanged','runtimeVersionUnchanged','generatedSequencesSafe')):return result
        a=p['application']
        if not shape(a,'status proofSha256 proofBytes') or a['status']!='passed' or type(a['proofSha256']) is not str or re.fullmatch('[a-f0-9]{64}',a['proofSha256']) is None or type(a['proofBytes']) is not int or not 0<a['proofBytes']<=32768:return result
        rows=p['databases']
        if type(rows) is not list or len(rows)!=2:return result
        for i,r in enumerate(rows):
            if not shape(r,'name oid created closed dropped pending cleanupFailures') or r['name']!='murmingle_hierarchy_fixture_20261026_'+('a' if i==0 else 'b') or type(r['oid']) is not str or re.fullmatch('[1-9][0-9]{0,9}',r['oid']) is None or int(r['oid'])>4294967295:return result
            if not all(r[k] is True for k in ('created','closed','dropped')) or not integer(r['pending'],0) or not integer(r['cleanupFailures'],0):return result
        if rows[0]['oid']==rows[1]['oid']:return result
    except (ValueError,UnicodeError,RecursionError,KeyError,TypeError):return result
    result.update(accepted=True,code='complete',testPoints=25,outerTests=3)
    return result


def open_locked_read(path):
    """Read-only Windows handle denies concurrent write/delete while held.

    Inert until called by the separately authorized private attempt. No path
    enters from the CLI. Child authentication still checks the complete GCM.
    """
    import msvcrt
    kernel = ctypes.WinDLL('kernel32',use_last_error=True)
    kernel.CreateFileW.argtypes = [ctypes.c_wchar_p,ctypes.c_uint32,ctypes.c_uint32,
        ctypes.c_void_p,ctypes.c_uint32,ctypes.c_uint32,ctypes.c_void_p]
    kernel.CreateFileW.restype = ctypes.c_void_p
    kernel.CloseHandle.argtypes = [ctypes.c_void_p]
    kernel.CloseHandle.restype = ctypes.c_int
    handle = kernel.CreateFileW(str(path),0x80000000,1,None,3,0x08200000,None)
    if handle in (None,ctypes.c_void_p(-1).value):
        raise OSError('private-input-open')
    try:
        fd = msvcrt.open_osfhandle(handle,os.O_RDONLY | os.O_BINARY)
    except BaseException:
        kernel.CloseHandle(handle)
        raise
    try:
        return os.fdopen(fd,'rb',buffering=0)
    except BaseException:
        os.close(fd)
        raise


class PrivateInputs:
    """Fixed encrypted data is held separately from the bounded code catalog."""
    def __init__(self, inventory, opener=open_locked_read, clock=time.monotonic, model=False,product=False,automatic18=False,browser=False):
        inventory.require(type(model) is bool and type(product) is bool and (not product or model),'private-input-purpose')
        self.i,self.opener,self.clock = inventory,opener,clock
        self.model = model
        self.product = product
        inventory.require(type(automatic18) is bool and (not automatic18 or not model and not product),'private-input-purpose')
        self.automatic18 = automatic18
        inventory.require(type(browser) is bool and (not browser or automatic18 and not model and not product),'automatic18-browser-purpose')
        self.browser = browser
        self.files = []
        self.prepared = self.closed = False
        self.verified = False
        self.close_failed = False
        self.deadline = STARTED+360

    def _time(self):
        self.i.require(self.clock() < self.deadline,'private-input-deadline')

    @staticmethod
    def identity(info):
        return (info.st_dev,info.st_ino,info.st_size,info.st_mtime_ns,
            info.st_birthtime_ns if os.name == 'nt' else info.st_ctime_ns)

    def check(self):
        I = self.i
        I.require(self.prepared and not self.closed,'private-input-state')
        self._time()
        for path,size,digest,stream,before,opened in self.files:
            directory_info(path.parent,I)
            after,held = path.lstat(),os.fstat(stream.fileno())
            I.require(I.no_reparse(after) and stat.S_ISREG(after.st_mode)
                and self.identity(before) == self.identity(after) == self.identity(opened) == self.identity(held)
                and before.st_ctime_ns == after.st_ctime_ns
                and opened.st_ctime_ns == held.st_ctime_ns,'private-input-changed')

    def _hash(self, record):
        path,size,digest,stream,_,_ = record
        stream.seek(0)
        hashed,used = hashlib.sha256(),0
        while True:
            self._time()
            raw = stream.read(65536)
            if not raw:
                break
            used += len(raw)
            self.i.require(used <= size,'private-input-size')
            hashed.update(raw)
        self.i.require(used == size and hashed.hexdigest() == digest,'private-input-pin')

    def prepare(self):
        I = self.i
        I.require(not self.prepared and not self.files and not self.closed,'private-input-state')
        try:
            for path,size,digest in (AUTOMATIC18_OWNER_INPUTS if self.automatic18 else PRIVATE_INPUTS) + (MODEL_INPUTS if self.model else ()) + (BROWSER_INPUTS if self.product or self.browser else ()):
                self._time()
                directory_info(path.parent,I)
                before = path.lstat()
                I.require(I.no_reparse(before) and stat.S_ISREG(before.st_mode) and before.st_size == size,'private-input-size')
                stream = self.opener(path)
                # Register before any observation that can fail, so cleanup
                # cannot forget a successfully opened handle.
                record = (path,size,digest,stream,before,None)
                self.files.append(record)
                record = (path,size,digest,stream,before,os.fstat(stream.fileno()))
                self.files[-1] = record
                self._hash(record)
            self.prepared = True
            self.check()
        except BaseException:
            # Preserve the original input failure. The enclosing driver records
            # an unverified close independently as cleanup failure.
            try:
                self.close()
            except BaseException:
                self.close_failed = True
            raise

    def finish(self, deadline):
        self.i.require(type(deadline) in (int,float) and STARTED < deadline <= STARTED+380,'private-input-deadline')
        self.deadline = deadline
        self.check()
        for record in self.files:
            self._hash(record)
        self.check()
        self.close()
        self.i.require(not self.close_failed,'private-input-close')
        self.verified = True

    def close(self):
        first = None
        for record in self.files:
            stream = record[3]
            try:
                if not stream.closed:
                    stream.close()
                self.i.require(stream.closed,'private-input-close')
            except BaseException as error:
                if first is None:
                    first = error
        self.closed = all(record[3].closed for record in self.files)
        if first is not None:
            self.close_failed = True
            raise first


class PrivatePhases:
    """Sample closed checkpoint prefixes; a checkpoint is never SQL authority."""
    def __init__(self, inventory, run, upgrade=False,automatic18=False):
        inventory.require(type(upgrade) is bool,'private-phase-purpose')
        self.i,self.run = inventory,run
        inventory.require(type(automatic18) is bool and (not automatic18 or upgrade),'private-phase-purpose')
        self.phases = AUTOMATIC18_OWNER_PHASES if automatic18 else UPGRADE_PHASES if upgrade else PRIVATE_PHASES
        self.schema = 'private-owner-automatic18-phase/v1' if automatic18 else 'private-owner-upgrade-phase/v1' if upgrade else 'private-owner-restore-phase/v1'
        self.pending_ids,self.closed = {},[]

    def check(self):
        I,root = self.i,self.run.output
        directory_info(root,I)
        allowed = {'phase-%02d.%s'%(index,suffix) for index in range(len(self.phases))
            for suffix in ('pending','json')}
        with os.scandir(root) as entries:
            for entry in entries:
                if entry.name.startswith('phase-'):
                    I.require(entry.name in allowed,'private-phase-name')
        for index in range(len(self.phases)):
            pending = root/('phase-%02d.pending'%index)
            if os.path.lexists(pending):
                info = pending.lstat()
                I.require(I.no_reparse(info) and stat.S_ISREG(info.st_mode) and info.st_nlink in (1,2)
                    and 0 <= info.st_size <= 1024,'private-phase-pending')
                identity = (info.st_dev,info.st_ino)
                if index in self.pending_ids:
                    I.require(self.pending_ids[index] == identity,'private-phase-replaced')
                else:
                    self.pending_ids[index] = identity
            else:
                I.require(index not in self.pending_ids,'private-phase-disappeared')
        # Read permanent paths in prefix order, rather than interpreting one
        # directory enumeration as an atomic snapshot of legal publication.
        for index,stage in enumerate(self.phases):
            final = root/('phase-%02d.json'%index)
            if not os.path.lexists(final):
                I.require(index >= len(self.closed),'private-phase-disappeared')
                break
            pending = root/('phase-%02d.pending'%index)
            info,pi = final.lstat(),pending.lstat()
            I.require(I.no_reparse(info) and I.no_reparse(pi) and stat.S_ISREG(info.st_mode)
                and stat.S_ISREG(pi.st_mode) and 0 < info.st_size <= 1024 and info.st_nlink == pi.st_nlink == 2
                and (info.st_dev,info.st_ino,info.st_size) == (pi.st_dev,pi.st_ino,pi.st_size),'private-phase-link')
            with final.open('rb') as stream:
                raw = stream.read(1025)
            digest = hashlib.sha256(raw).hexdigest()
            I.require(len(raw) == info.st_size and I.hash_regular_file(root,final.name,info.st_size) == digest
                and I.hash_regular_file(root,pending.name,pi.st_size) == digest,'private-phase-pin')
            try:
                value = json.loads(raw,object_pairs_hook=I._unique_pairs)
            except (ValueError,UnicodeError,RecursionError):
                raise I.Refusal('private-phase-record') from None
            I.require(type(value) is dict and set(value) == {'schema','ordinal','stage','elapsedMs'}
                and value['schema'] == self.schema and type(value['ordinal']) is int
                and value['ordinal'] == index and value['stage'] == stage and type(value['elapsedMs']) is int
                and 0 <= value['elapsedMs'] <= 360000 and raw == I.canonical_json(value),'private-phase-record')
            if index:
                I.require(value['elapsedMs'] >= self.closed[index-1][1],'private-phase-clock')
            observed = (digest,value['elapsedMs'])
            if index < len(self.closed):
                I.require(self.closed[index] == observed,'private-phase-changed')
            else:
                self.closed.append(observed)

    def complete(self):
        self.check()
        self.i.require(len(self.closed) == len(self.phases),'private-phase-incomplete')


def checked_model_proof(I,value):
    """Closed additional real-E5 workload evidence, never quality authority."""
    def shape(item,fields): return type(item) is dict and set(item)==set(fields.split())
    def bounded(item,low,high): return type(item) is int and low<=item<=high
    def timing(item): return I.number(item) and item<=300000
    def identifier(item): return type(item) is str and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._:-]{0,159}',item) is not None
    def digest(item): return type(item) is str and re.fullmatch(r'[a-f0-9]{64}',item) is not None
    I.require(shape(value,'schema status failure testComposition elapsedMs completed phases maximumPending installed cleanup scope ownerVerification fixtureIsolation')
        and value['schema']=='private-model-contention-proof/v1' and value['status']=='passed'
        and value['failure'] is None and value['testComposition'] is False and timing(value['elapsedMs'])
        and bounded(value['maximumPending'],1,8),'model-proof-shape')
    installed,cleanup,scope,owner = value['installed'],value['cleanup'],value['scope'],value['ownerVerification']
    I.require(shape(installed,'matcherIdentityHash encoderModelId packagedAssetsVerified')
        and installed['matcherIdentityHash']=='4e9b3d3d2053327707d6ff395a8373e6e5ac3195333183ac8516f84195c45524'
        and installed['encoderModelId']=='e5-small-q8-browser-main-prefix-v1'
        and installed['packagedAssetsVerified'] is True,'model-proof-identity')
    I.require(shape(cleanup,'resourcesClosed originalsSettled callerDatabasesClosed')
        and cleanup['resourcesClosed'] is True and cleanup['originalsSettled'] is True
        and cleanup['callerDatabasesClosed'] is False,'model-proof-cleanup')
    positive=('realE5','realQueuedApply','realHttp','sharedEncoder','stagedCrawlerClient')
    negative=('fullCrawlerDiscovery','storedBackfill','browser','provider','qualityEvaluation','productionValidated','assignmentAuthority')
    I.require(shape(scope,' '.join(positive+negative)) and all(scope[k] is True for k in positive)
        and all(scope[k] is False for k in negative),'model-proof-scope')
    I.require(shape(owner,'operations sources observations') and all(type(n) is int and n==2 for n in owner.values()),'model-proof-owner')
    isolation=value['fixtureIsolation']
    I.require(shape(isolation,'retiredHistoricalJobs emptyBeforeModel')
        and bounded(isolation['retiredHistoricalJobs'],0,16)
        and isolation['emptyBeforeModel'] is True,'model-proof-isolation')
    stages=('baseline','encoder-initialization','body-encoding-1','queue-application-1','body-encoding-2','queue-application-2')
    I.require(type(value['phases']) is list and len(value['phases'])==6,'model-proof-phases')
    for phase,stage in zip(value['phases'],stages):
        I.require(shape(phase,'stage elapsedMs pendingWorkProbeCount context topics') and phase['stage']==stage
            and timing(phase['elapsedMs']) and bounded(phase['pendingWorkProbeCount'],0,8),'model-proof-phase')
        I.require(stage!='baseline' or phase['pendingWorkProbeCount']==0,'model-proof-phase')
        for kind in ('context','topics'):
            summary=phase[kind]
            I.require(shape(summary,'count p50 p95 max') and bounded(summary['count'],0,3 if stage=='baseline' else 8),'model-proof-summary')
            I.require(stage!='baseline' or summary['count']==3,'model-proof-summary')
            if summary['count']==0:
                I.require(all(summary[k] is None for k in ('p50','p95','max')),'model-proof-summary')
            else:
                I.require(all(timing(summary[k]) for k in ('p50','p95','max'))
                    and summary['p50']<=summary['p95']<=summary['max'],'model-proof-summary')
    roots={'business','cooking','culture','education','games','geography','health','history','ideas-beliefs','languages','nature','science','society','sports','technology','vehicles'}
    expected=(('real-train-01','aba50dd9302b5448b0e5b4f14792e681810e6238d45d7b524c772a21c4fd5115'),
              ('real-train-04','4c89c4fe4490894cd7877790a4d4021c8a1babd5accf91be0212411c7952b3ff'))
    I.require(type(value['completed']) is list and len(value['completed'])==2,'model-proof-completed')
    operations,sources=set(),set()
    for row,(case,input_hash) in zip(value['completed'],expected):
        I.require(shape(row,'id sourceInputHash operationId operationDigest sourceId sourceVersion topicId supportedPath')
            and row['id']==case and row['sourceInputHash']==input_hash
            and all(identifier(row[k]) for k in ('operationId','sourceId','topicId')) and digest(row['operationDigest'])
            and type(row['sourceVersion']) is str and re.fullmatch(r'0|[1-9][0-9]{0,18}',row['sourceVersion']) is not None,'model-proof-completed')
        path=row['supportedPath']
        I.require(type(path) is list and 1<=len(path)<=8 and all(type(n) is str for n in path)
            and ((len(path)==1 and path[0] in roots) or path==['games','video-games'] or path==['games','video-games','gta']),'model-proof-path')
        I.require(row['operationId'] not in operations and row['sourceId'] not in sources,'model-proof-completed')
        operations.add(row['operationId']);sources.add(row['sourceId'])


def checked_browser_proof(I,value,automatic18=False):
    """Four real UI operations through raw local HTTP; no native/provider claim."""
    I.require(type(automatic18) is bool,'browser-proof-purpose')
    def shape(item,fields):return type(item) is dict and set(item)==set(fields.split())
    def number(item,low,high):return type(item) in (int,float) and type(item) is not bool and low<=item<=high
    I.require(shape(value,'ui ownerVerification runtime'),'browser-proof-owner')
    runtime=value['runtime']
    I.require(shape(runtime,'chromeExecutableSha256 installedDllsPinned')
        and runtime['chromeExecutableSha256']=='177e4939361ccac7b37bb68b0642dff418856d7792c89ccde70d9aabeb14b159'
        and runtime['installedDllsPinned'] is False,'browser-proof-runtime')
    owner=value['ownerVerification']
    I.require(shape(owner,'roots replies manualSnapshots') and type(owner['roots']) is int and owner['roots']==1
        and type(owner['replies']) is int and owner['replies']==1 and type(owner['manualSnapshots']) is int and owner['manualSnapshots']==0,'browser-proof-owner')
    value=value['ui']
    names=('named-account-and-semantic-directory-search','human-root-in-original-canonical-topic-null-origin',
        'human-reply-and-stored-read-original-destination','second-account-edit-denied-original-body-retained')
    I.require(shape(value,'schema status cases pendingCases origin canonical requests maxConcurrentRequests cleanup scope failure elapsedMs history transportFailure'+(' directoryProtocol' if automatic18 else ''))
        and value['schema']=='private-application-browser-proof/v1' and value['status']=='passed'
        and value['cases']==[{'name':name,'status':'passed'} for name in names]
        and type(value['pendingCases']) is int and value['pendingCases']==0 and value['failure'] is None
        and type(value['origin']) is str and re.fullmatch(r'chrome-extension://[a-p]{32}',value['origin']) is not None
        and type(value['requests']) is int and 1<=value['requests']<=64
        and type(value['maxConcurrentRequests']) is int and 1<=value['maxConcurrentRequests']<=4
        and value['maxConcurrentRequests']<=value['requests'] and number(value['elapsedMs'],0,300000)
        and value['transportFailure'] is None,'browser-proof-shape')
    if automatic18:
        I.require(value['directoryProtocol']=='semantic-topics/v2','browser-proof-directory-protocol')
    history=value['history']
    I.require(shape(history,'verified anonymous originalIdsRead readOnly noSourceLinks flatReplies layoutWithinBounds viewportWidth directoryPages messagePages directoryPaginationObserved messagePaginationObserved')
        and all(history[key] is True for key in ('verified','anonymous','originalIdsRead','readOnly','noSourceLinks','flatReplies','layoutWithinBounds'))
        and type(history['viewportWidth']) is int and history['viewportWidth']==320
        and all(type(history[key]) is int and 1<=history[key]<=5 for key in ('directoryPages','messagePages'))
        and all(type(history[key]) is bool for key in ('directoryPaginationObserved','messagePaginationObserved')),'browser-proof-history')
    canonical=value['canonical']
    I.require(shape(canonical,'topicId discussionId rootId replyId')
        and all(type(x) is str and 0<len(x)<=128 and re.fullmatch(r'[A-Za-z0-9._:-]+',x) is not None for x in canonical.values())
        and canonical['rootId']!=canonical['replyId'],'browser-proof-canonical')
    cleanup=value['cleanup']
    I.require(shape(cleanup,'browserClosed ownedRootExited pendingRequests pendingTasks profileRemoved')
        and all(cleanup[key] is True for key in ('browserClosed','ownedRootExited','profileRemoved'))
        and all(type(cleanup[key]) is int and cleanup[key]==0 for key in ('pendingRequests','pendingTasks')),'browser-proof-cleanup')
    scope=value['scope']
    I.require(shape(scope,'realBrowser realHttpProxy sqlVerifiedByThisHelper nativeCapture nativeSidePanel provider externalIdentity productionCapacity')
        and scope['realBrowser'] is True and scope['realHttpProxy'] is True
        and all(scope[key] is False for key in ('sqlVerifiedByThisHelper','nativeCapture','nativeSidePanel','provider','externalIdentity','productionCapacity')),'browser-proof-scope')


def checked_legacy_proof(I,value):
    def shape(item,fields):return type(item) is dict and set(item)==set(fields.split())
    def count(item,maximum):return type(item) is int and 0<=item<=maximum
    I.require(shape(value,'schema status reason failure counts canonicalPreserved repeatInert readVerified resourcesClosed testComposition scope')
        and value['schema']=='private-original-legacy-adoption-proof/v1' and value['status'] in ('passed','not-applicable')
        and value['failure'] is None and value['resourcesClosed'] is True and value['testComposition'] is False
        and all(type(value[key]) is bool for key in ('canonicalPreserved','repeatInert','readVerified')),'legacy-proof-shape')
    counts=value['counts']
    I.require(shape(counts,'pages scanned pending eligible prepared reclassified adopted')
        and count(counts['pages'],10) and count(counts['scanned'],100)
        and counts['scanned']<=10*counts['pages']
        and all(count(counts[key],1) for key in ('pending','eligible','prepared','reclassified','adopted'))
        and counts['pending']+counts['eligible']<=1
        and counts['pending']+counts['eligible']<=counts['scanned']
        and counts['reclassified']<=counts['prepared']<=counts['pending'],'legacy-proof-counts')
    scope=value['scope']
    I.require(shape(scope,'originalBackupRootsOnly maximumPages pageSize maximumAdoptedRoots contextBasis recapture qualityEvaluation canonicalWrites callerDatabasesClosed')
        and scope['originalBackupRootsOnly'] is True
        and type(scope['maximumPages']) is int and scope['maximumPages']==10
        and type(scope['pageSize']) is int and scope['pageSize']==10
        and type(scope['maximumAdoptedRoots']) is int and scope['maximumAdoptedRoots']==1
        and scope['contextBasis']=='legacy-current-source-context'
        and all(scope[key] is False for key in ('recapture','qualityEvaluation','canonicalWrites','callerDatabasesClosed')),'legacy-proof-scope')
    if value['status']=='passed':
        I.require(value['reason'] is None and counts['adopted']==1 and counts['pending']+counts['eligible']==1
            and all(value[key] is True for key in ('canonicalPreserved','repeatInert','readVerified')),'legacy-proof-adopted')
    else:
        I.require(value['reason'] in ('no-eligible-original-root','original-source-ineligible','original-source-unclassified')
            and counts['adopted']==0 and value['repeatInert'] is False and value['readVerified'] is False,'legacy-proof-unavailable')
        if value['reason']=='no-eligible-original-root':
            I.require(counts['pending']+counts['eligible']==0 and counts['prepared']==counts['reclassified']==0
                and value['canonicalPreserved'] is False,'legacy-proof-unavailable')
        else:
            I.require(counts['pending']+counts['eligible']==1 and value['canonicalPreserved'] is True,'legacy-proof-unavailable')


class PrivateHttpProof:
    """Additional mandatory HTTP evidence; never aliases the restore ledger."""
    def __init__(self,inventory,run,model=False,product=False,automatic18=False,browser=False):
        inventory.require(type(model) is bool and type(product) is bool and (not product or model),'http-proof-purpose')
        self.i,self.root,self.digest = inventory,run.output,None
        self.model = model
        self.product = product
        inventory.require(type(automatic18) is bool and (not automatic18 or not model and not product),'http-proof-purpose')
        self.automatic18 = automatic18
        inventory.require(type(browser) is bool and (not browser or automatic18 and not model and not product),'automatic18-browser-purpose')
        self.browser = browser
        self.identity = None

    def _read(self):
        I = self.i
        directory_info(self.root,I)
        final,pending = self.root/'application-proof.json',self.root/'application-proof.pending.json'
        a,b = final.lstat(),pending.lstat()
        I.require(I.no_reparse(a) and I.no_reparse(b) and stat.S_ISREG(a.st_mode) and stat.S_ISREG(b.st_mode)
            and 0 < a.st_size <= 32768 and a.st_nlink == b.st_nlink == 2
            and (a.st_dev,a.st_ino,a.st_size) == (b.st_dev,b.st_ino,b.st_size),'http-proof-link')
        with final.open('rb') as stream:
            raw = stream.read(32769)
        digest = hashlib.sha256(raw).hexdigest()
        I.require(len(raw) == a.st_size and I.hash_regular_file(self.root,final.name,a.st_size) == digest
            and I.hash_regular_file(self.root,pending.name,b.st_size) == digest,'http-proof-pin')
        try:
            value = json.loads(raw,object_pairs_hook=I._unique_pairs,
                parse_constant=lambda _: (_ for _ in ()).throw(I.Refusal('http-proof-json')))
        except (ValueError,UnicodeError,RecursionError):
            raise I.Refusal('http-proof-json') from None
        return value,digest,(a.st_dev,a.st_ino,a.st_size)

    def complete(self):
        I = self.i
        value,digest,identity = self._read()
        def shape(item,fields):
            return type(item) is dict and set(item) == set(fields.split())
        def bounded(item,low,high):
            return type(item) is int and low <= item <= high
        I.require(shape(value,'schema status cases pendingCases server counts cleanup scope failure elapsedMs upgrade'+(' model' if self.model else '')+(' browser legacy' if self.product else ' browser' if self.browser else ''))
            and value['schema'] == ('private-automatic18-application-http-proof/v1' if self.automatic18 else 'private-application-http-proof/v1') and value['status'] == 'passed'
            and value['failure'] is None and type(value['pendingCases']) is int and value['pendingCases'] == 0
            and bounded(value['elapsedMs'],0,300000),'http-proof-shape')
        cases = AUTOMATIC18_HTTP_CASES if self.automatic18 else HTTP_CASES
        I.require(type(value['cases']) is list and len(value['cases']) == len(cases)
            and value['cases'] == [{'name':name,'status':'passed'} for name in cases],'http-proof-cases')
        server,counts,upgrade = value['server'],value['counts'],value['upgrade']
        I.require(shape(server,'destinationPort canonicalHost loopbackOnly')
            and type(server['destinationPort']) is int and server['destinationPort'] == 4185
            and server['canonicalHost'] == '127.0.0.1:4174' and server['loopbackOnly'] is True,'http-proof-server')
        I.require(shape(upgrade,'schemaVersion preservedLegacyTables legacyRowsUnchanged')
            and type(upgrade['schemaVersion']) is int and upgrade['schemaVersion'] == (18 if self.automatic18 else 17)
            and type(upgrade['preservedLegacyTables']) is int and upgrade['preservedLegacyTables'] == (27 if self.automatic18 else 18)
            and upgrade['legacyRowsUnchanged'] is True,'http-proof-upgrade')
        I.require(shape(counts,'httpRequests maximumConcurrentHttp fixtureActors')
            and bounded(counts['httpRequests'],1,512) and bounded(counts['maximumConcurrentHttp'],1,4)
            and counts['maximumConcurrentHttp'] <= counts['httpRequests']
            and type(counts['fixtureActors']) is int and counts['fixtureActors'] == 2,'http-proof-counts')
        cleanup,scope = value['cleanup'],value['scope']
        extra=(('workerClientClosed','submitterClientClosed') if self.model else ())+(('browserClosed',) if self.product or self.browser else ())
        I.require(shape(cleanup,'serverClosed applicationClosed appClientClosed urlClientClosed pendingHttp pendingDatabase'+(' workerClientClosed submitterClientClosed' if self.model else '')+(' browserClosed' if self.product or self.browser else ''))
            and all(cleanup[key] is True for key in ('serverClosed','applicationClosed','appClientClosed','urlClientClosed')+extra)
            and all(type(cleanup[key]) is int and cleanup[key] == 0 for key in ('pendingHttp','pendingDatabase')),'http-proof-cleanup')
        I.require(shape(scope,'realHttp realDatabase browser encoder provider externalLoginVerified productionCapacityValidated testComposition')
            and scope['realHttp'] is True and scope['realDatabase'] is True
            and scope['encoder'] is self.model
            and scope['browser'] is (self.product or self.browser)
            and all(scope[key] is False for key in ('provider','externalLoginVerified',
                'productionCapacityValidated','testComposition')),'http-proof-scope')
        if self.model:
            checked_model_proof(I,value['model'])
        if self.product or self.browser:
            checked_browser_proof(I,value['browser'],automatic18=self.browser)
        if self.product:
            checked_legacy_proof(I,value['legacy'])
        if self.digest is not None:
            I.require(self.digest == digest and self.identity == identity,'http-proof-changed')
        self.digest = digest
        self.identity = identity

    def check(self):
        if self.digest is not None:
            self.complete()


def load_pinned(name):
    key, expected = PINS[name]
    path = REPO/key
    for component in reversed((path,) + tuple(path.parents)):
        info = component.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise RuntimeError('library-reparse')
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= 262144:
        raise RuntimeError('library-size')
    with path.open('rb') as stream:
        opened = os.fstat(stream.fileno())
        raw = stream.read(262145)
        after_open = os.fstat(stream.fileno())
    after = path.lstat()
    identity = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns,
                          s.st_birthtime_ns if os.name == 'nt' else s.st_ctime_ns)
    if not (identity(before) == identity(opened) == identity(after_open) == identity(after)
            and before.st_ctime_ns == after.st_ctime_ns
            and opened.st_ctime_ns == after_open.st_ctime_ns
            and len(raw) == before.st_size and hashlib.sha256(raw).hexdigest() == expected):
        raise RuntimeError('library-pin')
    module = types.ModuleType('_maintained_hierarchy_' + name)
    module.__file__ = str(path)
    exec(compile(raw, str(path), 'exec'), module.__dict__)
    return module


def native_api_type(windows, run):
    # Only the fixed CreateProcess entry/TEMP binding differs. Assignment,
    # inherited-handle whitelist, readback, census and close use frozen code.
    require = windows.require
    wintypes = windows.wintypes
    TEMP = run.output / 'temp'
    model = getattr(run,'model',False)
    product = getattr(run,'product',False)
    automatic18 = getattr(run,'automatic18',False)
    browser = getattr(run,'browser',False)
    require(type(browser) is bool and (not browser or automatic18 and not model and not product),'automatic18-browser-purpose')
    require(type(automatic18) is bool and (not automatic18 or getattr(run,'private',False) is True and getattr(run,'http',False) is True and not model and not product),'run-purpose')
    require(type(model) is bool and type(product) is bool and (not product or model) and (not model or (getattr(run,'private',False) is True and getattr(run,'http',False) is True)), 'run-purpose')
    HEAP = '512' if model else '64'
    MODEL_ARG = ' --with-product' if product else ' --with-model' if model else ' --with-browser' if browser else ''
    # A closed mode chooses between reviewed fixed entries and supplies the one
    # fixed private metadata variable. Removing that explicit prefix restores
    # the frozen suspended-launch AST; default environment bytes stay exact.
    ENTRY = AUTOMATIC18_OWNER_ENTRY if automatic18 else HTTP_ENTRY if getattr(run,'http',False) else PRIVATE_ENTRY if getattr(run, 'private', False) else globals()['ENTRY']
    ENV_PREFIX = 'LOCALAPPDATA=C:\\Users\\Laurens\\AppData\\Local\0' if getattr(run, 'private', False) else ''

    class NativeAPI(windows._WinAPI):
        def create_process(self, attributes, stdin, stdout, stderr):
            class ExtendedStartup(ctypes.Structure):
                _fields_ = [('startup', self.m.StartupInfo), ('attributes', ctypes.c_void_p)]
            require(ctypes.sizeof(self.m.StartupInfo) == 104 and ctypes.sizeof(ExtendedStartup) == 112
                    and ctypes.sizeof(self.m.ProcessInfo) == 24, 'abi')
            startup, info = ExtendedStartup(), self.m.ProcessInfo()
            startup.startup.cb, startup.startup.flags = ctypes.sizeof(startup), 0x101
            startup.startup.show = 0
            startup.startup.stdin, startup.startup.stdout, startup.startup.stderr = stdin, stdout, stderr
            startup.attributes = ctypes.addressof(attributes[0])
            command = '"' + NODE + '" --max-old-space-size=' + HEAP + ' "' + str(REPO / ENTRY) + '"' + MODEL_ARG
            environment = ENV_PREFIX + ('OMP_NUM_THREADS=1\0PATH=D:\\PostgreSQL\\17\\bin;C:\\Windows\\System32;C:\\Windows\0'
                           'SystemRoot=C:\\Windows\0TEMP=' + str(TEMP) + '\0TMP=' + str(TEMP) +
                           '\0UV_THREADPOOL_SIZE=1\0WINDIR=C:\\Windows\0\0')
            block = ctypes.create_unicode_buffer(environment, len(environment))
            ok = self.k.CreateProcessW(NODE, ctypes.create_unicode_buffer(command), None, None, True,
                CREATE_FLAGS, block, str(REPO), ctypes.cast(ctypes.byref(startup),
                ctypes.POINTER(self.m.StartupInfo)), ctypes.byref(info))
            require(bool(ok), 'create-process')
            return info.process, info.thread, int(info.pid)

    if not model:
        return NativeAPI
    class ModelAPI(NativeAPI):
        def set_limits(self, job):
            limits = self.m.ExtendedLimits()
            limits.basic.flags, limits.basic.activeLimit, limits.jobMemory = windows.FLAGS, windows.ACTIVE_LIMIT, 2048*MIB
            require(bool(self.k.SetInformationJobObject(job, 9, ctypes.byref(limits), ctypes.sizeof(limits))), 'job-limit')
    return ModelAPI


def owned_boundary_type(windows, model=False):
    windows.require(type(model) is bool,'run-purpose')
    if not model:
        return windows.OwnedFixtureProcess
    class ModelBoundary(windows.OwnedFixtureProcess):
        def _verify_limits(self):
            row = self.api.read_limits(self.handles['job'])
            windows.require(type(row) is dict and set(row)=={'bytes','expectedBytes','flags','active','memory'}
                and all(type(value) is int for value in row.values())
                and row['bytes']==row['expectedBytes'] and row['flags']==windows.FLAGS
                and row['active']==windows.ACTIVE_LIMIT and row['memory']==2048*MIB,'limit-readback')
            self.limits={'flags':windows.FLAGS,'activeProcessLimit':windows.ACTIVE_LIMIT,'jobMemoryBytes':2048*MIB}
    return ModelBoundary


def catalog_type(inventory):
    I, require = inventory, inventory.require

    class Catalog(I.FileCatalog):
        def _inventory(self):
            for key in NORMAL_SCOPE_ABSENCES:
                require(not os.path.lexists(REPO/key), 'resolution-shadow')
            return super()._inventory() | NORMAL_KEYS

        def _map(self):
            path = I.checked_path(REPO, MAP_KEY)
            size = path.lstat().st_size
            require(0 < size <= I.CATALOG_LIMIT, 'catalog-input')
            require(I.hash_regular_file(REPO, MAP_KEY, size) == self.external_sha, 'catalog-file-pin')
            with path.open('rb') as stream:
                raw = stream.read(I.CATALOG_LIMIT + 1)
            require(len(raw) == size and hashlib.sha256(raw).hexdigest() == self.external_sha, 'catalog-file-pin')
            return raw

    return Catalog


def directory_info(path, inventory):
    for component in reversed((path,) + tuple(path.parents)):
        info = component.lstat()
        inventory.require(inventory.no_reparse(info) and stat.S_ISDIR(info.st_mode), 'owned-directory')
    return path.lstat()


class OwnedRun:
    """Fresh internally named run; prior directories are never adopted/deleted.

    Output512KiB and cluster512MiB remain separately bounded. Control metadata
    (one catalog snapshot, marker and permanent child claim) is capped at1MiB.
    """
    def __init__(self, inventory, private=False, http=False, model=False,product=False,automatic18=False,browser=False):
        inventory.require(type(private) is bool and type(http) is bool and type(model) is bool and type(product) is bool and (not product or model) and (not http or private) and (not model or (private and http)), 'run-purpose')
        self.i = inventory
        self.private = private
        self.http = http
        self.model = model
        self.product = product
        inventory.require(type(automatic18) is bool and (not automatic18 or private and http and not model and not product),'run-purpose')
        self.automatic18 = automatic18
        inventory.require(type(browser) is bool and (not browser or automatic18 and not model and not product),'automatic18-browser-purpose')
        self.browser = browser
        self.compressed_owner = automatic18 and browser
        self.storage_reader = self.storage_policy = None
        self.runs_root = PRIVATE_RUNS_ROOT if private else RUNS_ROOT
        self.marker_schema = 'private-hierarchy-native-owned-run' if private else 'hierarchy-native-owned-run'
        self.claim_schema = 'private-hierarchy-native-child-claim' if private else 'hierarchy-native-child-claim'
        self.nonce = os.urandom(24).hex()
        self.root = self.runs_root / ('run-' + self.nonce)
        self.output, self.cluster = self.root/'output', self.root/'cluster'
        self.prepared = False
        self.root_id = self.parent_id = self.marker = self.catalog = None
        self.claim = self.claim_pending_id = None

    def prepare(self, raw, external_sha):
        I, require = self.i, self.i.require
        require(not self.prepared and type(raw) is bytes and len(raw)+4096 <= I.CATALOG_LIMIT
                and hashlib.sha256(raw).hexdigest() == external_sha, 'run-catalog')
        directory_info(self.runs_root.parent, I)
        try:
            self.runs_root.mkdir()
        except FileExistsError:
            pass
        info = directory_info(self.runs_root, I)
        self.parent_id = (info.st_dev, info.st_ino)
        self.root.mkdir()  # Exclusive; even an empty existing run is refused.
        info = directory_info(self.root, I)
        self.root_id = (info.st_dev, info.st_ino)
        self.marker = I.canonical_json({'schema':self.marker_schema,
            'nonce':self.nonce, 'runDirectory':str(self.root), 'catalogSha256':external_sha})
        self.catalog = raw
        for name, data in [('run.pending', self.marker), ('reviewed-sources.json', raw)]:
            with (self.root/name).open('xb') as stream:
                require(stream.write(data) == len(data), 'run-publication')
                stream.flush()
                os.fsync(stream.fileno())
        os.link(self.root/'run.pending', self.root/'run.json')
        self.prepared = True
        self.check()

    def _read(self, name, cap, empty=False):
        I, require = self.i, self.i.require
        path = self.root/name
        before = path.lstat()
        require(I.no_reparse(before) and stat.S_ISREG(before.st_mode)
                and (0 if empty else 1) <= before.st_size <= cap, 'run-control-file')
        with path.open('rb') as stream:
            raw = stream.read(cap+1)
        require(len(raw) == before.st_size and len(raw) <= cap, 'run-control-file')
        require(I.hash_regular_file(self.root,name,before.st_size) == hashlib.sha256(raw).hexdigest(), 'run-control-file')
        return raw, before

    def check(self, child_pid=None):
        I, require = self.i, self.i.require
        require(self.prepared, 'run-not-prepared')
        parent, root = directory_info(self.runs_root,I), directory_info(self.root,I)
        require((parent.st_dev,parent.st_ino) == self.parent_id
                and (root.st_dev,root.st_ino) == self.root_id, 'run-replaced')
        allowed = {'run.pending','run.json','reviewed-sources.json','child.pending','child.claim','output','cluster'}
        with os.scandir(self.root) as entries:
            names = set()
            for entry in entries:
                require(entry.name in allowed and entry.name not in names, 'run-unexpected-entry')
                names.add(entry.name)
        require({'run.pending','run.json','reviewed-sources.json'} <= names, 'run-control-missing')
        marker, mi = self._read('run.json',1024)
        pending, pi = self._read('run.pending',1024)
        catalog, _ = self._read('reviewed-sources.json',I.CATALOG_LIMIT)
        require(marker == pending == self.marker and catalog == self.catalog
                and (mi.st_dev,mi.st_ino) == (pi.st_dev,pi.st_ino), 'run-control-changed')
        total = len(marker)+len(pending)+len(catalog)
        # Directory enumeration is not an atomic snapshot of a child's legal
        # publication. Read its fixed permanent paths directly before treating
        # a missing enumerated name as a disappeared claim.
        if os.path.lexists(self.root/'child.pending'):
            # An in-progress exclusive write may be empty/partial. Do not parse
            # it until the child publishes its closed hardlink.
            info = (self.root/'child.pending').lstat()
            require(I.no_reparse(info) and stat.S_ISREG(info.st_mode) and 0 <= info.st_size <= 1024, 'run-child-pending')
            identity = (info.st_dev,info.st_ino)
            if self.claim_pending_id is None:
                self.claim_pending_id = identity
            require(self.claim_pending_id == identity, 'run-child-replaced')
            total += info.st_size
        else:
            require(self.claim_pending_id is None, 'run-child-disappeared')
        if os.path.lexists(self.root/'child.claim'):
            require(os.path.lexists(self.root/'child.pending') and type(child_pid) is int and child_pid>0, 'run-child-identity')
            claim, ci = self._read('child.claim',1024)
            claimed_pending, cpi = self._read('child.pending',1024)
            expected = I.canonical_json({'schema':self.claim_schema,
                'nonce':self.nonce,'catalogSha256':hashlib.sha256(self.catalog).hexdigest(),
                'markerSha256':hashlib.sha256(self.marker).hexdigest(),'pid':child_pid})
            require(claim == claimed_pending == expected and (ci.st_dev,ci.st_ino) == (cpi.st_dev,cpi.st_ino), 'run-child-identity')
            if self.claim is None:
                self.claim = claim
            require(self.claim == claim, 'run-child-changed')
            total += len(claim)
        else:
            require(self.claim is None, 'run-child-disappeared')
        require(total <= I.CATALOG_LIMIT, 'run-control-capacity')


def publisher_type(supervisor, inventory, run):
    class Publisher(supervisor.ExclusivePublisher):
        def __init__(self):
            super().__init__()
            self.root = run.output

        def prepare(self):
            directory_info(self.root.parent, inventory)
            return super().prepare()

        def check(self):
            directory_info(self.root.parent, inventory)
            return super().check()

    return Publisher


def cluster_tree_type(supervisor, inventory, run):
    I, require = inventory, inventory.require
    hash_regular_file = inventory.hash_regular_file
    cluster_byte_limit = (6144 if getattr(run, 'private', False) else 512)*MIB
    compressed = getattr(run, 'compressed_owner', False)
    reader = getattr(run, 'storage_reader', None)
    require(not compressed or reader is not None, 'compressed-reader-required')
    cluster_marker = 'private-native-hierarchy-postgres/maintained' if getattr(run, 'private', False) else 'native-hierarchy-postgres/maintained'

    class ClusterTree(supervisor.ClusterTree):
        def __init__(self):
            super().__init__()
            self.parent = run.cluster
            self.storage_observed = {'files':0,'logicalBytes':0,'allocatedBytes':0}

        def check(self):
            require(self.prepared,'cluster-baseline')
            if not os.path.lexists(self.parent):
                require(self.parent_id is None and self.directory is None,'cluster-disappeared');return
            info=self.directory_info(self.parent);current=(info.st_dev,info.st_ino)
            if self.parent_id is None:self.parent_id=current
            require(current==self.parent_id,'cluster-replaced')
            with os.scandir(self.parent) as entries:
                names=[]
                for entry in entries:
                    names.append(entry.name);require(len(names)<=1,'cluster-count')
            if not names:
                require(self.directory is None,'cluster-disappeared');return
            import re
            require(re.fullmatch('nhpg-[A-Za-z0-9]{1,64}',names[0]) is not None,'cluster-name')
            directory=self.parent/names[0];info=self.directory_info(directory)
            if self.directory is None:self.directory,self.directory_id=directory,(info.st_dev,info.st_ino)
            require(directory==self.directory and (info.st_dev,info.st_ino)==self.directory_id,'cluster-replaced')
            pending=[(directory,0)];count=total=0
            while pending:
                root,depth=pending.pop()
                require(depth<=16,'cluster-depth')
                try:
                    self.directory_info(root)
                    with os.scandir(root) as entries:
                        for entry in entries:
                            count+=1;require(count<=8192,'cluster-entry-cap')
                            try:info=entry.stat(follow_symlinks=False)
                            except FileNotFoundError:continue
                            require(I.no_reparse(info),'cluster-reparse')
                            if stat.S_ISDIR(info.st_mode):pending.append((Path(entry.path),depth+1))
                            else:
                                require(stat.S_ISREG(info.st_mode) and info.st_size>=0,'cluster-kind')
                                total+=info.st_size;require(total<=cluster_byte_limit,'cluster-byte-cap')
                except FileNotFoundError:
                    require(root!=directory,'cluster-disappeared')
            require(self.directory_info(directory).st_ino==self.directory_id[1],'cluster-replaced')
            marker=directory/'ownership.json'
            if os.path.lexists(marker):
                info=marker.lstat();require(I.no_reparse(info) and stat.S_ISREG(info.st_mode) and 0<info.st_size<=4096,'cluster-marker')
                with marker.open('rb') as stream:raw=stream.read(4097)
                require(len(raw)==info.st_size and len(raw)<=4096,'cluster-marker')
                final_hash=hash_regular_file(self.parent,names[0]+'/ownership.json',info.st_size)
                require(hashlib.sha256(raw).hexdigest()==final_hash,'cluster-marker')
                value=json.loads(raw,object_pairs_hook=I._unique_pairs)
                require(type(value) is dict and set(value)=={'schema','nonce','runDirectory'} and value['schema']==cluster_marker and
                    type(value['nonce']) is str and re.fullmatch('[a-f0-9]{48}',value['nonce']) is not None and
                    type(value['runDirectory']) is str and value['runDirectory'].replace('\\','/').casefold()==str(directory).replace('\\','/').casefold(),'cluster-marker')
                pending_info=(directory/'ownership.pending').lstat()
                require((info.st_dev,info.st_ino,info.st_size)==(pending_info.st_dev,pending_info.st_ino,pending_info.st_size) and
                    hash_regular_file(self.parent,names[0]+'/ownership.pending',info.st_size)==final_hash,'cluster-marker')
                if self.marker is None:self.marker=final_hash
                require(self.marker==final_hash,'cluster-marker-drift')
            else:require(self.marker is None,'cluster-marker-disappeared')
    if not compressed:
        return ClusterTree
    class CompressedClusterTree(ClusterTree):
        def check(self):
            super().check()  # The complete original logical/identity guard.
            if self.directory is None:
                return
            self.storage_observed=measure_cluster_allocations(I,self.directory,reader)
            info=self.directory_info(self.directory)
            require((info.st_dev,info.st_ino)==self.directory_id,'cluster-replaced')
    return CompressedClusterTree


def measure_cluster_allocations(inventory,directory,reader):
    I,require=inventory,inventory.require
    pending=[(directory,0)];entries=files=logical=allocated=0
    while pending:
        root,depth=pending.pop()
        require(depth<=16,'compressed-cluster-depth')
        try:
            directory_info(root,I)
            with os.scandir(root) as children:
                for entry in children:
                    entries+=1;require(entries<=8192,'compressed-cluster-entry-cap')
                    try:info=entry.stat(follow_symlinks=False)
                    except FileNotFoundError:continue
                    require(I.no_reparse(info),'compressed-cluster-reparse')
                    if stat.S_ISDIR(info.st_mode):pending.append((Path(entry.path),depth+1))
                    else:
                        require(stat.S_ISREG(info.st_mode),'compressed-cluster-kind')
                        try:observed=reader.observe_file(str(Path(entry.path)))
                        except FileNotFoundError:continue
                        files+=1;logical+=max(info.st_size,observed['logicalBytes'])
                        allocated+=((observed['allocatedBytes']+4095)//4096)*4096
                        require(logical<=6144*MIB,'compressed-logical-cap','logicalBytes',logical)
                        require(allocated<=4096*MIB,'compressed-allocated-cap','allocatedBytes',allocated)
        except FileNotFoundError:require(root!=directory,'compressed-cluster-disappeared')
    reader.settled()
    return {'files':files,'logicalBytes':logical,'allocatedBytes':allocated}


def measure_noncluster_allocations(inventory,run,reader):
    I,require=inventory,inventory.require
    pending=[(run.root,0)];total=count=0
    original=directory_info(run.root,I)
    while pending:
        directory,depth=pending.pop()
        require(depth<=10,'compressed-noncluster-depth')
        try:
            directory_info(directory,I)
            with os.scandir(directory) as entries:
                for entry in entries:
                    if directory==run.root and entry.name=='cluster':continue
                    count+=1;require(count<=8192,'compressed-noncluster-entry-cap')
                    try:info=entry.stat(follow_symlinks=False)
                    except FileNotFoundError:continue
                    require(I.no_reparse(info),'compressed-noncluster-reparse')
                    if stat.S_ISDIR(info.st_mode):pending.append((Path(entry.path),depth+1))
                    else:
                        require(stat.S_ISREG(info.st_mode),'compressed-noncluster-kind')
                        try:observed=reader.observe_file(str(Path(entry.path)))
                        except FileNotFoundError:continue
                        total+=((observed['allocatedBytes']+4095)//4096)*4096
                        require(total<=128*MIB,'compressed-noncluster-cap','allocatedBytes',total)
        except FileNotFoundError:
            require(directory not in (run.root,run.output),'compressed-run-disappeared')
    final=directory_info(run.root,I)
    require((original.st_dev,original.st_ino)==(final.st_dev,final.st_ino),'compressed-run-replaced')
    reader.settled()
    return total


def execute(external_sha, private=False, http=False, model=False,product=False,automatic18=False,browser=False):
    S = load_pinned('supervisor')
    I = S.I  # Keep the controller's exact refusal type and authenticated helper.
    I.require(type(private) is bool and type(http) is bool and type(model) is bool and type(product) is bool and (not product or model) and (not http or private) and (not model or (private and http)),'run-purpose')
    I.require(sys.flags.isolated and sys.flags.no_site and sys.flags.dont_write_bytecode, 'python-flags')
    I.require(sys.platform == 'win32' and Path(sys.executable).resolve() == I.RUNTIME_PINS['@python'][0].resolve(), 'python-path')
    I.require(str(REPO).replace(chr(92), '/').casefold() == 'd:/gitprojekts/universal-discussion-bootstrap', 'fixed-repo')
    catalog = catalog_type(I)(external_sha)
    run = OwnedRun(I,private,http,model,product,automatic18,browser)
    compressed = automatic18 and browser
    storage_peak = {'samples':0,'logicalBytes':0,'allocatedBytes':0,'nonclusterAllocatedBytes':0}
    if compressed:
        run.storage_policy = load_pinned('storage-policy')
        run.storage_reader = load_pinned('storage-native').WindowsStorage()
    publisher = publisher_type(S, I, run)()
    tree = cluster_tree_type(S, I, run)()
    modules, host_native = {'windows':load_pinned('windows')}, []
    inputs = PrivateInputs(I,model=model,product=product,automatic18=automatic18,browser=browser) if private else None
    phases = PrivatePhases(I,run,http,automatic18=automatic18) if private else None
    application = PrivateHttpProof(I,run,model=model,product=product,automatic18=automatic18,browser=browser) if http else None

    def authenticate():
        catalog.authenticate()
        if inputs is not None:
            inputs.prepare()
        if compressed:
            modules['baseline'] = load_pinned('baseline')
            I.require(modules['baseline'].abi()['valid'], 'abi')
            checked_storage_resources(host(), admission=True)
        run.prepare(catalog.raw, external_sha)
        publisher.prepare()
        tree.prepare()
        if not compressed:
            modules['baseline'] = load_pinned('baseline')
            I.require(modules['baseline'].abi()['valid'], 'abi')
        if private:
            sample = host()
            if compressed:
                checked_storage_resources(sample, admission=True)
            else:
                I.require(sample['dFree'] >= 11264*MIB,'private-disk-admission','dFree',sample['dFree'])

    def host():
        if not host_native:
            host_native.append(modules['baseline'].WindowsNative())
        return host_native[0].resources(None)

    def checked_storage_resources(sample, admission=False):
        snapshot={key:sample[key] for key in ('physicalFree','commitFree','cFree','dFree')}
        snapshot.update(run.storage_reader.volume())
        try:run.storage_policy.resources(snapshot,admission=admission)
        except run.storage_policy.StorageRefusal as error:raise I.Refusal(error.code) from None

    def storage_budget():
        checked_storage_resources(host())
        total=measure_noncluster_allocations(I,run,run.storage_reader)
        try:run.storage_policy.run_budget(tree.storage_observed,total)
        except run.storage_policy.StorageRefusal as error:raise I.Refusal(error.code) from None
        run.storage_reader.settled()
        storage_peak['samples']+=1
        for key in ('logicalBytes','allocatedBytes'):storage_peak[key]=max(storage_peak[key],tree.storage_observed[key])
        storage_peak['nonclusterAllocatedBytes']=max(storage_peak['nonclusterAllocatedBytes'],total)

    def workspace():
        run.check(controller.boundary.pid if controller.boundary is not None else None)
        publisher.check()
        tree.check()
        if compressed:storage_budget()
        if inputs is not None and not inputs.closed:
            inputs.check()
        if phases is not None:
            phases.check()
        if application is not None:
            application.check()

    def boundary():
        W, B = modules['windows'], modules['baseline']
        return owned_boundary_type(W,model)(B, api=native_api_type(W, run)(B))

    def end_pins():
        catalog.end_pins()
        if phases is not None:
            phases.check()
        if application is not None:
            application.check()
        if inputs is not None:
            if not inputs.closed:
                inputs.finish(controller.normal_deadline if controller.normal_deadline is not None else STARTED+380)
            I.require(inputs.verified and inputs.closed,'private-input-retirement')

    def validate(stdout,stderr,exit_code):
        value = automatic18_owner_completion(stdout,stderr,exit_code) if automatic18 else private_completion(stdout,stderr,exit_code,http) if private else semantic_completion(stdout,stderr,exit_code)
        if private and value['accepted']:
            phases.complete()
            if http:
                application.complete()
        return value

    controller = diagnostic_controller_type(S, modules['windows'],private=private)(authenticate=authenticate, end_pins=end_pins,
        host_sample=host, boundary_factory=boundary, validate=validate,
        clock=time.monotonic, pause=time.sleep, workspace_check=workspace, started_at=STARTED,
        job_memory_bytes=(2048 if model else 1024)*MIB)
    try:
        result = controller.run()
    finally:
        if inputs is not None and not inputs.closed:
            try:
                inputs.close()
            except BaseException:
                # Never mask the controller's original failure or bypass the
                # failed-attempt publisher because a final close also failed.
                inputs.close_failed = True
    if inputs is not None and (inputs.close_failed or not inputs.closed):
        controller.remember(I.Refusal('private-input-close'),cleanup=True)
        result.update(accepted=False,cleanup=controller.cleanup)
    if compressed:
        result['compressedStorage']={'schema':'compressed-owner-storage-samples/v1','sampledNotQuota':True,'scope':'through-controller-retirement-before-final-parent-publication',**storage_peak}
    if publisher.prepared:
        def final_checkpoint():
            controller.now(controller.normal_deadline-controller.started if result['accepted'] else 390)
            workspace()
            if result['accepted']:
                controller.host()
        publisher.publish(result, bytes(controller.buffers['stdout']), bytes(controller.buffers['stderr']), final_checkpoint)
    return result


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    private = type(args) is list and len(args) == 2 and args[0] in ('private-restore','private-http','private-model','private-product','private-automatic18','private-automatic18-browser')
    automatic18 = private and args[0] in ('private-automatic18','private-automatic18-browser')
    browser = private and args[0] == 'private-automatic18-browser'
    product = private and args[0] == 'private-product'
    model = private and args[0] in ('private-model','private-product')
    http = private and args[0] in ('private-http','private-model','private-product','private-automatic18','private-automatic18-browser')
    if private:
        args = args[1:]
    if (type(args) is not list or len(args) != 1 or type(args[0]) is not str
            or len(args[0]) != 64 or any(c not in '0123456789abcdef' for c in args[0])):
        sys.stderr.write('Expected reviewed catalog SHA256, or private-restore/private-http/private-model/private-product/private-automatic18/private-automatic18-browser followed by that SHA256.\n')
        return 2
    try:
        result = execute(args[0],private,http,automatic18=True,browser=True) if browser else execute(args[0],private,http,automatic18=True) if automatic18 else execute(args[0],private,http,True,True) if product else execute(args[0],private,http,True) if model else execute(args[0],private,http)
        sys.stdout.write(json.dumps({'schema':'native-hierarchy-postgres-invocation/v2',
            'accepted':result['accepted']}, sort_keys=True, separators=(',', ':'))+'\n')
        return 0 if result['accepted'] else 1
    except BaseException:
        sys.stderr.write('Maintained hierarchy check did not complete.\n')
        return 1


def compressed_main(argv=None):
    args=sys.argv[1:] if argv is None else argv
    if (type(args) is not list or len(args)!=2 or args[0]!='compressed-automatic18-browser'
            or type(args[1]) is not str or re.fullmatch('[a-f0-9]{64}',args[1]) is None):
        return 2
    if not COMPRESSED_SOURCE_REVIEW_COMPLETE:
        return 2
    try:
        result=execute(args[1],True,True,automatic18=True,browser=True)
        sys.stdout.write(json.dumps({'schema':'compressed-owner-recovery-invocation/v1','accepted':result['accepted']},separators=(',',':'))+'\n')
        return 0 if result['accepted'] else 1
    except BaseException:
        sys.stderr.write('Compressed recovery did not complete.\n')
        return 1


if __name__ == '__main__':
    raise SystemExit(compressed_main())
