import { describe, expect, it } from "vitest";
import { clamp, hexToHsv, hsvHex, hsvToRgb, protoB, protoS, percentOfProto, rgbStr } from "./color";

describe("color math", () => {
  it("converts the primaries and white", () => {
    expect(hsvToRgb(0, 1, 1)).toEqual([255, 0, 0]);
    expect(hsvToRgb(120, 1, 1)).toEqual([0, 255, 0]);
    expect(hsvToRgb(240, 1, 1)).toEqual([0, 0, 255]);
    expect(hsvToRgb(200, 0, 1)).toEqual([255, 255, 255]);
  });

  it("formats hex and the space-separated rgb the stylesheet uses", () => {
    expect(hsvHex(0, 100)).toBe("#FF0000");
    expect(rgbStr(120, 100)).toBe("0 255 0");
  });

  it("round-trips hex through HSV for the primaries", () => {
    expect(hexToHsv("#00FF00")).toEqual({ h: 120, s: 100, v: 100 });
    expect(hexToHsv("0000ff")).toEqual({ h: 240, s: 100, v: 100 });
  });

  it("rejects malformed hex", () => {
    expect(hexToHsv("#12345")).toBeNull();
    expect(hexToHsv("nothex")).toBeNull();
  });

  it("maps UI values to the protocol range the strip accepts", () => {
    expect(protoS(100)).toBe(1000);
    expect(protoS(0)).toBe(0);
    expect(protoB(3)).toBe(3);
    expect(protoB(100)).toBe(1000);
    expect(protoB(50)).toBeGreaterThan(3);
    expect(protoB(50)).toBeLessThan(1000);
  });

  it("converts protocol brightness back to UI percent", () => {
    expect(percentOfProto(3)).toBe(3);
    expect(percentOfProto(1000)).toBe(100);
    expect(percentOfProto(500)).toBeGreaterThan(3);
    expect(percentOfProto(500)).toBeLessThan(100);
  });

  it("round-trips brightness through protocol and back", () => {
    expect(percentOfProto(protoB(3))).toBe(3);
    expect(percentOfProto(protoB(50))).toBe(50);
    expect(percentOfProto(protoB(100))).toBe(100);
  });

  it("clamps percentOfProto to valid range", () => {
    expect(percentOfProto(0)).toBe(3);
    expect(percentOfProto(2000)).toBe(100);
  });

  it("clamps", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
  });
});
