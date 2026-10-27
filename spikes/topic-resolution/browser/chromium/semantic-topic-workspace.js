import {mountSemanticTopicPanel} from './semantic-topic-panel.js';
import {readSemanticCapabilities,readSemanticContext} from '../core/local-service-contract.js';
import {isMissingSemanticCapabilities} from '../core/local-service-client.js';

// Optional public browsing never replaces the controller's foreground document
// or private posting binding. Capability absence alone enables legacy discovery.
export function mountSemanticTopicWorkspace(document,{discoverRoot,discussionRoot,client,controller,discussionPanel,navigate,
  onAvailability=()=>{}}={}) {
  discussionRoot.className=[discussionRoot.className,'semantic-topic-workspace'].filter(Boolean).join(' ');
  let disposed=false,connected=false,discoverActive=false,pageState=null,accountKey=null,pageKey=null;
  let capability='unknown',availability='disconnected',serviceEpoch=0,epoch=0,contextEpoch=0;
  let capabilityAbort=null,contextAbort=null,intentAbort=new AbortController();
  let contextCard=null,contextLoading=false,contextError=false,contextRequestKey=null,override=null,suppressSelection=false;
  let savedView=false,historyPending=false,historyError=false,historyFlight=null;
  const status=document.createElement('p');status.id='semantic-workspace-status';status.setAttribute('role','status');
  const retry=document.createElement('button');retry.id='semantic-workspace-retry';retry.type='button';retry.textContent='Try again';retry.hidden=true;
  const toggle=document.createElement('button');toggle.id='semantic-workspace-saved-toggle';toggle.type='button';toggle.hidden=true;
  const historyStatus=document.createElement('p');historyStatus.id='semantic-workspace-history-status';historyStatus.setAttribute('role','status');
  const historyRetry=document.createElement('button');historyRetry.id='semantic-workspace-history-retry';historyRetry.type='button';historyRetry.textContent='Retry saved threads';historyRetry.hidden=true;
  const mainRoot=document.createElement('section');discussionRoot.replaceChildren(status,retry,toggle,historyStatus,historyRetry,mainRoot);
  discoverRoot.hidden=discussionRoot.hidden=true;
  function emit(value){if(availability===value)return;availability=value;onAvailability(value);}
  function routing(value){try{const result=controller.setSemanticTopicsAvailable?.(value);Promise.resolve(result).catch(()=>{});}catch{/* Optional display routing. */}}
  function account(state){return JSON.stringify([state?.actorId??null,state?.accountId??null,state?.sessionRevision??state?.resolution?.sessionRevision??null]);}
  function identity(state){const r=state?.resolution;return JSON.stringify([state?.sourceId??null,state?.catalog?.version?.generation??null,
    state?.actorId??null,state?.accountId??null,state?.sessionRevision??null,r?.documentId??null,r?.currentTabId??r?.tabId??null,
    r?.currentUrl??r?.url??null,r?.currentWindowId??null,r?.sessionWindowId??null,r?.sessionRevision??null,r?.enabled??null,
    r?.hostAccess??null,r?.currentOrigin??null,r?.contextReason??null,r?.blockedOrigins??[]]);}
  function panelAccount(){return {actorId:pageState?.actorId??null,accountId:pageState?.accountId??null,
    sessionRevision:pageState?.sessionRevision??pageState?.resolution?.sessionRevision??null};}
  function usable(){return connected&&!disposed&&capability==='available';}
  function updateMain(){const canToggle=usable()&&Boolean(pageState?.sourceId)&&Boolean(savedView||override||contextCard);
    const show=usable()&&!savedView&&Boolean(override||(!contextError&&contextCard));
    discussionRoot.hidden=!show&&!contextError&&!canToggle;mainRoot.hidden=!show;discussionPanel.setSemanticFeedMode(show);
    toggle.hidden=!canToggle;toggle.textContent=savedView?'Topic discussions':'This page\u2019s saved threads';toggle.setAttribute('aria-pressed',String(savedView));
    historyStatus.hidden=!savedView;historyStatus.textContent=savedView?(historyPending?'Loading saved threads\u2026':historyError?'Saved threads are unavailable. Try again.':''):'';
    historyRetry.hidden=!savedView||!historyError;historyRetry.disabled=historyPending;
    status.textContent=contextError?'Topics are unavailable. Try refreshing.':contextLoading?'Loading topics…':'';
    retry.hidden=!contextError||!usable();retry.disabled=contextLoading;
  }
  function activatePanels(){const enabled=usable();discover.setConnection(enabled);discover.setActive(enabled&&discoverActive);
    main.setConnection(enabled);main.setActive(enabled);discoverRoot.hidden=!enabled||!discoverActive;updateMain();}
  function revoke(){epoch++;intentAbort.abort();intentAbort=new AbortController();contextEpoch++;contextAbort?.abort();contextAbort=null;
    contextRequestKey=null;contextCard=null;contextLoading=false;contextError=false;override=null;
    savedView=false;historyPending=false;historyError=false;historyFlight=null;
    suppressSelection=true;main.setTopicContext(null,{force:true});suppressSelection=false;updateMain();}
  const panelClient={};
  for(const method of ['semanticTopics','semanticFeed','semanticThread'])panelClient[method]=(...args)=>client[method](...args);
  panelClient.semanticTarget=async(value,options={})=>{
    const ownEpoch=epoch,ownIntent=intentAbort,abort=new AbortController(),signals=[options.signal,ownIntent.signal].filter(Boolean);
    const cancel=()=>abort.abort();for(const signal of signals){signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)abort.abort();}
    const current=()=>usable()&&epoch===ownEpoch&&!abort.signal.aborted;
    try{const result=await client.semanticTarget(value,{...options,signal:abort.signal,beforeDispatch:async()=>{
      if(!current())return false;const allowed=options.beforeDispatch?await options.beforeDispatch():true;return allowed&&current();
    }});if(!current())throw new Error('context-changed');return result;}
    finally{for(const signal of signals)signal.removeEventListener('abort',cancel);}
  };
  async function reply(ids){const ownEpoch=epoch;if(!usable())throw new Error('unavailable');
    const accepted=await controller.selectSemanticTarget(ids);if(!usable()||epoch!==ownEpoch)return;
    if(!accepted)throw new Error('target-unavailable');savedView=false;override={nodeId:ids.nodeId,rootId:ids.rootId};main.openThread(override);updateMain();
    await navigate?.('discussion');if(!usable()||epoch!==ownEpoch)return;
    document.querySelector?.('#discussion-body')?.focus?.({preventScroll:true});
  }
  const discover=mountSemanticTopicPanel(document,discoverRoot,{client:panelClient,idPrefix:'semantic-discover-',onReply:reply});
  const main=mountSemanticTopicPanel(document,mainRoot,{client:panelClient,idPrefix:'semantic-context-',contextMode:true,onReply:reply,
    onSelectionChange(selection){if(suppressSelection)return;override=selection?.rootId?{nodeId:selection.nodeId,rootId:selection.rootId}:null;updateMain();},
    async onRefresh(){const ownEpoch=epoch;await loadContext(true);if(usable()&&ownEpoch===epoch)main.refreshPage();}});
  async function loadContext(force=false){if(!usable())return;
    const sourceId=pageState?.sourceId,version=pageState?.catalog?.version;
    if(!sourceId||!version){contextCard=null;contextLoading=false;contextError=false;main.setTopicContext(null,{preserveThread:true});updateMain();return;}
    const requestKey=JSON.stringify([sourceId,version.generation,version.revision]);if(!force&&requestKey===contextRequestKey)return;
    contextRequestKey=requestKey;contextAbort?.abort();const abort=new AbortController();contextAbort=abort;
    const ownContext=++contextEpoch,ownEpoch=epoch,generation=version.generation,floor=version.revision;
    const current=()=>usable()&&epoch===ownEpoch&&contextEpoch===ownContext&&contextAbort===abort&&!abort.signal.aborted;
    contextLoading=true;contextError=false;updateMain();
    try{const raw=await client.semanticContext({sourceId},{signal:abort.signal,beforeDispatch:current});if(!current())return;
      const value=readSemanticContext(raw,{sourceId});if(value.version.generation!==generation||value.version.revision<floor)throw new Error('stale-context');
      contextCard=value.status==='classified'&&value.selectedPath.length?value.topic:null;contextLoading=false;contextError=false;
      main.setTopicContext(contextCard,{preserveThread:true});updateMain();
    }catch{if(current()){contextCard=null;contextLoading=false;contextError=true;main.setTopicContext(null,{preserveThread:true});updateMain();}}
    finally{if(contextAbort===abort)contextAbort=null;}
  }
  async function probe(){if(!connected||disposed)return;capabilityAbort?.abort();const abort=new AbortController();capabilityAbort=abort;
    const ownService=serviceEpoch;capability='loading';emit('loading');activatePanels();
    const current=()=>!disposed&&connected&&serviceEpoch===ownService&&capabilityAbort===abort&&!abort.signal.aborted;
    try{const value=await client.semanticCapabilities({signal:abort.signal,beforeDispatch:current});if(!current())return;readSemanticCapabilities(value);
      capability='available';routing(true);emit('available');activatePanels();void loadContext();
    }catch(error){if(current()){capability=isMissingSemanticCapabilities(error)?'legacy':'error';routing(false);emit(capability);activatePanels();}}
    finally{if(capabilityAbort===abort)capabilityAbort=null;}
  }
  async function retryContext(){const ownEpoch=epoch;if(!usable())return;await loadContext(true);if(usable()&&ownEpoch===epoch)main.refreshPage();}
  function readSavedThreads(){
    if(!usable()||!pageState?.sourceId||!savedView)return Promise.resolve();
    if(historyFlight)return historyFlight;
    const ownEpoch=epoch,sourceId=pageState.sourceId;
    const current=()=>usable()&&epoch===ownEpoch&&pageState?.sourceId===sourceId;
    historyPending=true;historyError=false;updateMain();
    if(!current())return Promise.resolve();
    const work=(async()=>{try{
      const result=await Promise.resolve().then(()=>current()?controller.refreshSavedThreads():false);
      if(current())historyError=result!==true||Boolean(controller.currentState?.()?.priorDiscussionsError);
    }catch{if(current())historyError=true;}
    finally{if(current()){historyPending=false;historyFlight=null;updateMain();}}})();
    historyFlight=work;return work;
  }
  function toggleSaved(){if(!usable()||!pageState?.sourceId)return;savedView=!savedView;updateMain();if(savedView)void readSavedThreads();}
  function retrySaved(){if(savedView)void readSavedThreads();}
  retry.addEventListener('click',retryContext);
  toggle.addEventListener('click',toggleSaved);historyRetry.addEventListener('click',retrySaved);
  return {
    setActive(value){if(disposed)return;discoverActive=Boolean(value);activatePanels();},
    setConnection(value){value=Boolean(value);if(disposed||connected===value)return;connected=value;serviceEpoch++;capabilityAbort?.abort();capabilityAbort=null;revoke();
      if(!value){capability='unknown';routing(false);emit('disconnected');activatePanels();}else void probe();},
    observePage(state){if(disposed)return;const previous=pageState,nextAccount=account(state),nextPage=identity(state);
      const changedAccount=accountKey!==null&&accountKey!==nextAccount,changedPage=pageKey!==nextPage;
      pageState=state;accountKey=nextAccount;pageKey=nextPage;
      if(changedPage)revoke();
      discover.observe(panelAccount());main.observe(panelAccount());
      if(changedAccount){serviceEpoch++;capabilityAbort?.abort();capabilityAbort=null;capability='unknown';if(connected)void probe();return;}
      if(usable()){
        void loadContext();
        if(override&&previous?.draft?.semantic&&!state?.draft?.semantic&&!state?.busy&&!state?.semanticWritePending)main.refreshPage();
      }
    },
    refresh(){if(disposed||!connected)return;const ownEpoch=epoch;if(capability==='available')return loadContext(true).then(()=>{if(usable()&&ownEpoch===epoch)main.refreshPage();});return probe();},
    dispose(){if(disposed)return;disposed=true;connected=false;serviceEpoch++;capabilityAbort?.abort();contextAbort?.abort();intentAbort.abort();
      capabilityAbort=contextAbort=null;override=contextCard=null;discover.dispose();main.dispose();routing(false);discussionPanel.setSemanticFeedMode(false);
      retry.removeEventListener('click',retryContext);toggle.removeEventListener('click',toggleSaved);historyRetry.removeEventListener('click',retrySaved);
      historyFlight=null;discoverRoot.hidden=discussionRoot.hidden=true;discussionRoot.replaceChildren();emit('disconnected');},
  };
}
