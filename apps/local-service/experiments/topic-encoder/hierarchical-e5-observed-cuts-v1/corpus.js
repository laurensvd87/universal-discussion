// Entirely new, literal CALIBRATION/TEST input for a separately versioned policy.
// The already frozen C model is not retrained or changed by these documents.
// Authored without copying old documents, inventory pages or consulting classifier
// outputs. String novelty is checked separately; full semantic family independence
// is not demonstrated. These are not independent web origins or population evidence.
import { CALIBRATION_CASES } from './corpus-calibration.js';
import { TEST_CASES } from './corpus-test.js';
import { TAXONOMY } from '../hierarchical-e5-paired-v1/taxonomy.js';

export const CORPUS_COUNTS = Object.freeze({ calibration: 205, test: 142 });
export const CORPUS_NOTES = Object.freeze({
  schema: 'observed-cuts-synthetic-corpus/v1',
  authoredRows: 347,
  perNode: Object.freeze({ calibration: 3, test: 2 }),
  unresolvedPerSplit: 16,
  taxonomyId: TAXONOMY.id,
  provenance: 'newly-authored-synthetic-paired-scenarios',
  independenceLimit: 'Author-declared scenario families are not independently sampled web origins; within-topic conceptual similarity remains possible.',
  semanticFamilyIndependenceDemonstrated: false,
  noveltyChecks: 'Exact and normalized title/body/identifier collisions against C are rejected; text uniqueness alone does not establish semantic family independence.',
  goldPolicy: 'Visible title and body jointly establish the central subject. A clearly exclusive body can identify an archived title as misplaced. A specific retained title may supply the sole topic when its body capture contains no subject. Equal sibling subjects stop at their shared parent. Empty or unidentified captures and equally central cross-root combinations have null single-path gold, never an imagined unseen subject.',
  bounds: Object.freeze({ titleWords: Object.freeze([3, 12]), bodyWords: Object.freeze([30, 60]), titleUtf16: 512, bodyUtf16: 4096 }),
  modelRetraining: false,
  classifierOutputsUsed: false,
  ownerDataUsed: false,
  independentWebValidation: false,
  productionValidated: false,
});

const approved = new Set(TAXONOMY.nodes.map(node => node.id));
export const CORPUS = Object.freeze(Object.entries({ calibration: CALIBRATION_CASES, test: TEST_CASES })
  .flatMap(([split, categories]) => {
    let index = 0;
    return Object.entries(categories).flatMap(([topicId, cases]) => {
      if (topicId !== 'outside' && !approved.has(topicId)) throw new TypeError('Unknown observed-cuts synthetic topic');
      return cases.map(([language, caseType, title, body]) => {
        const id = `oc1_${split}_${String(++index).padStart(3, '0')}`;
        return Object.freeze({ id, groupId: `family_${id}`, split, language, caseType, title, body,
          expectedTopicId: topicId === 'outside' ? null : topicId, provenance: 'synthetic-authored' });
      });
    });
  }));
export const corpus = CORPUS;
export default CORPUS;
