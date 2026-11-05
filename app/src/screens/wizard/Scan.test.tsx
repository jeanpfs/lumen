import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WizardScan, { SCAN_SECS, signalBars } from "./Scan";

describe("scan progress", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("advances with the time the scan takes and ends at 100% when it answers", async () => {
    let finish!: () => void;
    const onScan = () => new Promise<never[]>((r) => (finish = () => r([])));
    render(<WizardScan onScan={onScan} value={null} onChoose={vi.fn()} />);
    const bar = screen.getByRole("progressbar");
    const now = () => Number(bar.getAttribute("aria-valuenow"));

    await act(() => vi.advanceTimersByTimeAsync((SCAN_SECS * 1000) / 4));
    const quarter = now();
    await act(() => vi.advanceTimersByTimeAsync((SCAN_SECS * 1000) / 4));
    const half = now();
    expect(quarter).toBeGreaterThan(15);
    expect(quarter).toBeLessThan(35);
    expect(half).toBeGreaterThan(quarter + 15);

    await act(() => vi.advanceTimersByTimeAsync(SCAN_SECS * 1000 * 2));
    expect(now()).toBe(99); // held until the backend answers

    await act(async () => finish());
    expect(now()).toBe(100);
  });
});

describe("signal bars", () => {
  it("lights 3-4 bars at the -55..-70 dBm a phone reads 1 m from a strip, and none below -90", () => {
    expect(signalBars(-55)).toBe(4);
    expect(signalBars(-60)).toBe(4);
    expect(signalBars(-61)).toBe(3);
    expect(signalBars(-70)).toBe(3);
    expect(signalBars(-77)).toBe(2);
    expect(signalBars(-90)).toBe(1);
    expect(signalBars(-91)).toBe(0);
  });
});
