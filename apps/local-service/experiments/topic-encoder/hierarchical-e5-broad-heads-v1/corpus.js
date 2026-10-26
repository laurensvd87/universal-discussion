// Reduced, fully literal feasibility corpus approved before encoding. The original
// 1,038-row request was reduced to avoid manufactured scenario multiplication.
// No owner inventory, old A/B text, model outputs or translations were used.
// The imported modules contain every authored title/body literally. This assembler
// adds identifiers and provenance only; it does not generate document content.
import { TRAINING_CASES } from './corpus-training.js';
import { DEVELOPMENT_CASES } from './corpus-development.js';
import { CALIBRATION_CASES } from './corpus-calibration.js';
import { TEST_CASES } from './corpus-test.js';
import { TAXONOMY } from '../hierarchical-e5-paired-v1/taxonomy.js';

export const CORPUS_COUNTS = Object.freeze({ training: 130, development: 67, calibration: 193, test: 67 });
export const CORPUS_NOTES = Object.freeze({
  schema: 'broad-paired-synthetic-corpus/v1',
  originalRequestedRows: 1038,
  authoredRows: 457,
  perNode: Object.freeze({ training: 2, development: 1, calibration: 3, test: 1 }),
  outsidePerSplit: 4,
  provenance: 'independently-authored-synthetic-paired-scenarios',
  taxonomyId: TAXONOMY.id,
  grouping: 'one-independently-authored-scenario-per-group-no-cross-split-translations',
  independenceLimit: 'Author-declared scenario families are not independent web origins; within-topic conceptual similarity remains possible.',
  goldPolicy: 'Observed title and body jointly establish the central subject. An explicitly mistitled archive heading does not outweigh a clearly exclusive body subject. Generic captures with explicit substantive titles use only that visible title evidence. Shared sibling subjects stop at their approved parent. Truly empty or unidentified captures have null gold, never an invented missing target.',
  bounds: Object.freeze({ titleWords: Object.freeze([3, 12]), bodyWords: Object.freeze([30, 60]), titleUtf16: 512, bodyUtf16: 4096 }),
  independentWebValidation: false,
  productionValidated: false,
  ownerDataUsed: false,
});

const sections = { training: TRAINING_CASES, development: DEVELOPMENT_CASES, calibration: CALIBRATION_CASES, test: TEST_CASES };
const nodes = new Set(TAXONOMY.nodes.map(node => node.id));
export const CORPUS = Object.freeze(Object.entries(sections).flatMap(([split, groups]) => {
  let index = 0;
  return Object.entries(groups).flatMap(([topicId, cases]) => {
    if (topicId !== 'outside' && !nodes.has(topicId)) throw new TypeError('Unknown synthetic topic');
    return cases.map(([language, caseType, title, body]) => {
      const id = `bh1_${split}_${String(++index).padStart(3, '0')}`;
      return Object.freeze({ id, groupId: `family_${id}`, split, language, caseType, title, body,
        expectedTopicId: topicId === 'outside' ? null : topicId, provenance: 'synthetic-authored' });
    });
  });
}));
export const corpus = CORPUS;
export default CORPUS;
