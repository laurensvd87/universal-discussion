import {
  ActiveTabPolicyError,
  classifyActiveTabSnapshot,
  sameActiveTabObservation,
} from "./active-tab-policy.js";
import {
  INDICATOR_VIEW_CONTRACT_VERSION,
  unavailableIndicatorView,
  unsupportedIndicatorView,
  validateAndProjectActiveTabResponse,
} from "./indicator-contract.js";

const ACTIVE_TAB_SCENARIO_ID = "active-tab-check";

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function transitionView(phase, requestToken, message) {
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
    scenarioId: phase === "idle" ? null : ACTIVE_TAB_SCENARIO_ID,
    scope: {
      fixtureOnly: true,
      noAutomaticSemanticJoin: true,
      readOnly: true,
    },
    source: null,
    sourceMatch: null,
    topicId: null,
    viewContractVersion: INDICATOR_VIEW_CONTRACT_VERSION,
  });
}

export function createActiveTabController({
  lookupByNormalizedUrl,
  onStateChange = () => {},
  readActiveTab,
}) {
  if (
    typeof lookupByNormalizedUrl !== "function" ||
    typeof onStateChange !== "function" ||
    typeof readActiveTab !== "function"
  ) {
    throw new TypeError("Active tab controller requires function adapters");
  }

  let activation = 0;
  let state = transitionView(
    "idle",
    null,
    "Check the current tab or choose a bundled fixture scenario.",
  );

  function nextActivation() {
    if (activation >= 999_999) {
      throw new TypeError("Active tab activation sequence is exhausted");
    }
    activation += 1;
    return activation;
  }

  function publish(next) {
    state = next;
    onStateChange(next);
    return next;
  }

  function staleResult() {
    return deepFreeze({ applied: false, state });
  }

  function terminalResult(view) {
    return deepFreeze({ applied: true, state: publish(view) });
  }

  async function activate() {
    const ownActivation = nextActivation();
    const requestToken =
      `activation-${String(ownActivation).padStart(6, "0")}`;
    publish(
      transitionView(
        "loading",
        requestToken,
        "Checking the active tab against the local allowlist.",
      ),
    );

    let firstObservation;
    try {
      const firstSnapshot = await readActiveTab();
      if (ownActivation !== activation) return staleResult();
      firstObservation = classifyActiveTabSnapshot(firstSnapshot);
    } catch (error) {
      if (ownActivation !== activation) return staleResult();
      if (
        error instanceof ActiveTabPolicyError &&
        error.code === "UNSUPPORTED_CONTEXT"
      ) {
        return terminalResult(
          unsupportedIndicatorView({
            requestToken,
            scenarioId: ACTIVE_TAB_SCENARIO_ID,
          }),
        );
      }
      return terminalResult(
        unavailableIndicatorView({
          requestToken,
          scenarioId: ACTIVE_TAB_SCENARIO_ID,
        }),
      );
    }

    let projected;
    try {
      const response = await lookupByNormalizedUrl(
        deepFreeze({
          normalizedUrl: firstObservation.normalizedUrl,
          requestToken,
        }),
      );
      if (ownActivation !== activation) return staleResult();
      projected = validateAndProjectActiveTabResponse(response, {
        normalizedUrl: firstObservation.normalizedUrl,
        requestToken,
        scenarioId: firstObservation.scenarioId,
      });

      const finalSnapshot = await readActiveTab();
      if (ownActivation !== activation) return staleResult();
      const finalObservation = classifyActiveTabSnapshot(finalSnapshot);
      if (!sameActiveTabObservation(firstObservation, finalObservation)) {
        throw new TypeError("Active tab changed before rendering");
      }
    } catch {
      if (ownActivation !== activation) return staleResult();
      return terminalResult(
        unavailableIndicatorView({
          requestToken,
          scenarioId: ACTIVE_TAB_SCENARIO_ID,
        }),
      );
    }

    if (ownActivation !== activation) return staleResult();
    return terminalResult(projected);
  }

  function reset() {
    nextActivation();
    return publish(
      transitionView(
        "idle",
        null,
        "Check the current tab or choose a bundled fixture scenario.",
      ),
    );
  }

  function currentState() {
    return state;
  }

  return Object.freeze({ activate, currentState, reset });
}
