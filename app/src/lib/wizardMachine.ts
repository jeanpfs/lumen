import type { Capabilities, ProbeView } from "../api";
import type { IntensityPick } from "./wizard";
import { deduceOrder, intensityOutcome, toSeen } from "./wizard";
import type { ColourAnswer, OrderName } from "./wizard";

/** Titles of the nine steps, in order. */
export const WZ_STEPS = [
  "Scan",
  "Identify",
  "Recognize the type",
  "On/off",
  "Colors",
  "White and extras",
  "Intensity",
  "Effects",
  "Name and summary",
] as const;

/** Steps the user may skip without answering. */
export const WZ_SKIP: Readonly<Record<number, boolean>> = { 6: true, 7: true, 8: true };

/** The step where a recalibration starts: the strip is already known, so no search or recognition. */
export const RECALIBRATE_STEP = 4;

export type WizardError = "stalled" | "lost" | "contradict" | "bluetooth";
export type Recognition = "pending" | "recognized" | "exhausted";

export interface WizardModel {
  step: number;
  error: WizardError | null;
  recalibrate: boolean;
  help: boolean;
  /** Outcome of steps 2-3 (the strip's family). Recalibration starts as "recognized". */
  recognition: Recognition;
  /** Step 4: the user confirmed the strip went off and on. */
  powerOk: boolean;
  /** Step 5: how many of the three color tests have been answered, and what was said. */
  colourAnswers: ColourAnswer[];
  order: OrderName | null;
  /** Step 6: `null` until answered (or skipped). */
  hasWhite: boolean | null;
  /** Step 7: the two questions. */
  pick: IntensityPick;
  name: string;
  /** Step 3: the probe the strip is being asked about (`null` before the first one). */
  probe: ProbeView | null;
  /** Step 3: the recognized profile's catalogue id (`null` until recognized). */
  profileId: string | null;
  /** Step 3: what the recognized profile can do. */
  capabilities: Capabilities | null;
  /** Step 9: groups the strip joins once saved. */
  groups: string[];
  /** Step 9: optional first color (hue 0-360, saturation 0-100) sent to the new strip. */
  /**
   * The option picked on the current step but not committed yet (`null` = nothing picked): a strip id (step 1),
   * "yes"/"no" (steps 2, 4, 6 and the blink question of step 3), a `Seen` (color question of step 3) or a
   * `ColourAnswer` (step 5). Only "Continue" commits it; entering a step clears it.
   */
  choice: string | null;
}

export type WizardAction =
  | { type: "go"; step: number }
  | { type: "next" }
  | { type: "back" }
  | { type: "skip" }
  | { type: "error"; error: WizardError }
  | { type: "clearError" }
  | { type: "redo" }
  | { type: "recognition"; value: Recognition }
  | { type: "powerOk" }
  | { type: "colour"; answer: ColourAnswer }
  | { type: "choose"; value: string }
  | { type: "white"; value: boolean }
  | { type: "min"; value: IntensityPick["min"] }
  | { type: "diff"; value: IntensityPick["diff"] }
  | { type: "name"; value: string }
  | { type: "probe"; probe: ProbeView }
  | { type: "capabilities"; value: Capabilities; profileId: string }
  | { type: "group"; id: string }
  | { type: "seed"; name: string; groups: string[] }
  | { type: "help" };

export function initialModel(recalibrate = false, name = "", groups: string[] = []): WizardModel {
  return {
    step: recalibrate ? RECALIBRATE_STEP : 1,
    error: null,
    recalibrate,
    help: false,
    recognition: recalibrate ? "recognized" : "pending",
    powerOk: false,
    colourAnswers: [],
    order: null,
    hasWhite: null,
    pick: { min: null, diff: null },
    name,
    probe: null,
    profileId: null,
    capabilities: null,
    groups,
    choice: null,
  };
}

export const canNext = (m: WizardModel): boolean => {
  switch (m.step) {
    case 1:
    case 2:
      return m.choice !== null;
    case 3:
      return m.recognition === "recognized" || (m.recognition === "pending" && m.probe !== null && m.choice !== null);
    case 4:
      return m.powerOk || m.choice !== null;
    case 5:
      return m.order !== null || (m.colourAnswers.length < 3 && m.choice !== null);
    case 6:
      return m.choice !== null;
    case 7:
      return intensityOutcome(m.pick).kind === "ok";
    case 8:
      return true;
    case 9:
      return m.name.trim().length > 0;
    default:
      return false;
  }
};

export const backLeavesWizard = (m: WizardModel): boolean =>
  !m.error && (m.step === 1 || (m.recalibrate && m.step === RECALIBRATE_STEP));

/** Entering a step clears what that step collects, so it always starts clean. */
function enter(m: WizardModel, step: number): WizardModel {
  const s = Math.min(9, Math.max(1, step));
  // coming back to the white question shows the stored answer already picked
  const choice = s === 6 && m.hasWhite !== null ? (m.hasWhite ? "yes" : "no") : null;
  const next: WizardModel = { ...m, step: s, error: null, choice };
  if (s === 4) next.powerOk = false;
  if (s === 5) {
    next.colourAnswers = [];
    next.order = null;
  }
  return next;
}

/** Step 2 is consumed once confirmed, so going back from step 3 returns to the list. */
const backStep = (step: number) => (step === 3 ? 1 : step - 1);

export function wizardReducer(m: WizardModel, a: WizardAction): WizardModel {
  switch (a.type) {
    case "go":
      return enter(m, a.step);
    case "next": {
      if (!canNext(m)) return m;
      // steps 1 and 3 call the backend first (the screen does that); the others commit the pending choice here
      if (m.step === 2) return enter(m, m.choice === "no" ? 1 : 3);
      if (m.step === 4) {
        if (m.choice === "no") return { ...m, choice: null, error: "stalled" };
        return enter({ ...m, powerOk: true }, 5);
      }
      if (m.step === 5 && m.order === null) {
        return wizardReducer({ ...m, choice: null }, { type: "colour", answer: m.choice as ColourAnswer });
      }
      if (m.step === 6) return enter({ ...m, hasWhite: m.choice === "yes" }, 7);
      return enter(m, m.step + 1);
    }
    case "skip": {
      if (!WZ_SKIP[m.step]) return m;
      const cleared: WizardModel =
        m.step === 6 ? { ...m, hasWhite: false } : m.step === 7 ? { ...m, pick: { min: null, diff: null } } : m;
      return enter(cleared, m.step + 1);
    }
    case "back": {
      // a contradictory set of color answers is thrown away, like `redo`: keeping it would put the question index past the third color
      if (m.error === "contradict" && m.step === 5) return { ...m, error: null, colourAnswers: [], order: null, choice: null };
      if (m.error) return { ...m, error: null };
      if (m.step === 5 && m.colourAnswers.length > 0 && m.order === null) {
        // the answer being taken back comes up picked again
        return { ...m, colourAnswers: m.colourAnswers.slice(0, -1), choice: m.colourAnswers[m.colourAnswers.length - 1] };
      }
      if (backLeavesWizard(m)) return m;
      return enter(m, backStep(m.step));
    }
    case "error":
      return { ...m, error: a.error };
    case "clearError":
      return { ...m, error: null };
    case "redo":
      // "Redo the step": drops the answers that contradicted each other
      if (m.step === 5) return { ...m, error: null, colourAnswers: [], order: null, choice: null };
      if (m.step === 7) return { ...m, error: null, pick: { min: null, diff: null } };
      return { ...m, error: null };
    case "choose":
      return { ...m, choice: a.value };
    case "recognition":
      return { ...m, recognition: a.value, choice: null };
    case "powerOk":
      return { ...m, powerOk: true };
    case "colour": {
      if (m.order !== null || m.colourAnswers.length >= 3) return m;
      const colourAnswers = [...m.colourAnswers, a.answer];
      if (colourAnswers.length < 3) return { ...m, colourAnswers, choice: null };
      const [x, y, z] = colourAnswers.map(toSeen);
      const order = deduceOrder([x, y, z]);
      return order
        ? { ...m, colourAnswers, order, choice: null }
        : { ...m, colourAnswers, order: null, choice: null, error: "contradict" };
    }
    case "white":
      return { ...m, hasWhite: a.value, choice: a.value ? "yes" : "no" };
    case "min":
    case "diff": {
      const pick = { ...m.pick, [a.type]: a.value };
      return { ...m, pick, error: intensityOutcome(pick).kind === "bad" ? "contradict" : m.error };
    }
    case "name":
      return { ...m, name: a.value };
    case "probe":
      return { ...m, probe: a.probe, choice: null };
    case "capabilities":
      return { ...m, capabilities: a.value, profileId: a.profileId };
    case "group":
      return { ...m, groups: m.groups.includes(a.id) ? m.groups.filter((g) => g !== a.id) : [...m.groups, a.id] };
    case "seed":
      // the saved strip's name and groups, once the snapshot has loaded; never overwrites what the user typed
      return {
        ...m,
        name: m.name || a.name,
        groups: [...m.groups, ...a.groups.filter((g) => !m.groups.includes(g))],
      };
    case "help":
      return { ...m, help: !m.help };
  }
}
