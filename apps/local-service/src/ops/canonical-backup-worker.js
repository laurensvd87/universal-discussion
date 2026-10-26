import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { createCanonicalBackup, verifyCanonicalBackup, pruneExpiredCanonicalBackups, isCanonicalBackupFilename } from "./canonical-backup.js";
import { createWindowsBackupProtection } from "./windows-backup-protection.js";

function validResult(result,operation) {
  if(operation === "prune") return result && Object.keys(result).join(",") === "removed" && Number.isSafeInteger(result.removed) && result.removed>=0;
  return result && Object.keys(result).sort().join(",") === "canonicalSchema,counts,createdAt,expiresAt,filename,logicalStateDigest,size,verified,version" && typeof result.logicalStateDigest==="string" && /^[a-f0-9]{64}$/u.test(result.logicalStateDigest) && result.verified===true && isCanonicalBackupFilename(result.filename) && ["demo-state/v2","demo-state/v3","demo-state/v4"].includes(result.canonicalSchema) && typeof result.version?.generation==="string" && result.version.generation.length<=256 && Number.isSafeInteger(result.version.revision) && Object.keys(result.version).sort().join(",")==="generation,revision" && Number.isSafeInteger(result.size) && result.size>=100 && result.size<=256*1024*1024 && typeof result.createdAt==="string" && typeof result.expiresAt==="string" && Date.parse(result.expiresAt)-Date.parse(result.createdAt)===604800000 && result.counts && Object.keys(result.counts).sort().join(",")==="contributions,discussions,sourceLinks,sources,topics" && Object.values(result.counts).every(value=>Number.isSafeInteger(value)&&value>=0);
}
export function runCanonicalBackupWorker({dataDir,operation = "create",filename,now,timeoutMs=60000}) {
  return new Promise((resolve,reject) => {
    if (!["create","verify","prune"].includes(operation) || !Number.isSafeInteger(timeoutMs) || timeoutMs<30000 || timeoutMs>60000) { reject(new Error("Canonical encrypted backup failed")); return; }
    let worker;
    try { worker = new Worker(new URL(import.meta.url), { workerData:{dataDir,operation,filename,now} }); }
    catch { reject(new Error("Canonical encrypted backup failed")); return; }
    let completed=false;
    const finish = async result => {
      if(completed) return; completed=true; clearTimeout(timer);
      try { await worker.terminate(); } catch { /* Keep fixed public result. */ }
      if(result) resolve(result); else reject(Object.assign(new Error("Canonical encrypted backup failed"),{code:"canonical-backup-failed"}));
    };
    const failed = () => { void finish(null); };
    const timer=setTimeout(failed,timeoutMs);
    worker.once("error",failed);
    worker.once("exit",() => { if (!completed) failed(); });
    worker.once("message",message => { if (message?.ok !== true || !validResult(message.result,operation)) { failed(); return; } void finish(message.result); });
  });
}
if (!isMainThread) {
  try {
    const protection = createWindowsBackupProtection();
    const operation = { create:createCanonicalBackup, verify:verifyCanonicalBackup, prune:pruneExpiredCanonicalBackups }[workerData.operation];
    if (!operation) throw new Error("Invalid backup operation");
    const result = await operation({...workerData,protection});
    parentPort.postMessage({ok:true,result});
  } catch { parentPort.postMessage({ok:false}); }
}
