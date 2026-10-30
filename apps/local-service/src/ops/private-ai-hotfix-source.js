// Pure exact-source derivation for an API-only17 hotfix. No IO, role, model,
// schema, manifest publication or process authority. Original releases are held.
import {createHash} from 'node:crypto';
const bad=()=>{throw new Error('Private AI hotfix source refused');};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const before=Object.freeze({
 'apps/local-service/src/ai/chatgpt-runtime.js':'7e0093793a3cc1354d81f7ce8bdc33831338615a32c9531502401e1ca60b7c60',
 'apps/local-service/src/private/private-service.js':'c21cfe2dd9d817486be09c530d916a434a5973e70d0535eb2fa5663a8c04dd39',
 'spikes/topic-resolution/browser/core/private-generation-context.js':'6d45b9e5272d3f18ef7f152d7e88e2288214aba7406c66b5a3134bb18419489d',
});
export const PRIVATE_AI_HOTFIX_BASE=Object.freeze({snapshot:'hierarchy-release-20261029-nature-heads',rootSha256:'be9012599733de4a1abe94626f1d1e010e2ce0839a605ffeff54f5dfead3d83f',
 files:1204,totalBytes:163203647,patches:before});
function once(source,needle,replacement){if(!source.includes(needle)||source.indexOf(needle)!==source.lastIndexOf(needle))bad();return source.replace(needle,replacement);}
function transform(file,source){
 const eol=source.includes('\r\n')?'\r\n':'\n';
 if(file==='apps/local-service/src/ai/chatgpt-runtime.js'){
  const marker='    async generatePrivate(value, actorId, { signal } = {}) {';
  if(!source.includes(marker)||source.indexOf(marker)!==source.lastIndexOf(marker))bad();const at=source.indexOf(marker);
  const line='        ...(Object.hasOwn(value ?? {}, "excludedRelatedSourceIds") ? ["excludedRelatedSourceIds"] : []),';
  if(source.slice(at).includes('Object.hasOwn(value ?? {}, "includeRelatedSources")'))bad();
  return source.slice(0,at)+once(source.slice(at),line,'        ...(Object.hasOwn(value ?? {}, "includeRelatedSources") ? ["includeRelatedSources"] : []),'+eol+line);
 }
 if(file==='apps/local-service/src/private/private-service.js'){
  const line='          ...(Object.hasOwn(generation, "excludedRelatedSourceIds") ? ["excludedRelatedSourceIds"] : []),';
  source=once(source,line,'          ...(Object.hasOwn(generation, "includeRelatedSources") ? ["includeRelatedSources"] : []),'+eol+line);
  const end='          ...(Object.hasOwn(generation, "preferences") ? ["preferences"] : [])]);';
  return once(source,end,end+eol+'        if (Object.hasOwn(generation, "includeRelatedSources") && typeof generation.includeRelatedSources !== "boolean")'+eol+'          fail("invalid", "Invalid related-source selection");');
 }
 if(file==='spikes/topic-resolution/browser/core/private-generation-context.js'){
  source=once(source,'insight.busy || !state.catalog || !state.discussion || !state.related)','insight.busy || !state.catalog || !state.discussion)');
  const start='  const context = buildInsightContext({ ...state, includeDiscussion: false, excludedRelatedSourceIds,';
  source=once(source,start,['  const related = state.related ?? null;','  const choices = insight.context ?? buildInsightContext({ ...state, related,',
   '    includeDiscussion: false, sourceLimit: 21 });','  const context = buildInsightContext({ ...state, related, includeDiscussion: false, excludedRelatedSourceIds,'].join(eol));
  source=once(source,'allowedRelatedSourceIds: [...(insight.context?.sameTopicSources ?? []), ...(insight.context?.relatedSources ?? [])].map(source => source.id),',
   'allowedRelatedSourceIds: [...choices.sameTopicSources, ...choices.relatedSources].map(source => source.id),');
  const returned='  return { model, context, articleText: article.text, allowWebResearch: insight.relatedPageTextEnabled === true,';
  return once(source,returned,returned+eol+'    includeRelatedSources: related !== null,');
 }
 bad();
}
export function derivePrivateAiHotfixSource(file,bytes){
 if(arguments.length!==2||typeof file!=='string'||!Object.hasOwn(before,file)||!Buffer.isBuffer(bytes)||bytes.length>131072||sha(bytes)!==before[file])bad();
 const source=new TextDecoder('utf-8',{fatal:true}).decode(bytes),next=Buffer.from(transform(file,source));
 if(!Buffer.from(source).equals(bytes)||next.length>131072||next.equals(bytes))bad();
 return {path:file,baseSha256:before[file],bytes:next,sha256:sha(next)};
}
// Trusted synthetic SOURCE seam only; bypasses no file or runtime authority.
export function transformPrivateAiHotfixForTest(file,source){if(arguments.length!==2||typeof source!=='string'||source.length>131072)bad();return transform(file,source);}
