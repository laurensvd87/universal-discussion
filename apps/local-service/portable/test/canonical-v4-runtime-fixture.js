import { initializeCanonicalV4Runtime, migrateCanonicalV4 } from '../canonical-v4/index.js';

export const RUNTIME_FIXTURE_GENERATION = 'synthetic-canonical-v4-runtime';
export const RUNTIME_FIXTURE_REVISION = 7;
export const RUNTIME_FIXTURE_ACTOR = 'account-11111111-1111-4111-8111-111111111111';
export const RUNTIME_FIXTURE_STAMP = '2026-10-13T15:00:00.000Z';

const topic = (id, title) => ({ id, kind: 'general', title, createdAt: RUNTIME_FIXTURE_STAMP });
const discussion = (id, topicId) => ({ id, topicId });
const source = (id, suffix) => ({
  id,
  url: `https://example.org/canonical-v4-runtime/${suffix}`,
  title: `Runtime source ${suffix}`,
  embedding: null,
  provenance: 'synthetic-owner-local/v1',
});
const link = (sourceId, topicId) => ({ sourceId, topicId, method: 'manual-confirmed' });

export async function seedCanonicalV4RuntimeFixture(database) {
  await migrateCanonicalV4(database);
  const fixture = Object.freeze({
    generation: RUNTIME_FIXTURE_GENERATION,
    revision: RUNTIME_FIXTURE_REVISION,
    actorId: RUNTIME_FIXTURE_ACTOR,
    topicA: 'topic-runtime-a',
    topicB: 'topic-runtime-b',
    discussionA: 'discussion-runtime-a',
    discussionB: 'discussion-runtime-b',
    sourceA: 'source-runtime-a',
    sourceB: 'source-runtime-b',
    historicalSource: 'source-runtime-historical',
    historicalRoot: 'contribution-runtime-historical-root',
  });
  await database.transaction(async (tx) => {
    const { rows: occupied } = await tx.query('SELECT 1 FROM canonical_v4.meta LIMIT 1');
    if (occupied.length) throw new Error('Canonical v4 runtime fixture requires an empty target');
    const zeroDigest = '0'.repeat(64);
    await tx.query(`INSERT INTO canonical_v4.meta
      (singleton,target_format,source_format,state_schema,generation,revision,logical_sha256,counts_text)
      VALUES(true,'canonical-postgresql/v4-slice1','canonical-relational/v2','demo-state/v4',$1,$2,$3,'{}')`,
    [fixture.generation, fixture.revision, zeroDigest]);
    await tx.query(`INSERT INTO canonical_v4.import_ledger
      (source_format,state_schema,generation,revision,logical_sha256,counts_text)
      VALUES('canonical-relational/v2','demo-state/v4',$1,$2,$3,'{}')`,
    [fixture.generation, fixture.revision, zeroDigest]);

    const topics = [topic(fixture.topicA, 'Runtime A'), topic(fixture.topicB, 'Runtime B')];
    const discussions = [discussion(fixture.discussionA, fixture.topicA),
      discussion(fixture.discussionB, fixture.topicB)];
    const sources = [source(fixture.sourceA, 'a'), source(fixture.sourceB, 'b'),
      source(fixture.historicalSource, 'historical')];
    const ids = [
      ...topics.map(({ id }) => [id, 'topics']),
      ...discussions.map(({ id }) => [id, 'discussions']),
      ...sources.map(({ id }) => [id, 'sources']),
      [fixture.historicalRoot, 'contributions'],
    ];
    for (const [id, kind] of ids)
      await tx.query('INSERT INTO canonical_v4.id_registry(id,kind) VALUES($1,$2)', [id, kind]);
    for (let ordinal = 0; ordinal < topics.length; ordinal += 1) {
      const value = topics[ordinal];
      await tx.query(`INSERT INTO canonical_v4.topics
        (id,ordinal,payload,kind,title,created_at) VALUES($1,$2,$3,$4,$5,$6)`,
      [value.id, ordinal, JSON.stringify(value), value.kind, value.title, value.createdAt]);
    }
    for (let ordinal = 0; ordinal < discussions.length; ordinal += 1) {
      const value = discussions[ordinal];
      await tx.query(`INSERT INTO canonical_v4.discussions(id,topic_id,ordinal,payload)
        VALUES($1,$2,$3,$4)`, [value.id, value.topicId, ordinal, JSON.stringify(value)]);
    }
    for (let ordinal = 0; ordinal < sources.length; ordinal += 1) {
      const value = sources[ordinal];
      const { embedding: _embedding, ...payload } = value;
      await tx.query(`INSERT INTO canonical_v4.sources
        (id,ordinal,payload,url,title,provenance,has_embedding)
        VALUES($1,$2,$3,$4,$5,$6,false)`,
      [value.id, ordinal, JSON.stringify(payload), value.url, value.title, value.provenance]);
    }
    const links = [link(fixture.sourceA, fixture.topicA), link(fixture.sourceB, fixture.topicB),
      link(fixture.historicalSource, fixture.topicB)];
    for (let ordinal = 0; ordinal < links.length; ordinal += 1) {
      const value = links[ordinal];
      await tx.query(`INSERT INTO canonical_v4.source_links(source_id,topic_id,ordinal,payload,method)
        VALUES($1,$2,$3,$4,$5)`,
      [value.sourceId, value.topicId, ordinal, JSON.stringify(value), value.method]);
      await tx.query(`INSERT INTO canonical_v4.topic_memberships(source_id,topic_id,ordinal)
        VALUES($1,$2,0)`, [value.sourceId, value.topicId]);
    }

    // This root records a formerly valid Source origin in Topic A. The Source
    // is now primary-linked only to Topic B, exercising the exact grandfathered
    // reply-origin rule without inventing a current Topic-A membership.
    const historical = {
      id: fixture.historicalRoot,
      discussionId: fixture.discussionA,
      rootId: null,
      replyToId: null,
      authorId: fixture.actorId,
      actorType: 'human',
      visibility: 'local-public',
      withdrawn: false,
      createdAt: RUNTIME_FIXTURE_STAMP,
      originSourceId: fixture.historicalSource,
      anchor: { kind: 'topic', topicId: fixture.topicA },
      originalTopicId: fixture.topicA,
      learnedOrigin: false,
    };
    await tx.query(`INSERT INTO canonical_v4.contributions
      (id,discussion_id,root_id,reply_to_id,author_id,operator_id,origin_source_id,anchor_source_id,
       actor_type,visibility,withdrawn,created_at,revision_count,ordinal,payload)
      VALUES($1,$2,NULL,NULL,$3,NULL,$4,NULL,'human','local-public',false,$5,1,0,$6)`,
    [historical.id, historical.discussionId, historical.authorId, historical.originSourceId,
      historical.createdAt, JSON.stringify(historical)]);
    await tx.query(`INSERT INTO canonical_v4.revisions(contribution_id,ordinal,payload)
      VALUES($1,0,$2)`, [historical.id, JSON.stringify({ body: 'Historical root', createdAt: RUNTIME_FIXTURE_STAMP })]);
    await initializeCanonicalV4Runtime(tx);
  });
  return fixture;
}

export function runtimeRequest(fixture, requestId, command, revision = fixture.revision) {
  return {
    actorId: fixture.actorId,
    requestId,
    expected: { generation: fixture.generation, revision },
    command,
  };
}
