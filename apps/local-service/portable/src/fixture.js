export function fixtureVector(x = 1, y = 0) {
  return [x, y, ...Array(382).fill(0)];
}

export async function seedFixture(repository, { tokens }) {
  const ids = { alex: 'synthetic-alex', blair: 'synthetic-blair', topic: 'topic-a', otherTopic: 'topic-b', discussion: 'discussion-a', otherDiscussion: 'discussion-b', source: 'source-a', sameTopicSource: 'source-a2', relatedSource: 'source-b' };
  await repository.seedSynthetic({
    principals: [{ id: ids.alex, username: 'Alex', token: tokens.alex }, { id: ids.blair, username: 'Blair', token: tokens.blair }],
    topics: [{ id: ids.topic, title: 'Synthetic transport', public: true }, { id: ids.otherTopic, title: 'Synthetic battery', public: true }],
    discussions: [{ id: ids.discussion, topicId: ids.topic, public: true }, { id: ids.otherDiscussion, topicId: ids.otherTopic, public: true }],
    sources: [
      { id: ids.source, url: 'https://transport.example/article', title: 'Synthetic transport article', topicId: ids.topic, discussionId: ids.discussion, vector: fixtureVector(), model: 'synthetic-e5-384-v1', extractor: 'synthetic-v1', public: true },
      { id: ids.sameTopicSource, url: 'https://transport.test/article', title: 'Synthetic same Topic article', topicId: ids.topic, discussionId: ids.discussion, vector: fixtureVector(0.6, 0.8), model: 'synthetic-e5-384-v1', extractor: 'synthetic-v1', public: true },
      { id: ids.relatedSource, url: 'https://battery.test/article', title: 'Synthetic battery article', topicId: ids.otherTopic, discussionId: ids.otherDiscussion, vector: fixtureVector(0.8, 0.6), model: 'synthetic-e5-384-v1', extractor: 'synthetic-v1', public: true },
    ],
  });
  return ids;
}
