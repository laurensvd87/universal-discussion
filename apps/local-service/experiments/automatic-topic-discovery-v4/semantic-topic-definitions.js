// Public graph definitions are cached proposals, not canonical authority.
// No holdout page, correct-answer dictionary, provider or IO enters this module.
import {createHash} from 'node:crypto';
import {buildCachedSemanticTopicBank} from './cached-semantic-topic-index.js';
const need=value=>{if(!value)throw new TypeError('Invalid semantic topic definitions');};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function graph(nodes) {
 need(Array.isArray(nodes)&&nodes.length>0&&nodes.length<=32);
 const seen=new Set();
 return nodes.map(node=>{
  need(node&&Object.keys(node).sort().join(',')==='id,label,parentId'&&/^[a-f0-9]{64}$/u.test(node.id)&&!seen.has(node.id)&&
   typeof node.label==='string'&&node.label.length>0&&node.label.length<=64&&node.label.isWellFormed()&&!/[\u0000-\u001f\u007f]/u.test(node.label)&&
   (node.parentId===null||seen.has(node.parentId)));seen.add(node.id);
  return {id:node.id,label:node.label,parentId:node.parentId};
 });
}
export function buildTopicDefinitionQuestion(nodes) {
 const ordered=graph(nodes),short=new Map(ordered.map((node,i)=>[node.id,'N'+i]));
 const data=Object.fromEntries(ordered.map(node=>[short.get(node.id),[node.label,node.parentId===null?null:short.get(node.parentId)]]));
 const question='[Murmingle public topic definitions] @AI Use only this proposed public topic tree, ignoring the attached recipe article. Define each intended topic meaning (label,parent). Parents determine meaning. Domains and classes must remain broad, beyond their current children. Define the subject itself, not an article, website, publisher or tutorial format. Give a useful distinguishing English definition of 3+ words, at most90 characters. No examples, extra topics or aliases. Return ONLY JSON mapping EVERY node ID to its definition string. Tree: '+JSON.stringify(data);
 need(question.length<=2000);return question;
}
export function parseTopicDefinitions(nodes,body) {
 const ordered=graph(nodes);need(typeof body==='string'&&body.length>0&&body.length<=8192);
 const parsed=JSON.parse(body),ids=ordered.map((_,i)=>'N'+i);
 need(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&Object.keys(parsed).sort().join(',')===[...ids].sort().join(','));
 const keys=[...body.matchAll(/"(N[0-9]+)"\s*:/gu)].map(match=>match[1]);
 need(keys.length===ids.length&&new Set(keys).size===ids.length&&keys.every(id=>ids.includes(id)));
 const rows=ordered.map((node,i)=>{
  const definition=parsed['N'+i];need(typeof definition==='string'&&definition.trim()===definition&&definition.length>=8&&definition.length<=90&&
   definition.isWellFormed()&&!/[\u0000-\u001f\u007f]/u.test(definition)&&definition.split(/\s+/u).length>=3);
  return {nodeId:node.id,definition};
 });
 return {schema:'semantic-topic-definitions/v1',graphHash:hash(ordered),rows,
  scope:{proposalOnly:true,semanticTruthProven:false,sourceGroundingVerified:false,publication:false,assignmentAuthority:false}};
}
export function buildDefinedCachedSemanticTopicBank(graphJson,definitionsJson) {
 need(arguments.length===2&&typeof definitionsJson==='string'&&definitionsJson.length<=16384);
 const bank=buildCachedSemanticTopicBank(graphJson),definitions=JSON.parse(definitionsJson),nodes=bank.nodes.map(({id,label,parentId})=>({id,label,parentId}));
 need(definitions?.schema==='semantic-topic-definitions/v1'&&definitions.graphHash===hash(graph(nodes))&&Array.isArray(definitions.rows)&&definitions.rows.length===nodes.length);
 // Reconstruct and run the same definition parser rather than trusting a stored
 // self-hash, a provider result's scope flags or arbitrary extra row fields.
 const raw=Object.fromEntries(definitions.rows.map((row,i)=>{
  need(row&&Object.keys(row).sort().join(',')==='definition,nodeId'&&row.nodeId===nodes[i].id);return ['N'+i,row.definition];
 }));
 const verified=parseTopicDefinitions(nodes,JSON.stringify(raw)),byId=new Map(verified.rows.map(row=>[row.nodeId,row.definition]));
 const compiled=bank.nodes.map(node=>Object.freeze({...node,descriptor:byId.get(node.id)+'. '+node.descriptor}));
 need(compiled.every(node=>node.descriptor.length<=2048));
 return Object.freeze({...bank,teacherHash:hash({graphTeacherHash:bank.teacherHash,definitionsHash:hash(verified)}),bankHash:hash(compiled),
  nodes:Object.freeze(compiled),definitionProvenance:Object.freeze({graphTeacherHash:bank.teacherHash,definitionsHash:hash(verified),
   providerAliasesUsed:false,queryGoldUsed:false,semanticTruthProven:false})});
}
