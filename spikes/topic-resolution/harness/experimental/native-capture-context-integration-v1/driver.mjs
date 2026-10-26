// ADR214 SOURCE candidate. No runner, catalog, CLI or actual phase entry.
// Unchanged pure driver utilities remain authenticated frozen dependencies.
export {SPECIFICITY_DRIVER_FAILURE_STAGES,SPECIFICITY_PHASE_LEAVES,
 specificityPhaseLeaf,specificityWorkspaceLayout,specificityIoCatalog,
 validateSpecificityBootstrap,validateSpecificityStartupAck,specificityFreeze,
 assertSpecificityDrainStage,publishSpecificityTrainSelection}
 from '../native-specificity-study-v19/driver.mjs';
import {SPECIFICITY_DRIVER_FAILURE_STAGES} from '../native-specificity-study-v19/driver.mjs';
import {types} from 'node:util';

const P=Promise,then=Promise.prototype.then;
const need=v=>{if(v!==true)throw new Error('Specificity driver refused');};

/** Trusted-capability seam only. emitCaptureDiagnostic is the authenticated
 * collector's private, one-attempt, already-funded emission composition. It is
 * not a boolean selecting trust for caller DTOs. This factory cannot prove its
 * native issuance; the actual source composition remains a separate gate.
 * Default legacy validation is unchanged. Diagnostic failure never replaces
 * the action's exact thrown value, including all falsy primitives.
 */
export function createSpecificityDriverFailureBoundary({phase,emitFailure,captureDiagnostic,emitCaptureDiagnostic=null}){
 need(['prepare','train-cal','test'].includes(phase));
 for(const f of [emitFailure,captureDiagnostic])need(typeof f==='function'&&!types.isProxy(f));
 need(emitCaptureDiagnostic===null||typeof emitCaptureDiagnostic==='function'&&!types.isProxy(emitCaptureDiagnostic));
 let stage='startup',started=false,hasFailure=false;
 function observeEmitter(value){
  if(types.isProxy(value)||!types.isPromise(value)||Object.getPrototypeOf(value)!==P.prototype)return;
  const ds=Object.getOwnPropertyDescriptors(value);
  if(Object.hasOwn(ds,'constructor')||Object.hasOwn(ds,'then')||Reflect.ownKeys(ds).some(k=>!Object.hasOwn(ds[k],'value')))return;
  then.call(value,()=>undefined,()=>undefined);
 }
 return Object.freeze({
  mark(value){need(!hasFailure&&SPECIFICITY_DRIVER_FAILURE_STAGES.includes(value));stage=value;},
  async run(action){need(!started&&typeof action==='function'&&!types.isProxy(action));started=true;
   try{return await action();}catch(error){
    hasFailure=true;
    if(emitCaptureDiagnostic!==null){
     // The private collector owns its denial decision and sticky reservation.
     // No legacy getter, fallback envelope, parse, Buffer or generic suffix is
     // allocated here when that collector denies funding. Its fixed original
     // emitter may retain a Buffer after return; this boundary refunds nothing.
     try{emitCaptureDiagnostic(phase,stage,emitFailure);}catch{}
     throw error;
    }
    let capture='null';
    try{const candidate=captureDiagnostic();if(candidate!==null){need(typeof candidate==='string'&&candidate.length<=700&&candidate.isWellFormed());need(JSON.stringify(JSON.parse(candidate))===candidate);capture=candidate;}}catch{}
    const prefix=JSON.stringify({schema:'native-specificity-execution-failure/v1',phase,stage});
    let line=prefix.slice(0,-1)+',"capture":'+capture+'}\n';
    if(Buffer.byteLength(line)>900)line=prefix.slice(0,-1)+',"capture":null}\n';
    try{observeEmitter(emitFailure(Buffer.from(line,'utf8')));}catch{}
    throw error;
   }
  }
 });
}
