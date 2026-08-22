import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import type { GoogleGenAI } from "@google/genai";
import type OpenAI from "openai";
import type {
  StructuredGenerationRequest,
  TextGenerationRequest,
} from "../src/model-provider.js";
import { AnthropicProvider } from "../src/providers/anthropic.js";
import { GeminiProvider } from "../src/providers/gemini.js";
import { OpenAiResponsesProvider } from "../src/providers/openai-responses.js";

const structuredRequest: StructuredGenerationRequest = {
  instructions: "Return the assessment.",
  input: "{\"message_to_analyze\":\"hello\"}",
  schemaName: "foist_analysis",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
  },
  maxOutputTokens: 1_000,
  safetyIdentifier: "safe-user",
};

const textRequest: TextGenerationRequest = {
  instructions: "Write the reply.",
  input: "{\"source_message\":\"hello\"}",
  maxOutputTokens: 500,
  safetyIdentifier: "safe-user",
};

function fakeOpenAiClient(
  outputs: string[],
  calls: Array<Record<string, unknown>>,
): OpenAI {
  return {
    responses: {
      create: async (request: Record<string, unknown>) => {
        calls.push(request);
        return {
          status: "completed",
          output_text: outputs.shift() ?? "",
        };
      },
    },
  } as unknown as OpenAI;
}

test("OpenAI Responses requests structured JSON without storing responses", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const provider = new OpenAiResponsesProvider({
    providerName: "openai",
    apiKey: "test",
    model: "gpt-test",
    client: fakeOpenAiClient(["{\"ok\":true}", "draft"], calls),
  });

  assert.equal(await provider.generateStructured(structuredRequest), "{\"ok\":true}");
  assert.equal(await provider.generateText(textRequest), "draft");

  assert.equal(calls[0]?.model, "gpt-test");
  assert.equal(calls[0]?.store, false);
  assert.equal(calls[0]?.safety_identifier, "safe-user");
  assert.deepEqual(
    (calls[0]?.text as { format?: { type?: string; strict?: boolean } }).format,
    {
      type: "json_schema",
      name: "foist_analysis",
      strict: true,
      schema: structuredRequest.schema,
    },
  );
  assert.equal(calls[1]?.store, false);
  assert.equal(calls[1]?.text, undefined);
});

test("Grok uses the xAI Responses shape without OpenAI-only fields", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const provider = new OpenAiResponsesProvider({
    providerName: "grok",
    apiKey: "test",
    model: "grok-test",
    client: fakeOpenAiClient(["{\"ok\":true}", "draft"], calls),
  });

  await provider.generateStructured(structuredRequest);
  assert.equal(await provider.generateText(textRequest), "draft");

  assert.equal(provider.providerName, "grok");
  assert.equal(provider.model, "grok-test");
  assert.equal(calls[0]?.store, false);
  assert.equal(calls[0]?.safety_identifier, undefined);
  assert.deepEqual(calls[0]?.reasoning, { effort: "low" });
  assert.deepEqual(calls[1]?.reasoning, { effort: "low" });
});

test("Grok receives a reasoning-model-friendly timeout", () => {
  const provider = new OpenAiResponsesProvider({
    providerName: "grok",
    apiKey: "test",
    model: "grok-test",
  });

  const client = (provider as unknown as { client: OpenAI }).client;
  assert.equal(client.timeout, 180_000);
  assert.equal(client.maxRetries, 1);
});

function fakeAnthropicClient(
  output: string,
  calls: Array<Record<string, unknown>>,
): Anthropic {
  return {
    messages: {
      create: async (request: Record<string, unknown>) => {
        calls.push(request);
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: output, citations: null }],
        };
      },
    },
  } as unknown as Anthropic;
}

test("Anthropic uses native Messages structured output", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const constrainedRequest: StructuredGenerationRequest = {
    ...structuredRequest,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        score: { type: "integer", minimum: 0, maximum: 100 },
      },
      required: ["score"],
    },
  };
  const provider = new AnthropicProvider({
    apiKey: "test",
    model: "claude-test",
    client: fakeAnthropicClient("{\"ok\":true}", calls),
  });

  assert.equal(await provider.generateStructured(constrainedRequest), "{\"ok\":true}");

  assert.equal(calls[0]?.model, "claude-test");
  assert.equal(calls[0]?.system, structuredRequest.instructions);
  assert.deepEqual(calls[0]?.metadata, { user_id: "safe-user" });
  const format = (calls[0]?.output_config as { format: Record<string, unknown> }).format;
  assert.equal(format.type, "json_schema");
  assert.deepEqual(format.schema, {
    type: "object",
    properties: {
      score: {
        type: "integer",
        description: "{minimum: 0, maximum: 100}",
      },
    },
    additionalProperties: false,
    required: ["score"],
  });
});

function fakeGeminiClient(
  outputs: string[],
  calls: Array<Record<string, unknown>>,
  optionsCalls: Array<Record<string, unknown>>,
): GoogleGenAI {
  return {
    interactions: {
      create: async (
        request: Record<string, unknown>,
        options: Record<string, unknown>,
      ) => {
        calls.push(request);
        optionsCalls.push(options);
        return {
          id: "interaction-test",
          status: "completed",
          output_text: outputs.shift() ?? "",
        };
      },
    },
  } as unknown as GoogleGenAI;
}

test("Gemini uses native Interactions structured output without storage", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const optionsCalls: Array<Record<string, unknown>> = [];
  const provider = new GeminiProvider({
    apiKey: "test",
    model: "gemini-test",
    client: fakeGeminiClient(["{\"ok\":true}", "draft"], calls, optionsCalls),
  });

  assert.equal(await provider.generateStructured(structuredRequest), "{\"ok\":true}");
  assert.equal(await provider.generateText(textRequest), "draft");

  assert.equal(calls[0]?.model, "gemini-test");
  assert.equal(calls[0]?.system_instruction, structuredRequest.instructions);
  assert.equal(calls[0]?.store, false);
  assert.deepEqual(calls[0]?.response_format, {
    type: "text",
    mime_type: "application/json",
    schema: structuredRequest.schema,
  });
  assert.deepEqual(calls[0]?.generation_config, {
    max_output_tokens: structuredRequest.maxOutputTokens,
  });
  assert.equal(calls[1]?.response_format, undefined);
  assert.equal(calls[1]?.store, false);
  assert.deepEqual(calls[1]?.generation_config, {
    max_output_tokens: 2_000,
    thinking_level: "low",
  });
  assert.deepEqual(optionsCalls[0], {
    timeout: 30_000,
    maxRetries: 2,
  });
});


test("Gemini rejects incomplete drafts instead of returning truncated text", async () => {
  const client = {
    interactions: {
      create: async () => ({
        id: "interaction-incomplete",
        status: "incomplete",
        output_text: "Thank you for sharing this reflection—",
      }),
    },
  } as unknown as GoogleGenAI;
  const provider = new GeminiProvider({
    apiKey: "test",
    model: "gemini-test",
    client,
  });

  await assert.rejects(
    () => provider.generateText(textRequest),
    /gemini response ended with status incomplete/,
  );
});
