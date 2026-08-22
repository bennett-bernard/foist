import assert from "node:assert/strict";
import test from "node:test";
import {
  loadAiConfig,
  loadHostedConfig,
  loadSelfHostedConfig,
} from "../src/config.js";

test("defaults to OpenAI with its explicit key and default model", () => {
  const config = loadAiConfig({ OPENAI_API_KEY: "openai-key" });

  assert.deepEqual(config, {
    provider: "openai",
    apiKey: "openai-key",
    model: "gpt-5.6-terra",
    foistedThreshold: 65,
  });
});

test("loads explicit Anthropic credentials and model", () => {
  const config = loadAiConfig({
    AI_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: "anthropic-key",
    ANTHROPIC_MODEL: "claude-test",
    AI_API_KEY: "legacy-generic-key",
    AI_MODEL: "legacy-generic-model",
  });

  assert.equal(config.provider, "anthropic");
  assert.equal(config.apiKey, "anthropic-key");
  assert.equal(config.model, "claude-test");
});

test("loads explicit Grok credentials and the automatic xAI base URL", () => {
  const config = loadAiConfig({
    AI_PROVIDER: "grok",
    GROK_API_KEY: "grok-key",
    GROK_MODEL: "grok-test",
    GROK_REASONING_EFFORT: "medium",
  });

  assert.equal(config.provider, "grok");
  assert.equal(config.apiKey, "grok-key");
  assert.equal(config.model, "grok-test");
  assert.equal(config.reasoningEffort, "medium");
  assert.equal(config.baseUrl, "https://api.x.ai/v1");
});

test("normalizes the legacy xai provider and variables to Grok", () => {
  const config = loadAiConfig({
    AI_PROVIDER: "xai",
    XAI_API_KEY: "xai-key",
    XAI_MODEL: "legacy-grok-model",
  });

  assert.equal(config.provider, "grok");
  assert.equal(config.apiKey, "xai-key");
  assert.equal(config.model, "legacy-grok-model");
  assert.equal(config.reasoningEffort, "low");
});

test("loads explicit Gemini credentials and model", () => {
  const config = loadAiConfig({
    AI_PROVIDER: "gemini",
    GEMINI_API_KEY: "gemini-key",
    GEMINI_MODEL: "gemini-test",
  });

  assert.deepEqual(config, {
    provider: "gemini",
    apiKey: "gemini-key",
    model: "gemini-test",
    foistedThreshold: 65,
  });
});

test("retains generic variables as migration fallbacks", () => {
  const config = loadAiConfig({
    AI_PROVIDER: "anthropic",
    AI_API_KEY: "legacy-key",
    AI_MODEL: "legacy-model",
  });

  assert.equal(config.apiKey, "legacy-key");
  assert.equal(config.model, "legacy-model");
});

test("keeps legacy OpenAI model variables as fallbacks", () => {
  const config = loadAiConfig({
    OPENAI_API_KEY: "openai-key",
    OPENAI_PRIMARY_MODEL: "legacy-openai-model",
  });

  assert.equal(config.model, "legacy-openai-model");
});

test("requires explicit models for non-OpenAI providers", () => {
  assert.throws(() =>
    loadAiConfig({
      AI_PROVIDER: "gemini",
      GEMINI_API_KEY: "gemini-key",
    }),
  );
});

test("requires all explicit compatible-provider variables", () => {
  assert.throws(() =>
    loadAiConfig({
      AI_PROVIDER: "openai-compatible",
      COMPATIBLE_API_KEY: "compatible-key",
      COMPATIBLE_MODEL: "compatible-model",
    }),
  );

  const config = loadAiConfig({
    AI_PROVIDER: "openai-compatible",
    COMPATIBLE_API_KEY: "compatible-key",
    COMPATIBLE_MODEL: "compatible-model",
    COMPATIBLE_BASE_URL: "https://models.example.test/v1",
  });

  assert.equal(config.apiKey, "compatible-key");
  assert.equal(config.model, "compatible-model");
  assert.equal(config.baseUrl, "https://models.example.test/v1");
});

test("loads Socket Mode credentials separately from shared runtime config", () => {
  const config = loadSelfHostedConfig({
    OPENAI_API_KEY: "openai-key",
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
    OPENAI_API_KEY: "openai-key",
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
      OPENAI_API_KEY: "openai-key",
      SLACK_BOT_TOKEN: "xoxb-test",
      SLACK_SIGNING_SECRET: "signing-secret",
      PORT: "70000",
    }),
  );
});
