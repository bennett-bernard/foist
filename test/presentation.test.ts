import assert from "node:assert/strict";
import test from "node:test";
import {
  assessmentGifFor,
  levelFor,
  renderAnalysis,
  stoplightFor,
  verdictFor,
} from "../src/presentation.js";
import type { FoistAnalysis } from "../src/types.js";

const base: FoistAnalysis = {
  aiLikelihoodPercent: 10,
  confidence: "medium",
  likelyPrompt: "Write a concise project update.",
  signals: ["Balanced three-part structure"],
  caveat: "Style evidence is limited.",
};

test("uses the expected playful verdict bands", () => {
  assert.match(verdictFor(14), /NO FOIST/);
  assert.match(verdictFor(15), /SLIGHTLY AI/);
  assert.match(verdictFor(35), /FOISTY BUSINESS/);
  assert.match(verdictFor(65), /YOU GOT FOISTED/);
  assert.match(verdictFor(60, 60), /YOU GOT FOISTED/);
});

test("maps private scores to public reading levels", () => {
  assert.equal(levelFor(34), "LOW");
  assert.equal(levelFor(35), "MEDIUM");
  assert.equal(levelFor(64), "MEDIUM");
  assert.equal(levelFor(65), "HIGH");
});

test("renders each reading as a horizontal stoplight", () => {
  assert.equal(stoplightFor("LOW"), "🟢 ⚫ ⚫");
  assert.equal(stoplightFor("MEDIUM"), "⚫ 🟡 ⚫");
  assert.equal(stoplightFor("HIGH"), "⚫ ⚫ 🔴");
});

test("randomly selects between the two assessment GIFs", () => {
  assert.equal(
    assessmentGifFor(0.49),
    "https://y.yarn.co/4291bbbf-ae6d-452c-bcda-3d4c0d8dcdf8_text.gif",
  );
  assert.equal(
    assessmentGifFor(0.5),
    "https://y.yarn.co/40d77296-4930-4aa5-ab3a-92b980eca4bf_text.gif",
  );
});

test("only includes a reaction GIF for HIGH assessments", () => {
  const low = renderAnalysis(base, null);
  const medium = renderAnalysis({ ...base, aiLikelihoodPercent: 50 }, null);
  const high = renderAnalysis({ ...base, aiLikelihoodPercent: 88 }, "pending-id");
  const highImageBlocks = high.blocks.filter((block) => block.type === "image");

  assert.equal(low.blocks.some((block) => block.type === "image"), false);
  assert.equal(medium.blocks.some((block) => block.type === "image"), false);
  assert.equal(highImageBlocks.length, 1);
  assert.match(JSON.stringify(highImageBlocks), /y\.yarn\.co/);
  assert.equal(high.blocks[1]?.type, "image");
});

test("keeps model confidence internal", () => {
  const view = renderAnalysis({ ...base, confidence: "high" }, null);

  assert.doesNotMatch(JSON.stringify(view), /confidence/i);
});

test("only offers a Foist-back action for high scores", () => {
  const low = renderAnalysis(base, null);
  const high = renderAnalysis({ ...base, aiLikelihoodPercent: 88 }, "pending-id");

  assert.equal(low.blocks.some((block) => block.type === "actions"), false);
  assert.equal(high.blocks.some((block) => block.type === "actions"), true);
  assert.match(JSON.stringify(low), /🟢 ⚫ ⚫/);
  assert.match(JSON.stringify(high), /⚫ ⚫ 🔴/);
  assert.match(high.text, /HIGH/);
  assert.doesNotMatch(JSON.stringify(high), /88%|▓|░/);
});

test("only reveals the likely prompt for HIGH readings", () => {
  const low = renderAnalysis(base, null);
  const medium = renderAnalysis({ ...base, aiLikelihoodPercent: 50 }, null);
  const high = renderAnalysis({ ...base, aiLikelihoodPercent: 88 }, "pending-id");

  assert.doesNotMatch(JSON.stringify(low), /Likely prompt behind it/);
  assert.doesNotMatch(JSON.stringify(medium), /Likely prompt behind it/);
  assert.match(JSON.stringify(high), /Likely prompt behind it/);
});

test("uses the configured Foisted threshold for actions", () => {
  const view = renderAnalysis({ ...base, aiLikelihoodPercent: 60 }, "pending-id", false, 60);
  assert.equal(view.blocks.some((block) => block.type === "actions"), true);
});


test("escapes Slack mentions supplied by model output", () => {
  const view = renderAnalysis(
    { ...base, aiLikelihoodPercent: 88, likelyPrompt: "Ping <@U123> & demand > results" },
    null,
  );
  assert.doesNotMatch(JSON.stringify(view.blocks), /<@U123>/);
  assert.match(JSON.stringify(view.blocks), /&lt;@U123&gt;/);
});

test("keeps generated drafts from triggering Slack mentions", async () => {
  const { renderDraft } = await import("../src/presentation.js");
  const view = renderDraft("Thanks <@U123> — not noise, but signal.");
  assert.doesNotMatch(JSON.stringify(view), /<@U123>/);
  assert.match(JSON.stringify(view), /&lt;@U123&gt;/);
});
