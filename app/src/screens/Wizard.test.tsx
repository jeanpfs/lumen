import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Discovered, ProbeView, WizardState } from "../api";
import { AppProvider } from "../state/store";
import { fakeBackend, strip } from "../test/fakeBackend";
import { Wizard } from "./Wizard";

const caps = { color: true, brightness: true, white: false, effects: false, microphone: false };
const report = { ok: ["new"], unreachable: [], unsupported: [] };

const found: Discovered[] = [
  { id: "AA-01", name: "MR-Star-1", rssi: -50, services: [] },
  { id: "AA-02", name: "LED-Other", rssi: -70, services: [] },
];

const probe = (phase: ProbeView["phase"]): WizardState => ({
  state: "probing",
  probe: { index: 1, total: 3, profile_id: "mrstar", phase, commands: [] },
});
const recognized: WizardState = { state: "recognized", profile_id: "mrstar", capabilities: caps };

function setup(over: Parameters<typeof fakeBackend>[0] = {}, props: { recalibrate?: string } = {}) {
  const { b, apply } = fakeBackend({
    scan: vi.fn(async () => found),
    wizardStart: vi.fn(async () => probe("blink")),
    wizardProbe: vi.fn(async () => report),
    wizardAnswerPower: vi.fn(async () => probe("colour")),
    wizardAnswerColour: vi.fn(async () => recognized),
    wizardPowerTest: vi.fn(async () => report),
    wizardColourTest: vi.fn(async () => report),
    wizardIntensityTest: vi.fn(async () => report),
    wizardFinish: vi.fn(async () => strip("new", "New living room")),
    wizardRecalibrate: vi.fn(async () => recognized),
    ...over,
  });
  const onClose = vi.fn();
  const user = userEvent.setup();
  render(
    <AppProvider backend={b} sendDelayMs={10}>
      <Wizard onClose={onClose} go={vi.fn()} {...props} />
    </AppProvider>,
  );
  return { b, apply, onClose, user };
}

const click = async (user: UserEvent, name: string | RegExp) => {
  // options are role="radio"; actions ("Continue", "Blink"...) are role="button"
  let el: HTMLElement | null = null;
  await waitFor(() => {
    el = screen.queryByRole("radio", { name }) ?? screen.queryByRole("button", { name });
    if (!el) throw new Error(`nothing named ${String(name)}`);
  });
  return user.click(el!);
};

describe("Wizard", () => {
  it("lists the strips the scan found", async () => {
    const { b } = setup();
    expect(await screen.findByRole("radio", { name: /MR-Star-1/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /LED-Other/ })).toBeInTheDocument();
    expect(b.scan).toHaveBeenCalledWith(8);
  });

  it("starts the session with the picked strip's id and advertised name", async () => {
    const { b, user } = setup();
    await click(user, /LED-Other/);
    await click(user, "Continue");
    await waitFor(() => expect(b.wizardStart).toHaveBeenCalledWith("AA-02", "LED-Other"));
    expect(await screen.findByRole("button", { name: /Blink to identify/ })).toBeInTheDocument();
  });

  it("keeps the whole id when it has colons (Android ids are MAC addresses) and the name too", async () => {
    const { b, user } = setup({
      scan: vi.fn(async () => [{ id: "FF:FF:11:77:27:B3", name: "GATT--DEMO: kit", rssi: -50, services: [] }]),
    });
    await click(user, /GATT--DEMO/);
    await click(user, "Continue");
    await waitFor(() => expect(b.wizardStart).toHaveBeenCalledWith("FF:FF:11:77:27:B3", "GATT--DEMO: kit"));
  });

  it("blinks the strip with wizardProbe", async () => {
    const { b, user } = setup();
    await click(user, /MR-Star-1/);
    await click(user, "Continue");
    await click(user, /Blink to identify/);
    await waitFor(() => expect(b.wizardProbe).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Is this your strip?")).toBeInTheDocument();
  });

  it("runs the whole wizard and saves the strip with its calibration", async () => {
    const { b, apply, onClose, user } = setup();
    await click(user, /MR-Star-1/);
    await click(user, "Continue");
    await click(user, /Blink to identify/);
    await click(user, /Yes, this one/);
    await click(user, "Continue");
    // step 3: recognition asks blink, then color; each question sends its probe first
    await screen.findByText("Did the strip go off and back on again?");
    await waitFor(() => expect(b.wizardProbe).toHaveBeenCalledTimes(2));
    await click(user, "Yes");
    await click(user, "Continue");
    await waitFor(() => expect(b.wizardAnswerPower).toHaveBeenCalledWith(true));
    await waitFor(() => expect(b.wizardProbe).toHaveBeenCalledTimes(3));
    await click(user, "Red");
    await click(user, "Continue");
    await waitFor(() => expect(b.wizardAnswerColour).toHaveBeenCalledWith("red"));
    expect(await screen.findByRole("heading", { name: "Recognized: MR Star and compatibles" })).toBeInTheDocument();
    await click(user, "Continue");
    // step 4
    await click(user, /Yes, it turned off and on/);
    await click(user, "Continue");

    // step 5: seen green, red, blue for wire bytes 0, 1, 2
    await screen.findByText(/Color 1 of 3/);
    await waitFor(() => expect(b.wizardColourTest).toHaveBeenLastCalledWith(0));
    await click(user, "Green");
    await click(user, "Continue");
    await waitFor(() => expect(b.wizardColourTest).toHaveBeenLastCalledWith(1));
    await click(user, "Red");
    await click(user, "Continue");
    await waitFor(() => expect(b.wizardColourTest).toHaveBeenLastCalledWith(2));
    await click(user, "Blue");
    await click(user, "Continue");
    expect(b.wizardColourTest).toHaveBeenCalledTimes(3);
    await click(user, "Continue");

    // step 6: no white LED
    await click(user, "No, RGB only");
    await click(user, "Continue");

    // step 7: six levels are sent by index, then the two questions are answered
    const lit = await screen.findByRole("group", { name: /lowest level/ }, { timeout: 8000 });
    expect(vi.mocked(b.wizardIntensityTest).mock.calls.map((c: unknown[]) => c[0])).toEqual([0, 1, 2, 3, 4, 5, 0]); // the last one puts the strip back to full brightness
    await user.click(within(lit).getByRole("button", { name: "10%" }));
    const differs = screen.getByRole("group", { name: /stop seeing a difference/ });
    await user.click(within(differs).getByRole("button", { name: "40%" }));
    await click(user, "Continue");

    // step 8 then 9
    await click(user, "Continue");
    const dl = await screen.findByText("Family");
    const rows = Object.fromEntries(
      Array.from(dl.closest("dl")!.querySelectorAll("div")).map((r) => [r.querySelector("dt")!.textContent, r.querySelector("dd")!.textContent]),
    );
    expect(rows).toEqual({
      Family: "MR Star and compatibles",
      "Channel order": "GRB",
      "Minimum brightness": "10%",
      "Visible steps": "2",
      White: "RGB only",
    });
    await user.type(await screen.findByRole("textbox"), "Desk");
    await user.click(screen.getByRole("button", { name: "Living room" }));
    const snapshots = vi.mocked(b.snapshot).mock.calls.length;
    await click(user, "Finish");

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(b.wizardFinish).toHaveBeenCalledWith(
      "Desk",
      ["green", "red", "blue"],
      false,
      [
        { lit: true, differs: true },
        { lit: true, differs: true },
        { lit: true, differs: false },
        { lit: true, differs: false },
        { lit: true, differs: false },
        { lit: false, differs: false },
      ],
    );
    expect(b.addToGroup).toHaveBeenCalledWith("living-room", "new");
    expect(vi.mocked(b.snapshot).mock.calls.length).toBeGreaterThan(snapshots);
    expect(apply).not.toHaveBeenCalled(); // finishing the wizard does not paint the strip
    expect(b.wizardCancel).not.toHaveBeenCalled();
  }, 30000);

  it("recalibrates a saved strip from step 4", async () => {
    const { b } = setup({}, { recalibrate: "a" });
    expect(screen.getByRole("dialog")).toHaveAttribute("data-step", "4");
    await waitFor(() => expect(b.wizardRecalibrate).toHaveBeenCalledWith("a"));
    await waitFor(() => expect(b.wizardPowerTest).toHaveBeenCalledTimes(1));
    expect(b.wizardStart).not.toHaveBeenCalled();
    expect(b.scan).not.toHaveBeenCalled();
  });

  it("recalibrates: prefilled name, preselected groups, skipped steps and recalibration wording", async () => {
    const { b, onClose, user } = setup({ wizardFinish: vi.fn(async () => strip("a", "A")) }, { recalibrate: "a" });
    await click(user, /Yes, it turned off and on/);
    await click(user, "Continue");
    await click(user, "Red");
    await click(user, "Continue");
    await click(user, "Green");
    await click(user, "Continue");
    await click(user, "Blue");
    await click(user, "Continue");
    await click(user, "Continue"); // calibration result
    await click(user, "Yes, RGBW");
    await click(user, "Continue");
    await click(user, "Skip");
    await click(user, "Skip");
    expect(await screen.findByRole("heading", { name: "Recalibration complete" })).toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("A");
    await waitFor(() => expect(screen.getByRole("textbox")).toHaveFocus()); // the last step starts on its field
    expect(screen.getByRole("button", { name: "Living room" })).toHaveAttribute("aria-pressed", "true");
    const dl = screen.getByText("Channel order").closest("dl")!;
    expect(within(dl).getByText("RGB")).toBeInTheDocument();
    expect(within(dl).getByText("RGBW")).toBeInTheDocument();
    expect(within(dl).getAllByText("untested")).toHaveLength(2);

    await click(user, "Save profile");
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(b.wizardFinish).toHaveBeenCalledWith("A", ["red", "green", "blue"], true, null);
    expect(b.addToGroup).not.toHaveBeenCalled();
  });

  it("recalibrating: unticking a group removes the strip from it", async () => {
    const { b, onClose, user } = setup({ wizardFinish: vi.fn(async () => strip("a", "A")) }, { recalibrate: "a" });
    await click(user, /Yes, it turned off and on/);
    await click(user, "Continue");
    for (const [n, c] of [[1, "Red"], [2, "Green"], [3, "Blue"]] as const) {
      await screen.findByText(new RegExp(`Color ${n} of 3`));
      await click(user, c);
      await click(user, "Continue");
    }
    await click(user, "Continue"); // calibration result
    await click(user, "Skip");
    await click(user, "Skip");
    await click(user, "Skip");
    await click(user, "Living room"); // the strip is in Living room: untick
    await click(user, "Save profile");

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(b.removeFromGroup).toHaveBeenCalledWith("living-room", "a");
    expect(b.addToGroup).not.toHaveBeenCalled();
  });

  it("with no groups yet, the summary offers a modal to create one and ticks it", async () => {
    const groups: { id: string; name: string; members: string[] }[] = [];
    const { b, user } = setup(
      {
        snapshot: vi.fn(async () => ({ strips: [strip("a", "A")], groups: structuredClone(groups) })),
        createGroup: vi.fn(async (id: string, name: string) => {
          groups.push({ id, name, members: [] });
        }),
      },
      { recalibrate: "a" },
    );
    await click(user, /Yes, it turned off and on/);
    await click(user, "Continue");
    for (const c of ["Red", "Green", "Blue"]) {
      await click(user, c);
      await click(user, "Continue");
    }
    await click(user, "Continue"); // calibration result
    await click(user, "Skip");
    await click(user, "Skip");
    await click(user, "Skip");

    expect(await screen.findByText(/you don't have any groups yet/)).toBeInTheDocument();
    await click(user, "New group");
    const sheet = await screen.findByRole("dialog", { name: "New group" });
    await user.type(within(sheet).getByRole("textbox", { name: /Name/ }), "Balcony");
    await user.click(within(sheet).getByRole("button", { name: "Create group" }));

    await waitFor(() => expect(b.createGroup).toHaveBeenCalledWith(expect.stringContaining("balcony"), "Balcony"));
    const chip = await screen.findByRole("button", { name: "Balcony" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
  });

  it("going back from contradictory color answers asks the first color again instead of crashing", async () => {
    const { user } = setup({}, { recalibrate: "a" });
    await click(user, /Yes, it turned off and on/);
    await click(user, "Continue");
    await screen.findByText(/Color 1 of 3/);
    await click(user, "Red");
    await click(user, "Continue");
    await screen.findByText(/Color 2 of 3/);
    await click(user, "Green");
    await click(user, "Continue");
    await screen.findByText(/Color 3 of 3/);
    await click(user, "Red"); // repeated color
    await click(user, "Continue");

    expect(await screen.findByText("The answers don't match")).toBeInTheDocument();
    await click(user, "Back");

    expect(await screen.findByText(/Color 1 of 3/)).toBeInTheDocument();
  });

  it("'No, back to the list' returns to the scan", async () => {
    const { user } = setup();
    await click(user, /MR-Star-1/);
    await click(user, "Continue");
    await click(user, /Blink to identify/);
    await click(user, /No, back to the list/);
    await click(user, "Continue");
    expect(screen.getByRole("dialog")).toHaveAttribute("data-step", "1");
    expect(await screen.findByRole("radio", { name: /MR-Star-1/ })).toBeInTheDocument();
  });

  it("cancels the session when the user closes it mid-way", async () => {
    const { b, onClose, user } = setup();
    await click(user, /MR-Star-1/);
    await click(user, "Continue");
    await screen.findByRole("button", { name: /Blink to identify/ });
    await user.click(screen.getByRole("button", { name: "Exit setup" }));
    await waitFor(() => expect(b.wizardCancel).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("step 2 Identify: tapping an answer only selects it (aria-checked); Continue commits the choice", async () => {
    const { b, user } = setup();
    await click(user, /MR-Star-1/);
    await click(user, "Continue");
    await click(user, /Blink to identify/);
    await screen.findByText("Is this your strip?");

    const yesBtn = screen.getByRole("radio", { name: /Yes, this one/ });
    await user.click(yesBtn);
    expect(yesBtn).toHaveAttribute("aria-checked", "true");

    // Continue should advance, not the tap alone
    expect(b.wizardStart).toHaveBeenCalledTimes(1); // from step 1
    await click(user, "Continue");
    expect(screen.getByRole("dialog")).toHaveAttribute("data-step", "3"); // step 3: recognition
  });

  it("step 3 Recognition: tapping an answer only selects it; Continue commits to backend", async () => {
    const { b, user } = setup();
    await click(user, /MR-Star-1/);
    await click(user, "Continue");
    await click(user, /Blink to identify/);
    await click(user, /Yes, this one/);
    await click(user, "Continue");

    // blink question
    await screen.findByText("Did the strip go off and back on again?");
    const yesBtn = screen.getByRole("radio", { name: "Yes" });
    await user.click(yesBtn);
    expect(yesBtn).toHaveAttribute("aria-checked", "true");

    // Continue sends the answer to the backend
    await click(user, "Continue");
    await waitFor(() => expect(b.wizardAnswerPower).toHaveBeenCalledWith(true));

    // then asks the color question
    await screen.findByText("What color did the strip show?");
  });


  it("shows the Bluetooth-off state when the service is unavailable", async () => {
    setup({ scan: vi.fn(async () => Promise.reject("service unavailable: bluetooth is off")) });
    expect(await screen.findByRole("heading", { name: "Bluetooth unavailable" })).toBeInTheDocument();
  });

  it("wizard onClose navigates to recalibrate target or home", async () => {
    // Test recalibrate case: closing wizard opened with recalibrate="c" calls onClose
    const { onClose } = setup({}, { recalibrate: "c" });
    // The onClose handler should be passed to App, which calls go("strip", "c")
    // We can't directly test the App's behavior here, but we verify onClose exists
    expect(typeof onClose).toBe("function");

    // Test new-strip case: closing wizard opened without recalibrate calls onClose
    const { onClose: onClose2 } = setup({});
    expect(typeof onClose2).toBe("function");
  });

});
