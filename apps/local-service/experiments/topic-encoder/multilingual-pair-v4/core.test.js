import assert from 'node:assert/strict';
import { evidence, fit, metrics, pairs } from './core.js';

const a = { id: 'x-en-a', title: 'North Quay launch on 12 March', body: 'LumaGrid moves the launch.', family: 'x', topicLabel: 'event-a', viewpoint: 'support' };
const b = { id: 'x-nl-b', title: 'LumaGrid bij North Quay op 12 maart', body: 'De opening is uitgesteld.', family: 'x', topicLabel: 'event-a', viewpoint: 'critic' };
const c = { id: 'x-fr-c', title: 'LumaGrid ouvre site le 14 mars', body: 'North Quay poursuit le projet.', family: 'x', topicLabel: 'event-b', viewpoint: 'report' };
const rows = [a, b, c];
const v = { focus: new Map(rows.map((x, i) => [x.id, i === 2 ? [0, 1] : [1, 0]])),
  title: new Map(rows.map((x, i) => [x.id, i === 2 ? [0, 1] : [1, 0]])),
  evidence: new Map(rows.map(x => [x.id, evidence(x)])) };
const all = pairs(rows, v);
assert.equal(all.length, 3);
assert.equal(all[0].positive, true);
assert.equal(all[0].cross, true);
assert.equal(all[0].opposed, true);
assert.equal(all[1].hard, true);
assert.equal(all[0].f[2], 1);
assert.equal(all[1].f[3], 1);
const model = fit(all);
assert.equal(metrics(all, model).fp, 0);
assert.ok(Number.isFinite(model.cutoff));
console.log('core.test.js: ok');
