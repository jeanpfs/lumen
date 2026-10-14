import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "../state/store";
import { fakeBackend } from "../test/fakeBackend";
import { TargetPage } from "./TargetPage";

function setup(target: { kind: "group" | "strip"; id: string }, tab: "general" | "color" | "modes" = "general", over = {}) {
  const { b, apply } = fakeBackend(over);
  const go = vi.fn();
  render(
    <AppProvider backend={b} sendDelayMs={5}>
      <TargetPage target={target} tab={tab} go={go} />
    </AppProvider>,
  );
  return { b, apply, go };
}

describe("TargetPage", () => {
  it("shows the name, three tabs and marks the current one", async () => {
    setup({ kind: "group", id: "living-room" }, "color");
    expect(await screen.findByRole("heading", { name: "Living room" })).toBeInTheDocument();
    const tabs = screen.getByRole("tablist");
    expect(within(tabs).getAllByRole("tab").map((t) => t.textContent)).toEqual(["General", "Color", "Modes"]);
    expect(within(tabs).getByRole("tab", { name: "Color" })).toHaveAttribute("aria-selected", "true");
  });

  it("choosing a tab navigates to that tab of the same target", async () => {
    const { go } = setup({ kind: "strip", id: "c" });
    await userEvent.click(await screen.findByRole("tab", { name: "Modes" }));
    expect(go).toHaveBeenCalledWith("strip", "c", { tab: "modes", from: undefined });
  });

  it("an unknown id says so and offers a way back", async () => {
    const { go } = setup({ kind: "group", id: "nope" });
    expect(await screen.findByText("Not found")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to Home" }));
    expect(go).toHaveBeenCalledWith("home");
  });

  it("the power button acts on this page's target", async () => {
    const { apply } = setup({ kind: "strip", id: "c" });
    await userEvent.click(await screen.findByRole("button", { name: "Turn on C" }));
    await waitFor(() => expect(apply).toHaveBeenCalled());
    expect(apply.mock.calls[0][0]).toEqual([{ type: "strip", id: "c" }]);
  });

  it("renaming and deleting a group use the header icons", async () => {
    const { b, go } = setup({ kind: "group", id: "living-room" });
    await userEvent.click(await screen.findByRole("button", { name: "Rename" }));
    const input = await screen.findByLabelText("New name");
    await userEvent.clear(input);
    await userEvent.type(input, "TV room");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(b.renameGroup).toHaveBeenCalledWith("living-room", "TV room"));

    const deleteIcon = await screen.findByRole("button", { name: "Delete group" });
    await userEvent.click(deleteIcon);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete group" }));
    await waitFor(() => expect(b.deleteGroup).toHaveBeenCalledWith("living-room"));
    expect(go).toHaveBeenCalledWith("home");
  });

  it("strip rename and remove work from the header icons", async () => {
    const { b, go } = setup({ kind: "strip", id: "c" });
    // Test rename
    await userEvent.click(await screen.findByRole("button", { name: "Rename" }));
    const input = await screen.findByLabelText("New name");
    await userEvent.clear(input);
    await userEvent.type(input, "Shelf");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(b.renameStrip).toHaveBeenCalledWith("c", "Shelf"));

    // Test remove - first attempt with cancel
    const icon = await screen.findByRole("button", { name: "Remove strip" });
    await userEvent.click(icon);
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(go).not.toHaveBeenCalledWith("home");
    // Second attempt - navigate this time
    await userEvent.click(await screen.findByRole("button", { name: "Remove strip" }));
    const dialog2 = await screen.findByRole("dialog");
    await userEvent.click(within(dialog2).getByRole("button", { name: "Remove strip" }));
    await waitFor(() => expect(b.removeStrip).toHaveBeenCalledWith("c"));
    expect(go).toHaveBeenCalledWith("home");
  });

  it("back button shows group name when from is set", async () => {
    const { b } = fakeBackend();
    const goFn = vi.fn();
    render(
      <AppProvider backend={b} sendDelayMs={5}>
        <TargetPage target={{ kind: "strip", id: "c" }} tab="general" from="living-room" go={goFn} />
      </AppProvider>,
    );
    const backBtn = await screen.findByRole("button", { name: "Back to Living room" });
    expect(backBtn).toBeInTheDocument();
    await userEvent.click(backBtn);
    expect(goFn).toHaveBeenCalledWith("group", "living-room");
  });

  it("back button falls back to home when from group is missing", async () => {
    const { b } = fakeBackend({
      snapshot: async () => ({
        strips: [{ id: "c", name: "C", profile: "mrstar", calibration: { channel_order: "Rgb" as const, min_brightness: 3, steps: 0, has_white: false } }],
        groups: [], // no groups, so "living-room" is missing
      }),
    });
    const goFn = vi.fn();
    render(
      <AppProvider backend={b} sendDelayMs={5}>
        <TargetPage target={{ kind: "strip", id: "c" }} tab="general" from="living-room" go={goFn} />
      </AppProvider>,
    );
    const backBtn = await screen.findByRole("button", { name: "Home" });
    expect(backBtn).toBeInTheDocument();
    await userEvent.click(backBtn);
    expect(goFn).toHaveBeenCalledWith("home");
  });
  it("tabpanel is labelled by the selected tab", async () => {
    setup({ kind: "group", id: "living-room" }, "color");
    const panel = await screen.findByRole("tabpanel");
    expect(panel).toHaveAccessibleName("Color");
  });

});
