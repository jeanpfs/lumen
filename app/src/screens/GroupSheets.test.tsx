import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "../state/store";
import { fakeBackend } from "../test/fakeBackend";
import { NewGroupSheet } from "./GroupSheets";

function mount() {
  const { b } = fakeBackend();
  const onClose = vi.fn();
  const go = vi.fn();
  render(
    <AppProvider backend={b} sendDelayMs={10}>
      <NewGroupSheet onClose={onClose} go={go} />
    </AppProvider>,
  );
  return { b, onClose, go };
}

describe("NewGroupSheet", () => {
  it("does not create anything while the name is empty", async () => {
    const { b, onClose, go } = mount();
    await screen.findByRole("checkbox", { name: /^A/ });
    await userEvent.setup().click(screen.getByRole("checkbox", { name: /^A/ }));
    // blank / whitespace-only name: bypass the native `required` check and submit the form
    fireEvent.change(screen.getByPlaceholderText("e.g. Porch, Kitchen"), { target: { value: "   " } });
    fireEvent.submit(screen.getByRole("button", { name: "Create group" }).closest("form")!);
    await new Promise((r) => setTimeout(r, 20));
    expect(b.createGroup).not.toHaveBeenCalled();
    expect(b.addToGroup).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
  });

  it("creates the group with exactly the chosen strips, in screen order", async () => {
    const user = userEvent.setup();
    const { b, onClose, go } = mount();
    await screen.findByRole("checkbox", { name: /^A/ });
    await user.type(screen.getByPlaceholderText("e.g. Porch, Kitchen"), "  Porch  ");
    // tick C first, then A: strips must be added in on-screen order (a, c), never b
    await user.click(screen.getByRole("checkbox", { name: /^C/ }));
    await user.click(screen.getByRole("checkbox", { name: /^A/ }));
    await user.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(b.createGroup).toHaveBeenCalledTimes(1);
    const [id, name] = vi.mocked(b.createGroup).mock.calls[0] as unknown as [string, string];
    expect(name).toBe("Porch");
    expect(vi.mocked(b.addToGroup).mock.calls).toEqual([
      [id, "a"],
      [id, "c"],
    ]);
    expect(go).toHaveBeenCalledWith("group", id);
  });
});
