import "dotenv/config";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadAiConfig } from "../src/config.js";
import {
  evaluationCaseSchema,
  summarizeEvaluation,
  type EvaluationCase,
  type EvaluationMetrics,
  type EvaluationRun,
} from "../src/evaluation.js";
import { ModelFoistEngine } from "../src/foist-engine.js";
import { createModelProvider } from "../src/providers/index.js";

interface Arguments {
  datasetPath: string;
  runs: number;
  json: boolean;
  confirmed: boolean;
  help: boolean;
}

function usage(): string {
  return `Foist model calibration

Usage:
  npm run eval -- --dataset evals/dataset.local.jsonl --runs 3 --confirm-api-cost

Options:
  --dataset <path>       JSONL with known-provenance cases (required in practice)
  --runs <1-10>          Repeats per case (default: 1)
  --json                 Emit machine-readable metrics
  --confirm-api-cost     Required before any model calls
  --help                 Show this help
`;
}

function parseArguments(argv: string[]): Arguments {
  const parsed: Arguments = {
    datasetPath: "evals/dataset.local.jsonl",
    runs: 1,
    json: false,
    confirmed: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dataset") {
      const value = argv[++index];
      if (!value) throw new Error("--dataset requires a path");
      parsed.datasetPath = value;
    } else if (argument === "--runs") {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1 || value > 10) {
        throw new Error("--runs must be an integer from 1 to 10");
      }
      parsed.runs = value;
    } else if (argument === "--json") {
      parsed.json = true;
    } else if (argument === "--confirm-api-cost") {
      parsed.confirmed = true;
    } else if (argument === "--help" || argument === "-h") {
      parsed.help = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return parsed;
}

async function loadDataset(path: string): Promise<EvaluationCase[]> {
  const contents = await readFile(resolve(path), "utf8");
  const cases: EvaluationCase[] = [];
  for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    try {
      const parsed = evaluationCaseSchema.parse(JSON.parse(line));
      if (parsed.enabled) cases.push(parsed);
    } catch (error) {
      throw new Error(`Invalid evaluation case on line ${index + 1}`, { cause: error });
    }
  }
  if (!cases.length) throw new Error("The dataset has no enabled evaluation cases");
  if (
    !cases.some((item) => item.label === "human") ||
    !cases.some((item) => item.label === "ai")
  ) {
    throw new Error("The dataset needs at least one enabled human case and one enabled AI case");
  }
  return cases;
}

function safetyIdentifier(configuration: string, caseId: string, run: number): string {
  return createHash("sha256")
    .update(`foist-eval:${configuration}:${caseId}:${run}`)
    .digest("hex");
}

function percent(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
}

function score(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(1);
}

function tableRows(metrics: EvaluationMetrics[]) {
  return metrics.map((item) => ({
    configuration: item.configuration,
    cases: item.evaluatedCases,
    failures: item.failedRuns,
    precision: percent(item.precision),
    recall: percent(item.recall),
    false_positive_rate: percent(item.falsePositiveRate),
    accuracy: percent(item.accuracy),
    brier: item.brierScore?.toFixed(3) ?? "n/a",
    calibration_error: item.calibrationError?.toFixed(3) ?? "n/a",
    human_mean: score(item.meanHumanScore),
    ai_mean: score(item.meanAiScore),
    mixed_mean: score(item.meanMixedScore),
    score_stddev: item.meanScoreStandardDeviation.toFixed(2),
    latency_ms: Math.round(item.averageLatencyMs),
    suggested_threshold: item.thresholdSuggestion?.threshold ?? "n/a",
  }));
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const ai = loadAiConfig();
  const cases = await loadDataset(args.datasetPath);
  const configuration = `${ai.provider}:${ai.model}`;
  const engine = new ModelFoistEngine({
    provider: createModelProvider(ai),
    foistedThreshold: ai.foistedThreshold,
  });

  // Normally one call per run; malformed structured output receives one defensive retry.
  const maximumCalls = cases.length * args.runs * 2;
  if (!args.confirmed) {
    console.error(
      `Refusing to call the API without --confirm-api-cost. This run can make up to ${maximumCalls} model calls.`,
    );
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const runs: EvaluationRun[] = [];
  for (const evaluationCase of cases) {
    for (let run = 1; run <= args.runs; run += 1) {
      if (!args.json) {
        console.error(`[${configuration}] ${evaluationCase.id} (${run}/${args.runs})`);
      }
      const startedAt = performance.now();
      try {
        const result = await engine.analyze(
          evaluationCase.text,
          safetyIdentifier(configuration, evaluationCase.id, run),
        );
        runs.push({
          configuration,
          caseId: evaluationCase.id,
          label: evaluationCase.label,
          score: result.aiLikelihoodPercent,
          confidence: result.confidence,
          latencyMs: performance.now() - startedAt,
          error: null,
        });
      } catch (error) {
        runs.push({
          configuration,
          caseId: evaluationCase.id,
          label: evaluationCase.label,
          score: null,
          confidence: null,
          latencyMs: performance.now() - startedAt,
          error: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
  }

  const metrics = summarizeEvaluation(configuration, runs, ai.foistedThreshold);
  if (args.json) {
    console.log(
      JSON.stringify({ dataset: resolve(args.datasetPath), runs: args.runs, metrics }, null, 2),
    );
    return;
  }

  console.table(tableRows([metrics]));
  console.log(
    "Threshold suggestions are in-sample only. Confirm them on a held-out set before changing production.",
  );
}

await main();
