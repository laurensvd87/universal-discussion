import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createPackagedCrawlerEmbedder} from '../src/crawler/packaged-e5.js';

test('trusted manifest identity is checked before JSON decode or runtime asset loading',async()=>{
 const root=fileURLToPath(new URL('../data/',import.meta.url));
 const directory=await mkdtemp(path.join(root,'encoder-manifest-test-'));
 assert.equal(path.dirname(path.resolve(directory)),path.resolve(root));
 try{
  const raw=Buffer.from('deliberately-not-json');await writeFile(path.join(directory,'manifest.json'),raw);
  await assert.rejects(createPackagedCrawlerEmbedder({assetRoot:directory,expectedManifestSha256:'0'.repeat(64)}),
   {message:'Crawler embedding manifest integrity mismatch'});
  const exact=createHash('sha256').update(raw).digest('hex');
  await assert.rejects(createPackagedCrawlerEmbedder({assetRoot:directory,expectedManifestSha256:exact}),SyntaxError);
  await assert.rejects(createPackagedCrawlerEmbedder({assetRoot:directory}),SyntaxError,'default caller behavior remains unchanged');
 }finally{
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(root));
  assert.ok(path.basename(directory).startsWith('encoder-manifest-test-'));
  await rm(directory,{recursive:true});
 }
});

test('invalid trusted identity is rejected before attempting a filesystem read',async()=>{
 const assetRoot=fileURLToPath(new URL('../data/nonexistent-encoder-manifest-test/',import.meta.url));
 for(const expectedManifestSha256 of ['',42,'A'.repeat(64),'a'.repeat(63),{}])
  await assert.rejects(createPackagedCrawlerEmbedder({assetRoot,expectedManifestSha256}),{message:'Invalid embedding manifest identity'});
});
