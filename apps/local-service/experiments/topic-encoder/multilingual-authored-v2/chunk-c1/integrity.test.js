import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const bytes = fs.readFileSync(path.join(directory, "records.jsonl"));
const expectedSha256 = "20bab9b116c6f32c2fb7058c3d822af333503ec36cbcf9cbb7365e9f45bac581";
const expectedKeys = ["body", "eventKey", "family", "id", "lang", "title", "viewpoint"];
const languages = ["en", "nl", "de", "fr", "es"];
const viewpoints = [
  "resident_member", "library_coordinator", "older_borrower", "repair_volunteer",
  "nearby_shopkeeper", "accessibility_observer", "shift_worker", "volunteer_roster",
  "commuter_member", "project_accountant", "caregiver_member", "accessibility_advocate",
  "local_reporter", "member_borrower", "neighborhood_volunteer", "skeptical_observer",
  "new_member", "patient_rider", "dispatch_volunteer", "clinic_receptionist", "caregiver",
  "transport_organizer", "rural_access_advocate", "market_vendor", "minibus_driver",
  "older_passenger", "market_organizer", "budget_observer", "transport_coordinator",
];

assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), expectedSha256);
const rows = bytes.toString("utf8").trimEnd().split(/\r?\n/).map((line) => JSON.parse(line));
assert.equal(rows.length, 36);
const ids = new Set();
for (const row of rows) {
  assert.deepEqual(Object.keys(row).sort(), expectedKeys);
  assert.ok(["C101", "C102"].includes(row.family));
  assert.match(row.eventKey, new RegExp(`^${row.family}-E[123]$`));
  assert.ok(languages.includes(row.lang));
  assert.ok(viewpoints.includes(row.viewpoint));
  assert.ok(row.title.length >= 20, `${row.id}: title too short`);
  assert.ok(row.body.length >= 220 && row.body.length <= 650, `${row.id}: body length out of range`);
  assert.ok(!ids.has(row.id), `duplicate id ${row.id}`);
  ids.add(row.id);
}

const englishLeakCues = /\b(?:the|and|with|from|still|remains|opened|began|continues|while|during|because|people|reported|announced|Tuesday|Monday|Thursday|Saturday|Wednesday)\b/i;
for (const row of rows.filter((candidate) => candidate.lang !== "en")) {
  assert.doesNotMatch(row.body, englishLeakCues, `${row.id}: possible English leakage`);
}

const repeatLanguages = ["en", "nl", "de", "fr", "es", "en"];
const eventKeysInOrder = ["C101-E1", "C101-E2", "C101-E3", "C102-E1", "C102-E2", "C102-E3"];
for (const [eventIndex, key] of eventKeysInOrder.entries()) {
    const eventRows = rows.filter((row) => row.eventKey === key);
    assert.equal(eventRows.length, 6, `${key}: record count`);
    assert.equal(new Set(eventRows.map((row) => row.viewpoint)).size, 6, `${key}: viewpoints`);
    const counts = Object.fromEntries(languages.map((lang) => [
      lang, eventRows.filter((row) => row.lang === lang).length,
    ]));
    assert.deepEqual(Object.values(counts).sort(), [1, 1, 1, 1, 2], `${key}: language counts`);
    const repeated = Object.keys(counts).find((lang) => counts[lang] === 2);
    assert.equal(repeated, repeatLanguages[eventIndex], `${key}: rotation`);
}

process.stdout.write(`chunk C1 integrity OK: ${rows.length} records, 6 events, SHA-256 ${expectedSha256}\n`);
