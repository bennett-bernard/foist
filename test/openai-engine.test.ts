import assert from "node:assert/strict";
import test from "node:test";
import type OpenAI from "openai";
import type { AssessmentRoutingConfig } from "../src/config.js";
import { OpenAiFoistEngine, shouldAdjudicate } from "../src/openai-engine.js";
import type { FoistAnalysis } from "../src/types.js";

const routing: AssessmentRoutingConfig = {
  primaryModel: "gpt-5.6-terra",
  primaryReasoningEffort: "medium",
  adjudicatorModel: "gpt-5.6-sol",
  adjudicatorReasoningEffort: "medium",
  draftModel: "gpt-5.6-terra",
  adjudicationEnabled: true,
  adjudicationMinPercent: 30,
  adjudicationMaxPercent: 85,
  foistedThreshold: 65,
};

function payload(score: number, confidence: FoistAnalysis["confidence"]) {
  return JSON.stringify({
    ai_likelihood_percent: score,
    confidence,
    likely_prompt: "Write a concise project update.",
    signals: ["Uniform sentence rhythm"],
    caveat: "Style cannot prove authorship.",
  });
}

function fakeClient(outputs: Array<string | Error>, calls: unknown[]): OpenAI {
  return {
    responses: {
      create: async (request: unknown) => {
        calls.push(request);
        const output = outputs.shift();
        if (output instanceof Error) throw output;
        if (output === undefined) throw new Error("Missing fake response");
        return { output_text: output };
      },
    },
  } as unknown as OpenAI;
}

test("routes ambiguous primary results to the adjudicator", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const engine = new OpenAiFoistEngine({
    apiKey: "test",
    routing,
    client: fakeClient([payload(60, "medium"), payload(82, "high")], calls),
  });

  const result = await engine.analyze("A sufficiently long message for a model assessment.", "safe");

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.model, "gpt-5.6-terra");
  assert.equal(calls[1]?.model, "gpt-5.6-sol");
  assert.deepEqual(calls[0]?.reasoning, { effort: "medium" });
  assert.deepEqual(calls[1]?.reasoning, { effort: "medium" });
  assert.equal(calls[1]?.max_output_tokens, 3_000);
  assert.match(String(calls[0]?.instructions), /Use balanced sensitivity/);
  assert.match(String(calls[0]?.instructions), /65–84: strong, interacting AI-style signals/);
  assert.match(String(calls[1]?.instructions), /Check missed AI patterns as carefully as overcalling/);
  assert.equal(result.aiLikelihoodPercent, 82);
  assert.deepEqual(result.assessmentTrace, {
    reviewStatus: "completed",
    primaryModel: "gpt-5.6-terra",
    finalModel: "gpt-5.6-sol",
    primaryAiLikelihoodPercent: 60,
  });
});

test("retries malformed structured adjudication output", async () => {
  const calls: unknown[] = [];
  const errors: unknown[] = [];
  const engine = new OpenAiFoistEngine({
    apiKey: "test",
    routing,
    client: fakeClient(
      [payload(60, "medium"), "{\"ai_likelihood_percent\":", payload(82, "high")],
      calls,
    ),
    onAdjudicationError: (error) => errors.push(error),
  });

  const result = await engine.analyze("A sufficiently long message for a model assessment.", "safe");

  assert.equal(calls.length, 3);
  assert.equal(errors.length, 0);
  assert.equal(result.aiLikelihoodPercent, 82);
  assert.equal(result.assessmentTrace?.reviewStatus, "completed");
});

test("skips adjudication for confident scores outside the review band", async () => {
  const calls: unknown[] = [];
  const engine = new OpenAiFoistEngine({
    apiKey: "test",
    routing,
    client: fakeClient([payload(10, "high")], calls),
  });

  const result = await engine.analyze("A sufficiently long message for a model assessment.", "safe");

  assert.equal(calls.length, 1);
  assert.equal(result.assessmentTrace?.reviewStatus, "not_needed");
  assert.equal(result.assessmentTrace?.finalModel, "gpt-5.6-terra");
});

test("low confidence always requests adjudication", () => {
  const analysis: FoistAnalysis = {
    aiLikelihoodPercent: 95,
    confidence: "low",
    likelyPrompt: "Write an update.",
    signals: [],
    caveat: "The message is short.",
  };

  assert.equal(shouldAdjudicate(analysis, routing), true);
  assert.equal(shouldAdjudicate(analysis, { ...routing, adjudicationEnabled: false }), false);
  assert.equal(
    shouldAdjudicate({ ...analysis, confidence: "high", aiLikelihoodPercent: 30 }, routing),
    true,
  );
  assert.equal(
    shouldAdjudicate({ ...analysis, confidence: "high", aiLikelihoodPercent: 85 }, routing),
    true,
  );
  assert.equal(
    shouldAdjudicate({ ...analysis, confidence: "high", aiLikelihoodPercent: 86 }, routing),
    false,
  );
});

test("falls back to the primary result when adjudication fails", async () => {
  const calls: unknown[] = [];
  const errors: unknown[] = [];
  const engine = new OpenAiFoistEngine({
    apiKey: "test",
    routing,
    client: fakeClient([payload(55, "medium"), new Error("temporary failure")], calls),
    onAdjudicationError: (error) => errors.push(error),
  });

  const result = await engine.analyze("A sufficiently long message for a model assessment.", "safe");

  assert.equal(calls.length, 2);
  assert.equal(errors.length, 1);
  assert.equal(result.aiLikelihoodPercent, 55);
  assert.equal(result.assessmentTrace?.reviewStatus, "failed");
  assert.equal(result.assessmentTrace?.finalModel, "gpt-5.6-terra");
});
