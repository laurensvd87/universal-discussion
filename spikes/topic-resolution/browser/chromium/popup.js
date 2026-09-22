import { createActiveTabReader } from "./active-tab-reader.js";
import { createPageMetadataReader } from "./page-metadata-reader.js";
import { createActiveTabController } from "../core/active-tab-controller.js";
import { createIndicatorController } from "../core/indicator-controller.js";
import { createPageMetadataController } from "../core/page-metadata-controller.js";
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
  metadataButton: document.querySelector("#metadata-button"),
  metadataCanonical: document.querySelector("#metadata-canonical"),
  metadataDescription: document.querySelector("#metadata-description"),
  metadataObservedUrl: document.querySelector("#metadata-observed-url"),
  metadataPolicyReview: document.querySelector("#metadata-policy-review"),
  metadataProvenance: document.querySelector("#metadata-provenance"),
  metadataPublishedAt: document.querySelector("#metadata-published-at"),
  metadataReason: document.querySelector("#metadata-reason"),
  metadataResolved: document.querySelector("#metadata-resolved-result"),
  metadataRights: document.querySelector("#metadata-rights"),
  metadataStateChip: document.querySelector("#metadata-state-chip"),
  metadataStatus: document.querySelector("#metadata-status-message"),
  metadataTitle: document.querySelector("#metadata-title"),
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

const metadataTextElements = [
  elements.metadataCanonical,
  elements.metadataDescription,
  elements.metadataObservedUrl,
  elements.metadataPolicyReview,
  elements.metadataProvenance,
  elements.metadataPublishedAt,
  elements.metadataRights,
  elements.metadataTitle,
];

function selectedScenario() {
  return INDICATOR_SCENARIOS.find(({ id }) => id === elements.scenario.value);
}

function renderDiscussion(state) {
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

function metadataRightsLabel(context) {
  if (context.contextId === "p1-5c-controlled-fixture") {
    return "Project-created synthetic fixture";
  }
  if (context.contextId === "p1-5c-mdn-meta-reference") {
    return "MDN Web Docs · Mozilla contributors · CC BY-SA 2.5+ review record";
  }
  return "Unavailable";
}

function renderMetadata(state) {
  const displayedState = state.outcome ?? state.phase;
  elements.metadataStateChip.textContent = displayedState;
  elements.metadataStateChip.dataset.state = displayedState;
  elements.metadataStatus.textContent = state.message;
  elements.metadataResolved.hidden = state.outcome !== "resolved";
  elements.metadataReason.hidden = state.reasonCode === null;
  elements.metadataReason.textContent =
    state.reasonCode === null ? "" : `Reason: ${state.reasonCode}`;

  for (const element of metadataTextElements) element.textContent = "";
  if (state.outcome !== "resolved") return;
  const { envelope } = state;
  elements.metadataTitle.textContent = envelope.title;
  elements.metadataObservedUrl.textContent = envelope.context.observedUrl;
  elements.metadataCanonical.textContent =
    envelope.canonicalHint ?? "Not present";
  elements.metadataDescription.textContent =
    envelope.description ?? "Not present";
  elements.metadataPublishedAt.textContent =
    envelope.publishedAtHint ?? "Not present";
  elements.metadataProvenance.textContent = [
    `title=${envelope.provenance.title}`,
    `description=${envelope.provenance.description ?? "absent"}`,
    `canonical=${envelope.provenance.canonicalHint ?? "absent"}`,
    `publication=${envelope.provenance.publishedAtHint ?? "absent"}`,
  ].join(" · ");
  elements.metadataRights.textContent = metadataRightsLabel(envelope.context);
  elements.metadataPolicyReview.textContent =
    envelope.context.policyReviewExpiresAt ??
    "Not time-limited for the project fixture";
}

for (const scenario of INDICATOR_SCENARIOS) {
  const option = document.createElement("option");
  option.value = scenario.id;
  option.textContent = scenario.label;
  elements.scenario.append(option);
}

const activeTabReader = createActiveTabReader(globalThis.chrome.tabs);
const pageMetadataReader = createPageMetadataReader(globalThis.chrome.scripting);
const fixtureController = createIndicatorController({
  lookup: lookupIndicatorFixture,
  onStateChange: renderDiscussion,
});
const activeTabController = createActiveTabController({
  lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
  onStateChange: renderDiscussion,
  readActiveTab: activeTabReader.read,
});
const pageMetadataController = createPageMetadataController({
  attestPageDocument: pageMetadataReader.attest,
  onStateChange: renderMetadata,
  readActiveTab: activeTabReader.read,
  readPageMetadata: pageMetadataReader.read,
});

function renderScenarioDescription() {
  const scenario = selectedScenario();
  elements.description.textContent = scenario?.description ?? "";
}

elements.scenario.addEventListener("change", () => {
  activeTabController.reset();
  pageMetadataController.reset();
  fixtureController.reset();
  renderScenarioDescription();
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  activeTabController.reset();
  pageMetadataController.reset();
  await fixtureController.activate(elements.scenario.value);
});

elements.currentTabButton.addEventListener("click", async () => {
  fixtureController.reset();
  pageMetadataController.reset();
  elements.currentTabButton.disabled = true;
  try {
    await activeTabController.activate();
  } finally {
    elements.currentTabButton.disabled = false;
  }
});

elements.metadataButton.addEventListener("click", async () => {
  activeTabController.reset();
  fixtureController.reset();
  elements.metadataButton.disabled = true;
  try {
    await pageMetadataController.activate();
  } finally {
    elements.metadataButton.disabled = false;
  }
});

renderDiscussion(fixtureController.currentState());
renderMetadata(pageMetadataController.currentState());
renderScenarioDescription();
