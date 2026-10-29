// CAL remains CAL. Missing observations are reported, never replaced with TEST.
import {compilePairedE5Input,applyPairedE5Input} from '../src/domain/hierarchical-e5-paired-input.js';
import {CHILD_TASKS} from './retained-hierarchy-child-inputs.js';
const need=v=>{if(!v)throw new TypeError('Invalid child calibration extension');};
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/u.test(v);
export function extendChildCalibration({projected,probes,features,inputDefinition}){
 return extend({projected,probes,features,inputDefinition},['calibration']);
}
export function extendReviewedChildDevelopment({projected,probes,features,inputDefinition}){
 return extend({projected,probes,features,inputDefinition},['training','calibration']);
}
function extend({projected,probes,features,inputDefinition},allowedSplits){
 need(projected&&Array.isArray(projected.rows)&&Array.isArray(probes)&&probes.length<=16&&Array.isArray(features)&&features.length===probes.length);
 const adapter=compilePairedE5Input(inputDefinition),ids=new Set(projected.rows.map(r=>r.id)),groups=new Set(projected.rows.map(r=>r.groupId)),rows=[...projected.rows];
 const absent=[];
 for(let i=0;i<probes.length;i++){
  const p=probes[i],f=features[i];
  need(allowedSplits.includes(p.split)&&typeof p.id==='string'&&typeof p.groupId==='string'&&!ids.has(p.id)&&!groups.has(p.groupId)&&
   Object.keys(p.labels).sort().join() === [...CHILD_TASKS].sort().join()&&CHILD_TASKS.every(n=>p.labels[n]===null||typeof p.labels[n]==='boolean'));
  need(f.id===p.id&&f.url===p.url&&f.split===p.split);ids.add(p.id);groups.add(p.groupId);
  if(f.status==='unavailable'){need(typeof f.reason==='string');absent.push({id:p.id,reason:f.reason});continue;}
  need(f.status==='encoded'&&hash(f.sourceInputHash)&&f.modelId==='e5-small-q8-browser-main-prefix-v1'&&
   (p.labels['video-games']!==true||p.expectedRootId==='games')&&(p.labels.animals!==true||p.expectedRootId==='nature')&&(p.labels.koalas!==true||p.labels.animals===true));
  const query={sourceId:p.id,sourceVersion:f.sourceInputHash,bodyVector:f.bodyVector,titleVector:f.titleVector};
  const fused=applyPairedE5Input(adapter,query);need(fused.status==='available');
  rows.push({...query,id:p.id,groupId:p.groupId,split:p.split,language:p.language,expectedRootId:p.expectedRootId,labels:{...p.labels},
   labelBinding:{kind:'fixed-fresh-development-case'},vector:fused.vector});
 }
 return {...projected,rows,extensionUnavailable:absent};
}
