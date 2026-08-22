import "dotenv/config";
import { App } from "@slack/bolt";
import { registerFoistRuntime, registerGracefulShutdown } from "./bootstrap.js";
import { loadSelfHostedConfig } from "./config.js";

const config = loadSelfHostedConfig();
const app = new App({
  token: config.slackBotToken,
  appToken: config.slackAppToken,
  socketMode: true,
});

await registerFoistRuntime(app, config);
registerGracefulShutdown(app);
await app.start();

console.log(
  `Foist is listening in Socket Mode with ${config.ai.provider}/${config.ai.model}.`,
);
