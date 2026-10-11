import { createDiscussionService } from "./discussion-service.js";
import { createDemoState } from "../domain/demo-state.js";
import { createSqliteRepository } from "../adapters/sqlite-repository.js";
import { createFixtureRankingAdapter } from "../adapters/fixture-ranking.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../adapters/fixture-catalog.js";
import { createPublicDiscoveryIndex } from "../discovery/public-index.js";

export function createSqliteDemoService({ databasePath, nextId, now, repositoryOptions,
  alternateAdapter = null, alternateBodyMetric = null, alternateRidgeAdapter = null,
  resolveAccountActor = null, readAccountActors = () => [],
  discoveryDatabasePath = databasePath === ":memory:" ? ":memory:" : `${databasePath}.discovery.sqlite` }) {
  const initialState = createDemoState({ generation: nextId("generation"), createdAt: now(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  const repository = createSqliteRepository(databasePath, initialState, repositoryOptions);
  let discover;
  try {
    const service = createDiscussionService({
      repository, ranking: createFixtureRankingAdapter(), sources: SYNTHETIC_SOURCES,
      topicSeeds: SYNTHETIC_TOPIC_SEEDS, nextId, now, alternateAdapter, alternateBodyMetric, alternateRidgeAdapter,
      resolveAccountActor, readAccountActors,
    });
    discover = createPublicDiscoveryIndex({ databasePath: discoveryDatabasePath, repository });
    return Object.freeze({ service: Object.freeze({ ...service, discover }), close() { discover.close(); repository.close(); } });
  } catch (error) {
    discover?.close();
    repository.close();
    throw error;
  }
}
