// Protected numeric fixture builder for the joined registered-schema proof.
// Reads only its explicit invented Sources, never captures a page or runs E5.
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {describeRootedHierarchyMatcher} from '../../src/domain/hierarchy-rooted-matcher.js';
import {compilePairedE5Input,applyPairedE5Input} from '../../src/domain/hierarchical-e5-paired-input.js';
import {planAutomaticNamedSubjectsV2,GENERAL_SUBJECT_POLICY_V2_HASH} from '../../src/application/automatic-named-subject-plan.js';
import {createAutomaticNamedSubjectRepository} from '../canonical-v4/automatic-named-subject-repository.js';
const sha=v=>createHash('sha256').update(v).digest('hex');
export async function automaticTopicsFixtureInput({database,generation,matcher,sourceIds}){
 assert(Array.isArray(sourceIds)&&sourceIds.length<=4);const identity=describeRootedHierarchyMatcher(matcher),matcherHash=sha(JSON.stringify(identity)),fusion=compilePairedE5Input({bodyWeight:identity.inputDefinition.bodyWeight,titleWeight:identity.inputDefinition.titleWeight,encoderHash:identity.inputDefinition.encoderHash});
 const observations=[],sourceWitnesses=[];
 for(const id of sourceIds){const {rows}=await database.query(`SELECT s.id,s.title,s.url,s.write_version::text version,s.operation_id,r.operation_digest,st.stamp,i.body_values,i.title_values,i.supported_path
  FROM canonical_v4.sources s JOIN canonical_v4.operation_receipts r ON r.source_id=s.id JOIN canonical_v4.runtime_source_stamps st ON st.source_id=s.id
  JOIN canonical_v4.semantic_inputs i ON i.source_id=s.id AND i.operation_digest=r.operation_digest WHERE s.id=$1 AND i.matcher_hash=$2`,[id,matcherHash]);assert.equal(rows.length,1);const r=rows[0];
  const witness={sourceId:id,sourceVersion:r.version,operationId:r.operation_id,operationDigest:r.operation_digest,sourceStamp:r.stamp},inputHash=sha(JSON.stringify(Object.values(witness)));sourceWitnesses.push(witness);
  observations.push({sourceId:id,inputHash,materialHash:sha(JSON.stringify([r.title,r.body_values])),title:r.title,publisherKey:new URL(r.url).hostname,acceptedPath:r.supported_path,
   vector:applyPairedE5Input(fusion,{sourceId:id,sourceVersion:inputHash,bodyVector:r.body_values,titleVector:r.title_values}).vector});
 }
 const value={generation,policyHash:GENERAL_SUBJECT_POLICY_V2_HASH,representationHash:identity.representationHash,matcherHash,minimumSimilarity:.8,observations,sourceWitnesses,candidates:[]};
 const scopes=[...new Map(planAutomaticNamedSubjectsV2(JSON.stringify(value)).updates.map(u=>[u.focusKey+'|'+u.contextRootId,{focusKey:u.focusKey,contextRootId:u.contextRootId}])).values()];
 if(scopes.length)value.candidates=await createAutomaticNamedSubjectRepository({database}).candidates(JSON.stringify({generation,representationHash:value.representationHash,scopes}));return value;
}
