import type { KnownBlock } from "@slack/types";
import type { FoistAnalysis } from "./types.js";

export interface SlackMessageView {
  text: string;
  blocks: KnownBlock[];
}

function escapeMrkdwn(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function clipped(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

export type AiStyleLevel = "LOW" | "MEDIUM" | "HIGH";

const assessmentGifs = [
  "https://y.yarn.co/4291bbbf-ae6d-452c-bcda-3d4c0d8dcdf8_text.gif",
  "https://y.yarn.co/40d77296-4930-4aa5-ab3a-92b980eca4bf_text.gif",
] as const;

export function assessmentGifFor(randomValue = Math.random()): string {
  return assessmentGifs[randomValue < 0.5 ? 0 : 1];
}

export function levelFor(score: number, foistedThreshold = 65): AiStyleLevel {
  if (score >= foistedThreshold) return "HIGH";
  if (score >= 35) return "MEDIUM";
  return "LOW";
}

export function stoplightFor(level: AiStyleLevel): string {
  if (level === "LOW") return "🟢 ⚫ ⚫";
  if (level === "MEDIUM") return "⚫ 🟡 ⚫";
  return "⚫ ⚫ 🔴";
}

export function verdictFor(score: number, foistedThreshold = 65): string {
  if (score >= foistedThreshold) return ":rotating_light: *YOU GOT FOISTED!* :rotating_light:";
  if (score < 15) return "NO FOIST DETECTED. This one still has fingerprints.";
  if (score < 35) {
    return "This was *SLIGHTLY AI*... the original sender is off the hook... this time.";
  }
  return "FOISTY BUSINESS. The prose has started wearing a blazer.";
}

export function renderAnalysis(
  analysis: FoistAnalysis,
  pendingId: string | null,
  truncated = false,
  foistedThreshold = 65,
): SlackMessageView {
  const score = analysis.aiLikelihoodPercent;
  const level = levelFor(score, foistedThreshold);
  const stoplight = stoplightFor(level);
  const signals = analysis.signals.length
    ? analysis.signals.map((signal) => `• ${escapeMrkdwn(clipped(signal, 180))}`).join("\n")
    : "• No single tell carried the verdict.";

  const promptBlocks: KnownBlock[] =
    level === "HIGH"
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Likely prompt behind it*\n> ${escapeMrkdwn(clipped(analysis.likelyPrompt, 500))}`,
            },
          },
        ]
      : [];

  const reactionGifBlocks: KnownBlock[] =
    level === "HIGH"
      ? [
          {
            type: "image",
            image_url: assessmentGifFor(),
            alt_text: "A playful reaction GIF accompanying Foist's HIGH AI-writing assessment.",
          },
        ]
      : [];

  const blocks: KnownBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${verdictFor(score, foistedThreshold)}\n\n${stoplight}  *AI-ish reading: ${level}*`,
      },
    },
    ...reactionGifBlocks,
    { type: "divider" },
    ...promptBlocks,
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Foist's evidence board*\n${signals}` },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `_${escapeMrkdwn(clipped(analysis.caveat, 220))} Foist estimates style signals; it cannot prove who wrote something.${truncated ? " Only the first 12,000 characters were analyzed." : ""}_`,
        },
      ],
    },
  ];

  const trace = analysis.assessmentTrace;
  if (trace?.reviewStatus === "completed") {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `:mag_right: *Double-checked by ${escapeMrkdwn(trace.finalModel)}.* The second opinion set this ${level.toLowerCase()} reading.`,
        },
      ],
    });
  } else if (trace?.reviewStatus === "failed") {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: ":warning: _The second look was unavailable, so this uses the validated first pass._",
        },
      ],
    });
  }

  if (score >= foistedThreshold && pendingId) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "foist_back_yes",
          style: "primary",
          text: { type: "plain_text", text: "Foist back", emoji: true },
          value: pendingId,
        },
        {
          type: "button",
          action_id: "foist_back_no",
          text: { type: "plain_text", text: "Show mercy", emoji: true },
          value: pendingId,
        },
      ],
    });
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: "Or reply *y/n*. I have the paperwork." }],
    });
  }

  return {
    text: `Foist gives this message a ${level} AI-ish reading.`,
    blocks,
  };
}

export function renderWorking(): SlackMessageView {
  return {
    text: "Foist is dusting this message for AI fingerprints…",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: ":mag: *Dusting this message for AI fingerprints…*" },
      },
    ],
  };
}

export function renderDraft(draft: string): SlackMessageView {
  const safeDraft = escapeMrkdwn(clipped(draft, 1_500)).replaceAll("```", "''' ");
  return {
    text: `Your Foist-back draft: ${safeDraft}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `:sparkles: *FOIST: RETURN TO SENDER*\n\n\`\`\`\n${safeDraft}\n\`\`\``,
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "_Draft only. You choose whether—and where—to send it._" }],
      },
    ],
  };
}

export function renderTooShort(): SlackMessageView {
  return {
    text: "That message is too short for a useful AI-writing estimate.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":microscope: *I need a little more specimen.*\nThat message is too short for a useful read. Forward or paste at least a sentence or two.",
        },
      },
    ],
  };
}

export function renderError(): SlackMessageView {
  return {
    text: "Foist's tiny lab had a problem. Please try again.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":test_tube: *The tiny lab made a tiny mess.*\nI couldn't finish that analysis. Please try again in a moment.",
        },
      },
    ],
  };
}

export function renderDraftWorking(): SlackMessageView {
  return {
    text: "Foist is turning the AI dial past its warranty…",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: ":control_knobs: *Turning the AI dial past its warranty…*" },
      },
    ],
  };
}

export function renderMercy(): SlackMessageView {
  return {
    text: "Mercy granted. The sender lives to type another day.",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: ":dove_of_peace: *Mercy granted.* The sender lives to type another day." },
      },
    ],
  };
}

export function renderNothingPending(): SlackMessageView {
  return {
    text: "There is no Foist-back waiting. Send me a suspicious message first.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":file_cabinet: *My case file is empty.*\nSend me a suspicious message first, then we can discuss retaliation.",
        },
      },
    ],
  };
}

export function renderHelp(): SlackMessageView {
  return {
    text: "Forward or paste a Slack message and Foist will inspect its AI-writing signals.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Foist needs a message to investigate.* :detective:\nForward or paste a Slack message here, or use *More actions → Foist this message* on any message.",
        },
      },
      {
        type: "context",
        elements: [{ type: "mrkdwn", text: "_Foist gives a playful style estimate—not proof of AI authorship._" }],
      },
    ],
  };
}

export function renderRateLimited(): SlackMessageView {
  return {
    text: "Foist needs a quick breather before analyzing more messages.",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: ":hourglass_flowing_sand: *Easy there, detective.*\nI've got too many specimens on the slab. Try again in about a minute.",
        },
      },
    ],
  };
}
