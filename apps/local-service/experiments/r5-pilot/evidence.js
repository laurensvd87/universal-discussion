import { createHash } from 'node:crypto';
import { inspectPageUrl } from '../../../../spikes/topic-resolution/browser/core/page-content-policy.js';
import { pilotUrl } from './capture.js';

export const ACCEPT_RATIONALE = 'verified-original-editorial-and-title-rights';
const REJECT_RATIONALES = new Set(['unclear-license', 'third-party-title', 'agency-copy',
  'non-editorial', 'outside-date-range', 'non-english', 'reader-abstained', 'other-rights-unclear']);
const RIGHTS_BASES = new Set(['page-license-notice', 'site-policy-and-page-notice', 'publisher-original-public-domain']);
const FIELDS = ['sourceUrl', 'metadataOriginUrl', 'rightsEvidenceUrl', 'rightsEvidenceObservedAt',
  'licenseId', 'rightsBasis', 'titleRights', 'publisherOriginality', 'attributionUrl',
  'disposition', 'rationale'];
const sha = value => createHash('sha256').update(value, 'utf8').digest('hex');
function publicUrl(value) {
  const inspected = inspectPageUrl(value);
  if (!inspected.supported || !value.startsWith('https://') || value.includes('#')) throw new TypeError('Invalid evidence URL');
  return inspected.url;
}
function time(value) {
  if (typeof value !== 'string' || !/^20\d\d-[01]\d-[0-3]\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u.test(value) ||
      Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19) ||
      Date.parse(value) > Date.now() + 300000) throw new TypeError('Invalid evidence time');
  return value;
}

// This is a digest of the reviewer-declared *record*, never a claim that a
// policy page was fetched or preserved. Field order is fixed for reproducibility.
export function makeEvidence(input) {
  if (!input || Object.getPrototypeOf(input) !== Object.prototype ||
      Reflect.ownKeys(input).length !== FIELDS.length ||
      Reflect.ownKeys(input).some(key => !FIELDS.includes(key))) throw new TypeError('Evidence required');
  const evidence = Object.fromEntries(FIELDS.map(field => [field, input[field]]));
  evidence.sourceUrl = pilotUrl(evidence.sourceUrl);
  evidence.metadataOriginUrl = publicUrl(evidence.metadataOriginUrl);
  if (evidence.metadataOriginUrl !== evidence.sourceUrl) throw new TypeError('Metadata origin must be the reviewed page');
  evidence.rightsEvidenceUrl = publicUrl(evidence.rightsEvidenceUrl);
  evidence.attributionUrl = publicUrl(evidence.attributionUrl);
  evidence.rightsEvidenceObservedAt = time(evidence.rightsEvidenceObservedAt);
  if (typeof evidence.licenseId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9.+-]{1,39}$/u.test(evidence.licenseId) ||
      !RIGHTS_BASES.has(evidence.rightsBasis) || !['permitted', 'unclear', 'prohibited'].includes(evidence.titleRights) ||
      !['publisher-original', 'third-party', 'unclear'].includes(evidence.publisherOriginality) ||
      !['accepted', 'rejected'].includes(evidence.disposition)) throw new TypeError('Invalid rights evidence');
  if (evidence.disposition === 'accepted') {
    if (evidence.titleRights !== 'permitted' || evidence.publisherOriginality !== 'publisher-original' ||
        evidence.rationale !== ACCEPT_RATIONALE) throw new TypeError('Acceptance evidence incomplete');
  } else if (!REJECT_RATIONALES.has(evidence.rationale)) throw new TypeError('Rejection rationale required');
  return Object.freeze({ record: Object.freeze(evidence), sha256: sha(JSON.stringify(evidence)) });
}
