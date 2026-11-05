import { describe, expect, it } from "vitest";
import { targets } from "../i18n/targets";
import { groupStatus, stripStatus } from "./status";
import { DEFAULT_PRESUMED } from "./types";

const on = { ...DEFAULT_PRESUMED, on: true, b: 80 };
const S = targets.en.status;

describe("strip status", () => {
  it("reports what was last sent, with brightness when on", () => {
    expect(stripStatus(on, "live", false, S)).toEqual({ k: "on", label: "On · 80%" });
    expect(stripStatus(DEFAULT_PRESUMED, "live", false, S)).toEqual({ k: "off", label: "Off" });
  });

  it("puts reachability before power", () => {
    expect(stripStatus(on, "unreachable", false, S).k).toBe("unreachable");
    expect(stripStatus(on, "retrying", false, S).label).toBe("Retrying…");
  });

  it("an unavailable backend wins over everything", () => {
    expect(stripStatus(on, "live", true, S).label).toBe("Bluetooth unavailable");
  });
});

describe("group status", () => {
  it("is off when the group is off, whatever the members say", () => {
    expect(groupStatus(DEFAULT_PRESUMED, ["unreachable"], false, S).k).toBe("off");
  });

  it("is partial with a pluralised count when some members are unreachable", () => {
    expect(groupStatus(on, ["live", "unreachable"], false, S).label).toBe("Partial · 1 unreachable");
    expect(groupStatus(on, ["unreachable", "unreachable", "live"], false, S).label).toBe(
      "Partial · 2 unreachable",
    );
  });

  it("is unreachable only when every member is", () => {
    expect(groupStatus(on, ["unreachable", "retrying"], false, S).k).toBe("unreachable");
    expect(groupStatus(on, ["live", "live"], false, S)).toEqual({ k: "on", label: "On" });
  });

  it("an empty group that is on is simply on", () => {
    expect(groupStatus(on, [], false, S).k).toBe("on");
  });

  it("speaks the language it is given, plurals included", () => {
    const pt = targets["pt-BR"].status;
    expect(groupStatus(on, ["live", "unreachable"], false, pt).label).not.toBe("Partial · 1 unreachable");
    expect(groupStatus(on, ["live", "unreachable"], false, pt).label).not.toBe(
      groupStatus(on, ["unreachable", "unreachable", "live"], false, pt).label,
    );
  });
});
