import assert from "node:assert/strict";
import test from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import type {
  StructuredGenerationRequest,
  TextGenerationRequest,
} from "../src/model-provider.js";
import { AnthropicProvider } from "../src/providers/anthropic.js";
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

test("xAI uses the compatible Responses shape without OpenAI-only fields", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const provider = new OpenAiResponsesProvider({
    providerName: "xai",
    apiKey: "test",
    model: "grok-test",
    client: fakeOpenAiClient(["{\"ok\":true}"], calls),
  });

  await provider.generateStructured(structuredRequest);

  assert.equal(provider.providerName, "xai");
  assert.equal(provider.model, "grok-test");
  assert.equal(calls[0]?.store, false);
  assert.equal(calls[0]?.safety_identifier, undefined);
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
  const provider = new AnthropicProvider({
    apiKey: "test",
    model: "claude-test",
    client: fakeAnthropicClient("{\"ok\":true}", calls),
  });

  assert.equal(await provider.generateStructured(structuredRequest), "{\"ok\":true}");

  assert.equal(calls[0]?.model, "claude-test");
  assert.equal(calls[0]?.system, structuredRequest.instructions);
  assert.deepEqual(calls[0]?.metadata, { user_id: "safe-user" });
  assert.deepEqual(calls[0]?.output_config, {
    format: {
      type: "json_schema",
      schema: structuredRequest.schema,
    },
  });
});
