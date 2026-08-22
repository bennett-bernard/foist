import Anthropic from "@anthropic-ai/sdk";
import {
  ProviderResponseError,
  type FoistModelProvider,
  type StructuredGenerationRequest,
  type TextGenerationRequest,
} from "../model-provider.js";

export interface AnthropicProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  client?: Anthropic;
}

export class AnthropicProvider implements FoistModelProvider {
  readonly providerName = "anthropic" as const;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.model = options.model;
    this.client =
      options.client ??
      new Anthropic({
        apiKey: options.apiKey,
        ...(options.baseUrl ? { baseURL: options.baseUrl } : {}),
        maxRetries: 2,
        timeout: 30_000,
      });
  }

  async generateStructured(request: StructuredGenerationRequest): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxOutputTokens,
      system: request.instructions,
      messages: [{ role: "user", content: request.input }],
      metadata: { user_id: request.safetyIdentifier },
      output_config: {
        format: {
          type: "json_schema",
          schema: request.schema,
        },
      },
    });
    return this.extractText(response);
  }

  async generateText(request: TextGenerationRequest): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: request.maxOutputTokens,
      system: request.instructions,
      messages: [{ role: "user", content: request.input }],
      metadata: { user_id: request.safetyIdentifier },
    });
    return this.extractText(response);
  }

  private extractText(response: Anthropic.Message): string {
    if (response.stop_reason === "max_tokens") {
      throw new ProviderResponseError("anthropic response reached the output-token limit");
    }
    if (response.stop_reason === "refusal") {
      throw new ProviderResponseError("anthropic refused the request");
    }
    if (response.stop_reason === "model_context_window_exceeded") {
      throw new ProviderResponseError("anthropic response exceeded the model context window");
    }

    const output = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    if (!output) throw new ProviderResponseError("anthropic returned no text output");
    return output;
  }
}
