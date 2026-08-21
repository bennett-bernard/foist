import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PendingFoistStore } from "../src/pending-store.js";

test("persists, isolates, expires, and deletes pending requests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "foist-store-test-"));
  const path = join(directory, "pending.json");
  let now = 1_000;

  try {
    const store = new PendingFoistStore(path, 100, () => now);
    const pending = await store.put({
      userId: "U123",
      channelId: "D123",
      sourceText: "A suspiciously polished and highly structured status update.",
      likelyPrompt: "Write a polished status update.",
    });

    assert.equal((await store.getByIdForUser(pending.id, "U999")), null);
    assert.equal((await store.getLatestForUser("U123"))?.id, pending.id);

    const reloaded = new PendingFoistStore(path, 100, () => now);
    assert.equal((await reloaded.getLatestForUser("U123"))?.id, pending.id);
    assert.equal(JSON.parse(await readFile(path, "utf8")).version, 1);

    now = 1_101;
    assert.equal(await reloaded.getLatestForUser("U123"), null);

    now = 2_000;
    const replacement = await store.put({
      userId: "U123",
      channelId: "D123",
      sourceText: "Another message long enough to qualify for an investigation.",
      likelyPrompt: "Write another update.",
    });
    await store.delete(replacement.id);
    assert.equal(await store.getLatestForUser("U123"), null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
