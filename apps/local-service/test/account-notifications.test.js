import test from 'node:test';
import assert from 'node:assert/strict';
import { AccountRepository } from '../src/accounts/account-repository.js';
import { ReplyNotificationOutbox, FakeReplyMailSink, initializeReplyOutbox,
  directReplyRecipient } from '../src/accounts/reply-notifications.js';

const human = (id, ownerAccountId, parentId = null) => ({ id, parentId, ownerAccountId,
  initiatedByAccountId: ownerAccountId, authorKind: 'human', provenance: 'app-human',
  state: 'published', visible: true, canonicalTopicId: 'topic', discussionId: 'discussion' });
const agent = (id, owner, parent) => ({ ...human(id, owner, parent), authorKind: 'agent', provenance: 'app-ai' });
function fixture(t, options = {}) {
  const repository = new AccountRepository();
  t.after(() => repository.close());
  initializeReplyOutbox(repository);
  for (const id of ['alice', 'bob', 'carol']) {
    repository.database.prepare('INSERT INTO accounts(id,reply_email,created_at) VALUES (?,1,0)').run(id);
    repository.database.prepare('INSERT INTO account_emails(account_id,email,verified_at) VALUES (?,?,0)').run(id, `${id}@mail.example.test`);
  }
  const posts = new Map([['parent', human('parent', 'alice')], ['reply', human('reply', 'bob', 'parent')]]);
  let now = 1_000;
  const sink = options.sink || new FakeReplyMailSink();
  const outbox = new ReplyNotificationOutbox(repository, { readContribution: id => posts.get(id),
    sink, now: () => now, unsubscribeKey: Buffer.alloc(32, 7), ...options });
  return { repository, posts, sink, outbox, advance: value => { now += value; },
    rows: () => repository.database.prepare('SELECT * FROM account_reply_outbox ORDER BY created_at,id').all() };
}

test('direct parent recipient matrix derives ownership and trusted AI initiation', () => {
  const cases = [
    ['someone replies to my human', human('reply', 'bob', 'parent'), human('parent', 'alice'), 'alice'],
    ['someone replies to my AI', human('reply', 'bob', 'parent'), agent('parent', 'alice'), 'alice'],
    ['own human reply', human('reply', 'alice', 'parent'), human('parent', 'alice'), null],
    ['own sparkle to own human', agent('reply', 'alice', 'parent'), human('parent', 'alice'), null],
    ['other user AI to me', agent('reply', 'bob', 'parent'), human('parent', 'alice'), 'alice'],
    ['my AI to another', agent('reply', 'alice', 'parent'), human('parent', 'bob'), 'bob'],
    ['deeper target only', human('reply', 'carol', 'nested'), human('nested', 'bob', 'parent'), 'bob'],
    ['not direct parent', human('reply', 'bob', 'nested'), human('parent', 'alice'), null],
    ['missing AI provenance', { ...agent('reply', 'bob', 'parent'), provenance: null }, human('parent', 'alice'), null],
    ['missing AI initiator', { ...agent('reply', 'bob', 'parent'), initiatedByAccountId: null }, human('parent', 'alice'), null],
    ['forged AI initiator', { ...agent('reply', 'bob', 'parent'), initiatedByAccountId: 'carol' }, human('parent', 'alice'), null],
    ['forged human initiator', { ...human('reply', 'bob', 'parent'), initiatedByAccountId: 'carol' }, human('parent', 'alice'), null],
    ['legacy parent', human('reply', 'bob', 'parent'), { ...human('parent', 'alice'), provenance: 'demo' }, null],
    ['legacy reply', { ...human('reply', 'bob', 'parent'), provenance: 'demo' }, human('parent', 'alice'), null],
    ['withdrawn parent', human('reply', 'bob', 'parent'), { ...human('parent', 'alice'), state: 'withdrawn' }, null],
    ['invisible reply', { ...human('reply', 'bob', 'parent'), visible: false }, human('parent', 'alice'), null],
    ['different topic', { ...human('reply', 'bob', 'parent'), canonicalTopicId: 'other' }, human('parent', 'alice'), null],
    ['different discussion', { ...human('reply', 'bob', 'parent'), discussionId: 'other' }, human('parent', 'alice'), null],
  ];
  for (const [name, reply, parent, expected] of cases) assert.equal(directReplyRecipient(reply, parent), expected, name);
});

test('deduplication, no edits/captures, minimal SQL payload, and cross-account recipient', t => {
  const f = fixture(t);
  assert.equal(f.outbox.enqueueReply({ replyId: 'reply', recipientId: 'carol' }), true);
  assert.equal(f.outbox.enqueueReply({ replyId: 'reply' }), false);
  for (const event of ['edited', 'captured', 'retry']) assert.equal(f.outbox.enqueueReply({ replyId: 'reply', event }), false);
  const row = f.rows()[0];
  assert.equal(row.recipient_id, 'alice');
  assert(!JSON.stringify(row).includes('@'));
  assert(!Object.keys(row).some(key => /body|email|url|prompt/.test(key)));
});

test('successful canonical commit and queue share SQL transaction; outbox error rolls post back', t => {
  const f = fixture(t);
  f.repository.database.exec('CREATE TABLE fixture_posts(id TEXT PRIMARY KEY) STRICT');
  const original = f.outbox.readContribution;
  f.outbox.readContribution = id => id === 'reply' && !f.repository.database.prepare('SELECT id FROM fixture_posts WHERE id=?').get(id) ? null : original(id);
  const commitReply = () => { f.repository.database.prepare('INSERT INTO fixture_posts VALUES (?)').run('reply'); return f.posts.get('reply'); };
  f.repository.database.exec("CREATE TRIGGER fixture_outbox_failure BEFORE INSERT ON account_reply_outbox BEGIN SELECT RAISE(ABORT,'fixture-queue-failure'); END");
  assert.throws(() => f.outbox.commitReplyAndQueue({ commitReply }), /fixture-queue-failure/);
  assert.equal(f.repository.database.prepare('SELECT COUNT(*) AS n FROM fixture_posts').get().n, 0);
  assert.equal(f.rows().length, 0);
  f.repository.database.exec('DROP TRIGGER fixture_outbox_failure');
  f.outbox.commitReplyAndQueue({ commitReply });
  assert.equal(f.rows().length, 1);
  assert.equal(f.repository.database.prepare('SELECT COUNT(*) AS n FROM fixture_posts').get().n, 1);
});

test('opt-out, account deletion/block, withdrawn content and moderation cancel before send', async t => {
  for (const revoke of [
    f => f.repository.database.prepare('UPDATE accounts SET reply_email=0 WHERE id=?').run('alice'),
    f => f.repository.database.prepare('UPDATE accounts SET state=? WHERE id=?').run('deleted', 'alice'),
    f => f.repository.database.prepare('UPDATE accounts SET state=? WHERE id=?').run('blocked', 'alice'),
    f => f.repository.database.prepare('UPDATE accounts SET state=? WHERE id=?').run('deleted', 'bob'),
    f => { f.posts.get('parent').state = 'withdrawn'; },
    f => { f.posts.get('reply').state = 'deleted'; },
    f => { f.outbox.canNotify = () => false; },
    f => { f.posts.get('parent').ownerAccountId = 'carol'; },
  ]) {
    const f = fixture(t);
    f.outbox.enqueueReply({ replyId: 'reply' });
    revoke(f);
    await f.outbox.runOnce();
    assert.equal(f.rows()[0].state, 'cancelled');
    assert.equal(f.sink.messages.length, 0);
  }
});

test('current verified address and stable account ownership survive username changes', async t => {
  const f = fixture(t);
  f.outbox.enqueueReply({ replyId: 'reply' });
  f.repository.database.prepare('UPDATE account_emails SET email=? WHERE account_id=?').run('new@mail.example.test', 'alice');
  f.repository.database.prepare('UPDATE accounts SET username=?,username_key=? WHERE id=?').run('newname', 'newname', 'alice');
  await f.outbox.runOnce();
  assert.equal(f.sink.messages[0].to, 'new@mail.example.test');
  assert.equal(f.rows()[0].state, 'sent');
  assert(!JSON.stringify(f.sink.messages[0]).includes('parent'));
});

test('missing verified address excludes notification', t => {
  const f = fixture(t);
  f.repository.database.prepare('DELETE FROM account_emails WHERE account_id=?').run('alice');
  assert.equal(f.outbox.enqueueReply({ replyId: 'reply' }), false);
});

test('preference change between lease acquisition and send cancels the delivery', async t => {
  const f = fixture(t);
  f.outbox.enqueueReply({ replyId: 'reply' });
  const originalClaim = f.outbox.claim.bind(f.outbox);
  f.outbox.claim = () => {
    const result = originalClaim();
    f.repository.database.prepare('UPDATE accounts SET reply_email=0 WHERE id=?').run('alice');
    return result;
  };
  assert.equal((await f.outbox.runOnce()).status, 'cancelled');
  assert.equal(f.sink.messages.length, 0);
  assert.equal(f.rows()[0].state, 'cancelled');
});

test('canonical route mutation between claim and send cancels old destination', async t => {
  const f = fixture(t);
  f.outbox.enqueueReply({ replyId: 'reply' });
  const originalClaim = f.outbox.claim.bind(f.outbox);
  f.outbox.claim = () => {
    const result = originalClaim();
    f.posts.get('reply').discussionId = 'new-discussion';
    f.posts.get('parent').discussionId = 'new-discussion';
    return result;
  };
  assert.equal((await f.outbox.runOnce()).status, 'cancelled');
  assert.equal(f.sink.messages.length, 0);
});

test('concurrent workers hold one lease; expired lease is ambiguous and never auto-retried', async t => {
  let finish;
  class HeldSink extends FakeReplyMailSink { async send() { return new Promise(resolve => { finish = resolve; }); } }
  const f = fixture(t, { sink: new HeldSink() });
  f.outbox.enqueueReply({ replyId: 'reply' });
  const first = f.outbox.runOnce();
  assert.deepEqual(await f.outbox.runOnce(), { status: 'idle' });
  assert.equal(f.rows()[0].attempts, 1);
  f.advance(60_001);
  assert.deepEqual(await f.outbox.runOnce(), { status: 'idle' });
  assert.equal(f.rows()[0].state, 'ambiguous');
  finish({ status: 'delivered' });
  await first;
  assert.equal(f.rows()[0].state, 'ambiguous');
});

test('certified non-delivery retries with backoff and stable key, bounded attempts', async t => {
  class FailureSink extends FakeReplyMailSink {
    async send(message) { this.messages.push(message); return { status: 'not-delivered' }; }
  }
  const f = fixture(t, { sink: new FailureSink() });
  f.outbox.enqueueReply({ replyId: 'reply' });
  assert.equal((await f.outbox.runOnce()).status, 'retry');
  assert.equal((await f.outbox.runOnce()).status, 'idle');
  f.advance(30_000);
  await f.outbox.runOnce();
  f.advance(60_000);
  await f.outbox.runOnce();
  assert.equal(f.rows()[0].state, 'failed');
  assert.equal(new Set(f.sink.messages.map(message => message.idempotencyKey)).size, 1);
  assert.equal(f.rows()[0].attempts, 3);
});

test('ordinary thrown failures and ambiguous responses do not retry', async t => {
  for (const throwFailure of [true, false]) {
    class AmbiguousSink extends FakeReplyMailSink {
      async send() { if (throwFailure) throw new Error('timeout'); return { status: 'unknown' }; }
    }
    const f = fixture(t, { sink: new AmbiguousSink() });
    f.outbox.enqueueReply({ replyId: 'reply' });
    assert.equal((await f.outbox.runOnce()).status, 'ambiguous');
    f.advance(1_000_000);
    assert.equal((await f.outbox.runOnce()).status, 'idle');
  }
});

test('ambiguous delivery consumes recipient cap; new notifications cannot form a blast', async t => {
  class AmbiguousSink extends FakeReplyMailSink { async send() { return { status: 'unknown' }; } }
  const f = fixture(t, { sink: new AmbiguousSink(), recipientCap: 1 });
  f.outbox.enqueueReply({ replyId: 'reply' });
  assert.equal((await f.outbox.runOnce()).status, 'ambiguous');
  f.posts.set('reply2', human('reply2', 'bob', 'parent'));
  f.outbox.enqueueReply({ replyId: 'reply2' });
  assert.equal((await f.outbox.runOnce()).status, 'idle');
});

test('coalescing sends minimal reply count once; per-recipient cap limits further mail', async t => {
  const f = fixture(t, { recipientCap: 1 });
  for (const id of ['reply', 'reply2', 'reply3']) {
    f.posts.set(id, human(id, 'bob', 'parent'));
    f.outbox.enqueueReply({ replyId: id });
  }
  assert.equal((await f.outbox.runOnce()).count, 3);
  assert.equal(f.sink.messages.length, 1);
  f.posts.set('reply4', human('reply4', 'bob', 'parent'));
  f.outbox.enqueueReply({ replyId: 'reply4' });
  assert.equal((await f.outbox.runOnce()).status, 'idle');
  f.advance(3_600_001);
  assert.equal((await f.outbox.runOnce()).status, 'sent');
});

test('unsubscribe is purpose-specific, tamper-resistant, expires and only disables reply mail', t => {
  const f = fixture(t);
  f.outbox.enqueueReply({ replyId: 'reply' });
  const token = f.outbox.issueUnsubscribe('alice');
  assert.equal(f.outbox.unsubscribe(`${token}broken`), false);
  const [payload, signature] = token.split('.');
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url')), accountId: 'bob' })).toString('base64url');
  assert.equal(f.outbox.unsubscribe(`${forged}.${signature}`), false);
  assert.equal(f.outbox.unsubscribe(token), true);
  assert.equal(f.repository.database.prepare('SELECT reply_email FROM accounts WHERE id=?').get('alice').reply_email, 0);
  assert.equal(f.repository.database.prepare('SELECT reply_email FROM accounts WHERE id=?').get('bob').reply_email, 1);
  assert.equal(f.rows()[0].state, 'cancelled');
  const expiring = f.outbox.issueUnsubscribe('bob');
  f.advance(31 * 86_400_000);
  assert.equal(f.outbox.unsubscribe(expiring), false);
});

test('worker admits only fixture sink/origin and bounded controls; links encode canonical destination', async t => {
  const f = fixture(t);
  assert.throws(() => new ReplyNotificationOutbox(f.repository, { readContribution: () => null, sink: { send() {} } }), /fake-sink-required/);
  assert.throws(() => new ReplyNotificationOutbox(f.repository, { readContribution: () => null, platformOrigin: 'https://evil.example/' }), /fixture-origin-required/);
  assert.throws(() => new ReplyNotificationOutbox(f.repository, { readContribution: () => null, coalesceLimit: 21 }), /worker-bound-exceeded/);
  f.posts.get('parent').discussionId = '../?source=https://evil.example';
  f.posts.get('reply').discussionId = f.posts.get('parent').discussionId;
  f.outbox.enqueueReply({ replyId: 'reply' });
  await f.outbox.runOnce();
  assert.equal(new URL(f.sink.messages[0].conversationUrl).origin, 'https://discussion.example.test');
  assert.equal(new URL(f.sink.messages[0].conversationUrl).search, '');
});
