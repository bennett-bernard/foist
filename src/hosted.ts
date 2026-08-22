import "dotenv/config";
import { App } from "@slack/bolt";
import { registerFoistRuntime, registerGracefulShutdown } from "./bootstrap.js";
import { loadHostedConfig } from "./config.js";

const config = loadHostedConfig();
const app = new App({
  token: config.slackBotToken,
  signingSecret: config.slackSigningSecret,
});

await registerFoistRuntime(app, config);
registerGracefulShutdown(app);
await app.start(config.port);

const routing = config.openAi.routing;
console.log(
  `Foist is listening over HTTP on port ${config.port} with ${routing.primaryModel}; ambiguous cases use ${routing.adjudicatorModel}.`,
);
