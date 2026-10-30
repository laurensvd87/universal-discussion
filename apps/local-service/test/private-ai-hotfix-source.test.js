import test from 'node:test';import assert from 'node:assert/strict';
import {derivePrivateAiHotfixSource,transformPrivateAiHotfixForTest as patch,PRIVATE_AI_HOTFIX_BASE} from '../src/ops/private-ai-hotfix-source.js';
test('only the private runtime key list changes while an existing public occurrence is preserved',()=>{
 const line='        ...(Object.hasOwn(value ?? {}, "excludedRelatedSourceIds") ? ["excludedRelatedSourceIds"] : []),',marker='    async generatePrivate(value, actorId, { signal } = {}) {';
 const source='PUBLIC\n'+line+'\n'+marker+'\n'+line+'\nUNCHANGED',next=patch('apps/local-service/src/ai/chatgpt-runtime.js',source);
 assert.equal(next.split(marker)[0],source.split(marker)[0]);assert.equal(next.replace('        ...(Object.hasOwn(value ?? {}, "includeRelatedSources") ? ["includeRelatedSources"] : []),\n',''),source);
 assert.throws(()=>patch('apps/local-service/src/ai/chatgpt-runtime.js',next));
});
test('private storage preserves every existing field and adds a strict boolean at the existing validation boundary',()=>{
 const first='          ...(Object.hasOwn(generation, "excludedRelatedSourceIds") ? ["excludedRelatedSourceIds"] : []),',last='          ...(Object.hasOwn(generation, "preferences") ? ["preferences"] : [])]);';
 for(const eol of ['\n','\r\n']){const source=['UNCHANGED',first,last,'TAIL'].join(eol),next=patch('apps/local-service/src/private/private-service.js',source);
  assert.ok(next.startsWith('UNCHANGED'+eol));assert.ok(next.endsWith(eol+'TAIL'));assert.ok(next.includes('typeof generation.includeRelatedSources !== "boolean"'));assert.ok(next.includes(first));assert.ok(next.includes(last));}
});
test('hash-gated derivation refuses arbitrary paths, bytes and already patched source',()=>{
 assert.equal(Object.keys(PRIVATE_AI_HOTFIX_BASE.patches).length,3);
 for(const file of ['unregistered',...Object.keys(PRIVATE_AI_HOTFIX_BASE.patches)])assert.throws(()=>derivePrivateAiHotfixSource(file,Buffer.from('arbitrary source')));
});
