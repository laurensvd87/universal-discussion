// Owner-local, read-only shadow check. Deliberately no CLI path overrides,
// listener, network adapter, write command, or article-text output.
import { DatabaseSync } from 'node:sqlite';
import { lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertValidPersistedState } from '../../../src/domain/persisted-state.js';
import { MAX_DOCUMENT_BYTES } from '../../../src/domain/repository-contract.js';
import { loadDiagonalAdapter } from '../../../src/domain/diagonal-adapter.js';
import { planAlternateTopics } from '../../../src/domain/alternate-topic-planner.js';
import { projectExperimentalTopics } from '../../../src/domain/experimental-topic-projection.js';
import { createDiscussionService } from '../../../src/application/discussion-service.js';

const DB = fileURLToPath(new URL('../../../data/demo.sqlite', import.meta.url));
const ADAPTER = fileURLToPath(new URL('../../../data/diagonal-adapter-v1.json', import.meta.url));
const TARGETS = [
  'https://www.standaard.be/ds-fr/meme-melissa-depraetere-et-la-reine-mathilde-apparaissent-nues-sur-internet-nous-sommes-confrontes-a-une-epidemie-de-deepnudes/162864212.html',
  'https://www.standaard.be/binnenland/zelfs-melissa-depraetere-en-koningin-mathilde-staan-naakt-op-het-internet-we-hebben-te-maken-met-een-deepnude-epidemie/162449955.html',
];

async function readSnapshot() {
  const info = await lstat(DB);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error('Expected a regular local database');
  const database = new DatabaseSync(DB, { readOnly: true });
  try {
    database.exec('PRAGMA query_only = ON');
    const objects = database.prepare("SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all();
    if (objects.length !== 1 || objects[0].name !== 'demo_state' || objects[0].type !== 'table') {
      throw new Error('Unexpected local database schema');
    }
    const rows = database.prepare('SELECT schema, generation, revision, document FROM demo_state WHERE singleton = 1').all();
    if (rows.length !== 1 || rows[0].schema !== 'demo-state/v2' ||
        typeof rows[0].document !== 'string' ||
        Buffer.byteLength(rows[0].document, 'utf8') > MAX_DOCUMENT_BYTES) {
      throw new Error('Invalid local snapshot');
    }
    const state = JSON.parse(rows[0].document);
    if (state.schema !== rows[0].schema || state.generation !== rows[0].generation ||
        state.revision !== rows[0].revision) throw new Error('Inconsistent local snapshot');
    assertValidPersistedState(state);
    return state;
  } finally { database.close(); }
}

async function main() {
  if (process.argv.length !== 2) throw new Error('No command-line options accepted');
  const [state, adapter] = await Promise.all([readSnapshot(), loadDiagonalAdapter(ADAPTER)]);
  const plan = planAlternateTopics({ sources: state.sources, sourceLinks: state.sourceLinks, adapter });
  const projection = projectExperimentalTopics(state, plan.partitions,
    { generation: state.generation, revision: state.revision });
  const targetIds = TARGETS.map(url => state.sources.find(source => source.url === url)?.id ?? null);
  const sameCandidateGroup = targetIds.every(Boolean) && plan.partitions.some(part =>
    targetIds.every(id => part.sourceIds.includes(id)));
  const service = createDiscussionService({ repository: { load: () => state },
    ranking: { model: { id: 'unused-read-only' } }, sources: [], topicSeeds: [],
    nextId: () => { throw new Error('Read-only diagnostic'); },
    now: () => { throw new Error('Read-only diagnostic'); }, alternateAdapter: adapter });
  const targetViews = targetIds.every(Boolean) ? targetIds.map(id => service.alternateDiscussion(id)) : [];
  const matchingDisplayedRoots = targetViews.length === 2 &&
    targetViews[0].roots.map(root => root.id).sort().join('\0') ===
      targetViews[1].roots.map(root => root.id).sort().join('\0');
  const sizes = plan.partitions.map(part => part.sourceIds.length);
  process.stdout.write(`${JSON.stringify({
    representation: plan.diagnostics.representation,
    sources: state.sources.length,
    eligibleProvisionalSources: plan.diagnostics.sources,
    comparedPairs: plan.diagnostics.comparedPairs,
    candidateGroups: sizes.length,
    multiPageGroups: sizes.filter(size => size > 1).length,
    pagesInMultiPageGroups: sizes.filter(size => size > 1).reduce((sum, size) => sum + size, 0),
    changedSourceCount: projection.changedSourceIds.length,
    potentiallyAffectedRootCount: projection.potentiallyAffectedRootIds.length,
    pinnedRootCount: projection.pinnedRootIds.length,
    targetPairPresent: targetIds.every(Boolean),
    targetPairSameCandidateGroup: sameCandidateGroup,
    targetPairSameDisplayedRoots: matchingDisplayedRoots,
  })}\n`);
}

main().catch(error => {
  // Library errors can contain input or file paths; expose only a stable class.
  process.stderr.write(`Shadow check failed: ${error?.code === 'capacity' ? 'capacity' : 'invalid-or-unavailable'}\n`);
  process.exitCode = 1;
});
