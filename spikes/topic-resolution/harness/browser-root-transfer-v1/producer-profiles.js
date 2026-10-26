// Pure browser-only file identity recipe, not producer/native authority.
import {record,dense,hash,freeze,digest} from './manifest.js';
import {types} from 'node:util';
export const CONSTRUCTION_SOURCE_KEYS=Object.freeze(['run.mjs','policy.js','manifest.js','producer-profiles.js','supervise.py','protocol.json',
 'page-content-reader.js','page-content-policy.js','final-policy.js','final-manifest.js','public-fetch.js','robots.js','static-capture.js','robots-deny-space-repair.js']);
export function buildBrowserProducerProfile(value){
 const a=record(value,['runtimeSourceHashes','packageSourceHashes']),runtime=record(a.runtimeSourceHashes,CONSTRUCTION_SOURCE_KEYS);
 for(const h of Object.values(runtime))hash(h);
 if(!a.packageSourceHashes||types.isProxy(a.packageSourceHashes)||Object.getPrototypeOf(a.packageSourceHashes)!==Object.prototype)throw new TypeError('Invalid package source map');
 const keys=Reflect.ownKeys(a.packageSourceHashes);if(keys.length<1||keys.length>128||keys.some(k=>typeof k!=='string'))throw new TypeError('Invalid package source map');keys.sort();
 const packageMap=record(a.packageSourceHashes,keys);for(const [k,h]of Object.entries(packageMap)){if(!k.startsWith('node_modules/playwright-core/')||k.includes('..')||k.length>256)throw new TypeError('Invalid package key');hash(h);}
 const construction=freeze({schema:'browser-root-target-construction/v1',producerId:'browser-current',runtimeSourceHashes:runtime,packageSourceHashes:packageMap,
  extractorVersions:['article-container-prefix/v1','main-text-prefix/v1'],bodyLimitUtf16:4096,titleLimitUtf16:200,
  observation:{afterMatchingDclMs:2000,absoluteArticleLeaseMs:20000,latestMatchingDclMs:18000,witnessSchema:'playwright-owned-document/v1',
   gotoWaitUntil:'commit',gotoUsesRemainingOriginalArticleLease:true,otherRpcMaximumMs:10000,articleTimeoutOnlyOwnedTimer:true,
   ownPlaywrightRequestIdentity:true,independentCdpFrameLoader:true,networkRequestIdCorrelated:false,nativeAttestation:false},
  scope:'restricted-single-document-dom-reader/v1',ordinaryDynamicBrowserProducerValidated:false,preprocessing:'none-no-prune-no-lead-no-trimming-no-title-only-rescue'});
 const body={schema:'root-rank-target-producer-profile/v1',producerId:'browser-current',inputConstructionHash:digest(construction),extractorVersions:construction.extractorVersions};
 return freeze({schema:'browser-root-target-profile-set/v1',producerProfile:{...body,producerProfileHash:digest(body)},construction,recipeHash:digest(construction)});
}
