import { describe, expect, it } from "vitest";
import { deduceOrder, intensityOutcome, LEVELS_PERCENT, toSeen } from "./wizard";

describe("color answers", () => {
  it("maps the six answers to what the backend understands", () => {
    expect(["R", "G", "B", "Y", "W", "N"].map((a) => toSeen(a as never))).toEqual([
      "red",
      "green",
      "blue",
      "other",
      "other",
      "other",
    ]);
  });

  it("deduces the channel order from the colors seen per wire byte", () => {
    expect(deduceOrder(["red", "green", "blue"])).toBe("Rgb");
    expect(deduceOrder(["green", "red", "blue"])).toBe("Grb");
    expect(deduceOrder(["blue", "green", "red"])).toBe("Bgr");
    expect(deduceOrder(["red", "blue", "green"])).toBe("Rbg");
  });

  it("rejects repeats and colors outside red, green and blue", () => {
    expect(deduceOrder(["red", "red", "blue"])).toBeNull();
    expect(deduceOrder(["red", "other", "blue"])).toBeNull();
  });
});

describe("intensity answers", () => {
  it("is pending until both questions are answered", () => {
    expect(intensityOutcome({ min: null, diff: 2 }).kind).toBe("pending");
    expect(intensityOutcome({ min: 3, diff: null }).kind).toBe("pending");
  });

  it("every step differs and all six levels light", () => {
    const o = intensityOutcome({ min: 5, diff: "all" });
    expect(o).toMatchObject({ kind: "ok", steps: 6, minPercent: 3 });
    if (o.kind === "ok") expect(o.answers.every((a) => a.lit && a.differs)).toBe(true);
  });

  it("stops counting steps where the user stops seeing a difference", () => {
    const o = intensityOutcome({ min: 5, diff: 3 });
    expect(o).toMatchObject({ kind: "ok", steps: 3, minPercent: 3 });
    if (o.kind === "ok") {
      expect(o.answers.map((a) => a.differs)).toEqual([true, true, true, false, false, false]);
      expect(o.answers.map((a) => a.lit)).toEqual([true, true, true, true, true, true]);
    }
  });

  it("levels below the minimum are dark and never differ", () => {
    const o = intensityOutcome({ min: 3, diff: "all" });
    expect(o).toMatchObject({ kind: "ok", steps: 4, minPercent: LEVELS_PERCENT[3] });
    if (o.kind === "ok") expect(o.answers.map((a) => a.lit)).toEqual([true, true, true, true, false, false]);
  });

  it("nothing lit, or a difference beyond the minimum, is contradictory", () => {
    expect(intensityOutcome({ min: "none", diff: "all" }).kind).toBe("bad");
    expect(intensityOutcome({ min: 2, diff: 4 }).kind).toBe("bad");
  });
});
