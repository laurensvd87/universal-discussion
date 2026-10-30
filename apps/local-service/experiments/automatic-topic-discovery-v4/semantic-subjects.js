// Bounded semantic hierarchy proposal; no provider, storage or publication.
// Syntax and graph validity never establish semantic truth or Source authority.
import {createHash} from 'node:crypto';
const ROOTS = Object.freeze(['Nature','Technology','Games','Culture','Food','Other']);
const need = value => { if (!value) throw new TypeError('Invalid semantic subject proposal'); };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical = value => value.normalize('NFKC').toLowerCase();
const label = value => typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 64 &&
  value.isWellFormed() && !/[\u0000-\u001f\u007f"{}\[\]:\\]/u.test(value);
function readCards(cards) {
  need(Array.isArray(cards) && cards.length > 0 && cards.length <= 16);
  const seen = new Set();
  return cards.map(card => {
    need(card && typeof card === 'object' && /^P[1-9][0-9]?$/u.test(card.id) && !seen.has(card.id) &&
      typeof card.title === 'string' && card.title.length > 0 && card.title.length <= 120 && card.title.isWellFormed() &&
      typeof card.excerpt === 'string' && card.excerpt.length <= 150 && card.excerpt.isWellFormed() &&
      !/[\u0000-\u001f\u007f]/u.test(card.title + card.excerpt));
    seen.add(card.id); return {id:card.id,title:card.title,excerpt:card.excerpt};
  });
}
export function buildSubjectQuestion(cards) {
  const data = readCards(cards);
  const prefix = '[Murmingle public-page hierarchy test] @AI Nutze nur folgende öffentliche Seitentitel/kurzen Auszüge, nicht die angehängte Rezeptseite. Bilde Themenpfade breit→spezifisch. Wurzel genau Nature/Technology/Games/Culture/Food/Other. Blatt=konkreter Gegenstand, nicht Artikel, Verlag oder Tutorialformat. Derselbe Gegenstand erhält denselben Pfad; gleiche Wörter beweisen keine Identität. Höchstens4 Ebenen. Beschriftungen Englisch. Nur JSON: jede Seiten-ID→Array von Labels, [] bei Unsicherheit. ';
  const prompt = prefix + JSON.stringify(Object.fromEntries(data.map(card => [card.id,[card.title,card.excerpt]])));
  need(prompt.length <= 2000); return prompt;
}
export function parseSubjectProposal(cards, body) {
  const data = readCards(cards);
  need(typeof body === 'string' && body.length > 0 && body.length <= 4096);
  let answer; try { answer = JSON.parse(body.trim()); } catch { need(false); }
  need(answer && typeof answer === 'object' && !Array.isArray(answer) &&
    Object.keys(answer).sort().join(',') === data.map(card => card.id).sort().join(','));
  const keys = [...body.matchAll(/"(P[1-9][0-9]?)"\s*:/gu)].map(match => match[1]);
  need(keys.length === data.length && new Set(keys).size === keys.length && keys.every(key => Object.hasOwn(answer,key)));
  const nodes = new Map(), selections = [];
  for (const card of data) {
    const path = answer[card.id]; need(Array.isArray(path) && path.length <= 4 && path.every(label));
    need(path.length === 0 || ROOTS.includes(path[0]));
    need(new Set(path.map(canonical)).size === path.length);
    let parentKey = null; const nodeKeys = [];
    for (let depth = 0; depth < path.length; depth++) {
      const key = hash(path.slice(0,depth + 1).map(canonical)); nodeKeys.push(key);
      if (!nodes.has(key)) nodes.set(key,{key,label:path[depth],parentKey});
      parentKey = key;
    }
    selections.push({id:card.id,path:[...path],nodeKeys,leafKey:parentKey});
  }
  need(nodes.size <= 48);
  return {schema:'semantic-subject-proposal/v1',requestHash:hash(data),nodes:[...nodes.values()],selections,
    scope:{proposalOnly:true,semanticTruthProven:false,sourceWitnessesVerified:false,assignmentAuthority:false,publication:false,liveChanged:false}};
}
export function scoreSubjectProposal(proposal,gold) {
  need(Array.isArray(proposal?.selections) && Array.isArray(gold) && gold.length === proposal.selections.length);
  const expected = new Map(gold.map(row => [row.id,row])); need(expected.size === gold.length);
  let correctRoots = 0, correctSubjects = 0, incorrectSubjects = 0, abstentions = 0;
  const rows = proposal.selections.map(row => {
    const target = expected.get(row.id); need(target && Array.isArray(target.labels));
    if (row.path.length === 0) abstentions++;
    const rootCorrect = row.path[0] === target.root;
    const subjectCorrect = rootCorrect && target.labels.some(value => canonical(value) === canonical(row.path.at(-1) ?? ''));
    if (rootCorrect) correctRoots++; if (subjectCorrect) correctSubjects++; else if (row.path.length) incorrectSubjects++;
    return {id:row.id,subject:target.subject,leafKey:row.leafKey,rootCorrect,subjectCorrect};
  });
  let correctPairs = 0, falsePairs = 0, missedPairs = 0;
  for (let i = 0; i < rows.length; i++) for (let j = 0; j < i; j++) {
    const same = rows[i].subject === rows[j].subject, merged = rows[i].leafKey !== null && rows[i].leafKey === rows[j].leafKey;
    if (merged && same) correctPairs++; else if (merged) falsePairs++; else if (same) missedPairs++;
  }
  const byId = new Map(proposal.selections.map(row => [row.id,row.path]));
  const gta = ['P8','P9'].map(id => byId.get(id) ?? []);
  const gtaFamily = gta.every(path => path.slice(1,-1).some(value => ['grand theft auto','gta'].includes(canonical(value))));
  const koalaAnimals = ['P6','P7'].every(id => (byId.get(id) ?? []).slice(1,-1).some(value =>
    ['animals','mammals','marsupials'].includes(canonical(value))));
  return {total:gold.length,correctRoots,correctSubjects,incorrectSubjects,abstentions,correctPairs,falsePairs,missedPairs,
    requiredHierarchyChecks:{gtaFamily,koalaAnimals},rows,
    scope:{manualPublicCardDiagnostic:true,bodyCaptureOrEmbeddingTest:false,independentReview:false,populationQuality:false}};
}
