import { describe, expect, it } from "vitest";
import {
  RECALIBRATE_STEP,
  WZ_SKIP,
  backLeavesWizard,
  canNext,
  initialModel,
  wizardReducer,
  type WizardModel,
} from "./wizardMachine";
import { intensityOutcome } from "./wizard";

describe("wizardMachine: model and reducer", () => {
  describe("initialModel", () => {
    it("starts at step 1 normally", () => {
      const m = initialModel();
      expect(m.step).toBe(1);
      expect(m.recalibrate).toBe(false);
      expect(m.recognition).toBe("pending");
    });

    it("starts at step 4 when recalibrating", () => {
      const m = initialModel(true, "My Strip");
      expect(m.step).toBe(RECALIBRATE_STEP);
      expect(m.recalibrate).toBe(true);
      expect(m.recognition).toBe("recognized");
      expect(m.name).toBe("My Strip");
    });
  });

  describe("recognized profile and recalibration groups", () => {
    it("keeps the recognized profile id", () => {
      const caps = { color: true, brightness: true, white: false, effects: false, microphone: false };
      const m = wizardReducer(initialModel(), { type: "capabilities", value: caps, profileId: "mrstar" });
      expect(m.profileId).toBe("mrstar");
      expect(m.capabilities).toEqual(caps);
    });

    it("preselects the groups the strip is already in", () => {
      expect(initialModel(true, "A", ["living-room"]).groups).toEqual(["living-room"]);
    });
  });

  describe("canNext", () => {
    it("step 1: always false (no next button, picks from list)", () => {
      expect(canNext(initialModel())).toBe(false);
    });


    it("step 2: false without choice, true with choice (yes/no)", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 2 });
      expect(canNext(m)).toBe(false);
      expect(canNext(wizardReducer(m, { type: "choose", value: "yes" }))).toBe(true);
      expect(canNext(wizardReducer(m, { type: "choose", value: "no" }))).toBe(true);
    });


    it("step 3: true when recognized, or when choice is picked during probing (blink/color)", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 3 });
      expect(canNext(m)).toBe(false);
      // recognized state
      expect(canNext(wizardReducer(m, { type: "recognition", value: "recognized" }))).toBe(true);
      // probing state (blink phase)
      const m2 = wizardReducer(wizardReducer(m, { type: "probe", probe: { index: 1, total: 5, phase: "blink", profile_id: "mrstar", commands: [] } }), { type: "choose", value: "yes" });
      expect(canNext(m2)).toBe(true);
      // exhausted state
      expect(canNext(wizardReducer(m, { type: "recognition", value: "exhausted" }))).toBe(false);
    });


    it("step 4: true only when choice is set (yes/no)", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 4 });
      expect(canNext(m)).toBe(false);
      expect(canNext(wizardReducer(m, { type: "choose", value: "yes" }))).toBe(true);
      expect(canNext(wizardReducer(m, { type: "choose", value: "no" }))).toBe(true);
    });

    it("step 5: true only when order is known", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 5 });
      expect(canNext(m)).toBe(false);
      const after1 = wizardReducer(m, { type: "colour", answer: "R" });
      expect(canNext(after1)).toBe(false);
      const after2 = wizardReducer(after1, { type: "colour", answer: "G" });
      expect(canNext(after2)).toBe(false);
      const after3 = wizardReducer(after2, { type: "colour", answer: "B" });
      expect(canNext(after3)).toBe(true);
      expect(after3.order).toBe("Rgb");
    });


    it("step 6: true only when hasWhite choice is set (yes/no)", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 6 });
      expect(canNext(m)).toBe(false);
      expect(canNext(wizardReducer(m, { type: "choose", value: "yes" }))).toBe(true);
      expect(canNext(wizardReducer(m, { type: "choose", value: "no" }))).toBe(true);
    });

    it("step 7: true only when intensity answers are valid", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 7 });
      expect(canNext(m)).toBe(false);
      const withMin = wizardReducer(m, { type: "min", value: 3 });
      expect(canNext(withMin)).toBe(false);
      const withBoth = wizardReducer(withMin, { type: "diff", value: 2 });
      expect(canNext(withBoth)).toBe(true);
    });

    it("step 8: always true (optional)", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 8 });
      expect(canNext(m)).toBe(true);
    });

    it("step 9: true only when name is not empty", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 9 });
      expect(canNext(m)).toBe(false);
      expect(canNext(wizardReducer(m, { type: "name", value: "  " }))).toBe(false);
      expect(canNext(wizardReducer(m, { type: "name", value: "Living room" }))).toBe(true);
    });
  });

  describe("step transitions", () => {
    it("next() advances only when canNext is true", () => {
      const m = wizardReducer(initialModel(), { type: "next" });
      expect(m.step).toBe(1); // unchanged
      const recognized = wizardReducer(m, { type: "recognition", value: "recognized" });
      const m3 = wizardReducer(recognized, { type: "go", step: 3 });
      expect(canNext(m3)).toBe(true);
      const m4 = wizardReducer(m3, { type: "next" });
      expect(m4.step).toBe(4);
    });

    it("entering step 4 clears powerOk", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 4 });
      expect(m.powerOk).toBe(false);
    });

    it("entering step 5 clears color answers and order", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 5 });
      expect(m.colourAnswers).toEqual([]);
      expect(m.order).toBeNull();
    });

    it("back() goes to previous step", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 3 });
      const back = wizardReducer(m, { type: "back" });
      expect(back.step).toBe(1); // step 2 is consumed after identify
    });

    it("back() from step 1 is a no-op (stays at step 1)", () => {
      const m = initialModel();
      const back = wizardReducer(m, { type: "back" });
      expect(back.step).toBe(1);
    });

    it("back() during recalibration from step 4 is a no-op", () => {
      const m = initialModel(true);
      const back = wizardReducer(m, { type: "back" });
      expect(back.step).toBe(RECALIBRATE_STEP);
    });

    it("back() in color step without full answers goes back one answer", () => {
      let m = wizardReducer(initialModel(), { type: "go", step: 5 });
      m = wizardReducer(m, { type: "colour", answer: "R" });
      m = wizardReducer(m, { type: "colour", answer: "G" });
      expect(m.colourAnswers).toEqual(["R", "G"]);
      const back = wizardReducer(m, { type: "back" });
      expect(back.colourAnswers).toEqual(["R"]);
      expect(back.step).toBe(5);
    });
  });

  describe("skip rules", () => {
    it("WZ_SKIP has only 6, 7, 8", () => {
      expect(Object.keys(WZ_SKIP).map(Number)).toEqual([6, 7, 8]);
      for (let i = 1; i <= 9; i++) {
        if (i !== 6 && i !== 7 && i !== 8) {
          expect(WZ_SKIP[i]).toBeFalsy();
        }
      }
    });

    it("skip() on step 6 sets hasWhite to false and goes to step 7", () => {
      let m = wizardReducer(initialModel(), { type: "go", step: 6 });
      expect(m.hasWhite).toBeNull();
      m = wizardReducer(m, { type: "skip" });
      expect(m.step).toBe(7);
      expect(m.hasWhite).toBe(false);
    });

    it("skip() on step 7 clears intensity and goes to step 8", () => {
      let m = wizardReducer(initialModel(), { type: "go", step: 7 });
      m = wizardReducer(m, { type: "min", value: 1 });
      m = wizardReducer(m, { type: "diff", value: 3 });
      expect(m.pick).toEqual({ min: 1, diff: 3 });
      m = wizardReducer(m, { type: "skip" });
      expect(m.step).toBe(8);
      expect(m.pick).toEqual({ min: null, diff: null });
    });

    it("skip() on step 8 goes to step 9", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 8 });
      const skipped = wizardReducer(m, { type: "skip" });
      expect(skipped.step).toBe(9);
    });

    it("skip() on non-skippable step is a no-op", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 5 });
      const noOp = wizardReducer(m, { type: "skip" });
      expect(noOp.step).toBe(5);
    });
  });

  describe("color test and contradiction", () => {
    it("collects three color answers then deduces order", () => {
      let m = wizardReducer(initialModel(), { type: "go", step: 5 });
      m = wizardReducer(m, { type: "colour", answer: "R" });
      expect(m.colourAnswers).toEqual(["R"]);
      expect(m.order).toBeNull();
      m = wizardReducer(m, { type: "colour", answer: "G" });
      expect(m.colourAnswers).toEqual(["R", "G"]);
      expect(m.order).toBeNull();
      m = wizardReducer(m, { type: "colour", answer: "B" });
      expect(m.colourAnswers).toEqual(["R", "G", "B"]);
      expect(m.order).toBe("Rgb");
      expect(m.error).toBeNull();
    });

    it("going back from a contradiction starts the color test over instead of keeping three answers", () => {
      let m = wizardReducer(initialModel(), { type: "go", step: 5 });
      for (const answer of ["R", "G", "R"] as const) m = wizardReducer(m, { type: "colour", answer });
      expect(m.error).toBe("contradict");

      m = wizardReducer(m, { type: "back" });

      expect(m.error).toBeNull();
      expect(m.step).toBe(5);
      expect(m.colourAnswers).toEqual([]);
    });

    it("contradicts on duplicate color answer", () => {
      let m = wizardReducer(initialModel(), { type: "go", step: 5 });
      m = wizardReducer(m, { type: "colour", answer: "R" });
      m = wizardReducer(m, { type: "colour", answer: "G" });
      m = wizardReducer(m, { type: "colour", answer: "R" }); // duplicate
      expect(m.error).toBe("contradict");
      expect(m.order).toBeNull();
    });

    it("contradicts when 'other' appears (no distinct RGB)", () => {
      let m = wizardReducer(initialModel(), { type: "go", step: 5 });
      m = wizardReducer(m, { type: "colour", answer: "R" });
      m = wizardReducer(m, { type: "colour", answer: "G" });
      m = wizardReducer(m, { type: "colour", answer: "N" }); // nothing
      expect(m.error).toBe("contradict");
      expect(m.order).toBeNull();
    });

    it("redo() on step 5 clears answers and order", () => {
      let m = wizardReducer(initialModel(), { type: "go", step: 5 });
      m = wizardReducer(m, { type: "colour", answer: "R" });
      m = wizardReducer(m, { type: "colour", answer: "G" });
      m = wizardReducer(m, { type: "colour", answer: "R" }); // error
      expect(m.error).toBe("contradict");
      m = wizardReducer(m, { type: "redo" });
      expect(m.error).toBeNull();
      expect(m.colourAnswers).toEqual([]);
      expect(m.order).toBeNull();
    });

    it("redo() on step 7 clears intensity pick", () => {
      let m = wizardReducer(initialModel(), { type: "go", step: 7 });
      m = wizardReducer(m, { type: "min", value: 1 });
      m = wizardReducer(m, { type: "diff", value: 3 });
      m = wizardReducer(m, { type: "diff", value: 5 }); // bad: diff > min
      expect(m.error).toBe("contradict");
      m = wizardReducer(m, { type: "redo" });
      expect(m.error).toBeNull();
      expect(m.pick).toEqual({ min: null, diff: null });
    });

    it("back() with error clears the error and stays at same step", () => {
      let m = wizardReducer(initialModel(), { type: "go", step: 5 });
      m = wizardReducer(m, { type: "colour", answer: "R" });
      m = wizardReducer(m, { type: "colour", answer: "G" });
      m = wizardReducer(m, { type: "colour", answer: "R" }); // error
      const beforeBack = m.step;
      m = wizardReducer(m, { type: "back" });
      expect(m.step).toBe(beforeBack);
      expect(m.error).toBeNull();
    });
  });

  describe("intensity result", () => {
    it("bad when min is 'none'", () => {
      const m: WizardModel = {
        ...initialModel(),
        pick: { min: "none", diff: 2 },
      };
      expect(intensityOutcome(m.pick)).toEqual({ kind: "bad" });
    });

    it("bad when diff > min", () => {
      const m: WizardModel = {
        ...initialModel(),
        pick: { min: 2, diff: 4 },
      };
      expect(intensityOutcome(m.pick)).toEqual({ kind: "bad" });
    });

    it("ok when diff <= min", () => {
      const m: WizardModel = {
        ...initialModel(),
        pick: { min: 3, diff: 2 },
      };
      const result = intensityOutcome(m.pick);
      expect(result.kind).toBe("ok");
      if (result.kind === "ok") {
        expect(result.steps).toBe(2);
        expect(result.minPercent).toBe(20);
      }
    });

    it("sets error when answer is bad", () => {
      let m = wizardReducer(initialModel(), { type: "go", step: 7 });
      m = wizardReducer(m, { type: "min", value: 2 });
      expect(m.error).toBeNull();
      m = wizardReducer(m, { type: "diff", value: 4 }); // bad: 4 > 2
      expect(m.error).toBe("contradict");
    });
  });

  describe("recalibration", () => {
    it("starts at step 4 with recognized already set", () => {
      const m = initialModel(true);
      expect(m.step).toBe(RECALIBRATE_STEP);
      expect(m.recognition).toBe("recognized");
      expect(m.recalibrate).toBe(true);
    });

    it("back at step 4 during recal is no-op (does not leave)", () => {
      const m = initialModel(true);
      const back = wizardReducer(m, { type: "back" });
      expect(back.step).toBe(RECALIBRATE_STEP);
    });

    it("canNext at step 4 requires powerOk", () => {
      const m = initialModel(true);
      expect(canNext(m)).toBe(false);
      expect(canNext(wizardReducer(m, { type: "powerOk" }))).toBe(true);
    });
  });

  describe("help toggle", () => {
    it("toggles help state", () => {
      let m = initialModel();
      expect(m.help).toBe(false);
      m = wizardReducer(m, { type: "help" });
      expect(m.help).toBe(true);
      m = wizardReducer(m, { type: "help" });
      expect(m.help).toBe(false);
    });
  });

  describe("backLeavesWizard", () => {
    it("true at step 1 without error", () => {
      const m = initialModel();
      expect(backLeavesWizard(m)).toBe(true);
    });

    it("false at step 2", () => {
      const m = wizardReducer(initialModel(), { type: "go", step: 2 });
      expect(backLeavesWizard(m)).toBe(false);
    });

    it("true during recal at step 4 without error", () => {
      const m = initialModel(true);
      expect(backLeavesWizard(m)).toBe(true);
    });

    it("false if there is an error", () => {
      const m: WizardModel = { ...initialModel(), error: "stalled" };
      expect(backLeavesWizard(m)).toBe(false);
    });
  });

  describe("name input", () => {
    it("accepts name change", () => {
      let m = wizardReducer(initialModel(), { type: "go", step: 9 });
      expect(m.name).toBe("");
      m = wizardReducer(m, { type: "name", value: "My Bedroom" });
      expect(m.name).toBe("My Bedroom");
      expect(canNext(m)).toBe(true);
    });

    it("trim() when checking canNext", () => {
      let m = wizardReducer(initialModel(), { type: "go", step: 9 });
      m = wizardReducer(m, { type: "name", value: "   " });
      expect(canNext(m)).toBe(false);
      m = wizardReducer(m, { type: "name", value: " X " });
      expect(canNext(m)).toBe(true);
    });
  });
});
