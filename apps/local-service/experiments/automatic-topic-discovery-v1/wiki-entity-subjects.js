// Cached PUBLIC entity metadata only. No fetch, owner inventory, model, database,
// taxonomy traversal or Source/posting authority. Exact sitelinks, never labels,
// establish this provider's subject identity across Wikipedia languages.
import {createHash} from 'node:crypto';
const LANGS=['en','de','nl'],LABEL_LANGS=[...LANGS,'mul'],Q=/^Q[1-9][0-9]{0,10}$/u;
const bad=()=>{throw new TypeError('Invalid public entity metadata');};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;};
const text=(v,max)=>typeof v==='string'&&v.isWellFormed()&&v.trim()===v&&v.length>0&&v.length<=max&&!/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u.test(v);
function languageMap(v,descriptions=false){
 if(v===undefined)return {};if(!object(v))bad();const out={};
 for(const language of descriptions?LANGS:LABEL_LANGS)if(Object.hasOwn(v,language)){
  const item=v[language];if(!object(item)||item.language!==language||!text(item.value,descriptions?400:200))bad();out[language]=item.value;
 }return out;
}
function normalizedTitle(v){if(!text(v,200))return null;const t=v.replaceAll('_',' ').normalize('NFC');return text(t,200)?t:null;}
function wikipediaKey(value){
 if(typeof value!=='string'||value.length>2048||!value.isWellFormed())return null;
 try{
  const u=new URL(value);if(u.protocol!=='https:'||u.href!==value||u.username||u.password||u.port||u.search||u.hash||!u.pathname.startsWith('/wiki/'))return null;
  const language=LANGS.find(l=>u.hostname===l+'.wikipedia.org');if(!language)return null;
  const title=normalizedTitle(decodeURIComponent(u.pathname.slice(6)));return title?{key:language+'wiki\0'+title,language,title}:null;
 }catch{return null;}
}

export function createWikipediaEntitySubjectIndex(rawJson){
 if(arguments.length!==1||typeof rawJson!=='string'||Buffer.byteLength(rawJson,'utf8')>1048576)bad();let response;
 try{response=JSON.parse(rawJson);}catch{bad();}
 if(!object(response)||Object.hasOwn(response,'error')||!object(response.entities)||Object.keys(response.entities).length>64||Object.hasOwn(response,'redirects'))bad();
 const entities=[],unavailable=[],bySite=new Map();
 for(const [id,item]of Object.entries(response.entities)){
  if(!Q.test(id)||!object(item))bad();
  if(Object.hasOwn(item,'missing')){unavailable.push({id,reason:'missing-entity'});continue;}
  if(item.id!==id||item.type!=='item'||!Number.isSafeInteger(item.lastrevid)||item.lastrevid<1||Object.hasOwn(item,'redirect'))bad();
  const labels=languageMap(item.labels),descriptions=languageMap(item.descriptions,true),links=[];
  if(!object(item.sitelinks))bad();
  for(const language of LANGS){
   const site=language+'wiki';if(!Object.hasOwn(item.sitelinks,site))continue;const v=item.sitelinks[site];
   if(!object(v)||v.site!==site)bad();const title=normalizedTitle(v.title);if(!title)bad();
   const key=site+'\0'+title;if(bySite.has(key))bad();
   const link=freeze({site,language,title,url:'https://'+language+'.wikipedia.org/wiki/'+encodeURIComponent(title.replaceAll(' ','_'))});
   links.push(link);bySite.set(key,{id,link});
  }
  entities.push(freeze({entityKey:'wikidata:'+id,id,revision:String(item.lastrevid),labels,descriptions,sitelinks:links}));
 }
 const byId=new Map(entities.map(e=>[e.id,e])),snapshotHash=createHash('sha256').update(rawJson).digest('hex');
 const metadata=freeze({schema:'public-wikipedia-entity-subject-index/v1',snapshotHash,provider:'wikidata',entities,unavailable,
  entityCount:entities.length,sitelinkCount:bySite.size,assignmentAuthority:false,registryChanged:false,
  parentRelationsImported:false,scope:'Exact declared public sitelink identity only; not native Source attestation, general-page entity linking, taxonomy ancestry or permission to post.'});
 return Object.freeze({
  describe(){return metadata;},
  resolve(sourceUrl,displayLanguage='en'){
   if(arguments.length<1||arguments.length>2||typeof sourceUrl!=='string'||typeof displayLanguage!=='string'||!LANGS.includes(displayLanguage))bad();
   const page=wikipediaKey(sourceUrl),entry=page?bySite.get(page.key):null;
   if(!entry)return freeze({status:'unresolved',reason:page?'missing-sitelink':'unsupported-url',sourceUrl,
    entityKey:null,snapshotHash,assignmentAuthority:false});
   const e=byId.get(entry.id),labelLanguage=[displayLanguage,'mul','en',page.language].find(l=>e.labels[l]!==undefined)??null;
   const descriptionLanguage=[displayLanguage,'en',page.language].find(l=>e.descriptions[l]!==undefined)??null;
   return freeze({status:'resolved',reason:'exact-public-sitelink',sourceUrl,entityKey:e.entityKey,entityRevision:e.revision,
    label:labelLanguage?e.labels[labelLanguage]:entry.link.title,labelLanguage,
    description:descriptionLanguage?e.descriptions[descriptionLanguage]:null,descriptionLanguage,
    articleTitle:entry.link.title,site:entry.link.site,snapshotHash,assignmentAuthority:false});
  },
 });
}
