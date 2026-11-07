import test from 'node:test';import assert from 'node:assert/strict';import {constants} from 'node:fs';
import {publishSingleCheckpointForTest,publishPairedCheckpointForTest} from './checkpoint-publication.js';
const bytes=Buffer.from('public checkpoint\n');
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
async function turns(){await new Promise(resolve=>setImmediate(resolve));}
function fixture(fault={}){
 const files=new Map(),events=[];let inode=0;
 const state={holdOriginalClose:null,holdFinalSync:null,holdFinalClose:null,holdUnlink:null};
 const file=()=>({bytes:Buffer.from(bytes),ino:++inode,nlink:1});
 const port={async open(name,mode,permissions){events.push('open:'+name+':'+mode);if(mode==='wx'){
   assert.equal(permissions,0o600);if(files.has(name))throw Object.assign(Error('invented'),{code:'EEXIST'});files.set(name,file());
  }else assert.equal(mode,'r+');const value=files.get(name);assert.ok(value);
  return {async writeFile(value){events.push('write');if(fault.write)throw false;files.get(name).bytes=Buffer.from(value);},
   async sync(){events.push('sync:'+name);if(fault.sync===name)throw Error('invented-sync');if(name==='f'&&state.holdFinalSync)await state.holdFinalSync.promise;},
   async stat(){return {isFile:()=>true,nlink:fault.links??value.nlink,size:value.bytes.length,dev:1,ino:value.ino};},
   async read(buffer){events.push('read-final');value.bytes.copy(buffer);if(fault.readback)buffer[0]^=1;return {bytesRead:value.bytes.length};},
   async close(){events.push('close:'+name);if(name==='p'&&state.holdOriginalClose)await state.holdOriginalClose.promise;if(name==='f'&&state.holdFinalClose)await state.holdFinalClose.promise;if(fault.close===name)throw Error('invented-close');events.push('closed:'+name);},
  };},
  async copyFile(p,f,flags){events.push('copy');assert.equal(flags,constants.COPYFILE_EXCL);if(files.has(f))throw Object.assign(Error('invented'),{code:'EEXIST'});if(fault.copy)throw Error('invented-copy');files.set(f,file());},
  async link(p,f){events.push('link');if(files.has(f))throw Object.assign(Error('invented'),{code:'EEXIST'});const value=files.get(p);value.nlink++;files.set(f,value);},
  async unlink(p){events.push('unlink');if(state.holdUnlink)await state.holdUnlink.promise;if(fault.unlink)throw Error('invented-unlink');assert(files.delete(p));events.push('unlinked');},
 };
 return {port,files,events,state,run:()=>publishSingleCheckpointForTest(port,'p','f',bytes,()=>{})};
}
test('single-final publication closes originals, copies exclusively, validates/syncs/closes the copy, then retires pending',async()=>{
 const f=fixture();await f.run();assert.deepEqual(f.events,['open:p:wx','write','sync:p','close:p','closed:p','copy','open:f:r+','read-final','sync:f','close:f','closed:f','unlink','unlinked']);
 assert.equal(f.files.size,1);assert.equal(f.files.get('f').nlink,1);assert.deepEqual(f.files.get('f').bytes,bytes);
});
test('pending cannot retire while any original close, final sync/close or unlink remains unsettled',async()=>{
 for(const key of ['holdOriginalClose','holdFinalSync','holdFinalClose','holdUnlink']){
  const f=fixture();f.state[key]=deferred();let complete=false;const pending=f.run().then(()=>{complete=true;});await turns();
  assert.equal(complete,false);assert(f.files.has('p'));if(key==='holdOriginalClose')assert(!f.events.includes('copy'));
  if(key==='holdFinalSync'||key==='holdFinalClose')assert(!f.events.includes('unlink'));
  f.state[key].resolve();await pending;assert.equal(complete,true);assert(!f.files.has('p'));
 }
});
test('failures and existing destinations retain evidence, never overwrite, delete or retry a partial publication',async()=>{
 for(const fault of [{write:true},{sync:'p'},{close:'p'},{copy:true},{readback:true},{links:2},{sync:'f'},{close:'f'},{unlink:true}]){
  const f=fixture(fault);await assert.rejects(f.run(),fault.write?error=>error===false:undefined);assert(f.files.has('p'));assert.equal(f.events.filter(e=>e==='copy').length<=1,true);
  if(!fault.unlink)assert(!f.events.includes('unlink'));
 }
 const f=fixture();const old={bytes:Buffer.from('existing'),ino:99,nlink:1};f.files.set('f',old);await assert.rejects(f.run(),{code:'EEXIST'});assert.equal(f.files.get('f'),old);assert(f.files.has('p'));
 const g=fixture();g.files.set('p',old);await assert.rejects(g.run(),{code:'EEXIST'});assert(!g.events.includes('copy'));
});
test('paired original protocol keeps both hardlinks and never copies or unlinks pending',async()=>{
 const f=fixture();await publishPairedCheckpointForTest(f.port,'p','f',bytes,()=>{});
 assert.equal(f.files.size,2);assert.equal(f.files.get('p'),f.files.get('f'));assert.equal(f.files.get('f').nlink,2);
 assert(!f.events.includes('copy')&&!f.events.includes('unlink'));assert(f.events.indexOf('closed:p')<f.events.indexOf('link'));
});
test('the first write failure survives a close failure; all argument bounds reject before IO',async()=>{
 const f=fixture({write:true,close:'p'});await assert.rejects(f.run(),error=>error===false);assert.equal(f.events.filter(e=>e==='close:p').length,1);
 for(const b of [Buffer.alloc(0),Buffer.alloc(1025),'private'])await assert.rejects(publishSingleCheckpointForTest(f.port,'p','f',b,()=>{}),{code:'CHECKPOINT_PUBLICATION'});
});
