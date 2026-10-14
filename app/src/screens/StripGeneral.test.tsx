import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "../state/store";
import { percentOfProto } from "../lib/color";
import { calibration, fakeBackend, snapshot, strip } from "../test/fakeBackend";
import { StripGeneral } from "./StripGeneral";

function setup(id: string) {
  const { b } = fakeBackend();
  const go = vi.fn();
  render(
    <AppProvider backend={b} sendDelayMs={5}>
      <StripGeneral stripId={id} go={go} />
    </AppProvider>,
  );
  return { b, go };
}

describe("StripGeneral", () => {
  it("lists the groups the strip belongs to and opens one", async () => {
    const { go } = setup("a");
    await screen.findByLabelText("Color order");
    await userEvent.click(screen.getByRole("button", { name: "Living room" }));
    expect(go).toHaveBeenCalledWith("group", "living-room");
  });

  it("removes the strip from a group it is in", async () => {
    const { b } = setup("a");
    await screen.findByLabelText("Color order");
    await userEvent.click(screen.getByRole("button", { name: "Leave Living room" }));
    await waitFor(() => expect(b.removeFromGroup).toHaveBeenCalledWith("living-room", "a"));
  });

  it("changes the channel order", async () => {
    const { b } = setup("c");
    await userEvent.selectOptions(await screen.findByLabelText("Color order"), "Grb");
    expect(b.setChannelOrder).toHaveBeenCalledWith("c", "Grb");
  });

  it("recalibrate opens the wizard for this strip", async () => {
    const { go } = setup("c");
    await screen.findByLabelText("Color order");
    await userEvent.click(screen.getByRole("button", { name: /Recalibrate/ }));
    expect(go).toHaveBeenCalledWith("add", "c");
  });

  it("adds the strip to a group it is not in", async () => {
    const { b } = setup("c");
    await screen.findByLabelText("Color order");
    expect(screen.queryByRole("button", { name: "Living room" })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Add to Living room" }));
    await waitFor(() => expect(b.addToGroup).toHaveBeenCalledWith("living-room", "c"));
  });

  it("shows the minimum brightness in percent, not protocol units", async () => {
    const { b } = fakeBackend({
      snapshot: vi.fn(async () => ({
        ...snapshot,
        strips: [{ ...strip("a"), calibration: { ...calibration, min_brightness: 200 } }],
      })),
    });
    const go = vi.fn();
    render(
      <AppProvider backend={b} sendDelayMs={5}>
        <StripGeneral stripId="a" go={go} />
      </AppProvider>,
    );
    await screen.findByLabelText("Color order");
    const exactText = `${percentOfProto(200)}%`;
    expect(await screen.findByText(exactText)).toBeInTheDocument();
    expect(screen.queryByText("200%")).not.toBeInTheDocument();
  });

  it("renders nothing for a strip that does not exist", async () => {
    const { b } = setup("zzz");
    await waitFor(() => expect(b.snapshot).toHaveBeenCalled());
    expect(screen.queryByLabelText("Color order")).not.toBeInTheDocument();
  });


});
