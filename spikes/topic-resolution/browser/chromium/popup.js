import {
  createActiveTabReader,
  createTabLifecycleObserver,
  createWindowBoundActiveTabReader,
  createWindowBoundTabLifecycleObserver,
} from "./active-tab-reader.js";
import { createPageMetadataReader } from "./page-metadata-reader.js";
import { createSavedDocumentAttestor } from "./page-content-reader.js";
import { createActiveTabController } from "../core/active-tab-controller.js";
import { createIndicatorController } from "../core/indicator-controller.js";
import { createPageMetadataController } from "../core/page-metadata-controller.js";
import { mountRelatedPagesDemo } from "./related-pages-panel.js";
import { mountDiscussionPanel, SEMANTIC_AI_UI_RELEASED } from "./discussion-panel.js";
import { mountAccountPanel } from "./account-panel.js";
import { createAccountClient } from "../core/account-client.js";
import { createAccountSessionStorage, ACCOUNT_SESSION_KEY, ACCOUNT_SESSION_FENCE_KEY } from "../core/account-session-storage.js";
import { mountInsightPanel } from "./insight-panel.js";
import { createInsightController, createInsightResumeGate } from "../core/insight-controller.js";
import { createReadOnlyServiceRetry } from "../core/read-only-service-retry.js";
import { createLocalAiClient } from "../core/local-ai-client.js";
import { createInsightPageReader } from "./insight-page-reader.js";
import { createInsightPreferenceStorage } from "./insight-preference-storage.js";
import { mountPrivateConversationPanel } from "./private-conversation-panel.js";
import { mountDiscoveryPanel, createTopicSpacePreviewOpener } from "./discovery-panel.js";
import { mountTopicSpacePanel } from "./topic-space-panel.js";
import { mountSemanticTopicWorkspace } from "./semantic-topic-workspace.js";
import { preparePrivateGeneration } from "../core/private-generation-context.js";
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
const isSidePanel = globalThis.location.pathname.endsWith("/chromium/sidepanel.html");
if (isSidePanel && globalThis.window.top !== globalThis.window.self)
  throw new TypeError("Side panel frame unavailable");
if (isSidePanel && !globalThis.location.search) {
  const current = await windows.getCurrent({ populate: false }).catch(() => null);
  if (!Number.isSafeInteger(current?.id) || current.id < 0 || current.type !== "normal" || current.incognito)
    throw new TypeError("Side panel window unavailable");
  const uniqueUrl = `${runtime.getURL("chromium/sidepanel.html")}?windowId=${current.id}&instance=${crypto.randomUUID()}`;
  globalThis.location.replace(uniqueUrl);
  await new Promise(() => {});
}
const panelBinding = isSidePanel
  ? await runtime.sendMessage({ target: "panel-context", type: "binding" }).catch(() => null) : null;
if (isSidePanel && (!Number.isSafeInteger(panelBinding?.windowId) || panelBinding.windowId < 0))
  throw new TypeError("Side panel context unavailable");
if (isSidePanel) {
  const ownWindow = await windows.getCurrent({ populate: false }).catch(() => null);
  if (ownWindow?.id !== panelBinding.windowId || ownWindow.type !== "normal" || ownWindow.incognito)
    throw new TypeError("Side panel window changed");
}
if (!isSidePanel) connectPopupFocusResponder({ runtime, windows, document, window: globalThis.window });

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
const boundReader = isSidePanel ? createWindowBoundActiveTabReader({ tabsApi, windowsApi: windows,
  windowId: panelBinding.windowId }) : null;
const activeTabReader = isSidePanel ? Object.freeze({ read: async () => {
  const ownWindow = await windows.getCurrent({ populate: false });
  if (ownWindow?.id !== panelBinding.windowId || ownWindow.type !== "normal" || ownWindow.incognito)
    throw new TypeError("Side panel window changed");
  const witness = await runtime.sendMessage({ target: "panel-context", type: "binding" });
  if (witness?.windowId !== panelBinding.windowId) throw new TypeError("Side panel context changed");
  return boundReader.read();
} }) : createActiveTabReader(tabsApi);
const insightPageReader = createInsightPageReader({ scriptingApi, readActiveTab: activeTabReader.read });
const tabLifecycleObserver = isSidePanel
  ? createWindowBoundTabLifecycleObserver({ tabsApi, windowsApi: windows, windowId: panelBinding.windowId })
  : createTabLifecycleObserver(tabsApi);
let privatePanel = null;
const discussionPanel = mountDiscussionPanel(document, document.querySelector("#local-discussion"), {
  onPrivateSend: body => privatePanel?.start(body) ?? Promise.resolve(false),
  onPrivateInsight: body => privatePanel?.start(body, true) ?? Promise.resolve(false),
});
const insightPanel = mountInsightPanel(document, document.querySelector("#local-insights"));
let insightController;
let accountPanel = null;
let accountAiObservation = "";
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
const storageSession = globalThis.chrome.storage.session;
const storageEvents = globalThis.chrome.storage.onChanged;
const accountLocks = globalThis.navigator.locks;
const insightPreferenceStorage = createInsightPreferenceStorage({ storageLocal, i18n: globalThis.chrome.i18n });
const popupShell = mountPopupShell(document, {
  storageLocal,
  storageSession,
  onModeChange: discussionPanel.setMode,
});
const localSession = createLocalServiceSessionProxy({ sendMessage: (message) => runtime.sendMessage(message) });
const localTransport = globalThis.fetch.bind(globalThis);
async function getAccountToken(actorId) {
  if (!accountPanel) return null;
  const token = await accountPanel.controller.withAppSession(({ accessToken, accountId }) =>
    actorId === undefined || actorId === `account-${accountId}` ? accessToken : null);
  return typeof token === "string" ? token : null;
}
const localClient = createLocalServiceClient({ fetchImpl: localTransport, getToken: localSession.getToken,
  onUnauthorized: localSession.clearIfCurrent,
  getAccountToken,
  onAccountUnauthorized: token => accountPanel?.rejectedSession(token) });
const aiClient = createLocalAiClient({ fetchImpl: localTransport, getToken: localSession.getToken,
  onUnauthorized: localSession.clearIfCurrent,
  getAccountToken,
  onAccountUnauthorized: token => accountPanel?.rejectedSession(token) });
const permissionsApi = globalThis.chrome.permissions;
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
  readPostingActor: () => accountPanel?.getActorId() ?? null,
  requestSignIn: () => { void accountPanel?.requestSignIn(); },
  validatePairing: async (token) => {
    const health = await localClient.healthWithToken(token);
    if (health.capability !== "paired-durable-v1") throw Object.assign(new Error("Durable pairing required"), { code: "durable-pairing-required" });
  },
  readActiveTab: activeTabReader.read,
  observeTabLifecycle: tabLifecycleObserver.observe,
  ...(isSidePanel ? { attestActiveContext: async (expected) => {
    try {
      const actual = await activeTabReader.read();
      return actual.tabId === expected?.tabId && actual.url === expected?.url &&
        actual.windowId === expected?.windowId;
    } catch { return false; }
  }, attestSavedDocument: createSavedDocumentAttestor({
    readActiveTab: activeTabReader.read, scriptingApi,
  }) } : {}),
  lookupByNormalizedUrl: lookupIndicatorFixtureByNormalizedUrl,
  readPageResolution: () => matchingPanel.readResolution(),
  pausePageMatching: () => matchingPanel.pauseMatching(),
  onStateChange: (state) => {
    discussionPanel.render(state); popupShell.render(state); observeToolbar(state);
    privatePanel?.observe();
    insightController?.observe(state);
    primeAiAfterLocalConnection(state);
    resumeAfterReady(state);
    serviceRetry.observe(state);
  },
});
popupShell.bindTopicView(localDiscussion);
insightController = createInsightController({
  shareInsight: localDiscussion.shareInsight,
  requestSignIn: () => { void accountPanel?.requestSignIn(); },
  // ADR-075: a deliberate generation click also authorizes one local post.
  // Recovered jobs never inherit that one-shot publication intent.
  shareOnCompletion: true,
  onStateChange: (state) => {
    insightPanel.render(state); discussionPanel.renderInsightState?.(state);
    privatePanel?.observe();
    const key = JSON.stringify([state.ai.connected, state.ai.pending, state.ai.account?.clientId]);
    if (accountPanel && key !== accountAiObservation) {
      accountAiObservation = key;
      void accountPanel.controller.refreshCapabilities();
    }
  },
  aiClient,
  readSemanticFollowupTarget: SEMANTIC_AI_UI_RELEASED ? localDiscussion.readSemanticFollowupTarget : null,
  readArticle: insightPageReader.read,
  attestArticle: insightPageReader.attest,
  loadInsightPreferences: insightPreferenceStorage.load,
  saveInsightPreferences: insightPreferenceStorage.save,
  readBrowserLanguage: insightPreferenceStorage.readBrowserLanguage,
  loadRelatedTextPreference: async () => {
    const stored = await storageLocal.get("relatedPageTextEnabled");
    return typeof stored.relatedPageTextEnabled === "boolean" ? stored.relatedPageTextEnabled : null;
  },
  saveRelatedTextPreference: (enabled) => storageLocal.set({ relatedPageTextEnabled: enabled }),
  openAuthorization: (url) => tabsApi.create({ url, active: true,
    ...(isSidePanel ? { windowId: panelBinding.windowId } : {}) }),
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
const accountStorage = createAccountSessionStorage({ storageSession,
  withLock: work => accountLocks.request("discussion-account-session-v1", work),
  getPairingToken: localSession.getToken });
accountPanel = mountAccountPanel({ document, mount: document.body,
  client: createAccountClient({ fetchImpl: localTransport, getPairingToken: localSession.getToken }),
  storage: accountStorage,
  readContext: () => {
    const state = localDiscussion.currentState();
    return { sourceId: state.sourceId, topicId: state.topicId,
      targetId: state.draft.targetId, mode: state.draft.mode };
  },
  onAccountChange: () => { if (accountPanel) localDiscussion.accountChanged(); privatePanel?.accountChanged(); },
  onConnectChatGPT: () => insightController.connect(),
  onSessionChanged: listener => {
    const observe = (changes, area) => {
      if (area === "session" && (Object.hasOwn(changes, ACCOUNT_SESSION_KEY) ||
          Object.hasOwn(changes, ACCOUNT_SESSION_FENCE_KEY))) listener();
    };
    storageEvents.addListener(observe);
    return () => storageEvents.removeListener(observe);
  },
  onExport: data => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "discussion-account-data.json";
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 30_000);
  },
});
document.querySelector(".popup-topbar").insertBefore(accountPanel.elements.button,
  document.querySelector("#app-settings-button"));
void accountPanel.initialize();
privatePanel = mountPrivateConversationPanel(document, document.querySelector("#app-view-private"), {
  client: localClient, readActor: () => accountPanel?.getActorId() ?? null,
  requestSignIn: () => accountPanel.requestSignIn(),
  readPublicState: () => localDiscussion.currentState(), showView: popupShell.navigate,
  randomId: () => crypto.randomUUID(),
  readInsightState: insightController.currentState,
  setInsightPreferences: preferences => insightController.setInsightPreferences(preferences),
  attestStart: localDiscussion.attestPrivateStart,
  prepareGeneration: sourceId => preparePrivateGeneration({ sourceId,
    readState: localDiscussion.currentState, readInsight: insightController.currentState,
    readArticle: insightPageReader.read, attestArticle: insightPageReader.attest,
    readBrowserLanguage: insightPreferenceStorage.readBrowserLanguage }),
});
const discoveryRoot = document.querySelector("#app-view-discover");
const topicSpaceRoot = document.createElement("section"), libraryRoot = document.createElement("section");
topicSpaceRoot.className = "topic-space-panel"; libraryRoot.className = "topic-space-library";
const legacyDiscoverRoot=document.createElement('section'), semanticDiscoverRoot=document.createElement('section');
const semanticDiscussionRoot=document.createElement('section');semanticDiscussionRoot.className='semantic-discussion-panel';
const capabilityNotice=document.createElement('section'), capabilityMessage=document.createElement('p'), capabilityRetry=document.createElement('button');
capabilityMessage.setAttribute('role','status');capabilityRetry.type='button';capabilityRetry.textContent='Try again';
capabilityNotice.append(capabilityMessage,capabilityRetry);capabilityNotice.hidden=true;legacyDiscoverRoot.hidden=true;
legacyDiscoverRoot.append(topicSpaceRoot,libraryRoot);discoveryRoot.replaceChildren(capabilityNotice,semanticDiscoverRoot,legacyDiscoverRoot);
const canonicalFeed=document.querySelector('#discussion-feed');canonicalFeed.insertBefore(semanticDiscussionRoot,canonicalFeed.firstChild);
let topicSpaceReturnFocus = null;
const libraryPanel = mountDiscoveryPanel(document, libraryRoot, { client: localClient, messages: EN, previewOnly: true,
  onPreviewChange: visible => {
    topicSpaceRoot.hidden = visible;
    if (!visible) {
      const trigger = topicSpaceReturnFocus; topicSpaceReturnFocus = null;
      queueMicrotask(() => { if (trigger?.isConnected && !discoveryRoot.hidden && !topicSpaceRoot.hidden) trigger.focus(); });
    }
  },
});
let topicSpaceSessionRevision = 0, topicSpaceSession = null;
const topicSpaceState = () => ({ actorId: accountPanel?.getActorId() ?? null, sessionRevision: topicSpaceSessionRevision });
function ownerTopicSpaceRequest(method, value, options = {}) {
  const actorId = accountPanel?.getActorId(), sessionRevision = topicSpaceSessionRevision;
  if (!actorId) return Promise.reject(Object.assign(new Error("Sign in required"), { code: "authentication-required" }));
  const guarded = { ...options, beforeDispatch: () => actorId === accountPanel?.getActorId() && sessionRevision === topicSpaceSessionRevision };
  return method === "owner" ? localClient.topicSpaceOwner(actorId, guarded) : localClient.updateTopicSpacePolicy(value, actorId, guarded);
}
const topicSpacePanel = mountTopicSpacePanel(document, topicSpaceRoot, { messages: EN,
  client: { topicSpaces: (...args) => localClient.topicSpaces(...args),
    topicSpaceOwner: options => ownerTopicSpaceRequest("owner", null, options),
    updateTopicSpacePolicy: (value, options) => ownerTopicSpaceRequest("policy", value, options) },
  onOpenDiscussion: createTopicSpacePreviewOpener({ preview: libraryPanel,
    beforeOpen: () => { topicSpaceReturnFocus = document.activeElement; } }),
});
let semanticWorkspace=null;
const stopTopicSpaceAccount = accountPanel.controller.subscribe(() => {
  const current = accountPanel.controller.getAccessToken();
  if (current !== topicSpaceSession) { topicSpaceSession = current; topicSpaceSessionRevision++; }
  topicSpacePanel.observe(topicSpaceState());
  semanticWorkspace?.observePage({...localDiscussion.currentState(),sessionRevision:topicSpaceSessionRevision});
});
let discoveryActive=false,discoveryConnected=false,discoveryDisposed=false,semanticMode='disconnected';
function updateLegacyDiscovery(){
  if(discoveryDisposed)return;
  const legacy=semanticMode==='legacy';legacyDiscoverRoot.hidden=!legacy;
  libraryPanel.observeConnected(discoveryConnected&&legacy);topicSpacePanel.setConnection(discoveryConnected&&legacy);
  libraryPanel.setActive(discoveryActive&&legacy);topicSpacePanel.setActive(discoveryActive&&legacy);
  capabilityNotice.hidden=!discoveryActive||!['loading','error'].includes(semanticMode);
  capabilityMessage.textContent=semanticMode==='loading'?'Loading topics…':'Topics are unavailable. Try again.';
  capabilityRetry.hidden=semanticMode!=='error';
}
semanticWorkspace=mountSemanticTopicWorkspace(document,{discoverRoot:semanticDiscoverRoot,discussionRoot:semanticDiscussionRoot,
  client:localClient,controller:localDiscussion,discussionPanel,navigate:popupShell.navigate,
  onAvailability(value){semanticMode=value;updateLegacyDiscovery();}});
const retrySemanticDiscovery=()=>{void semanticWorkspace.refresh();};capabilityRetry.addEventListener('click',retrySemanticDiscovery);
const discoveryPanel = {
  setActive(value) {if(discoveryDisposed)return;discoveryActive=Boolean(value);semanticWorkspace.setActive(value);updateLegacyDiscovery();},
  observePage(state) {if(discoveryDisposed)return;topicSpacePanel.observe(topicSpaceState());
    semanticWorkspace.observePage({...state,sessionRevision:topicSpaceSessionRevision});},
  observeConnected(value) {if(discoveryDisposed)return;discoveryConnected=Boolean(value&&localDiscussion.currentState().serviceConnection==='connected');
    semanticWorkspace.setConnection(discoveryConnected);updateLegacyDiscovery();},
  dispose() {if(discoveryDisposed)return;discoveryDisposed=true;stopTopicSpaceAccount();topicSpaceSession=null;
    capabilityRetry.removeEventListener('click',retrySemanticDiscovery);semanticWorkspace.dispose();libraryPanel.dispose();topicSpacePanel.dispose();},
};
popupShell.bindCommunity({ private: privatePanel, discovery: discoveryPanel });
const accountMaintenance = setInterval(() => {
  if (accountPanel.getActorId()) void accountPanel.controller.withAppSession(() => true).catch(() => {});
}, 60_000);
document.querySelector("#product-title").textContent = EN.discussionPageTitle;
document.querySelector("#product-capabilities").textContent = EN.discussionCapabilities;
document.querySelector("#product-matching-badge").textContent = EN.discussionMatchingBadge;
document.querySelector("#product-intro").textContent = EN.discussionIntro;
document.querySelector("#diagnostic-heading").textContent = EN.discussionDiagnostic;
document.querySelector("#user-footer").textContent = EN.uiFooter;
document.querySelector("#developer-footer").textContent = EN.discussionFooter;
void localDiscussion.open();
let stopPanelWindowObservation = () => {};
let panelReopenTimer;
if (isSidePanel) {
  const observePanelWindow = () => {
    stopPanelWindowObservation = tabLifecycleObserver.observeWindow(() => {
      localDiscussion.invalidateContext?.();
      clearTimeout(panelReopenTimer);
      observePanelWindow();
      panelReopenTimer = setTimeout(() => {
        void activeTabReader.read().then(() => localDiscussion.open()).catch(() => {});
      }, 450);
    });
  };
  observePanelWindow();
}
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
  clearInterval(accountMaintenance);
  accountPanel?.dispose();
  privatePanel?.dispose(); discoveryPanel.dispose();
  clearTimeout(panelReopenTimer);
  stopPanelWindowObservation();
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
