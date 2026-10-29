// Public provider metadata only. No Source inventory, inference, ancestry,
// membership or contribution routing. The draft SQL is not a registered profile.
import {createWikipediaEntitySubjectIndex} from '../../experiments/automatic-topic-discovery-v1/wiki-entity-subjects.js';

const invalid=()=>{throw new TypeError('Invalid public subject registry request');};
const languages=new Set(['en','de','nl']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const revision=/^[1-9][0-9]{0,15}$/u;
const freeze=v=>{if(v&&typeof v==='object'){for(const child of Object.values(v))freeze(child);Object.freeze(v);}return v;};

/** Provider validation is the same as the measured exact-identity resolver.
 * Content identity excludes the batch response hash: the same entity revision
 * can arrive in several differently ordered/subsetted public API responses. */
export function preparePublicWikipediaSubjects(rawJson){
 if(arguments.length!==1)invalid();
 const metadata=createWikipediaEntitySubjectIndex(rawJson).describe();
 if(!metadata.entityCount)invalid();
 return freeze({responseHash:metadata.snapshotHash,records:metadata.entities.map(e=>({
  providerKey:e.id,revision:e.revision,labels:e.labels,descriptions:e.descriptions,
  sitelinks:e.sitelinks.map(({site,title})=>({site,title})),
 }))});
}

/** A SELECT calling a protected owner-only routine is one physical transaction.
 * No transport-selected role/schema/function name, retry or implicit DDL. */
export function createPublicSubjectRegistry({database}={}){
 if(!database||typeof database.query!=='function')invalid();
 return Object.freeze({
  async importWikipedia(rawJson){
   if(arguments.length!==1)invalid();const request=preparePublicWikipediaSubjects(rawJson);
   const {rows}=await database.query('SELECT canonical_v4.subject_import_wikipedia($1,$2::jsonb) AS result',
    [request.responseHash,JSON.stringify(request.records)]);
   const result=rows?.[0]?.result;
   if(rows?.length!==1||!Array.isArray(result)||result.length!==request.records.length)invalid();
   const expected=new Map(request.records.map(r=>[r.providerKey,r.revision])),ids=new Set();
   for(const row of result){
    if(!row||Object.keys(row).sort().join(',')!=='providerKey,revision,subjectId'||!uuid.test(row.subjectId)||
       expected.get(row.providerKey)!==row.revision||!revision.test(row.revision)||ids.has(row.subjectId))invalid();
    expected.delete(row.providerKey);ids.add(row.subjectId);
   }
   if(expected.size)invalid();return freeze(result);
  },
  async byWikipediaTitle(site,title,language='en'){
   if(arguments.length<2||arguments.length>3||!['enwiki','dewiki','nlwiki'].includes(site)||!languages.has(language)||
      typeof title!=='string'||title.length<1||title.length>200||title!==title.trim()||!title.isWellFormed()||
      title!==title.normalize('NFC')||/[\u0000-\u001f\u007f-\u009f]/u.test(title))invalid();
   const {rows}=await database.query('SELECT canonical_v4.subject_read_wikipedia($1,$2,$3) AS result',[site,title,language]);
   if(rows?.length!==1)invalid();const row=rows[0].result;if(row===null)return null;
   if(!row||Object.keys(row).sort().join(',')!=='articleTitle,description,descriptionLanguage,label,labelLanguage,providerKey,revision,subjectId'||
      !uuid.test(row.subjectId)||!/^Q[1-9][0-9]{0,10}$/u.test(row.providerKey)||!revision.test(row.revision)||
      row.articleTitle!==title||typeof row.label!=='string'||!row.label||row.label.length>200||
      ![null,'en','de','nl','mul'].includes(row.labelLanguage)||
      ![null,'en','de','nl'].includes(row.descriptionLanguage)||
      row.description!==null&&(typeof row.description!=='string'||row.description.length>400))invalid();
   return freeze(row);
  },
 });
}
