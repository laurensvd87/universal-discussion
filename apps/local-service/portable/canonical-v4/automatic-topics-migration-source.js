// Build-time/source-review helper only. Ordinary manifests read the checked-in
// migration; importing or invoking this helper never executes SQL or writes it.
import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
export const AUTOMATIC_TOPICS_COMPONENTS=Object.freeze([
 'automatic-named-subjects.sql','automatic-subject-retrieval.sql',
 'automatic-author-context.sql','automatic-author-insight.sql',
 'automatic-topic-feeds.sql','automatic-topic-public-reads.sql','automatic-topic-replies.sql',
 'automatic-page-topic-membership.sql','published-topic-evidence.sql','published-topic-recovery.sql',
 'single-source-topic-match.sql','named-owner-grouping.sql','unified-topic-search.sql','combined-author-hierarchy.sql',
]);
export async function buildAutomaticTopicsMigrationSource(){
 if(arguments.length)throw new TypeError('Automatic topic migration has fixed inputs');
 const pieces=[Buffer.from('-- Reviewed automatic topics migration018. Explicit owner installation only.\n-- After activation, retain these migration/component bytes; changes require a later migration.\n')];
 for(const name of AUTOMATIC_TOPICS_COMPONENTS){const bytes=await readFile(new URL('./drafts/'+name,import.meta.url)),hash=createHash('sha256').update(bytes).digest('hex');
  pieces.push(Buffer.from('\n-- Component '+name+' SHA256 '+hash+'\n'),bytes,Buffer.from('\n-- End component '+name+'\n'));
 }
 return Buffer.concat(pieces);
}
