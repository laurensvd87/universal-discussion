// Owner-local read-only dashboard. No application/crawler restart or migration.
// Uses the existing Windows-protected app credential; never prints it.
import {existsSync,openSync,closeSync,writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {randomUUID} from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {createPgDatabase} from '../../local-service/portable/src/database.js';
import {createWindowsDpapiPasswordProvider} from '../../local-service/portable/src/windows-dpapi-password.js';
import {createPostgresDashboardSource} from './data/postgres-catalog.js';
import {generatePostgresDashboard,generatePostgresDashboardSnapshot,readPostgresDashboardRefreshKey,startPostgresDashboardGrowthSampler,DEFAULT_REPORT_PATH} from './cli.js';
const data=fileURLToPath(new URL('../../local-service/data/',import.meta.url)),growthPath=path.join(data,'topic-growth-v2.sqlite');
const lockPath=path.join(data,'dashboard-topic-counts-watcher.json'),stopPath=path.join(data,'dashboard-topic-counts.stop');
const mode=process.argv[2];if(process.argv.length!==3||!['--once','--watch'].includes(mode))throw Error('Use --once or --watch');
let database=null,sampler=null,lock=null,timer=null,stopping=false,inFlight=Promise.resolve(),shutdown=null;
const nonce=randomUUID();
function releaseLock(){if(lock!==null){closeSync(lock);lock=null;const value=JSON.parse(readFileSync(lockPath,'utf8'));if(value.nonce===nonce)unlinkSync(lockPath);}}
async function close(){if(!shutdown){stopping=true;if(timer)clearTimeout(timer);shutdown=(async()=>{await Promise.allSettled([inFlight]);
 const closed=await Promise.allSettled([sampler?sampler.close():Promise.resolve(),database?database.close():Promise.resolve()]);
 try{releaseLock();}finally{if(closed.some(r=>r.status==='rejected'))throw Error('Dashboard close failed');}
})();}return shutdown;}
try{
 if(mode==='--watch'){if(existsSync(stopPath))throw Error('Dashboard stop marker present');lock=openSync(lockPath,'wx');writeFileSync(lock,JSON.stringify({pid:process.pid,nonce,startedAt:new Date().toISOString()}));}
 const password=createWindowsDpapiPasswordProvider({role:'murmingle_app'});
 database=await createPgDatabase({config:{host:'127.0.0.1',port:55432,database:'murmingle_canonical',user:'murmingle_app',password,max:mode==='--once'?1:2,
  connectionTimeoutMillis:3000,idleTimeoutMillis:5000,application_name:'murmingle-dashboard',options:'-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000'}});
 const source=createPostgresDashboardSource({database,schemaProfile:'hierarchy17'}),outputPath=mode==='--once'?path.join(data,'dashboard-topic-counts-preview','dashboard.html'):DEFAULT_REPORT_PATH;
 const options={source,growthPath,outputPath};let revision=await readPostgresDashboardRefreshKey(source,{growthPath});
 const result=await generatePostgresDashboard(options);
 console.log(JSON.stringify({status:'ready',pid:process.pid,outputPath,classified:result.counts.semantic.currentHeadClassifiedSources,pending:result.counts.semantic.currentHeadPendingSources,automaticDiscovery:'not-enabled'}));
 if(mode==='--once')await close();
 else{
  sampler=startPostgresDashboardGrowthSampler({source,growthPath,onOutcome:value=>{if(value.outcome==='failed')console.error('Dashboard growth sampling delayed.');}});
  const schedule=()=>{if(!stopping)timer=setTimeout(()=>{inFlight=tick();},1000);};
  async function tick(){try{
   if(existsSync(stopPath)){void close();return;}
   const next=await readPostgresDashboardRefreshKey(source,{growthPath});
   if(!stopping&&next!==revision){await generatePostgresDashboardSnapshot(options);revision=next;}
  }catch{console.error('Dashboard refresh delayed.');}finally{schedule();}}
  for(const signal of ['SIGINT','SIGTERM',...(process.platform==='win32'?['SIGBREAK']:[])])process.once(signal,()=>{void close().catch(()=>{process.exitCode=1;});});
  schedule();
 }
}catch{process.exitCode=1;console.error('Dashboard could not start; existing application and crawler are unchanged.');await close().catch(()=>{});}
