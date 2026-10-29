// Ordinary SQL ports. No IO at import, schema installation or model execution.
// Feed references retain each root's original canonical reply destination.
import {types} from 'node:util';
import {ServiceError} from '../../src/domain/errors.js';
import {readId,readText,frozenClone} from '../../src/domain/validation.js';

const invalid=()=>{throw new TypeError('Invalid semantic discussion input');};
const corrupt=()=>{throw new ServiceError('storage-corrupt','Invalid semantic discussion result');};
function record(value,keys){
 if(!value||typeof value!=='object'||types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==keys.length)invalid();
 const out={};for(const key of keys){const d=Object.getOwnPropertyDescriptor(value,key);if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();out[key]=d.value;}return out;
}
function array(value,max){
 if(types.isProxy(value)||!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)invalid();
 const n=Object.getOwnPropertyDescriptor(value,'length').value;if(n>max||Reflect.ownKeys(value).length!==n+1)invalid();
 return Array.from({length:n},(_,i)=>{const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d?.enumerable||!Object.hasOwn(d,'value'))invalid();return d.value;});
}
function depth(value){if(!Number.isInteger(value)||value<1||value>8)invalid();return value;}
function revision(value){if(!Number.isSafeInteger(value)||value<0)invalid();return value;}
function node(value){const out=readText(value,160);if(out!==value)invalid();return out;}
function ordinal(value){if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,18})$/u.test(value)||BigInt(value)>9223372036854775807n)invalid();return value;}
function overrides(value){const seen=new Set();return array(value,512).map(item=>{
 const r=record(item,['nodeId','maxDepth']);node(r.nodeId);depth(r.maxDepth);if(seen.has(r.nodeId))invalid();seen.add(r.nodeId);return r;
}).sort((x,y)=>x.nodeId<y.nodeId?-1:x.nodeId>y.nodeId?1:0);}
function storage(error){
 if(error instanceof ServiceError)return error;
 if(['P1221','P1001','40001','23505'].includes(error?.code))return new ServiceError('conflict','Semantic discussion state changed');
 if(error?.code==='P1223')return new ServiceError('invalid','Invalid semantic discussion request');
 if(error?.code==='P1224')return new ServiceError('storage-corrupt','Invalid semantic discussion state');
 return new ServiceError('storage-failure','Semantic discussion operation failed');
}

export function createCanonicalV4SemanticDiscussionRepository({database,combinedHierarchy=false}={}){
 if(!database||typeof database.query!=='function'||typeof combinedHierarchy!=='boolean')invalid();
 return Object.freeze({
  async ownerPolicy(){
   try{const {rows}=await database.query('SELECT * FROM canonical_v4.semantic_read_owner_policy()');
    if(rows.length!==1)corrupt();let result;
    try{const row=rows[0],text=ordinal(row.revision),value=Number(text);revision(value);
     result={revision:value,defaultMaxDepth:depth(row.default_max_depth),overrides:overrides(row.overrides)};
    }catch{corrupt();}return frozenClone(result);
   }catch(error){throw storage(error);}
  },
  // Requires an owner-role database. The app/worker/submitter SQL grants do not
  // permit this call; exposing this method does not create an admin endpoint.
  async setOwnerPolicy(value){
   const a=record(value,['expectedRevision','defaultMaxDepth','overrides']);revision(a.expectedRevision);depth(a.defaultMaxDepth);
   const rules=overrides(a.overrides);
   try{const {rows}=await database.query('SELECT canonical_v4.semantic_set_owner_policy($1,$2,$3::jsonb) AS revision',
    [a.expectedRevision,a.defaultMaxDepth,JSON.stringify(rules)]);
    if(rows.length!==1)corrupt();let next;
    try{next=Number(ordinal(rows[0].revision));revision(next);}catch{corrupt();}
    if(next!==a.expectedRevision+1)corrupt();
    return frozenClone({revision:next,defaultMaxDepth:a.defaultMaxDepth,overrides:rules});
   }catch(error){throw storage(error);}
  },
  async feedReferences(value){
   const a=record(value,['generation','nodeId','beforeOrdinal','limit']);readId(a.generation);node(a.nodeId);
   if(a.beforeOrdinal!==null)ordinal(a.beforeOrdinal);
   if(!Number.isInteger(a.limit)||a.limit<1||a.limit>100)invalid();
   try{const {rows}=await database.query(combinedHierarchy?'SELECT * FROM canonical_v4.combined_read_fixed_feed($1,$2,$3::bigint,$4)':'SELECT * FROM canonical_v4.semantic_read_feed($1,$2,$3::bigint,$4)',
    [a.generation,a.nodeId,a.beforeOrdinal,a.limit]);
    if(!Array.isArray(rows)||rows.length>a.limit)corrupt();const seen=new Set();let previous=a.beforeOrdinal;
    const references=rows.map(row=>{let ref;
     try{ref={rootId:readId(row.root_id),discussionId:readId(row.discussion_id),topicId:readId(row.topic_id),ordinal:ordinal(row.root_ordinal)};}
     catch{corrupt();}
     if(row.generation!==a.generation||seen.has(ref.rootId)||(previous!==null&&BigInt(ref.ordinal)>=BigInt(previous)))corrupt();
     seen.add(ref.rootId);previous=ref.ordinal;return ref;
    });
    return frozenClone({generation:a.generation,nodeId:a.nodeId,references});
   }catch(error){throw storage(error);}
  },
 });
}
