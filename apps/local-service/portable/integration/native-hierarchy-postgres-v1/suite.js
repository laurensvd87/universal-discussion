// Inert fixed assertion ledger, not node:test registration success inference.
export const CASES=Object.freeze([
 {
  "name": "pure wire and factory capability preconditions do not open any DB",
  "depth": 0
 },
 {
  "name": "actual canonical native queue, historical topology and ancestor feeds (separately gated)",
  "depth": 0
 },
 {
  "name": "full143/depth8 publication and canonical admission preserve both signed-zero wires",
  "depth": 1
 },
 {
  "name": "SQL publication rejects missing parents, cycles, duplicates and genuine depth9 atomically",
  "depth": 1
 },
 {
  "name": "real root/snapshot/ancestor edges commit atomically; owner prefix is display only",
  "depth": 1
 },
 {
  "name": "all15 outside-detail roots use actual protected preparation and canonical writes",
  "depth": 1
 },
 {
  "name": "fresh observation with unchanged material appends evidence without material-version inflation",
  "depth": 1
 },
 {
  "name": "page A→B/replay preserves original Source/Topic/Discussion/root and real reply hydration",
  "depth": 1
 },
 {
  "name": "owner-wide CAS affects both authors, not semantic membership or existing root prefix",
  "depth": 1
 },
 {
  "name": "unresolved actual native observation creates canonical root with NO semantic edges",
  "depth": 1
 },
 {
  "name": "inherited versus explicit owner subtree cut changes posting projection without rescoring/edge rewrites",
  "depth": 1
 },
 {
  "name": "ancestor keyset pages deduplicate, exclude siblings and fence only related feed changes",
  "depth": 1
 },
 {
  "name": "pre-enqueue failure retains bounded original issued command; explicit same request resumes only handoff",
  "depth": 1
 },
 {
  "name": "committed attestation without issuance quarantines retries before allocation or preparation",
  "depth": 1
 },
 {
  "name": "lease/token/prior mismatches and one-use attestation cannot create duplicate canonical Sources",
  "depth": 1
 },
 {
  "name": "private attestation revocation and expired prequeue commands fail closed and scrub without renewal",
  "depth": 1
 },
 {
  "name": "completion rejoins publication head and Source incarnation before any canonical mutation",
  "depth": 1
 },
 {
  "name": "actual mutation before original authority expiry still rolls back at late literal COMMIT",
  "depth": 1
 },
 {
  "name": "actual canonical mutation rollback and destructive wrappers restore all history/edges atomically",
  "depth": 1
 },
 {
  "name": "two accepted revisions SAME publication family preserve old ancestry; family revoke hides edges only",
  "depth": 1
 },
 {
  "name": "unissued/forged refs/direct old publication or node enqueue refuse without canonical mutation",
  "depth": 1
 },
 {
  "name": "Source erasure scrubs vectors/evidence and retires operations but keeps original discussion",
  "depth": 1
 },
 {
  "name": "actual local-detail conflict and STOP persist root-only canonical membership (separately gated)",
  "depth": 0
 },
 {
  "name": "conflict",
  "depth": 1
 },
 {
  "name": "stop",
  "depth": 1
 }
].map(Object.freeze));
const fail=code=>Object.assign(new Error('Native assertion ledger refused'),{code});
export function createAssertionLedger({guard,now=()=>performance.now(),schedule=setTimeout,cancel=clearTimeout}={}){
 if(typeof guard!=='function'||typeof now!=='function'||typeof schedule!=='function'||typeof cancel!=='function')throw fail('ASSERTION_DEPENDENCIES');
 const rows=[],pending=new Set();let cursor=0,outerBusy=false,hasFault=false,firstFault,last=null,closed=false;
 function fault(error){if(!hasFault){hasFault=true;firstFault=error;}return error;}
 function clock(){const t=now();if(!Number.isFinite(t)||t<0||last!==null&&t<last)throw fail('ASSERTION_CLOCK');last=t;return t;}
 function check(deadline){if(closed)throw fail('ASSERTION_CLOSED');guard();if(hasFault)throw firstFault;if(clock()>=deadline)throw fail('ASSERTION_DEADLINE');}
 function track(p){pending.add(p);p.then(()=>pending.delete(p),()=>pending.delete(p));return p;}
 async function dispatch(args,depth,parent){
  try{
   if(args.length!==2&&args.length!==3)throw fail('ASSERTION_CONTRACT');
   return await invoke(args[0],args.length===2?{}:args[1],args.length===2?args[1]:args[2],depth,parent);
  }catch(error){throw fault(error);}
 }
 async function invoke(name,options,callback,depth,parent){
  if(typeof options==='function'){callback=options;options={};}
  if(typeof name!=='string'||typeof callback!=='function'||!options||Object.getPrototypeOf(options)!==Object.prototype||
    Object.keys(options).some(k=>!['skip','timeout'].includes(k))||options.skip===true||
    Object.hasOwn(options,'skip')&&options.skip!==false||
    Object.hasOwn(options,'timeout')&&options.timeout!==180000)throw fault(fail('ASSERTION_CONTRACT'));
  if(depth===0&&outerBusy||depth===1&&(!parent?.live||parent.childBusy))throw fault(fail('ASSERTION_OVERLAP'));
  const deadline=depth===1?parent.deadline:Object.hasOwn(options,'timeout')?clock()+options.timeout:Infinity;
  check(deadline);
  const expected=CASES[cursor];if(!expected||name!==expected.name||depth!==expected.depth)throw fault(fail('ASSERTION_INVENTORY'));
  const row={name,depth,status:'running'},lease={live:true,childBusy:false,deadline};rows.push(row);cursor++;
  if(depth===0)outerBusy=true;else parent.childBusy=true;
  let timer,callbackPromise,timedOut=false;
  try{
   callbackPromise=track(Promise.resolve().then(()=>callback(Object.freeze({test:(...args)=>dispatch(args,1,lease)}))));
   const awaited=depth===0&&deadline!==Infinity?Promise.race([callbackPromise,new Promise((_,reject)=>{
    timer=schedule(()=>{timedOut=true;lease.live=false;reject(fault(fail('ASSERTION_DEADLINE')));},Math.max(1,deadline-clock()));
   })]):callbackPromise;
   await awaited;lease.live=false;
   if(lease.childBusy)throw fail('ASSERTION_UNAWAITED_CHILD');check(deadline);row.status='passed';
  }catch(error){row.status='failed';throw fault(error);}
  finally{
   lease.live=false;if(timer!==undefined)try{cancel(timer);}catch(error){row.status='failed';fault(error);}
   if(depth===0)outerBusy=false;else parent.childBusy=false;
   if(timedOut)row.pendingPhysical=!!callbackPromise&&pending.has(callbackPromise);
  }
  if(hasFault)throw firstFault;
 }
 return Object.freeze({
  test:(...args)=>dispatch(args,0,null),
  finish(){check(Infinity);if(cursor!==CASES.length||pending.size||outerBusy||rows.some(x=>x.status!=='passed'))throw fault(fail('ASSERTION_INCOMPLETE'));closed=true;return Object.freeze(rows.map(x=>Object.freeze({...x})));},
  snapshot:()=>Object.freeze({cursor,pending:pending.size,failed:hasFault,closed,rows:Object.freeze(rows.map(x=>Object.freeze({...x})))}),
 });
}
