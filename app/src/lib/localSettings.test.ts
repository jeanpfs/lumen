import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocalSetting } from "./localSettings";

afterEach(() => vi.restoreAllMocks());

describe("useLocalSetting", () => {
  it("returns the default, then round-trips through storage across remounts", () => {
    const first = renderHook(() => useLocalSetting("speed", 50));
    expect(first.result.current[0]).toBe(50);
    act(() => first.result.current[1](80));
    expect(first.result.current[0]).toBe(80);
    expect(localStorage.getItem("lumen.local.speed")).toBe("80");
    first.unmount();

    const second = renderHook(() => useLocalSetting("speed", 50));
    expect(second.result.current[0]).toBe(80);
  });

  it("accepts an updater function", () => {
    const { result } = renderHook(() => useLocalSetting("n", 1));
    act(() => result.current[1]((p) => p + 4));
    expect(result.current[0]).toBe(5);
  });

  it("falls back to the default on corrupt JSON", () => {
    localStorage.setItem("lumen.local.bad", "{not json");
    const { result } = renderHook(() => useLocalSetting("bad", { a: 1 }));
    expect(result.current[0]).toEqual({ a: 1 });
  });

  it("keeps working in memory when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    const { result } = renderHook(() => useLocalSetting("x", "a"));
    expect(result.current[0]).toBe("a");
    act(() => result.current[1]("b"));
    expect(result.current[0]).toBe("b");
  });
});
