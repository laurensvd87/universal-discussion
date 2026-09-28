import assert from "node:assert/strict";
import test from "node:test";
import { mountRelatedPagesDemo } from "../browser/chromium/related-pages-panel.js";
import { EN } from "../browser/locales/en.js";

function harness(messages) {
  const created = [];
  const document = {
    createElement(tag) {
      const element = {
        tag,
        textContent: "",
        children: [],
        attributes: {},
        listeners: new Map(),
        append(...children) { this.children.push(...children); },
        replaceChildren(...children) { this.children = [...children]; },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(type, callback) { this.listeners.set(type, callback); },
        removeEventListener(type, callback) {
          if (this.listeners.get(type) === callback) this.listeners.delete(type);
        },
      };
      created.push(element);
      return element;
    },
  };
  const root = document.createElement("section");
  const panel = mountRelatedPagesDemo(document, root, messages);
  return {
    created, root, panel,
    select: created.find(({ tag }) => tag === "select"),
    list: created.find(({ tag }) => tag === "ul"),
    status: created.find(({ attributes }) => attributes.role === "status"),
  };
}

test("related pages demo shows sources with no contributions and no generated-model claim", () => {
  const ui = harness();
  assert.equal(ui.list.children.length, 4);
  assert.equal(ui.status.textContent, "Recommended sources: 4");
  assert.equal(ui.root.attributes["aria-labelledby"], "related-pages-heading");
  assert.equal(ui.created.find(({ tag }) => tag === "label").htmlFor, ui.select.id);
  assert.ok(ui.created.some(({ textContent }) => textContent === EN.relatedPagesScope));
  assert.ok(ui.created.some(({ textContent }) => textContent === EN.relatedPagesNoPosts));
  assert.deepEqual(ui.list.children.map((item) => item.children[2].textContent), [
    EN.relatedPagesSameTopic, EN.relatedPagesSameTopic,
    EN.relatedPagesRelated, EN.relatedPagesRelated,
  ]);
  assert.ok(ui.list.children.some((item) => item.children[1].textContent.includes("?id=harbor-s2")));
  assert.equal(ui.created.some(({ tag }) => ["a", "img", "iframe", "script"].includes(tag)), false);
  assert.equal(ui.created.some(({ textContent }) => /0\.9|similarity score/.test(textContent)), false);
});

test("changing to an uncovered source clears old recommendations and explains catalog limits", () => {
  const ui = harness();
  ui.select.value = "garden-guide";
  ui.select.listeners.get("change")();
  assert.equal(ui.list.children.length, 0);
  assert.equal(ui.status.textContent, EN.relatedPagesEmpty);
  assert.equal(ui.root.children[5].textContent, "https://garden.example/seedlings");
});

test("invalid selections clear every prior recommendation and current source", () => {
  const ui = harness();
  ui.select.value = "missing-source";
  ui.select.listeners.get("change")();
  assert.equal(ui.list.children.length, 0);
  assert.equal(ui.root.children[5].textContent, "");
  assert.equal(ui.status.textContent, EN.relatedPagesUnavailable);
});

test("new UI uses replaceable message keys with English fallback and text-only rendering", () => {
  const heading = "<img src=x onerror=alert(1)>";
  const ui = harness({ relatedPagesHeading: heading, relatedPagesCount: "Found: {count}" });
  assert.equal(ui.root.children[0].textContent, heading);
  assert.equal(ui.root.children[0].children.length, 0);
  assert.equal(ui.root.children[1].textContent, EN.relatedPagesIntro);
  assert.equal(ui.status.textContent, "Found: 4");
  assert.equal(harness(null).root.children[0].textContent, EN.relatedPagesHeading);
});

test("disposing the panel removes handlers and demo contents", () => {
  const ui = harness();
  ui.panel.dispose();
  ui.panel.dispose();
  assert.equal(ui.select.listeners.size, 0);
  assert.equal(ui.root.children.length, 0);
});
