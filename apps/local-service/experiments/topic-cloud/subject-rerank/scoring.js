// Frozen synthetic-only rules. No corpus labels enter scoring.
export const VARIANTS = Object.freeze({
  body: Object.freeze({ lexical: 0, conflict: 0 }),
  title05: Object.freeze({ lexical: 0.05, conflict: 0.08 }),
  title10: Object.freeze({ lexical: 0.10, conflict: 0.16 }),
});
const STOP = new Set('a an and are as at be because by for from has in is it of on or that the their this to was were will with would should does do too after before about says say'.split(' '));
const MONTHS = new Set('january february march april may june july august september october november december'.split(' '));

export function titleTerms(title) {
  if (typeof title !== 'string') throw new Error('Invalid title');
  // Keep negation, numbers and month words in the raw token stream for conflict checks.
  return title.normalize('NFKC').toLocaleLowerCase('und').match(/[\p{L}\p{N}]+/gu) ?? [];
}
export function titleCues(a, b) {
  const ta = titleTerms(a), tb = titleTerms(b);
  const terms = tokens => new Set(tokens.filter(t => !STOP.has(t) && !MONTHS.has(t)));
  const aa = terms(ta), bb = terms(tb);
  const intersection = [...aa].filter(t => bb.has(t)).length;
  const union = new Set([...aa, ...bb]).size;
  const lexical = union ? intersection / union : 0;
  const mismatch = (left, right) => left.size > 0 && right.size > 0 && ![...left].some(t => right.has(t));
  const months = tokens => new Set(tokens.filter(t => MONTHS.has(t)));
  const numbers = tokens => new Set(tokens.filter(t => /^\d+$/u.test(t)));
  const conflict = mismatch(months(ta),months(tb)) || mismatch(numbers(ta),numbers(tb)) ? 1 : 0;
  return { lexical, conflict };
}
export function scorePair(similarity, titleA, titleB, variant) {
  const rule = VARIANTS[variant];
  if (!rule || !Number.isFinite(similarity) || similarity < -1 || similarity > 1) throw new Error('Invalid score input');
  const cues = titleCues(titleA, titleB);
  return similarity + rule.lexical * cues.lexical - rule.conflict * cues.conflict;
}

export function evaluate(corpus, similarities) {
  const all = corpus.documents;
  const byId = new Map(all.map(d => [d.id, d]));
  if (byId.size !== all.length) throw new Error('Duplicate ID');
  const output = {};
  for (const [variant] of Object.entries(VARIANTS)) {
    output[variant] = {};
    for (const [split, families] of Object.entries(corpus.split)) {
      const docs = all.filter(d => families.includes(d.family));
      if (docs.length === 0) continue;
      const ranks = [];
      let correctAboveHard = 0, positivePairs = 0, hardPairs = 0;
      let ndcgAt5 = 0, topOneHard = 0, topOneUnrelated = 0;
      for (const d of docs) {
        const candidates = docs.filter(other => other.id !== d.id).map(other => {
          const key = [d.id, other.id].sort().join('|');
          const similarity = similarities[key];
          if (!Number.isFinite(similarity)) throw new Error('Missing similarity');
          return { id: other.id, score: scorePair(similarity, d.title, other.title, variant),
            positive: d.topicLabel === other.topicLabel, hard: d.family === other.family };
        }).sort((a,b) => b.score-a.score || a.id.localeCompare(b.id));
        const rank = candidates.findIndex(c => c.positive) + 1;
        ranks.push({ id: d.id, rank });
        const grade = c => c.positive ? 3 : c.hard ? 1 : 0;
        const gain = value => (2 ** value) - 1;
        const dcg = candidates.slice(0,5).reduce((n,c,i)=>n+gain(grade(c))/Math.log2(i+2),0);
        const ideal = [3,1,1].reduce((n,g,i)=>n+gain(g)/Math.log2(i+2),0);
        ndcgAt5 += dcg / ideal;
        topOneHard += Number(candidates[0].hard && !candidates[0].positive);
        topOneUnrelated += Number(!candidates[0].hard);
        const positive = candidates.find(c => c.positive);
        if (!positive) throw new Error('Every query needs a positive partner');
        const hard = candidates.filter(c => c.hard && !c.positive);
        correctAboveHard += Number(hard.every(c => positive.score > c.score));
      }
      for (let i=0;i<docs.length;i++) for (let j=i+1;j<docs.length;j++) {
        if (docs[i].topicLabel === docs[j].topicLabel) positivePairs++;
        else if (docs[i].family === docs[j].family) hardPairs++;
      }
      output[variant][split] = {
        queries: docs.length, positivePairs, hardPairs,
        recallAt1: ranks.filter(r=>r.rank<=1).length,
        recallAt5: ranks.filter(r=>r.rank<=5).length,
        positiveAboveAllHard: correctAboveHard,
        topOneHardNegative: topOneHard, topOneUnrelated,
        ndcgAt5: ndcgAt5 / docs.length,
        meanReciprocalRank: ranks.reduce((n,r)=>n+1/r.rank,0)/ranks.length,
        // IDs/ranks only, no page content or vector data.
        ranks,
      };
    }
  }
  return output;
}
