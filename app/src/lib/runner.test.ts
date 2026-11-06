import { describe, expect, it } from "vitest";
import { plan } from "./runner";

const m = (o: Record<string, string>) => new Map(Object.entries(o));

describe("plan", () => {
  it("sends nothing while nothing changes", () => {
    const s = m({ a: "base", b: "off" });
    expect(plan(s, s)).toEqual({ on: [], off: [], white: [], base: [] });
  });
  it("lights a strip that was dark and darkens one that was lit", () => {
    expect(plan(m({ a: "off", b: "base" }), m({ a: "base", b: "off" }))).toEqual({ on: ["a"], off: ["b"], white: [], base: [] });
  });
  it("turns a strip white to strobe, and gives its color back before it goes dark", () => {
    expect(plan(m({ a: "off" }), m({ a: "white" }))).toEqual({ on: ["a"], off: [], white: ["a"], base: [] });
    expect(plan(m({ a: "white" }), m({ a: "off" }))).toEqual({ on: [], off: ["a"], white: [], base: ["a"] });
    expect(plan(m({ a: "white" }), m({ a: "base" }))).toEqual({ on: [], off: [], white: [], base: ["a"] });
  });
  it("treats a strip it has not sent anything to yet as dark", () => {
    expect(plan(new Map(), m({ a: "off", b: "base" }))).toEqual({ on: ["b"], off: [], white: [], base: [] });
  });
});
