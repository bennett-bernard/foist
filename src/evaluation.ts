import { z } from "zod";
import type { Confidence } from "./types.js";

export const evaluationLabels = ["human", "ai", "mixed"] as const;
export type EvaluationLabel = (typeof evaluationLabels)[number];

export const evaluationCaseSchema = z
  .object({
    id: z.string().min(1).max(100),
    label: z.enum(evaluationLabels),
    text: z.string().min(40).max(12_000),
    provenance: z.enum(["controlled_human", "controlled_ai", "controlled_mixed"]),
    consent_confirmed: z.boolean(),
    category: z.string().min(1).max(100).optional(),
    enabled: z.boolean().default(true),
    notes: z.string().max(500).optional(),
  })
  .superRefine((value, context) => {
    const expectedProvenance = `controlled_${value.label}`;
    if (value.provenance !== expectedProvenance) {
      context.addIssue({
        code: "custom",
        path: ["provenance"],
        message: `must be ${expectedProvenance} for label ${value.label}`,
      });
    }
    if (value.enabled && !value.consent_confirmed) {
      context.addIssue({
        code: "custom",
        path: ["consent_confirmed"],
        message: "must be true for enabled evaluation cases",
      });
    }
  });

export type EvaluationCase = z.infer<typeof evaluationCaseSchema>;

export interface EvaluationRun {
  configuration: string;
  caseId: string;
  label: EvaluationLabel;
  score: number | null;
  confidence: Confidence | null;
  latencyMs: number;
  error: string | null;
}

interface CaseAggregate {
  caseId: string;
  label: EvaluationLabel;
  meanScore: number;
  scoreStandardDeviation: number;
}

export interface ThresholdSuggestion {
  threshold: number;
  precision: number;
  recall: number;
  falsePositiveRate: number;
  predictedPositives: number;
  metTargetPrecision: boolean;
}

export interface EvaluationMetrics {
  configuration: string;
  successfulRuns: number;
  failedRuns: number;
  evaluatedCases: number;
  precision: number | null;
  recall: number | null;
  falsePositiveRate: number | null;
  accuracy: number | null;
  brierScore: number | null;
  calibrationError: number | null;
  meanHumanScore: number | null;
  meanAiScore: number | null;
  meanMixedScore: number | null;
  meanScoreStandardDeviation: number;
  averageLatencyMs: number;
  configuredThreshold: number;
  thresholdSuggestion: ThresholdSuggestion | null;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function nullableRatio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function aggregateCases(runs: EvaluationRun[]): CaseAggregate[] {
  const grouped = new Map<string, EvaluationRun[]>();
  for (const run of runs) {
    if (run.score === null) continue;
    const key = `${run.configuration}:${run.caseId}`;
    const group = grouped.get(key) ?? [];
    group.push(run);
    grouped.set(key, group);
  }

  return [...grouped.values()].map((group) => {
    const first = group[0];
    if (!first) throw new Error("Evaluation aggregation received an empty group");
    const scores = group.flatMap((run) => (run.score === null ? [] : [run.score]));
    return {
      caseId: first.caseId,
      label: first.label,
      meanScore: mean(scores),
      scoreStandardDeviation: standardDeviation(scores),
    };
  });
}

function expectedCalibrationError(cases: CaseAggregate[], bins = 5): number | null {
  const binary = cases.filter((item) => item.label !== "mixed");
  if (!binary.length) return null;

  let weightedError = 0;
  for (let index = 0; index < bins; index += 1) {
    const lower = index / bins;
    const upper = (index + 1) / bins;
    const inBin = binary.filter((item) => {
      const probability = item.meanScore / 100;
      return probability >= lower && (index === bins - 1 ? probability <= upper : probability < upper);
    });
    if (!inBin.length) continue;
    const confidence = mean(inBin.map((item) => item.meanScore / 100));
    const frequency = mean(inBin.map((item) => (item.label === "ai" ? 1 : 0)));
    weightedError += (inBin.length / binary.length) * Math.abs(confidence - frequency);
  }
  return weightedError;
}

export function recommendThreshold(
  cases: CaseAggregate[],
  targetPrecision = 0.9,
): ThresholdSuggestion | null {
  const binary = cases.filter((item) => item.label !== "mixed");
  const candidates: ThresholdSuggestion[] = [];

  for (let threshold = 50; threshold <= 95; threshold += 1) {
    let truePositive = 0;
    let falsePositive = 0;
    let falseNegative = 0;
    let trueNegative = 0;
    for (const item of binary) {
      const predictedAi = item.meanScore >= threshold;
      if (item.label === "ai" && predictedAi) truePositive += 1;
      if (item.label === "human" && predictedAi) falsePositive += 1;
      if (item.label === "ai" && !predictedAi) falseNegative += 1;
      if (item.label === "human" && !predictedAi) trueNegative += 1;
    }
    const precision = nullableRatio(truePositive, truePositive + falsePositive);
    if (precision === null) continue;
    candidates.push({
      threshold,
      precision,
      recall: nullableRatio(truePositive, truePositive + falseNegative) ?? 0,
      falsePositiveRate: nullableRatio(falsePositive, falsePositive + trueNegative) ?? 0,
      predictedPositives: truePositive + falsePositive,
      metTargetPrecision: precision >= targetPrecision,
    });
  }

  if (!candidates.length) return null;
  return candidates.sort((left, right) => {
    if (left.metTargetPrecision !== right.metTargetPrecision) {
      return Number(right.metTargetPrecision) - Number(left.metTargetPrecision);
    }
    if (left.metTargetPrecision && right.metTargetPrecision && left.recall !== right.recall) {
      return right.recall - left.recall;
    }
    if (left.precision !== right.precision) return right.precision - left.precision;
    if (left.falsePositiveRate !== right.falsePositiveRate) {
      return left.falsePositiveRate - right.falsePositiveRate;
    }
    return left.threshold - right.threshold;
  })[0] ?? null;
}

export function summarizeEvaluation(
  configuration: string,
  runs: EvaluationRun[],
  configuredThreshold: number,
): EvaluationMetrics {
  const relevantRuns = runs.filter((run) => run.configuration === configuration);
  const successful = relevantRuns.filter((run) => run.score !== null);
  const cases = aggregateCases(successful);
  const binary = cases.filter((item) => item.label !== "mixed");

  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let trueNegative = 0;
  for (const item of binary) {
    const predictedAi = item.meanScore >= configuredThreshold;
    if (item.label === "ai" && predictedAi) truePositive += 1;
    if (item.label === "human" && predictedAi) falsePositive += 1;
    if (item.label === "ai" && !predictedAi) falseNegative += 1;
    if (item.label === "human" && !predictedAi) trueNegative += 1;
  }

  const labelMean = (label: EvaluationLabel): number | null => {
    const values = cases.filter((item) => item.label === label).map((item) => item.meanScore);
    return values.length ? mean(values) : null;
  };

  return {
    configuration,
    successfulRuns: successful.length,
    failedRuns: relevantRuns.length - successful.length,
    evaluatedCases: cases.length,
    precision: nullableRatio(truePositive, truePositive + falsePositive),
    recall: nullableRatio(truePositive, truePositive + falseNegative),
    falsePositiveRate: nullableRatio(falsePositive, falsePositive + trueNegative),
    accuracy: nullableRatio(truePositive + trueNegative, binary.length),
    brierScore: binary.length
      ? mean(binary.map((item) => (item.meanScore / 100 - (item.label === "ai" ? 1 : 0)) ** 2))
      : null,
    calibrationError: expectedCalibrationError(cases),
    meanHumanScore: labelMean("human"),
    meanAiScore: labelMean("ai"),
    meanMixedScore: labelMean("mixed"),
    meanScoreStandardDeviation: mean(cases.map((item) => item.scoreStandardDeviation)),
    averageLatencyMs: successful.length ? mean(successful.map((run) => run.latencyMs)) : 0,
    configuredThreshold,
    thresholdSuggestion: recommendThreshold(cases),
  };
}
