import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluationCaseSchema,
  summarizeEvaluation,
  type EvaluationRun,
} from "../src/evaluation.js";

function run(caseId: string, label: "human" | "ai" | "mixed", score: number): EvaluationRun {
  return {
    configuration: "test:model",
    caseId,
    label,
    score,
    confidence: "medium",
    latencyMs: 100,
    error: null,
  };
}

test("computes threshold and calibration metrics from per-case scores", () => {
  const metrics = summarizeEvaluation(
    "test:model",
    [
      run("human-low", "human", 10),
      run("human-high", "human", 80),
      run("ai-high", "ai", 90),
      run("ai-low", "ai", 40),
    ],
    75,
  );

  assert.equal(metrics.precision, 0.5);
  assert.equal(metrics.recall, 0.5);
  assert.equal(metrics.falsePositiveRate, 0.5);
  assert.equal(metrics.accuracy, 0.5);
  assert.equal(metrics.averageLatencyMs, 100);
  assert.equal(metrics.thresholdSuggestion?.metTargetPrecision, true);
});

test("aggregates repeated runs before evaluating a case", () => {
  const metrics = summarizeEvaluation(
    "test:model",
    [
      run("human", "human", 10),
      run("human", "human", 20),
      run("ai", "ai", 80),
      run("ai", "ai", 100),
    ],
    75,
  );

  assert.equal(metrics.evaluatedCases, 2);
  assert.equal(metrics.meanHumanScore, 15);
  assert.equal(metrics.meanAiScore, 90);
  assert.equal(metrics.meanScoreStandardDeviation, 7.5);
});

test("requires matching controlled provenance and consent", () => {
  const base = {
    id: "sample",
    label: "human" as const,
    text: "This is a known-provenance sample long enough for evaluation.",
    provenance: "controlled_human" as const,
    consent_confirmed: true,
  };

  assert.equal(evaluationCaseSchema.safeParse(base).success, true);
  assert.equal(
    evaluationCaseSchema.safeParse({ ...base, provenance: "controlled_ai" }).success,
    false,
  );
  assert.equal(evaluationCaseSchema.safeParse({ ...base, consent_confirmed: false }).success, false);
  assert.equal(
    evaluationCaseSchema.safeParse({ ...base, consent_confirmed: false, enabled: false }).success,
    true,
  );
});
