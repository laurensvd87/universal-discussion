// Experimental semantic relation proposal contract. No provider, IO, database,
// Source lookup or runtime activation. A valid graph is not proof of truth.
import {createHash} from 'node:crypto';
const need=v=>{if(!v)throw new TypeError('Invalid semantic relation proposal');};
const ID=/^[A-Za-z][A-Za-z0-9_-]{0,47}$/u,RELATIONS=new Set(['same','narrower','separate','unknown']);
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const text=v=>typeof v==='string'&&v.trim()===v&&v.length>0&&v.length<=120&&!/[\u0000-\u001f\u007f]/u.test(v)&&v.isWellFormed();
export function readRelationCandidates(input){
 need(exact(input,['nodes','pairs'])&&Array.isArray(input.nodes)&&input.nodes.length>0&&input.nodes.length<=32&&Array.isArray(input.pairs)&&input.pairs.length>0&&input.pairs.length<=32);
 const nodes=new Map(),pairs=new Set();
 for(const n of input.nodes){need(exact(n,['id','label','hint'])&&ID.test(n.id)&&!nodes.has(n.id)&&text(n.label)&&text(n.hint));nodes.set(n.id,n);}
 for(const p of input.pairs){need(exact(p,['id','a','b'])&&ID.test(p.id)&&!pairs.has(p.id)&&nodes.has(p.a)&&nodes.has(p.b)&&p.a!==p.b);pairs.add(p.id);}
 return {nodes:[...nodes.values()].map(n=>({...n})),pairs:input.pairs.map(p=>({...p}))};
}
export function buildRelationQuestion(input){
 const data=readRelationCandidates(input),compact={nodes:Object.fromEntries(data.nodes.map(n=>[n.id,[n.label,n.hint]])),pairs:Object.fromEntries(data.pairs.map(p=>[p.id,[p.a,p.b]]))};
 const prompt='[Murmingle synthetic hierarchy test] @AI Alle Beschreibungen sind erfundene, vollständige Testprämissen. Bewerte nur diese Angaben; keine Recherche. Antworte ausschließlich als JSON mit jeder Paar-ID und genau einem Code: same=derselbe Gegenstand, narrower=A ist ein spezifischeres Unterthema von B, separate=verschiedene Gegenstände ohne diese Elternbeziehung, unknown=Angaben reichen nicht. Gleiche Wörter allein beweisen nichts. '+JSON.stringify(compact);
 need(prompt.length<=2000);return prompt;
}
export function parseRelationProposal(input,body){
 const data=readRelationCandidates(input);need(typeof body==='string'&&body.length>0&&body.length<=4096);
 let answer;try{answer=JSON.parse(body.trim());}catch{need(false);}
 need(exact(answer,data.pairs.map(p=>p.id))&&Object.values(answer).every(r=>RELATIONS.has(r)));
 // String-valued flat JSON only; duplicate/escaped keys, nested keys and an
 // explanatory code fence cannot be silently accepted by JSON.parse.
 const entries=[...body.matchAll(/"([A-Za-z][A-Za-z0-9_-]{0,47})"\s*:/gu)].map(m=>m[1]);
 need(entries.length===data.pairs.length&&new Set(entries).size===entries.length&&entries.every(id=>Object.hasOwn(answer,id)));
 const parents=new Map(data.nodes.map(n=>[n.id,n.id]));
 const root=id=>{while(parents.get(id)!==id)id=parents.get(id);return id;};
 for(const p of data.pairs)if(answer[p.id]==='same'){const a=root(p.a),b=root(p.b);parents.set(a<b?b:a,a<b?a:b);}
 const edges=[],edgeKeys=new Set();
 for(const p of data.pairs){const a=root(p.a),b=root(p.b),relation=answer[p.id];
  if(relation==='separate')need(a!==b);
  if(relation==='narrower'){need(a!==b);const key=a+'\u001f'+b;if(!edgeKeys.has(key)){edgeKeys.add(key);edges.push({child:a,parent:b});}}
 }
 const byChild=new Map();for(const e of edges){if(!byChild.has(e.child))byChild.set(e.child,[]);byChild.get(e.child).push(e.parent);}
 function visit(id,path){need(!path.includes(id)&&path.length<8);for(const parent of byChild.get(id)??[])visit(parent,[...path,id]);}
 for(const n of data.nodes)visit(root(n.id),[]);
 const components=new Map();for(const n of data.nodes){const id=root(n.id);if(!components.has(id))components.set(id,[]);components.get(id).push(n.id);}
 return {schema:'semantic-relation-proposal/v1',requestHash:sha(data),relations:Object.fromEntries(data.pairs.map(p=>[p.id,answer[p.id]])),
  equivalences:[...components.values()].filter(m=>m.length>1).map(m=>m.sort()),edges,
  scope:{proposalOnly:true,semanticTruthProven:false,providerConsentGranted:false,sourceWitnessesVerified:false,assignmentAuthority:false,publication:false,liveChanged:false}};
}

// Hand-written fictitious premises, not derived from stored browsing titles,
// URLs, account details, Source identifiers or the45-page development cohort.
export const SYNTHETIC_RELATION_CANDIDATES=Object.freeze({nodes:Object.freeze([
 ['r1','Rivon','programming language'],['r2','Rivon','comedy troupe'],
 ['s1','Sola','river dolphin species'],['s2','Sola','computer file manager'],
 ['k','Koalas','animal species'],['a','Animals','all animal species'],['t','Trees','plants'],
 ['q2','Drift Quest II','second game in Drift Quest series'],['qs','Drift Quest','game series'],
 ['n1','Noro','battery brand founded by Mira'],['n2','Noro','same battery brand founded by Mira'],
 ['e1','Bridge update','Oak bridge closure on Oct4'],['e2','Bridge analysis','analysis of that Oak bridge closure on Oct4'],
 ['u','Luma','name only; no further information'],['p','Photography','making photographs'],
].map(([id,label,hint])=>Object.freeze({id,label,hint}))),pairs:Object.freeze([
 ['P1','r1','r2'],['P2','s1','s2'],['P3','k','a'],['P4','k','t'],['P5','q2','qs'],['P6','n1','n2'],['P7','e1','e2'],['P8','u','p'],
].map(([id,a,b])=>Object.freeze({id,a,b})))});
export const SYNTHETIC_RELATION_EXPECTED=Object.freeze({P1:'separate',P2:'separate',P3:'narrower',P4:'separate',P5:'narrower',P6:'same',P7:'same',P8:'unknown'});
