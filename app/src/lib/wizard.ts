import type { IntensityAnswer, Seen } from "../api";

/** Brightness levels of step 7 (percent), mirror of `INTENSITY_LEVELS` in the Rust core. */
export const LEVELS_PERCENT = [100, 70, 40, 20, 10, 3] as const;

export type ColourAnswer = "R" | "G" | "B" | "Y" | "W" | "N";

export const toSeen = (a: ColourAnswer): Seen =>
  a === "R" ? "red" : a === "G" ? "green" : a === "B" ? "blue" : "other";

export type OrderName = "Rgb" | "Rbg" | "Grb" | "Gbr" | "Brg" | "Bgr";

/** Mirror of `deduce_channel_order`: the colors seen for wire bytes 0, 1, 2. */
export function deduceOrder(seen: [Seen, Seen, Seen]): OrderName | null {
  const letter = (s: Seen) => (s === "red" ? "R" : s === "green" ? "G" : s === "blue" ? "B" : null);
  const l = seen.map(letter);
  if (l.some((x) => x === null) || new Set(l).size !== 3) return null;
  const name = l.join("");
  return (name[0] + name.slice(1).toLowerCase()) as OrderName;
}

export const ORDER_MESSAGE: Record<OrderName, string> = {
  Rgb: "RGB order: colors already arrive correct. Nothing to fix.",
  Grb: "Green and red are swapped — fixed automatically.",
  Bgr: "Blue and red are swapped — fixed automatically.",
  Rbg: "Green and blue are swapped — fixed automatically.",
  Brg: "All three channels are rotated (BRG) — fixed automatically.",
  Gbr: "All three channels are rotated (GBR) — fixed automatically.",
};

export interface IntensityPick {
  /** Index in `LEVELS_PERCENT` of the dimmest level that still lights, or "none". */
  min: number | "none" | null;
  /** First index where the user stops seeing a difference, or "all" when every step differs. */
  diff: number | "all" | null;
}

export type IntensityOutcome =
  | { kind: "pending" }
  | { kind: "bad" }
  | { kind: "ok"; steps: number; minPercent: number; answers: IntensityAnswer[] };

/** Turns the two questions of step 7 into the six answers the backend analyses. */
export function intensityOutcome(p: IntensityPick): IntensityOutcome {
  if (p.min === null || p.diff === null) return { kind: "pending" };
  if (p.min === "none") return { kind: "bad" };
  if (p.diff !== "all" && p.diff > p.min) return { kind: "bad" };
  const answers = LEVELS_PERCENT.map((_, i) => {
    const lit = i <= (p.min as number);
    return { lit, differs: lit && (p.diff === "all" ? true : i < (p.diff as number)) };
  });
  return {
    kind: "ok",
    steps: answers.filter((a) => a.differs).length,
    minPercent: LEVELS_PERCENT[p.min],
    answers,
  };
}

export type { IntensityAnswer };
