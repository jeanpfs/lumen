import { beforeEach, describe, expect, it } from "vitest";
import { EMPTY, loadPersisted, savePersisted } from "./persist";

const KEY = "lumen.state.v2";

beforeEach(() => localStorage.clear());

describe("persisted state", () => {
  it("returns defaults when nothing was saved", () => {
    expect(loadPersisted()).toEqual(EMPTY);
  });

  it("round-trips everything the app remembers", () => {
    const saved = {
      presumed: { "strip:a": { on: true, h: 10, s: 20, b: 30 } },
      favourites: [{ h: 1, s: 2 }],
      overrides: ["a"],
      theme: "light" as const,
      onboarded: true,
    };
    savePersisted(saved);
    expect(loadPersisted()).toEqual(saved);
  });

  it("falls back to defaults on corrupt JSON", () => {
    localStorage.setItem(KEY, "{not json");
    expect(loadPersisted()).toEqual(EMPTY);
  });

  it("drops only the malformed fields and keeps the valid ones", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        presumed: { good: { on: true, h: 1, s: 1, b: 1 }, bad: { on: "yes" } },
        favourites: [{ h: 1, s: 2 }, "nope"],
        theme: "purple",
        onboarded: "true",
        target: { kind: "group", id: "living-room" },
      }),
    );
    const p = loadPersisted();
    expect(Object.keys(p.presumed)).toEqual(["good"]);
    expect(p.favourites).toEqual([{ h: 1, s: 2 }]);
    expect(p.theme).toBe("dark");
    expect(p.onboarded).toBe(false);
    expect("target" in p).toBe(false);
  });

  it("does not throw when storage is unavailable", () => {
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
    try {
      expect(() => savePersisted({ ...EMPTY })).not.toThrow();
    } finally {
      Storage.prototype.setItem = real;
    }
  });
});
