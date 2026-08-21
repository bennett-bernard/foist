import assert from "node:assert/strict";
import test from "node:test";
import { loadAssessmentConfig } from "../src/config.js";

test("uses the Terra to Sol cascade defaults", () => {
  const config = loadAssessmentConfig({ OPENAI_API_KEY: "test-key" });

  assert.deepEqual(config.routing, {
    primaryModel: "gpt-5.6-terra",
    primaryReasoningEffort: "medium",
    adjudicatorModel: "gpt-5.6-sol",
    adjudicatorReasoningEffort: "medium",
    draftModel: "gpt-5.6-terra",
    adjudicationEnabled: true,
    adjudicationMinPercent: 30,
    adjudicationMaxPercent: 85,
    foistedThreshold: 75,
  });
});

test("keeps the legacy model variable as a primary-model fallback", () => {
  const config = loadAssessmentConfig({
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "legacy-model",
    FOIST_ADJUDICATION_ENABLED: "false",
  });

  assert.equal(config.routing.primaryModel, "legacy-model");
  assert.equal(config.routing.draftModel, "legacy-model");
  assert.equal(config.routing.adjudicationEnabled, false);
});

test("rejects an inverted adjudication range", () => {
  assert.throws(() =>
    loadAssessmentConfig({
      OPENAI_API_KEY: "test-key",
      FOIST_ADJUDICATION_MIN_PERCENT: "90",
      FOIST_ADJUDICATION_MAX_PERCENT: "40",
    }),
  );
});
