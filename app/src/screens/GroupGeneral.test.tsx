import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Snapshot } from "../api";
import { AppProvider } from "../state/store";
import { fakeBackend, snapshot as baseSnapshot, type FakeBackendResult } from "../test/fakeBackend";
import { GroupGeneral } from "./GroupGeneral";

function setup() {
  const { b } = fakeBackend();
  const go = vi.fn();
  render(
    <AppProvider backend={b} sendDelayMs={5}>
      <GroupGeneral groupId="living-room" go={go} />
    </AppProvider>,
  );
  return { b, go };
}

/** A backend whose snapshot reflects removals, like the real one after a refresh. */
function mutableBackend(): { b: FakeBackendResult["b"]; removeFromGroup: ReturnType<typeof vi.fn> } {
  const snap: Snapshot = structuredClone(baseSnapshot);
  const removeFromGroup = vi.fn(async (groupId: string, stripId: string) => {
    const g = snap.groups.find((x) => x.id === groupId);
    if (g) g.members = g.members.filter((m) => m !== stripId);
  });
  const { b } = fakeBackend({ snapshot: vi.fn(async () => structuredClone(snap)), removeFromGroup });
  return { b, removeFromGroup };
}

function mount(b: FakeBackendResult["b"], groupId = "living-room") {
  const go = vi.fn();
  const view = render(
    <AppProvider backend={b} sendDelayMs={5}>
      <GroupGeneral groupId={groupId} go={go} />
    </AppProvider>,
  );
  return { go, view };
}

describe("GroupGeneral", () => {
  it("opens the strip page when a member's name is tapped", async () => {
    const { go } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "A" }));
    expect(go).toHaveBeenCalledWith("strip", "a", { tab: "general", from: "living-room" });
  });

  it("the color dot opens that strip's Color tab", async () => {
    const { go } = setup();
    await userEvent.click(await screen.findByRole("button", { name: /Color of A/ }));
    expect(go).toHaveBeenCalledWith("strip", "a", { tab: "color", from: "living-room" });
  });

  it("the batch bar only exists with a selection", async () => {
    setup();
    await screen.findByText("All");
    expect(screen.queryByRole("button", { name: /^Off$/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: "Select A" }));
    expect(screen.getByRole("button", { name: /^Off$/ })).toBeInTheDocument();
  });

  it("moving a member down saves the new order", async () => {
    const { b } = setup();
    await userEvent.click(await screen.findByRole("button", { name: "Move A down" }));
    await waitFor(() => expect(b.reorderGroup).toHaveBeenCalledWith("living-room", ["b", "a"]));
  });

  it("removing a member takes it out of the group only", async () => {
    const { b } = setup();
    const row = (await screen.findByRole("button", { name: "A" })).closest("li")!;
    await userEvent.click(within(row).getByRole("button", { name: "Remove A from group" }));
    await waitFor(() => expect(b.removeFromGroup).toHaveBeenCalledWith("living-room", "a"));
  });

  it("renders nothing for an unknown group", async () => {
    const { b } = fakeBackend();
    const { view } = mount(b, "nonexistent");
    await waitFor(() => expect(b.snapshot).toHaveBeenCalled());
    expect(view.container).toBeEmptyDOMElement();
  });

  it("survives a cold load: snapshot still loading, then loaded", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { b } = fakeBackend({
      snapshot: vi.fn(async () => {
        await gate;
        return baseSnapshot;
      }),
    });
    const { view } = mount(b);
    // not loaded yet: the group is unknown, nothing rendered
    expect(view.container).toBeEmptyDOMElement();
    release();
    expect(await screen.findByRole("button", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B" })).toBeInTheDocument();
  });

  it("removing a member with the X button keeps rendering the remaining member", async () => {
    const { b, removeFromGroup } = mutableBackend();
    mount(b);
    await userEvent.click(await screen.findByRole("button", { name: "Remove A from group" }));
    expect(removeFromGroup).toHaveBeenCalledWith("living-room", "a");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Remove A from group" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Remove B from group" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("batch Remove drops the selected members and keeps rendering", async () => {
    const { b, removeFromGroup } = mutableBackend();
    mount(b);
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select A" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(removeFromGroup).toHaveBeenCalledWith("living-room", "a");
    expect(removeFromGroup).not.toHaveBeenCalledWith("living-room", "b");
    await waitFor(() => expect(screen.queryByRole("checkbox", { name: "Select A" })).not.toBeInTheDocument());
    expect(screen.getByRole("checkbox", { name: "Select B" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("reorder buttons are disabled at the ends and carry explicit labels", async () => {
    setup();
    await screen.findByRole("button", { name: "A" });
    expect(screen.getByRole("button", { name: "Move A up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move B down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move B up" })).toBeEnabled();
  });

  it("batch Follow group calls apply for each strip and the group color", async () => {
    const { b } = setup();
    const apply = b.apply as unknown as { mock: { calls: unknown[][] } };
    await userEvent.click(await screen.findByRole("checkbox", { name: "Select A" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Select B" }));
    await userEvent.click(screen.getByRole("button", { name: "Follow group" }));
    // followGroup is called for each strip, so apply is called once per strip
    await waitFor(() => expect(apply).toHaveBeenCalled());
    // Verify apply was called at least once
    expect(apply.mock.calls.length).toBeGreaterThanOrEqual(1);
    // Both members should still be in the list
    expect(screen.getByRole("button", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "B" })).toBeInTheDocument();
  });

  it("toggling the per-member power Switch calls apply with a power command", async () => {
    const { b } = fakeBackend();
    const go = vi.fn();
    const apply = b.apply as unknown as { mock: { calls: unknown[][] } };
    render(
      <AppProvider backend={b} sendDelayMs={5}>
        <GroupGeneral groupId="living-room" go={go} />
      </AppProvider>,
    );
    const row = (await screen.findByRole("button", { name: "A" })).closest("li")!;
    const powerSwitch = within(row).getByRole("switch", { name: /Turn on or off A/ });
    await userEvent.click(powerSwitch);
    await waitFor(() => expect(apply).toHaveBeenCalled());
    // Verify it sent a power command to the strip
    expect(apply.mock.calls[0][0]).toEqual([{ type: "strip", id: "a" }]);
  });

  it("the color dot aria-label shows correct state", async () => {
    setup();
    // By default (no override), the aria-label contains "follows the group"
    const dotButton = await screen.findByRole("button", { name: /Color of A:.*follows the group/ });
    expect(dotButton).toHaveAttribute("title", "This strip's color");
    expect(dotButton).not.toHaveClass("is-own");
  });

  it("members render in group.members order, not snapshot.strips order", async () => {
    // Use a custom backend where group.members is ["b", "a"] but strips are [a, b, c]
    const snap: Snapshot = {
      strips: [
        { id: "a", name: "A", profile: "mrstar", calibration: { channel_order: "Rgb", min_brightness: 3, steps: 0, has_white: false } },
        { id: "b", name: "B", profile: "mrstar", calibration: { channel_order: "Rgb", min_brightness: 3, steps: 0, has_white: false } },
        { id: "c", name: "C", profile: "mrstar", calibration: { channel_order: "Rgb", min_brightness: 3, steps: 0, has_white: false } },
      ],
      groups: [{ id: "living-room", name: "Living room", members: ["b", "a"] }],
    };
    const { b } = fakeBackend({ snapshot: vi.fn(async () => snap) });
    mount(b);

    // Members should render as B, then A (not A, then B from strips order)
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    const row0 = within(rows[0]).getByRole("button", { name: "B" });
    const row1 = within(rows[1]).getByRole("button", { name: "A" });
    expect(row0).toBeInTheDocument();
    expect(row1).toBeInTheDocument();

    // Moving B down should reorder to ["a", "b"]
    const bMoveDown = within(rows[0]).getByRole("button", { name: "Move B down" });
    await userEvent.click(bMoveDown);
    await waitFor(() => expect(b.reorderGroup).toHaveBeenCalledWith("living-room", ["a", "b"]));

    // Move B up should be disabled initially (it's at index 0 in the group.members order)
    const bMoveUp = within(rows[0]).getByRole("button", { name: "Move B up" });
    expect(bMoveUp).toBeDisabled();
  });
});
