import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Command } from "../api";
import { fakeBackend } from "../test/fakeBackend";
import { AppProvider, useApp, type Backend } from "../state/store";
import { ModesTab } from "./Modes";

const group = { kind: "group" as const, id: "living-room" };

function renderScreen(b: Backend) {
  return render(
    <AppProvider backend={b} sendDelayMs={10}>
      <ModesTab target={group} />
      <Elsewhere />
      <ToastProbe />
    </AppProvider>,
  );
}

/** Stands in for the Color tab: something else that sends a color to the same group. */
function Elsewhere() {
  const { actions } = useApp();
  return <button onClick={() => actions.setColour(group, 200, 80)}>pick color</button>;
}

function ToastProbe() {
  const { state } = useApp();
  return <p data-testid="toast">{state.toast?.text}</p>;
}

const last = <T,>(xs: T[]): T | undefined => xs[xs.length - 1];

const sent = (apply: { mock: { calls: unknown[][] } }): Command[] => apply.mock.calls.map((c) => c[1] as Command);

describe("ModesTab", () => {
  it("picking a mode plays that strip effect: switches it on, then sends the mode and the speed", async () => {
    const { b, apply } = fakeBackend();
    renderScreen(b);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("radio", { name: /Symphony/ }));

    await waitFor(() =>
      expect(sent(apply)).toEqual([
        { type: "power", value: true },
        { type: "effect", value: 2 },
        { type: "speed", value: 50 },
      ]),
    );
    expect(apply.mock.calls[0][0]).toEqual([{ type: "group", id: "living-room" }]);
    expect(screen.getByRole("radio", { name: /Symphony/ })).toHaveAttribute("aria-checked", "true");
  });

  it("each tab plays its mode numbers: Open/Close starts at 35, Chase at 84", async () => {
    const { b, apply } = fakeBackend();
    renderScreen(b);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("tab", { name: "Open/Close" }));
    await user.click(screen.getByRole("radio", { name: "7 colors" }));
    await waitFor(() => expect(sent(apply)).toContainEqual({ type: "effect", value: 35 }));

    await user.click(screen.getByRole("tab", { name: "Chase" }));
    await user.click(screen.getByRole("radio", { name: "Red" }));
    await waitFor(() => expect(sent(apply)).toContainEqual({ type: "effect", value: 84 }));
  });

  it("the speed slider sends the new speed, and a mode picked afterwards uses it", async () => {
    const { b, apply } = fakeBackend();
    renderScreen(b);
    const user = userEvent.setup();

    fireEvent.change(await screen.findByLabelText("Speed"), { target: { value: "90" } });
    await waitFor(() => expect(sent(apply)).toContainEqual({ type: "speed", value: 90 }));

    await user.click(screen.getByRole("radio", { name: /Symphony/ }));
    await waitFor(() => expect(sent(apply)).toContainEqual({ type: "effect", value: 2 }));
    expect(last(sent(apply).filter((c) => c.type === "speed"))).toEqual({ type: "speed", value: 90 });
  });

  it("the direction switch sends the direction", async () => {
    const { b, apply } = fakeBackend();
    renderScreen(b);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("switch", { name: "Reverse direction" }));
    await waitFor(() => expect(sent(apply)).toEqual([{ type: "direction", value: true }]));
    await user.click(screen.getByRole("switch", { name: "Reverse direction" }));
    await waitFor(() => expect(last(sent(apply))).toEqual({ type: "direction", value: false }));
  });

  it("a color sent from elsewhere replaces the effect, and Stop effect does the same", async () => {
    const { b, apply } = fakeBackend();
    renderScreen(b);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("radio", { name: /Symphony/ }));
    await waitFor(() => expect(screen.getByRole("radio", { name: /Symphony/ })).toHaveAttribute("aria-checked", "true"));

    await user.click(screen.getByRole("button", { name: "pick color" }));
    expect(screen.getByRole("radio", { name: /Symphony/ })).toHaveAttribute("aria-checked", "false");
    expect(screen.getByRole("button", { name: "Stop effect" })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: /Color energy/ }));
    await user.click(screen.getByRole("button", { name: "Stop effect" }));
    await waitFor(() => expect(last(sent(apply))?.type).toBe("color"));
    expect(screen.getByRole("radio", { name: /Color energy/ })).toHaveAttribute("aria-checked", "false");
  });

  it("a color queued right after a mode wins, and a mode queued right after a color wins", async () => {
    const { b, apply } = fakeBackend();
    renderScreen(b);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("radio", { name: /Symphony/ }));
    await user.click(screen.getByRole("button", { name: "pick color" }));
    await user.click(screen.getByRole("radio", { name: /Color energy/ }));
    await waitFor(() => expect(sent(apply)).toContainEqual({ type: "effect", value: 3 }));
    // the last thing asked is the mode: nothing after it undoes it
    const final = last(sent(apply).filter((c) => c.type === "effect" || c.type === "color"));
    expect(final).toEqual({ type: "effect", value: 3 });
  });

  it("brightness uses the normal brightness command", async () => {
    const { b, apply } = fakeBackend();
    renderScreen(b);

    fireEvent.change(await screen.findByLabelText("Brightness"), { target: { value: "40" } });
    await waitFor(() => expect(sent(apply).some((c) => c.type === "brightness")).toBe(true));
  });

  it("keeps the chosen tab and speed across remount", async () => {
    const { b } = fakeBackend();
    const first = renderScreen(b);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("tab", { name: "Trail" }));
    fireEvent.change(screen.getByLabelText("Speed"), { target: { value: "80" } });
    first.unmount();

    renderScreen(b);
    expect(await screen.findByRole("tab", { name: "Trail" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Speed")).toHaveValue("80");
  });

  it("tells the user when part of the target cannot play effects", async () => {
    const { b } = fakeBackend({
      apply: (async () => ({ ok: [], unreachable: [], unsupported: ["a"] })) as unknown as Backend["apply"],
    });
    renderScreen(b);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("radio", { name: /Symphony/ }));
    expect(await screen.findByTestId("toast")).toHaveTextContent(/Effects are not available on 1 strip/);
  });
});
