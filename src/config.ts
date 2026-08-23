import { resolve } from "node:path";
import { z } from "zod";

export const aiProviderNames = [
  "openai",
  "anthropic",
  "grok",
  "gemini",
  "openai-compatible",
] as const;
export type AiProviderName = (typeof aiProviderNames)[number];

export const grokReasoningEfforts = ["low", "medium", "high", "xhigh"] as const;
export type GrokReasoningEffort = (typeof grokReasoningEfforts)[number];

const configuredProviderNames = [...aiProviderNames, "xai"] as const;

const rawAiEnvironmentSchema = z.object({
  AI_PROVIDER: z.enum(configuredProviderNames).default("openai"),

  // Legacy generic variables. Explicit provider variables take precedence.
  AI_API_KEY: z.string().min(1).optional(),
  AI_MODEL: z.string().min(1).optional(),
  AI_BASE_URL: z.string().url().optional(),

  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).optional(),
  OPENAI_PRIMARY_MODEL: z.string().min(1).optional(),

  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).optional(),

  GROK_API_KEY: z.string().min(1).optional(),
  GROK_MODEL: z.string().min(1).optional(),
  GROK_REASONING_EFFORT: z.enum(grokReasoningEfforts).default("low"),
  XAI_API_KEY: z.string().min(1).optional(),
  XAI_MODEL: z.string().min(1).optional(),

  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),

  COMPATIBLE_API_KEY: z.string().min(1).optional(),
  COMPATIBLE_MODEL: z.string().min(1).optional(),
  COMPATIBLE_BASE_URL: z.string().url().optional(),

  FOIST_FOISTED_THRESHOLD: z.coerce.number().int().min(60).max(95).default(65),
});

type RawAiEnvironment = z.infer<typeof rawAiEnvironmentSchema>;

function normalizeProvider(provider: RawAiEnvironment["AI_PROVIDER"]): AiProviderName {
  return provider === "xai" ? "grok" : provider;
}

function providerApiKey(value: RawAiEnvironment): string | undefined {
  switch (normalizeProvider(value.AI_PROVIDER)) {
    case "openai":
      return value.OPENAI_API_KEY ?? value.AI_API_KEY;
    case "anthropic":
      return value.ANTHROPIC_API_KEY ?? value.AI_API_KEY;
    case "grok":
      return value.GROK_API_KEY ?? value.XAI_API_KEY ?? value.AI_API_KEY;
    case "gemini":
      return value.GEMINI_API_KEY ?? value.AI_API_KEY;
    case "openai-compatible":
      return value.COMPATIBLE_API_KEY ?? value.AI_API_KEY;
  }
}

function providerModel(value: RawAiEnvironment): string | undefined {
  switch (normalizeProvider(value.AI_PROVIDER)) {
    case "openai":
      return (
        value.OPENAI_MODEL ??
        value.OPENAI_PRIMARY_MODEL ??
        value.AI_MODEL ??
        "gpt-5.6-terra"
      );
    case "anthropic":
      return value.ANTHROPIC_MODEL ?? value.AI_MODEL;
    case "grok":
      return value.GROK_MODEL ?? value.XAI_MODEL ?? value.AI_MODEL;
    case "gemini":
      return value.GEMINI_MODEL ?? value.AI_MODEL;
    case "openai-compatible":
      return value.COMPATIBLE_MODEL ?? value.AI_MODEL;
  }
}

function providerBaseUrl(value: RawAiEnvironment): string | undefined {
  const provider = normalizeProvider(value.AI_PROVIDER);
  if (provider === "grok") return value.AI_BASE_URL ?? "https://api.x.ai/v1";
  if (provider === "openai-compatible") {
    return value.COMPATIBLE_BASE_URL ?? value.AI_BASE_URL;
  }
  if (provider === "openai" || provider === "anthropic") return value.AI_BASE_URL;
  return undefined;
}

const keyVariableByProvider: Record<AiProviderName, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  grok: "GROK_API_KEY",
  gemini: "GEMINI_API_KEY",
  "openai-compatible": "COMPATIBLE_API_KEY",
};

const modelVariableByProvider: Record<AiProviderName, string> = {
  openai: "OPENAI_MODEL",
  anthropic: "ANTHROPIC_MODEL",
  grok: "GROK_MODEL",
  gemini: "GEMINI_MODEL",
  "openai-compatible": "COMPATIBLE_MODEL",
};

const aiEnvironmentSchema = rawAiEnvironmentSchema.superRefine((value, context) => {
  const provider = normalizeProvider(value.AI_PROVIDER);

  if (!providerApiKey(value)) {
    context.addIssue({
      code: "custom",
      path: [keyVariableByProvider[provider]],
      message: "is required for provider " + provider,
    });
  }

  if (!providerModel(value)) {
    context.addIssue({
      code: "custom",
      path: [modelVariableByProvider[provider]],
      message: "is required for provider " + provider,
    });
  }

  if (provider === "openai-compatible" && !providerBaseUrl(value)) {
    context.addIssue({
      code: "custom",
      path: ["COMPATIBLE_BASE_URL"],
      message: "is required for the openai-compatible provider",
    });
  }
});

const runtimeEnvironmentSchema = z.object({
  FOIST_PENDING_TTL_MINUTES: z.coerce.number().positive().max(24 * 60).default(60),
  FOIST_DATA_PATH: z.string().min(1).default(".data/pending.json"),
  FOIST_SAFETY_SALT: z.string().default("foist-local-development"),
});

const selfHostedSlackEnvironmentSchema = z.object({
  SLACK_BOT_TOKEN: z.string().startsWith("xoxb-"),
  SLACK_APP_TOKEN: z.string().startsWith("xapp-"),
});

export interface AiConfig {
  provider: AiProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
  reasoningEffort?: GrokReasoningEffort;
  foistedThreshold: number;
}

export interface FoistRuntimeConfig {
  ai: AiConfig;
  pendingTtlMs: number;
  dataPath: string;
  safetySalt: string;
}

export interface SelfHostedConfig extends FoistRuntimeConfig {
  slackBotToken: string;
  slackAppToken: string;
}

/** Backward-compatible name for integrations that imported the original config type. */
export type FoistConfig = SelfHostedConfig;

export function loadAiConfig(environment: NodeJS.ProcessEnv = process.env): AiConfig {
  const parsed = aiEnvironmentSchema.parse(environment);
  const provider = normalizeProvider(parsed.AI_PROVIDER);
  const apiKey = providerApiKey(parsed);
  const model = providerModel(parsed);
  const baseUrl = providerBaseUrl(parsed);

  if (!apiKey || !model) {
    throw new Error("AI provider validation unexpectedly failed");
  }

  return {
    provider,
    apiKey,
    model,
    ...(baseUrl ? { baseUrl } : {}),
    ...(provider === "grok" ? { reasoningEffort: parsed.GROK_REASONING_EFFORT } : {}),
    foistedThreshold: parsed.FOIST_FOISTED_THRESHOLD,
  };
}

function loadRuntimeConfig(environment: NodeJS.ProcessEnv): FoistRuntimeConfig {
  const runtime = runtimeEnvironmentSchema.parse(environment);

  return {
    ai: loadAiConfig(environment),
    pendingTtlMs: runtime.FOIST_PENDING_TTL_MINUTES * 60_000,
    dataPath: resolve(runtime.FOIST_DATA_PATH),
    safetySalt: runtime.FOIST_SAFETY_SALT,
  };
}

export function loadSelfHostedConfig(
  environment: NodeJS.ProcessEnv = process.env,
): SelfHostedConfig {
  const slack = selfHostedSlackEnvironmentSchema.parse(environment);
  return {
    ...loadRuntimeConfig(environment),
    slackBotToken: slack.SLACK_BOT_TOKEN,
    slackAppToken: slack.SLACK_APP_TOKEN,
  };
}

/** Backward-compatible loader for the original Socket Mode entry point. */
export const loadConfig = loadSelfHostedConfig;
