import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

interface SlackManifest {
  features?: { shortcuts?: unknown[] };
  oauth_config?: { scopes?: { bot?: string[] } };
}

test("message shortcuts include Slack's required commands scope", async () => {
  const contents = await readFile(new URL("../manifest.json", import.meta.url), "utf8");
  const manifest = JSON.parse(contents) as SlackManifest;
  const hasShortcuts = Boolean(manifest.features?.shortcuts?.length);

  assert.equal(hasShortcuts, true);
  assert.ok(manifest.oauth_config?.scopes?.bot?.includes("commands"));
});
