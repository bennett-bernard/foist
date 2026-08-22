import { resolve } from "node:path";
import { z } from "zod";

export const aiProviderNames = ["openai", "anthropic", "xai", "openai-compatible"] as const;
export type AiProviderName = (typeof aiProviderNames)[number];

const aiEnvironmentSchema = z
  .object({
    AI_PROVIDER: z.enum(aiProviderNames).default("openai"),
    AI_API_KEY: z.string().min(1).optional(),
    AI_MODEL: z.string().min(1).optional(),
    AI_BASE_URL: z.string().url().optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
    ANTHROPIC_API_KEY: z.string().min(1).optional(),
    XAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().min(1).optional(),
    OPENAI_PRIMARY_MODEL: z.string().min(1).optional(),
    FOIST_FOISTED_THRESHOLD: z.coerce.number().int().min(60).max(95).default(65),
  })
  .superRefine((value, context) => {
    const providerKey =
      value.AI_API_KEY ??
      (value.AI_PROVIDER === "openai"
        ? value.OPENAI_API_KEY
        : value.AI_PROVIDER === "anthropic"
          ? value.ANTHROPIC_API_KEY
          : value.AI_PROVIDER === "xai"
            ? value.XAI_API_KEY
            : undefined);

    if (!providerKey) {
      context.addIssue({
        code: "custom",
        path: ["AI_API_KEY"],
        message: `is required for provider ${value.AI_PROVIDER}`,
      });
    }

    if (value.AI_PROVIDER !== "openai" && !value.AI_MODEL) {
      context.addIssue({
        code: "custom",
        path: ["AI_MODEL"],
        message: `is required for provider ${value.AI_PROVIDER}`,
      });
    }

    if (value.AI_PROVIDER === "openai-compatible" && !value.AI_BASE_URL) {
      context.addIssue({
        code: "custom",
        path: ["AI_BASE_URL"],
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

const hostedSlackEnvironmentSchema = z.object({
  SLACK_BOT_TOKEN: z.string().startsWith("xoxb-"),
  SLACK_SIGNING_SECRET: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export interface AiConfig {
  provider: AiProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
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

export interface HostedConfig extends FoistRuntimeConfig {
  slackBotToken: string;
  slackSigningSecret: string;
  port: number;
}

/** Backward-compatible name for integrations that imported the original config type. */
export type FoistConfig = SelfHostedConfig;

export function loadAiConfig(environment: NodeJS.ProcessEnv = process.env): AiConfig {
  const parsed = aiEnvironmentSchema.parse(environment);
  const apiKey =
    parsed.AI_API_KEY ??
    (parsed.AI_PROVIDER === "openai"
      ? parsed.OPENAI_API_KEY
      : parsed.AI_PROVIDER === "anthropic"
        ? parsed.ANTHROPIC_API_KEY
        : parsed.AI_PROVIDER === "xai"
          ? parsed.XAI_API_KEY
          : undefined);

  if (!apiKey) throw new Error("AI provider key validation unexpectedly failed");

  const model =
    parsed.AI_MODEL ??
    parsed.OPENAI_MODEL ??
    parsed.OPENAI_PRIMARY_MODEL ??
    "gpt-5.6-terra";

  const baseUrl =
    parsed.AI_BASE_URL ??
    (parsed.AI_PROVIDER === "xai" ? "https://api.x.ai/v1" : undefined);

  return {
    provider: parsed.AI_PROVIDER,
    apiKey,
    model,
    ...(baseUrl ? { baseUrl } : {}),
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

export function loadHostedConfig(environment: NodeJS.ProcessEnv = process.env): HostedConfig {
  const slack = hostedSlackEnvironmentSchema.parse(environment);
  return {
    ...loadRuntimeConfig(environment),
    slackBotToken: slack.SLACK_BOT_TOKEN,
    slackSigningSecret: slack.SLACK_SIGNING_SECRET,
    port: slack.PORT,
  };
}

/** Backward-compatible loader for the original Socket Mode entry point. */
export const loadConfig = loadSelfHostedConfig;
