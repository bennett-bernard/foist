import type { App } from "@slack/bolt";
import { registerFoistHandlers } from "./app.js";
import type { FoistRuntimeConfig } from "./config.js";
import { OpenAiFoistEngine } from "./openai-engine.js";
import { PendingFoistStore } from "./pending-store.js";

export async function registerFoistRuntime(app: App, config: FoistRuntimeConfig): Promise<void> {
  const store = new PendingFoistStore(config.dataPath, config.pendingTtlMs);
  await store.init();

  const engine = new OpenAiFoistEngine({
    apiKey: config.openAi.apiKey,
    routing: config.openAi.routing,
    onAdjudicationError: (error) =>
      console.warn("Foist adjudication failed; using first pass", error),
  });

  registerFoistHandlers(app, {
    engine,
    store,
    safetySalt: config.safetySalt,
    foistedThreshold: config.openAi.routing.foistedThreshold,
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
