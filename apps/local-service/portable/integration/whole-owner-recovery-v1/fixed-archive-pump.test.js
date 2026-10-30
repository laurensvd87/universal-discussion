import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {Readable,Writable} from 'node:stream';
import {createFixedAutomatic18RestorePump as create,FIXED_AUTOMATIC18_DUMP as fixed,isFixedAutomatic18Dump as accepts} from './fixed-archive-pump.js';
import {AUTOMATIC18_OWNER_INPUTS} from '../automatic-topics-owner-native-check.js';
const empty=()=>({async *[Symbol.asyncIterator](){}});
function fixture({startThrows=false,deferWrite=false}={}){
 const calls={starts:0,kills:0,cancelled:0,writes:[],callbacks:[],options:null,args:null,executable:null};
 const child=new EventEmitter();child.stdout=Readable.from([]);child.stderr=Readable.from([]);
 child.stdin=new Writable({write(chunk,encoding,callback){calls.writes.push(chunk);if(deferWrite)calls.callbacks.push(callback);else callback();}});
 child.kill=()=>{calls.kills++;queueMicrotask(()=>child.emit('close',9));};
 const restore=create({spawn(executable,args,options){calls.starts++;calls.executable=executable;calls.args=args;calls.options=options;if(startThrows)throw Error('Synthetic launch refusal');return child;},
  now:()=>0,setTimeout:()=>1,clearTimeout(){calls.cancelled++;},environment:()=>({SystemRoot:'C:\\Windows'})});
 return{calls,restore};
}
const request=(dump=empty())=>({password:'synthetic-owned-role-only',dump,dumpBytes:fixed.bytes,dumpSha256:fixed.sha256,deadline:1000});
test('new exact identity matches the actual fixed17 archive, without relaxing arbitrary larger input',async()=>{
 assert.equal(fixed.bytes,AUTOMATIC18_OWNER_INPUTS.dumpBytes);assert.equal(fixed.sha256,AUTOMATIC18_OWNER_INPUTS.dumpSha256);
 assert.equal(accepts(fixed.bytes,fixed.sha256),true);
 for(const [bytes,sha] of [[fixed.bytes-1,fixed.sha256],[fixed.bytes+1,fixed.sha256],[1073741824,fixed.sha256],[fixed.bytes,'a'.repeat(64)],[String(fixed.bytes),fixed.sha256]])assert.equal(accepts(bytes,sha),false);
 const f=fixture({startThrows:true});await assert.rejects(f.restore(request()),error=>error.code==='OWNED_RESTORE_START');assert.equal(f.calls.starts,1);
 assert.ok(f.calls.args.includes('--port=55433'));assert.ok(f.calls.args.includes('--single-transaction'));assert.equal(f.calls.options.shell,false);
 assert.equal(f.calls.options.windowsHide,true);assert.equal(f.calls.options.env.PGPASSWORD,undefined);
});
test('mismatched identity is refused before child launch or dump iteration',async()=>{
 let reads=0;const dump={async *[Symbol.asyncIterator](){reads++;yield Buffer.from('PGDMP');}};
 for(const change of [{dumpBytes:fixed.bytes-1},{dumpSha256:'0'.repeat(64)},{password:''}]){
  const f=fixture();await assert.rejects(f.restore({...request(dump),...change}),error=>error.code==='OWNED_RESTORE_REQUEST');assert.equal(f.calls.starts,0);
 }assert.equal(reads,0);
});
test('exact metadata alone cannot produce success from an empty or partial stream; original child close is settled',async()=>{
 const f=fixture();await assert.rejects(f.restore(request()),error=>error.code==='OWNED_RESTORE_INPUT');
 assert.equal(f.calls.starts,1);assert.equal(f.calls.kills,1);assert.equal(f.calls.cancelled,1);assert.equal(f.calls.options.env.PGPASSWORD,undefined);
});
test('write(true) retains the borrowed input until its callback before wiping and rejecting an incomplete archive',async()=>{
 const bytes=Buffer.from('PGDMP'),f=fixture({deferWrite:true}),dump={async *[Symbol.asyncIterator](){yield bytes;}};
 const pending=f.restore(request(dump));let settled=false;pending.then(()=>{settled=true;},()=>{settled=true;});
 for(let i=0;i<12&&!f.calls.callbacks.length;i++)await Promise.resolve();
 assert.equal(f.calls.callbacks.length,1);assert.equal(bytes.toString(),'PGDMP');assert.equal(settled,false);
 f.calls.callbacks[0]();await assert.rejects(pending,error=>error.code==='OWNED_RESTORE_INPUT');assert.equal(bytes.every(value=>value===0),true);
 assert.equal(f.calls.kills,1);assert.equal(f.calls.options.env.PGPASSWORD,undefined);
});
