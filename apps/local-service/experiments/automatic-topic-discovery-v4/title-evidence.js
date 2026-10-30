// Experimental title evidence only. No entity list, model, network or IO.
// Keep a literal NFKC prefix: every surviving label retains its original UTF16
// offsets. Source material/vector identities are never rewritten by this helper.
const need=v=>{if(!v)throw new TypeError('Invalid publisher title evidence');};
const generic=new Set(['www','com','org','net','edu','gov','co','test','example','info','news','app','site','blog']);
export function isolatePublisherTitleEvidence(title,publisherKey){
 need(arguments.length===2&&typeof title==='string'&&title.length>0&&title.length<=200&&title.isWellFormed()&&
  !/[\u0000-\u001f\u007f]/u.test(title)&&typeof publisherKey==='string'&&/^[a-z0-9][a-z0-9.-]{0,159}$/u.test(publisherKey));
 const normalized=title.normalize('NFKC');need(normalized.length<=512);
 const host=publisherKey.replace(/^www\./u,''),brands=new Set([host,...host.split('.').filter(p=>p.length>=3&&!generic.has(p))]);
 for(const boundary of normalized.matchAll(/\s+[\-\u2013\u2014|]\s+|\s*\|\s*/gu)){
  const suffix=normalized.slice(boundary.index+boundary[0].length).trim();
  const token=/^([\p{L}\p{N}._-]+)(.*)$/u.exec(suffix);
  if(!token||!brands.has(token[1].toLowerCase())||token[2].trim()&&!/^[,|]/u.test(token[2].trim()))continue;
  const prefix=normalized.slice(0,boundary.index).trimEnd();if(!prefix)continue;
  return Object.freeze({title:prefix,removedPublisherSuffix:true,normalization:'NFKC',prefixEnd:prefix.length});
 }
 return Object.freeze({title:normalized,removedPublisherSuffix:false,normalization:'NFKC',prefixEnd:normalized.length});
}
