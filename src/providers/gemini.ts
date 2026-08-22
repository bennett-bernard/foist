import { GoogleGenAI } from "@google/genai";
import {
  ProviderResponseError,
  type FoistModelProvider,
  type StructuredGenerationRequest,
  type TextGenerationRequest,
} from "../model-provider.js";

interface GeminiInteractionResult {
  status: string;
  output_text?: string | undefined;
}

export interface GeminiProviderOptions {
  apiKey: string;
  model: string;
  client?: GoogleGenAI;
}

export class GeminiProvider implements FoistModelProvider {
  readonly providerName = "gemini" as const;
  readonly model: string;
  private readonly client: GoogleGenAI;

  constructor(options: GeminiProviderOptions) {
    this.model = options.model;
    this.client = options.client ?? new GoogleGenAI({ apiKey: options.apiKey });
  }

  async generateStructured(request: StructuredGenerationRequest): Promise<string> {
    const response = await this.client.interactions.create(
      {
        model: this.model,
        input: request.input,
        system_instruction: request.instructions,
        store: false,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: request.schema,
        },
        generation_config: {
          max_output_tokens: request.maxOutputTokens,
        },
      },
      {
        timeout: 30_000,
        maxRetries: 2,
      },
    );

    return this.extractText(response);
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    const response = await this.client.interactions.create(
      {
        model: this.model,
        input: request.input,
        system_instruction: request.instructions,
        store: false,
        generation_config: {
          max_output_tokens: Math.max(request.maxOutputTokens, 2_000),
          thinking_level: "low",
        },
      },
      {
        timeout: 30_000,
        maxRetries: 2,
      },
    );

    return this.extractText(response);
  }

  private extractText(response: GeminiInteractionResult): string {
    if (response.status !== "completed") {
      throw new ProviderResponseError(
        `gemini response ended with status ${response.status}`,
      );
    }
    const text = response.output_text?.trim();
    if (!text) throw new ProviderResponseError("gemini returned no text output");
    return text;
  }
}
