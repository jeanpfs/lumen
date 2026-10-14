import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Sheet } from "./Sheet";

const sheet = (onClose: () => void) => (
  <Sheet title="Test" onClose={onClose}>
    <input aria-label="Name" />
  </Sheet>
);

describe("Sheet", () => {
  it("keeps focus on the input when re-rendered with a new onClose", () => {
    const { rerender } = render(sheet(() => {}));
    const input = screen.getByLabelText("Name");
    input.focus();
    expect(input).toHaveFocus();

    rerender(sheet(() => {}));
    expect(screen.getByLabelText("Name")).toBe(input);
    expect(input).toHaveFocus();
    expect(document.activeElement).toBe(input);
  });

  it("calls the latest onClose on Escape", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(sheet(first));
    rerender(sheet(second));

    fireEvent.keyDown(window, { key: "Escape" });
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
