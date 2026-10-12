import assert from "node:assert/strict";
import test from "node:test";
import { buildInsightInstructions } from "../src/ai/insight-prompts.js";

test("Funny and Sarcastic overlays explicitly require distinct observable style without weakening factual guards", () => {
  for (const followup of [false, true]) for (const research of [false, true]) {
    const base = buildInsightInstructions(followup, research);
    const funny = buildInsightInstructions(followup, research, "funny");
    const sarcastic = buildInsightInstructions(followup, research, "sarcastic");
    assert.ok(funny.startsWith(base)); assert.ok(sarcastic.startsWith(base));
    assert.match(funny, /must sound visibly playful, not like neutral analysis/u);
    assert.match(funny, /comic image tied to an actual page detail/u);
    assert.match(funny, /Exaggerate the image, never the facts/u);
    assert.match(sarcastic, /must sound recognizably dry and cutting/u);
    assert.match(sarcastic, /ironic line about an evidenced overclaim or practical tradeoff/u);
    assert.match(sarcastic, /Never invent a contradiction or mock people/u);
    for (const prompt of [funny, sarcastic]) {
      assert.match(prompt, /not like neutral analysis/u);
      assert.match(prompt, /Fictional tone examples \(not evidence; never copy\)/u);
      assert.match(prompt, /useful (?:point|limit)/u);
      assert.match(prompt, /distress/u);
      assert.match(prompt, /all task, evidence, brevity, privacy, research and citation rules take precedence/u);
      assert.match(prompt, /Do not invent prices, quotes, statistics, dates or certainty/u);
      assert.match(prompt, /never exceed 120 words/u);
    }
  }
});

test("offline handcrafted calibration rubric distinguishes plain analysis, playful wit and pointed irony", () => {
  // These authored examples assess the rubric only; no provider inference or
  // claim that the generated model output has passed live quality review.
  const examples = [
    { style: "plain", body: "The leaflet describes two settings. Pick the setting that matches your plants.", playful: false, pointed: false, useful: true },
    { style: "funny", body: "This watering timer is a very small raincloud with a calendar. Its two settings let you match the schedule to your plants.", playful: true, pointed: false, useful: true },
    { style: "sarcastic", body: "An effortless installation, with a reassuringly long tools list. Check that you own the six required tools before buying the kit.", playful: false, pointed: true, useful: true },
  ];
  const rubric = example => ({ useful: /setting|schedule|required tools/u.test(example.body),
    playful: /raincloud with a calendar/u.test(example.body),
    pointed: /effortless installation, with a reassuringly long tools list/u.test(example.body) });
  for (const example of examples) assert.deepEqual(rubric(example), { useful: example.useful, playful: example.playful, pointed: example.pointed });
  assert.equal(examples.filter(example => rubric(example).playful).length, 1);
  assert.equal(examples.filter(example => rubric(example).pointed).length, 1);
});
