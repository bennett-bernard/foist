import assert from "node:assert/strict";
import test from "node:test";
import { parseFoistDecision } from "../src/intent.js";

test("recognizes concise yes and no replies", () => {
  assert.equal(parseFoistDecision("YES!"), "yes");
  assert.equal(parseFoistDecision("foist it"), "yes");
  assert.equal(parseFoistDecision("nah."), "no");
});

test("does not mistake a normal message for a decision", () => {
  assert.equal(parseFoistDecision("Yes, this plan has several important tradeoffs."), null);
});
