// Ordinary bounded benchmark files, with exclusive output and sampled integrity.
import {createHash} from 'node:crypto';
import {lstat,realpath,open,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=fileURLToPath(new URL('../../../',import.meta.url));
export const benchmarkSha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const benchmarkNeed=value=>{if(!value)throw new Error('Hierarchy benchmark refused');};
const need=benchmarkNeed;
function resolve(file){need(typeof file==='string'&&!path.isAbsolute(file)&&!file.includes('\\')&&!file.split('/').some(s=>s==='..'||!s));return path.resolve(ROOT,file);}
export async function readBenchmarkBytes(file,pin=null,ledger=null){
 const name=resolve(file),s=await lstat(name,{bigint:true});need(s.isFile()&&!s.isSymbolicLink()&&s.size>0n&&s.size<=4194304n&&(await realpath(name)).toLowerCase()===name.toLowerCase());
 const same=x=>['dev','ino','size','mtimeNs','ctimeNs'].every(k=>s[k]===x[k]),fd=await open(name,'r');let raw;
 try{need(same(await fd.stat({bigint:true})));raw=Buffer.alloc(Number(s.size)+1);let used=0;while(used<raw.length){const step=await fd.read(raw,used,raw.length-used,used);if(!step.bytesRead)break;used+=step.bytesRead;}
  need(used===Number(s.size)&&same(await fd.stat({bigint:true}))&&same(await lstat(name,{bigint:true})));raw=raw.subarray(0,used);
 }finally{await fd.close();}
 const actual={file,bytes:raw.length,sha256:benchmarkSha(raw)};if(pin)need(actual.sha256===pin.sha256&&(pin.bytes==null||actual.bytes===pin.bytes));ledger?.push(actual);return raw;
}
export async function readBenchmarkJson(file,pin=null,ledger=null){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBenchmarkBytes(file,pin,ledger)));}
export async function benchmarkSourcePins(files){const list=[];for(const file of files)await readBenchmarkBytes(file,null,list);return list;}
export async function checkBenchmarkPins(ledger,files,sources){for(const pin of ledger)await readBenchmarkBytes(pin.file,pin);need(JSON.stringify(await benchmarkSourcePins(files))===JSON.stringify(sources));}
export async function createBenchmarkOutput(folder){
 need(folder.startsWith('apps/local-service/data/'));const target=resolve(folder);
 for(let p=path.dirname(target);;p=path.dirname(p)){const s=await lstat(p);need(s.isDirectory()&&!s.isSymbolicLink()&&(await realpath(p)).toLowerCase()===p.toLowerCase());if(path.dirname(p)===p)break;}
 await mkdir(target);
}
export async function saveBenchmarkJson(folder,file,value){
 need(folder.startsWith('apps/local-service/data/')&&/^[a-z0-9-]+\.json$/u.test(file));const raw=Buffer.from(JSON.stringify(value)+'\n');need(raw.length<=1048576);
 await writeFile(path.join(resolve(folder),file),raw,{flag:'wx'});return {file,bytes:raw.length,sha256:benchmarkSha(raw)};
}
