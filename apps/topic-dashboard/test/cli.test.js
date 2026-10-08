import assert from "node:assert/strict";
import { test } from "node:test";
import { renderDashboardDocument } from "../src/cli.js";

const template = '<html><head><link rel="stylesheet" href="./style.css" data-dashboard-style></head><body>' +
  '<script id="dashboard-data" type="application/json"></script>' +
  '<script src="./app.js" defer data-dashboard-script></script></body></html>';

test("standalone report inlines local assets and escapes untrusted page titles", () => {
  const snapshot = { pages: [{ title: '</script><script>alert("x")</script>&' }] };
  const html = renderDashboardDocument({ template, style: "body{color:blue}", script: "window.ready=true;", snapshot });
  assert.match(html, /<style>body\{color:blue\}<\/style>/u);
  assert.match(html, /<script>window.ready=true;<\/script>/u);
  assert.ok(!html.includes('</script><script>alert("x")'));
  assert.ok(html.includes("\\u003c/script>"));
  assert.ok(!html.includes('href="./style.css"'));
  assert.ok(!html.includes('src="./app.js"'));
});

test("template drift fails closed", () => {
  assert.throws(() => renderDashboardDocument({ template: "<html></html>", style: "", script: "", snapshot: {} }),
    /template changed/u);
});
