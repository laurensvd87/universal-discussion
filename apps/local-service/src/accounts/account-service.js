import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { AccountError } from './account-errors.js';

const MINUTE = 60_000;
const RESERVED = new Set(['admin','administrator','system','support','moderator','root','robot','ai','deleted','anonymous']);
function shape(input, fields) {
  if (!input || typeof input !== 'object' || ![Object.prototype,null].includes(Object.getPrototypeOf(input))) throw new AccountError();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !fields.includes(key) || !('value' in descriptors[key])) || fields.some(key => !descriptors[key])) throw new AccountError();
  return Object.fromEntries(fields.map(key => [key,descriptors[key].value]));
}
function string(value, max = 1024) {
  if (typeof value !== 'string' || !value.length || value.length > max) throw new AccountError();
  return value;
}
export class AccountService {
  constructor({ repository, hmacKey, mailSink, fixtureOnly = true, now = Date.now }) {
    if (!(hmacKey instanceof Uint8Array) || hmacKey.length < 32 || typeof mailSink !== 'function' || fixtureOnly !== true) throw new Error('synthetic-account-configuration-required');
    this.repository = repository;
    this.db = repository.database;
    this.key = Buffer.from(hmacKey);
    this.mailSink = mailSink;
    this.now = now;
  }
  digest(kind, value) { return createHmac('sha256',this.key).update(`${kind}\0${value}`).digest('hex'); }
  publicAccount(row) { return { id:row.id, username:row.username, state:row.state, replyEmail:row.reply_email === 1 }; }
  requestCode(input) {
    const {email:rawEmail,clientNonce} = shape(input,['email','clientNonce']);
    const email = string(rawEmail,254).trim().toLowerCase();
    string(clientNonce,256);
    if (clientNonce.length < 16 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.test$/.test(email)) throw new AccountError();
    const timestamp = this.now();
    const id = randomUUID();
    const code = String(randomInt(0,1_000_000)).padStart(6,'0');
    this.repository.transaction(() => {
      const addressKey = this.digest('address',email);
      const cooldownKey = this.digest('cooldown',email);
      const latest = this.db.prepare('SELECT bucket FROM rate_limits WHERE key=? ORDER BY bucket DESC LIMIT 1').get(cooldownKey);
      if (latest && timestamp - latest.bucket < MINUTE) throw new AccountError('request-unavailable');
      for (const [key,limit] of [[addressKey,3],[this.digest('global','login'),30]]) {
        const count = this.db.prepare('SELECT COALESCE(SUM(count),0) AS count FROM rate_limits WHERE key=? AND bucket>?').get(key,timestamp-60*MINUTE).count;
        if (count >= limit) throw new AccountError('request-unavailable');
        this.db.prepare('INSERT INTO rate_limits VALUES (?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET count=count+1').run(key,timestamp);
      }
      this.db.prepare('INSERT INTO rate_limits VALUES (?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET count=count+1').run(cooldownKey,timestamp);
      // Fixture contact is retained privately for first verification; never returned publicly.
      this.db.prepare('INSERT INTO email_challenges VALUES (?,?,?,?,?,?,?,5,0)').run(id,addressKey,email,this.digest('code',`${id}:${code}`),this.digest('client',clientNonce),timestamp,timestamp+10*MINUTE);
      const result = this.mailSink({email,code,challengeId:id,expiresAt:timestamp+10*MINUTE});
      if (result && typeof result.then === 'function') throw new Error('synchronous-fake-mail-required');
    });
    return {challengeId:id,expiresIn:600};
  }
  session(accountId) {
    const timestamp = this.now();
    const accessToken = randomBytes(32).toString('base64url');
    const refreshToken = randomBytes(32).toString('base64url');
    const accessExpiresAt = timestamp+15*MINUTE;
    const refreshExpiresAt = timestamp+30*24*60*MINUTE;
    this.db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,?,0)').run(randomUUID(),accountId,this.digest('access',accessToken),this.digest('refresh',refreshToken),accessExpiresAt,refreshExpiresAt);
    return {accessToken,refreshToken,accessExpiresAt,refreshExpiresAt};
  }
  verifyCode(input) {
    const {challengeId,code,clientNonce} = shape(input,['challengeId','code','clientNonce']);
    string(challengeId,128); string(code,6); string(clientNonce,256);
    const outcome = this.repository.transaction(() => {
      const row = this.db.prepare('SELECT * FROM email_challenges WHERE id=?').get(challengeId);
      if (!row || row.consumed || row.attempts === 0 || row.expires_at <= this.now()) return null;
      // Attempts include nonce failures and malformed six-character codes.
      this.db.prepare('UPDATE email_challenges SET attempts=attempts-1 WHERE id=?').run(challengeId);
      const equal = (left,right) => timingSafeEqual(Buffer.from(left,'hex'),Buffer.from(right,'hex'));
      if (!/^\d{6}$/.test(code) || !equal(row.client_digest,this.digest('client',clientNonce)) || !equal(row.code_digest,this.digest('code',`${challengeId}:${code}`))) return null;
      let account = this.db.prepare('SELECT accounts.* FROM accounts JOIN account_emails ON accounts.id=account_emails.account_id WHERE email=?').get(row.email);
      if (account && account.state !== 'active') return null;
      if (!account) {
        const id = randomUUID();
        this.db.prepare('INSERT INTO accounts (id,created_at) VALUES (?,?)').run(id,this.now());
        this.db.prepare('INSERT INTO account_emails VALUES (?,?,?)').run(id,row.email,this.now());
        account = this.db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
      }
      this.db.prepare('UPDATE email_challenges SET consumed=1 WHERE id=?').run(challengeId);
      return {account:this.publicAccount(account),session:this.session(account.id)};
    });
    if (!outcome) throw new AccountError('verification-failed');
    return outcome;
  }
  authenticated(accessToken) {
    string(accessToken,128);
    const row = this.db.prepare('SELECT accounts.*,sessions.id AS session_id FROM sessions JOIN accounts ON accounts.id=sessions.account_id WHERE access_digest=? AND revoked=0 AND access_expires>? AND accounts.state=\'active\'').get(this.digest('access',accessToken),this.now());
    if (!row) throw new AccountError('authentication-required');
    return row;
  }
  me(accessToken) { return this.publicAccount(this.authenticated(accessToken)); }
  resolvePrincipal(accessToken) {
    const account = this.authenticated(accessToken);
    return {accountId:account.id,type:'human',state:account.state};
  }
  renew(input) {
    const {refreshToken} = shape(input,['refreshToken']); string(refreshToken,128);
    return this.repository.transaction(() => {
      const row = this.db.prepare('SELECT sessions.id,accounts.id AS account_id FROM sessions JOIN accounts ON accounts.id=sessions.account_id WHERE refresh_digest=? AND revoked=0 AND refresh_expires>? AND accounts.state=\'active\'').get(this.digest('refresh',refreshToken),this.now());
      if (!row) throw new AccountError('authentication-required');
      this.db.prepare('UPDATE sessions SET revoked=1 WHERE id=?').run(row.id);
      return {account:this.publicAccount(this.db.prepare('SELECT * FROM accounts WHERE id=?').get(row.account_id)),session:this.session(row.account_id)};
    });
  }
  logout(accessToken) {
    string(accessToken,128);
    this.repository.transaction(() => {
      // Exact possession is sufficient to revoke this retained session, even when
      // its access lifetime elapsed. It grants no account read/write authority.
      const row = this.db.prepare('SELECT id FROM sessions WHERE access_digest=?').get(this.digest('access',accessToken));
      if (!row) throw new AccountError('authentication-required');
      this.db.prepare('UPDATE sessions SET revoked=1 WHERE id=?').run(row.id);
    });
    return {loggedOut:true};
  }
  setUsername(accessToken,input) {
    const {username} = shape(input,['username']); string(username,24);
    if (!/^[A-Za-z0-9_]{3,24}$/.test(username) || RESERVED.has(username.toLowerCase())) throw new AccountError('username-unavailable');
    return this.repository.transaction(() => {
      const row = this.authenticated(accessToken);
      try { this.db.prepare('UPDATE accounts SET username=?,username_key=? WHERE id=?').run(username,username.toLowerCase(),row.id); }
      catch (error) { if (error.code === 'ERR_SQLITE_ERROR' && error.message.includes('UNIQUE')) throw new AccountError('username-unavailable'); throw error; }
      return this.me(accessToken);
    });
  }
  setReplyEmail(accessToken,input) {
    const {enabled} = shape(input,['enabled']);
    if (typeof enabled !== 'boolean') throw new AccountError();
    return this.repository.transaction(() => {
      const row = this.authenticated(accessToken);
      if (enabled && !this.db.prepare('SELECT account_id FROM account_emails WHERE account_id=?').get(row.id)) throw new AccountError();
      this.db.prepare('UPDATE accounts SET reply_email=? WHERE id=?').run(enabled?1:0,row.id);
      return this.me(accessToken);
    });
  }
  // Explicit fixture maintenance only: no worker/timer or running-service activation.
  // Expired challenges (including private unverified addresses) and sessions have
  // a 24-hour grace period; rolling-rate entries retain only their one-hour window.
  cleanupExpired() {
    const timestamp = this.now();
    return this.repository.transaction(() => ({
      challenges:this.db.prepare('DELETE FROM email_challenges WHERE expires_at<=?').run(timestamp-24*60*MINUTE).changes,
      sessions:this.db.prepare('DELETE FROM sessions WHERE revoked=1 OR refresh_expires<=?').run(timestamp-24*60*MINUTE).changes,
      rateLimits:this.db.prepare('DELETE FROM rate_limits WHERE bucket<=?').run(timestamp-60*MINUTE).changes
    }));
  }
}
