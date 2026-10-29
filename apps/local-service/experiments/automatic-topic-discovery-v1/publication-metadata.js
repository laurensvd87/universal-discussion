// Publisher-supplied publication claims, not event-time or native attestation.
// Unregistered experiment; browser portable. No clocks, IO, inference or provider.
const SCHEMA='article-publication-metadata/v1',MAX_JSON=8192,MAX_CLAIMS=16;
const KINDS=new Set(['meta-article-published-time','meta-datepublished','meta-citation-publication-date','jsonld-datepublished','time-datepublished']);
const FLOOR=-62135596800000,CEILING=253402300800000;
const freeze=value=>{if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;};
function result(status,reason,count=0,claimKinds=[],extra={}){return freeze({schema:SCHEMA,status,reason,count,claimKinds,
 kind:null,value:null,epochMs:null,resolutionMs:null,...extra});}
function parsedDate(raw){
 const v=raw.trim(),m=/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2}))?$/u.exec(v);
 if(!m)return {error:'unsupported-date'};
 const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]),leap=year%4===0&&(year%100!==0||year%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(year<1||month<1||month>12||day<1||day>days[month-1])return {error:'invalid-date'};
 if(m[4]===undefined)return {kind:'calendar-date',value:v};
 const hour=Number(m[4]),minute=Number(m[5]),second=Number(m[6]),zone=m[8];
 if(hour>23||minute>59||second>59)return {error:'invalid-date'};
 if(zone!=='Z'){const zh=Number(zone.slice(1,3)),zm=Number(zone.slice(4,6));if(zh>14||zm>59||zh===14&&zm!==0)return {error:'invalid-date'};}
 const epochMs=Date.parse(v),resolutionMs=m[7]===undefined?1000:10**(3-m[7].length);
 if(!Number.isSafeInteger(epochMs)||epochMs<FLOOR||epochMs+resolutionMs>CEILING)return {error:'invalid-date'};
 return {kind:'timestamp',value:new Date(epochMs).toISOString(),epochMs,resolutionMs};
}

/** Accept JSON text so all inspected values are newly parsed data properties.
 * Untrusted objects/proxies/accessors are never traversed or coerced. Unknown,
 * invalid or conflicting metadata does not make the enclosing page unusable.
 */
export function normalizeArticlePublicationClaims(rawJson){
 if(arguments.length!==1||typeof rawJson!=='string')throw new TypeError('Publication claims require JSON text');
 if(rawJson.length>MAX_JSON)return result('capacity','claim-bytes');
 let claims;try{claims=JSON.parse(rawJson);}catch{return result('invalid','malformed-json');}
 if(!Array.isArray(claims))return result('invalid','claim-shape');
 if(claims.length>MAX_CLAIMS)return result('capacity','claim-count',MAX_CLAIMS+1);
 if(!claims.length)return result('unknown','missing');
 const values=[],kinds=new Set();
 for(const c of claims){
  if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).sort().join(',')!=='kind,value'||!KINDS.has(c.kind)||typeof c.value!=='string'||c.value.length>80)return result('invalid','claim-shape',claims.length);
  const parsed=parsedDate(c.value);if(parsed.error)return result(parsed.error==='unsupported-date'?'unknown':'invalid',parsed.error,claims.length);
  values.push(parsed);kinds.add(c.kind);
 }
 const claimKinds=[...kinds].sort(),days=new Set(values.filter(v=>v.kind==='calendar-date').map(v=>v.value)),timestamps=values.filter(v=>v.kind==='timestamp');
 if(days.size>1)return result('conflict','different-calendar-dates',claims.length,claimKinds);
 if(!timestamps.length)return result('known',null,claims.length,claimKinds,{kind:'calendar-date',value:[...days][0]});
 const lower=Math.max(...timestamps.map(v=>v.epochMs)),upper=Math.min(...timestamps.map(v=>v.epochMs+v.resolutionMs));
 if(lower>=upper)return result('conflict','different-timestamps',claims.length,claimKinds);
 if(days.size){
  // A bare publisher date has no timezone. It must not invent UTC midnight.
  // Check compatibility against the real-world -12..+14 timezone envelope.
  const midnight=Date.parse([...days][0]+'T00:00:00.000Z');
  if(lower<midnight-14*3600000||upper>midnight+36*3600000)return result('conflict','date-timestamp-disagreement',claims.length,claimKinds);
 }
 return result('known',null,claims.length,claimKinds,{kind:'timestamp',value:new Date(lower).toISOString(),epochMs:lower,resolutionMs:upper-lower});
}
