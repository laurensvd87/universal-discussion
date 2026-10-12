import assert from "node:assert/strict";
import test from "node:test";
import { buildInsightInstructions } from "../src/ai/insight-prompts.js";

// Static instruction checks, not generated-output quality claims. Each signature
// pairs an observable writing move with the guard that keeps that move grounded.
const SIGNATURES = {
  challenger: [/fair counterargument to an actual claim when supported/u, /naming the assumption it tests/u, /original claim holds/u, /Never manufacture objections, facts or disagreement/u],
  funny: [/actual joke about a concrete detail/u, /Silly, exaggerated or absurd imagery/u, /joke itself can be the whole contribution/u, /Don't mock people or joke about harm, distress or sensitive situations/u],
  clever: [/unusual connection or non-obvious reframing/u, /without an appended analysis/u, /Never invent facts to make a connection/u],
  sarcastic: [/dry, ironic take/u, /irony can stand alone/u, /Neutral criticism alone does not fulfill this voice/u, /Never invent a contradiction, force negativity or mock people/u],
  skeptic: [/one specific, warranted doubt or question/u, /actual claim's support/u, /Distinguish weak support from disproof/u, /never invent gaps/u],
  pragmatist: [/actionable tip or feasible next step/u, /condition needed to make it valid/u, /Use available evidence/u, /invented instructions/u],
  explainer: [/key mechanism simply/u, /plain-language cause-and-effect chain/u, /analogy only when accurate/u, /never invent a mechanism/u],
  optimist: [/hopeful angle or credible constructive opportunity/u, /material uncertainty or limiting condition/u, /without promising success/u, /Never invent benefits, hide uncertainty/u],
  realist: [/candid real-world tradeoff or constraint/u, /proportionate uncertainty/u, /avoid fatalism or invented limitations/u],
  mediator: [/common-ground perspective/u, /views actually present/u, /Correct factual errors/u, /never invent two sides/u, /unequal evidence equal weight/u, /Never fabricate an opponent/u],
  curious: [/interesting genuine question or unresolved implication/u, /specific question may be the contribution/u, /Keep the implication conditional/u, /never invent possibilities as facts/u, /answer the selected question before raising another/u],
};
const TASK_START = "One-liners are welcome;";

test("every nonstandard voice has one compact distinct writing requirement and the exact tone-free task in every mode", () => {
  const suffixes = new Map();
  assert.equal(Object.keys(SIGNATURES).length, 11);
  for (const followup of [false, true]) for (const research of [false, true]) {
    const base = buildInsightInstructions(followup, research, "challenger");
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
    assert.match(funny, /actual joke about a concrete detail/u);
    assert.match(funny, /Silly, exaggerated or absurd imagery/u);
    assert.match(funny, /without an explanatory or analytical tail/u);
    assert.match(sarcastic, /recognizably dry, ironic take/u);
    assert.match(sarcastic, /evidenced overclaim or practical tradeoff/u);
    assert.match(sarcastic, /Never invent a contradiction, force negativity or mock people/u);
    for (const prompt of [funny, sarcastic]) {
      assert.match(prompt, /do not require a neutral or sober tone/u);
      assert.match(prompt, /Fictional tone examples \(not evidence; never copy\)/u);
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
