// ADR213 SOURCE prototype only. No collector, event or native authority.
export const RETAINED_BYTES=256;

function navigationSite(p){switch((p-1)%6){case 0:return 'fresh';case 1:return 'within';case 2:return 'public';case 3:return 'read';case 4:return 'seal';case 5:return 'retire';}}
function navigationState(p){switch(Math.floor((p-1)/6)%5){case 0:return 'active';case 1:return 'sealed';case 2:return 'retiring';case 3:return 'released';case 4:return 'unavailable';}}
function navigationBalance(p){switch(Math.floor((p-1)/30)%3){case 0:return 'matched';case 1:return 'unmatched';case 2:return 'unavailable';}}
function navigationUrl(p){switch(Math.floor((p-1)/90)){case 0:return 'not-examined';case 1:return 'exact';case 2:return 'different';case 3:return 'blank';case 4:return 'unavailable';}}
function terminalSite(p){return p<1003?'cdp-frame':p===1003?'cdp-within':'playwright';}
function terminalPredicate(p){return p===1001?'parent-absent':p===1002?'parent-mismatch':p===1004?'main-detached':'main';}
function terminalRelation(p){return p===1001?'nonmain':p===1002?'child':p===1004?'unexamined':'main';}
function terminalDetached(p){return p<1004?null:p===1004;}
function makeView(p){
 if(p>=1000)return Object.freeze({schema:'native-terminal-navigation-observation/v1',site:terminalSite(p),predicate:terminalPredicate(p),frameRelation:terminalRelation(p),mainDetached:terminalDetached(p)});
 return Object.freeze({schema:'native-main-navigation-observation/v1',site:navigationSite(p),state:navigationState(p),balance:navigationBalance(p),urlRelation:navigationUrl(p)});
}

/** One callable: command followed by the command's positional arguments.
 * Selection must be called synchronously by the external first-global latch.
 * Matching symbols establish identity only, never native provenance.
 */
export function createCaptureContextObservation(){
 // Five retained cells. phase: empty0, claimed1, selected2, released3.
 let phase=0,first,bound,packed=0,view=null;
 return function observation(command,original,binding,a,b,c,d){
  if(command==='retainedBytes')return arguments.length===1?RETAINED_BYTES:null;
  if(command==='release'){if(arguments.length!==1)return null;phase=3;first=undefined;bound=undefined;packed=0;view=null;return null;}
  if(phase>=2)return null;
  if(command==='selectCleanup'){phase=2;first=undefined;bound=undefined;packed=0;view=null;return null;}
  if(command==='selectPrimary'){
   phase=2;
   // Unclaimed state cannot match: a real claim always has a Symbol binding.
   if(arguments.length!==3||typeof bound!=='symbol'||typeof binding!=='symbol'||binding!==bound||!Object.is(original,first)||packed===0){first=undefined;bound=undefined;packed=0;view=null;return null;}
   first=undefined;bound=undefined;
   // Only this later selection frame allocates a view. Its incoming original
   // and Symbol are already-owned identity references, not claim context.
   // A nested selection is inert; release revokes the outer result as well.
   try{original=makeView(packed);if(phase===2)view=original;original=undefined;}catch{view=null;}
   packed=0;
   return view;
  }
  if(command!=='navigation'&&command!=='terminal')return null;
  if(phase!==0)return null;
  phase=1;first=original;
  if(arguments.length!==7||typeof binding!=='symbol')return null;
  bound=binding;
  if(command==='navigation'){
   a=a==='fresh'?0:a==='within'?1:a==='public'?2:a==='read'?3:a==='seal'?4:a==='retire'?5:-1;
   b=b==='active'?0:b==='sealed'?1:b==='retiring'?2:b==='released'?3:b==='unavailable'?4:-1;
   c=c==='matched'?0:c==='unmatched'?1:c==='unavailable'?2:-1;
   d=d==='not-examined'?0:d==='exact'?1:d==='different'?2:d==='blank'?3:d==='unavailable'?4:-1;
   if(a<0||b<0||c<0||d<0||((a===1||a===2)?d===0:d!==0)||(b===4)!==(c===2)||b===3&&c!==1)return null;
   packed=1+a+6*b+30*c+90*d;
  }else{
   if(a==='cdp-frame'&&b==='main'&&c==='main'&&d===null)packed=1000;
   else if(a==='cdp-frame'&&b==='parent-absent'&&c==='nonmain'&&d===null)packed=1001;
   else if(a==='cdp-frame'&&b==='parent-mismatch'&&c==='child'&&d===null)packed=1002;
   else if(a==='cdp-within'&&b==='main'&&c==='main'&&d===null)packed=1003;
   else if(a==='playwright'&&b==='main-detached'&&c==='unexamined'&&d===true)packed=1004;
   else if(a==='playwright'&&b==='main'&&c==='main'&&d===false)packed=1005;
   else return null;
  }
  // No view construction in the claim invocation. Returning removes its
  // context-frame overlap without assuming named-parameter writes clear the
  // strict-mode unmapped arguments indices or prove garbage collection.
  return null;
 };
}
