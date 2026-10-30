// Bounded numerical DEV: label embeddings are independent local encoder inputs,
// not gold, a fitted classifier, a canonical topic identity or publication proof.
const need=v=>{if(!v)throw new TypeError('Invalid label grounding comparison');};
const vector=v=>Array.isArray(v)&&v.length===384&&v.every(x=>typeof x==='number'&&Number.isFinite(x))&&Math.abs(Math.hypot(...v)-1)<1e-5;
const dot=(a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
export const LABEL_GROUNDING_GRID=Object.freeze({views:Object.freeze(['body','paired']),thresholds:Object.freeze([.8,.85,.88,.9]),margins:Object.freeze([0,.01,.03])});
export function compareLabelGrounding(observations,labels){
 need(arguments.length===2&&Array.isArray(observations)&&observations.length<=64&&Array.isArray(labels)&&labels.length>0&&labels.length<=128);
 const ids=new Set(),keys=new Set();
 for(const o of observations){need(o&&typeof o.sourceId==='string'&&!ids.has(o.sourceId)&&vector(o.body)&&vector(o.title)&&vector(o.paired));ids.add(o.sourceId);}
 for(const p of labels){need(p&&typeof p.key==='string'&&!keys.has(p.key)&&typeof p.label==='string'&&p.label.trim()&&p.label.length<=80&&vector(p.vector)&&
  Array.isArray(p.members)&&p.members.length>=2&&p.members.length<=64&&new Set(p.members).size===p.members.length&&p.members.every(id=>ids.has(id)));keys.add(p.key);}
 const matrix=observations.map(o=>({sourceId:o.sourceId,scores:labels.map(p=>({key:p.key,
  body:dot(o.body,p.vector),title:dot(o.title,p.vector),paired:dot(o.paired,p.vector)}))}));
 const variants=[];
 for(const view of LABEL_GROUNDING_GRID.views)for(const threshold of LABEL_GROUNDING_GRID.thresholds)for(const margin of LABEL_GROUNDING_GRID.margins){
  const preliminary=matrix.map(row=>{
   const all=[...row.scores].sort((a,b)=>b[view]-a[view]||a.key.localeCompare(b.key));
   const permitted=new Set(labels.filter(p=>p.members.includes(row.sourceId)).map(p=>p.key));
   // Competition includes all proposed labels. A higher unrelated alternative
   // prevents the lexical name from winning by omission. No gold is consulted.
   const best=all[0],gap=all.length>1?best[view]-all[1][view]:null;
   const key=permitted.has(best.key)&&best[view]>=threshold&&(gap===null||gap>=margin)?best.key:null;
   return {sourceId:row.sourceId,key,score:best[view],gap};
  });
  const counts=new Map();for(const row of preliminary)if(row.key!==null)counts.set(row.key,(counts.get(row.key)??0)+1);
  // These are hypothetical NEW subjects: one remaining member is insufficient.
  const selections=preliminary.map(row=>({...row,key:row.key!==null&&counts.get(row.key)>=2?row.key:null}));
  variants.push({view,threshold,margin,selections,assigned:selections.filter(s=>s.key!==null).length});
 }
 return {schema:'label-grounding-development/v1',matrix,variants,coordinateProducts:observations.length*labels.length*384*3,
  scope:{goldUsed:false,policySelected:false,publication:false,liveChanged:false,representativeQuality:false}};
}
