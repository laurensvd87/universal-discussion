// Execute-only background port. Construction performs no IO or registration.
import {ServiceError} from '../../src/domain/errors.js';
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(v);
const ordinal=v=>typeof v==='string'&&/^[1-9][0-9]{0,18}$/u.test(v)&&BigInt(v)<=9223372036854775807n;
const invalid=()=>{throw new TypeError('Invalid topic search work');};
function input(raw,extra=false){if(typeof raw!=='string'||Buffer.byteLength(raw)>512)invalid();let v;try{v=JSON.parse(raw);}catch{invalid();}
 if(!v||Object.getPrototypeOf(v)!==Object.prototype||Object.keys(v).length!==(extra?2:1)||!id(v.generation)||extra&&!ordinal(v.eventId)||!extra&&Object.keys(v)[0]!=='generation')invalid();return v;}
function result(r){if(!Array.isArray(r?.rows)||r.rows.length!==1||Object.keys(r.rows[0]).length!==1||!Object.hasOwn(r.rows[0],'result'))throw new ServiceError('storage-corrupt','Invalid topic search work result');return r.rows[0].result;}
function failure(e){if(e instanceof ServiceError)return e;return new ServiceError(['P1301','40001','23503','23505'].includes(e?.code)?'conflict':'storage-failure','Topic search maintenance unavailable');}
export function createUnifiedTopicSearchMaintenance({database}={}){
 if(!database||typeof database.query!=='function')invalid();
 return Object.freeze({
  async tasks(raw){const a=input(raw);try{const rows=result(await database.query('SELECT canonical_v4.unified_search_tasks($1) AS result',[a.generation]));
   if(!Array.isArray(rows)||rows.length>8||rows.some(v=>!ordinal(v))||new Set(rows).size!==rows.length)throw new ServiceError('storage-corrupt','Invalid topic search work result');return Object.freeze([...rows]);
  }catch(e){throw failure(e);}},
  async process(raw){const a=input(raw,true);try{const value=result(await database.query('SELECT canonical_v4.unified_process_search_event($1,$2::bigint) AS result',[a.generation,a.eventId]));
   if(!['completed','busy','retired'].includes(value))throw new ServiceError('storage-corrupt','Invalid topic search work result');return value;
  }catch(e){throw failure(e);}},
 });
}
