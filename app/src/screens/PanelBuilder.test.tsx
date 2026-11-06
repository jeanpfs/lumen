import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "../state/store";
import { reloadPanels, usePanel } from "../state/panels";
import { fakeBackend } from "../test/fakeBackend";
import { PanelBuilder } from "./PanelBuilder";
import type { Go } from "../router";

// the app only mounts the builder once the snapshot is loaded; do the same here
function Gate({ go }: { go: Go }) {
  return useApp().state.loaded ? <PanelBuilder groupId="living-room" go={go} /> : null;
}

function Saved() {
  const { layout } = usePanel("living-room");
  return <output aria-label="saved">{layout ? layout.cells.join(",") : "none"}</output>;
}

beforeEach(() => {
  localStorage.clear();
  reloadPanels();
});

describe("PanelBuilder", () => {
  it("sizes the grid to the group, places every strip and saves the layout in sweep order", async () => {
    const user = userEvent.setup();
    const { b } = fakeBackend();
    const go = vi.fn();
    render(
      <AppProvider backend={b} sendDelayMs={10}>
        <Gate go={go} />
        <Saved />
      </AppProvider>,
    );
    // living-room has 2 strips: a 2x1 grid fits them exactly
    expect(await screen.findByText("Perfect: 2 strips and 2 squares.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByRole("heading", { name: "A is blinking" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Fill the rest" }));
    expect(await screen.findByRole("heading", { name: "Everything placed" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));

    await user.click(await screen.findByRole("button", { name: "Save panel" }));
    await waitFor(() => expect(go).toHaveBeenCalledWith("group", "living-room", { tab: "panel" }));
    expect(b.reorderGroup).toHaveBeenCalledWith("living-room", ["a", "b"]);
    expect(screen.getByLabelText("saved")).toHaveTextContent("a,b");
  });

  it("warns when the grid and the strips do not match", async () => {
    const user = userEvent.setup();
    const { b } = fakeBackend();
    render(
      <AppProvider backend={b} sendDelayMs={10}>
        <Gate go={vi.fn()} />
      </AppProvider>,
    );
    await screen.findByText("Perfect: 2 strips and 2 squares.");
    await user.click(screen.getByRole("button", { name: "+ Rows" }));
    expect(screen.getByText("This panel has 4 squares and you have 2 strips. 2 squares stay empty.")).toBeInTheDocument();
  });
});
