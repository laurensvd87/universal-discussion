import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync,mkdirSync,rmSync,readFileSync,writeFileSync,readdirSync,symlinkSync,unlinkSync,renameSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { createDemoState } from "../src/domain/demo-state.js";
import { createSqliteRepository } from "../src/adapters/sqlite-repository.js";
import { createNormalizedSqliteRepository } from "../src/adapters/normalized-sqlite-repository.js";
import { captureCanonicalImage,validateCanonicalImage } from "../src/ops/backup-image.js";
import { createCanonicalBackup,verifyCanonicalBackup,pruneExpiredCanonicalBackups } from "../src/ops/canonical-backup.js";
import { runCanonicalBackupWorker } from "../src/ops/canonical-backup-worker.js";
const now = "2026-10-12T12:00:00.000Z";
const currentMagic = Buffer.from("MURMNGL1");
const currentSuffix = ".murmingle-backup";
// Encoded fixtures exercise compatibility with backups created before naming.
const preNameMagic = Buffer.from("VURMQktQMDE=", "base64");
const preNameSuffix = Buffer.from("LnVkbGJhY2t1cA==", "base64").toString("ascii");
function fixture(t,normalized=false) {
  const dataDir=mkdtempSync(path.join(tmpdir(),"murmingle-backup-")); t.after(()=>rmSync(dataDir,{recursive:true,force:true}));
  const state=createDemoState({generation:"synthetic-backup",createdAt:now,sources:[],topicSeeds:[{id:"topic-one",title:"Secret synthetic title",kind:"general"}]});
  const repo=(normalized?createNormalizedSqliteRepository:createSqliteRepository)(path.join(dataDir,"demo.sqlite"),state); repo.close();
  const protection={prepareDirectory:async directory=>mkdirSync(directory,{recursive:true,mode:0o700}),wrapKey:async key=>Buffer.from(key),unwrapKey:async key=>Buffer.from(key)};
  return {dataDir,state,protection,now};
}
test("encrypted canonical legacy and normalized backup verifies exact image without source modification",async t=>{
  for(const normalized of [false,true]) {
    const options=fixture(t,normalized); const before=readFileSync(path.join(options.dataDir,"demo.sqlite"));
    const result=await createCanonicalBackup(options);
    assert.equal(result.verified,true); assert.equal(result.canonicalSchema,options.state.schema); assert.deepEqual(result.version,{generation:options.state.generation,revision:options.state.revision});
    if (!normalized) assert.equal(result.logicalStateDigest,createHash("sha256").update(JSON.stringify(options.state)).digest("hex"));
    else assert.match(result.logicalStateDigest,/^[a-f0-9]{64}$/u);
    assert.equal(Date.parse(result.expiresAt)-Date.parse(result.createdAt),604800000);
    assert.deepEqual(readFileSync(path.join(options.dataDir,"demo.sqlite")),before);
    const encrypted=readFileSync(path.join(options.dataDir,"canonical-migration-backups",result.filename)); assert.equal(encrypted.includes(Buffer.from("Secret synthetic title")),false);
    assert.ok(result.filename.endsWith(currentSuffix)); assert.deepEqual(encrypted.subarray(0,8),currentMagic);
    assert.deepEqual(await verifyCanonicalBackup({...options,filename:result.filename}),result);
  }
});
test("pre-name seven-day containers remain verifiable and eligible for expiry cleanup",async t=>{
  const options=fixture(t),result=await createCanonicalBackup(options),directory=path.join(options.dataDir,"canonical-migration-backups");
  const current=path.join(directory,result.filename),filename=`${result.filename.slice(0,-currentSuffix.length)}${preNameSuffix}`,target=path.join(directory,filename),bytes=readFileSync(current);
  preNameMagic.copy(bytes,0); writeFileSync(target,bytes,{flag:"wx",mode:0o600}); unlinkSync(current);
  assert.deepEqual(await verifyCanonicalBackup({...options,filename}),{...result,filename});
  assert.deepEqual(await pruneExpiredCanonicalBackups({...options,now:result.expiresAt}),{removed:1});
  assert.deepEqual(readdirSync(directory),[]);
});
test("tamper, wrong key, expiration and unavailable protection fail closed",async t=>{
  const options=fixture(t); const result=await createCanonicalBackup(options); const filename=path.join(options.dataDir,"canonical-migration-backups",result.filename); const original=readFileSync(filename);
  const changed=Buffer.from(original); changed[changed.length-20]^=1; writeFileSync(filename,changed); await assert.rejects(verifyCanonicalBackup({...options,filename:result.filename}),/Canonical encrypted backup failed/); writeFileSync(filename,original);
  await assert.rejects(verifyCanonicalBackup({...options,filename:result.filename,protection:{...options.protection,unwrapKey:async()=>Buffer.alloc(32)}}));
  await assert.rejects(verifyCanonicalBackup({...options,filename:result.filename,now:result.expiresAt}));
  await assert.rejects(createCanonicalBackup({...options,protection:null}));
  await assert.rejects(createCanonicalBackup({...options,now:"invalid"}));
  await assert.rejects(verifyCanonicalBackup({...options,filename:"../demo.sqlite"}));
});
test("cleanup deletes authenticated backups and owned expired partial/corrupt ciphertext",async t=>{
  const options=fixture(t); const first=await createCanonicalBackup(options); const directory=path.join(options.dataDir,"canonical-migration-backups");
  writeFileSync(path.join(directory,"foreign.txt"),"keep"); writeFileSync(path.join(directory,`${first.filename}.partial`),"keep");
  const second=await createCanonicalBackup({...options,now:"2026-10-14T12:00:00Z"});
  const invalid=first.filename.replace(/-[0-9a-f]{8}-/u,"-aaaaaaaa-"); writeFileSync(path.join(directory,invalid),"corrupt");
  assert.deepEqual(await pruneExpiredCanonicalBackups({...options,now:first.expiresAt}),{removed:3});
  const files=readdirSync(directory); assert.ok(files.includes(second.filename)); assert.ok(files.includes("foreign.txt")); assert.ok(!files.includes(invalid)); assert.ok(!files.includes(`${first.filename}.partial`));
});

test("tampered AAD cannot extend filename expiry and malformed/future names survive",async t=>{
  const options=fixture(t); const result=await createCanonicalBackup(options); const directory=path.join(options.dataDir,"canonical-migration-backups"),file=path.join(directory,result.filename),bytes=readFileSync(file),length=bytes.readUInt32BE(8);
  const header=JSON.parse(bytes.subarray(12,12+length)); header.createdAt="2026-10-13T12:00:00.000Z"; header.expiresAt="2026-10-20T12:00:00.000Z";
  const aad=Buffer.from(JSON.stringify(header)); assert.equal(aad.length,length); aad.copy(bytes,12); writeFileSync(file,bytes);
  const invalid=result.filename.replace("2026-10-12","2026-02-30"),future=result.filename.replace("2026-10-12","2099-10-12"); writeFileSync(path.join(directory,invalid),"keep"); writeFileSync(path.join(directory,future),"keep");
  assert.deepEqual(await pruneExpiredCanonicalBackups({...options,now:result.expiresAt}),{removed:1}); assert.deepEqual(readdirSync(directory).sort(),[invalid,future].sort());
});

test("expired redirected backup files are never followed or removed",async t=>{
  const options=fixture(t); const result=await createCanonicalBackup(options); const file=path.join(options.dataDir,"canonical-migration-backups",result.filename),foreign=path.join(options.dataDir,"foreign.txt");
  writeFileSync(foreign,"must survive"); unlinkSync(file);
  try { symlinkSync(foreign,file,"file"); } catch(error) { if(["EPERM","EACCES","ENOTSUP"].includes(error.code)) { t.skip("File symlinks unavailable in this environment"); return; } throw error; }
  await assert.rejects(pruneExpiredCanonicalBackups({...options,now:result.expiresAt})); assert.equal(readFileSync(foreign,"utf8"),"must survive");
});

test("post-publication failed verification removes only its own encrypted final",async t=>{
  const options=fixture(t); await assert.rejects(createCanonicalBackup({...options,protection:{...options.protection,unwrapKey:async()=>Buffer.alloc(32)}}));
  assert.deepEqual(readdirSync(path.join(options.dataDir,"canonical-migration-backups")),[]);
});

test("unsupported SQLite runtime fails before backup directory writes",async t=>{
  const options=fixture(t); const prior=DatabaseSync.prototype.serialize; let prepared=false;
  try {
    DatabaseSync.prototype.serialize=undefined;
    await assert.rejects(createCanonicalBackup({...options,protection:{...options.protection,prepareDirectory:async()=>{prepared=true;}}}));
    assert.equal(prepared,false); assert.deepEqual(readdirSync(options.dataDir),["demo.sqlite"]);
  } finally {DatabaseSync.prototype.serialize=prior;}
});

test("worker rejects invalid operation, deadline and uncloneable input with fixed errors",async()=>{
  await assert.rejects(runCanonicalBackupWorker({operation:"unknown"}),/Canonical encrypted backup failed/);
  await assert.rejects(runCanonicalBackupWorker({operation:"create",timeoutMs:100}),/Canonical encrypted backup failed/);
  await assert.rejects(runCanonicalBackupWorker({operation:"create",dataDir:()=>"private"}),/Canonical encrypted backup failed/);
});

test("directory redirected during asynchronous key wrapping receives no ciphertext",async t=>{
  const options=fixture(t); const directory=path.join(options.dataDir,"canonical-migration-backups"),prior=path.join(options.dataDir,"original-backup-folder"),foreign=path.join(options.dataDir,"foreign-folder"); mkdirSync(foreign);
  let unavailable=false;
  const protection={...options.protection,wrapKey:async key=>{
    renameSync(directory,prior);
    try { symlinkSync(foreign,directory,process.platform==="win32"?"junction":"dir"); }
    catch(error) { if(["EPERM","EACCES","ENOTSUP"].includes(error.code)) { unavailable=true; throw error; } throw error; }
    return Buffer.from(key);
  }};
  await assert.rejects(createCanonicalBackup({...options,protection}),/Canonical encrypted backup failed/);
  assert.deepEqual(readdirSync(foreign),[]); assert.deepEqual(readdirSync(prior),[]);
  if(unavailable) t.skip("Directory redirects unavailable in this environment");
});
test("WAL snapshot is valid in RAM and source journal stays unchanged",t=>{
  const options=fixture(t,true); const file=path.join(options.dataDir,"demo.sqlite"); const writer=new DatabaseSync(file); writer.exec("PRAGMA journal_mode=WAL");
  try {
    writer.prepare("UPDATE canonical_topics SET payload=replace(payload,'Secret synthetic title','WAL synthetic title')").run();
    const dbBefore=readFileSync(file),walBefore=readFileSync(`${file}-wal`); const image=captureCanonicalImage(file);
    assert.equal(validateCanonicalImage(image).counts.topics,1);
    assert.deepEqual(readFileSync(file),dbBefore); assert.deepEqual(readFileSync(`${file}-wal`),walBefore); assert.equal(writer.prepare("PRAGMA journal_mode").get().journal_mode,"wal"); image.fill(0);
  } finally {writer.close();}
});
test("noncanonical tables and malformed snapshots cannot be backed up",async t=>{
  const options=fixture(t); const db=new DatabaseSync(path.join(options.dataDir,"demo.sqlite")); db.exec("CREATE TABLE private_conversations(body TEXT)"); db.close();
  await assert.rejects(createCanonicalBackup(options)); assert.throws(()=>validateCanonicalImage(Buffer.alloc(100)));
});

test("AAD tampering, future clock and publication failure return fixed errors",async t=>{
  const options=fixture(t); const result=await createCanonicalBackup(options); const file=path.join(options.dataDir,"canonical-migration-backups",result.filename); const original=readFileSync(file);
  const size=original.readUInt32BE(8),header=JSON.parse(original.subarray(12,12+size)); header.version.revision+=1;
  const changedHeader=Buffer.from(JSON.stringify(header)); assert.equal(changedHeader.length,size); const altered=Buffer.from(original); changedHeader.copy(altered,12); writeFileSync(file,altered);
  await assert.rejects(verifyCanonicalBackup({...options,filename:result.filename}),/Canonical encrypted backup failed/); writeFileSync(file,original);
  await assert.rejects(verifyCanonicalBackup({...options,filename:result.filename,now:"2026-10-11T12:00:00Z"}));
  await assert.rejects(createCanonicalBackup({...options,protection:{...options.protection,wrapKey:async()=>{throw new Error("provider raw secret");}}}),error=>error.message==="Canonical encrypted backup failed");
  assert.equal(readdirSync(path.dirname(file)).length,1);
});
