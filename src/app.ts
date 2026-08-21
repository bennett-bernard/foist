import { App } from "@slack/bolt";
import type { Logger } from "@slack/logger";
import type { WebClient } from "@slack/web-api";
import { extractMessageText, isTruncatedMessage, messageLimits } from "./extract-message.js";
import { parseFoistDecision } from "./intent.js";
import { PendingFoistStore } from "./pending-store.js";
import {
  renderAnalysis,
  renderDraft,
  renderDraftWorking,
  renderError,
  renderHelp,
  renderMercy,
  renderNothingPending,
  renderRateLimited,
  renderTooShort,
  renderWorking,
  type SlackMessageView,
} from "./presentation.js";
import { makeSafetyIdentifier } from "./safety.js";
import type { FoistEngine, PendingFoist } from "./types.js";

interface FoistDependencies {
  engine: FoistEngine;
  store: PendingFoistStore;
  safetySalt: string;
  foistedThreshold: number;
}

interface AnalyzeRequest {
  client: WebClient;
  logger: Logger;
  channelId: string;
  userId: string;
  teamId: string;
  sourceText: string;
  truncated: boolean;
}

class SlidingWindowLimiter {
  private readonly attempts = new Map<string, number[]>();

  constructor(
    private readonly maximum: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    const cutoff = this.now() - this.windowMs;
    const recent = (this.attempts.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= this.maximum) {
      this.attempts.set(key, recent);
      return false;
    }
    recent.push(this.now());
    this.attempts.set(key, recent);
    return true;
  }
}

class RecentEventSet {
  private readonly events = new Map<string, number>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  firstTime(key: string): boolean {
    const now = this.now();
    for (const [eventKey, expiresAt] of this.events) {
      if (expiresAt <= now) this.events.delete(eventKey);
    }
    if (this.events.has(key)) return false;
    this.events.set(key, now + this.ttlMs);
    return true;
  }
}

function asRecord(value: unknown): Record<string, any> {
  return typeof value === "object" && value !== null ? (value as Record<string, any>) : {};
}

async function postView(client: WebClient, channel: string, view: SlackMessageView) {
  return client.chat.postMessage({ channel, ...view });
}

async function updateView(
  client: WebClient,
  channel: string,
  timestamp: string | undefined,
  view: SlackMessageView,
): Promise<void> {
  if (timestamp) {
    await client.chat.update({ channel, ts: timestamp, ...view });
    return;
  }
  await postView(client, channel, view);
}

export function registerFoistHandlers(app: App, dependencies: FoistDependencies): void {
  const { engine, store, safetySalt, foistedThreshold } = dependencies;
  const limiter = new SlidingWindowLimiter(8, 60_000);
  const recentEvents = new RecentEventSet(5 * 60_000);

  const analyze = async (request: AnalyzeRequest): Promise<void> => {
    const { client, logger, channelId, userId, teamId, sourceText, truncated } = request;

    if (!limiter.allow(`${teamId}:${userId}`)) {
      await postView(client, channelId, renderRateLimited());
      return;
    }
    if (sourceText.length < messageLimits.minimumUsefulCharacters) {
      await postView(client, channelId, renderTooShort());
      return;
    }

    const working = await postView(client, channelId, renderWorking());
    const safetyIdentifier = makeSafetyIdentifier(teamId, userId, safetySalt);

    try {
      const result = await engine.analyze(sourceText, safetyIdentifier);
      let pendingId: string | null = null;
      if (result.aiLikelihoodPercent >= foistedThreshold) {
        const pending = await store.put({
          userId,
          channelId,
          sourceText,
          likelyPrompt: result.likelyPrompt,
        });
        pendingId = pending.id;
      }
      await updateView(client, channelId, working.ts, renderAnalysis(result, pendingId, truncated, foistedThreshold));
    } catch (error) {
      logger.error("Foist analysis failed", error);
      await updateView(client, channelId, working.ts, renderError());
    }
  };

  const draftFoistBack = async (
    client: WebClient,
    logger: Logger,
    teamId: string,
    userId: string,
    channelId: string,
    pending: PendingFoist,
  ): Promise<void> => {
    const working = await postView(client, channelId, renderDraftWorking());
    try {
      const safetyIdentifier = makeSafetyIdentifier(teamId, userId, safetySalt);
      const draft = await engine.draftFoistBack(
        pending.sourceText,
        pending.likelyPrompt,
        safetyIdentifier,
      );
      await store.delete(pending.id);
      await updateView(client, channelId, working.ts, renderDraft(draft));
    } catch (error) {
      logger.error("Foist-back drafting failed", error);
      await updateView(client, channelId, working.ts, renderError());
    }
  };

  app.message(async ({ message, body, client, logger }) => {
    const event = asRecord(message);
    const channelId = typeof event.channel === "string" ? event.channel : "";
    const userId = typeof event.user === "string" ? event.user : "";
    const teamId = typeof body.team_id === "string" ? body.team_id : "unknown-team";

    if (!channelId.startsWith("D") || !userId || event.bot_id || event.hidden) return;
    if (["bot_message", "message_changed", "message_deleted"].includes(event.subtype)) return;

    const eventKey = `${teamId}:${channelId}:${String(event.ts ?? event.event_ts ?? "")}`;
    if (!recentEvents.firstTime(eventKey)) return;

    const decision = parseFoistDecision(typeof event.text === "string" ? event.text : undefined);
    if (decision) {
      const pending = await store.getLatestForUser(userId);
      if (!pending) {
        await postView(client, channelId, renderNothingPending());
        return;
      }
      if (decision === "no") {
        await store.delete(pending.id);
        await postView(client, channelId, renderMercy());
        return;
      }
      await draftFoistBack(client, logger, teamId, userId, channelId, pending);
      return;
    }

    const sourceText = extractMessageText(event);
    if (!sourceText) {
      await postView(client, channelId, renderHelp());
      return;
    }

    await analyze({
      client,
      logger,
      channelId,
      userId,
      teamId,
      sourceText,
      truncated: isTruncatedMessage(event),
    });
  });

  app.shortcut("foist_message", async ({ ack, shortcut, client, logger, respond }) => {
    await ack();
    const payload = asRecord(shortcut);
    const userId = String(payload.user?.id ?? "");
    const teamId = String(payload.team?.id ?? "unknown-team");
    const sourceText = extractMessageText(payload.message);

    try {
      const opened = await client.conversations.open({ users: userId });
      const channelId = opened.channel?.id;
      if (!channelId) throw new Error("Slack did not return a DM channel");

      if (!sourceText) {
        await postView(client, channelId, renderHelp());
        return;
      }
      await analyze({
        client,
        logger,
        channelId,
        userId,
        teamId,
        sourceText,
        truncated: isTruncatedMessage(payload.message),
      });
    } catch (error) {
      logger.error("Foist message shortcut failed", error);
      await respond({ response_type: "ephemeral", text: renderError().text });
    }
  });

  app.action("foist_back_yes", async ({ ack, body, action, client, logger }) => {
    await ack();
    const payload = asRecord(body);
    const actionPayload = asRecord(action);
    const userId = String(payload.user?.id ?? "");
    const teamId = String(payload.team?.id ?? payload.team_id ?? "unknown-team");
    const channelId = String(payload.channel?.id ?? "");
    const pendingId = String(actionPayload.value ?? "");
    const pending = await store.getByIdForUser(pendingId, userId);

    if (!pending || !channelId) {
      if (channelId) await postView(client, channelId, renderNothingPending());
      return;
    }
    await draftFoistBack(client, logger, teamId, userId, channelId, pending);
  });

  app.action("foist_back_no", async ({ ack, body, action, client }) => {
    await ack();
    const payload = asRecord(body);
    const actionPayload = asRecord(action);
    const userId = String(payload.user?.id ?? "");
    const channelId = String(payload.channel?.id ?? "");
    const pendingId = String(actionPayload.value ?? "");
    const pending = await store.getByIdForUser(pendingId, userId);

    if (pending) await store.delete(pending.id);
    if (channelId) await postView(client, channelId, pending ? renderMercy() : renderNothingPending());
  });
}
