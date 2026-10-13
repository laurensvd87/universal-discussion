import {clone} from './validation.js';
import {assertValidPersistedState,assertValidFixedTopicReference} from './persisted-state.js';
import {FIXED_REFERENCE_STATE_SCHEMA} from './demo-state.js';
import {LEARNED_SOURCE_PROVENANCE} from './learned-sources.js';
import {RIDGE_PARAMETER_SHA256} from './ridge-topic-adapter.js';
import {types} from 'node:util';

// Explicit trusted conversion only. No fetch, transform selection, rematching,
// IDs, Topic moves or message edits. The caller supplies the pinned qualified
// Ridge representation (or null), outside every SQLite write transaction.
export function migrateReferenceTopicState(state,{represent}={}) {
  assertValidPersistedState(state,{largeScale:true});
  if(!['demo-state/v2','demo-state/v3'].includes(state.schema) || typeof represent!=='function')throw new TypeError('Invalid reference migration');
  const next=clone(state),links=new Map(next.sourceLinks.map(link=>[link.sourceId,link]));
  next.schema=FIXED_REFERENCE_STATE_SCHEMA;next.revision++;
  for(const source of next.sources)if(source.provenance===LEARNED_SOURCE_PROVENANCE)source.topicIds=[links.get(source.id).topicId];
  for(const topic of next.topics) {
    const candidates=next.sources.filter(source=>source.provenance===LEARNED_SOURCE_PROVENANCE &&
      links.get(source.id)?.topicId===topic.id && links.get(source.id)?.method==='learned-provisional')
      .sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    if(!candidates.length)continue;
    topic.reference=null;
    for(const source of candidates) {
      const represented=represent(clone(source));
      if(represented===null)continue;
      if(!represented || types.isProxy(represented) || !(Array.isArray(represented) || represented instanceof Float64Array) ||
          ![Array.prototype,Float64Array.prototype].includes(Object.getPrototypeOf(represented)) || represented.length!==384 ||
          Reflect.ownKeys(represented).length!==(Array.isArray(represented)?385:384))throw new TypeError('Invalid represented reference');
      const values=[];
      for(let axis=0;axis<384;axis++) {
        const field=Object.getOwnPropertyDescriptor(represented,String(axis));
        if(!field?.enumerable || !Object.hasOwn(field,'value'))throw new TypeError('Invalid represented reference');
        values.push(field.value);
      }
      const reference={sourceId:source.id,values,parameterSha256:RIDGE_PARAMETER_SHA256};
      assertValidFixedTopicReference(reference);topic.reference=reference;break;
    }
  }
  assertValidPersistedState(next,{largeScale:true});return next;
}
