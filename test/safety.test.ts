import assert from "node:assert/strict";
import test from "node:test";
import { makeSafetyIdentifier } from "../src/safety.js";

test("creates stable, non-identifying safety identifiers", () => {
  const first = makeSafetyIdentifier("T123", "U123", "secret-salt");
  assert.equal(first, makeSafetyIdentifier("T123", "U123", "secret-salt"));
  assert.notEqual(first, makeSafetyIdentifier("T123", "U999", "secret-salt"));
  assert.doesNotMatch(first, /T123|U123/);
});
