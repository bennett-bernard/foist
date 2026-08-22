import type { AiConfig } from "../config.js";
import type { FoistModelProvider } from "../model-provider.js";
import { AnthropicProvider } from "./anthropic.js";
import { GeminiProvider } from "./gemini.js";
import { OpenAiResponsesProvider } from "./openai-responses.js";

export function createModelProvider(config: AiConfig): FoistModelProvider {
  if (config.provider === "anthropic") {
    return new AnthropicProvider({
      apiKey: config.apiKey,
      model: config.model,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    });
  }

  if (config.provider === "gemini") {
    return new GeminiProvider({
      apiKey: config.apiKey,
      model: config.model,
    });
  }

  return new OpenAiResponsesProvider({
    providerName: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    ...(config.reasoningEffort ? { reasoningEffort: config.reasoningEffort } : {}),
    ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
  });
}
