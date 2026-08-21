import assert from "node:assert/strict";
import test from "node:test";
import { renderAnalysis, verdictFor } from "../src/presentation.js";
import type { FoistAnalysis } from "../src/types.js";

const base: FoistAnalysis = {
  aiLikelihoodPercent: 10,
  confidence: "medium",
  likelyPrompt: "Write a concise project update.",
  signals: ["Balanced three-part structure"],
  caveat: "Style evidence is limited.",
};

test("uses the expected playful verdict bands", () => {
  assert.match(verdictFor(19), /NO FOIST/);
  assert.match(verdictFor(20), /SLIGHTLY AI/);
  assert.match(verdictFor(50), /FOISTY BUSINESS/);
  assert.match(verdictFor(75), /YOU GOT FOISTED/);
  assert.match(verdictFor(70, 70), /YOU GOT FOISTED/);
});

test("only offers a Foist-back action for high scores", () => {
  const low = renderAnalysis(base, null);
  const high = renderAnalysis({ ...base, aiLikelihoodPercent: 88 }, "pending-id");

  assert.equal(low.blocks.some((block) => block.type === "actions"), false);
  assert.equal(high.blocks.some((block) => block.type === "actions"), true);
  assert.match(high.text, /88%/);
});

test("uses the configured Foisted threshold for actions", () => {
  const view = renderAnalysis({ ...base, aiLikelihoodPercent: 70 }, "pending-id", false, 70);
  assert.equal(view.blocks.some((block) => block.type === "actions"), true);
});

test("shows second-pass provenance without presenting the score as proof", () => {
  const view = renderAnalysis(
    {
      ...base,
      aiLikelihoodPercent: 72,
      assessmentTrace: {
        reviewStatus: "completed",
        primaryModel: "gpt-5.6-terra",
        finalModel: "gpt-5.6-sol",
        primaryAiLikelihoodPercent: 63,
      },
    },
    null,
  );
  assert.match(JSON.stringify(view.blocks), /Double-checked by gpt-5\.6-sol/);
  assert.match(JSON.stringify(view.blocks), /First pass: 63%; final: 72%/);
});

test("escapes Slack mentions supplied by model output", () => {
  const view = renderAnalysis(
    { ...base, likelyPrompt: "Ping <@U123> & demand > results" },
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
