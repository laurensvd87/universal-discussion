import { createIndicatorController } from "../core/indicator-controller.js";
import {
  INDICATOR_SCENARIOS,
  lookupIndicatorFixture,
} from "../fixtures/indicator-fixtures.js";

const elements = {
  agentCount: document.querySelector("#agent-count"),
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
  sourceUrl: document.querySelector("#source-url"),
  stateChip: document.querySelector("#state-chip"),
  status: document.querySelector("#status-message"),
  topicId: document.querySelector("#topic-id"),
};

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

  if (state.outcome !== "resolved") return;
  elements.sourceTitle.textContent = state.source.title;
  elements.sourceUrl.textContent = state.source.url;
  elements.topicId.textContent = state.topicId;
  elements.discussionId.textContent = state.discussionId;
  elements.humanCount.textContent = String(state.activity.humanContributions);
  elements.agentCount.textContent = String(state.activity.agentContributions);
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

const controller = createIndicatorController({
  lookup: lookupIndicatorFixture,
  onStateChange: render,
});

function renderScenarioDescription() {
  const scenario = selectedScenario();
  elements.description.textContent = scenario?.description ?? "";
}

elements.scenario.addEventListener("change", () => {
  controller.reset();
  renderScenarioDescription();
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await controller.activate(elements.scenario.value);
});

render(controller.currentState());
renderScenarioDescription();
