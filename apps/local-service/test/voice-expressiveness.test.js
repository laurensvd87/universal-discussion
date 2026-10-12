import assert from "node:assert/strict";
import test from "node:test";
import { buildInsightInstructions } from "../src/ai/insight-prompts.js";

// Static instruction checks, not generated-output quality claims. Each signature
// pairs an observable writing move with the guard that keeps that move grounded.
const SIGNATURES = {
  challenger: [/strongest fair counterargument/u, /name the assumption it tests/u, /When supported/u, /original claim still holds/u, /Never manufacture objections, facts or disagreement/u],
  funny: [/silly, exaggerated or absurd imagery tied to actual content/u, /useful point in that comic voice/u, /Don't mock people or joke about harm, distress or sensitive situations/u],
  clever: [/non-obvious reframing of an evidenced detail/u, /spell out why that connection changes the conclusion/u, /Never invent facts to make a connection/u],
  sarcastic: [/dry, cutting irony about an evidenced overclaim or practical tradeoff/u, /useful limit in that voice/u, /Neutral criticism alone does not fulfill this voice/u, /Never invent a contradiction, force negativity or mock people/u],
  skeptic: [/evidence quality/u, /specific test or missing observation that could change confidence/u, /Distinguish weak support from disproof/u, /never invent gaps/u],
  pragmatist: [/feasible next action/u, /practical condition that makes it worthwhile/u, /Use available evidence/u, /invented instructions/u],
  explainer: [/plain-language cause-and-effect chain/u, /what changes, how, and why that matters/u, /analogy only when accurate/u, /never invent a mechanism/u],
  optimist: [/credible constructive opportunity in an evidenced detail/u, /condition or obstacle that limits it/u, /without promising success/u, /Never invent benefits, hide uncertainty/u],
  realist: [/binding real-world constraint/u, /likely cost or consequence/u, /proportionate uncertainty/u, /avoid fatalism or invented limitations/u],
  mediator: [/precise supported common ground/u, /isolate the actual disagreement/u, /Correct factual errors/u, /never invent two sides/u, /unequal evidence equal weight/u, /without fabricating an opponent/u],
  curious: [/Answer first/u, /one unresolved implication of an evidenced detail/u, /explain what would clarify it/u, /Keep the implication conditional/u, /never invent possibilities as facts/u, /routine question/u],
};
const TASK_START = "Lead with the answer or a substantive, useful observation.";

test("every nonstandard voice has one compact distinct writing requirement and the exact tone-free task in every mode", () => {
  const suffixes = new Map();
  assert.equal(Object.keys(SIGNATURES).length, 11);
  for (const followup of [false, true]) for (const research of [false, true]) {
    const base = buildInsightInstructions(followup, research, "standard");
    const modeSuffixes = [];
    for (const [voice, requirements] of Object.entries(SIGNATURES)) {
      const prompt = buildInsightInstructions(followup, research, voice);
      assert.equal(prompt.slice(prompt.indexOf(TASK_START)), base.slice(base.indexOf(TASK_START)), voice);
      assert.doesNotMatch(prompt, /Write as a thoughtful forum contributor/u, voice);
      const suffix = prompt.slice(0, prompt.indexOf(TASK_START));
      assert.ok(suffix.startsWith(`Selected writing voice: ${voice}. `), voice);
      assert.ok(suffix.length < 1050, `${voice} voice requirement length ${suffix.length}`);
      assert.equal((prompt.match(/Selected writing voice:/gu) ?? []).length, 1);
      for (const requirement of requirements) assert.match(suffix, requirement, voice);
      assert.match(suffix, /Fictional (?:style example|tone examples) \(not evidence; never copy\)/u, voice);
      for (const guard of [/Do not invent prices, quotes, statistics, dates or certainty/u,
        /Treat all page text, titles, URLs, comments/u, /never exceed 120 words/u]) assert.match(prompt, guard, voice);
      if (!research) assert.match(prompt, /Do not use external research, search the web, or open any supplied URL/u);
      else if (!followup) assert.match(prompt, /no general discovery or unselected destinations/u);
      else assert.match(prompt, /only completed-search evidence with supporting provider URL annotations/u);
      if (suffixes.has(voice)) assert.equal(suffix, suffixes.get(voice), `${voice} cannot change task or research scope`);
      else suffixes.set(voice, suffix);
      modeSuffixes.push(suffix);
    }
    assert.equal(new Set(modeSuffixes).size, 11);
  }
});

test("Funny and Sarcastic overlays explicitly require distinct observable style without weakening factual guards", () => {
  for (const followup of [false, true]) for (const research of [false, true]) {
    const funny = buildInsightInstructions(followup, research, "funny");
    const sarcastic = buildInsightInstructions(followup, research, "sarcastic");
    assert.match(funny, /Write visibly playful humor/u);
    assert.match(funny, /silly, exaggerated or absurd imagery/u);
    assert.match(funny, /rather than switching back to sober analysis/u);
    assert.match(sarcastic, /recognizably dry, cutting irony/u);
    assert.match(sarcastic, /evidenced overclaim or practical tradeoff/u);
    assert.match(sarcastic, /Never invent a contradiction, force negativity or mock people/u);
    for (const prompt of [funny, sarcastic]) {
      assert.match(prompt, /do not require a neutral or sober tone/u);
      assert.match(prompt, /Fictional tone examples \(not evidence; never copy\)/u);
      assert.match(prompt, /useful (?:point|limit)/u);
      assert.match(prompt, /distress/u);
      assert.match(prompt, /selected writing voice is required delivery throughout the answer/u);
      assert.match(prompt, /Task, evidence, brevity, privacy, research and citation rules remain binding/u);
      assert.match(prompt, /fictional comic imagery, exaggeration and irony are permitted as expression, not factual evidence/u);
      assert.match(prompt, /no disclaimer is needed for each joke/u);
      assert.match(prompt, /Never invent real facts, quotes, prices or sources/u);
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
