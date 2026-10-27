import test from 'node:test';
import assert from 'node:assert/strict';
import {mountCanonicalHistoryPanel,mountChatsWithPublicHistory} from '../browser/chromium/canonical-history-panel.js';
const version={generation:'history-generation',revision:8};
const entry=(topicId='manual-a')=>({topicId,discussionId:'discussion-'+topicId,title:'<Manual unclassified topic>',kind:'general',snippet:'<Public text>',visibleCount:3,updatedAt:null,sources:[]});
const listing=()=>({version,query:'',results:[entry()],nextCursor:'next_list'});
const visible=(id,rootId=null)=>({id,rootId,replyToId:rootId,state:'visible',authorId:'demo-alex',actorType:'human',body:'<script>Public\nmessage',createdAt:'2026-10-27T12:00:00.000Z',edited:false});
const page=()=>({version,discussionVersion:3,topic:{id:'manual-a',title:'Original manual topic',kind:'general'},discussionId:'discussion-manual-a',items:[visible('root-a'),{...visible('reply-a','off-page-root'),replyToId:'off-page-parent'},
 {id:'deleted-a',rootId:'off-page-root',replyToId:'off-page-parent',state:'deleted',label:'Deleted by user'},
 {...visible('agent-a'),authorId:'demo-imported-ai',actorType:'agent',insight:{kind:'generated',operatorId:'demo-alex'}}],nextCursor:'next_messages'});
const settle=()=>new Promise(r=>setImmediate(r));
function fixture(){const created=[],calls=[];
 const document={createElement(tag){const n={tag,textContent:'',children:[],style:{},attributes:{},listeners:new Map(),hidden:false,disabled:false,
 append(...v){this.children.push(...v);},replaceChildren(...v){this.children=v;},setAttribute(k,v){this.attributes[k]=v;},
 addEventListener(e,f){this.listeners.set(e,f);},removeEventListener(e,f){if(this.listeners.get(e)===f)this.listeners.delete(e);}};created.push(n);return n;}};
 const client={};for(const method of ['discover','canonicalDiscussionPage'])client[method]=(args,options)=>new Promise((resolve,reject)=>calls.push({method,args,options,resolve,reject}));
 const root=document.createElement('section'),panel=mountCanonicalHistoryPanel(document,root,{client}),find=id=>created.findLast(n=>n.id==='canonical-history-'+id);
 return {root,panel,calls,created,find,document,client,click(id){const n=find(id);assert.ok(n);n.listeners.get('click')?.();},start(){panel.observe({actorId:null,sessionRevision:1,sourceId:'page-b'});panel.setActive(true);panel.setAvailable(true);},
 async directory(){calls.at(-1).resolve(listing());await settle();},async topic(){this.click('open-manual-a');calls.at(-1).resolve(page());await settle();}};
}
test('anonymous global history starts only on active connection and never depends on foreground Source or account',async()=>{
 const f=fixture();assert.equal(f.calls.length,0);f.start();assert.deepEqual(f.calls[0].args,{query:'',limit:20,cursor:null});assert.equal(f.calls[0].options.beforeDispatch(),true);
 await f.directory();assert.equal(f.find('results').children.length,1);f.panel.observe({actorId:null,sessionRevision:1,sourceId:'different-page',generation:'other'});assert.equal(f.calls.length,1);
 f.click('open-manual-a');assert.deepEqual(f.calls.at(-1).args,{topicId:'manual-a',limit:20,cursor:null});assert.equal(f.calls.at(-1).method,'canonicalDiscussionPage');f.panel.dispose();
});
test('manual and unclassified canonical content renders bounded flat pages, one reply inset and minimal deleted metadata',async()=>{
 const f=fixture();f.start();await f.directory();await f.topic();const cards=f.find('results').children;assert.equal(cards.length,4);
 assert.equal(cards[1].style.marginInlineStart,'1rem');assert.equal(cards[2].style.marginInlineStart,'1rem');assert.equal(cards[1].children.some(n=>n.tag==='article'),false);
 assert.deepEqual(cards[2].children.map(n=>n.textContent),['Deleted by user']);assert.equal(Object.hasOwn(cards[2].attributes,'data-actor-type'),false);
 assert.equal(cards[0].children[1].textContent,'<script>Public\nmessage');assert.equal(cards[0].children[1].className,'discussion-body');assert.equal(cards[3].children[0].textContent,'AI');
 assert.equal(f.created.some(n=>['textarea','a','script'].includes(n.tag)),false);assert.equal(f.created.some(n=>/reply|submit|generate/iu.test(n.id??'')),false);f.panel.dispose();
});
test('list and contribution cursors are independent and conflict retry requires a click with first-page cursor',async()=>{
 const f=fixture();f.start();await f.directory();f.click('next');assert.deepEqual(f.calls.at(-1).args,{query:'',limit:20,cursor:'next_list'});
 f.calls.at(-1).reject({code:'conflict',message:'Private details'});await settle();const count=f.calls.length;assert.equal(f.find('retry').hidden,false);assert.equal(f.calls.length,count);
 f.click('retry');assert.equal(f.calls.at(-1).args.cursor,null);await f.directory();await f.topic();f.click('next');assert.equal(f.calls.at(-1).args.cursor,'next_messages');
 f.calls.at(-1).resolve({...page(),version:{...version,revision:99},nextCursor:null});await settle(); // Unrelated crawler revision does not invalidate discussionVersion.
 f.click('previous');assert.equal(f.calls.at(-1).args.cursor,null);assert.equal(f.calls.at(-1).args.topicId,'manual-a');f.panel.dispose();
});
test('back aborts an unresolved selected topic and late transport success cannot overwrite the global list',async()=>{
 const f=fixture();f.start();await f.directory();f.click('open-manual-a');const old=f.calls.at(-1);assert.equal(f.find('back').disabled,false);f.click('back');
 assert.equal(old.options.signal.aborted,true);assert.equal(old.options.beforeDispatch(),false);assert.deepEqual(f.calls.at(-1).args,{query:'',limit:20,cursor:null});
 await f.directory();old.resolve(page());await settle();assert.equal(f.find('results').children[0].children[0].textContent,'<Manual unclassified topic>');f.panel.dispose();
});
test('account/session revocation, view navigation, disconnect and dispose fence ignored-abort responses and remove listeners',async()=>{
 for(const revoke of [f=>f.panel.observe({actorId:'demo-blair',sessionRevision:1}),f=>f.panel.observe({actorId:null,sessionRevision:2}),f=>f.panel.setActive(false),f=>f.panel.setAvailable(false),f=>f.panel.dispose()]){
  const f=fixture();f.start();await f.directory();f.click('open-manual-a');const old=f.calls.at(-1);revoke(f);assert.equal(old.options.signal.aborted,true);assert.equal(old.options.beforeDispatch(),false);
  old.resolve(page());await settle();assert.equal(f.find('results').children.length,0);f.panel.dispose();assert.ok(f.created.every(n=>n.listeners.size===0));
 }
});
test('invalid destination, tombstone leaks and ordinary errors remain finite; explicit refresh resets cursor',async()=>{
 const f=fixture();f.start();f.calls.at(-1).reject(Error('private body or token'));await settle();assert.equal(f.find('status').textContent.includes('token'),false);f.click('retry');await f.directory();
 f.click('open-manual-a');f.calls.at(-1).resolve({...page(),discussionId:'retargeted'});await settle();assert.equal(f.find('results').children.length,0);assert.equal(f.find('retry').hidden,false);
 f.click('retry');const invalid=page();invalid.items[2].body='Deleted secret';f.calls.at(-1).resolve(invalid);await settle();assert.equal(f.find('results').children.length,0);
 f.click('refresh');assert.equal(f.calls.at(-1).args.cursor,null);f.calls.at(-1).resolve({...page(),items:[],nextCursor:null});await settle();assert.equal(f.find('status').textContent,'No public messages on this page.');f.panel.dispose();
});
test('real My chats composition keeps anonymous public history separate and private starts return to the existing account workspace',async()=>{
 const f=fixture();f.panel.dispose();const root=f.document.createElement('section'),events=[];let account={actorId:null,sessionRevision:1};
 const original={start:async(...args)=>{events.push(['start',...args]);return true;},setActive:v=>events.push(['active',v]),setAvailable:v=>events.push(['available',v]),accountChanged:()=>events.push(['account']),observe:()=>events.push(['observe']),dispose:()=>events.push(['dispose'])};
 const workspace=mountChatsWithPublicHistory(f.document,root,{client:f.client,readAccount:()=>account,mountAccountChats:host=>{host.append(f.document.createElement('textarea'));return original;}});
 const button=id=>f.created.findLast(n=>n.id===id),click=id=>button(id).listeners.get('click')();
 workspace.setAvailable(true);workspace.setActive(true);assert.equal(f.calls.length,0);assert.equal(root.children[1].hidden,false);
 click('public-history-view');assert.equal(root.children[1].hidden,true);assert.deepEqual(f.calls.at(-1).args,{query:'',limit:20,cursor:null});
 const pending=f.calls.at(-1);account={actorId:null,sessionRevision:2};workspace.observe();assert.equal(pending.options.signal.aborted,true);assert.equal(pending.options.beforeDispatch(),false);
 f.calls.at(-1).resolve(listing());await settle();const count=f.calls.length;
 assert.equal(await workspace.start('Unsent explicit private draft',true),true);assert.equal(root.children[1].hidden,false);assert.deepEqual(events.at(-1),['start','Unsent explicit private draft',true]);assert.equal(f.calls.length,count);
 assert.equal(root.children[1].children[0].tag,'textarea');workspace.accountChanged();assert.deepEqual(events.at(-1),['account']);
 workspace.dispose();assert.equal(root.children.length,0);assert.equal(button('public-history-view').listeners.size,0);assert.deepEqual(events.at(-1),['dispose']);
});
