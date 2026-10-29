// Real headless browser, invented metadata only. No application DB or provider.
import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
import {existsSync,mkdtempSync,readFileSync,writeFileSync,realpathSync,rmSync} from 'node:fs';import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {renderDashboardDocument,renderSnapshotScript} from '../src/cli.js';
const web=fileURLToPath(new URL('../web/',import.meta.url));
const browser=(process.platform==='win32'?['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']:['/usr/bin/chromium','/usr/bin/google-chrome']).find(existsSync);
if(!browser)throw Error('Local browser missing');
const parent=realpathSync(fileURLToPath(new URL('../../local-service/data/',import.meta.url))),temporary=mkdtempSync(path.join(parent,'dashboard-assignment-smoke-'));
const base=()=>({schemaVersion:2,generatedAt:new Date().toISOString(),catalogRevision:'a'.repeat(64),schemaProfile:'hierarchy17',graphMode:'semantic-aggregates',graphLimited:false,
 counts:{totalSources:10,learnedSources:8,displayedPages:0,topics:2,totalTopics:3,multiMemberTopics:1,singletonTopics:1,legacyContainers:{active:2,total:3,multiMember:1,singleton:1}},
 topics:[],pages:[],edges:[],semantic:{revision:'b'.repeat(64),policyRevision:0,protectedMetadataOnly:true,
  counts:{preparedSources:6,currentHeadClassifiedSources:3,currentHeadAbstainedSources:1,currentHeadExcludedSources:1,currentHeadPendingSources:3,
   distinctRoots:2,activeNodes:3,configuredDisplayGroups:2,occupiedDisplayGroups:1},
  assignments:{schema:'topic-assignment-counts/v1',mode:'owner-display-policy',automaticDiscovery:'not-enabled',topics:[{id:'games',title:'Games',path:['games'],sources:3},{id:'nature',title:'Nature',path:['nature'],sources:0}]}}});
function snapshot(){const s=base();s.counts.semantic={...s.semantic.counts};return s;}
function automaticSnapshot(){
 const s=snapshot(),parent={id:'subject-11111111-1111-4111-8111-111111111111',title:'Kapsalon'},leaf={id:'subject-22222222-2222-4222-8222-222222222222',title:'Kipkapsalon'};
 s.schemaProfile='hierarchy18';s.semantic.assignments.mode='fixed-owner-policy';s.semantic.assignments.automaticDiscovery='enabled';
 s.semantic.automatic={schema:'automatic-topic-assignment-counts/v1',activeSubjects:2,occupiedSubjects:2,matchedSources:3,truncated:false,
  topics:[{...parent,parentId:null,directSources:0,sources:3,path:[parent]},{...leaf,parentId:parent.id,directSources:3,sources:3,path:[parent,leaf]}]};return s;
}
function run(name,initial,next,probe){
 const prelude=`const originalAppend=document.head.append.bind(document.head);let firstBridge=true;document.head.append=(...nodes)=>{if(firstBridge&&nodes[0]?.tagName==='SCRIPT'&&nodes[0].src.includes('/snapshot.js?')){firstBridge=false;setTimeout(()=>originalAppend(...nodes),600);return;}originalAppend(...nodes);};`;
 const file=path.join(temporary,name+'.html');const html=renderDashboardDocument({template:readFileSync(path.join(web,'index.html'),'utf8'),style:readFileSync(path.join(web,'style.css'),'utf8'),script:prelude+readFileSync(path.join(web,'app.js'),'utf8'),snapshot:initial});
 writeFileSync(file,html.replace('</body>',`<script>${probe}</script></body>`));writeFileSync(path.join(temporary,'snapshot.js'),renderSnapshotScript(next));
 const profile=path.join(temporary,name+'-profile');
 const r=spawnSync(browser,['--headless=new','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-breakpad','--disable-extensions','--disable-sync',
  '--no-first-run','--no-default-browser-check','--host-resolver-rules=MAP * ~NOTFOUND','--window-size=390,900',`--user-data-dir=${profile}`,
  '--virtual-time-budget=4400','--dump-dom',pathToFileURL(file).href],{encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:1048576});
 assert.equal(r.status,0,`${name}: browser exit ${r.status}`);if(!r.stdout.includes('data-assignment-check="passed"')){
  const diagnostic=r.stdout.match(/<body[^>]*>|<p id="status"[^>]*>[\s\S]*?<\/p>|<div id="status"[^>]*>[\s\S]*?<\/div>|<tbody id="semantic-topic-counts"[^>]*>[\s\S]*?<\/tbody>|<progress id="semantic-assignment-progress"[^>]*>/gu);
  console.log(JSON.stringify({name,diagnostic}));
 }assert(r.stdout.includes('data-assignment-check="passed"'),`${name}: DOM check failed`);
 // Retire only this newly generated isolated profile before starting the next
 // browser; do not accumulate nine profile caches on the constrained drive.
 const resolvedProfile=realpathSync(profile);if(path.dirname(resolvedProfile)!==temporary||path.basename(resolvedProfile)!==name+'-profile')throw Error('Unexpected profile cleanup path');
 rmSync(resolvedProfile,{recursive:true,force:true,maxRetries:5,retryDelay:100});
 console.log(name+': passed');
}
try{
 const s=snapshot(),next=structuredClone(s);next.catalogRevision='c'.repeat(64);next.semantic.revision='d'.repeat(64);
 Object.assign(next.semantic.counts,{preparedSources:7,currentHeadClassifiedSources:5,currentHeadPendingSources:1,occupiedDisplayGroups:2});
 next.counts.semantic={...next.semantic.counts};next.semantic.assignments.topics[1].sources=2;
 run('fresh-and-refresh',s,next,`let first=false;setTimeout(()=>{const rows=[...document.querySelectorAll('#semantic-topic-counts tr')];first=rows.length===2&&rows[0].textContent.includes('Games3')&&document.getElementById('semantic-assignment-progress').value===3;},300);
 setTimeout(()=>{const rows=[...document.querySelectorAll('#semantic-topic-counts tr')],p=document.getElementById('semantic-assignment-progress');
  if(first&&rows[1].textContent.includes('Nature2')&&p.value===5&&p.max===8&&document.getElementById('semantic-automatic-status').textContent.includes('noch nicht aktiviert'))document.body.dataset.assignmentCheck='passed';},4000);`);
 const old=snapshot();delete old.semantic.assignments;run('old-snapshot',old,old,`setTimeout(()=>{if(document.getElementById('semantic-assignment-progress').value===3&&document.querySelectorAll('#semantic-topic-counts tr').length===0&&document.getElementById('semantic-automatic-status').textContent.includes('noch nicht enthalten'))document.body.dataset.assignmentCheck='passed';},500);`);
 const bad=snapshot();bad.semantic.assignments.topics[0].sources=4;run('invalid-partition',bad,bad,`setTimeout(()=>{if(document.querySelectorAll('#semantic-topic-counts tr').length===0&&document.getElementById('data-age').textContent.includes('Noch keine Daten'))document.body.dataset.assignmentCheck='passed';},500);`);
 run('invalid-refresh-keeps-good-counts',snapshot(),bad,`setTimeout(()=>{if(document.querySelectorAll('#semantic-topic-counts tr')[0]?.textContent.includes('Games3')&&document.getElementById('semantic-assignment-progress').value===3&&document.getElementById('snapshot-health').dataset.state==='error')document.body.dataset.assignmentCheck='passed';},4000);`);
 const duplicate=snapshot();duplicate.semantic.assignments.topics[1].id='games';duplicate.semantic.assignments.topics[1].path=['games'];
 run('duplicate-topic',duplicate,duplicate,`setTimeout(()=>{if(document.querySelectorAll('#semantic-topic-counts tr').length===0&&document.getElementById('data-age').textContent.includes('Noch keine Daten'))document.body.dataset.assignmentCheck='passed';},500);`);
 const automatic=automaticSnapshot(),automaticNext=structuredClone(automatic);automaticNext.catalogRevision='e'.repeat(64);automaticNext.semantic.revision='f'.repeat(64);
 automaticNext.semantic.automatic.matchedSources=4;automaticNext.semantic.automatic.topics[0].sources=4;Object.assign(automaticNext.semantic.automatic.topics[1],{directSources:4,sources:4});
 run('automatic-counts-and-refresh',automatic,automaticNext,`let first=false;setTimeout(()=>{const r=document.querySelectorAll('#automatic-topic-counts tr');first=!document.getElementById('automatic-topic-summary').hidden&&r.length===2&&r[0].children[1].textContent==='0'&&r[0].children[2].textContent==='3'&&r[1].children[1].textContent==='3';},300);
 setTimeout(()=>{const r=document.querySelectorAll('#automatic-topic-counts tr');if(first&&r[0].children[2].textContent==='4'&&r[1].children[1].textContent==='4'&&r[1].children[0].title==='Kapsalon → Kipkapsalon'&&document.getElementById('semantic-assignment-progress').value===3&&document.getElementById('semantic-fixed-heading').textContent==='Feste Grundthemen'&&document.documentElement.scrollWidth<=window.innerWidth)document.body.dataset.assignmentCheck='passed';},4000);`);
 const automaticBad=automaticSnapshot();automaticBad.semantic.automatic.matchedSources=9;
 run('automatic-invalid-refresh-keeps-good-counts',automaticSnapshot(),automaticBad,`setTimeout(()=>{if(document.querySelectorAll('#automatic-topic-counts tr')[0]?.children[2].textContent==='3'&&document.getElementById('snapshot-health').dataset.state==='error')document.body.dataset.assignmentCheck='passed';},4000);`);
 const literal=automaticSnapshot(),caption='<img src=x onerror=alert(1)>';literal.semantic.automatic.topics[0].title=caption;for(const r of literal.semantic.automatic.topics)r.path[0].title=caption;
 run('automatic-caption-is-text',literal,literal,`setTimeout(()=>{const r=document.querySelector('#automatic-topic-counts tr th');if(r?.textContent==='<img src=x onerror=alert(1)>'&&!document.querySelector('#automatic-topic-counts img'))document.body.dataset.assignmentCheck='passed';},500);`);
 const missing=automaticSnapshot();delete missing.semantic.automatic;
 run('automatic-missing-counts-refuses',missing,missing,`setTimeout(()=>{if(document.querySelectorAll('#automatic-topic-counts tr').length===0&&document.getElementById('data-age').textContent.includes('Noch keine Daten'))document.body.dataset.assignmentCheck='passed';},500);`);
}finally{
 const resolved=realpathSync(temporary);if(path.dirname(resolved)!==parent||!path.basename(resolved).startsWith('dashboard-assignment-smoke-'))throw Error('Unexpected cleanup path');
 rmSync(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
