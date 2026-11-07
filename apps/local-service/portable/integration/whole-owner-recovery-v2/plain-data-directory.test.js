import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
import {createPlainDataDirectory} from './plain-data-directory.js';import {PRIVATE_RUN_ROOT} from './private-owner-storage.js';
import {createFileOps} from './hierarchy-native-cluster.js';
const fixed=path.win32.join(PRIVATE_RUN_ROOT,'run-'+'a'.repeat(48),'cluster','nhpg-ABC123','pgdata');
test('only new exact C pgdata scope is sent to the fixed bounded utility',async()=>{
 const calls=[],prepare=createPlainDataDirectory({now:()=>1,utility:async(...args)=>{calls.push(args);return 'plain-owned-pgdata-ok';}});
 for(const name of ['D:\\live\\pgdata',PRIVATE_RUN_ROOT,fixed+'\\other',fixed.replace('run-','run-..'),fixed.replace('pgdata','pgdata\\..\\pgdata')])await assert.rejects(prepare(name,100),{code:'PLAIN_STORAGE'});
 assert.equal(calls.length,0);assert.equal(await prepare(fixed,100),true);assert.equal(calls.length,1);
 const [exe,args,options]=calls[0];assert.equal(exe,'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');assert.equal(options.deadline,100);assert.deepEqual(JSON.parse(options.input),{dataDirectory:fixed});
 const script=Buffer.from(args.at(-1),'base64').toString('utf16le');assert.match(script,/Get-ChildItem/);assert.match(script,/0x9C040/);assert.match(script,/GetAccessRules/);assert.match(script,/ushort set=0,got/);assert.match(script,/if\(got!=0\|\|count!=2/);assert.doesNotMatch(script,/ushort set=1/);
});
test('failed or late physical preparation never becomes a successful initdb prerequisite',async()=>{
 let time=0;const rejected=createPlainDataDirectory({now:()=>time,utility:async()=>''});await assert.rejects(rejected(fixed,10),{code:'PLAIN_STORAGE'});
 const late=createPlainDataDirectory({now:()=>time,utility:async()=>{time=11;return 'plain-owned-pgdata-ok';}});await assert.rejects(late(fixed,10),{code:'PLAIN_STORAGE'});
 let called=false;const expired=createPlainDataDirectory({now:()=>11,utility:async()=>{called=true;}});await assert.rejects(expired(fixed,10));assert.equal(called,false);
});
test('real filesystem orchestration cannot hand PGDATA to initdb or publish ownership before formatNONE readback settles',async()=>{
 for(const accepted of [true,false]){
  let release,settled=false;const gate=new Promise(resolve=>{release=resolve;}),events=[];
  const parent=PRIVATE_RUN_ROOT+'\\run-'+'a'.repeat(48)+'\\cluster';
  const fs={async lstat(){return {isDirectory:()=>true,isSymbolicLink:()=>false};},async realpath(p){return p;},
   async mkdir(p){events.push(p.endsWith('pgdata')?'mkdir-pgdata':'mkdir-cluster');},async readdir(){return [];},
   async mkdtemp(prefix){return prefix+'ABC123';},async open(){return{async writeFile(){events.push('ownership-write');},async close(){}};},
   async link(){events.push('ownership-published');}};
  const files=createFileOps({fs,now:()=>0,ownedParent:parent,privateOwnerData:true,utility:async(exe,args)=>{
   const script=Buffer.from(args.at(-1),'base64').toString('utf16le');if(!script.includes('0x9C040'))return 'checked';
   assert.match(script,/ushort set=0,got/);assert.match(script,/if\(got!=0\|\|count!=2/);events.push('format-dispatched');await gate;
   return accepted?'plain-owned-pgdata-ok':'refused';
  }});
  const preparation=files.prepare('a'.repeat(48),100).finally(()=>{settled=true;});const observed=preparation.catch(error=>error);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);assert.deepEqual(events,['mkdir-cluster','mkdir-pgdata','format-dispatched']);
  release();const result=await observed;
  if(accepted){assert.equal(result.dataDirectory,fixed);assert.ok(events.includes('ownership-published'));}
  else{assert.equal(result.code,'PLAIN_STORAGE');assert.equal(events.includes('ownership-published'),false);}
 }
});
