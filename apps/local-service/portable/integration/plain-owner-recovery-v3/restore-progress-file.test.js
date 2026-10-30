import test from 'node:test';import assert from 'node:assert/strict';
import {openRestoreProgressFile} from './restore-progress-file.js';
const row={copy_backends:'0',copy_bytes:'0',copy_tuples:'0',index_backends:'1',index_blocks_total:'0',
 index_blocks_done:'0',index_tuples_total:'99',index_tuples_done:'20'};
const sample=n=>({schema:'owned-restore-progress-sample/v1',ordinal:n,elapsedMs:n*1000,...row});
test('exclusive bounded file accepts only closed numeric samples and preserves actual write/close promises',async()=>{
 const lines=[];let closed=false,release;const fs={async open(name,flags){assert.equal(name,'owned-fixed-file');assert.equal(flags,'wx');
  return {async writeFile(line){lines.push(line);},async close(){await new Promise(r=>{release=r;});closed=true;}};}};
 const writer=await openRestoreProgressFile({fs,filename:'owned-fixed-file',check(){}});
 await writer.write(sample(0));await assert.rejects(writer.write({...sample(1),text:'secret'}));
 await assert.rejects(writer.write(sample(2)));await writer.write(sample(1));assert.equal(lines.length,2);
 let settled=false;const close=writer.close().then(()=>{settled=true;});await Promise.resolve();assert.equal(settled,false);release();await close;
 assert.equal(closed,true);await assert.rejects(writer.write(sample(2)));
 assert.ok(!lines.join('').includes('secret'));assert.equal(JSON.parse(lines[1]).index_tuples_done,'20');
});
test('file refuses a 301st sample even when its size is otherwise small',async()=>{
 const writer=await openRestoreProgressFile({fs:{async open(){return{async writeFile(){},async close(){}};}},filename:'invented',check(){}});
 for(let n=0;n<300;n++)await writer.write(sample(n));await assert.rejects(writer.write(sample(300)));await writer.close();
});
