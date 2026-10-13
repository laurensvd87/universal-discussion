import {types} from 'node:util';
import {performance} from 'node:perf_hooks';
import {fail} from './errors.js';

const DIMENSIONS=384,MiB=1024*1024;
const ID=/^[A-Za-z0-9._:-]{1,128}$/u;
const compare=(a,b)=>a<b?-1:a>b?1:0;
const invalid=()=>fail('invalid','Invalid Topic radius index input');
const capacity=()=>fail('capacity','Topic radius index capacity reached');
// With norms <=1+1e-6, 384 left-to-right operations have absolute squared
// error far below1e-11. Pad the squared cosine/distance identity too: merely
// padding its square root fails near zero after cancellation. Direct L2 metric
// evaluations/median boundaries additionally receive1e-10 triangle padding.
const SQUARED_PAD=1e-11,DISTANCE_PAD=1e-10;
function vector(value) {
  if(!value || types.isProxy(value) || !(Array.isArray(value) || value instanceof Float64Array) ||
      ![Array.prototype,Float64Array.prototype].includes(Object.getPrototypeOf(value)) || value.length!==DIMENSIONS ||
      Reflect.ownKeys(value).length!==(Array.isArray(value)?DIMENSIONS+1:DIMENSIONS))invalid();
  const copy=new Float64Array(DIMENSIONS);let norm2=0;
  for(let index=0;index<DIMENSIONS;index++) {
    const field=Object.getOwnPropertyDescriptor(value,String(index));
    if(!field || !field.enumerable || !Object.hasOwn(field,'value') || typeof field.value!=='number' || !Number.isFinite(field.value))invalid();
    copy[index]=field.value;norm2+=field.value*field.value;
  }
  const norm=Math.hypot(...copy);
  if(!Number.isFinite(norm) || Math.abs(norm-1)>1e-6)invalid();
  return {values:copy,norm2};
}
function entry(value) {
  if(!value || types.isProxy(value) || Object.getPrototypeOf(value)!==Object.prototype)invalid();
  const fields=Object.getOwnPropertyDescriptors(value);
  if(Reflect.ownKeys(fields).length!==2 || !['id','values'].every(key=>fields[key]?.enumerable && Object.hasOwn(fields[key],'value')) ||
      typeof fields.id.value!=='string' || !ID.test(fields.id.value))invalid();
  return Object.freeze({id:fields.id.value,...vector(fields.values.value)});
}
function distance(a,b) {
  let squared=0;
  for(let index=0;index<DIMENSIONS;index++){const difference=a[index]-b[index];squared+=difference*difference;}
  return Math.sqrt(squared);
}
function dot(a,b) {
  let sum=0;for(let index=0;index<DIMENSIONS;index++)sum+=a[index]*b[index];
  return Math.max(-1,Math.min(1,sum));
}
const entryBytes=value=>DIMENSIONS*8+value.id.length*2+400;
const NODE_BYTES=192,REFERENCE_BYTES=8,INVENTORY_BYTES=96;

// Trusted pure options; vectors must ALREADY be represented Ridge1 coordinates.
// This prototype owns no storage, Topic routing, transforms or public authority.
// maxEntries is only an additional admission ceiling:32MiB retains roughly8k
// entries, NOT a million-page in-RAM capacity/throughput promise. A tier merge
// can rebuild a large tree synchronously; production-scale background merging
// and durable/sharded storage are deliberately outside this prototype.
export function createTopicRadiusIndex({floor=.8639003810829322,maxBytes=32*MiB,
  maxPeakBytes=64*MiB,maxEntries=1_000_000}={}) {
  if(!Number.isFinite(floor) || floor<-1 || floor>1 || !Number.isSafeInteger(maxBytes) || maxBytes<0 || maxBytes>32*MiB ||
      !Number.isSafeInteger(maxPeakBytes) || maxPeakBytes<maxBytes || maxPeakBytes>128*MiB ||
      !Number.isSafeInteger(maxEntries) || maxEntries<0 || maxEntries>1_000_000)invalid();
  // Inventory updates are O(1), never a full Map copy per page. Queries expose
  // no callbacks/snapshot handles and are synchronous; their immutable roots
  // cannot change during traversal. Tree nodes/entries remain private forever.
  const inventory=new Map();let forest=[],stored=0,vectorBytes=0,lastDistances=0,peakBytes=0;
  const retained=()=>vectorBytes+stored*(NODE_BYTES+REFERENCE_BYTES)+inventory.size*INVENTORY_BYTES;
  function checkedBuild(values,extraRetained,liveCount,addedVectorBytes=0) {
    const nextBytes=extraRetained+values.length*(NODE_BYTES+REFERENCE_BYTES)+liveCount*INVENTORY_BYTES;
    if(nextBytes>maxBytes)capacity();
    // Reserve old roots + new nodes + all sorting partitions on the recursive
    // build path, with generous bookkeeping slack. Existing Float64 centers
    // are shared, not copied again in merges. No uncharged pair matrix exists.
    const peak=retained()+addedVectorBytes+values.length*(NODE_BYTES+REFERENCE_BYTES+256)+65536;
    if(peak>maxPeakBytes)capacity();
    const deadline=performance.now()+10000;let comparisons=0;
    function build(items) {
      if(performance.now()>=deadline)capacity();
      if(!items.length)return null;
      const pivot=items[0];
      if(items.length===1)return {pivot,left:null,right:null,threshold:0,maxNorm2:pivot.norm2};
      const ranks=items.slice(1).map(value=>({value,distance:distance(pivot.values,value.values)}));comparisons+=ranks.length;
      ranks.sort((a,b)=>a.distance-b.distance || compare(a.value.id,b.value.id));
      const middle=Math.ceil(ranks.length/2),threshold=ranks[middle-1].distance;
      const left=build(ranks.slice(0,middle).map(rank=>rank.value));
      const right=build(ranks.slice(middle).map(rank=>rank.value));
      return {pivot,left,right,threshold,maxNorm2:Math.max(pivot.norm2,left?.maxNorm2??0,right?.maxNorm2??0)};
    }
    const root=build(values);lastDistances=comparisons;peakBytes=Math.max(peakBytes,peak);
    return {entries:values,root};
  }
  function put(value,replacement) {
    const next=entry(value),previous=inventory.get(next.id);
    if(replacement?!previous:!!previous)invalid();
    const liveCount=inventory.size+(previous?0:1);
    if(liveCount>maxEntries)capacity();
    const nextStored=stored+1,nextVectorBytes=vectorBytes+entryBytes(next);
    // Compact stale versions before they can accumulate without a bound.
    // This is an exact O(nlogn) rebuild, not an all-pairs operation.
    const compact=nextStored-liveCount>Math.max(32,Math.floor(liveCount/4)) ||
      nextVectorBytes+nextStored*(NODE_BYTES+REFERENCE_BYTES)+liveCount*INVENTORY_BYTES>maxBytes;
    let nextForest,nextStoredFinal=nextStored,nextVectorBytesFinal=nextVectorBytes;
    if(compact) {
      const values=[];for(const old of inventory.values())if(old.id!==next.id)values.push(old);values.push(next);
      nextVectorBytesFinal=values.reduce((sum,item)=>sum+entryBytes(item),0);nextStoredFinal=values.length;
      nextForest=[checkedBuild(values,nextVectorBytesFinal,liveCount,entryBytes(next))];
    }else {
      if(nextVectorBytes+nextStored*(NODE_BYTES+REFERENCE_BYTES)+liveCount*INVENTORY_BYTES>maxBytes)capacity();
      nextForest=forest.slice();let values=[next];
      while(nextForest.length && nextForest.at(-1).entries.length===values.length)values=nextForest.pop().entries.concat(values);
      // Other forest roots also retain their nodes; include them in the charge.
      const otherNodes=nextStored-values.length;
      nextForest.push(checkedBuild(values,nextVectorBytes+otherNodes*(NODE_BYTES+REFERENCE_BYTES),liveCount,entryBytes(next)));
    }
    inventory.set(next.id,next);forest=nextForest;stored=nextStoredFinal;vectorBytes=nextVectorBytesFinal;
    return true;
  }
  return Object.freeze({
    insert:value=>put(value,false),update:value=>put(value,true),
    delete(id) {
      if(typeof id!=='string' || !ID.test(id))invalid();
      if(!inventory.has(id))return false;
      const liveCount=inventory.size-1;
      if(!liveCount){inventory.clear();forest=[];stored=vectorBytes=lastDistances=peakBytes=0;return true;}
      if(stored-liveCount>Math.max(32,Math.floor(liveCount/4))) {
        const values=[];for(const value of inventory.values())if(value.id!==id)values.push(value);
        const bytes=values.reduce((sum,value)=>sum+entryBytes(value),0);
        const block=checkedBuild(values,bytes,liveCount);
        inventory.delete(id);forest=[block];stored=values.length;vectorBytes=bytes;
      }else inventory.delete(id);
      return true;
    },
    query(value) {
      const deadline=performance.now()+10000;
      const query=vector(value),roots=forest,ids=[];
      const diagnostics={liveEntries:inventory.size,visitedNodes:0,distanceComparisons:0,candidatesCompared:0,prunedBranches:0,resultBytes:0};
      function visit(node) {
        if(!node)return;diagnostics.visitedNodes++;
        if((diagnostics.visitedNodes&1023)===0 && performance.now()>=deadline)capacity();
        const d=distance(query.values,node.pivot.values);diagnostics.distanceComparisons++;
        if(inventory.get(node.pivot.id)===node.pivot) {
          diagnostics.candidatesCompared++;
          if(dot(query.values,node.pivot.values)>=floor) {
            diagnostics.resultBytes+=node.pivot.id.length*2+16;
            if(diagnostics.resultBytes>maxBytes || retained()+diagnostics.resultBytes>maxPeakBytes)capacity();
            ids.push(node.pivot.id);
          }
        }
        // Clamping makes floor=-1 accept even raw dot<-1 under norm drift.
        // That trusted edge case must visit every branch, not use raw radius.
        const radius=floor===-1?Infinity:Math.sqrt(Math.max(0,query.norm2+node.maxNorm2-2*floor+SQUARED_PAD))+DISTANCE_PAD;
        if(node.left) {if(d-radius<=node.threshold+DISTANCE_PAD)visit(node.left);else diagnostics.prunedBranches++;}
        if(node.right) {if(d+radius>=node.threshold-DISTANCE_PAD)visit(node.right);else diagnostics.prunedBranches++;}
      }
      for(const block of roots)visit(block.root);
      ids.sort(compare);if(performance.now()>=deadline)capacity();
      // Only a successfully finished exhaustive query is complete. No TopK,
      // truncation or capacity error can masquerade as an empty match set.
      return {complete:true,ids,diagnostics};
    },
    diagnostics:()=>({liveEntries:inventory.size,storedEntries:stored,staleEntries:stored-inventory.size,trees:forest.length,
      retainedBytes:retained(),peakBytes,lastBuildDistanceComparisons:lastDistances}),
  });
}
