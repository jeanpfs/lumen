import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BluetoothState } from "../api";
import { AppProvider, useApp } from "../state/store";
import { fakeBackend } from "../test/fakeBackend";
import { BluetoothGate } from "./BluetoothGate";

function Probe() {
  const { actions } = useApp();
  return <button onClick={() => void actions.setPower({ kind: "strip", id: "a" }, true)}>turn on a</button>;
}

function setup(initial: BluetoothState, over: Parameters<typeof fakeBackend>[0] = {}) {
  let radio = initial;
  const { b, apply } = fakeBackend({ bluetoothState: vi.fn(async () => radio), ...over });
  render(
    <div id="root">
      <AppProvider backend={b} sendDelayMs={10} bluetoothPollMs={20} returnRetryMs={10}>
        <Probe />
        <BluetoothGate />
      </AppProvider>
    </div>,
  );
  return { b, apply, setRadio: (s: BluetoothState) => (radio = s) };
}

afterEach(() => {
  delete window.LumenNative;
});

describe("BluetoothGate", () => {
  it("blocks the app while Bluetooth is off and gives the way to switch it on (desktop: the settings)", async () => {
    const { b } = setup("off");
    const gate = await screen.findByRole("alertdialog", { name: "Bluetooth is off" });
    expect(gate).toHaveTextContent("Lumen only works with Bluetooth on");
    // the app underneath is out of reach for keyboard and screen readers
    expect(document.getElementById("root")).toHaveProperty("inert", true);

    await userEvent.setup().click(screen.getByRole("button", { name: "Open Bluetooth settings" }));
    expect(b.openBluetoothSettings).toHaveBeenCalledTimes(1);
  });

  it("goes away by itself once Bluetooth is on, and the app is usable again", async () => {
    const { setRadio } = setup("off");
    await screen.findByRole("alertdialog");

    setRadio("on");

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(document.getElementById("root")).toHaveProperty("inert", false);
  });

  it("does not block when the platform cannot tell, or when Bluetooth is on", async () => {
    const { b } = setup("unknown");
    await waitFor(() => expect(b.bluetoothState).toHaveBeenCalled());
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("on Android it asks the app shell to switch Bluetooth on, and trusts the shell over the backend", async () => {
    let enabled = false;
    const enableBluetooth = vi.fn();
    window.LumenNative = { bluetoothEnabled: () => enabled, enableBluetooth };
    const { b } = setup("on"); // the backend cannot tell on Android; the shell can

    await userEvent.setup().click(await screen.findByRole("button", { name: "Turn on Bluetooth" }));
    expect(enableBluetooth).toHaveBeenCalledTimes(1);
    expect(b.openBluetoothSettings).not.toHaveBeenCalled();

    enabled = true;
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("connects the saved strips at start and again when Bluetooth comes back, not while it is off", async () => {
    const { b, setRadio } = setup("off");
    await screen.findByRole("alertdialog");
    expect(b.warmUp).not.toHaveBeenCalled();

    setRadio("on");
    await waitFor(() => expect(b.warmUp).toHaveBeenCalledTimes(1));

    setRadio("off");
    await screen.findByRole("alertdialog");
    setRadio("on");
    await waitFor(() => expect(b.warmUp).toHaveBeenCalledTimes(2));
  });

  it("when Bluetooth comes back, strips that failed meanwhile are tried again", async () => {
    let down = true;
    const apply = vi.fn(async (targets: Array<{ id: string }>) =>
      down
        ? { ok: [], unreachable: targets.map((t) => t.id), unsupported: [] }
        : { ok: targets.map((t) => t.id), unreachable: [], unsupported: [] },
    );
    const { setRadio } = setup("on", { apply: apply as never });
    await userEvent.setup().click(screen.getByRole("button", { name: "turn on a" }));
    await waitFor(() => expect(apply).toHaveBeenCalled());

    setRadio("off");
    await screen.findByRole("alertdialog");
    apply.mockClear();
    down = false;
    act(() => setRadio("on"));

    await waitFor(() => expect(apply).toHaveBeenCalledWith([{ type: "strip", id: "a" }], { type: "power", value: true }));
  });
});
