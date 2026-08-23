import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

interface SlackManifest {
  features?: { shortcuts?: unknown[] };
  oauth_config?: { scopes?: { bot?: string[] } };
  settings?: {
    socket_mode_enabled?: boolean;
    event_subscriptions?: { request_url?: string };
    interactivity?: { request_url?: string };
  };
}

async function readManifest(filename: string): Promise<SlackManifest> {
  const contents = await readFile(new URL(`../${filename}`, import.meta.url), "utf8");
  return JSON.parse(contents) as SlackManifest;
}

test("message shortcut includes Slack's required commands scope", async () => {
  const manifest = await readManifest("manifest.json");
  const hasShortcuts = Boolean(manifest.features?.shortcuts?.length);

  assert.equal(hasShortcuts, true);
  assert.ok(manifest.oauth_config?.scopes?.bot?.includes("commands"));
});

test("self-hosted manifest uses Socket Mode", async () => {
  const manifest = await readManifest("manifest.json");

  assert.equal(manifest.settings?.socket_mode_enabled, true);
  assert.equal(manifest.settings?.event_subscriptions?.request_url, undefined);
});
