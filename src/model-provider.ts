import type { AiProviderName } from "./config.js";

export interface StructuredGenerationRequest {
  instructions: string;
  input: string;
  schemaName: string;
  schema: Record<string, unknown>;
  maxOutputTokens: number;
  safetyIdentifier: string;
}

export interface TextGenerationRequest {
  instructions: string;
  input: string;
  maxOutputTokens: number;
  safetyIdentifier: string;
}

export interface FoistModelProvider {
  readonly providerName: AiProviderName;
  readonly model: string;
  generateStructured(request: StructuredGenerationRequest): Promise<string>;
  generateText(request: TextGenerationRequest): Promise<string>;
}

export class ProviderResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderResponseError";
  }
}
