import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...a: unknown[]) => invoke(...a) }));

import App from "./App";

const strip = { id: "a", name: "A", profile: "mrstar", calibration: { channel_order: "Rgb", min_brightness: 3, steps: 0, has_white: false } };

function backend(strips: unknown[]) {
  invoke.mockImplementation(async (cmd: string) => {
    if (cmd === "snapshot") return { strips, groups: [] };
    if (cmd === "scan") return [];
    if (cmd === "profiles") return [];
    if (cmd === "bluetooth_state") return "on";
    if (cmd === "warm_up") return [];
    if (cmd.startsWith("wizard")) return undefined;
    return undefined;
  });
}

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
  invoke.mockReset();
});
afterEach(() => {
  window.location.hash = "";
});


describe("first run (no strip yet)", () => {
  it("shows only the welcome, without menus or header", async () => {
    backend([]);
    render(<App />);

    expect(await screen.findByRole("heading", { name: /Your LED strips/ })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
  });

  it("after the welcome, offers only the way into the wizard", async () => {
    localStorage.setItem("lumen.state.v2", JSON.stringify({ onboarded: true }));
    backend([]);
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Let's add your first strip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get started" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("Home")).not.toBeInTheDocument();
  });

  it("with a strip, the app opens on Home", async () => {
    localStorage.setItem("lumen.state.v2", JSON.stringify({ onboarded: true }));
    backend([strip]);
    render(<App />);

    expect(await screen.findByRole("button", { name: "Add strip" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Get started" })).not.toBeInTheDocument();
  });

  it("has no menu at all: no sidebar, no tab bar, no Settings, no global header", async () => {
    localStorage.setItem("lumen.state.v2", JSON.stringify({ onboarded: true }));
    backend([strip]);
    render(<App />);

    await screen.findByRole("button", { name: "Add strip" });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
    expect(screen.queryByText("Controlling")).not.toBeInTheDocument();
  });

  it("the theme button on Home switches between dark and light", async () => {
    localStorage.setItem("lumen.state.v2", JSON.stringify({ onboarded: true }));
    backend([strip]);
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Use light theme" }));
    expect(document.documentElement.dataset.theme).toBe("light");
    await userEvent.click(screen.getByRole("button", { name: "Use dark theme" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("the help button opens the supported strip types in a modal, without leaving Home", async () => {
    localStorage.setItem("lumen.state.v2", JSON.stringify({ onboarded: true }));
    backend([strip]);
    render(<App />);

    const help = await screen.findByRole("button", { name: "Supported strip types" });
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("profiles"));
    await userEvent.click(help);
    const dialog = await screen.findByRole("dialog", { name: "Supported strip types" });
    expect(within(dialog).queryByText("Loading…")).not.toBeInTheDocument();
    expect(dialog).toBeInTheDocument();
    expect(window.location.hash).not.toBe("#types");
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Supported strip types" })).not.toBeInTheDocument();
  });

  it("a card on Home opens that strip's page", async () => {
    localStorage.setItem("lumen.state.v2", JSON.stringify({ onboarded: true }));
    backend([strip]);
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Open A" }));
    expect(await screen.findByRole("tab", { name: "Color" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#strip/a");
    window.location.hash = "";
  });

  it("the Add strip button on Home opens the wizard", async () => {
    localStorage.setItem("lumen.state.v2", JSON.stringify({ onboarded: true }));
    backend([strip]);
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Add strip" }));
    expect(window.location.hash).toBe("#add");
    window.location.hash = "";
  });

  it("group card Open Living room opens that group's page", async () => {
    localStorage.setItem("lumen.state.v2", JSON.stringify({ onboarded: true }));
    const group = { id: "living-room", name: "Living room", members: ["a", "b"] };
    const strips = [
      { id: "a", name: "A", profile: "mrstar", calibration: { channel_order: "Rgb", min_brightness: 3, steps: 0, has_white: false } },
      { id: "b", name: "B", profile: "mrstar", calibration: { channel_order: "Rgb", min_brightness: 3, steps: 0, has_white: false } },
    ];
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "snapshot") return { strips, groups: [group] };
      if (cmd === "scan") return [];
      if (cmd === "profiles") return [];
      if (cmd === "bluetooth_state") return "on";
      if (cmd === "warm_up") return [];
      if (cmd.startsWith("wizard")) return undefined;
      return undefined;
    });
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Open Living room" }));
    expect(await screen.findByRole("tab", { name: "General" })).toBeInTheDocument();
    expect(window.location.hash).toBe("#group/living-room");
    window.location.hash = "";
  });

  it("pressing a card's power switch does not navigate", async () => {
    localStorage.setItem("lumen.state.v2", JSON.stringify({ onboarded: true }));
    backend([strip]);
    render(<App />);

    const powerSwitch = await screen.findByRole("switch", { name: /Turn on or off A/ });
    await userEvent.click(powerSwitch);
    expect(window.location.hash).toBe("");
  });

  it("closing the wizard opened to recalibrate a strip goes back to that strip", async () => {
    localStorage.setItem("lumen.state.v2", JSON.stringify({ onboarded: true }));
    backend([strip, { ...strip, id: "c", name: "C" }]);
    window.location.hash = "#add/c";
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Exit setup" }));
    await waitFor(() => expect(window.location.hash).toBe("#strip/c"));
  });

  it("closing the wizard opened to add a strip goes to Home", async () => {
    localStorage.setItem("lumen.state.v2", JSON.stringify({ onboarded: true }));
    backend([strip]);
    window.location.hash = "#add";
    render(<App />);

    await userEvent.click(await screen.findByRole("button", { name: "Exit setup" }));
    await waitFor(() => expect(window.location.hash).toBe("#home"));
  });


});
