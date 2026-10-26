import { constants, lstatSync, realpathSync, openSync, closeSync, writeSync, readSync, fstatSync, fsyncSync, linkSync, unlinkSync, readdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID, createCipheriv, createDecipheriv } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { captureCanonicalImage, validateCanonicalImage, MAX_BACKUP_BYTES, assertBackupRuntime } from "./backup-image.js";

const MURMINGLE_MAGIC = Buffer.from("MURMNGL1");
// Encoded compatibility identifiers keep still-live seven-day pre-name backups
// usable without retaining retired branding in the active source vocabulary.
const PRE_NAME_MAGIC = Buffer.from("VURMQktQMDE=", "base64");
const MURMINGLE_BACKUP_SUFFIX = ".murmingle-backup";
const PRE_NAME_BACKUP_SUFFIX = Buffer.from("LnVkbGJhY2t1cA==", "base64").toString("ascii");
const HEADER_LIMIT = 8192;
const WEEK = 7 * 24 * 60 * 60 * 1000;
const NAME_STEM = String.raw`canonical-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`;
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const SUFFIX_PATTERN = `(?:${[MURMINGLE_BACKUP_SUFFIX,PRE_NAME_BACKUP_SUFFIX].map(escapePattern).join("|")})`;
const NAME = new RegExp(`^${NAME_STEM}${SUFFIX_PATTERN}$`, "u");
const OWNED_NAME = new RegExp(`^${NAME_STEM}${SUFFIX_PATTERN}(?:\\.partial)?$`, "u");
export function isCanonicalBackupFilename(filename) { return typeof filename === "string" && NAME.test(filename); }
function filenameCreatedAt(filename) {
  const match=OWNED_NAME.exec(filename);
  if (!match) return null;
  const iso=`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.${match[7]}Z`;
  const time=Date.parse(iso); return Number.isFinite(time) && new Date(time).toISOString() === iso ? iso : null;
}
function failure() { return Object.assign(new Error("Canonical encrypted backup failed"), { code: "canonical-backup-failed" }); }
function timestamp(now) { const value = typeof now === "function" ? now() : now ?? new Date(); const date = new Date(value); if (!Number.isFinite(date.getTime())) throw failure(); return date; }
function checkedPath(value, directory) {
  if (typeof value !== "string" || !path.isAbsolute(value) || path.resolve(value) !== value) throw failure();
  for (let current = value; ; current = path.dirname(current)) {
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || realpathSync.native(current).toLowerCase() !== current.toLowerCase()) throw failure();
    if (current === path.dirname(current)) break;
  }
  const stat = lstatSync(value); if (directory ? !stat.isDirectory() : !stat.isFile()) throw failure();
  return value;
}
async function locations(dataDir, protection, create = false) {
  assertBackupRuntime();
  if (!protection || typeof protection.prepareDirectory !== "function" || typeof protection.wrapKey !== "function" || typeof protection.unwrapKey !== "function") throw failure();
  checkedPath(dataDir, true);
  const directory = path.join(dataDir, "canonical-migration-backups");
  if (create) { try { checkedPath(directory,true); } catch(error) { if(error.code !== "ENOENT") throw error; } }
  else checkedPath(directory, true);
  await protection.prepareDirectory(directory); checkedPath(directory, true);
  return directory;
}
function safeResult(header, filename) { return Object.freeze({ filename, createdAt: header.createdAt, expiresAt: header.expiresAt, canonicalSchema: header.canonicalSchema, version: header.version, counts: header.counts, logicalStateDigest: header.logicalStateDigest, size: header.size, verified: true }); }
function validateHeader(header, now, allowExpired) {
  const keys = ["schema", "algorithm", "keyWrap", "iv", "createdAt", "expiresAt", "canonicalSchema", "version", "counts", "logicalStateDigest", "imageDigest", "size"];
  if (!header || !isDeepStrictEqual(Object.keys(header).sort(), keys.sort()) || header.schema !== "canonical-encrypted-backup/v1" || header.algorithm !== "AES-256-GCM" || header.keyWrap?.provider !== "dpapi-current-user" || Object.keys(header.keyWrap).sort().join(",") !== "data,provider") throw failure();
  if (typeof header.keyWrap.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/u.test(header.keyWrap.data) || Buffer.from(header.keyWrap.data, "base64").length > 2048 || Buffer.from(header.keyWrap.data, "base64").length < 1 || Buffer.from(header.keyWrap.data,"base64").toString("base64") !== header.keyWrap.data) throw failure();
  if (typeof header.iv !== "string" || Buffer.from(header.iv,"base64").length !== 12 || Buffer.from(header.iv,"base64").toString("base64") !== header.iv) throw failure();
  const created = Date.parse(header.createdAt), expires = Date.parse(header.expiresAt), clock = timestamp(now).getTime();
  if (!Number.isFinite(created) || new Date(created).toISOString() !== header.createdAt || !Number.isFinite(expires) || new Date(expires).toISOString() !== header.expiresAt || expires - created !== WEEK || created > clock || (!allowExpired && clock >= expires)) throw failure();
  if (!Number.isSafeInteger(header.size) || header.size < 100 || header.size > MAX_BACKUP_BYTES || !/^[a-f0-9]{64}$/u.test(header.logicalStateDigest) || !/^[a-f0-9]{64}$/u.test(header.imageDigest)) throw failure();
}
function readContainer(filename) {
  const descriptor = openSync(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const size = fstatSync(descriptor).size;
    if (size < 28 || size > MAX_BACKUP_BYTES + HEADER_LIMIT + 28) throw failure();
    const prefix = Buffer.alloc(12);
    if (readSync(descriptor, prefix, 0, 12, 0) !== 12 || ![MURMINGLE_MAGIC,PRE_NAME_MAGIC].some(value => prefix.subarray(0,8).equals(value))) throw failure();
    const length = prefix.readUInt32BE(8); if (length < 2 || length > HEADER_LIMIT || size < 12 + length + 16) throw failure();
    const bytes = Buffer.alloc(size - 12); let offset = 0;
    while (offset < bytes.length) { const read = readSync(descriptor, bytes, offset, bytes.length-offset, offset+12); if (!read) throw failure(); offset += read; }
    return { aad: bytes.subarray(0,length), cipher: bytes.subarray(length,-16), tag: bytes.subarray(-16) };
  } finally { closeSync(descriptor); }
}
async function verify({ dataDir, filename, protection, now }, allowExpired = false) {
  const directory = await locations(dataDir, protection);
  if (!isCanonicalBackupFilename(filename)) throw failure();
  const target = checkedPath(path.join(directory, filename), false);
  const container = readContainer(target); const header = JSON.parse(container.aad.toString("utf8")); validateHeader(header, now, allowExpired);
  if(header.createdAt !== filenameCreatedAt(filename)) throw failure();
  if (container.cipher.length !== header.size) throw failure();
  let key, image, final;
  try {
    key = await protection.unwrapKey(Buffer.from(header.keyWrap.data, "base64"));
    if (!Buffer.isBuffer(key) || key.length !== 32) throw failure();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(header.iv,"base64")); decipher.setAAD(container.aad); decipher.setAuthTag(container.tag);
    image = decipher.update(container.cipher); final = decipher.final();
    if (final.length) throw failure();
    const restored = validateCanonicalImage(image);
    if (!isDeepStrictEqual(restored, Object.fromEntries(["canonicalSchema","version","counts","logicalStateDigest","imageDigest","size"].map(name => [name,header[name]])))) throw failure();
    return safeResult(header, filename);
  } finally { key?.fill(0); image?.fill(0); final?.fill(0); }
}
export async function verifyCanonicalBackup(options) { try { return await verify(options); } catch { throw failure(); } }
export async function createCanonicalBackup({ dataDir, protection, now }) {
  let image, key, descriptor, partial, ownedPartial=false, published, verified=false;
  try {
    assertBackupRuntime();
    const date = timestamp(now); const directory = await locations(dataDir, protection, true);
    const source = checkedPath(path.join(dataDir,"demo.sqlite"), false);
    // SQLite may open journal sidecars itself: reject redirected sidecars too.
    for (const suffix of ["-wal","-shm","-journal"]) {
      try { checkedPath(`${source}${suffix}`,false); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    image = captureCanonicalImage(source);
    // Source lock has already been released before domain validation or DPAPI.
    const metadata = validateCanonicalImage(image); key = randomBytes(32); const iv = randomBytes(12);
    const wrapped = await protection.wrapKey(key);
    if (!Buffer.isBuffer(wrapped) || !wrapped.length || wrapped.length > 2048) throw failure();
    const header = { schema:"canonical-encrypted-backup/v1", algorithm:"AES-256-GCM", keyWrap:{ provider:"dpapi-current-user",data:wrapped.toString("base64") }, iv:iv.toString("base64"), createdAt:date.toISOString(),expiresAt:new Date(date.getTime()+WEEK).toISOString(), ...metadata };
    validateHeader(header,date,false); const aad = Buffer.from(JSON.stringify(header)); if (aad.length > HEADER_LIMIT) throw failure();
    const cipher = createCipheriv("aes-256-gcm",key,iv); cipher.setAAD(aad);
    const ciphertext = cipher.update(image); const tail = cipher.final(); const tag = cipher.getAuthTag();
    image.fill(0); image = null; key.fill(0); key = null;
    const filename = `canonical-${date.toISOString().replaceAll(":","-").replace(".","-")}-${randomUUID()}${MURMINGLE_BACKUP_SUFFIX}`;
    const target = path.join(directory,filename); partial = `${target}.partial`;
    // DPAPI is asynchronous. Revalidate the complete directory chain after it
    // resolves, before the synchronous exclusive write/publication sequence.
    checkedPath(directory,true);
    descriptor = openSync(partial, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,0o600);
    ownedPartial=true;
    const prefix = Buffer.alloc(12); MURMINGLE_MAGIC.copy(prefix); prefix.writeUInt32BE(aad.length,8);
    for (const bytes of [prefix,aad,ciphertext,tail,tag]) { let offset=0; while(offset<bytes.length) { const written=writeSync(descriptor,bytes,offset,bytes.length-offset); if(written<=0) throw failure(); offset+=written; } }
    fsyncSync(descriptor); closeSync(descriptor); descriptor = undefined;
    linkSync(partial,target); published=target; unlinkSync(partial); partial = null;
    const result=await verify({dataDir,filename,protection,now:date}); verified=true; return result;
  } catch { throw failure(); }
  finally {
    if (descriptor !== undefined) closeSync(descriptor); image?.fill(0); key?.fill(0);
    if (partial && ownedPartial) { try { checkedPath(partial,false); unlinkSync(partial); } catch { /* Abrupt interruptions can retain ciphertext-only files. */ } }
    if(published && !verified) { try { checkedPath(published,false); unlinkSync(published); } catch { /* Retention also covers recognized interrupted files. */ } }
  }
}
export async function pruneExpiredCanonicalBackups({dataDir,protection,now}) {
  try {
    const directory = await locations(dataDir,protection); let removed=0;
    for (const filename of readdirSync(directory)) {
      const createdAt=filenameCreatedAt(filename); if(createdAt===null) continue;
      const created=Date.parse(createdAt),clock=timestamp(now).getTime();
      if(created>clock || clock<created+WEEK) continue;
      // The fixed owned filename and locked directory supply the expiry fallback
      // for corrupt/interrupted ciphertext. Authentication cannot extend it.
      checkedPath(path.join(directory,filename),false);
      if(NAME.test(filename)) { try { await verify({dataDir,filename,protection,now},true); } catch { /* Expired owned ciphertext still must be removed. */ } }
      checkedPath(path.join(directory,filename),false); unlinkSync(path.join(directory,filename)); removed++;
    }
    return {removed};
  } catch { throw failure(); }
}
