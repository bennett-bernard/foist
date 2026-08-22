import assert from "node:assert/strict";
import test from "node:test";
import {
  InvalidAssessmentOutputError,
  ModelFoistEngine,
} from "../src/foist-engine.js";
import type {
  FoistModelProvider,
  StructuredGenerationRequest,
  TextGenerationRequest,
} from "../src/model-provider.js";
import type { FoistAnalysis } from "../src/types.js";

function payload(score: number, confidence: FoistAnalysis["confidence"]): string {
  return JSON.stringify({
    ai_likelihood_percent: score,
    confidence,
    likely_prompt: "Write a concise project update.",
    signals: ["Uniform sentence rhythm"],
    caveat: "Style cannot prove authorship.",
  });
}

class FakeProvider implements FoistModelProvider {
  readonly providerName = "openai" as const;
  readonly model = "test-model";
  readonly structuredCalls: StructuredGenerationRequest[] = [];
  readonly textCalls: TextGenerationRequest[] = [];

  constructor(
    private readonly structuredOutputs: Array<string | Error>,
    private readonly textOutput = "  Thanks — not noise, but signal.  ",
  ) {}

  async generateStructured(request: StructuredGenerationRequest): Promise<string> {
    this.structuredCalls.push(request);
    const output = this.structuredOutputs.shift();
    if (output instanceof Error) throw output;
    if (output === undefined) throw new Error("Missing fake structured output");
    return output;
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    this.textCalls.push(request);
    return this.textOutput;
  }
}

test("uses one configured model call for a valid assessment", async () => {
  const provider = new FakeProvider([payload(82, "high")]);
  const engine = new ModelFoistEngine({ provider, foistedThreshold: 65 });

  const result = await engine.analyze(
    "A sufficiently long message for a model assessment.",
    "safe-user",
  );

  assert.equal(provider.structuredCalls.length, 1);
  assert.equal(result.aiLikelihoodPercent, 82);
  assert.equal(provider.structuredCalls[0]?.schemaName, "foist_analysis");
  assert.equal(provider.structuredCalls[0]?.maxOutputTokens, 3_000);
  assert.equal(provider.structuredCalls[0]?.safetyIdentifier, "safe-user");
  assert.match(provider.structuredCalls[0]?.instructions ?? "", /Use balanced sensitivity/);
  assert.match(provider.structuredCalls[0]?.instructions ?? "", /65–84: strong, interacting/);
});

test("retries malformed structured output once", async () => {
  const provider = new FakeProvider([
    "{\"ai_likelihood_percent\":",
    payload(78, "medium"),
  ]);
  const engine = new ModelFoistEngine({ provider, foistedThreshold: 65 });

  const result = await engine.analyze(
    "A sufficiently long message for a model assessment.",
    "safe-user",
  );

  assert.equal(provider.structuredCalls.length, 2);
  assert.equal(result.aiLikelihoodPercent, 78);
});

test("fails after two malformed structured responses", async () => {
  const provider = new FakeProvider(["not json", "{}"]);
  const engine = new ModelFoistEngine({ provider, foistedThreshold: 65 });

  await assert.rejects(
    engine.analyze("A sufficiently long message for a model assessment.", "safe-user"),
    InvalidAssessmentOutputError,
  );
  assert.equal(provider.structuredCalls.length, 2);
});

test("does not retry provider transport failures", async () => {
  const provider = new FakeProvider([new Error("temporary provider failure")]);
  const engine = new ModelFoistEngine({ provider, foistedThreshold: 65 });

  await assert.rejects(
    engine.analyze("A sufficiently long message for a model assessment.", "safe-user"),
    /temporary provider failure/,
  );
  assert.equal(provider.structuredCalls.length, 1);
});

test("uses the same configured provider for Foist-back drafts", async () => {
  const provider = new FakeProvider([]);
  const engine = new ModelFoistEngine({ provider, foistedThreshold: 65 });

  const result = await engine.draftFoistBack(
    "Can you send the update?",
    "Write a concise update.",
    "safe-user",
  );

  assert.equal(result, "Thanks — not noise, but signal.");
  assert.equal(provider.textCalls.length, 1);
  assert.equal(provider.textCalls[0]?.maxOutputTokens, 500);
  assert.match(provider.textCalls[0]?.instructions ?? "", /deliberately over-AI reply writer/);
});
