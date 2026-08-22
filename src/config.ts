import { resolve } from "node:path";
import { z } from "zod";
import { reasoningEfforts, type ReasoningEffort } from "./types.js";

const reasoningEffortSchema = z.enum(reasoningEfforts);
const environmentBooleanSchema = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const assessmentEnvironmentSchema = z
  .object({
    OPENAI_API_KEY: z.string().min(1),
    OPENAI_MODEL: z.string().min(1).optional(),
    OPENAI_PRIMARY_MODEL: z.string().min(1).optional(),
    OPENAI_ADJUDICATOR_MODEL: z.string().min(1).default("gpt-5.6-sol"),
    OPENAI_DRAFT_MODEL: z.string().min(1).optional(),
    FOIST_PRIMARY_REASONING: reasoningEffortSchema.default("medium"),
    FOIST_ADJUDICATOR_REASONING: reasoningEffortSchema.default("medium"),
    FOIST_ADJUDICATION_ENABLED: environmentBooleanSchema,
    FOIST_ADJUDICATION_MIN_PERCENT: z.coerce.number().int().min(0).max(100).default(30),
    FOIST_ADJUDICATION_MAX_PERCENT: z.coerce.number().int().min(0).max(100).default(85),
    FOIST_FOISTED_THRESHOLD: z.coerce.number().int().min(60).max(95).default(65),
  })
  .superRefine((value, context) => {
    if (value.FOIST_ADJUDICATION_MIN_PERCENT > value.FOIST_ADJUDICATION_MAX_PERCENT) {
      context.addIssue({
        code: "custom",
        path: ["FOIST_ADJUDICATION_MIN_PERCENT"],
        message: "must be less than or equal to FOIST_ADJUDICATION_MAX_PERCENT",
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

export interface AssessmentRoutingConfig {
  primaryModel: string;
  primaryReasoningEffort: ReasoningEffort;
  adjudicatorModel: string;
  adjudicatorReasoningEffort: ReasoningEffort;
  draftModel: string;
  adjudicationEnabled: boolean;
  adjudicationMinPercent: number;
  adjudicationMaxPercent: number;
  foistedThreshold: number;
}

export interface OpenAiAssessmentConfig {
  apiKey: string;
  routing: AssessmentRoutingConfig;
}

export interface FoistRuntimeConfig {
  openAi: OpenAiAssessmentConfig;
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

export function loadAssessmentConfig(
  environment: NodeJS.ProcessEnv = process.env,
): OpenAiAssessmentConfig {
  const parsed = assessmentEnvironmentSchema.parse(environment);
  const primaryModel = parsed.OPENAI_PRIMARY_MODEL ?? parsed.OPENAI_MODEL ?? "gpt-5.6-terra";

  return {
    apiKey: parsed.OPENAI_API_KEY,
    routing: {
      primaryModel,
      primaryReasoningEffort: parsed.FOIST_PRIMARY_REASONING,
      adjudicatorModel: parsed.OPENAI_ADJUDICATOR_MODEL,
      adjudicatorReasoningEffort: parsed.FOIST_ADJUDICATOR_REASONING,
      draftModel: parsed.OPENAI_DRAFT_MODEL ?? primaryModel,
      adjudicationEnabled: parsed.FOIST_ADJUDICATION_ENABLED,
      adjudicationMinPercent: parsed.FOIST_ADJUDICATION_MIN_PERCENT,
      adjudicationMaxPercent: parsed.FOIST_ADJUDICATION_MAX_PERCENT,
      foistedThreshold: parsed.FOIST_FOISTED_THRESHOLD,
    },
  };
}

function loadRuntimeConfig(environment: NodeJS.ProcessEnv): FoistRuntimeConfig {
  const runtime = runtimeEnvironmentSchema.parse(environment);

  return {
    openAi: loadAssessmentConfig(environment),
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
