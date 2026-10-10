// Fixed owner-local read-only diagnostic; no listener, provider or write command.
import '../../../../../spikes/topic-resolution/harness/deny-external-capabilities.js';
import { DatabaseSync } from 'node:sqlite';
import { lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertValidPersistedState } from '../../../src/domain/persisted-state.js';
import { MAX_DOCUMENT_BYTES } from '../../../src/domain/repository-contract.js';
import { createOwnerTopicPlanner } from '../../../src/domain/owner-topic-planner.js';
import { readInstalledOwnerTopicConfiguration } from '../../../src/application/owner-topic-configuration.js';
import { createDiscussionService } from '../../../src/application/discussion-service.js';

const DB = fileURLToPath(new URL('../../../data/demo.sqlite', import.meta.url));
const TARGETS = [
  'https://www.standaard.be/ds-fr/meme-melissa-depraetere-et-la-reine-mathilde-apparaissent-nues-sur-internet-nous-sommes-confrontes-a-une-epidemie-de-deepnudes/162864212.html',
  'https://www.standaard.be/binnenland/zelfs-melissa-depraetere-en-koningin-mathilde-staan-naakt-op-het-internet-we-hebben-te-maken-met-een-deepnude-epidemie/162449955.html',
];

function run() {
  if (process.argv.length !== 2) throw new Error('No arguments');
  const info = lstatSync(DB);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Invalid database');
  const database = new DatabaseSync(DB, { readOnly: true });
  try {
    database.exec('PRAGMA query_only = ON');
    const row = database.prepare('SELECT schema, generation, revision, document FROM demo_state WHERE singleton = 1').get();
    if (!row || row.schema !== 'demo-state/v2' || typeof row.document !== 'string' ||
        Buffer.byteLength(row.document) > MAX_DOCUMENT_BYTES) throw new Error('Invalid snapshot');
    const state = JSON.parse(row.document);
    if (state.schema !== row.schema || state.generation !== row.generation || state.revision !== row.revision) throw new Error('Invalid revision');
    assertValidPersistedState(state);
    const configuration = readInstalledOwnerTopicConfiguration({ useBodyMetric: true });
    if (!configuration.alternateBodyMetric) throw new Error('BODY unavailable');
    const planner = createOwnerTopicPlanner({ bodyMetric: configuration.alternateBodyMetric });
    const plan = planner.plan(state);
    const service = createDiscussionService({ repository: { load: () => state }, ranking: {},
      sources: [], topicSeeds: [], nextId: () => { throw new Error('Read only'); },
      now: () => { throw new Error('Read only'); }, ...configuration });
    const ids = TARGETS.map(url => state.sources.find(source => source.url === url)?.id);
    const views = ids.every(Boolean) ? ids.map(id => service.alternateDiscussion(id)) : [];
    const groups = plan.partitions.filter(part => part.sourceIds.length > 1);
    const unchanged = database.prepare('SELECT document FROM demo_state WHERE singleton = 1').get().document === row.document;
    process.stdout.write(`${JSON.stringify({ policyVersion: planner.policyVersion, representation: planner.representation,
      sources: state.sources.length, eligible: plan.diagnostics.sources, multiPageGroups: groups.length,
      multiPageReach: groups.reduce((sum, part) => sum + part.sourceIds.length, 0),
      groupSizes: groups.map(part => part.sourceIds.length).sort((a, b) => b - a),
      targetPairPresent: ids.every(Boolean),
      targetPairSameGroup: ids.every(Boolean) && plan.partitions.some(part => ids.every(id => part.sourceIds.includes(id))),
      targetPairSameDisplayedRoots: views.length === 2 &&
        JSON.stringify(views[0].roots.map(root => root.id).sort()) === JSON.stringify(views[1].roots.map(root => root.id).sort()),
      canonicalUnchanged: unchanged, diagnostics: plan.diagnostics })}\n`);
  } finally { database.close(); }
}
try { run(); }
catch { process.stderr.write('{"error":"OWNER_BODY_SHADOW_FAILED"}\n'); process.exitCode = 1; }
