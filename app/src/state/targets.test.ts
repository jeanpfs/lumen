import { describe, expect, it } from "vitest";
import { findTarget, targetStatus } from "./targets";
import { snapshot } from "../test/fakeBackend";
import { reducer } from "./store";
import type { State } from "./types";

const empty = (): State => ({
  snapshot,
  loaded: true,
  unavailable: null,
  presumed: {},
  link: {},
  favourites: [],
  overrides: [],
  theme: "dark",
  onboarded: true,
  events: [],
  bluetooth: "on",
  effects: {},
  toast: null,
});

describe("targets", () => {
  it("finds a group with its members and a strip alone", () => {
    expect(findTarget(snapshot, { kind: "group", id: "living-room" })).toEqual({ name: "Living room", members: ["a", "b"] });
    expect(findTarget(snapshot, { kind: "strip", id: "c" })).toEqual({ name: "C", members: ["c"] });
  });

  it("returns null for an id that does not exist", () => {
    expect(findTarget(snapshot, { kind: "group", id: "nope" })).toBeNull();
    expect(findTarget(snapshot, { kind: "strip", id: "nope" })).toBeNull();
  });

  it("findTarget fallback handles non-existent groups", () => {
    let s = empty();
    s = reducer(s, { type: "presumed", keys: ["group:nope"], patch: { on: true } });
    expect(() => targetStatus(s, { kind: "group", id: "nope" })).not.toThrow();
    expect(targetStatus(s, { kind: "group", id: "nope" }).k).toBe("on");
  });

  it("a group is unreachable when every member is", () => {
    let s = empty();
    s = reducer(s, { type: "presumed", keys: ["group:living-room"], patch: { on: true } });
    s = reducer(s, { type: "link", ids: ["a", "b"], link: "unreachable" });
    expect(targetStatus(s, { kind: "group", id: "living-room" }).k).toBe("unreachable");
  });

  it("a group is partial when some members are unreachable", () => {
    let s = empty();
    s = reducer(s, { type: "presumed", keys: ["group:living-room"], patch: { on: true } });
    s = reducer(s, { type: "link", ids: ["a"], link: "unreachable" });
    expect(targetStatus(s, { kind: "group", id: "living-room" }).k).toBe("partial");
  });

  it("a strip is unreachable when its link is", () => {
    let s = empty();
    s = reducer(s, { type: "presumed", keys: ["strip:c"], patch: { on: true } });
    s = reducer(s, { type: "link", ids: ["c"], link: "unreachable" });
    expect(targetStatus(s, { kind: "strip", id: "c" }).k).toBe("unreachable");
  });
});
