// Versioned fixed schema inventories; importing never reads a DB or archive.
import {types} from 'node:util';
import {AUTOMATIC17_RESTORED_TABLES as legacy} from '../automatic-topics-owner-upgrade.js';
export const LEGACY17_FINGERPRINT_TABLES=legacy;
export const RESTORED17_TABLES=Object.freeze({...legacy,semantic_preparation_requests:'source_id'});
const legacyNames=Object.freeze(Object.keys(legacy)),fullNames=Object.freeze(Object.keys(RESTORED17_TABLES));
export function receiptFingerprintProfile(names){
 if(!Array.isArray(names)||types.isProxy(names))throw new TypeError('Invalid restored receipt table inventory');
 const matches=expected=>names.length===expected.length&&expected.every((name,i)=>names[i]===name);
 if(matches(fullNames))return 'complete29';
 if(matches(legacyNames))return 'legacy28';
 throw new TypeError('Invalid restored receipt table inventory');
}
