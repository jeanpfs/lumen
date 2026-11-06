import { describe, expect, it } from "vitest";
import { BASE_FX, emptyLayout, evalFx, orderedStrips, pathCells, pruneLayout, walkOrder, type Layout } from "./panel";

const full = (cols: number, rows: number, start: Layout["start"] = "tl", walk: Layout["walk"] = "snake"): Layout => ({
  ...emptyLayout(cols, rows),
  cells: Array.from({ length: cols * rows }, (_, i) => `s${i}`),
  start,
  walk,
});

describe("walkOrder", () => {
  it("snakes through rows from the chosen corner", () => {
    expect(walkOrder(full(3, 2))).toEqual([0, 1, 2, 5, 4, 3]);
    expect(walkOrder(full(3, 2, "br"))).toEqual([5, 4, 3, 0, 1, 2]);
  });
  it("sweeps rows or columns without snaking", () => {
    expect(walkOrder(full(3, 2, "tl", "row"))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(walkOrder(full(3, 2, "tl", "col"))).toEqual([0, 3, 1, 4, 2, 5]);
    expect(walkOrder(full(3, 2, "tr", "col"))).toEqual([2, 5, 1, 4, 0, 3]);
  });
});

describe("pathCells", () => {
  it("visits every square once whatever the path", () => {
    for (const path of ["order", "rows", "cols", "diag", "spiral", "center", "rand"] as const) {
      const cells = pathCells({ path, draw: [] }, full(4, 3));
      expect([...cells].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, i) => i));
    }
  });
  it("spirals inwards", () => {
    expect(pathCells({ path: "spiral", draw: [] }, full(3, 3))).toEqual([0, 1, 2, 5, 8, 7, 6, 3, 4]);
  });
  it("skips empty squares and bad or repeated drawn squares", () => {
    const l = full(2, 2);
    l.cells[1] = null;
    expect(pathCells({ path: "rows", draw: [] }, l)).toEqual([0, 2, 3]);
    expect(pathCells({ path: "draw", draw: [3, 1, 3, 9, 0] }, l)).toEqual([3, 0]);
  });
});

describe("evalFx", () => {
  it("lights the head of a running light and fades the trail behind it", () => {
    // speed 2/3 and 1.5 squares per speed unit: the head moves 1 square per second
    const fx = { ...BASE_FX, speed: 2 / 3, trail: 2 };
    const [a, b, c, d] = evalFx(fx, 6, 2.5); // head at 2.5
    expect(a.k).toBe(0.08); // passed beyond the trail
    expect(b.k).toBeCloseTo(0.25, 5);
    expect(c.k).toBeCloseTo(0.75, 5);
    expect(d.k).toBe(0.08); // not reached yet
  });
  it("makes every Nth square strobe white after N steady ones", () => {
    const fx = { ...BASE_FX, act: "fixed" as const, rule: true, n: 4 };
    const steps = evalFx(fx, 10, 0);
    expect(steps.map((s) => s.white)).toEqual([false, false, false, false, true, false, false, false, false, true]);
    expect(steps.filter((s) => !s.white).every((s) => s.k === 1)).toBe(true);
  });
  it("ping-pong turns around at the end instead of wrapping", () => {
    const fx = { ...BASE_FX, pingPong: true, trail: 1, speed: 2 / 3 };
    const lit = (t: number) => evalFx(fx, 4, t).findIndex((s) => s.k > 0.5);
    expect([0.1, 1.1, 2.1, 3.1, 4.1, 5.1].map(lit)).toEqual([0, 1, 2, 3, 2, 1]);
  });
});

describe("pruneLayout / orderedStrips", () => {
  it("forgets strips that left the group and lists the rest in sweep order", () => {
    const l = pruneLayout(full(3, 2), ["s0", "s4", "s5"]);
    expect(l.cells).toEqual(["s0", null, null, null, "s4", "s5"]);
    expect(orderedStrips(l)).toEqual(["s0", "s5", "s4"]);
  });
});
