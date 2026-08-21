const MAX_MESSAGE_CHARS = 12_000;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addText(value: unknown, output: string[]): void {
  if (typeof value !== "string") return;
  const normalized = value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (normalized) output.push(normalized);
}

function collectBlockText(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectBlockText(item, output);
    return;
  }
  if (!isRecord(value)) return;

  if (typeof value.text === "string") addText(value.text, output);
  if (isRecord(value.text)) addText(value.text.text, output);

  for (const key of ["elements", "fields", "blocks"]) {
    collectBlockText(value[key], output);
  }
}

function uniqueJoin(parts: string[]): string {
  const seen = new Set<string>();
  const unique = parts.filter((part) => {
    const key = part.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.join("\n\n");
}

function collectAttachments(attachments: unknown): string {
  if (!Array.isArray(attachments)) return "";

  const parts: string[] = [];
  for (const attachment of attachments) {
    if (!isRecord(attachment)) continue;
    const countBeforeAttachment = parts.length;
    addText(attachment.pretext, parts);
    addText(attachment.title, parts);
    addText(attachment.text, parts);
    collectBlockText(attachment.blocks, parts);
    if (parts.length === countBeforeAttachment) addText(attachment.fallback, parts);
  }
  return uniqueJoin(parts);
}

/** Extracts the authored text from ordinary, forwarded, and shortcut Slack messages. */
export function extractMessageText(message: unknown): string {
  if (!isRecord(message)) return "";

  // Slack forwards and message shares commonly put the original content in an attachment.
  // Prefer it over the forwarding user's optional preface.
  const attachmentText = collectAttachments(message.attachments);
  if (attachmentText) return attachmentText.slice(0, MAX_MESSAGE_CHARS);

  const blockParts: string[] = [];
  collectBlockText(message.blocks, blockParts);
  const blockText = uniqueJoin(blockParts);
  const topLevelText = typeof message.text === "string" ? message.text.trim() : "";

  return (blockText || topLevelText).slice(0, MAX_MESSAGE_CHARS);
}

export function isTruncatedMessage(message: unknown): boolean {
  if (!isRecord(message)) return false;
  const attachmentText = collectAttachments(message.attachments);
  if (attachmentText) return attachmentText.length > MAX_MESSAGE_CHARS;
  const parts: string[] = [];
  collectBlockText(message.blocks, parts);
  return (uniqueJoin(parts) || (typeof message.text === "string" ? message.text : "")).length > MAX_MESSAGE_CHARS;
}

export const messageLimits = {
  maxCharacters: MAX_MESSAGE_CHARS,
  minimumUsefulCharacters: 40,
} as const;
