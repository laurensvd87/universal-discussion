// Pure TRAIN reference construction; no training, calibration, capture or IO.
import {record,dense,dataCopy,freeze,digest,sha,hash,requireTrue,validateSpecificityBatch} from './manifest.js';
import {validateSpecificityProducerProfile,ROOT_IDS} from './producer-profile.js';
import {compileNativeRootRankCandidate,describeNativeRootRankCandidate,prepareNativeRootInput} from '../../../../../apps/local-service/experiments/topic-encoder/native-root-rank-candidate-v1/scorer.js';
import {compilePairedE5Input,describePairedE5Input,applyPairedE5Input} from '../../../../../apps/local-service/src/domain/hierarchical-e5-paired-input.js';
import {compileHierarchyLocalEvidence,describeHierarchyLocalEvidence} from '../../../../../apps/local-service/src/domain/hierarchical-e5-local-evidence.js';

export const REFERENCE_BUILDER_LIMITS=Object.freeze({trainingRows:48,pairs:48,dimensions:384,metadataBytes:16384,copyValues:200000,stringUnits:1048576,depth:24,outputBytes:1048576});
export const LOCAL_NODES=freeze({games:null,'video-games':'games',gta:'video-games',minecraft:'video-games',nature:null,animals:'nature',koalas:'animals',dolphins:'animals',cooking:null,recipes:'cooking',kapsalon:'recipes',pasta:'recipes'});
const META=['sourceId','sourceVersion','producerId','producerProfileHash','inputConstructionHash','extractorVersion','fieldBindings','nativeWitness','rightsEvidenceHash'];
const NATIVE=[...META,'sourceInputHash','bodyVector','titleVector'];
const REASONS=['origin-policy-unavailable','origin-policy-refused','article-unavailable','document-policy-unavailable','document-policy-refused','reader-unavailable','foreground-changed','restricted-rendering'];
function unit(v){const out=dense(v,384);requireTrue(out.length===384);let norm=0;for(const n of out){requireTrue(typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=1);norm+=n*n;}requireTrue(Math.abs(norm-1)<=1e-5);return out;}
function bits(v,domain){const b=Buffer.alloc(3072);v.forEach((n,i)=>b.writeDoubleLE(n,i*8));return sha(Buffer.concat([Buffer.from(domain),b]));}
const rawHash=v=>bits(v,'builder-root-input-vector/binary64-le/384/v1\0');
const fusedHash=v=>bits(v,'native-specificity-train-reference/binary64-le/384/v1\0');
function annotation(c){
 const ref=record(c.referenceAnnotation,['nodeId','kind']);requireTrue(typeof ref.nodeId==='string'&&Object.hasOwn(LOCAL_NODES,ref.nodeId));
 requireTrue(c.labelStatus==='verified'&&digest(c.assessmentGold)===digest(c.proposedGold));const g=record(c.assessmentGold,['kind','path']),path=dense(g.path,8);
 requireTrue((g.kind==='complete'||g.kind==='prefix')&&path.length>0&&path.every(x=>typeof x==='string'&&(ROOT_IDS.includes(x)||Object.hasOwn(LOCAL_NODES,x)))&&ROOT_IDS.includes(path[0]));
 for(let i=1;i<path.length;i++)requireTrue(Object.hasOwn(LOCAL_NODES,path[i])&&LOCAL_NODES[path[i]]===path[i-1]);
 if(ref.kind==='member')requireTrue(c.role==='leaf'&&['gta','minecraft','koalas','dolphins','kapsalon','pasta'].includes(ref.nodeId)&&g.kind==='complete'&&path.at(-1)===ref.nodeId&&c.nodeId===ref.nodeId);
 else if(ref.kind==='stop')requireTrue(c.role==='parent-stop'&&['games','video-games','nature','animals','cooking','recipes'].includes(ref.nodeId)&&g.kind==='complete'&&path.at(-1)===ref.nodeId&&c.nodeId===ref.nodeId);
 else requireTrue(ref.kind==='outside'&&c.role==='scoped-confounder'&&['games','nature','cooking'].includes(ref.nodeId)&&path[0]!==ref.nodeId&&(c.nodeId===path.at(-1)||c.nodeId===ref.nodeId));
 return {nodeId:ref.nodeId,kind:ref.kind};
}
export function buildSpecificityTrainReferences(input){
 const raw=record(input,['manifest','expectedPanelIdentity','expectedManifestHash','profileSet','expectedRecipeHash','rootCandidate','trainingRows']);
 // One aggregate descriptor-safe budget precedes compile/fusion. No JSON
 // round-trip is used to copy vectors: binary64 signed zeros remain unchanged.
 const a=dataCopy(raw,{values:200000,units:1048576,depth:24,array:1024,properties:128,string:16384});
 const m=a.manifest;validateSpecificityBatch({manifest:m,batch:m.batches[0],expectedPanelIdentity:a.expectedPanelIdentity,expectedManifestHash:a.expectedManifestHash});
 const p=validateSpecificityProducerProfile({profileSet:a.profileSet,expectedRecipeHash:a.expectedRecipeHash,expectedPanelIdentity:a.expectedPanelIdentity,expectedManifestHash:a.expectedManifestHash});
 const cases=dense(m.cases,168).filter(c=>c.split==='training');requireTrue(cases.length===48);
 const counts={member:0,stop:0,outside:0},trainingCases=cases.map(c=>{const ref=annotation(c);counts[ref.kind]++;return {id:c.id,groupId:c.groupId,referenceAnnotation:ref};});
 requireTrue(counts.member===24&&counts.stop===12&&counts.outside===12);
 const rows=dense(a.trainingRows,48);requireTrue(rows.length===48);
 const preflight=rows.map((value,i)=>{
  const c=cases[i];requireTrue(typeof value.status==='string');
  if(value.status==='unavailable'){
   const r=record(value,['id','groupId','status','reason','inputIdentity']);requireTrue(r.id===c.id&&r.groupId===c.groupId&&REASONS.includes(r.reason));hash(r.inputIdentity);
   return r;
  }
  const r=record(value,['id','groupId','status','nativeInput','vectorBindings']);requireTrue(r.status==='available'&&r.id===c.id&&r.groupId===c.groupId);
  const n=record(r.nativeInput,NATIVE),bindings=record(r.vectorBindings,['bodyVectorHash','titleVectorHash']);Object.values(bindings).forEach(hash);
  const metadata=Object.fromEntries(META.map(k=>[k,n[k]]));requireTrue(Buffer.byteLength(JSON.stringify(metadata))<=16384,'capacity');
  const bodyVector=unit(n.bodyVector),titleVector=unit(n.titleVector);
  requireTrue(rawHash(bodyVector)===bindings.bodyVectorHash&&rawHash(titleVector)===bindings.titleVectorHash,'vector-binding');
  const b=m.batches.find(b=>b.cases.some(x=>x.id===c.id));requireTrue(b!==undefined&&b.phase==='train-cal');const bc=b.cases.find(x=>x.id===c.id),doc=n.nativeWitness;
  requireTrue(n.sourceId===c.id&&doc.caseId===c.id&&doc.ordinal===bc.nativeOrdinal&&doc.sourceUrl===c.publicUrl&&doc.documentUrl===c.publicUrl,'native-case');
  requireTrue(n.producerId===p.producerProfile.producerId&&n.producerProfileHash===p.producerProfile.producerProfileHash&&n.inputConstructionHash===p.recipeHash,'profile');
  return {...r,nativeInput:{...n,bodyVector,titleVector},batchId:b.batchId,nativeOrdinal:bc.nativeOrdinal,metadata};
 });
 requireTrue(a.rootCandidate.inputDefinition.bodyWeight===.75&&a.rootCandidate.inputDefinition.titleWeight===.25&&a.rootCandidate.inputDefinition.encoderHash===p.construction.encoder.encoderHash,'encoder');
 const root=compileNativeRootRankCandidate(a.rootCandidate),rootIdentity=describeNativeRootRankCandidate(root);
 requireTrue(digest(rootIdentity.nodeIds)===digest([...ROOT_IDS].sort())&&rootIdentity.targetProfiles.length===1&&digest(rootIdentity.targetProfiles[0])===digest(p.producerProfile),'profile');
 const inputDefinition={bodyWeight:.75,titleWeight:.25,encoderHash:p.construction.encoder.encoderHash},paired=compilePairedE5Input(inputDefinition),description=describePairedE5Input(paired);
 const examples=[],availability=[],studyBatches=new Map(),revisionBatches=new Map(),batchStudies=new Map(),nonces=new Set();
 for(let i=0;i<preflight.length;i++){
  const r=preflight[i],c=cases[i],ref=trainingCases[i].referenceAnnotation;
  if(r.status==='unavailable'){availability.push({id:c.id,groupId:c.groupId,status:'unavailable',reason:r.reason,inputIdentity:r.inputIdentity,referenceAnnotation:{...ref},referenceIncluded:false});continue;}
  const n=r.nativeInput,prepared=prepareNativeRootInput(root,r.metadata);requireTrue(prepared.sourceInputHash===n.sourceInputHash,'native-input');
  const doc=prepared.nativeWitness;requireTrue(!nonces.has(doc.observationNonce),'native-case');nonces.add(doc.observationNonce);
  requireTrue(!studyBatches.has(doc.studyId)||studyBatches.get(doc.studyId)===r.batchId,'native-case');studyBatches.set(doc.studyId,r.batchId);
  requireTrue(!revisionBatches.has(doc.studyRevision)||revisionBatches.get(doc.studyRevision)===r.batchId,'native-case');revisionBatches.set(doc.studyRevision,r.batchId);
  const prior=batchStudies.get(r.batchId),identity=[doc.studyId,doc.studyRevision];requireTrue(prior===undefined||digest(prior)===digest(identity),'native-case');batchStudies.set(r.batchId,identity);
  const fused=applyPairedE5Input(paired,{sourceId:prepared.sourceId,sourceVersion:prepared.sourceVersion,bodyVector:n.bodyVector,titleVector:n.titleVector}),included=fused.status==='available';
  if(included)examples.push({id:c.id,groupId:c.groupId,nodeId:ref.nodeId,kind:ref.kind,vector:[...fused.vector]});
  availability.push({id:c.id,groupId:c.groupId,status:'available',referenceAnnotation:{...ref},referenceIncluded:included,derivationStatus:included?'nonzero-reference':'zero-fusion',
   nativeInputHash:prepared.sourceInputHash,fieldBindings:prepared.fieldBindings,nativeWitnessHash:digest(prepared.nativeWitness),rightsEvidenceHash:prepared.rightsEvidenceHash,
   producerProfileHash:prepared.producerProfileHash,nativeInputConstructionHash:prepared.inputConstructionHash,batchId:r.batchId,nativeOrdinal:r.nativeOrdinal,
   bodyVectorHash:r.vectorBindings.bodyVectorHash,titleVectorHash:r.vectorBindings.titleVectorHash,referenceVectorBitHash:included?fusedHash(fused.vector):null});
 }
 const construction={schema:'native-specificity-offline-reference-construction/v1',panelIdentity:a.expectedPanelIdentity,manifestHash:a.expectedManifestHash,
  producerProfileHash:p.producerProfile.producerProfileHash,nativeInputConstructionHash:p.recipeHash,
  builderSourceHash:p.construction.sourceHashes['spikes/topic-resolution/harness/experimental/native-specificity-study-v20/reference-builder.js'],
  pairedLibrarySourceHash:p.construction.sourceHashes['apps/local-service/src/domain/hierarchical-e5-paired-input.js'],inputDefinition,
  representationHash:description.representationHash,trainingCasesHash:digest(trainingCases),orderedAssociations:availability,
  nativeSourceBuilderClaim:false,calibrationSelected:false,productionValidated:false,assignmentAuthority:false};
 const constructionHash=digest(construction);requireTrue(constructionHash!==p.recipeHash&&constructionHash!==a.rootCandidate.trainingInputConstructionHash);
 let detailTemplate=null,templateArtifactHash=null;
 if(examples.length){
  const nodes=Object.entries(LOCAL_NODES).map(([id,parentId])=>({id,parentId}));
  const artifact={schema:'hierarchical-e5-local-evidence/v1',representation:description.representation,representationHash:description.representationHash,inputConstructionHash:constructionHash,
   taxonomyVersion:'adr179-local-forest/v1',evidenceVersion:'adr179-train-'+constructionHash,calibrationVersion:'adr179-unfitted-'+constructionHash,calibrationStatus:'experimental',nodes,examples,
   nodePolicies:nodes.map(n=>({nodeId:n.id,enabled:false,minSupport:2,minSimilarity:1,minNegativeMargin:2,minRivalMargin:2}))};
  templateArtifactHash=describeHierarchyLocalEvidence(compileHierarchyLocalEvidence(artifact)).artifactHash;
  detailTemplate={artifact,inputDefinition,supportedRootIds:['games','nature','cooking']};
 }
 const out={schema:'native-specificity-train-reference-build/v1',status:examples.length?'references-ready':'no-reference-set',detailTemplate,templateArtifactHash,construction,constructionHash,
  trainingCases,trainingCaseIds:trainingCases.map(c=>c.id),trainingGroupIds:examples.map(e=>e.groupId),availability,
  referenceCount:examples.length,calibrationAllowed:examples.length>0,productionValidated:false,assignmentAuthority:false};
 requireTrue(examples.length<=48&&Buffer.byteLength(JSON.stringify(out))<=1048576,'capacity');return freeze(out);
}
