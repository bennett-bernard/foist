export const confidenceLevels = ["low", "medium", "high"] as const;

export type Confidence = (typeof confidenceLevels)[number];

export interface FoistAnalysis {
  aiLikelihoodPercent: number;
  confidence: Confidence;
  likelyPrompt: string;
  signals: string[];
  caveat: string;
}

export interface PendingFoist {
  id: string;
  userId: string;
  channelId: string;
  sourceText: string;
  likelyPrompt: string;
  createdAt: number;
  expiresAt: number;
}

export interface PendingFoistInput {
  userId: string;
  channelId: string;
  sourceText: string;
  likelyPrompt: string;
}

export interface FoistEngine {
  analyze(text: string, safetyIdentifier: string): Promise<FoistAnalysis>;
  draftFoistBack(
    sourceText: string,
    likelyPrompt: string,
    safetyIdentifier: string,
  ): Promise<string>;
}
