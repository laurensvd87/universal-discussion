import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "records.jsonl");
const bytes = fs.readFileSync(file);
const EXPECTED_SHA256 = "659f2e9a27651b6577d2686f8b3849e56e6a36984471620980bcca68b880f1fe";
const actualHash = crypto.createHash("sha256").update(bytes).digest("hex");
assert.equal(actualHash, EXPECTED_SHA256, "records.jsonl changed; review and update the pinned digest");

const expectedKeys = ["id", "family", "eventKey", "lang", "viewpoint", "title", "body"];
const rows = bytes.toString("utf8").trimEnd().split(/\r?\n/).map((line) => JSON.parse(line));
assert.equal(rows.length, 36, "expected 36 authored reports");

const cuePatterns = {
  en: /\b(the|and|was|were|at|for|with|from|after|before|while|we|our|no|there)\b/giu,
  nl: /\b(de|het|een|en|om|van|voor|bij|door|maar|blijft|werd|zijn|geen|terwijl)\b/giu,
  de: /\b(der|die|das|und|am|um|mit|für|bei|wurde|bleibt|keine|einer|nach|vor)\b/giu,
  fr: /\b(le|la|les|un|une|des|et|à|au|du|de|pour|avec|dans|aucun|aucune|reste|après)\b/giu,
  es: /\b(el|la|los|las|un|una|de|y|que|para|con|por|durante|ningún|ninguna|hubo|desde|tras)\b/giu,
};
const seenIds = new Set();
const perEvent = new Map();
const perFamily = new Map();
const familyRoleLanguages = new Map();
for (const [index, row] of rows.entries()) {
  assert.deepEqual(Object.keys(row), expectedKeys, `row ${index + 1} must have exactly the ordered schema keys`);
  assert.equal(typeof row.id, "string");
  assert.match(row.id, /^C30[12]-E[123]-R[1-6]$/);
  assert.ok(!seenIds.has(row.id), `duplicate id ${row.id}`);
  seenIds.add(row.id);
  assert.equal(row.family, row.id.slice(0, 4));
  assert.equal(row.eventKey, row.id.slice(0, 7));
  assert.ok(["en", "nl", "de", "fr", "es"].includes(row.lang), `unsupported language in ${row.id}`);
  assert.equal(typeof row.viewpoint, "string");
  assert.equal(typeof row.title, "string");
  assert.equal(typeof row.body, "string");
  assert.ok([...row.title].length >= 20, `title too short in ${row.id}`);
  const bodyLength = [...row.body].length;
  assert.ok(bodyLength >= 220 && bodyLength <= 650, `body length ${bodyLength} outside 220–650 in ${row.id}`);
  const cues = [...`${row.title} ${row.body}`.matchAll(cuePatterns[row.lang])].length;
  assert.ok(cues >= 5, `insufficient ${row.lang} language cues in ${row.id}`);
  if (row.lang !== "en") {
    assert.doesNotMatch(row.body, /\b(this is|there is|there are|we will|it was|no one was|the city|the team)\b/i,
      `English boilerplate detected in ${row.id}`);
  }
  const group = perEvent.get(row.eventKey) || [];
  group.push(row);
  perEvent.set(row.eventKey, group);
  perFamily.set(row.family, (perFamily.get(row.family) || 0) + 1);
  const roles = familyRoleLanguages.get(row.family) || new Map();
  const roleLanguages = roles.get(row.viewpoint) || new Set();
  roleLanguages.add(row.lang);
  roles.set(row.viewpoint, roleLanguages);
  familyRoleLanguages.set(row.family, roles);
}

assert.deepEqual([...perFamily.entries()].sort(), [["C301", 18], ["C302", 18]]);
assert.equal(perEvent.size, 6);
for (const [eventKey, group] of perEvent) {
  assert.equal(group.length, 6, `${eventKey} must have six reports`);
  assert.equal(new Set(group.map((row) => row.viewpoint)).size, 6, `${eventKey} must have six viewpoints`);
  const languages = group.map((row) => row.lang).sort();
  const sixthLanguage = {
    "C301-E1": "en",
    "C301-E2": "en",
    "C301-E3": "es",
    "C302-E1": "de",
    "C302-E2": "fr",
    "C302-E3": "en",
  }[eventKey];
  const expected = ["en", "nl", "de", "fr", "es", sixthLanguage].sort();
  assert.deepEqual(languages, expected, `${eventKey} has an unexpected language mix`);
  assert.equal(group.find((row) => row.id.endsWith("R6")).lang, sixthLanguage,
    `${eventKey} sixth report has an unexpected rotated language`);
}
for (const [family, roles] of familyRoleLanguages) {
  assert.equal(roles.size, 6, `${family} must contain six stakeholder viewpoints`);
  for (const [role, languages] of roles) {
    assert.ok(languages.size >= 2, `${family} viewpoint “${role}” is fixed to one language`);
  }
}

console.log(`C3 integrity OK: ${rows.length} rows; sha256 ${actualHash}`);
