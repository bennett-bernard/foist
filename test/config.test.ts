import assert from "node:assert/strict";
import test from "node:test";
import {
  loadAiConfig,
  loadHostedConfig,
  loadSelfHostedConfig,
} from "../src/config.js";

test("defaults to one OpenAI model and accepts the legacy OpenAI key", () => {
  const config = loadAiConfig({ OPENAI_API_KEY: "test-key" });

  assert.deepEqual(config, {
    provider: "openai",
    apiKey: "test-key",
    model: "gpt-5.6-terra",
    foistedThreshold: 65,
  });
});

test("loads an Anthropic model with the generic key", () => {
  const config = loadAiConfig({
    AI_PROVIDER: "anthropic",
    AI_API_KEY: "anthropic-key",
    AI_MODEL: "claude-test",
  });

  assert.equal(config.provider, "anthropic");
  assert.equal(config.apiKey, "anthropic-key");
  assert.equal(config.model, "claude-test");
});

test("accepts provider-specific xAI keys and supplies the xAI base URL", () => {
  const config = loadAiConfig({
    AI_PROVIDER: "xai",
    XAI_API_KEY: "xai-key",
    AI_MODEL: "grok-test",
  });

  assert.equal(config.apiKey, "xai-key");
  assert.equal(config.baseUrl, "https://api.x.ai/v1");
});

test("keeps legacy OpenAI model variables as fallbacks", () => {
  const config = loadAiConfig({
    OPENAI_API_KEY: "test-key",
    OPENAI_MODEL: "legacy-model",
  });

  assert.equal(config.model, "legacy-model");
});

test("requires an explicit model for non-OpenAI providers", () => {
  assert.throws(() =>
    loadAiConfig({
      AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-key",
    }),
  );
});

test("requires a base URL for generic OpenAI-compatible providers", () => {
  assert.throws(() =>
    loadAiConfig({
      AI_PROVIDER: "openai-compatible",
      AI_API_KEY: "test-key",
      AI_MODEL: "compatible-model",
    }),
  );

  const config = loadAiConfig({
    AI_PROVIDER: "openai-compatible",
    AI_API_KEY: "test-key",
    AI_MODEL: "compatible-model",
    AI_BASE_URL: "https://models.example.test/v1",
  });
  assert.equal(config.baseUrl, "https://models.example.test/v1");
});

test("loads Socket Mode credentials separately from shared runtime config", () => {
  const config = loadSelfHostedConfig({
    OPENAI_API_KEY: "test-key",
    SLACK_BOT_TOKEN: "xoxb-test",
    SLACK_APP_TOKEN: "xapp-test",
    FOIST_PENDING_TTL_MINUTES: "15",
  });

  assert.equal(config.ai.provider, "openai");
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
