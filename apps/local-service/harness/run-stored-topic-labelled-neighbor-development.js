// Name-gated oracle DEV: isolates whether stored E5 geometry can transfer a
// known topic path to another page. Gold semantics are training inputs here.
// This does NOT test automatic discovery, semantic teaching or a new cohort.
// In-memory calculation only; no output files, SQL, model, network or live write.
import path from 'node:path'; import {fileURLToPath} from 'node:url'; import {freemem} from 'node:os';
import {benchmarkNeed as need,benchmarkSha as sha,benchmarkSourcePins as pins,checkBenchmarkPins as endPins,
  readBenchmarkJson as json} from './hierarchy-benchmark-files.js';
import {decodeEmbeddingBase64Array} from '../portable/canonical-v4/embedding-binary-wire.js';
import {chooseLabelledTopicAncestor as chooseTopicAncestor} from '../experiments/automatic-topic-discovery-v4/topic-labelled-neighbors.js';
const BASE = 'apps/local-service/data/canonical-migration-backups/automatic18-new-domain-validation-20261030';
const FILES = ['apps/local-service/harness/run-stored-topic-labelled-neighbor-development.js',
  'apps/local-service/experiments/automatic-topic-discovery-v4/topic-ancestor-neighbors.js',
  'apps/local-service/experiments/automatic-topic-discovery-v4/topic-labelled-neighbors.js',
  'apps/local-service/experiments/automatic-topic-discovery-v4/topic-labelled-neighbors.test.js',
  'apps/local-service/harness/hierarchy-benchmark-files.js',
  'apps/local-service/portable/canonical-v4/embedding-binary-wire.js'];
// Root-supplied topical ancestry, not inferred from embedding distance or
// literal containment. This is an intentionally privileged oracle experiment.
const PARENTS = Object.freeze({
  'monty-python-hollywood':'monty-python',
  rhel:'linux-software','rocky-linux':'linux-software','linux-dotcom':'linux-software',
  'v8-engine':'javascript-language','rhino-js':'javascript-language','javascript-framework':'javascript-language',
  'find-my-iphone':'iphone-phone','iphone-se':'iphone-phone','iphone-se3':'iphone-se',
  'android-oreo':'android-os','android-marshmallow':'android-os',
  'tesla-berlin-factory':'tesla-car-company','solar-radiation-modification':'solar-radiation',
  'instant-coffee':'coffee-drink','ganges-dolphin':'dolphin-animal','heavisides-dolphin':'dolphin-animal','peales-dolphin':'dolphin-animal',
  'aaa-battery':'electrical-battery','college-football':'american-football',
  'ni-football-league':'association-football','powerchair-football':'association-football',
  'pulitzer-photo':'photography','analog-photo':'photography','exposure-photo':'photography',
});
const dot = (a,b) => { let sum = 0; for (let i = 0; i < a.length; i++) sum += a[i]*b[i]; return Math.max(-1,Math.min(1,sum)); };
function oraclePaths(annotations) {
  const roots = new Map();
  for (const row of annotations) for (const subject of row.subjects) {
    if (!roots.has(subject.key)) roots.set(subject.key,new Set());
    if (row.expectedRootId !== null) roots.get(subject.key).add(row.expectedRootId);
  }
  const paths = new Map();
  function visit(key,seen = []) {
    need(roots.has(key) && !seen.includes(key) && seen.length < 7);
    if (paths.has(key)) return paths.get(key);
    let prefix;
    if (PARENTS[key] && roots.has(PARENTS[key])) prefix = visit(PARENTS[key],[...seen,key]);
    else prefix = roots.get(key).size === 1 ? ['domain:'+[...roots.get(key)][0]] : [];
    const result = [...prefix,'topic:'+key]; paths.set(key,result); return result;
  }
  for (const key of roots.keys()) visit(key);
  return annotations.map(row => row.subjects.map(subject => paths.get(subject.key))
    .sort((a,b) => b.length-a.length || a.at(-1).localeCompare(b.at(-1)))[0] ?? null);
}
function evaluate(rows,gold,paths,body,title,view,minimumSimilarity,ambiguityMargin) {
  const picks = [], elapsed = []; let removedDuplicateNeighbors = 0, maxCandidates = 0;
  const labels = new Map();
  for (const target of gold) for (const subject of target.subjects) {
    const nodeId = 'topic:'+subject.key; if (!labels.has(nodeId)) labels.set(nodeId,new Set());
    for (const label of subject.labels) labels.get(nodeId).add(label);
  }
  const aliases = [...labels].map(([nodeId,values])=>({nodeId,labels:[...values]}));
  for (let i = 0; i < rows.length; i++) {
    const neighbors = [];
    for (let j = 0; j < rows.length; j++) {
      if (i === j || !paths[j]) continue;
      // Hold out self AND near-identical body representations, independent of
      // the label. Different translations may still be correlated sources.
      if (body[i][j] >= .995) { removedDuplicateNeighbors++; continue; }
      neighbors.push({sourceId:rows[j].sourceId,path:paths[j],similarity:view === 'body' ? body[i][j] : .5*(body[i][j]+title[i][j])});
    }
    maxCandidates = Math.max(maxCandidates,neighbors.length);
    const raw = JSON.stringify({neighbors,minimumSimilarity,ambiguityMargin,ownerGrouping:{defaultMaxDepth:8,overrides:[]},
      queryTitle:rows[i].title,acceptedRootId:rows[i].acceptedPath[0] ? 'domain:'+rows[i].acceptedPath[0] : null,aliases}), at = performance.now();
    const decision = chooseTopicAncestor(raw); elapsed.push(performance.now()-at);
    picks.push({sourceId:rows[i].sourceId,path:decision.selectedPath,reason:decision.reason});
  }
  let correctSubjects = 0, wrongSubjects = 0, rootOnly = 0, unresolved = 0, unreviewedAssigned = 0, correctRoots = 0, wrongRoots = 0;
  const annotated = picks.map((pick,i) => {
    const target = gold[i], node = pick.path.at(-1), assigned = node?.startsWith('topic:') ? node.slice(6) : null;
    const root = pick.path[0]?.startsWith('domain:') ? pick.path[0].slice(7) : null;
    if (target.expectedRootId !== null && root !== null) { if (root === target.expectedRootId) correctRoots++; else wrongRoots++; }
    if (!target.subjects.length) { if (assigned) unreviewedAssigned++; }
    else if (!pick.path.length) unresolved++;
    else if (!assigned) rootOnly++;
    else if (target.subjects.some(subject => subject.key === assigned)) correctSubjects++;
    else wrongSubjects++;
    return {...pick,assigned,reviewed:target.subjects.length>0};
  });
  let correctPairs = 0, falsePairs = 0, missedPairs = 0;
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < i; j++) {
    if (!annotated[i].reviewed || !annotated[j].reviewed) continue;
    const same = gold[i].subjects.some(a => gold[j].subjects.some(b => a.key === b.key));
    const merged = annotated[i].assigned !== null && annotated[i].assigned === annotated[j].assigned;
    if (merged && same) correctPairs++; else if (merged) falsePairs++; else if (same) missedPairs++;
  }
  elapsed.sort((a,b)=>a-b);
  return {view,minimumSimilarity,ambiguityMargin,correctSubjects,wrongSubjects,rootOnly,unresolved,unreviewedAssigned,
    correctRoots,wrongRoots,correctPairs,falsePairs,missedPairs,removedDuplicateNeighbors,maxCandidates,
    selectionMs:{p50:elapsed[Math.floor(elapsed.length*.5)],p95:elapsed[Math.floor(elapsed.length*.95)],max:elapsed.at(-1)},
    selectionsSha256:sha(JSON.stringify(annotated)),
    firstWrongAssignments:annotated.filter((row,i)=>row.reviewed && row.assigned !== null &&
      !gold[i].subjects.some(subject=>subject.key === row.assigned)).slice(0,5).map(row=>({sourceId:row.sourceId,assigned:row.assigned}))};
}
let used = false;
export async function compareStoredLabelledTopicNeighbors() {
  need(arguments.length === 0 && !used && freemem() >= 1073741824); used = true;
  const sourcePins = await pins(FILES), ledger = [];
  const cohort = await json(BASE+'/cohort.json',{sha256:'9c44028aec78038ccec0c0e9a9baa8e3167f987153e69df180ad6f66be23d350'},ledger);
  const annotations = await json(BASE+'/annotations.json',{sha256:'f5418127816b5bbed01808fa327aac01286af45096e95c4cf23af116a4fbeb72'},ledger);
  need(cohort.rows.length === 45 && annotations.rows.length === 45);
  const byId = new Map(annotations.rows.map(row => [row.sourceId,row])), gold = cohort.rows.map(row => byId.get(row.sourceId));
  need(byId.size === 45 && gold.every(Boolean));
  const paths = oraclePaths(gold), bodyVectors = cohort.rows.map(row=>decodeEmbeddingBase64Array(row.bodyBase64)),
    titleVectors = cohort.rows.map(row=>decodeEmbeddingBase64Array(row.titleBase64));
  const at = performance.now(), matrixAt = at;
  const body = bodyVectors.map(a=>bodyVectors.map(b=>dot(a,b))), title = titleVectors.map(a=>titleVectors.map(b=>dot(a,b)));
  const matrixMs = performance.now()-matrixAt, variants = [];
  for (const view of ['body','paired']) for (const minimum of [.8,.85,.9]) for (const margin of [.005,.015,.03])
    variants.push(evaluate(cohort.rows,gold,paths,body,title,view,minimum,margin));
  const computationMs = performance.now()-at;
  await endPins(ledger,FILES,sourcePins); need(freemem() >= 1073741824);
  return {schema:'stored-topic-oracle-labelled-neighbor-development/v1',status:'completed',rows:45,variants,matrixMs,computationMs,
    sourcePins,inputPins:ledger,sourceEndPinsPassed:true,memory:process.memoryUsage(),
    scope:{postHocDevelopment:true,oracleGoldSemanticsSupplied:true,oracleGoldAliasesSupplied:true,coarseRootFromStoredActualSelection:true,queryEmbeddingHeldOut:true,nearDuplicateBodiesExcluded:true,
      publisherOrDomainHeldOut:false,prospectiveQuality:false,automaticTeachingTest:false,annRecallOrSQLTest:false,
      policySelected:false,newEncoder:false,filesWritten:false,providerUsed:false,liveChanged:false}};
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--compare-labelled-oracle-neighbors') process.exitCode = 2;
  else compareStoredLabelledTopicNeighbors().then(value=>process.stdout.write(JSON.stringify(value)+'\n'),()=>{
    process.stderr.write('Stored name-gated oracle-neighbor diagnostic unavailable; live services unchanged.\n'); process.exitCode = 1;
  });
}
