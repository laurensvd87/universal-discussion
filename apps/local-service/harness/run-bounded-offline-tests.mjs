// Run each offline suite file in a fresh, sequential process. This avoids
// accumulating unrelated fixture working sets on memory-constrained hosts.
// Portable AND dashboard fixtures use PGlite: run these suites sequentially,
// not beside one another on a host with a small committed-memory reserve.
import {readdirSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
if(!process.argv.includes('--run')) {
  process.stdout.write('No action. Use --run for sequential offline backend tests.\n');
} else {
  const suite=process.argv.find(arg=>arg.startsWith('--suite='))?.slice(8)??'backend';
  if(!['backend','portable','dashboard'].includes(suite))throw new Error('Invalid suite');
  const suiteRoot=suite==='portable'?path.join(root,'portable'):suite==='dashboard'?path.resolve(root,'..','topic-dashboard'):root;
  const guard=suite==='portable'?'../../../spikes/topic-resolution/harness/deny-external-capabilities.js':'../../spikes/topic-resolution/harness/deny-external-capabilities.js';
  // Portable fixtures have no Node worker-thread factories. Backend real-worker
  // tests deliberately retain normal flags (their explicit execArgv rejects
  // these V8 flags); each backend file still exits before the next starts.
  const memoryFlags=suite==='backend'?[]:['--max-old-space-size=512','--max-semi-space-size=8'];
  const filter=process.argv.find(arg=>arg.startsWith('--match='))?.slice(8);
  const files=readdirSync(path.join(suiteRoot,'test')).filter(name=>name.endsWith('.test.js')&&(!filter||new RegExp(filter,'u').test(name))).sort();
  if(!files.length)throw new Error('No tests selected');
  const output=path.join(root,'data','bounded-offline-test-results',suite);mkdirSync(output,{recursive:true});
  const total={suite,files:files.length,pass:0,fail:0,skipped:0,failedFiles:[]};
  for(const name of files){
    const run=spawnSync(process.execPath,[...memoryFlags,'--import',guard,'--test','--test-isolation=none',path.join('test',name)],{
      cwd:suiteRoot,windowsHide:true,encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024,
    });
    const log=(run.stdout??'')+(run.stderr??'');
    writeFileSync(path.join(output,name+'.log'),log,{encoding:'utf8'});
    for(const field of ['pass','fail','skipped'])total[field]+=Number(log.match(new RegExp('(?:ℹ |# )'+field+' (\\d+)','u'))?.[1]??0);
    if(run.status!==0||run.error){total.failedFiles.push(name);process.stdout.write(JSON.stringify({file:name,status:'failed',code:run.error?.code??run.status})+'\n'+log.slice(-6000)+'\n');}
    else process.stdout.write(JSON.stringify({file:name,status:'passed'})+'\n');
  }
  process.stdout.write(JSON.stringify(total)+'\n');
  if(total.failedFiles.length)process.exitCode=1;
}
