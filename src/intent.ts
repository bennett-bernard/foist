export type FoistDecision = "yes" | "no" | null;

export function parseFoistDecision(text: string | undefined): FoistDecision {
  const normalized = text?.trim().toLocaleLowerCase().replace(/[.!?]+$/, "");
  if (!normalized) return null;

  if (["y", "yes", "yep", "yeah", "do it", "foist it", "foist back"].includes(normalized)) {
    return "yes";
  }
  if (["n", "no", "nope", "nah", "mercy"].includes(normalized)) return "no";
  return null;
}
