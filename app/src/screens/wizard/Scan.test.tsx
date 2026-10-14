import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WizardScan, { SCAN_SECS } from "./Scan";

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
