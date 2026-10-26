'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const exporter = require('../export-browser.js');
const source = fs.readFileSync(path.join(__dirname, '../export-browser.js'), 'utf8');
const messages = exporter.BOOTSTRAP_MESSAGES;
const sentinel = 'SYNTHETIC_PRIVATE_KEY_AND_URL_MUST_NOT_LOG';

function fixture(options = {}) {
  const logs = [], nodes = [];
  let fetches = 0, storageReads = 0;
  const body = { children: [], append(node) { this.children.push(node); node.parent = this; } };
  const document = { body, createElement(tag) {
    if (options.createThrows) throw new Error(sentinel);
    const node = { tag, children: [], value: '', listeners: {},
      append(...children) { this.children.push(...children); },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      showModal() {
        if (options.modalThrows || options.modalRejects || options.focusRejects) nodes.find(x => x.tag === 'input').value = sentinel;
        if (options.modalThrows) throw new Error(sentinel);
        if (options.modalRejects) return Promise.reject(new Error(sentinel));
        this.open = true;
      },
      focus() {
        if (options.focusRejects) return Promise.reject(new Error(sentinel));
        this.focused = true;
      },
      close() { this.open = false; },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); this.removed = true; }
    };
    nodes.push(node); return node;
  } };
  const env = { document, console: { info: (...args) => logs.push(args) }, URL, AbortController,
    location: { origin: 'https://192.168.40.1' },
    fetch() { fetches++; throw new Error(sentinel); } };
  Object.defineProperty(env, 'localStorage', { get() { storageReads++; throw new Error(sentinel); } });
  Object.defineProperty(env, 'sessionStorage', { get() { storageReads++; throw new Error(sentinel); } });
  return { env, document, nodes, logs, assertIdle() { assert.equal(fetches, 0); assert.equal(storageReads, 0); } };
}

async function evaluate(f) {
  vm.runInNewContext(source, f.env, { filename: 'export-browser.js' });
  // Drain startup awaits and its rejection handler, without a network or timer.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  f.assertIdle();
}

function logged(f, expected) {
  assert.deepEqual(f.logs, [[expected]]);
  assert.equal(JSON.stringify(f.logs).includes(sentinel), false);
}

test('browser document wins over page CommonJS globals and host exports remain untouched', async () => {
  const f = fixture(), original = { hostBundle: true };
  f.env.module = { exports: original };
  await evaluate(f);
  assert.equal(f.env.module.exports, original);
  assert.equal(f.document.body.children.length, 1);
  assert.equal(f.document.body.children[0].open, true);
  assert.equal(f.nodes.find(x => x.tag === 'input').type, 'password');
  assert.equal(f.nodes.find(x => x.tag === 'input').value, '');
  logged(f, messages.ready);
});

test('browser startup never reads a host module getter', async () => {
  const f = fixture();
  Object.defineProperty(f.env, 'module', { get() { throw new Error(sentinel); } });
  await evaluate(f);
  logged(f, messages.ready);
});

test('Node CommonJS import exports pure helpers without console, DOM, fetch or storage work', async () => {
  const f = fixture();
  delete f.env.document;
  f.env.module = { exports: {} };
  await evaluate(f);
  assert.equal(typeof f.env.module.exports.collect, 'function');
  assert.equal(typeof f.env.module.exports.bootstrap, 'function');
  assert.deepEqual(f.logs, []);
  assert.equal(f.nodes.length, 0);
});

test('missing document outside CommonJS reports fixed Console context guidance', async () => {
  const f = fixture();
  delete f.env.document;
  await evaluate(f);
  logged(f, messages.noDocument);
});

test('browser missing document never reads host module globals', async () => {
  const f = fixture();
  delete f.env.document;
  f.env.window = f.env;
  Object.defineProperty(f.env, 'module', { get() { throw new Error(sentinel); } });
  await evaluate(f);
  logged(f, messages.noDocument);
});

test('missing body or createElement reports fixed guidance without silently returning', async () => {
  for (const property of ['body', 'createElement']) {
    const f = fixture();
    delete f.document[property];
    await evaluate(f);
    logged(f, messages.noDocument);
  }
  await assert.rejects(exporter.run({ document: {} }), { auditCode: 'document-unavailable' });
});

test('throwing document getter is consumed and raw exception never reaches console', async () => {
  const f = fixture();
  f.env.window = f.env;
  Object.defineProperty(f.env, 'document', { get() { throw new Error(sentinel); } });
  assert.equal(await exporter.bootstrap(f.env), false);
  f.assertIdle();
  logged(f, messages.failed);
});

test('full browser script contains document accessor failures without touching host module', async () => {
  const f = fixture();
  f.env.window = f.env;
  Object.defineProperty(f.env, 'document', { get() { throw new Error(sentinel); } });
  Object.defineProperty(f.env, 'module', { get() { throw new Error(sentinel); } });
  await evaluate(f);
  // VM global proxies can return undefined for a throwing document accessor.
  assert.equal(f.logs.length, 1);
  assert.equal(f.logs[0].length, 1);
  assert.ok([messages.noDocument, messages.failed].includes(f.logs[0][0]));
  assert.equal(JSON.stringify(f.logs).includes(sentinel), false);
});

test('synchronous and rejected DOM startup failures clean modal/input and never leak rejection', async () => {
  for (const options of [{ createThrows: true }, { modalThrows: true }, { modalRejects: true }, { focusRejects: true }]) {
    const f = fixture(options);
    await evaluate(f);
    logged(f, messages.failed);
    assert.equal(f.document.body.children.length, 0);
    for (const input of f.nodes.filter(x => x.tag === 'input')) assert.equal(input.value, '');
  }
});

test('bootstrap consumes sync throw and rejected startup without raw exception logging', async () => {
  for (const start of [() => { throw new Error(sentinel); }, () => Promise.reject(new Error(sentinel))]) {
    const f = fixture();
    assert.equal(await exporter.bootstrap(f.env, start), false);
    logged(f, messages.failed);
    f.assertIdle();
  }
});

test('unavailable console or a throwing logger does not create startup rejection', async () => {
  for (const console of [undefined, { info() { throw new Error(sentinel); } }]) {
    const f = fixture();
    f.env.console = console;
    assert.equal(await exporter.bootstrap(f.env), true);
    f.assertIdle();
  }
});

test('operator messages are immutable exact content-free strings', () => {
  assert.equal(Object.isFrozen(messages), true);
  assert.deepEqual(messages, {
    ready: '[Murmingle UniFi export] Dialog ready. Enter the temporary key in the password field, not the Console.',
    noDocument: '[Murmingle UniFi export] No usable page document. Select top in the Console context selector, wait for the page to load, and run the script again.',
    failed: '[Murmingle UniFi export] Dialog startup failed. Select top in the Console context selector, wait for the page to load, and run the script again.'
  });
});
