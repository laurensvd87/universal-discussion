// Offline semantic metadata proposals. No query page, gold, model or IO here.
import {createHash} from 'node:crypto';
const need=value=>{if(!value)throw new TypeError('Invalid subject-kind proposal');};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const label=value=>typeof value==='string'&&value.length>0&&value.length<=64&&value.isWellFormed()&&!/[\u0000-\u001f\u007f]/u.test(value);
function subjects(input){
 need(Array.isArray(input)&&input.length>0&&input.length<=64);const seen=new Set();
 return input.map(row=>{
  need(exact(row,['nodeId','label','path'])&&/^[a-f0-9]{64}$/u.test(row.nodeId)&&!seen.has(row.nodeId)&&label(row.label)&&
   Array.isArray(row.path)&&row.path.length>0&&row.path.length<=8&&row.path.every(label)&&row.path.at(-1)===row.label);
  seen.add(row.nodeId);return{nodeId:row.nodeId,label:row.label,path:[...row.path]};
 });
}
export function buildSubjectKindQuestion(nodes){
 const rows=subjects(nodes),data=Object.fromEntries(rows.map((row,i)=>['M'+i,row.path]));
 const question='[Murmingle public subject kinds] @AI Use ONLY these public topic paths, ignoring the attached recipe article. Classify each terminal topic meaning: common-class = an ordinary kind/group, such as a biological group or kind of dish; named-entity = a particular named person, group, software, programming language, product, work or version. Class membership is broader than identity. Use unknown if uncertain. Keep the meaning specified by its ancestry. Return ONLY JSON mapping EVERY M-ID to exactly common-class/named-entity/unknown. Paths: '+JSON.stringify(data);
 need(question.length<=2000);return question;
}
export function parseSubjectKinds(nodes,body){
 const rows=subjects(nodes);need(typeof body==='string'&&body.length>0&&body.length<=4096);
 const parsed=JSON.parse(body),ids=rows.map((_,i)=>'M'+i);
 need(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Object.keys(parsed).sort().join(',')===[...ids].sort().join(','));
 const keys=[...body.matchAll(/"(M[0-9]+)"\s*:/gu)].map(match=>match[1]);
 need(keys.length===ids.length&&new Set(keys).size===ids.length&&keys.every(id=>ids.includes(id)));
 const kinds=rows.map((row,i)=>{const kind=parsed['M'+i];need(['common-class','named-entity','unknown'].includes(kind));return Object.freeze({nodeId:row.nodeId,kind});});
 return Object.freeze({schema:'semantic-subject-kinds/v1',subjectsHash:hash(rows),rows:Object.freeze(kinds),
  scope:Object.freeze({proposalOnly:true,semanticTruthProven:false,identityProven:false,publication:false,assignmentAuthority:false})});
}
export function readSubjectKindsForBank(bank,proposal){
 need(bank?.schema==='cached-semantic-topic-bank/v1'&&Array.isArray(bank.nodes)&&bank.nodes.length<=512&&proposal?.schema==='semantic-subject-kinds/v1');
 const byId=new Map(bank.nodes.map(node=>[node.id,node]));
 const rows=subjects(bank.nodes.filter(node=>node.kind==='subject').map(node=>({nodeId:node.id,label:node.label,path:node.path.map(id=>byId.get(id)?.label)})));
 need(proposal.subjectsHash===hash(rows)&&Array.isArray(proposal.rows)&&proposal.rows.length===rows.length);
 const raw=Object.fromEntries(proposal.rows.map((row,i)=>{need(exact(row,['nodeId','kind'])&&row.nodeId===rows[i].nodeId);return['M'+i,row.kind];}));
 return new Map(parseSubjectKinds(rows,JSON.stringify(raw)).rows.map(row=>[row.nodeId,row.kind]));
}
