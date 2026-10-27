// Closed private HTTP/database rehearsal. Import starts no native/application IO.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runOwnerHttpNativeCheck} from './owner-restore-native-check.js';

export {runOwnerHttpNativeCheck};
export async function main(args=process.argv.slice(2)){
 if(!Array.isArray(args)||args.length)return 2;
 try{const result=await runOwnerHttpNativeCheck();process.stdout.write(JSON.stringify(result)+'\n');return result.accepted?0:1;}
 catch{process.stdout.write('{"schema":"owner-upgrade-postgres-result/v1","accepted":false,"failure":"private-http-incomplete"}\n');return 1;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().then(code=>{process.exitCode=code;});
