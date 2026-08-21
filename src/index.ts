import "dotenv/config";
import { App } from "@slack/bolt";
import { registerFoistHandlers } from "./app.js";
import { loadConfig } from "./config.js";
import { OpenAiFoistEngine } from "./openai-engine.js";
import { PendingFoistStore } from "./pending-store.js";

const config = loadConfig();
const store = new PendingFoistStore(config.dataPath, config.pendingTtlMs);
await store.init();

const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  socketMode: true,
});

const engine = new OpenAiFoistEngine({
  apiKey: config.openAi.apiKey,
  routing: config.openAi.routing,
  onAdjudicationError: (error) => console.warn("Foist adjudication failed; using first pass", error),
});

registerFoistHandlers(app, {
  engine,
  store,
  safetySalt: config.safetySalt,
  foistedThreshold: config.openAi.routing.foistedThreshold,
});

let stopping = false;
async function stop(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  console.log(`Foist received ${signal}; closing the evidence locker.`);
  await app.stop();
}

process.once("SIGINT", () => void stop("SIGINT"));
process.once("SIGTERM", () => void stop("SIGTERM"));

await app.start();
const routing = config.openAi.routing;
console.log(
  `Foist is listening in Socket Mode with ${routing.primaryModel}; ambiguous cases use ${routing.adjudicatorModel}.`,
);
