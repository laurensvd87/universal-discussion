import { createHash, randomUUID } from 'node:crypto';
import { readRecord, readId, readText, readBody } from '../../src/domain/validation.js';
import { fail } from '../../src/domain/errors.js';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const sourceColumns = 'id, url, title, topic_id, discussion_id';
const sourceDto = (row) => ({ id: row.id, url: row.url, title: row.title, topicId: row.topic_id, discussionId: row.discussion_id });
const page = (rows, limit, dto = (row) => row) => ({ items: rows.slice(0, limit).map(dto), nextCursor: rows.length > limit ? rows[limit - 1].id : null });
function paging(cursor, limit, maximum = 100) {
  if (cursor !== null) readId(cursor);
  if (!Number.isInteger(limit) || limit < 1 || limit > maximum) fail('invalid', 'Invalid pagination');
}
function sourceUrl(value) {
  readText(value, 2048);
  let url;
  try { url = new URL(value); } catch { fail('invalid', 'Invalid Source URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
    !/\.(example|test)$/u.test(url.hostname)) fail('invalid', 'Only reserved synthetic Source URLs are allowed');
  return url.href;
}
function vectorText(value) {
  if (!Array.isArray(value) || value.length !== 384 || value.some((n) => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e10) ||
    !value.some((n) => Math.fround(n) !== 0)) fail('invalid', 'Invalid vector');
  return `[${value.map(Math.fround).join(',')}]`;
}
function commandPayload(kind, payload) {
  const keys = {
    'create-root': ['discussionId', 'sourceId', 'body', 'expectedVersion'],
    reply: ['discussionId', 'sourceId', 'replyToId', 'body', 'expectedVersion'],
    edit: ['discussionId', 'contributionId', 'body', 'expectedVersion'],
    withdraw: ['discussionId', 'contributionId', 'expectedVersion'],
  }[kind];
  if (!keys) fail('invalid', 'Unknown command');
  const record = readRecord(payload, keys);
  const result = {};
  for (const key of keys) {
    if (key === 'expectedVersion') {
      if (!Number.isSafeInteger(record[key]) || record[key] < 0 || record[key] >= 2147483647) fail('invalid', 'Invalid discussion version');
      result[key] = record[key];
    } else result[key] = key === 'body' ? readBody(record[key]) : readId(record[key]);
  }
  return result;
}

export function createPortableRepository({ database, now = () => new Date(), id = randomUUID }) {
  const timestamp = () => new Date(now()).toISOString();
  return {
    async health() {
      const { rows } = await database.query('SELECT version FROM portable_migrations ORDER BY version');
      if (rows.length !== 1 || rows[0].version !== 1) fail('unavailable', 'Database schema unavailable');
      return { schemaVersion: 1 };
    },
    async authenticate(token) {
      if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/u.test(token)) return null;
      const { rows } = await database.query('SELECT id, username FROM principals WHERE token_hash = $1', [digest(token)]);
      return rows[0] || null;
    },
    async seedSynthetic({ principals = [], topics = [], discussions = [], sources = [] }) {
      return database.transaction(async (tx) => {
        for (const value of principals) {
          const p = readRecord(value, ['id', 'username', 'token']);
          readId(p.id); readText(p.username, 64);
          if (typeof p.token !== 'string' || !/^[A-Za-z0-9_-]{43,128}$/u.test(p.token)) fail('invalid', 'Strong synthetic token required');
          await tx.query('INSERT INTO principals(id,username,token_hash) VALUES($1,$2,$3)', [p.id, p.username, digest(p.token)]);
        }
        for (const t of topics) {
          readRecord(t, ['id', 'title', 'public']); readId(t.id); readText(t.title, 256);
          if (typeof t.public !== 'boolean') fail('invalid', 'Explicit visibility required');
          await tx.query('INSERT INTO topics(id,title,public) VALUES($1,$2,$3)', [t.id, t.title, t.public]);
        }
        for (const d of discussions) {
          readRecord(d, ['id', 'topicId', 'public']); readId(d.id); readId(d.topicId);
          if (typeof d.public !== 'boolean') fail('invalid', 'Explicit visibility required');
          await tx.query('INSERT INTO discussions(id,topic_id,public) VALUES($1,$2,$3)', [d.id, d.topicId, d.public]);
        }
        for (const s of sources) {
          readRecord(s, ['id', 'url', 'title', 'topicId', 'discussionId', 'vector', 'model', 'extractor', 'public']);
          readId(s.id); readId(s.topicId); readId(s.discussionId); readText(s.title, 256); readText(s.model, 128); readText(s.extractor, 128);
          if (typeof s.public !== 'boolean') fail('invalid', 'Explicit visibility required');
          await tx.query('INSERT INTO sources(id,url,title,topic_id,discussion_id,embedding,model,extractor,public) VALUES($1,$2,$3,$4,$5,$6::vector,$7,$8,$9)',
            [s.id, sourceUrl(s.url), s.title, s.topicId, s.discussionId, vectorText(s.vector), s.model, s.extractor, s.public]);
        }
      });
    },
    async listTopics({ cursor = null, limit = 25 } = {}) {
      paging(cursor, limit);
      const { rows } = await database.query('SELECT id,title FROM topics WHERE public AND ($1::text IS NULL OR id > $1) ORDER BY id LIMIT $2', [cursor, limit + 1]);
      return page(rows, limit);
    },
    async listSources({ topicId, cursor = null, limit = 25 }) {
      readId(topicId); paging(cursor, limit);
      const { rows } = await database.query(`SELECT ${sourceColumns} FROM sources WHERE topic_id=$1 AND public AND EXISTS(SELECT 1 FROM topics WHERE id=$1 AND public) AND EXISTS(SELECT 1 FROM discussions d WHERE d.id=sources.discussion_id AND d.public) AND ($2::text IS NULL OR id>$2) ORDER BY id LIMIT $3`, [topicId, cursor, limit + 1]);
      return page(rows, limit, sourceDto);
    },
    async resolveSource({ url }) {
      const { rows } = await database.query(`SELECT ${sourceColumns} FROM sources WHERE url=$1 AND public AND EXISTS(SELECT 1 FROM topics t WHERE t.id=sources.topic_id AND t.public) AND EXISTS(SELECT 1 FROM discussions d WHERE d.id=sources.discussion_id AND d.public)`, [sourceUrl(url)]);
      return rows[0] ? sourceDto(rows[0]) : null;
    },
    async readDiscussion({ discussionId, cursor = null, limit = 25 }) {
      readId(discussionId); paging(cursor, limit);
      return database.transaction(async (tx) => {
        const { rows: discussions } = await tx.query('SELECT d.id,d.topic_id,d.version FROM discussions d JOIN topics t ON t.id=d.topic_id WHERE d.id=$1 AND d.public AND t.public FOR SHARE OF d', [discussionId]);
        if (!discussions.length) fail('not-found', 'Discussion unavailable');
        // Visible topology includes each live contribution and its tombstone ancestors.
        const { rows } = await tx.query(`WITH RECURSIVE visible AS (
          SELECT id,parent_id FROM contributions WHERE discussion_id=$1 AND NOT withdrawn
          UNION SELECT c.id,c.parent_id FROM contributions c JOIN visible v ON c.id=v.parent_id WHERE c.discussion_id=$1
        ) SELECT c.id,c.parent_id,c.root_id,c.source_id,c.body,c.withdrawn,c.created_at,p.username
          FROM contributions c JOIN principals p ON p.id=c.author_id WHERE c.discussion_id=$1
          AND c.id IN(SELECT id FROM visible) AND ($2::text IS NULL OR c.id>$2) ORDER BY c.id LIMIT $3`, [discussionId, cursor, limit + 1]);
        const d = discussions[0];
        return { discussion: { id: d.id, topicId: d.topic_id, version: d.version }, ...page(rows, limit, (r) => ({ id: r.id, parentId: r.parent_id, rootId: r.root_id, sourceId: r.source_id, body: r.body, withdrawn: r.withdrawn, createdAt: r.created_at, author: { username: r.username, kind: 'human' } })) };
      });
    },
    async findRelated({ sourceId, limit = 5 }) {
      readId(sourceId); paging(null, limit, 20);
      const { rows } = await database.query(`SELECT s.id,s.url,s.title,s.topic_id,s.discussion_id,1-(s.embedding <=> anchor.embedding) AS similarity
        FROM sources anchor JOIN sources s ON s.model=anchor.model AND s.extractor=anchor.extractor AND s.id<>anchor.id
        JOIN topics t ON t.id=s.topic_id JOIN discussions d ON d.id=s.discussion_id
        WHERE anchor.id=$1 AND anchor.public AND s.public AND t.public AND d.public
        AND EXISTS(SELECT 1 FROM topics atopic WHERE atopic.id=anchor.topic_id AND atopic.public)
        AND EXISTS(SELECT 1 FROM discussions ad WHERE ad.id=anchor.discussion_id AND ad.public)
        ORDER BY s.embedding <=> anchor.embedding, s.id LIMIT $2`, [sourceId, limit]);
      return { items: rows.map((r) => ({ ...sourceDto(r), similarity: Number(r.similarity) })) };
    },
    async command({ principal, requestId, kind, payload }) {
      readId(principal?.id); readId(requestId);
      const p = commandPayload(kind, payload);
      const hash = digest(JSON.stringify(p));
      return database.transaction(async (tx) => {
        // Serialize receipt races for this account/request pair without locking
        // unrelated discussions. PGlite serializes its one connection internally.
        if (tx.dialect === 'pg') await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [BigInt.asIntN(64, BigInt(`0x${digest(JSON.stringify([principal.id, requestId])).slice(0,16)}`)).toString()]);
        const { rows: actors } = await tx.query('SELECT id FROM principals WHERE id=$1', [principal.id]);
        if (!actors.length) fail('unauthorized', 'Authentication required');
        const { rows: receipts } = await tx.query('SELECT kind,payload_hash,response FROM command_receipts WHERE principal_id=$1 AND request_id=$2', [principal.id, requestId]);
        if (receipts.length) {
          if (receipts[0].kind !== kind || receipts[0].payload_hash !== hash) fail('conflict', 'Request ID already used');
          return receipts[0].response;
        }
        const { rows: ds } = await tx.query('SELECT d.id,d.topic_id,d.version FROM discussions d JOIN topics t ON t.id=d.topic_id WHERE d.id=$1 AND d.public AND t.public FOR UPDATE OF d', [p.discussionId]);
        if (!ds.length) fail('not-found', 'Discussion unavailable');
        const discussion = ds[0];
        if (discussion.version !== p.expectedVersion) fail('conflict', 'Discussion version changed');
        let contributionId, rootId;
        if (kind === 'create-root' || kind === 'reply') {
          const { rows: sources } = await tx.query('SELECT id FROM sources WHERE id=$1 AND topic_id=$2 AND discussion_id=$3 AND public', [p.sourceId, discussion.topic_id, discussion.id]);
          if (!sources.length) fail('forbidden', 'Invalid canonical Source');
          let parent = null;
          if (kind === 'reply') {
            const { rows } = await tx.query('SELECT c.id,c.root_id,r.source_id FROM contributions c JOIN contributions r ON r.id=c.root_id WHERE c.id=$1 AND c.discussion_id=$2 AND r.discussion_id=$2 AND NOT c.withdrawn', [p.replyToId, discussion.id]);
            parent = rows[0];
            if (!parent) fail('forbidden', 'Invalid parent lineage');
          }
          contributionId = readId(id()); rootId = parent?.root_id || contributionId;
          await tx.query('INSERT INTO contributions(id,discussion_id,source_id,author_id,parent_id,root_id,body,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)', [contributionId, discussion.id, p.sourceId, principal.id, parent?.id || null, rootId, p.body, timestamp()]);
          await tx.query('INSERT INTO contribution_revisions(contribution_id,version,body) VALUES($1,$2,$3)', [contributionId, discussion.version + 1, p.body]);
        } else {
          const { rows } = await tx.query('SELECT id,author_id,root_id,withdrawn FROM contributions WHERE id=$1 AND discussion_id=$2', [p.contributionId, discussion.id]);
          const target = rows[0];
          if (!target || target.author_id !== principal.id || target.withdrawn) fail('forbidden', 'Contribution unavailable for this author');
          contributionId = target.id; rootId = target.root_id;
          if (kind === 'edit') {
            await tx.query('UPDATE contributions SET body=$2 WHERE id=$1', [contributionId, p.body]);
            await tx.query('INSERT INTO contribution_revisions(contribution_id,version,body) VALUES($1,$2,$3)', [contributionId, discussion.version + 1, p.body]);
          } else {
            await tx.query('UPDATE contributions SET body=NULL,withdrawn=true WHERE id=$1', [contributionId]);
            await tx.query('DELETE FROM contribution_revisions WHERE contribution_id=$1', [contributionId]);
          }
        }
        const response = { contributionId, discussionId: discussion.id, rootId, version: discussion.version + 1 };
        await tx.query('UPDATE discussions SET version=version+1 WHERE id=$1', [discussion.id]);
        await tx.query('INSERT INTO command_receipts(principal_id,request_id,kind,payload_hash,response) VALUES($1,$2,$3,$4,$5::jsonb)', [principal.id, requestId, kind, hash, JSON.stringify(response)]);
        await tx.query("INSERT INTO jobs(id,principal_id,request_id,kind) VALUES($1,$2,$3,'bookkeeping')", [readId(id()), principal.id, requestId]);
        return response;
      });
    },
    async claimJob({ workerId, leaseSeconds = 30 }) {
      readId(workerId);
      if (!Number.isInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 300) fail('invalid', 'Invalid lease');
      return database.transaction(async (tx) => {
        const at = timestamp();
        await tx.query("UPDATE jobs SET state='failed',worker_id=NULL,lease_token=NULL,lease_until=NULL WHERE state='leased' AND lease_until<=$1 AND attempts>=3", [at]);
        const { rows } = await tx.query("SELECT id,kind,attempts FROM jobs WHERE attempts<3 AND (state='pending' OR (state='leased' AND lease_until<=$1)) ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1", [at]);
        if (!rows.length) return null;
        const job = rows[0]; const leaseToken = readId(id());
        await tx.query("UPDATE jobs SET state='leased',worker_id=$2,lease_token=$3,lease_until=$4,attempts=attempts+1 WHERE id=$1", [job.id, workerId, leaseToken, new Date(new Date(at).getTime() + leaseSeconds * 1000).toISOString()]);
        return { id: job.id, kind: job.kind, workerId, leaseToken, attempts: job.attempts + 1 };
      });
    },
    async completeJob({ jobId, workerId, leaseToken }) {
      readId(jobId); readId(workerId); readId(leaseToken);
      const result = await database.query("UPDATE jobs SET state='complete',worker_id=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1 AND worker_id=$2 AND lease_token=$3 AND state='leased' AND lease_until>$4 RETURNING id", [jobId, workerId, leaseToken, timestamp()]);
      return result.rows.length === 1;
    },
    async failJob({ jobId, workerId, leaseToken }) {
      readId(jobId); readId(workerId); readId(leaseToken);
      const result = await database.query("UPDATE jobs SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,worker_id=NULL,lease_token=NULL,lease_until=NULL WHERE id=$1 AND worker_id=$2 AND lease_token=$3 AND state='leased' AND lease_until>$4 RETURNING id", [jobId, workerId, leaseToken, timestamp()]);
      return result.rows.length === 1;
    },
  };
}
