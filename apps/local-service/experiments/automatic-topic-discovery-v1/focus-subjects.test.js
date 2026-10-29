import test from 'node:test';import assert from 'node:assert/strict';
import {proposeFocusedSubjects as propose} from './focus-subjects.js';
const unit=(index=0)=>{const v=Array(384).fill(0);v[index]=1;return v;};
const doc=(id,title,publisherKey='site'+id+'.example')=>{const hash=id.charCodeAt(0).toString(16).padStart(64,'0'),v=unit(),angle=(id.charCodeAt(0)-97)*.12;v[0]=Math.cos(angle);v[1]=Math.sin(angle);return{sourceId:id,inputHash:hash,materialHash:hash,title,publisherKey,acceptedPath:[],vector:v};};
const run=observations=>propose(JSON.stringify({representationHash:'a'.repeat(64),matcherHash:'b'.repeat(64),minimumSimilarity:.88,observations}));
const label=r=>r.proposals.map(p=>p.label.toLowerCase());

test('discovers new literal subject labels and a more specific nested edition without a predefined topic list',()=>{
 const r=run([doc('a','Northern Reef survey 2041 starts'),doc('b','New Northern Reef survey 2041 results'),doc('c','Northern Reef survey 2042 starts'),doc('d','New Northern Reef survey 2042 results')]);
 const root=r.proposals.find(p=>p.label==='Northern Reef survey');assert.ok(root);assert.equal(root.members.length,4);
 for(const p of r.proposals.filter(p=>/204[12]$/u.test(p.label))){assert.equal(p.members.length,2);assert.equal(p.parentProposalKey,root.proposalKey);assert.equal(p.eventIdentityAsserted,false);}
 assert.equal(r.proposals.filter(p=>/204[12]$/u.test(p.label)).length,2);assert.ok(r.selections.every(s=>s.preferredProposalKey!==root.proposalKey));
});
test('a person subject spans different developments without misnaming the group after one event headline',()=>{
 const r=run([doc('a','Amina Patel wins a robotics award'),doc('b','Amina Patel opens a new laboratory'),doc('c','Professor Amina Patel joins the academy')]);
 assert.deepEqual(label(r),['amina patel']);assert.equal(r.proposals[0].kind,'subject');assert.equal(r.eventIdentityAsserted,false);assert.equal(r.assignmentAuthority,false);
});
test('focal unigrams support a new single-word subject; incidental surname alone cannot claim that context',()=>{
 const r=run([doc('a','Quokkas in the wild'),doc('b','Researchers photograph QUOKKAS'),doc('c','Researcher Patel opens a new laboratory'),doc('d','Students from Patel laboratory win')]);
 // A word may be focal on one title and mid-title on another: it must be
 // collected on both, with focal placement checked across the shared evidence.
 assert.ok(label(r).includes('quokkas'));assert.equal(label(r).includes('patel'),false);
});
test('repeated title text, a single publisher and duplicated material cannot manufacture independent support',()=>{
 const a=doc('a','New Southern Reef discovery New Southern Reef discovery'),b=doc('b','New Southern Reef discovery','sitea.example');
 assert.equal(run([a]).proposals.length,0);assert.equal(run([a,b]).proposals.length,0);
 b.publisherKey='other.example';b.inputHash=a.inputHash;assert.equal(run([a,b]).proposals.length,0);
});
test('a copied publisher cannot provide a second independent publisher alongside another article from the original publisher',()=>{
 const a=doc('a','Southern Reef discovery','first.example'),b=doc('b','Southern Reef discovery','copy.example'),c=doc('c','Southern Reef discovery','first.example');
 b.materialHash=a.materialHash;assert.equal(run([a,b,c]).proposals.length,0);
 c.publisherKey='independent.example';assert.equal(run([a,b,c]).proposals.length,1);assert.equal(run([a,b,c]).proposals[0].distinctInputs,2);
});
test('shared spelling without semantic support remains page-only and never bridges topic senses',()=>{
 const a=doc('a','Silver Finch releases an update'),b=doc('b','Silver Finch nesting behavior');b.vector=unit(1);
 const r=run([a,b]);assert.equal(r.proposals.length,0);assert.ok(r.selections.every(s=>s.preferredProposalKey===null));
});
test('case folding, Unicode and punctuation retain an attributed literal name without HTML interpretation',()=>{
 const r=run([doc('a','Café Étoile: new menu'),doc('b','CAFÉ ÉTOILE | review')]);
 assert.deepEqual(label(r),['café étoile']);const p=r.proposals[0],source=p.labelWitness.sourceId==='a'?'Café Étoile: new menu':'CAFÉ ÉTOILE | review';
 assert.equal(source.normalize('NFKC').slice(p.labelWitness.start,p.labelWitness.end),p.label);
});
test('input order does not change proposals, hierarchy or selections',()=>{
 const docs=[doc('a','Copper Valley festival 2041 starts'),doc('b','Copper Valley festival 2041 ends'),doc('c','Copper Valley festival returns')];
 assert.deepEqual(run(docs),run([...docs].reverse()));
});
test('different subject axes retain explicit memberships without inventing ancestry or equating label length with specificity',()=>{
 const r=run([doc('a','Amina Patel wins Copper Crown'),doc('b','Amina Patel accepts Copper Crown'),doc('c','Copper Crown ceremony invites artists')]);
 const person=r.proposals.find(p=>p.label==='Amina Patel'),award=r.proposals.find(p=>p.label==='Copper Crown');assert.ok(person&&award);
 assert.equal(person.parentProposalKey,null);assert.equal(award.parentProposalKey,null);
 assert.equal(r.selections.find(s=>s.sourceId==='a').preferredProposalKey,person.proposalKey);
 assert.equal(r.selections.find(s=>s.sourceId==='a').supportedProposalKeys.length,2);
});
test('malformed, oversized, secret-shaped or nonunit inputs are rejected without running object hooks',()=>{
 let hooks=0;assert.throws(()=>propose(new Proxy({}, {get(){hooks++;throw Error();}})));assert.equal(hooks,0);
 const a=doc('a','Copper Valley');for(const patch of [{token:'secret'},{observations:[{...a,vector:Array(384).fill(0)}]},{observations:[a,a]},{observations:Array(65).fill(a)}])assert.throws(()=>propose(JSON.stringify({representationHash:'a'.repeat(64),matcherHash:'b'.repeat(64),minimumSimilarity:.88,observations:[a],...patch})));
 assert.throws(()=>propose('x'.repeat(1048577)));
});
test('known conflicting roots and unresolved material cannot bridge an ambiguous subject label',()=>{
 const docs=[doc('a','Silver Finch field report'),doc('b','Silver Finch nesting report'),doc('c','Silver Finch software release'),doc('d','Silver Finch update notes')];
 docs[0].acceptedPath=['nature','animals'];docs[1].acceptedPath=['nature','animals','birds'];docs[2].acceptedPath=['technology'];docs[3].acceptedPath=['technology'];
 const r=run(docs);assert.equal(r.proposals.length,2);assert.deepEqual(r.proposals.map(p=>p.members.length),[2,2]);
 assert.deepEqual(r.proposals.map(p=>p.acceptedAncestorPath),[['nature','animals'],['technology']]);
 docs[3].acceptedPath=[];assert.equal(run(docs).proposals.length,1);
});
test('maximum supported cohort reports bounded work and keeps every source selection',()=>{
 const docs=Array.from({length:64},(_,i)=>{const v=Array(384).fill(0);v[0]=Math.sqrt(.92);v[i+1]=Math.sqrt(.08);return{
  sourceId:'source-'+i,inputHash:i.toString(16).padStart(64,'0'),materialHash:(i+1000).toString(16).padStart(64,'0'),
  title:'Cedar Grove annual festival',publisherKey:'site'+i%4+'.example',acceptedPath:['nature'],vector:v};});
 const r=run(docs);assert.equal(r.status,'proposed');assert.equal(r.work.pairs,2016);assert.equal(r.work.coordinateProducts,774144);assert.equal(r.work.matrixBytes,32768);
 assert.ok(r.work.candidatePairChecks<=131072);assert.equal(r.proposals.length,1);assert.equal(r.proposals[0].distinctInputs,64);assert.equal(r.selections.length,64);assert.ok(Object.isFrozen(r.proposals[0]));
});
test('normalization work overflow leaves the whole cohort page-only, without partial named proposals',()=>{
 const r=run([doc('a','\uFDFA'.repeat(40)),doc('b','Cedar Grove festival')]);assert.equal(r.status,'capacity');assert.equal(r.reason,'title-work-bound');assert.deepEqual(r.proposals,[]);assert.deepEqual(r.selections,[]);
});
test('unknown roots can corroborate one unopposed named subject without inventing a classifier path',()=>{
 const docs=[doc('a','Northern Reef survey 2041 starts'),doc('b','Northern Reef survey 2042 starts'),doc('c','Northern Reef survey 2042 results')];
 docs[1].acceptedPath=['nature'];docs[2].acceptedPath=['nature'];
 const r=run(docs),parent=r.proposals.find(p=>p.label==='Northern Reef survey'),child=r.proposals.find(p=>p.label==='Northern Reef survey 2042');
 assert.ok(parent&&child);assert.equal(parent.members.length,3);assert.equal(child.parentProposalKey,parent.proposalKey);
 assert.deepEqual(parent.acceptedAncestorPath,[]);assert.deepEqual(child.acceptedAncestorPath,['nature']);
});
test('lowercase reporting-verb prefixes do not become the shared subject label',()=>{
 const r=run([doc('a','Experts awarded 2041 Copper Crown'),doc('b','Researchers awarded 2041 Copper Crown')]);
 assert.deepEqual(label(r),['2041 copper crown']);
});
