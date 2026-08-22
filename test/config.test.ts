import assert from "node:assert/strict";
import test from "node:test";
import {
  loadAssessmentConfig,
  loadHostedConfig,
  loadSelfHostedConfig,
} from "../src/config.js";

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
    foistedThreshold: 65,
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

test("loads Socket Mode credentials separately from shared runtime config", () => {
  const config = loadSelfHostedConfig({
    OPENAI_API_KEY: "test-key",
    SLACK_BOT_TOKEN: "xoxb-test",
    SLACK_APP_TOKEN: "xapp-test",
    FOIST_PENDING_TTL_MINUTES: "15",
  });

  assert.equal(config.slackBotToken, "xoxb-test");
  assert.equal(config.slackAppToken, "xapp-test");
  assert.equal(config.pendingTtlMs, 15 * 60_000);
});

test("loads the hosted HTTP port and signing secret", () => {
  const config = loadHostedConfig({
    OPENAI_API_KEY: "test-key",
    SLACK_BOT_TOKEN: "xoxb-test",
    SLACK_SIGNING_SECRET: "signing-secret",
  });

  assert.equal(config.slackBotToken, "xoxb-test");
  assert.equal(config.slackSigningSecret, "signing-secret");
  assert.equal(config.port, 3000);
});

test("rejects an invalid hosted HTTP port", () => {
  assert.throws(() =>
    loadHostedConfig({
      OPENAI_API_KEY: "test-key",
      SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_SIGNING_SECRET: "signing-secret",
      PORT: "70000",
    }),
  );
});
