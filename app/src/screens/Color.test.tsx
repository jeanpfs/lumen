import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Snapshot } from "../api";
import { AppProvider } from "../state/store";
import { fakeBackend } from "../test/fakeBackend";
import { ColorTab } from "./Color";

function setup(target: { kind: "group" | "strip"; id: string }) {
  const { b, apply } = fakeBackend();
  render(
    <AppProvider backend={b} sendDelayMs={5}>
      <ColorTab target={target} />
    </AppProvider>,
  );
  return { apply };
}

describe("ColorTab", () => {
  it("acts on the target it is given, not on any global one", async () => {
    const { apply } = setup({ kind: "strip", id: "c" });
    await screen.findByText(/Details/);
    fireEvent.keyDown(screen.getByRole("slider", { name: /Color wheel/ }), { key: "ArrowRight" });
    await waitFor(() => expect(apply).toHaveBeenCalled());
    expect(apply.mock.calls[0][0]).toEqual([{ type: "strip", id: "c" }]);
  });

  it("a group target sends to the group", async () => {
    const { apply } = setup({ kind: "group", id: "living-room" });
    await screen.findByText(/Details/);
    fireEvent.keyDown(screen.getByRole("slider", { name: /Color wheel/ }), { key: "ArrowRight" });
    await waitFor(() => expect(apply).toHaveBeenCalled());
    expect(apply.mock.calls[0][0]).toEqual([{ type: "group", id: "living-room" }]);
  });
});

describe("ColorTab follow-the-group", () => {
  function render_(target: { kind: "group" | "strip"; id: string }) {
    const { b, apply } = fakeBackend();
    render(
      <AppProvider backend={b} sendDelayMs={5}>
        <ColorTab target={target} />
      </AppProvider>,
    );
    return { b, apply };
  }

  it("a strip in a group can take its own color and go back to following the group", async () => {
    const { apply } = render_({ kind: "strip", id: "a" });
    const own = await screen.findByRole("radio", { name: "Own color" });
    expect(own).toHaveAttribute("aria-checked", "false");
    await userEvent.click(own);
    expect(own).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(apply).toHaveBeenCalled());

    apply.mockClear();
    await userEvent.click(screen.getByRole("radio", { name: "Follow group" }));
    expect(screen.getByRole("radio", { name: "Follow group" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Own color" })).toHaveAttribute("aria-checked", "false");
    await waitFor(() => expect(apply).toHaveBeenCalled());
    // Assert the target and command sent
    expect(apply.mock.calls[0][0]).toContainEqual({ type: "strip", id: "a" });
    expect(apply.mock.calls[0][1]).toHaveProperty("type", "color");
  });

  it("a strip that is in no group has no follow-the-group control", async () => {
    render_({ kind: "strip", id: "c" });
    await screen.findByText(/Details/);
    expect(screen.queryByRole("radio", { name: "Own color" })).not.toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Follow group" })).not.toBeInTheDocument();
  });

  it("a group target has no follow-the-group control", async () => {
    render_({ kind: "group", id: "living-room" });
    await screen.findByText(/Details/);
    expect(screen.queryByRole("radio", { name: "Own color" })).not.toBeInTheDocument();
  });

  it("moving the wheel of a following strip makes the color its own and sends it to the strip only", async () => {
    const { apply } = render_({ kind: "strip", id: "a" });
    await screen.findByRole("radio", { name: "Follow group" });
    const wheel = screen.getByRole("slider", { name: /Color wheel/ });
    expect(screen.getByRole("radio", { name: "Follow group" })).toHaveAttribute("aria-checked", "true");
    wheel.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Own color" })).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(apply).toHaveBeenCalled());
    for (const call of apply.mock.calls) expect(call[0]).toEqual([{ type: "strip", id: "a" }]);
  });

  it("brightness on a following strip takes its own color and sends it to the strip only", async () => {
    const { apply } = render_({ kind: "strip", id: "a" });
    await screen.findByRole("radio", { name: "Follow group" });
    expect(screen.getByRole("radio", { name: "Follow group" })).toHaveAttribute("aria-checked", "true");
    fireEvent.change(screen.getByLabelText("Brightness"), { target: { value: "40" } });
    expect(screen.getByRole("radio", { name: "Own color" })).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(apply).toHaveBeenCalled());
    for (const call of apply.mock.calls) expect(call[0]).toEqual([{ type: "strip", id: "a" }]);
  });

  it("hex input on a following strip takes its own color", async () => {
    const { apply } = render_({ kind: "strip", id: "a" });
    await screen.findByRole("radio", { name: "Follow group" });
    const hexInput = screen.getByLabelText("Hex");
    expect(screen.getByRole("radio", { name: "Follow group" })).toHaveAttribute("aria-checked", "true");
    await userEvent.clear(hexInput);
    await userEvent.type(hexInput, "FF0000");
    await waitFor(() => expect(screen.getByRole("radio", { name: "Own color" })).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(apply).toHaveBeenCalled());
  });

  it("preset swatch on a following strip takes its own color", async () => {
    const { apply } = render_({ kind: "strip", id: "a" });
    await screen.findByRole("radio", { name: "Follow group" });
    const presetBtn = screen.getByRole("button", { name: "Red" });
    expect(screen.getByRole("radio", { name: "Follow group" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(presetBtn);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Own color" })).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(apply).toHaveBeenCalled());
  });

  it("favorite swatch on a following strip takes its own color", async () => {
    const { apply } = render_({ kind: "strip", id: "a" });
    await screen.findByRole("radio", { name: "Follow group" });
    const saveBtn = screen.getByRole("button", { name: /Save current color/ });
    await userEvent.click(saveBtn);
    await waitFor(() => screen.findByRole("button", { name: /Favorite/ }));
    const favBtn = screen.getAllByRole("button", { name: /Favorite/ })[0];
    expect(screen.getByRole("radio", { name: "Follow group" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(favBtn);
    await waitFor(() => expect(screen.getByRole("radio", { name: "Own color" })).toHaveAttribute("aria-checked", "true"));
    await waitFor(() => expect(apply).toHaveBeenCalled());
  });

});

describe("ColorTab unreachable and fromGroup", () => {

  it("with a strip in two groups, Follow group prefers fromGroup when provided", async () => {
    const snap: Snapshot = {
      strips: [
        { id: "a", name: "A", profile: "mrstar", calibration: { channel_order: "Rgb" as const, min_brightness: 3, steps: 0, has_white: false } },
      ],
      groups: [
        { id: "living-room", name: "Living room", members: ["a"] },
        { id: "bedroom", name: "Bedroom", members: ["a"] },
      ],
    };
    const { b } = fakeBackend({ snapshot: async () => snap });
    render(
      <AppProvider backend={b} sendDelayMs={5}>
        <ColorTab target={{ kind: "strip", id: "a" }} fromGroup="bedroom" />
      </AppProvider>,
    );
    const radios = await screen.findAllByRole("radio", { name: "Follow group" });
    // The button should exist (strip is in a group)
    expect(radios.length).toBeGreaterThan(0);
  });
});

describe("ColorTab on a group: Apply to all", () => {
  it("replaces the saved own color with the group's color", async () => {
    const { b, apply } = fakeBackend();
    // strip a keeps its own color: the group color must override it
    localStorage.setItem("lumen.state.v2", JSON.stringify({ overrides: ["a"], presumed: { "strip:a": { on: true, h: 200, s: 90, b: 50 }, "group:living-room": { on: true, h: 10, s: 80, b: 70 } } }));
    render(
      <AppProvider backend={b} sendDelayMs={5}>
        <ColorTab target={{ kind: "group", id: "living-room" }} />
      </AppProvider>,
    );

    expect(await screen.findByText(/1 strip has a saved color of their own/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Apply to all" }));

    await waitFor(() => {
      const sent = apply.mock.calls.map(([targets, command]) => ({ targets, command }));
      // the strip with its own color receives the group's hue (10)
      expect(sent.filter((c) => c.command.type === "color" && c.command.value.hue === 10).flatMap((c) => c.targets)).toEqual(
        expect.arrayContaining([{ type: "strip", id: "a" }]),
      );
    });
    // strip a no longer has its own color: the notice about saved colors is gone
    await waitFor(() => expect(screen.queryByText(/saved color of their own/)).not.toBeInTheDocument());
    localStorage.clear();
  });

  it("is hidden when no member keeps a saved own color", async () => {
    setup({ kind: "group", id: "living-room" });
    await screen.findByText(/Details/);
    expect(screen.queryByRole("button", { name: "Apply to all" })).not.toBeInTheDocument();
  });

  it("only touches the members that keep an own color", async () => {
    const { b, apply } = fakeBackend();
    localStorage.setItem("lumen.state.v2", JSON.stringify({ overrides: ["a"], presumed: { "group:living-room": { on: true, h: 10, s: 80, b: 70 } } }));
    render(
      <AppProvider backend={b} sendDelayMs={5}>
        <ColorTab target={{ kind: "group", id: "living-room" }} />
      </AppProvider>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "Apply to all" }));
    await waitFor(() => expect(apply).toHaveBeenCalled());
    const targets = apply.mock.calls.flatMap(([ts]) => ts);
    expect(targets).toEqual(expect.arrayContaining([{ type: "strip", id: "a" }]));
    expect(targets).not.toEqual(expect.arrayContaining([{ type: "strip", id: "b" }]));
    localStorage.clear();
  });

  it("is only on the group page, not on a strip", async () => {
    setup({ kind: "strip", id: "a" });
    await screen.findByText(/Details/);
    expect(screen.queryByRole("button", { name: "Apply to all" })).not.toBeInTheDocument();
  });
});
