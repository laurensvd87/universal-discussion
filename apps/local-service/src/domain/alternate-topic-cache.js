// One in-memory partition per committed repository revision. No vector/text
// copy or disk persistence; request-specific roots and permissions are never
// cached here. Repository writes must change revision or generation.
export function createSnapshotTopicPlanner(plan) {
  if (typeof plan !== 'function') throw new TypeError('Invalid Topic planner');
  let cached = null;
  return state => {
    if (!state || typeof state.generation !== 'string' || !state.generation ||
        !Number.isSafeInteger(state.revision) || state.revision < 0) throw new TypeError('Invalid Topic snapshot');
    if (cached?.generation === state.generation && cached.revision === state.revision) return cached.result;
    // Failure leaves no result for this revision; never serve the previous plan.
    const result = plan(state);
    cached = { generation: state.generation, revision: state.revision, result };
    return result;
  };
}
