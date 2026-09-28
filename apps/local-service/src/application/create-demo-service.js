import { createDiscussionService } from "./discussion-service.js";
import { createDemoState } from "../domain/demo-state.js";
import { createMemoryRepository } from "../adapters/memory-repository.js";
import { createFixtureRankingAdapter } from "../adapters/fixture-ranking.js";
import { SYNTHETIC_SOURCES, SYNTHETIC_TOPIC_SEEDS } from "../adapters/fixture-catalog.js";

export function createMemoryDemoService({ nextId, now }) {
  const state = createDemoState({ generation: nextId("generation"), createdAt: now(), sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS });
  return createDiscussionService({
    repository: createMemoryRepository(state), ranking: createFixtureRankingAdapter(),
    sources: SYNTHETIC_SOURCES, topicSeeds: SYNTHETIC_TOPIC_SEEDS, nextId, now,
  });
}
