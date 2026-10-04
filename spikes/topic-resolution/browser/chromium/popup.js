import {
  createActiveTabReader,
  createTabLifecycleObserver,
} from "./active-tab-reader.js";
import { createPageMetadataReader } from "./page-metadata-reader.js";
import { createActiveTabController } from "../core/active-tab-controller.js";
import { createIndicatorController } from "../core/indicator-controller.js";
import { createPageMetadataController } from "../core/page-metadata-controller.js";
import { mountRelatedPagesDemo } from "./related-pages-panel.js";
import { mountDiscussionPanel } from "./discussion-panel.js";
import { mountInsightPanel } from "./insight-panel.js";
import { createInsightController, createInsightResumeGate } from "../core/insight-controller.js";
import { createReadOnlyServiceRetry } from "../core/read-only-service-retry.js";
import { createLocalAiClient } from "../core/local-ai-client.js";
import { createInsightPageReader } from "./insight-page-reader.js";
import { createRelatedPageExcerptReader } from "../core/related-page-excerpts.js";
import { mountPageMatchingPanel } from "./page-matching-panel.js";
import { mountPopupShell } from "./popup-shell.js";
import { connectPopupFocusResponder } from "./popup-focus.js";
import { createLocalDiscussionController } from "../core/local-discussion-controller.js";
import { createLocalServiceClient } from "../core/local-service-client.js";
import { createLocalServiceSessionProxy } from "../core/local-service-session.js";
import { EN } from "../locales/en.js";
import {
  INDICATOR_SCENARIOS,
  lookupIndicatorFixture,
  lookupIndicatorFixtureByNormalizedUrl,
} from "../fixtures/indicator-fixtures.js";

const runtime = globalThis.chrome.runtime;
const windows = globalThis.chrome.windows;
connectPopupFocusResponder({ runtime, windows, document, window: globalThis.window });

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

const relatedPagesDemo = mountRelatedPagesDemo(
  document,
  document.querySelector("#related-pages-demo"),
);

const tabsApi = globalThis.chrome.tabs;
const scriptingApi = globalThis.chrome.scripting;
const activeTabReader = createActiveTabReader(tabsApi);
const insightPageReader = createInsightPageReader({ scriptingApi, readActiveTab: activeTabReader.read });
const tabLifecycleObserver = createTabLifecycleObserver(tabsApi);
const discussionPanel = mountDiscussionPanel(document, document.querySelector("#local-discussion"));
const insightPanel = mountInsightPanel(document, document.querySelector("#local-insights"));
let insightController;
let aiStartupAttempted = false;
const resumeGate = createInsightResumeGate(() => insightController.resumeInsights());
function resumeAfterReady(state) {
  resumeGate.observe(state, insightController?.currentState().ai.planEnabled === true);
}
function primeAiAfterLocalConnection(state) {
  if (aiStartupAttempted || !state.catalog || !["ready", "choose-topic"].includes(state.phase)) return;
  aiStartupAttempted = true;
  void (async () => {
    const connected = await insightController?.checkConnection();
    if (connected && insightController.currentState().ai.planEnabled) {
      await insightController.loadModels();
      resumeGate.prime();
      resumeAfterReady(localDiscussion.currentState());
    }
  })().catch(() => {});
}
const storageLocal = globalThis.chrome.storage.local;
const popupShell = mountPopupShell(document, {
  storageLocal,
  onModeChange: discussionPanel.setMode,
});
const localSession = createLocalServiceSessionProxy({ sendMessage: (message) => runtime.sendMessage(message) });
const localTransport = globalThis.fetch.bind(globalThis);
const localClient = createLocalServiceClient({ fetchImpl: localTransport, getToken: localSession.getToken,
  onUnauthorized: localSession.clearIfCurrent });
const aiClient = createLocalAiClient({ fetchImpl: localTransport, getToken: localSession.getToken,
  onUnauthorized: localSession.clearIfCurrent });
const permissionsApi = globalThis.chrome.permissions;
const relatedExcerptReader = createRelatedPageExcerptReader({ fetchImpl: localTransport,
  hasHostAccess: () => permissionsApi.contains({ origins: ["https://*/*"] }) });
let matchingPanel;
// Ask for fresh background evidence only when a service projection changes.
// No Topic, post count or connection claim crosses this authenticated message.
let toolbarObservation;
let toolbarRefreshPending = false;
let toolbarRefreshAgain = false;
const serviceRetry = createReadOnlyServiceRetry({ open: () => localDiscussion.open() });
function observeToolbar(state) {
  const version = (value) => value ? `${value.generation}:${value.revision}` : "";
  const key = `${state.phase === "disconnected" || state.phase === "error" ? state.phase : "observed"}|${version(state.catalog?.version)}|${version(state.discussion?.version)}`;
  if (key === toolbarObservation) return;
  toolbarObservation = key;
  if (!state.catalog && !["disconnected", "error"].includes(state.phase)) return;
  if (toolbarRefreshPending) { toolbarRefreshAgain = true; return; }
  toolbarRefreshPending = true;
  void (async () => {
    try {
      do {
        toolbarRefreshAgain = false;
        await runtime.sendMessage({ target: "page-matching", type: "toolbar-refresh" });
      } while (toolbarRefreshAgain);
    } catch { /* Toolbar availability does not block the discussion UI. */ }
    finally { toolbarRefreshPending = false; }
  })();
}
const localDiscussion = createLocalDiscussionController({
  client: localClient,
  session: localSession,
  validatePairing: async (token) => {
    const health = await localClient.healthWithToken(token);
    if (health.capability !== "paired-durable-v1") throw Object.assign(new Error("Durable pairing required"), { code: "durable-pairing-required" });
  },
  readActiveTab: activeTabReader.read,
  observeTabLifecycle: tabLifecycleObserver.observe,
  lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
  readPageResolution: () => matchingPanel.readResolution(),
  pausePageMatching: () => matchingPanel.pauseMatching(),
  onStateChange: (state) => {
    discussionPanel.render(state); popupShell.render(state); observeToolbar(state);
    insightController?.observe(state);
    primeAiAfterLocalConnection(state);
    resumeAfterReady(state);
    serviceRetry.observe(state);
  },
});
insightController = createInsightController({
  shareInsight: localDiscussion.shareInsight,
  onStateChange: (state) => { insightPanel.render(state); discussionPanel.renderInsightState?.(state); },
  aiClient,
  readArticle: insightPageReader.read,
  attestArticle: insightPageReader.attest,
  readRelatedExcerpts: relatedExcerptReader.read,
  loadRelatedTextPreference: async () => {
    const stored = await storageLocal.get("relatedPageTextEnabled");
    return typeof stored.relatedPageTextEnabled === "boolean" ? stored.relatedPageTextEnabled : null;
  },
  saveRelatedTextPreference: (enabled) => storageLocal.set({ relatedPageTextEnabled: enabled }),
  openAuthorization: (url) => tabsApi.create({ url, active: true }),
});
insightPanel.bind(insightController);
discussionPanel.bindInsight(insightController);
matchingPanel = mountPageMatchingPanel(document, document.querySelector("#page-matching"), {
  sendMessage: (message) => runtime.sendMessage(message),
  requestPermission: (request) => permissionsApi.request(request),
  onResolution: localDiscussion.updatePageResolution,
  streamlinedSession: true,
});
discussionPanel.bind(localDiscussion);
document.querySelector("#product-title").textContent = EN.discussionPageTitle;
document.querySelector("#product-capabilities").textContent = EN.discussionCapabilities;
document.querySelector("#product-matching-badge").textContent = EN.discussionMatchingBadge;
document.querySelector("#product-intro").textContent = EN.discussionIntro;
document.querySelector("#diagnostic-heading").textContent = EN.discussionDiagnostic;
document.querySelector("#user-footer").textContent = EN.uiFooter;
document.querySelector("#developer-footer").textContent = EN.discussionFooter;
void localDiscussion.open();
// After an authenticated local catalog arrives, discover this session's account
// models once. This does not start inference or retry a failed provider read.
const pageMetadataReader = createPageMetadataReader(scriptingApi);
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
  observeTabLifecycle: tabLifecycleObserver.observe,
  onStateChange: renderMetadata,
  readActiveTab: activeTabReader.read,
  readPageMetadata: pageMetadataReader.read,
});

globalThis.addEventListener("pagehide", () => {
  serviceRetry.dispose();
  insightController.dispose();
  insightPanel.dispose();
  matchingPanel.dispose();
  localDiscussion.dispose();
  discussionPanel.dispose();
  popupShell.dispose();
  pageMetadataController.dispose();
  relatedPagesDemo.dispose();
  activeTabController.reset();
  fixtureController.reset();
}, { once: true });

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
