// UI/read-target readiness only. The controller privately verifies saved bindings
// again before human delivery; this DTO flag never authorizes a service command.
export function canPostHumanDiscussion(state) {
  return state?.phase === "ready" || state?.phase === "loading" && state.humanPostingReady === true;
}
