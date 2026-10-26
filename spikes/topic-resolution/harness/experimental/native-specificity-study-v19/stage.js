// ADR179 pure stage constructor. No filesystem, browser or source loading.
import {record,hash,sha,digest,freeze,requireTrue,validateSpecificityBatch,deriveBatchNetworkScope} from './manifest.js';

export const STAGE_SOURCE_PATHS=Object.freeze(['manifest.json','worker.js','native-adapter.js',
 'native-rights.js','chromium/page-content-reader.js','core/page-content-policy.js']);
export const STAGE_FILE_PATHS=Object.freeze([...STAGE_SOURCE_PATHS,'batch-config.js'].sort());
export const STAGE_LIMITS=Object.freeze({sourceFileBytes:131072,sourceTotalBytes:524288,templateBytes:16384,
 generatedFileBytes:16384,outputTotalBytes:524288});
const TEMPLATE=freeze({manifest_version:3,name:'Murmingle isolated native specificity study template',version:'1.0.0',
 minimum_chrome_version:'116',incognito:'not_allowed',permissions:['scripting','tabs'],host_permissions:[],
 background:{service_worker:'worker.js',type:'module'},content_security_policy:{extension_pages:
 "default-src 'none'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"}});

/** The external pins must come from the trusted fixed-source inventory, not
 * from hashing the caller's own strings. This function cannot prove their origin.
 * All six texts are authenticated before parsing the manifest or batch metadata.
 * Strings are immutable; no mutable Buffer is returned or alleged to be frozen. */
export function buildSpecificityStage(input){
 const a=record(input,['manifest','batch','expectedPanelIdentity','expectedManifestHash','expectedSourceHashes','sources']);
 const pins=record(a.expectedSourceHashes,STAGE_SOURCE_PATHS),sources=record(a.sources,STAGE_SOURCE_PATHS);
 let sourceBytes=0;const sourceHashes={};
 for(const name of STAGE_SOURCE_PATHS){
  hash(pins[name]);const value=sources[name];requireTrue(typeof value==='string'&&value.length>0&&value.isWellFormed(),'stage-source');
  const bytes=Buffer.byteLength(value,'utf8');requireTrue(bytes<=(name==='manifest.json'?STAGE_LIMITS.templateBytes:STAGE_LIMITS.sourceFileBytes),'stage-capacity');
  sourceBytes+=bytes;requireTrue(sourceBytes<=STAGE_LIMITS.sourceTotalBytes,'stage-capacity');
  requireTrue(sha(value)===pins[name],'stage-source-identity');sourceHashes[name]=pins[name];
 }
 let template;try{template=JSON.parse(sources['manifest.json']);}catch{requireTrue(false,'stage-template');}
 requireTrue(JSON.stringify(template)===JSON.stringify(TEMPLATE),'stage-template');
 const batch=validateSpecificityBatch({manifest:a.manifest,batch:a.batch,expectedPanelIdentity:a.expectedPanelIdentity,expectedManifestHash:a.expectedManifestHash});
 const scope=deriveBatchNetworkScope(a.manifest,batch);
 const manifestText=JSON.stringify({...template,host_permissions:scope.primaryOrigins.map(origin=>origin+'/*')},null,2)+'\n';
 const batchConfig={phase:batch.phase,batchIndex:batch.batchIndex,batchId:batch.batchId,cases:batch.cases};
 const configText='export const BATCH = '+JSON.stringify(batchConfig)+';\n';
 requireTrue(Buffer.byteLength(manifestText)<=STAGE_LIMITS.generatedFileBytes&&Buffer.byteLength(configText)<=STAGE_LIMITS.generatedFileBytes,'stage-capacity');
 const generated={'manifest.json':manifestText,'batch-config.js':configText};
 let outputBytes=0;
 const files=STAGE_FILE_PATHS.map(path=>{
  const text=Object.hasOwn(generated,path)?generated[path]:sources[path],bytes=Buffer.byteLength(text);
  outputBytes+=bytes;requireTrue(outputBytes<=STAGE_LIMITS.outputTotalBytes,'stage-capacity');return {path,text,bytes,sha256:sha(text)};
 });
 const identity={schema:'native-specificity-stage-recipe/v1',panelIdentity:a.expectedPanelIdentity,
  manifestHash:a.expectedManifestHash,batchId:batch.batchId,batchScopeHash:scope.scopeHash,sourceHashes,
  files:files.map(({path,bytes,sha256})=>({path,bytes,sha256}))};
 return freeze({...identity,files,sourceBytes,outputBytes,stageIdentity:digest(identity),
  actualStagePublished:false,layoutVerified:false,nativeReady:false,assignmentAuthority:false});
}
