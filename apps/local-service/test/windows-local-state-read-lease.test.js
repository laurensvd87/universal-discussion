import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough,Writable} from 'node:stream';
import path from 'node:path';
import {createWindowsLocalStateReadLeaseForTest,LOCAL_STATE_SLOTS} from '../src/ops/windows-local-state-read-lease.js';

function fixture({invalidReady=false,denyVerify=false,delayedClose=false}={}){
 const calls=[];let child,retire,closed=false;
 const finish=code=>{if(closed)return;closed=true;child.stdout.end();child.stderr.end();child.emit('close',code);};
 const spawn=(executable,args,options)=>{calls.push({executable,args,options});child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{calls.push('kill');queueMicrotask(()=>finish(1));};
  child.stdin=new Writable({write(chunk,_encoding,callback){const text=chunk.toString('utf8');calls.push(text);callback();queueMicrotask(()=>{
   if(text.startsWith('{')){const data=JSON.parse(text).data;child.stdout.write(JSON.stringify(invalidReady?{ready:true,slots:[]}:{ready:true,slots:LOCAL_STATE_SLOTS.map(id=>({id,path:id.startsWith('provider-')?null:path.join(data,...id.split('/')),leaf:id.startsWith('provider-')?null:id.split('/').at(-1),present:false,bytes:0,modified:null}))})+'\n');}
   else if(text==='verify\n'){if(denyVerify)finish(1);else child.stdout.write('{"verified":true}\n');}
   else if(text==='close\n'){retire=()=>finish(0);if(!delayedClose)retire();}
  });}});return child;
 };
 return {lease:createWindowsLocalStateReadLeaseForTest({spawn,executable:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'}),calls,release:()=>retire(),get child(){return child;}};
}
test('fixed holder source uses read-only deny-write/delete handles and bounded metadata protocol',async t=>{
 const f=fixture(),held=await f.lease.acquire();assert.equal(held.slots.length,LOCAL_STATE_SLOTS.length);assert.ok(LOCAL_STATE_SLOTS.length<=64);const command=f.calls[0];assert.equal(command.options.shell,false);assert.equal(command.options.windowsHide,true);assert.deepEqual(command.options.stdio,['pipe','pipe','pipe']);
 t.after(()=>held.close());
 const config=JSON.parse(f.calls.find(value=>typeof value==='string'&&value.startsWith('{')));assert.equal(config.data,path.resolve(config.data),'PowerShell receives an ordinary data leaf, never a trailing separator');
 const source=command.args.at(-1);for(const text of ['[IO.FileShare]::Read','ReparsePoint','CreationTimeUtc','LastWriteTimeUtc','account-key.protected','accounts.sqlite','chatgpt-registration/v1','chatgpt-refresh-','provider-current','provider-legacy'])assert.ok(source.includes(text));assert.equal(source.includes('Unprotect('),false);assert.equal(source.includes('ReadAllBytes('),false);assert.equal(source.includes('Remove-Item'),false);
 await held.verify();await held.close();assert.ok(f.calls.includes('verify\n'));assert.ok(f.calls.includes('close\n'));assert.equal(f.calls.filter(v=>v==='kill').length,0);
});
test('held close waits original child exit and both EOFs and is idempotent',async()=>{
 const f=fixture({delayedClose:true}),held=await f.lease.acquire();let settled=false;const close=held.close();assert.equal(close,held.close());close.finally(()=>{settled=true;});await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);
 const before=f.calls.length;await assert.rejects(held.verify(),e=>e.code==='local-state-lease');assert.equal(f.calls.length,before);assert.equal(f.calls.filter(v=>v==='close\n').length,1);assert.equal(f.calls.includes('verify\n'),false);assert.equal(f.calls.includes('kill'),false);assert.equal(settled,false);
 f.release();await close;assert.equal(settled,true);
});
test('changed/denied verify and malformed startup fail finitely without a successful lease retirement claim',async()=>{
 const f=fixture({denyVerify:true}),held=await f.lease.acquire();await assert.rejects(held.verify(),e=>e.code==='local-state-lease');await assert.rejects(held.close());const g=fixture({invalidReady:true});await assert.rejects(g.lease.acquire());assert.ok(g.calls.includes('kill'));
});
test('no new verification starts after close and outstanding validation cannot be overlapped',async()=>{
 const f=fixture(),held=await f.lease.acquire(),first=held.verify();await assert.rejects(held.verify());await first;await held.close();await assert.rejects(held.verify());
});
