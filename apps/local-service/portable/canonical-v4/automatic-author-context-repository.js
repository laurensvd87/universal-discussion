// Inert ordinary SQL adapter. Registration and live startup are deliberately
// outside this draft component. No new model, capture or canonical retargeting.
import {createHash,randomUUID} from 'node:crypto';
import {isAccountActor} from '../../src/accounts/account-principal.js';
import {ServiceError} from '../../src/domain/errors.js';
import {readRecord,readId,readText,readBody,readExpectedVersion,frozenClone} from '../../src/domain/validation.js';
import {prepareCanonicalV4LifecycleCommand} from './lifecycle-repository.js';

const invalid=()=>{throw new ServiceError('invalid','Invalid authored topic context');};
const corrupt=()=>{throw new ServiceError('storage-corrupt','Invalid authored topic result');};
const sha=value=>createHash('sha256').update(value).digest('hex');
function parsed(raw,max=65536){if(typeof raw!=='string'||Buffer.byteLength(raw)>max)invalid();try{return JSON.parse(raw);}catch{invalid();}}
function scope(value,{material=true}={}){
 const s=readRecord(value,material?['kind','id','caption','sourceId','materialDigest']:['kind','id','caption']);
 if(!['page','named','semantic'].includes(s.kind))invalid();
 if(s.kind==='semantic'){if(readText(s.id,160)!==s.id||/^(subject|page|legacy)-/u.test(s.id))invalid();}else readId(s.id);readText(s.caption,200);
 if(s.kind==='named'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(s.id))invalid();
 if(material){readId(s.sourceId);if(typeof s.materialDigest!=='string'||!/^[a-f0-9]{64}$/u.test(s.materialDigest)||s.kind==='page'&&s.id!==s.sourceId)invalid();}
 return s;
}
function value(raw){if(!Array.isArray(raw?.rows)||raw.rows.length!==1)corrupt();return readRecord(raw.rows[0],['result']).result;}
function failure(error){
 if(error instanceof ServiceError)return error;
 if(['P1291','P1001','40001','23505','23503'].includes(error?.code))return new ServiceError('conflict','The selected topic changed; your draft remains available');
 if(['P1293','P1003'].includes(error?.code))return new ServiceError('invalid','Invalid authored topic context');
 if(error?.code==='P1002')return new ServiceError('not-found','Original discussion unavailable');
 if(error?.code==='P1004')return new ServiceError('storage-corrupt','Invalid original discussion state');
 if(error?.code==='P1006')return new ServiceError('forbidden','Action unavailable');
 return new ServiceError('storage-failure','Authored topic storage unavailable');
}
export function createAutomaticAuthorContextRepository({database,nextId=()=>`contribution-${randomUUID()}`,now=()=>new Date().toISOString(),ownerGrouping=false,combinedHierarchy=false}={}){
 if(!database||typeof database.query!=='function'||typeof nextId!=='function'||typeof now!=='function'||typeof ownerGrouping!=='boolean'||typeof combinedHierarchy!=='boolean'||combinedHierarchy&&!ownerGrouping)throw new TypeError('Invalid authored topic dependencies');
 return Object.freeze({
  async editor(rawJson){
   const a=readRecord(parsed(rawJson,1024),['generation','sourceId']);readId(a.generation);readId(a.sourceId);
   try{const r=value(await database.query(combinedHierarchy?'SELECT canonical_v4.combined_read_editor($1,$2) AS result':ownerGrouping?'SELECT canonical_v4.named_read_grouped_editor($1,$2) AS result':'SELECT canonical_v4.named_read_editor($1,$2) AS result',[a.generation,a.sourceId]));
    if(r===null)return null;
    try{const v=readRecord(r,['generation','topicId','pageScope','scope']);if(v.generation!==a.generation)corrupt();readId(v.topicId);
     const s=scope(v.scope),page=scope(v.pageScope);if(s.sourceId!==a.sourceId||page.kind!=='page'||page.sourceId!==a.sourceId||page.materialDigest!==s.materialDigest)corrupt();
     return frozenClone({...v,scope:s,pageScope:page});
    }catch{corrupt();}
   }catch(error){throw failure(error);}
  },
  async appendRoot(rawJson){
   const a=readRecord(parsed(rawJson),['actorId','requestId','expected','command','scope']);
   readId(a.actorId);readId(a.requestId);if(!isAccountActor(a.actorId)&&!['demo-alex','demo-blair'].includes(a.actorId))invalid();
   const expected=readExpectedVersion(a.expected),c=readRecord(a.command,['type','topicId','body','originSourceId']);
   if(c.type!=='create-root')invalid();readId(c.topicId);readBody(c.body);readId(c.originSourceId);
   const s=scope(a.scope);if(s.sourceId!==c.originSourceId)invalid();
   const command={type:c.type,topicId:c.topicId,body:c.body,originSourceId:c.originSourceId};
   const material=JSON.stringify({generation:expected.generation,command});
   if(Buffer.byteLength(material)>32768)invalid();
   const parameters=[a.actorId,a.requestId,sha(material),material,expected.generation,c.topicId,c.body,c.originSourceId,
    readId(nextId()),readText(now(),64),JSON.stringify(s)];
   try{const r=value(await database.query('SELECT canonical_v4.named_append_root($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) AS result',parameters));
    try{const out=readRecord(JSON.parse(r),['version','discussionVersion','result']),version=readExpectedVersion(out.version),result=readRecord(out.result,['contributionId']);
     if(version.generation!==expected.generation||!Number.isSafeInteger(out.discussionVersion)||out.discussionVersion<1)corrupt();
     readId(result.contributionId);return frozenClone({...out,version,result});
    }catch{corrupt();}
   }catch(error){throw failure(error);}
  },
  async root(rawJson){
   const a=readRecord(parsed(rawJson,1024),['generation','rootId']);readId(a.generation);readId(a.rootId);
   try{const r=value(await database.query('SELECT canonical_v4.named_read_root_context($1,$2) AS result',[a.generation,a.rootId]));
    if(r===null)return null;
    try{const v=readRecord(r,['rootId','discussionId','topicId','scope']);readId(v.discussionId);readId(v.topicId);if(v.rootId!==a.rootId)corrupt();
     return frozenClone({...v,scope:scope(v.scope,{material:false})});
    }catch{corrupt();}
   }catch(error){throw failure(error);}
  },
  async shareInsight(rawJson){
   const a=readRecord(parsed(rawJson,131072),['expected','command','actor','proof','scope']),s=scope(a.scope);
   if(a.command?.type!=='share-insight'||a.command.originSourceId!==s.sourceId)invalid();
   const request=prepareCanonicalV4LifecycleCommand(a.expected,a.command,a.actor,a.proof,{nextId,now});
   if(Buffer.byteLength(request.parameters[3])>32768||Buffer.byteLength(request.parameters[17])>65536)invalid();
   try{const raw=await database.query('SELECT canonical_v4.named_share_insight($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb) AS result',
     [...request.parameters,JSON.stringify(s)]);
    try{const r=readRecord(JSON.parse(value(raw)),['version','result']),version=readExpectedVersion(r.version),result=readRecord(r.result,['contributionId']);
     if(version.generation!==request.expected.generation)corrupt();readId(result.contributionId);return frozenClone({version,result});
    }catch{corrupt();}
   }catch(error){throw failure(error);}
  },
  async scopeCurrent(rawJson){
   const a=readRecord(parsed(rawJson,4096),['generation','topicId','scope']);readId(a.generation);readId(a.topicId);const s=scope(a.scope);
   try{const r=value(await database.query('SELECT canonical_v4.named_check_editor_scope($1,$2,$3::jsonb) AS result',[a.generation,a.topicId,JSON.stringify(s)]));
    if(typeof r!=='boolean')corrupt();return r;
   }catch(error){throw failure(error);}
  },
 });
}
