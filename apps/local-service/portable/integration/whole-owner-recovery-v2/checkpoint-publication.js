// Internal metadata IO only. Production supplies the authenticated owned output.
// Each operation retires before the next; failed publications are never adopted.
import * as fs from 'node:fs/promises';
import {constants} from 'node:fs';
const need=v=>{if(!v)throw Object.assign(Error('Checkpoint publication unavailable'),{code:'CHECKPOINT_PUBLICATION'});};
async function closed(fd,work){let failed=false;try{return await work();}catch(error){failed=true;throw error;}
 finally{try{await fd.close();}catch(error){if(!failed)throw error;}}}
async function publish(port,pending,final,bytes,check,single){
 need(typeof pending==='string'&&typeof final==='string'&&pending!==final&&pending.length<=1024&&final.length<=1024&&
  Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=1024&&typeof check==='function');
 const originalCheck=check;check=()=>need(originalCheck()===undefined);check();
 const original=await port.open(pending,'wx',0o600);
 await closed(original,async()=>{check();await original.writeFile(bytes);check();await original.sync();check();});check();
 if(!single){await port.link(pending,final);check();return;}
 await port.copyFile(pending,final,constants.COPYFILE_EXCL);check();
 const copied=await port.open(final,'r+');
 await closed(copied,async()=>{let buffer;try{
  check();const before=await copied.stat();need(before.isFile()&&before.nlink===1&&before.size===bytes.length);
  buffer=Buffer.alloc(bytes.length+1);const read=await copied.read(buffer,0,buffer.length,0);check();
  need(read.bytesRead===bytes.length&&buffer.subarray(0,read.bytesRead).equals(bytes));
  await copied.sync();check();const after=await copied.stat();
  need(after.isFile()&&after.nlink===1&&after.size===before.size&&after.dev===before.dev&&after.ino===before.ino);
 }finally{buffer?.fill(0);}});check();
 // Pending absence is the new single-final record's publication boundary.
 // Both copied data and its original close have completed before this unlink.
 await port.unlink(pending);check();
}
const real=Object.freeze({open:fs.open,copyFile:fs.copyFile,unlink:fs.unlink,link:fs.link});
export const publishSingleCheckpoint=(pending,final,bytes,check)=>publish(real,pending,final,bytes,check,true);
export const publishPairedCheckpoint=(pending,final,bytes,check)=>publish(real,pending,final,bytes,check,false);
// Trusted invented-port tests; this is not a run, DB or semantic capability.
export const publishSingleCheckpointForTest=(port,...args)=>publish(port,...args,true);
export const publishPairedCheckpointForTest=(port,...args)=>publish(port,...args,false);
