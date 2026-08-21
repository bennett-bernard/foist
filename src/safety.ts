import { createHash } from "node:crypto";

export function makeSafetyIdentifier(teamId: string, userId: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${teamId}:${userId}`).digest("hex");
}
