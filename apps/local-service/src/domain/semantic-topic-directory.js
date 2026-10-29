// Owner cuts of already validated public topology/observations, never inference.
import {compileSemanticTopicGrouping,groupSupportedSemanticPath} from './semantic-topic-grouping.js';

const LABELS=Object.freeze({business:'Business',cooking:'Cooking',culture:'Culture',education:'Education',games:'Games',
 geography:'Geography',health:'Health',history:'History','ideas-beliefs':'Ideas and beliefs',languages:'Languages',nature:'Nature',
 science:'Science',society:'Society',sports:'Sports',technology:'Technology',vehicles:'Vehicles',
 'video-games':'Video games',gta:'Grand Theft Auto (GTA)',animals:'Animals',koalas:'Koalas'});
function grouping(topology,policy){
 const ids=new Set(topology.nodes.map(node=>node.id));
 // Rules for a retired model's nodes remain owner state. They cannot create a
 // supported path in the active model, and must not break its remaining groups.
 return compileSemanticTopicGrouping({nodes:topology.nodes.map(({id,parentId})=>({id,parentId})),
  policy:{...policy,overrides:policy.overrides.filter(rule=>ids.has(rule.nodeId))}});
}
function card(path){const id=path.at(-1);
 // Installed labels are explicit. Future owner-registered names remain literal
 // identifiers until a label is installed; never guess a different topic name.
 return Object.freeze({id,title:Object.hasOwn(LABELS,id)?LABELS[id]:id,path:Object.freeze([...path])});}
export function projectSemanticTopicDirectory(topology,policy){
 if(topology.matcherIdentityHash===null)return Object.freeze({policyRevision:policy.revision,topics:Object.freeze([])});
 const handle=grouping(topology,policy),topics=new Map();
 for(const node of topology.nodes){const {selectedPath}=groupSupportedSemanticPath(handle,node.path);if(selectedPath.length)topics.set(selectedPath.at(-1),card(selectedPath));}
 return Object.freeze({policyRevision:policy.revision,topics:Object.freeze([...topics.values()].sort((a,b)=>Buffer.compare(Buffer.from(a.id),Buffer.from(b.id))))});
}
export function projectSemanticSourceContext(topology,policy,context){
 if(context.generation!==topology.generation||context.matcherIdentityHash!==topology.matcherIdentityHash)throw new TypeError('Semantic context changed');
 let selectedPath=[];
 if(topology.matcherIdentityHash!==null)selectedPath=groupSupportedSemanticPath(grouping(topology,policy),context.supportedPath).selectedPath;
 else if(context.supportedPath.length||context.status!=='pending')throw new TypeError('Invalid unprepared semantic context');
 return Object.freeze({policyRevision:policy.revision,sourceId:context.sourceId,sourceVersion:context.sourceVersion,status:context.status,
  supportedPath:Object.freeze([...context.supportedPath]),selectedPath:Object.freeze([...selectedPath]),topic:selectedPath.length?card(selectedPath):null});
}
