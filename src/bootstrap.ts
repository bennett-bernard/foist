import type { App } from "@slack/bolt";
import { registerFoistHandlers } from "./app.js";
import type { FoistRuntimeConfig } from "./config.js";
import { ModelFoistEngine } from "./foist-engine.js";
import { PendingFoistStore } from "./pending-store.js";
import { createModelProvider } from "./providers/index.js";

export async function registerFoistRuntime(app: App, config: FoistRuntimeConfig): Promise<void> {
  const store = new PendingFoistStore(config.dataPath, config.pendingTtlMs);
  await store.init();

  const engine = new ModelFoistEngine({
    provider: createModelProvider(config.ai),
    foistedThreshold: config.ai.foistedThreshold,
  });

  registerFoistHandlers(app, {
    engine,
    store,
    safetySalt: config.safetySalt,
    foistedThreshold: config.ai.foistedThreshold,
  });
}

export function registerGracefulShutdown(app: App): void {
  let stopping = false;

  const stop = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    console.log(`Foist received ${signal}; closing the evidence locker.`);
    await app.stop();
  };

  process.once("SIGINT", () => void stop("SIGINT"));
  process.once("SIGTERM", () => void stop("SIGTERM"));
}
