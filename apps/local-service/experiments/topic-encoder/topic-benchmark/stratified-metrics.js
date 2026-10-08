// Gold labels enter only after a matcher has returned a complete partition.
import { joinedPairs, normalizedPartition } from './metrics.js';

const pairKey = (a, b) => a < b ? `${a}\0${b}` : `${b}\0${a}`;

export function scoreLanguagePairs(documents, partitions, languageOf) {
  if (typeof languageOf !== 'function') throw new TypeError('Language reader required');
  const groups = normalizedPartition(documents, partitions);
  const joined = joinedPairs(groups);
  const byLanguagePair = new Map();
  let crossLanguageTrue = 0;
  let crossLanguageJoined = 0;
  let adjacentEventFalse = 0;
  let adjacentEventTotal = 0;
  for (let i = 0; i < documents.length; i++) for (let j = i + 1; j < documents.length; j++) {
    const a = documents[i], b = documents[j];
    const langs = [languageOf(a), languageOf(b)];
    if (langs.some(value => typeof value !== 'string' || !value))
      throw new TypeError('Invalid language');
    const name = langs.sort().join('/');
    const bucket = byLanguagePair.get(name) ?? { truePairs: 0, joinedTrue: 0,
      differentPairs: 0, falseJoins: 0 };
    const same = a.topicLabel === b.topicLabel;
    const linked = joined.has(pairKey(a.id, b.id));
    if (same) {
      bucket.truePairs++;
      if (linked) bucket.joinedTrue++;
      if (langs[0] !== langs[1]) {
        crossLanguageTrue++;
        if (linked) crossLanguageJoined++;
      }
    } else {
      bucket.differentPairs++;
      if (a.family === b.family) {
        adjacentEventTotal++;
        if (linked) adjacentEventFalse++;
      }
      if (linked) bucket.falseJoins++;
    }
    byLanguagePair.set(name, bucket);
  }
  return { crossLanguage: { joined: crossLanguageJoined, total: crossLanguageTrue },
    adjacentEvent: { falseJoins: adjacentEventFalse, total: adjacentEventTotal },
    languagePairs: Object.fromEntries([...byLanguagePair].sort(([a], [b]) => a.localeCompare(b))) };
}
