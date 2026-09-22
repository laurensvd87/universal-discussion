import {
  INDICATOR_VIEW_CONTRACT_VERSION,
  IndicatorContractError,
  unavailableIndicatorView,
  validateAndProjectIndicatorResponse,
} from "./indicator-contract.js";

const SCENARIO_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function transitionView(phase, scenarioId, requestToken, message) {
  return deepFreeze({
    activity: null,
    asOf: null,
    discussionId: null,
    mapping: null,
    message,
    outcome: null,
    phase,
    reasonCode: null,
    requestToken,
    scenarioId,
    scope: {
      fixtureOnly: true,
      noAutomaticSemanticJoin: true,
      readOnly: true,
    },
    source: null,
    topicId: null,
    viewContractVersion: INDICATOR_VIEW_CONTRACT_VERSION,
  });
}

function assertScenarioId(value) {
  if (typeof value !== "string" || value.length > 128 || !SCENARIO_ID.test(value)) {
    throw new IndicatorContractError(
      "INVALID_IDENTIFIER",
      "Scenario ID must be a bounded lowercase identifier",
    );
  }
}

export function createIndicatorController({ lookup, onStateChange = () => {} }) {
  if (typeof lookup !== "function" || typeof onStateChange !== "function") {
    throw new IndicatorContractError(
      "INVALID_ADAPTER",
      "Indicator controller requires function adapters",
    );
  }

  let activation = 0;
  let state = transitionView("idle", null, null, "Choose a bundled fixture scenario.");

  function nextActivation() {
    if (activation >= 999_999) {
      throw new IndicatorContractError("RESOURCE_LIMIT", "Activation sequence is exhausted");
    }
    activation += 1;
    return activation;
  }

  function publish(next) {
    state = next;
    onStateChange(next);
    return next;
  }

  async function activate(scenarioId) {
    const ownActivation = nextActivation();
    try {
      assertScenarioId(scenarioId);
    } catch (error) {
      publish(transitionView("idle", null, null, "Choose a valid bundled fixture scenario."));
      throw error;
    }
    const requestToken = `activation-${String(ownActivation).padStart(6, "0")}`;
    publish(
      transitionView(
        "loading",
        scenarioId,
        requestToken,
        "Loading the bundled fixture state.",
      ),
    );

    let projected;
    try {
      const response = await lookup(deepFreeze({ requestToken, scenarioId }));
      projected = validateAndProjectIndicatorResponse(response, {
        requestToken,
        scenarioId,
      });
    } catch {
      projected = unavailableIndicatorView({ requestToken, scenarioId });
    }
    if (ownActivation !== activation) {
      return deepFreeze({ applied: false, state });
    }
    return deepFreeze({ applied: true, state: publish(projected) });
  }

  function reset() {
    nextActivation();
    return publish(transitionView("idle", null, null, "Choose a bundled fixture scenario."));
  }

  function currentState() {
    return state;
  }

  return Object.freeze({ activate, currentState, reset });
}
