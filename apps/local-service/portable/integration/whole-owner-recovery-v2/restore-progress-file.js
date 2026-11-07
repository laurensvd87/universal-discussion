// Trusted filesystem seam; the real caller first validates its fresh owned
// cluster directory. Fixed filename, exclusive creation, no append/adoption.
import {projectRestoreProgress} from './restore-progress.js';
const fail=()=>Object.assign(new Error('Restore diagnostic file unavailable'),{code:'OWNED_RESTORE_DIAGNOSTIC_FILE'});
export async function openRestoreProgressFile({fs,filename,check}){
 check();const handle=await fs.open(filename,'wx');let closed=false,ordinal=0,total=0;
 return Object.freeze({
  async write(sample){
   check();if(closed||ordinal>=300||!sample||Object.keys(sample).length!==11||sample.schema!=='owned-restore-progress-sample/v1'
    ||sample.ordinal!==ordinal||!Number.isSafeInteger(sample.elapsedMs)||sample.elapsedMs<0||sample.elapsedMs>360000)throw fail();
   const {schema,ordinal:ignored,elapsedMs,...counters}=sample;
   const safe={schema,ordinal,elapsedMs,...projectRestoreProgress({rows:[counters]})};
   const line=JSON.stringify(safe)+'\n',bytes=Buffer.byteLength(line);
   if(bytes>1024||total+bytes>131072)throw fail();
   await handle.writeFile(line,'utf8');total+=bytes;ordinal++;check();
  },
  async close(){if(closed)return;await handle.close();closed=true;},
 });
}
