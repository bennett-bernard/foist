import OpenAI from "openai";
import type { AiProviderName } from "../config.js";
import {
  ProviderResponseError,
  type FoistModelProvider,
  type StructuredGenerationRequest,
  type TextGenerationRequest,
} from "../model-provider.js";

type OpenAiResponsesProviderName = Exclude<AiProviderName, "anthropic">;

export interface OpenAiResponsesProviderOptions {
  providerName: OpenAiResponsesProviderName;
  apiKey: string;
  model: string;
  baseUrl?: string;
  client?: OpenAI;
}

export class OpenAiResponsesProvider implements FoistModelProvider {
  readonly providerName: OpenAiResponsesProviderName;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(options: OpenAiResponsesProviderOptions) {
    this.providerName = options.providerName;
    this.model = options.model;
    this.client =
      options.client ??
      new OpenAI({
        apiKey: options.apiKey,
        ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
        maxRetries: 2,
        timeout: 30_000,
      });
  }

  async generateStructured(request: StructuredGenerationRequest): Promise<string> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: request.instructions,
      input: request.input,
      text: {
        format: {
          type: "json_schema",
          name: request.schemaName,
          strict: true,
          schema: request.schema,
        },
      },
      max_output_tokens: request.maxOutputTokens,
      ...(this.providerName === "openai"
        ? { safety_identifier: request.safetyIdentifier }
        : {}),
      store: false,
    });

    if (response.status === "incomplete") {
      throw new ProviderResponseError(
        `${this.providerName} response was incomplete: ${response.incomplete_details?.reason ?? "unknown reason"}`,
      );
    }
    if (!response.output_text) {
      throw new ProviderResponseError(`${this.providerName} returned no structured output`);
    }
    return response.output_text;
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: request.instructions,
      input: request.input,
      max_output_tokens: request.maxOutputTokens,
      ...(this.providerName === "openai"
        ? { safety_identifier: request.safetyIdentifier }
        : {}),
      store: false,
    });

    if (response.status === "incomplete") {
      throw new ProviderResponseError(
        `${this.providerName} response was incomplete: ${response.incomplete_details?.reason ?? "unknown reason"}`,
      );
    }
    if (!response.output_text.trim()) {
      throw new ProviderResponseError(`${this.providerName} returned no text output`);
    }
    return response.output_text;
  }
}
