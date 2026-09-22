import { createActiveTabReader } from "./active-tab-reader.js";
import { createActiveTabController } from "../core/active-tab-controller.js";
import { createIndicatorController } from "../core/indicator-controller.js";
import {
  INDICATOR_SCENARIOS,
  lookupIndicatorFixture,
  lookupIndicatorFixtureByNormalizedUrl,
} from "../fixtures/indicator-fixtures.js";

const elements = {
  agentCount: document.querySelector("#agent-count"),
  currentTabButton: document.querySelector("#current-tab-button"),
  description: document.querySelector("#scenario-description"),
  discussionId: document.querySelector("#discussion-id"),
  evidence: document.querySelector("#mapping-evidence"),
  form: document.querySelector("#scenario-form"),
  freshness: document.querySelector("#freshness"),
  humanCount: document.querySelector("#human-count"),
  mappingMethod: document.querySelector("#mapping-method"),
  reason: document.querySelector("#reason"),
  resolved: document.querySelector("#resolved-result"),
  scenario: document.querySelector("#scenario"),
  sourceTitle: document.querySelector("#source-title"),
  sourceMatch: document.querySelector("#source-match"),
  sourceUrl: document.querySelector("#source-url"),
  stateChip: document.querySelector("#state-chip"),
  status: document.querySelector("#status-message"),
  topicId: document.querySelector("#topic-id"),
};

const resolvedTextElements = [
  elements.agentCount,
  elements.discussionId,
  elements.evidence,
  elements.freshness,
  elements.humanCount,
  elements.mappingMethod,
  elements.sourceMatch,
  elements.sourceTitle,
  elements.sourceUrl,
  elements.topicId,
];

function selectedScenario() {
  return INDICATOR_SCENARIOS.find(({ id }) => id === elements.scenario.value);
}

function render(state) {
  const displayedState = state.outcome ?? state.phase;
  elements.stateChip.textContent = displayedState;
  elements.stateChip.dataset.state = displayedState;
  elements.status.textContent = state.message;
  elements.resolved.hidden = state.outcome !== "resolved";
  elements.reason.hidden = state.reasonCode === null;
  elements.reason.textContent =
    state.reasonCode === null ? "" : `Reason: ${state.reasonCode}`;

  for (const element of resolvedTextElements) element.textContent = "";
  if (state.outcome !== "resolved") return;
  elements.sourceTitle.textContent = state.source.title;
  elements.sourceUrl.textContent = state.source.url;
  elements.topicId.textContent = state.topicId;
  elements.discussionId.textContent = state.discussionId;
  elements.humanCount.textContent = String(state.activity.humanContributions);
  elements.agentCount.textContent = String(state.activity.agentContributions);
  elements.sourceMatch.textContent = state.sourceMatch.method;
  elements.mappingMethod.textContent =
    `${state.mapping.method} · confidence ${state.mapping.confidence}`;
  elements.evidence.textContent =
    `${state.mapping.evidence.fixtureId} · ${state.mapping.evidence.provenance}`;
  elements.freshness.textContent = state.activity.asOf;
}

for (const scenario of INDICATOR_SCENARIOS) {
  const option = document.createElement("option");
  option.value = scenario.id;
  option.textContent = scenario.label;
  elements.scenario.append(option);
}

const activeTabReader = createActiveTabReader(globalThis.chrome.tabs);
const fixtureController = createIndicatorController({
  lookup: lookupIndicatorFixture,
  onStateChange: render,
});
const activeTabController = createActiveTabController({
  lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
  onStateChange: render,
  readActiveTab: activeTabReader.read,
});

function renderScenarioDescription() {
  const scenario = selectedScenario();
  elements.description.textContent = scenario?.description ?? "";
}

elements.scenario.addEventListener("change", () => {
  activeTabController.reset();
  fixtureController.reset();
  renderScenarioDescription();
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  activeTabController.reset();
  await fixtureController.activate(elements.scenario.value);
});

elements.currentTabButton.addEventListener("click", async () => {
  fixtureController.reset();
  elements.currentTabButton.disabled = true;
  try {
    await activeTabController.activate();
  } finally {
    elements.currentTabButton.disabled = false;
  }
});

render(fixtureController.currentState());
renderScenarioDescription();
