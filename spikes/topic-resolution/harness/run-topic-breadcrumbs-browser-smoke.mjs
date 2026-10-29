// Actual isolated Chrome DOM checks with invented public metadata. No database,
// provider, pairing credential or network request. Existing profiles are unused.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,writeFileSync,realpathSync,rmSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const browser=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].find(existsSync);
assert(browser,'Local Chrome/Chromium required');
const parent=realpathSync(fileURLToPath(new URL('../../../apps/local-service/data/',import.meta.url)));
const temporary=mkdtempSync(path.join(parent,'topic-breadcrumbs-smoke-'));
const moduleUrl=pathToFileURL(fileURLToPath(new URL('../browser/chromium/semantic-topic-panel.js',import.meta.url))).href;
function run(name,probe){
 const profile=path.join(temporary,name+'-profile'),file=path.join(temporary,name+'.html');
 const style=readFileSync(new URL('../browser/chromium/popup.css',import.meta.url),'utf8');
 const html=`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' file:; style-src 'unsafe-inline'"><style>${style}\nbody{width:390px;margin:0}#panel{width:100%;box-sizing:border-box}</style><section id="panel"></section><script type="module">
 import {mountSemanticTopicPanel} from ${JSON.stringify(moduleUrl)};
 const assert=(value,code='condition')=>{if(!value)throw Error(code);};
 const version={generation:'invented-generation',revision:1},id='subject-12345678-1234-4123-8123-123456789abc',parent='subject-22345678-1234-4123-8123-123456789abc';
 const row={nodeId:id,label:'<Kapsalon>',path:[parent,id],occupied:true,human:true,breadcrumbs:{fixed:[{nodeId:'food',label:'Food'}],topic:[{nodeId:parent,label:'Recipes'},{nodeId:id,label:'<Kapsalon>'}]}};
 const response={version,topics:[row],nextCursor:null},calls=[];
 const settle=()=>new Promise(done=>setTimeout(done,50));
 try{${probe};document.body.dataset.breadcrumbCheck='passed';}catch(error){document.body.dataset.breadcrumbCheck='failed';document.body.dataset.breadcrumbFailure=String(error.message).slice(0,80);}
 </script>`;
 writeFileSync(file,html,{mode:0o600});
 const result=spawnSync(browser,['--headless=new','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-breakpad','--disable-extensions','--disable-sync','--no-first-run','--no-default-browser-check',
  '--host-resolver-rules=MAP * ~NOTFOUND','--allow-file-access-from-files','--window-size=390,850','--user-data-dir='+profile,'--virtual-time-budget=2000','--dump-dom',pathToFileURL(file).href],
 {encoding:'utf8',timeout:15000,maxBuffer:2*1024*1024,windowsHide:true});
 assert.equal(result.error,undefined,name+' browser process failed');assert.equal(result.status,0,name+' browser exit');
 if(!/data-breadcrumb-check="passed"/u.test(result.stdout))throw Error(name+' DOM check '+JSON.stringify({state:result.stdout.match(/data-breadcrumb-check="([^"]*)"/u)?.[1]??'module-not-completed',failure:result.stdout.match(/data-breadcrumb-failure="([^"]*)"/u)?.[1]??null}));
 console.log(JSON.stringify({case:name,passed:true,realBrowser:true,syntheticMetadata:true}));
}
try{
 run('complete-path-and-original-destination',`
  const client={async semanticSearch(args){calls.push(['search',args]);return response;},async semanticFeed(args){calls.push(['feed',args]);return {version,policyRevision:0,nodeId:id,roots:[],nextCursor:null,actors:[]};}};
  const panel=mountSemanticTopicPanel(document,document.getElementById('panel'),{client});panel.setSearchAvailable(true);panel.setActive(true);panel.setConnection(true);await settle();
  const crumb=document.querySelector('.topic-breadcrumbs');assert(crumb?.textContent==='Food › Recipes › <Kapsalon>','caption');assert(crumb.children.length===0,'literal-text');assert(calls.length===1,'one-search');
  assert(!document.getElementById('panel').textContent.includes('22345678'),'no-identifiers');assert(document.getElementById('panel').scrollWidth<=390,'panel-width');
  document.getElementById('semantic-topic-open-'+id).click();await settle();assert(calls[1][0]==='feed'&&calls[1][1].nodeId===id);panel.dispose();
 `);
 run('retired-ancestry-keeps-public-caption',`
  row.breadcrumbs={fixed:[],topic:[{nodeId:id,label:row.label}]};const client={async semanticSearch(){calls.push('search');return response;}};
  const panel=mountSemanticTopicPanel(document,document.getElementById('panel'),{client});panel.setSearchAvailable(true);panel.setActive(true);panel.setConnection(true);await settle();
  assert(document.querySelector('.topic-breadcrumbs')===null);assert(document.getElementById('semantic-topic-open-'+id).textContent==='<Kapsalon>');assert(calls.length===1);panel.dispose();
 `);
 run('malformed-path-refuses-before-render',`
  row.breadcrumbs.topic[0].sourceId='private';const client={async semanticSearch(){return response;}};
  const panel=mountSemanticTopicPanel(document,document.getElementById('panel'),{client});panel.setSearchAvailable(true);panel.setActive(true);panel.setConnection(true);await settle();
  assert(document.querySelectorAll('.discovery-card').length===0);assert(!document.getElementById('semantic-topic-retry').hidden);panel.dispose();
 `);
}finally{
 const resolved=realpathSync(temporary);assert.equal(path.dirname(resolved),parent);assert(path.basename(resolved).startsWith('topic-breadcrumbs-smoke-'));
 rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
