import { parseTopicSpacesResponse, parseTopicSpaceOwnerResponse, parseTopicSpacePolicyRequest } from "../core/topic-space-contract.js";

export const TOPIC_SPACE_EN = Object.freeze({
  topicSpaceHeading:"Search Topics", topicSpaceSearch:"Search Topics", topicSpaceSearchAction:"Search",
  topicSpaceLoading:"Loading topics…", topicSpaceUnavailable:"Topics are unavailable. Try again.",
  topicSpaceConnect:"Connect to explore topics.", topicSpaceEmpty:"No discussions found.",
  topicSpaceBuilding:"Topic groups are being prepared.", topicSpaceCapacity:"Topic grouping capacity reached.",
  topicSpaceReadOnly:"Read-only previews. Follow a page link to join the discussion.",
  topicSpaceDefault:"Owner default for topic discovery", topicSpaceSpecificity:"Broad → Specific",
  topicSpaceBroad:"Broad", topicSpaceSpecific:"Specific",
  topicSpaceOverride:"Owner setting for this topic", topicSpaceSave:"Save", topicSpaceReset:"Use owner default",
  topicSpaceTitle:"Topic label (optional)",
  topicSpaceSaved:"Topic grouping saved.", topicSpacePrevious:"Previous", topicSpaceNext:"Next",
  topicSpaceCounts:"{threads} discussions · {human} human · {ai} AI", topicSpaceOpen:"Open discussion",
});

export function mountTopicSpacePanel(document, root, {client,messages={},onOpenDiscussion,onOpenSource,
  setTimeout:schedule=globalThis.setTimeout,clearTimeout:cancel=globalThis.clearTimeout}={}) {
  const t = key => typeof messages[key] === "string" ? messages[key] : TOPIC_SPACE_EN[key];
  let active=false, connected=false, disposed=false, epoch=0, pending=null, ownerPending=null, saving=null;
  let context="", offset=0, page=null, policy=null, canManage=false, busy=false, ownerControlsRevision=null;
  let retryTimer=null;
  let renderedSignature=null;
  const handlers=[], cards=[], ownerHandlers=[];
  const node=(tag,text="",id="") => { const n=document.createElement(tag); n.textContent=text; if(id)n.id=id; return n; };
  const listen=(n,event,fn,list=handlers) => { n.addEventListener(event,fn); list.push([n,event,fn]); };
  const unlisten=list => { for(const [n,event,fn] of list)n.removeEventListener(event,fn); list.length=0; };
  const button=(text,id) => {const n=node("button",text,id);n.type="button";return n;};
  const heading=node("h2",t("topicSpaceHeading"),"topic-space-heading"); root.setAttribute("aria-labelledby",heading.id);
  const form=node("form");
  const search=node("input","","topic-space-search"); search.type="search"; search.maxLength=256; search.value="";
  search.setAttribute("aria-label",t("topicSpaceSearch"));
  const submit=button(t("topicSpaceSearchAction"),"topic-space-submit"); submit.type="submit";form.append(search,submit);
  const status=node("p","","topic-space-status");status.setAttribute("role","status"); status.setAttribute("aria-live","polite");
  const owner=node("section","","topic-space-owner");owner.hidden=true;
  const results=node("div","","topic-space-results"); results.className="discovery-results";
  const previous=button(t("topicSpacePrevious"),"topic-space-previous"), next=button(t("topicSpaceNext"),"topic-space-next");
  const pager=node("nav");pager.append(previous,next);
  root.replaceChildren(heading,form,owner,status,results,pager);
  function available(){return active && connected && !disposed;}
  function activity(value){busy=value;root.setAttribute("aria-busy",String(value));previous.disabled=value || offset===0;next.disabled=value || !page || offset+20>=page.total;}
  function invalidate(){epoch++;pending?.abort();ownerPending?.abort();saving?.abort();pending=ownerPending=saving=null;if(retryTimer!==null)cancel(retryTimer);retryTimer=null;activity(false);}
  function clear(){page=null;policy=null;canManage=false;ownerControlsRevision=null;renderedSignature=null;unlisten(cards);unlisten(ownerHandlers);results.replaceChildren();owner.replaceChildren();owner.hidden=true;offset=0;activity(false);}
  function slider(value,id){const n=node("input","",id);n.type="range";n.min="0";n.max="100";n.step="25";n.value=String(value);n.setAttribute("aria-label",t("topicSpaceSpecificity"));return n;}
  function sliderEndpoints(){const n=node("div");n.className="topic-space-slider-endpoints";n.append(node("span",t("topicSpaceBroad")),node("span",t("topicSpaceSpecific")));return n;}
  function renderOwner(){
    if(!canManage || !policy){owner.hidden=true;return;}
    // A polling response must never replace a live owner draft.
    if(ownerControlsRevision===policy.revision){owner.hidden=false;return;}
    ownerControlsRevision=policy.revision;owner.hidden=false;unlisten(ownerHandlers);owner.replaceChildren();
    const title=node("label",t("topicSpaceDefault"));title.htmlFor="topic-space-default";
    const control=slider(policy.defaultSpecificity,"topic-space-default"), save=button(t("topicSpaceSave"),"topic-space-save-default");
    listen(save,"click",()=>void savePolicy({...policy,defaultSpecificity:Number(control.value)}),ownerHandlers);
    owner.append(title,control,sliderEndpoints(),save);
  }
  function render(){
    const signature=JSON.stringify([page?.groups??[],policy,canManage]);
    if(signature===renderedSignature){activity(busy);return;}renderedSignature=signature;
    unlisten(cards);renderOwner();results.replaceChildren();
    for(const group of page?.groups??[]){
      const card=node("article");card.className="discovery-card";
      card.append(node("h3",group.title),node("p",t("topicSpaceCounts").replace("{threads}",String(group.threadCount)).replace("{human}",String(group.humanCount)).replace("{ai}",String(group.aiCount))));
      if(canManage && policy){
        const setting=policy.topicOverrides.find(item=>item.spaceId===group.policyTopicId);
        const name=node("label",t("topicSpaceOverride"));name.htmlFor="topic-space-override-"+group.id;
        const control=slider(setting?.specificity??policy.defaultSpecificity,name.htmlFor);
        const titleLabel=node("label",t("topicSpaceTitle"));titleLabel.htmlFor="topic-space-title-"+group.id;
        const titleInput=node("input","",titleLabel.htmlFor);titleInput.type="text";titleInput.maxLength=200;titleInput.value=setting?.title??"";
        const save=button(t("topicSpaceSave"),"topic-space-save-"+group.id), reset=button(t("topicSpaceReset"),"topic-space-reset-"+group.id);
        listen(save,"click",()=>void savePolicy({...policy,topicOverrides:[...policy.topicOverrides.filter(item=>item.spaceId!==group.policyTopicId),{spaceId:group.policyTopicId,specificity:Number(control.value),title:titleInput.value.trim()||null}]}),cards);
        listen(reset,"click",()=>void savePolicy({...policy,topicOverrides:policy.topicOverrides.filter(item=>item.spaceId!==group.policyTopicId)}),cards);
        card.append(name,control,sliderEndpoints(),titleLabel,titleInput,save,reset);
      }
      for(const thread of group.threads){
        const preview=node("section"), open=button(thread.title || t("topicSpaceOpen"),"topic-space-open-"+thread.rootId);
        listen(open,"click",()=>{if(available())onOpenDiscussion?.(thread.topicId,thread);},cards);
        preview.append(open,node("p",thread.snippet));
        if(thread.url){
          const link=node("a",thread.url);link.href=thread.url;link.target="_blank";link.rel="noopener noreferrer";link.referrerPolicy="no-referrer";
          if(onOpenSource)listen(link,"click",event=>{if(!available()){event.preventDefault();return;}event.preventDefault();onOpenSource(thread.sourceId,thread.url);},cards);
          preview.append(link);
        }
        card.append(preview);
      }
      results.append(card);
    }
    activity(busy);
  }
  async function load(attempt=1){
    if(!available())return;
    if(retryTimer!==null)cancel(retryTimer);retryTimer=null;
    pending?.abort();const abort=new AbortController();pending=abort;const stamp=epoch;
    const request={sourceId:null,query:search.value.trim(),offset,limit:20};activity(true);status.textContent=t("topicSpaceLoading");
    try{
      const value=parseTopicSpacesResponse(await client.topicSpaces(request,{signal:abort.signal}));
      if(!available() || stamp!==epoch || pending!==abort)return;
      page=value;if(!policy || value.policy.revision>=policy.revision)policy=value.policy;render();status.textContent=value.state!=="ready"?t(value.state==="building"?"topicSpaceBuilding":"topicSpaceCapacity"):value.groups.length?"":t("topicSpaceEmpty");
      if(value.state==="building" && attempt<5)retryTimer=schedule(()=>{retryTimer=null;if(available()&&stamp===epoch)void load(attempt+1);},Math.min(2000,250*2**(attempt-1)));
    }catch{if(available() && stamp===epoch && pending===abort){page=null;results.replaceChildren();status.textContent=t("topicSpaceUnavailable");}}
    finally{if(stamp===epoch && pending===abort){pending=null;activity(false);}}
  }
  async function checkOwner(){
    if(!available() || typeof client.topicSpaceOwner!=="function")return;
    const abort=new AbortController();ownerPending=abort;const stamp=epoch;
    try{
      const value=parseTopicSpaceOwnerResponse(await client.topicSpaceOwner({signal:abort.signal}));
      if(!available() || stamp!==epoch || ownerPending!==abort)return;
      canManage=value.canManage;if(!policy || value.policy.revision>=policy.revision)policy=value.policy;if(page)render();else renderOwner();
    }catch{if(stamp===epoch && ownerPending===abort){canManage=false;owner.hidden=true;}}
    finally{if(ownerPending===abort)ownerPending=null;}
  }
  async function savePolicy(draft){
    if(!available() || !canManage || !policy || saving)return;
    let request;
    try {request=parseTopicSpacePolicyRequest({expectedRevision:policy.revision,defaultSpecificity:draft.defaultSpecificity,topicOverrides:draft.topicOverrides});}
    catch {status.textContent=t("topicSpaceUnavailable");return;}
    const abort=new AbortController();saving=abort;const stamp=epoch;
    try{
      const value=parseTopicSpaceOwnerResponse(await client.updateTopicSpacePolicy(request,{signal:abort.signal}));
      if(!available() || stamp!==epoch || saving!==abort)return;
      canManage=value.canManage;policy=value.policy;offset=0;page=null;render();status.textContent=t("topicSpaceSaved");void load();
    }catch{if(available() && stamp===epoch && saving===abort)status.textContent=t("topicSpaceUnavailable");}
    finally{if(saving===abort)saving=null;}
  }
  function start(){if(available()){void load();void checkOwner();}else status.textContent=t("topicSpaceConnect");}
  listen(form,"submit",event=>{event.preventDefault();if(event.isComposing)return;invalidate();offset=0;start();});
  // Typing has no policy or network side effect. Submit explicitly searches.
  listen(search,"input",()=>{invalidate();});
  listen(previous,"click",()=>{if(available()&&!busy&&offset>=20){offset-=20;void load();}});
  listen(next,"click",()=>{if(available()&&!busy&&page&&offset+20<page.total){offset+=20;void load();}});
  status.textContent=t("topicSpaceConnect");activity(false);
  return {
    observe(state){
      if(disposed)return;
      // Global discovery has no active-page witness or page-specific ranking.
      // Account/session changes still revoke pending owner reads and controls.
      const nextContext=JSON.stringify([state?.actorId??state?.accountId??null,state?.sessionRevision??null]);
      if(nextContext===context)return;context=nextContext;invalidate();clear();start();
    },
    setActive(value){value=Boolean(value);if(disposed||active===value)return;active=value;invalidate();clear();start();},
    setConnection(value){value=Boolean(value);if(disposed||connected===value)return;connected=value;invalidate();clear();start();},
    dispose(){if(disposed)return;disposed=true;invalidate();clear();unlisten(handlers);root.replaceChildren();},
  };
}
