import { describe, expect, it } from "vitest";
import { groupStatus, stripStatus } from "./status";
import { DEFAULT_PRESUMED } from "./types";

const on = { ...DEFAULT_PRESUMED, on: true, b: 80 };

describe("strip status", () => {
  it("reports what was last sent, with brightness when on", () => {
    expect(stripStatus(on, "live", false)).toEqual({ k: "on", label: "On · 80%" });
    expect(stripStatus(DEFAULT_PRESUMED, "live", false)).toEqual({ k: "off", label: "Off" });
  });

  it("puts reachability before power", () => {
    expect(stripStatus(on, "unreachable", false).k).toBe("unreachable");
    expect(stripStatus(on, "retrying", false).label).toBe("Retrying…");
  });

  it("an unavailable backend wins over everything", () => {
    expect(stripStatus(on, "live", true).label).toBe("Bluetooth unavailable");
  });
});

describe("group status", () => {
  it("is off when the group is off, whatever the members say", () => {
    expect(groupStatus(DEFAULT_PRESUMED, ["unreachable"], false).k).toBe("off");
  });

  it("is partial with a pluralised count when some members are unreachable", () => {
    expect(groupStatus(on, ["live", "unreachable"], false).label).toBe("Partial · 1 unreachable");
    expect(groupStatus(on, ["unreachable", "unreachable", "live"], false).label).toBe(
      "Partial · 2 unreachable",
    );
  });

  it("is unreachable only when every member is", () => {
    expect(groupStatus(on, ["unreachable", "retrying"], false).k).toBe("unreachable");
    expect(groupStatus(on, ["live", "live"], false)).toEqual({ k: "on", label: "On" });
  });

  it("an empty group that is on is simply on", () => {
    expect(groupStatus(on, [], false).k).toBe("on");
  });
});
