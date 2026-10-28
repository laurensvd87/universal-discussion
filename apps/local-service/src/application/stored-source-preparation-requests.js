// Public reads suggest urgency only. The worker retains material verification
// and publication authority. Closing waits the original SQL transactions.
import {readId,readRecord} from '../domain/validation.js';

export function createStoredSourcePreparationRequests({database,now=()=>performance.now()}={}){
 if(typeof database?.transaction!=='function'||typeof now!=='function')throw new TypeError('Invalid preparation request dependencies');
 const cache=new Map(),pending=new Set();let closed=false,closing=null;
 return Object.freeze({
  async request(value){
   const a=readRecord(value,['generation','sourceId']);readId(a.generation);readId(a.sourceId);
   if(closed)return false;
   const key=JSON.stringify([a.generation,a.sourceId]),time=now(),old=cache.get(key);
   if(old&&time<old.until)return old.work;
   if(pending.size>=8)return false;
   let original;
   try{original=Promise.resolve(database.transaction(async tx=>{
    await tx.query("SET LOCAL lock_timeout='25ms'");await tx.query("SET LOCAL statement_timeout='100ms'");
    const {rows}=await tx.query('SELECT canonical_v4.semantic_request_source_preparation($1,$2) AS requested',[a.generation,a.sourceId]);
    return rows?.length===1&&rows[0].requested===true;
   }));}catch{return false;}
   pending.add(original);
   const work=original.then(value=>!closed&&value===true,()=>false).finally(()=>pending.delete(original));
   cache.delete(key);cache.set(key,{until:time+1000,work});if(cache.size>512)cache.delete(cache.keys().next().value);
   return work;
  },
  close(){if(!closing){closed=true;cache.clear();closing=Promise.allSettled([...pending]).then(()=>undefined);}return closing;},
 });
}
