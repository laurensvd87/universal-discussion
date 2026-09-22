import {
  PageSignalContractError,
  validateAndProjectPageMetadata,
  validatePageDocumentAttestation,
} from "./page-signal-contract.js";
import {
  PageSignalPolicyError,
  classifyPageSignalSnapshot,
  samePageSignalObservation,
} from "./page-signal-policy.js";

const PAGE_METADATA_SCENARIO_ID = "bounded-page-metadata";
const SCRIPTING_TIMEOUT_MILLISECONDS = 3_000;

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function transitionState(phase, requestToken, message) {
  return deepFreeze({
    envelope: null,
    message,
    outcome: null,
    phase,
    reasonCode: null,
    requestToken,
    scenarioId: phase === "idle" ? null : PAGE_METADATA_SCENARIO_ID,
    scope: {
      localOnly: true,
      noAutomaticSemanticJoin: true,
      rawRetained: false,
    },
  });
}

function terminalState(outcome, requestToken, message, reasonCode, envelope = null) {
  return deepFreeze({
    envelope,
    message,
    outcome,
    phase: "ready",
    reasonCode,
    requestToken,
    scenarioId: PAGE_METADATA_SCENARIO_ID,
    scope: {
      localOnly: true,
      noAutomaticSemanticJoin: true,
      rawRetained: false,
    },
  });
}

function unsupportedState(requestToken) {
  return terminalState(
    "unsupported",
    requestToken,
    "This page is outside the approved metadata experiment.",
    "page-metadata-unsupported",
  );
}

function unavailableState(requestToken) {
  return terminalState(
    "unavailable",
    requestToken,
    "Bounded page metadata is unavailable.",
    "page-metadata-unavailable",
  );
}

function isUnsupportedError(error) {
  return (
    (error instanceof PageSignalPolicyError &&
      ["POLICY_REVIEW_EXPIRED", "UNSUPPORTED_CONTEXT"].includes(error.code)) ||
    (error instanceof PageSignalContractError &&
      error.code === "POLICY_SIGNAL_DENIED")
  );
}

function withScriptingTimeout(operation) {
  let timeoutId;
  const timeout = new Promise((resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new TypeError("Page scripting timed out")),
      SCRIPTING_TIMEOUT_MILLISECONDS,
    );
  });
  return Promise.race([Promise.resolve().then(operation), timeout]).finally(() => {
    clearTimeout(timeoutId);
  });
}

function metadataReceipt(receipt) {
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) {
    throw new TypeError("Page metadata receipt is invalid");
  }
  const descriptors = Object.getOwnPropertyDescriptors(receipt);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== 2 ||
    !keys.includes("documentId") ||
    !keys.includes("result") ||
    keys.some(
      (key) =>
        typeof key !== "string" ||
        descriptors[key].get ||
        descriptors[key].set ||
        !descriptors[key].enumerable,
    ) ||
    typeof descriptors.documentId.value !== "string" ||
    descriptors.documentId.value.length < 1 ||
    descriptors.documentId.value.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/u.test(descriptors.documentId.value)
  ) {
    throw new TypeError("Page metadata receipt is invalid");
  }
  return {
    documentId: descriptors.documentId.value,
    result: descriptors.result.value,
  };
}

export function createPageMetadataController({
  attestPageDocument,
  now = Date.now,
  onStateChange = () => {},
  readActiveTab,
  readPageMetadata,
}) {
  if (
    typeof attestPageDocument !== "function" ||
    typeof now !== "function" ||
    typeof onStateChange !== "function" ||
    typeof readActiveTab !== "function" ||
    typeof readPageMetadata !== "function"
  ) {
    throw new TypeError("Page metadata controller requires function adapters");
  }

  let activation = 0;
  let state = transitionState(
    "idle",
    null,
    "Read bounded metadata from an approved current page.",
  );

  function nextActivation() {
    if (activation >= 999_999) {
      throw new TypeError("Page metadata activation sequence is exhausted");
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

  function terminalResult(next) {
    return deepFreeze({ applied: true, state: publish(next) });
  }

  async function activate() {
    const ownActivation = nextActivation();
    const requestToken =
      `metadata-${String(ownActivation).padStart(6, "0")}`;
    publish(
      transitionState(
        "loading",
        requestToken,
        "Reading bounded head metadata locally.",
      ),
    );

    let firstObservation;
    try {
      const firstSnapshot = await readActiveTab();
      if (ownActivation !== activation) return staleResult();
      firstObservation = classifyPageSignalSnapshot(firstSnapshot, now());
    } catch (error) {
      if (ownActivation !== activation) return staleResult();
      return terminalResult(
        isUnsupportedError(error)
          ? unsupportedState(requestToken)
          : unavailableState(requestToken),
      );
    }

    let envelope;
    let documentId;
    try {
      let receipt = metadataReceipt(
        await withScriptingTimeout(() =>
          readPageMetadata(
            firstObservation.tabId,
            firstObservation.normalizedUrl,
          ),
        ),
      );
      if (ownActivation !== activation) return staleResult();
      documentId = receipt.documentId;
      envelope = validateAndProjectPageMetadata(
        receipt.result,
        firstObservation,
      );
      receipt = null;

      const attestation = await withScriptingTimeout(() =>
        attestPageDocument(
          firstObservation.tabId,
          documentId,
          firstObservation.normalizedUrl,
        ),
      );
      if (ownActivation !== activation) return staleResult();
      validatePageDocumentAttestation(attestation, firstObservation);

      const finalSnapshot = await readActiveTab();
      if (ownActivation !== activation) return staleResult();
      const finalObservation = classifyPageSignalSnapshot(finalSnapshot, now());
      if (!samePageSignalObservation(firstObservation, finalObservation)) {
        throw new TypeError("Page changed before metadata rendering");
      }
    } catch (error) {
      envelope = null;
      documentId = null;
      if (ownActivation !== activation) return staleResult();
      return terminalResult(
        isUnsupportedError(error)
          ? unsupportedState(requestToken)
          : unavailableState(requestToken),
      );
    }

    documentId = null;
    if (ownActivation !== activation) return staleResult();
    return terminalResult(
      terminalState(
        "resolved",
        requestToken,
        "Bounded metadata is available locally.",
        null,
        envelope,
      ),
    );
  }

  function reset() {
    nextActivation();
    return publish(
      transitionState(
        "idle",
        null,
        "Read bounded metadata from an approved current page.",
      ),
    );
  }

  function currentState() {
    return state;
  }

  return Object.freeze({ activate, currentState, reset });
}

export const PAGE_METADATA_CONTROLLER_LIMITS = Object.freeze({
  scriptingTimeoutMilliseconds: SCRIPTING_TIMEOUT_MILLISECONDS,
});
