import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AccountRepository } from '../src/accounts/account-repository.js';
import { AccountService } from '../src/accounts/account-service.js';

const key = Buffer.alloc(32,17);
function fixture(filename = ':memory:', initial = 10_000_000) {
  const repository = new AccountRepository({filename});
  let timestamp = initial;
  const mail = [];
  const service = new AccountService({repository,hmacKey:key,mailSink:message=>{mail.push(message);},now:()=>timestamp});
  return {repository,service,mail,tick:delta=>{timestamp+=delta;},time:()=>timestamp};
}
const nonce = 'synthetic-client-nonce-123456';
function login(f,email='alice@example.test') {
  const request = f.service.requestCode({email,clientNonce:nonce});
  const verified = f.service.verifyCode({challengeId:request.challengeId,code:f.mail.at(-1).code,clientNonce:nonce});
  return {...verified,challengeId:request.challengeId,code:f.mail.at(-1).code};
}
function temp(testContext, currentRepository = () => null) {
  const directory = mkdtempSync(join(tmpdir(),'discussion-auth-fixture-'));
  testContext.after(()=>{currentRepository()?.close();rmSync(directory,{recursive:true,force:true});});
  return join(directory,'fixture.sqlite');
}

test('fixture login exposes separate account/session, no email/digests/code in public DTO',t=>{
  const f = fixture(); t.after(()=>f.repository.close());
  const result = login(f);
  assert.deepEqual(Object.keys(result.account),['id','username','state','replyEmail']);
  assert.equal(result.account.replyEmail,false);
  assert.match(f.repository.database.prepare('SELECT email_key FROM email_challenges').get().email_key,/^[a-f0-9]{64}$/);
  assert.equal(result.session.accessToken.length,43);
  assert.equal(result.session.refreshToken.length,43);
  assert.throws(()=>f.service.resolvePrincipal(result.session.accessToken),/authentication-required/);
  f.service.setUsername(result.session.accessToken,{username:'Alice'});
  assert.deepEqual(f.service.resolvePrincipal(result.session.accessToken),{id:`account-${result.account.id}`,displayName:'Alice',accountId:result.account.id,type:'human',demo:false});
  assert.ok(!JSON.stringify(result.account).includes('email'));
  const dump = JSON.stringify(f.repository.database.prepare('SELECT * FROM sessions').all());
  assert.ok(!dump.includes(result.session.accessToken)); assert.ok(!dump.includes(result.session.refreshToken));
  assert.ok(!JSON.stringify(f.repository.database.prepare('SELECT * FROM email_challenges').all()).includes(`"${result.code}"`));
});

test('username uniqueness, injection and forged actor inputs are denied',t=>{
  const f = fixture(); t.after(()=>f.repository.close());
  const alice = login(f); const bob = login(f,'bob@example.test');
  assert.equal(f.service.setUsername(alice.session.accessToken,{username:'Alice_1'}).username,'Alice_1');
  for (const username of ['alice_1','admin','ab','x'.repeat(25),"alice'; DROP TABLE accounts;--",'álîce']) assert.throws(()=>f.service.setUsername(bob.session.accessToken,{username}),/username-unavailable|invalid-request/);
  assert.throws(()=>f.service.me('alex'),/authentication-required/);
  assert.throws(()=>f.service.setUsername(bob.session.accessToken,{username:'NewUser',accountId:alice.account.id}),/invalid-request/);
  assert.equal(f.service.me(alice.session.accessToken).username,'Alice_1');
  assert.equal(f.service.setReplyEmail(alice.session.accessToken,{enabled:true}).replyEmail,true);
});

test('malformed shapes and getters never execute',t=>{
  const f = fixture(); t.after(()=>f.repository.close());
  let executed = false;
  const getter = {get email(){executed=true;return 'a@example.test';},clientNonce:nonce};
  for (const value of [getter,[],null,'email',Object.assign(Object.create({email:'a@example.test'}),{clientNonce:nonce}),{email:'a@example.test',clientNonce:nonce,extra:true}]) assert.throws(()=>f.service.requestCode(value),/invalid-request/);
  assert.equal(executed,false);
  for (const email of ['user@example.com','a@localhost','a@example.test\r\nBcc:x@example.test']) assert.throws(()=>f.service.requestCode({email,clientNonce:nonce}),/invalid-request/);
  assert.throws(()=>new AccountService({repository:f.repository,hmacKey:Buffer.alloc(4),mailSink:()=>{}}),/configuration/);
  assert.throws(()=>new AccountService({repository:f.repository,hmacKey:key,mailSink:()=>{},fixtureOnly:false}),/configuration/);
});

test('wrong nonce/code consumes attempts persistently and replay/expiry are denied',t=>{
  let f; const filename = temp(t,()=>f?.repository); f = fixture(filename);
  const requested = f.service.requestCode({email:'a@example.test',clientNonce:nonce}); const code = f.mail[0].code;
  assert.throws(()=>f.service.verifyCode({challengeId:requested.challengeId,code,clientNonce:'wrong-nonce-123456'}),/verification-failed/);
  assert.equal(f.repository.database.prepare('SELECT attempts FROM email_challenges').get().attempts,4);
  f.repository.close(); f = fixture(filename); t.after(()=>f.repository.close());
  for (let index=0; index<4;index++) assert.throws(()=>f.service.verifyCode({challengeId:requested.challengeId,code:code==='000000'?'000001':'000000',clientNonce:nonce}),/verification-failed/);
  assert.throws(()=>f.service.verifyCode({challengeId:requested.challengeId,code,clientNonce:nonce}),/verification-failed/);
  const b = login(f,'b@example.test');
  assert.throws(()=>f.service.verifyCode({challengeId:b.challengeId,code:b.code,clientNonce:nonce}),/verification-failed/);
  const exp = f.service.requestCode({email:'expired@example.test',clientNonce:nonce}); const expCode=f.mail.at(-1).code;
  f.tick(600_000);
  assert.throws(()=>f.service.verifyCode({challengeId:exp.challengeId,code:expCode,clientNonce:nonce}),/verification-failed/);
});

test('restart preserves accounts/names/cooldown and rolling rate limits without raw rate keys',t=>{
  let f; const filename = temp(t,()=>f?.repository); f=fixture(filename);
  const account = login(f); f.service.setUsername(account.session.accessToken,{username:'Persistent'});
  f.repository.close(); f=fixture(filename); t.after(()=>f.repository.close());
  assert.equal(f.service.me(account.session.accessToken).username,'Persistent');
  assert.throws(()=>f.service.requestCode({email:'ALICE@example.test',clientNonce:nonce}),/request-unavailable/);
  for(let index=0;index<2;index++){f.tick(60_000);f.service.requestCode({email:'alice@example.test',clientNonce:nonce});}
  f.tick(60_000); assert.throws(()=>f.service.requestCode({email:'alice@example.test',clientNonce:nonce}),/request-unavailable/);
  assert.ok(!JSON.stringify(f.repository.database.prepare('SELECT * FROM rate_limits').all()).includes('alice'));
  f.tick(3_600_000);const again=login(f);assert.equal(again.account.id,account.account.id);
});

test('global delivery cap includes new addresses and persists',t=>{
  let f;const filename=temp(t,()=>f?.repository);f=fixture(filename);
  for(let index=0;index<30;index++) f.service.requestCode({email:`user${index}@example.test`,clientNonce:nonce});
  f.repository.close();f=fixture(filename);t.after(()=>f.repository.close());
  assert.throws(()=>f.service.requestCode({email:'new@example.test',clientNonce:nonce}),/request-unavailable/);
  assert.equal(f.mail.length,0);
});

test('rotation atomically invalidates old access/refresh, expiry and logout revoke',t=>{
  const f=fixture();t.after(()=>f.repository.close());const old=login(f);
  f.tick(900_000);assert.throws(()=>f.service.me(old.session.accessToken),/authentication-required/);
  const fresh=f.service.renew({refreshToken:old.session.refreshToken});
  assert.throws(()=>f.service.renew({refreshToken:old.session.refreshToken}),/authentication-required/);
  assert.equal(f.service.me(fresh.session.accessToken).id,old.account.id);
  f.service.logout(fresh.session.accessToken);
  assert.throws(()=>f.service.me(fresh.session.accessToken),/authentication-required/);
  assert.throws(()=>f.service.renew({refreshToken:fresh.session.refreshToken}),/authentication-required/);
  const second=login(f,'second@example.test');f.tick(30*24*60*60_000);
  assert.throws(()=>f.service.renew({refreshToken:second.session.refreshToken}),/authentication-required/);
});

test('session issuance failure rolls back challenge consumption, account creation and renewal',t=>{
  const f=fixture();t.after(()=>f.repository.close());
  const req=f.service.requestCode({email:'rollback@example.test',clientNonce:nonce});const code=f.mail[0].code;
  f.repository.database.exec("CREATE TRIGGER reject_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  assert.throws(()=>f.service.verifyCode({challengeId:req.challengeId,code,clientNonce:nonce}),/fixture failure/);
  assert.equal(f.repository.database.prepare('SELECT count(*) AS count FROM accounts').get().count,0);
  assert.equal(f.repository.database.prepare('SELECT consumed,attempts FROM email_challenges').get().consumed,0);
  assert.equal(f.repository.database.prepare('SELECT consumed,attempts FROM email_challenges').get().attempts,5);
  f.repository.database.exec('DROP TRIGGER reject_session');
  const result=f.service.verifyCode({challengeId:req.challengeId,code,clientNonce:nonce});
  f.repository.database.exec("CREATE TRIGGER reject_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'fixture failure'); END");
  assert.throws(()=>f.service.renew({refreshToken:result.session.refreshToken}),/fixture failure/);
  assert.equal(f.service.me(result.session.accessToken).id,result.account.id);
  f.repository.database.exec('DROP TRIGGER reject_session');
  assert.ok(f.service.renew({refreshToken:result.session.refreshToken}));
});

test('transaction nesting/FK rollback, async callback and unknown/demo schemas refused',t=>{
  const f=fixture();t.after(()=>f.repository.close());
  assert.throws(()=>f.repository.transaction(db=>{db.prepare('INSERT INTO accounts (id,created_at) VALUES (?,?)').run('temp',1);f.repository.transaction(()=>{throw new Error('rollback');});}),/rollback/);
  assert.equal(f.repository.database.prepare('SELECT count(*) AS count FROM accounts').get().count,0);
  assert.throws(()=>f.repository.database.prepare('INSERT INTO account_emails VALUES (?,?,?)').run('unknown','a@example.test',1),/FOREIGN KEY/);
  assert.throws(()=>f.repository.transaction(()=>Promise.resolve()),/synchronous/);
  let asyncExecuted=false;
  assert.throws(()=>f.repository.transaction(async()=>{asyncExecuted=true;}),/synchronous/);
  assert.equal(asyncExecuted,false);
  const filename=temp(t);const db=new DatabaseSync(filename);db.exec('CREATE TABLE demo_state (id INTEGER)');db.close();
  assert.throws(()=>new AccountRepository({filename}),/unsupported-account-schema/);
});

test('two repository connections enforce username uniqueness and altered schemas are rejected',t=>{
  let f;const filename=temp(t,()=>f?.repository);f=fixture(filename);
  const alice=login(f);const bob=login(f,'bob@example.test');
  const other=fixture(filename);t.after(()=>other.repository.close());
  f.service.setUsername(alice.session.accessToken,{username:'UniqueName'});
  assert.throws(()=>other.service.setUsername(bob.session.accessToken,{username:'uniquename'}),/username-unavailable/);
  assert.equal(other.service.me(bob.session.accessToken).username,null);
  other.repository.close();f.repository.close();
  const db=new DatabaseSync(filename);db.exec('CREATE TABLE unknown_scope (id TEXT)');db.close();
  assert.throws(()=>new AccountRepository({filename}),/unsupported-account-schema/);
});

test('fake sink failure rolls back challenge/rate counters and blocked accounts lose all authority',t=>{
  const f=fixture();t.after(()=>f.repository.close());
  const unavailable=new AccountService({repository:f.repository,hmacKey:key,mailSink:()=>{throw new Error('fake-sink-failure');},now:f.time});
  assert.throws(()=>unavailable.requestCode({email:'a@example.test',clientNonce:nonce}),/fake-sink-failure/);
  assert.equal(f.repository.database.prepare('SELECT count(*) AS count FROM email_challenges').get().count,0);
  assert.equal(f.repository.database.prepare('SELECT count(*) AS count FROM rate_limits').get().count,0);
  const alice=login(f);f.repository.database.prepare("UPDATE accounts SET state='blocked' WHERE id=?").run(alice.account.id);
  assert.throws(()=>f.service.resolvePrincipal(alice.session.accessToken),/authentication-required/);
  assert.throws(()=>f.service.renew({refreshToken:alice.session.refreshToken}),/authentication-required/);
  f.tick(60_000);const req=f.service.requestCode({email:'alice@example.test',clientNonce:nonce});
  assert.throws(()=>f.service.verifyCode({challengeId:req.challengeId,code:f.mail.at(-1).code,clientNonce:nonce}),/verification-failed/);
});

test('explicit fixture cleanup keeps live limits and expires private challenge records after grace',t=>{
  const f=fixture();t.after(()=>f.repository.close());const alice=login(f);
  assert.equal(f.service.cleanupExpired().challenges,0);
  assert.throws(()=>f.service.requestCode({email:'alice@example.test',clientNonce:nonce}),/request-unavailable/);
  f.service.logout(alice.session.accessToken);assert.equal(f.service.cleanupExpired().sessions,1);
  f.tick(24*60*60_000+600_000);
  assert.equal(f.service.cleanupExpired().challenges,1);
  assert.equal(f.repository.database.prepare('SELECT count(*) AS count FROM rate_limits').get().count,0);
  assert.throws(()=>f.service.verifyCode({challengeId:alice.challengeId,code:alice.code,clientNonce:nonce}),/verification-failed/);
});

test('expired access permits only exact-session idempotent logout and denies renewal afterward',t=>{
  const f=fixture();t.after(()=>f.repository.close());const alice=login(f);const bob=login(f,'bob@example.test');
  f.tick(900_000);
  assert.throws(()=>f.service.me(alice.session.accessToken),/authentication-required/);
  assert.throws(()=>f.service.setReplyEmail(alice.session.accessToken,{enabled:true}),/authentication-required/);
  assert.throws(()=>f.service.setUsername(alice.session.accessToken,{username:'ExpiredUser'}),/authentication-required/);
  assert.throws(()=>f.service.logout('unknown-token'),/authentication-required/);
  assert.deepEqual(f.service.logout(alice.session.accessToken),{loggedOut:true});
  assert.deepEqual(f.service.logout(alice.session.accessToken),{loggedOut:true});
  assert.throws(()=>f.service.renew({refreshToken:alice.session.refreshToken}),/authentication-required/);
  assert.equal(f.service.renew({refreshToken:bob.session.refreshToken}).account.id,bob.account.id);
});

test('reopen refuses extra triggers, views and user-defined indexes',t=>{
  for(const sql of [
    "CREATE TRIGGER unexpected_behavior AFTER INSERT ON accounts BEGIN UPDATE accounts SET reply_email=1; END",
    'CREATE VIEW unexpected_projection AS SELECT * FROM accounts',
    'CREATE INDEX unexpected_index ON accounts(created_at)'
  ]) {
    const filename=temp(t);const f=fixture(filename);f.repository.database.exec(sql);f.repository.close();
    assert.throws(()=>new AccountRepository({filename}),/unsupported-account-schema/);
  }
});
