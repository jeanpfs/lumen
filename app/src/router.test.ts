import { describe, expect, it } from "vitest";
import { parseRoute, routeHash } from "./router";

describe("router", () => {
  it("falls back to home for unknown, empty and legacy hashes", () => {
    for (const h of ["", "#agenda", "#color", "#modes", "#scenes", "#connections", "#settings", "#types"]) {
      expect(parseRoute(h)).toEqual({ name: "home" });
    }
  });

  it("group and strip pages need an id and default to no tab", () => {
    expect(parseRoute("#group")).toEqual({ name: "home" });
    expect(parseRoute("#strip")).toEqual({ name: "home" });
    expect(parseRoute("#group/living-room")).toEqual({ name: "group", param: "living-room" });
    expect(parseRoute("#strip/a")).toEqual({ name: "strip", param: "a" });
  });

  it("reads the tab and the origin group", () => {
    expect(parseRoute("#strip/a/color")).toEqual({ name: "strip", param: "a", tab: "color" });
    expect(parseRoute("#group/living-room/modes")).toEqual({ name: "group", param: "living-room", tab: "modes" });
    expect(parseRoute("#strip/a/general?from=living-room")).toEqual({ name: "strip", param: "a", tab: "general", from: "living-room" });
  });

  it("ignores an unknown tab", () => {
    expect(parseRoute("#group/living-room/xyz")).toEqual({ name: "group", param: "living-room" });
  });

  it("round-trips ids that need escaping", () => {
    const r = { name: "group" as const, param: "a b/ç", tab: "color" as const };
    expect(parseRoute("#" + routeHash(r))).toEqual(r);
    const s = { name: "strip" as const, param: "x", tab: "general" as const, from: "a b" };
    expect(parseRoute("#" + routeHash(s))).toEqual(s);
  });

  it("the wizard still takes an optional strip id", () => {
    expect(parseRoute("#add/a")).toEqual({ name: "add", param: "a" });
    expect(parseRoute("#add")).toEqual({ name: "add" });
  });
});
