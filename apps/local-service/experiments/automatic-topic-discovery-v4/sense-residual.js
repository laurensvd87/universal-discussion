// Offline bounded hypothesis: remove shared embedding directions before finding
// same-name sense groups. No fitting, gold labels, model load, IO or authority.
import {createHash} from 'node:crypto';
const need=v=>{if(!v)throw new TypeError('Invalid named-sense residual input');};
const vector=v=>Array.isArray(v)&&v.length===384&&v.every(x=>typeof x==='number'&&Number.isFinite(x))&&Math.abs(Math.hypot(...v)-1)<1e-5;
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const unit=v=>{const n=Math.hypot(...v);return n<1e-10?null:v.map(x=>x/n);};
const subtract=(v,d)=>{if(d===null)return [...v];const c=dot(v,d);return v.map((x,i)=>x-c*d[i]);};
export const SENSE_RESIDUAL_GRID=Object.freeze({modes:Object.freeze(['common','name','common-and-name']),thresholds:Object.freeze([0,.2,.4,.6])});
export function residualVector(vectorValue,common,name,mode){
 need(vector(vectorValue)&&vector(name)&&(common===null||vector(common))&&SENSE_RESIDUAL_GRID.modes.includes(mode));
 if(mode==='name')return unit(subtract(vectorValue,name));
 const remainder=subtract(vectorValue,common);
 if(mode==='common')return unit(remainder);
 // Gram-Schmidt keeps the two removed directions orthogonal; subtracting the
 // original name twice would reintroduce the common component.
 const nameDirection=unit(subtract(name,common));
 return unit(subtract(remainder,nameDirection));
}

export function completeLinkResidualGroups(ids,matrix,threshold){
 need(Array.isArray(ids)&&ids.length<=64&&new Set(ids).size===ids.length&&ids.every(x=>typeof x==='string')&&
  Array.isArray(matrix)&&matrix.length===ids.length&&matrix.every(r=>Array.isArray(r)&&r.length===ids.length)&&
  typeof threshold==='number'&&Number.isFinite(threshold)&&threshold>=-1&&threshold<=1);
 for(let i=0;i<ids.length;i++)for(let j=0;j<ids.length;j++){
  const a=matrix[i][j],b=matrix[j][i];
  if(a===null||b===null)need(a===null&&b===null);
  else need(typeof a==='number'&&Number.isFinite(a)&&a>=-1.00001&&a<=1.00001&&Math.abs(a-b)<1e-10&&(i!==j||Math.abs(a-1)<1e-10));
 }
 let groups=ids.map((id,i)=>({ids:[id],indices:[i]})).sort((a,b)=>a.ids[0].localeCompare(b.ids[0]));
 while(true){
  let best=null;
  for(let i=0;i<groups.length;i++)for(let j=0;j<i;j++){
   let similarity=1;for(const a of groups[i].indices)for(const b of groups[j].indices)similarity=Math.min(similarity,matrix[a][b]??-2);
   if(similarity<threshold)continue;const key=[...groups[i].ids,...groups[j].ids].sort().join('\u001f');
   if(best===null||similarity>best.similarity||similarity===best.similarity&&key<best.key)best={i,j,similarity,key};
  }
  if(best===null)break;
  const merged={ids:[...groups[best.i].ids,...groups[best.j].ids].sort(),indices:[...groups[best.i].indices,...groups[best.j].indices]};
  groups=groups.filter((_,i)=>i!==best.i&&i!==best.j);groups.push(merged);groups.sort((a,b)=>a.ids[0].localeCompare(b.ids[0]));
 }
 return groups.filter(g=>g.ids.length>=2).map(g=>g.ids);
}

export function compareNamedSenseResiduals(observations,labels){
 need(arguments.length===2&&Array.isArray(observations)&&observations.length>0&&observations.length<=64&&Array.isArray(labels)&&labels.length>0&&labels.length<=128);
 const docs=new Map(),keys=new Set();for(const d of observations){need(d&&typeof d.sourceId==='string'&&!docs.has(d.sourceId)&&vector(d.body));docs.set(d.sourceId,d);}
 for(const p of labels){need(p&&typeof p.key==='string'&&!keys.has(p.key)&&typeof p.label==='string'&&p.label.trim()&&p.label.length<=80&&vector(p.vector)&&
  Array.isArray(p.members)&&p.members.length>=2&&p.members.length<=64&&new Set(p.members).size===p.members.length&&p.members.every(id=>docs.has(id)));keys.add(p.key);}
 const mean=Array(384).fill(0);for(const d of [...docs.values()].sort((a,b)=>a.sourceId.localeCompare(b.sourceId)))for(let i=0;i<384;i++)mean[i]+=d.body[i]/docs.size;
 const common=unit(mean),variants=[];
 for(const mode of SENSE_RESIDUAL_GRID.modes){
  const prepared=labels.map(p=>{
   const members=[...p.members].sort(),vectors=members.map(id=>residualVector(docs.get(id).body,common,p.vector,mode));
   const matrix=vectors.map(a=>vectors.map(b=>a===null||b===null?null:dot(a,b)));
   return {p,members,matrix,unavailable:vectors.filter(v=>v===null).length};
  });
  for(const threshold of SENSE_RESIDUAL_GRID.thresholds){
   const byMembers=new Map();
   for(const {p,members,matrix}of prepared)for(const ids of completeLinkResidualGroups(members,matrix,threshold)){
    const signature=ids.join('\u001f'),old=byMembers.get(signature),group={labelKey:p.key,label:p.label,members:ids};
    // A newly split generic Python group must not replace the more qualified
    // Monty Python group with the identical member set. No parenthood inferred.
    if(!old||group.label.length>old.label.length||group.label.length===old.label.length&&group.labelKey<old.labelKey)byMembers.set(signature,group);
   }
   const groups=[...byMembers.values()].map(g=>({...g,key:createHash('sha256').update(JSON.stringify([g.labelKey,g.members])).digest('hex')}));
   const selections=observations.map(d=>{
    const supported=groups.filter(g=>g.members.includes(d.sourceId)).sort((a,b)=>
     // More qualified overlapping labels are preferred for this diagnostic;
     // shared words or member subsets still confer NO ancestry authority.
     b.label.split(/\s+/u).length-a.label.split(/\s+/u).length||b.label.length-a.label.length||a.key.localeCompare(b.key));
    return {sourceId:d.sourceId,key:supported[0]?.key??null};
   });
   variants.push({mode,threshold,groups,selections,unavailableResiduals:prepared.reduce((n,p)=>n+p.unavailable,0)});
  }
 }
 return {schema:'named-sense-residual-development/v1',grid:SENSE_RESIDUAL_GRID,variants,
  scope:{goldUsed:false,newEncoder:false,policySelected:false,parenthoodAsserted:false,publication:false,liveChanged:false}};
}
