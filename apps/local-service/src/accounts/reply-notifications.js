// Inert fixture foundation: no imports into the running service and no network adapter.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export function initializeReplyOutbox(repository) {
  repository.database.exec(`CREATE TABLE IF NOT EXISTS account_reply_outbox (
    id TEXT PRIMARY KEY, reply_id TEXT NOT NULL, recipient_id TEXT NOT NULL REFERENCES accounts(id),
    topic_id TEXT NOT NULL, discussion_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind='direct-reply'),
    state TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, next_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0, batch_key TEXT, lease_token TEXT, lease_until INTEGER,
    sent_at INTEGER, last_attempt_at INTEGER, UNIQUE(reply_id,recipient_id,kind)
  ) STRICT;`);
}

function trustedContribution(post) {
  if (!post || post.state !== 'published' || post.visible !== true || !post.ownerAccountId ||
      !post.canonicalTopicId || !post.discussionId) return false;
  if (post.authorKind === 'human') return post.provenance === 'app-human' &&
    post.initiatedByAccountId === post.ownerAccountId;
  return post.authorKind === 'agent' && post.provenance === 'app-ai' &&
    post.initiatedByAccountId === post.ownerAccountId;
}

// The projection comes from a server repository, never from a request body.
export function directReplyRecipient(reply, parent) {
  if (!trustedContribution(reply) || !trustedContribution(parent) || reply.parentId !== parent.id ||
      reply.canonicalTopicId !== parent.canonicalTopicId || reply.discussionId !== parent.discussionId ||
      reply.ownerAccountId === parent.ownerAccountId ||
      reply.initiatedByAccountId === parent.ownerAccountId) return null;
  return parent.ownerAccountId;
}

export class FakeReplyMailSink {
  constructor() { this.messages = []; this.keys = new Set(); }
  async send(message) {
    if (!message.to.endsWith('.test')) throw new Error('fixture-address-required');
    if (!this.keys.has(message.idempotencyKey)) {
      this.keys.add(message.idempotencyKey);
      this.messages.push(structuredClone(message));
    }
    return { status: 'delivered' };
  }
}

export class ReplyNotificationOutbox {
  constructor(repository, { readContribution, canNotify = () => true,
    sink = new FakeReplyMailSink(), platformOrigin = 'https://discussion.example.test',
    now = () => Date.now(), leaseMs = 60_000, maxAttempts = 3, recipientCap = 3,
    capWindowMs = 3_600_000, coalesceLimit = 20, unsubscribeKey } = {}) {
    if (typeof readContribution !== 'function') throw new TypeError('authoritative-reader-required');
    // No real delivery adapter can be activated by this fixture module.
    if (!(sink instanceof FakeReplyMailSink)) throw new TypeError('fake-sink-required');
    if (platformOrigin !== 'https://discussion.example.test') throw new Error('fixture-origin-required');
    for (const value of [leaseMs, maxAttempts, recipientCap, capWindowMs, coalesceLimit]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError('invalid-worker-bound');
    }
    if (maxAttempts > 5 || recipientCap > 10 || coalesceLimit > 20) throw new RangeError('worker-bound-exceeded');
    if (unsubscribeKey && (!Buffer.isBuffer(unsubscribeKey) || unsubscribeKey.length < 32)) {
      throw new TypeError('unsubscribe-key-required');
    }
    Object.assign(this, { repository, readContribution, canNotify, sink, platformOrigin, now,
      leaseMs, maxAttempts, recipientCap, capWindowMs, coalesceLimit, unsubscribeKey });
  }

  eligible(replyId, recipientId) {
    const reply = this.readContribution(replyId);
    if (reply?.id !== replyId) return null;
    const parent = reply?.parentId ? this.readContribution(reply.parentId) : null;
    const recipient = directReplyRecipient(reply, parent);
    if (!recipient || (recipientId && recipient !== recipientId) || this.canNotify({ reply, parent, recipientId: recipient }) !== true) return null;
    if (!this.repository.database.prepare("SELECT id FROM accounts WHERE id=? AND state='active'").get(reply.ownerAccountId)) return null;
    const account = this.repository.database.prepare(`SELECT a.id,e.email FROM accounts a
      JOIN account_emails e ON e.account_id=a.id WHERE a.id=? AND a.state='active'
      AND a.reply_email=1 AND e.verified_at IS NOT NULL`).get(recipient);
    // Resolve the current private address only during the authoritative eligibility check.
    return account ? { reply, recipientId: recipient, email: account.email } : null;
  }

  enqueueReply({ replyId, event = 'created' }) {
    if (event !== 'created') return false;
    const eligible = this.eligible(replyId);
    if (!eligible) return false;
    const timestamp = this.now();
    return this.repository.database.prepare(`INSERT INTO account_reply_outbox
      (id,reply_id,recipient_id,topic_id,discussion_id,kind,created_at,next_at)
      VALUES (?,?,?,?,?,'direct-reply',?,?) ON CONFLICT(reply_id,recipient_id,kind) DO NOTHING`)
      .run(randomUUID(), replyId, eligible.recipientId, eligible.reply.canonicalTopicId,
        eligible.reply.discussionId, timestamp, timestamp).changes === 1;
  }

  commitReplyAndQueue({ commitReply }) {
    return this.repository.transaction(() => {
      const reply = commitReply();
      this.enqueueReply({ replyId: reply.id });
      return reply;
    });
  }

  claim() {
    return this.repository.transaction(() => {
      const db = this.repository.database;
      const timestamp = this.now();
      // A crashed/in-flight sender might already have delivered: do not resend automatically.
      db.prepare(`UPDATE account_reply_outbox SET state='ambiguous',lease_token=NULL,lease_until=NULL
        WHERE state='sending' AND lease_until<=?`).run(timestamp);
      const pending = db.prepare(`SELECT * FROM account_reply_outbox WHERE state='pending' AND next_at<=?
        ORDER BY created_at,id LIMIT 100`).all(timestamp);
      for (const row of pending) {
        if (!this.eligible(row.reply_id, row.recipient_id)) {
          db.prepare("UPDATE account_reply_outbox SET state='cancelled' WHERE id=?").run(row.id);
          continue;
        }
        const sent = db.prepare(`SELECT COUNT(DISTINCT batch_key) AS count FROM account_reply_outbox
          WHERE recipient_id=? AND last_attempt_at>? AND (? IS NULL OR batch_key<>?)`)
          .get(row.recipient_id, timestamp - this.capWindowMs, row.batch_key, row.batch_key).count;
        if (sent >= this.recipientCap || db.prepare("SELECT id FROM account_reply_outbox WHERE recipient_id=? AND state='sending'").get(row.recipient_id)) continue;
        const rows = pending.filter(item => item.recipient_id === row.recipient_id &&
          item.discussion_id === row.discussion_id && (row.batch_key ? item.batch_key === row.batch_key : !item.batch_key))
          .slice(0, this.coalesceLimit);
        const token = randomUUID();
        const key = row.batch_key || `reply-mail:${row.id}`;
        for (const item of rows) db.prepare(`UPDATE account_reply_outbox SET state='sending',batch_key=?,
          lease_token=?,lease_until=?,last_attempt_at=?,attempts=attempts+1 WHERE id=? AND state='pending'`)
          .run(key, token, timestamp + this.leaseMs, timestamp, item.id);
        return { rows, token, key };
      }
      return null;
    });
  }

  async runOnce() {
    const claim = this.claim();
    if (!claim) return { status: 'idle' };
    const eligible = [];
    // Recheck after leasing, immediately before invoking the fake adapter.
    for (const row of claim.rows) {
      const current = this.eligible(row.reply_id, row.recipient_id);
      if (!current || current.reply.canonicalTopicId !== row.topic_id || current.reply.discussionId !== row.discussion_id) {
        this.repository.database.prepare("UPDATE account_reply_outbox SET state='cancelled',lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?").run(row.id, claim.token);
      } else eligible.push({ row, current });
    }
    if (!eligible.length) return { status: 'cancelled' };
    let status = 'ambiguous';
    try {
      const result = await this.sink.send({ to: eligible[0].current.email,
        subject: 'You have a new reply', count: eligible.length,
        conversationUrl: `${this.platformOrigin}/discussions/${encodeURIComponent(eligible[0].row.discussion_id)}`,
        unsubscribeToken: this.unsubscribeKey ? this.issueUnsubscribe(eligible[0].row.recipient_id) : null,
        idempotencyKey: claim.key });
      if (result?.status === 'delivered') status = 'sent';
      else if (result?.status === 'not-delivered') status = 'retry';
    } catch (error) {
      // Only explicitly certified pre-delivery failures are safe to retry.
      if (error?.deliveryStatus === 'not-delivered') status = 'retry';
    }
    this.repository.transaction(() => {
      for (const { row } of eligible) {
        const attempts = row.attempts + 1;
        const nextState = status === 'retry' ? (attempts < this.maxAttempts ? 'pending' : 'failed') : status;
        this.repository.database.prepare(`UPDATE account_reply_outbox SET state=?,next_at=?,
          sent_at=?,lease_token=NULL,lease_until=NULL WHERE id=? AND state='sending' AND lease_token=?`)
          .run(nextState, this.now() + Math.min(3_600_000, 30_000 * 2 ** (attempts - 1)),
            nextState === 'sent' ? this.now() : null, row.id, claim.token);
      }
    });
    return { status, count: eligible.length };
  }

  issueUnsubscribe(accountId) {
    if (!this.unsubscribeKey) throw new Error('unsubscribe-key-required');
    const payload = Buffer.from(JSON.stringify({ purpose: 'reply-mail-off', accountId,
      expires: this.now() + 30 * 86_400_000, nonce: randomUUID() })).toString('base64url');
    return `${payload}.${createHmac('sha256', this.unsubscribeKey).update(payload).digest('base64url')}`;
  }

  unsubscribe(token) {
    if (!this.unsubscribeKey || typeof token !== 'string' || token.length > 2048) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    const expected = createHmac('sha256', this.unsubscribeKey).update(parts[0]).digest();
    const actual = Buffer.from(parts[1], 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
    let payload;
    try { payload = JSON.parse(Buffer.from(parts[0], 'base64url').toString()); } catch { return false; }
    if (payload.purpose !== 'reply-mail-off' || !Number.isSafeInteger(payload.expires) ||
        payload.expires <= this.now() || typeof payload.accountId !== 'string') return false;
    return this.repository.transaction(() => {
      const changed = this.repository.database.prepare('UPDATE accounts SET reply_email=0 WHERE id=?').run(payload.accountId).changes;
      this.repository.database.prepare("UPDATE account_reply_outbox SET state='cancelled' WHERE recipient_id=? AND state='pending'").run(payload.accountId);
      return changed === 1;
    });
  }
}
