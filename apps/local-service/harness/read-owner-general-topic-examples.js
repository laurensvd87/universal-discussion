// Read only the two public non-Wikipedia URLs supplied by the owner. No posts,
// accounts, general browsing inventory, page text or external provider requests.
import {writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createPgDatabase} from '../portable/src/database.js';
import {createWindowsDpapiPasswordProvider} from '../portable/src/windows-dpapi-password.js';
const urls=['https://www.leukerecepten.nl/recepten/kapsalon-maken/','https://www.youtube.com/watch?v=rd5EWR83AGs'];
const sha=value=>createHash('sha256').update(value).digest('hex');
let database;
if(process.argv.length!==3||process.argv[2]!=='--read-specified-public-examples')throw Error('Explicit read-only public example snapshot required');
try{
 database=await createPgDatabase({config:{host:'127.0.0.1',port:55432,database:'murmingle_canonical',user:'murmingle_owner',
  password:await createWindowsDpapiPasswordProvider({role:'murmingle_owner'})(),ssl:false,max:1,application_name:'murmingle-specified-general-topic-examples',connectionTimeoutMillis:5000,idleTimeoutMillis:1000}});
 const snapshot=await database.transaction(async tx=>{
  await tx.exec('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');await tx.exec("SET LOCAL statement_timeout='5000ms'");await tx.exec("SET LOCAL lock_timeout='250ms'");await tx.exec("SET LOCAL idle_in_transaction_session_timeout='10000ms'");
  const identity=(await tx.query("SELECT current_database() database,current_user role,host(inet_server_addr()) address,inet_server_port() port,current_setting('transaction_read_only') read_only")).rows[0];
  if(identity?.database!=='murmingle_canonical'||identity.role!=='murmingle_owner'||identity.address!=='127.0.0.1'||identity.port!==55432||identity.read_only!=='on')throw Error('Read-only identity mismatch');
  const {rows}=await tx.query(`SELECT s.id,s.url,s.title,s.extractor_version,s.write_version::text source_version,
   r.operation_id,r.operation_digest,st.stamp,st.postable,e.model_id,e.dimensions,e.values_double body_vector,
   h.matcher_hash,o.generation,i.supported_path,i.title_values title_vector
   FROM canonical_v4.sources s JOIN canonical_v4.embeddings e ON e.source_id=s.id
   JOIN canonical_v4.operation_receipts r ON r.source_id=s.id AND r.operation_id=s.operation_id
   JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id
   CROSS JOIN canonical_v4.semantic_installation h
   LEFT JOIN canonical_v4.semantic_observations o ON o.source_id=s.id AND o.source_version=s.write_version AND o.matcher_hash=h.matcher_hash
   LEFT JOIN canonical_v4.semantic_inputs i ON i.source_id=s.id AND i.operation_digest=r.operation_digest AND i.matcher_hash=h.matcher_hash
   WHERE s.url=ANY($1::text[]) AND s.provenance='owner-local-page-embedding/v1' AND e.model_id='e5-small-q8-browser-main-prefix-v1'
    AND e.dimensions=384 AND h.singleton ORDER BY s.id LIMIT 3`,[urls]);
  return rows;
 });
 if(snapshot.length>2||new Set(snapshot.map(r=>r.url)).size!==snapshot.length)throw Error('Ambiguous specified examples');
 for(const row of snapshot)for(const key of ['body_vector','title_vector'])if(row[key]!==null&&(!Array.isArray(row[key])||row[key].length!==384||row[key].some(n=>!Number.isFinite(n))||Math.abs(Math.hypot(...row[key])-1)>1e-5))throw Error('Invalid stored example vector');
 await database.close();database=null;
 const value={schema:'specified-general-topic-example-snapshot/v1',utc:new Date().toISOString(),source:'existing protected Source metadata and vectors, not a fresh page capture',requestedUrls:urls,rows:snapshot,
  missing:urls.filter(u=>!snapshot.some(r=>r.url===u)),readOnly:true,liveChanged:false,providerUsed:false,nativeCaptureProven:false,independentValidation:false};
 const bytes=Buffer.from(JSON.stringify(value)+'\n');await writeFile(new URL('../data/general-topic-owner-examples-20261029.json',import.meta.url),bytes,{flag:'wx'});
 console.log(JSON.stringify({rows:snapshot.length,missing:value.missing.length,titles:snapshot.map(r=>r.title),storedTitleVectors:snapshot.filter(r=>r.title_vector!==null).length,sha256:sha(bytes)}));
}catch{console.error('Specified public general-topic examples unavailable.');process.exitCode=1;}
finally{if(database)try{await database.close();}catch{process.exitCode=1;}}
