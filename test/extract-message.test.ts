import assert from "node:assert/strict";
import test from "node:test";
import { extractMessageText, isTruncatedMessage, messageLimits } from "../src/extract-message.js";

test("extracts an ordinary Slack message", () => {
  assert.equal(extractMessageText({ text: "  Hello from a person.  " }), "Hello from a person.");
});

test("prefers forwarded attachment content over the forwarder's preface", () => {
  const message = {
    text: "Foist this please",
    attachments: [
      {
        author_name: "A. Sender",
        text: "This is the original message that should be inspected.",
        fallback: "Duplicate fallback",
      },
    ],
  };

  assert.equal(
    extractMessageText(message),
    "This is the original message that should be inspected.",
  );
});

test("extracts nested rich-text blocks", () => {
  const message = {
    blocks: [
      {
        type: "rich_text",
        elements: [
          {
            type: "rich_text_section",
            elements: [
              { type: "text", text: "First sentence. " },
              { type: "text", text: "Second sentence." },
            ],
          },
        ],
      },
    ],
  };

  assert.equal(extractMessageText(message), "First sentence.\n\nSecond sentence.");
});

test("caps very long messages and reports truncation", () => {
  const text = "x".repeat(messageLimits.maxCharacters + 50);
  assert.equal(extractMessageText({ text }).length, messageLimits.maxCharacters);
  assert.equal(isTruncatedMessage({ text }), true);
});
