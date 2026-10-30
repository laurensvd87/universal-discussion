// Name/alias-gated nearest-ancestor experiment. Aliases and accepted roots are
// privileged caller inputs; this module does not establish their provenance.
import {chooseTopicAncestor} from './topic-ancestor-neighbors.js';
const need = value => { if (!value) throw new TypeError('Invalid labelled topic selection'); };
const norm = value => value.normalize('NFKC').toLowerCase().replace(/\s+/gu,' ').trim();
const articles = new Set('the a an der die das ein eine le la les un une el los las het een'.split(' '));
const word = value => /[\p{L}\p{N}]/u.test(value ?? '');
function nameEvidence(title,alias,allowNonfocal) {
  let at = -1;
  while ((at = title.indexOf(alias,at + 1)) !== -1) {
    const before = [...title.slice(0,at)].at(-1), after = [...title.slice(at + alias.length)][0];
    if (word(before) || word(after)) continue;
    const words = alias.match(/[\p{L}\p{N}]+/gu) ?? [];
    const prefix = title.slice(0,at).match(/[\p{L}\p{N}]+/gu) ?? [];
    const beforeAlias = title.slice(0,at);
    const parenthetical = beforeAlias.lastIndexOf('(') > beforeAlias.lastIndexOf(')');
    if (allowNonfocal || parenthetical || words.length > 1 || prefix.every(part => articles.has(part))) return true;
  }
  return false;
}
export function chooseLabelledTopicAncestor(rawJson) {
  need(arguments.length === 1 && typeof rawJson === 'string' && rawJson.length <= 1048576);
  const input = JSON.parse(rawJson);
  const keys = ['neighbors','minimumSimilarity','ambiguityMargin','ownerGrouping','queryTitle','acceptedRootId','aliases'];
  need(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).sort().join(',') === keys.sort().join(','));
  const {queryTitle,acceptedRootId,aliases,...base} = input;
  chooseTopicAncestor(JSON.stringify(base)); // Original bounds and tree validation.
  need(typeof queryTitle === 'string' && queryTitle.length > 0 && queryTitle.length <= 512 && queryTitle.isWellFormed() &&
    !/[\u0000-\u001f\u007f]/u.test(queryTitle));
  need(acceptedRootId === null || (typeof acceptedRootId === 'string' && /^domain:[A-Za-z0-9._:-]{1,140}$/u.test(acceptedRootId)));
  need(Array.isArray(aliases) && aliases.length <= 512);
  const known = new Map(); let aliasCount = 0;
  for (const row of aliases) {
    need(row && typeof row === 'object' && !Array.isArray(row) && Object.keys(row).sort().join(',') === 'labels,nodeId' &&
      typeof row.nodeId === 'string' && /^topic:[A-Za-z0-9._:-]{1,140}$/u.test(row.nodeId) && !known.has(row.nodeId) &&
      Array.isArray(row.labels) && row.labels.length > 0 && row.labels.length <= 16);
    const labels = row.labels.map(value => {
      need(typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= 120 &&
        value.isWellFormed() && !/[\u0000-\u001f\u007f]/u.test(value)); return norm(value);
    });
    aliasCount += labels.length; need(aliasCount <= 2048); known.set(row.nodeId,labels);
  }
  const title = norm(queryTitle); let pruned = 0, removed = 0;
  base.neighbors = base.neighbors.flatMap(row => {
    if (acceptedRootId !== null && row.path[0] !== acceptedRootId) { removed++; return []; }
    let length = row.path[0].startsWith('domain:') ? 1 : 0;
    for (let index = length; index < row.path.length; index++) {
      const labels = known.get(row.path[index]) ?? [];
      if (labels.some(alias => nameEvidence(title,alias,acceptedRootId !== null))) length = index + 1;
    }
    // A matched descendant carries its already-known semantic ancestors even
    // if those broad concepts are not literally repeated in the title.
    if (length < row.path.length) pruned++;
    if (length === 0) { removed++; return []; }
    return [{...row,path:row.path.slice(0,length)}];
  });
  const result = chooseTopicAncestor(JSON.stringify(base));
  return {...result,schema:'topic-labelled-neighbors/v1',namePrunedNeighbors:pruned,rootOrNameRemovedNeighbors:removed,
    scope:{...result.scope,aliasProvenanceVerified:false,coarseRootFreshnessVerified:false}};
}
