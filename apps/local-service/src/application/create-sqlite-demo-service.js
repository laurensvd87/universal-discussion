import { createDiscussionService } from "./discussion-service.js";
import { createDemoState } from "../domain/demo-state.js";
import { createSqliteRepository } from "../adapters/sqlite-repository.js";
import { createFixtureRankingAdapter } from "../adapters/fixture-ranking.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../adapters/fixture-catalog.js";

export function createSqliteDemoService({ databasePath, nextId, now, repositoryOptions }) {
  const initialState = createDemoState({ generation: nextId("generation"), createdAt: now(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  const repository = createSqliteRepository(databasePath, initialState, repositoryOptions);
  const service = createDiscussionService({
    repository, ranking: createFixtureRankingAdapter(), sources: SYNTHETIC_SOURCES,
    topicSeeds: SYNTHETIC_TOPIC_SEEDS, nextId, now,
  });
  return Object.freeze({ service, close: () => repository.close() });
}
