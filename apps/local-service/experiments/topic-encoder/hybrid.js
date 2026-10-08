// Experimental, English-first topic affinity. All constants were fixed before
// evaluating the independent topic-encoder holdout. This module changes no
// production grouping, storage or capture behavior.
export const HYBRID_RULE = Object.freeze({
  maxTitleCharacters: 256,
  maxLeadCharacters: 768,
  maxTokens: 160,
  maxVectorDimensions: 4096,
  titleOverlapWeight: 0.09,
  leadOverlapWeight: 0.025,
  versionConflictPenalty: 0.14,
  datedEventConflictPenalty: 0.08,
  reversedRelationPenalty: 0.15,
  eventTransitionPenalty: 0.09,
});

const STOP = new Set(`a an and are as at be been by for from has have in into is it its of on or that the their this to was were will with would about after before new latest says say said report reports article story page why how what when who which where should could can may might not no yes very more less much many good bad best worst better worse right wrong great poor supports support backs backing praises praise critic criticizes criticise criticism opposed opposes opposition mistake fair unfair deserves deserve`.split(' '));
const MONTHS = new Map('january february march april may june july august september october november december'.split(' ').map((month, index) => [month, index + 1]));
const TRANSITIONS = Object.freeze([
  [new Set(['close','closes','closed','closing','closure','shutdown','shuts']), new Set(['reopen','reopens','reopened','reopening'])],
  [new Set(['launch','launches','launched','opening','opens','opened']), new Set(['cancel','cancels','cancelled','canceled','cancellation'])],
]);
const BUY_VERBS = '(?:buying|buys|bought|acquiring|acquires|acquired|purchase|purchases|purchased)';

function bounded(value, limit) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new TypeError('Document text must be a string');
  return value.slice(0, limit).normalize('NFKC').toLocaleLowerCase('en');
}

function tokens(text) {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, HYBRID_RULE.maxTokens);
}

function contentTerms(parts) {
  return new Set(parts.filter(token => token.length > 1 && !STOP.has(token) && !MONTHS.has(token)));
}

function overlap(left, right) {
  const common = [...left].filter(token => right.has(token)).length;
  return common ? common / (left.size + right.size - common) : 0;
}

function vectorsCosine(a, b) {
  if (!a || !b || typeof a.length !== 'number' || a.length !== b.length ||
      a.length < 1 || a.length > HYBRID_RULE.maxVectorDimensions) throw new TypeError('Invalid vector shape');
  let dot = 0, leftNorm = 0, rightNorm = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new TypeError('Invalid vector value');
    dot += x * y; leftNorm += x * x; rightNorm += y * y;
  }
  if (leftNorm === 0 || rightNorm === 0) throw new TypeError('Zero vector');
  return Math.max(-1, Math.min(1, dot / Math.sqrt(leftNorm * rightNorm)));
}

function versionConflicts(a, b) {
  const versions = parts => {
    const found = new Map();
    for (let i = 1; i < parts.length; i++) {
      if (/^\d{1,3}$/u.test(parts[i]) && /\p{L}/u.test(parts[i - 1])) found.set(parts[i - 1], parts[i]);
    }
    return found;
  };
  const left = versions(a), right = versions(b);
  return [...left].some(([name, value]) => right.has(name) && right.get(name) !== value);
}

function titleMonthConflict(a, b) {
  const months = parts => new Set(parts.filter(token => MONTHS.has(token)));
  const left = months(a), right = months(b);
  // Month words in the title normally describe the event. Body dates can be
  // publication dates, so they never trigger this rule.
  return left.size > 0 && right.size > 0 && ![...left].some(month => right.has(month));
}

function relation(text) {
  // Parse only a simple unambiguous title pattern; unknown syntax abstains.
  // Entity tokens are compared as literals, with no site or named-entity list.
  const pattern = new RegExp(`\\b([\\p{L}][\\p{L}\\p{N}-]*)\\s+${BUY_VERBS}\\s+(?:of\\s+)?([\\p{L}][\\p{L}\\p{N}-]*)\\b`, 'u');
  const match = pattern.exec(text);
  return match ? [match[1], match[2]] : null;
}

function reversedRelation(a, b) {
  const left = relation(a), right = relation(b);
  return Boolean(left && right && left[0] !== left[1] && left[0] === right[1] && left[1] === right[0]);
}

function eventTransition(a, b) {
  return TRANSITIONS.some(([left, right]) =>
    (a.some(token => left.has(token)) && b.some(token => right.has(token))) ||
    (b.some(token => left.has(token)) && a.some(token => right.has(token))));
}

export function explainPair(aDoc, aVector, bDoc, bVector) {
  const aTitle = bounded(aDoc?.title, HYBRID_RULE.maxTitleCharacters);
  const bTitle = bounded(bDoc?.title, HYBRID_RULE.maxTitleCharacters);
  const aLead = bounded(aDoc?.body ?? aDoc?.text, HYBRID_RULE.maxLeadCharacters);
  const bLead = bounded(bDoc?.body ?? bDoc?.text, HYBRID_RULE.maxLeadCharacters);
  const aTitleTokens = tokens(aTitle), bTitleTokens = tokens(bTitle);
  const titleOverlap = overlap(contentTerms(aTitleTokens), contentTerms(bTitleTokens));
  const leadOverlap = overlap(contentTerms(tokens(aLead)), contentTerms(tokens(bLead)));
  const sharedSubject = titleOverlap > 0 || leadOverlap >= 0.15;
  const conflicts = {
    version: versionConflicts(aTitleTokens, bTitleTokens),
    eventMonth: sharedSubject && titleMonthConflict(aTitleTokens, bTitleTokens),
    direction: reversedRelation(aTitle, bTitle),
    eventTransition: sharedSubject && eventTransition(aTitleTokens, bTitleTokens),
  };
  const cosine = vectorsCosine(aVector, bVector);
  const score = cosine + HYBRID_RULE.titleOverlapWeight * titleOverlap +
    HYBRID_RULE.leadOverlapWeight * leadOverlap -
    HYBRID_RULE.versionConflictPenalty * Number(conflicts.version) -
    HYBRID_RULE.datedEventConflictPenalty * Number(conflicts.eventMonth) -
    HYBRID_RULE.reversedRelationPenalty * Number(conflicts.direction) -
    HYBRID_RULE.eventTransitionPenalty * Number(conflicts.eventTransition);
  return { score, cosine, titleOverlap, leadOverlap, conflicts };
}

export function score(aDoc, aVector, bDoc, bVector) {
  return explainPair(aDoc, aVector, bDoc, bVector).score;
}
