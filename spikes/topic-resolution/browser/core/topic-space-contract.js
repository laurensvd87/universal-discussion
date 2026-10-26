import { inspectPageUrl } from "./page-content-policy.js";

const unsafe = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
function fail() { throw new TypeError("Invalid topic space response"); }
function object(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value,key))) fail();
}
function text(value,max,empty=false) {
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim()) || unsafe.test(value)) fail();
  return value;
}
function id(value) { if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(text(value,128))) fail(); return value; }
function count(value) { if (!Number.isSafeInteger(value) || value < 0) fail(); return value; }
function specificity(value) { if (count(value) > 100) fail(); return value; }
function array(value,max) { if (!Array.isArray(value) || value.length > max) fail(); return value; }
function nullableId(value) { return value === null ? null : id(value); }
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function overrides(value) {
  const seen = new Set();
  for (const item of array(value,256)) {
    object(item,["spaceId","specificity","title"]); id(item.spaceId); specificity(item.specificity);
    if (item.title !== null) text(item.title,200);
    if (seen.has(item.spaceId)) fail(); seen.add(item.spaceId);
  }
}
export function parseTopicSpacePolicy(value) {
  object(value,["schema","revision","defaultSpecificity","topicOverrides"]);
  if (value.schema !== "topic-space-policy/v1") fail();
  count(value.revision); specificity(value.defaultSpecificity); overrides(value.topicOverrides);
  return freeze(copy(value));
}
export function parseTopicSpaceQueryRequest(value) {
  object(value,["sourceId","query","offset","limit"]); nullableId(value.sourceId); text(value.query,256,true);
  count(value.offset); if (value.limit !== 20) fail();
  return freeze(copy(value));
}
export function parseTopicSpacePolicyRequest(value) {
  object(value,["expectedRevision","defaultSpecificity","topicOverrides"]);
  count(value.expectedRevision); specificity(value.defaultSpecificity); overrides(value.topicOverrides);
  return freeze(copy(value));
}
export function parseTopicSpaceOwnerResponse(value) {
  object(value,["policy","canManage"]); parseTopicSpacePolicy(value.policy);
  if (typeof value.canManage !== "boolean") fail();
  return freeze(copy(value));
}
export function parseTopicSpacesResponse(value) {
  object(value,["schema","version","policy","state","total","groups"]);
  if (value.schema !== "topic-spaces/v1" || !["ready","building","capacity"].includes(value.state)) fail();
  object(value.version,["generation","revision"]); id(value.version.generation); count(value.version.revision);
  parseTopicSpacePolicy(value.policy); count(value.total);
  const seen = new Set(), roots = new Set();
  for (const group of array(value.groups,20)) {
    object(group,["id","parentId","policyTopicId","title","specificity","threadCount","humanCount","aiCount","score","threads"]);
    id(group.id); id(group.policyTopicId); nullableId(group.parentId); text(group.title,200); specificity(group.specificity);
    count(group.threadCount); count(group.humanCount); count(group.aiCount);
    if (seen.has(group.id) || group.parentId === group.id || typeof group.score !== "number" || !Number.isFinite(group.score)) fail();
    seen.add(group.id);
    for (const thread of array(group.threads,3)) {
      object(thread,["rootId","topicId","discussionId","sourceId","title","snippet","url","humanCount","aiCount","updatedAt"]);
      id(thread.rootId); id(thread.topicId); id(thread.discussionId); nullableId(thread.sourceId);
      text(thread.title,200); text(thread.snippet,600,true); count(thread.humanCount); count(thread.aiCount);
      if (thread.updatedAt !== null) {
        text(thread.updatedAt,24);
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(thread.updatedAt) ||
            !Number.isFinite(Date.parse(thread.updatedAt)) || new Date(thread.updatedAt).toISOString() !== thread.updatedAt) fail();
      }
      if (thread.url !== null) { const inspected = inspectPageUrl(thread.url); if (!inspected.supported || inspected.url !== thread.url) fail(); }
      if (roots.has(thread.rootId)) fail(); roots.add(thread.rootId);
    }
    if (group.threads.length > group.threadCount) fail();
  }
  if (value.groups.length > value.total) fail();
  return freeze(copy(value));
}
