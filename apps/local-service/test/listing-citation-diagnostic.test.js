import assert from "node:assert/strict";
import test from "node:test";
import { listingCitationCounts, listingCitationFixture, runListingCitationDiagnostic } from
  "../harness/run-listing-citation-diagnostic.js";
import { inspectPageUrl } from "../../../spikes/topic-resolution/browser/core/page-content-policy.js";

test("listing diagnostic uses fixed public context and no stored comment or related pages", () => {
  const fixture = listingCitationFixture();
  assert.equal(inspectPageUrl(fixture.context.currentSource.url).supported, true);
  assert.deepEqual(fixture.context.sameTopicSources, []);
  assert.deepEqual(fixture.context.relatedSources, []);
  assert.match(fixture.articleText, /synthetic diagnostic/u);
  assert.match(fixture.followup.questionBody, /Germany/u);
  assert.match(fixture.followup.questionBody, /actual listings/u);
  assert.equal(fixture.allowWebResearch, true);
});

test("listing stream diagnostics print only bounded counts, never content or URLs", () => {
  const frame = (type, fields) => `event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`;
  const raw = frame("response.output_text.done", { text: "Private text \uE200cite\uE202turn0search0\uE201" }) +
    frame("response.output_text.annotation.added", { annotation: {
      type: "url_citation", url: "https://private.example.org/", title: "Private title" } });
  assert.deepEqual(listingCitationCounts(raw), { nativeMarkers: 1, annotationEvents: 1 });
  assert.deepEqual(listingCitationCounts("invalid"), { nativeMarkers: 0, annotationEvents: 0 });
  assert.deepEqual(listingCitationCounts("x".repeat(262_145)), { nativeMarkers: 0, annotationEvents: 0 });
  assert.equal(listingCitationCounts(raw.repeat(150)).nativeMarkers, 101);
});

test("listing diagnostic cannot restore login or dispatch without its explicit switch", async () => {
  for (const args of [[], ["--run-live", "--show-result"], ["--run-live", "--run-live"]])
    await assert.rejects(() => runListingCitationDiagnostic(args, {
      fetchImpl: () => assert.fail("No provider access expected"), print: () => assert.fail("No output expected") }),
    /Explicit --run-live/u);
});
