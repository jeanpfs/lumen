import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "../state/store";
import { fakeBackend } from "../test/fakeBackend";
import { TypesSheet, useProfiles } from "./Types";

const caps = { color: true, brightness: true, white: false, effects: true, microphone: false };
const profiles = [
  { id: "mrstar", capabilities: caps, verified: true },
  { id: "xrocker", capabilities: { ...caps, effects: false }, verified: false },
];

function Harness({ onClose }: { onClose: () => void }) {
  const t = useProfiles();
  return <TypesSheet profiles={t.profiles} error={t.error} onRetry={t.reload} onClose={onClose} />;
}

function setup(over = {}) {
  const onClose = vi.fn();
  const { b } = fakeBackend({ profiles: vi.fn(async () => profiles), ...over });
  render(
    <AppProvider backend={b} sendDelayMs={10}>
      <Harness onClose={onClose} />
    </AppProvider>,
  );
  return Object.assign(b, { onClose });
}

describe("TypesSheet", () => {
  it("is a dialog that closes with its X", async () => {
    const b = setup();
    const dialog = await screen.findByRole("dialog", { name: "Supported strip types" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(b.onClose).toHaveBeenCalledTimes(1);
  });

  it("lists the catalogue and marks what was verified on a real strip", async () => {
    setup();
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("MR Star and compatibles")).toBeInTheDocument();
    expect(within(items[0]).getByText("Verified")).toBeInTheDocument();
    expect(within(items[0]).getByText("Effects")).toBeInTheDocument();
    expect(within(items[1]).getByText("XROCKER")).toBeInTheDocument();
    expect(within(items[1]).getByText(/not yet verified on a real strip/i)).toBeInTheDocument();
    expect(within(items[1]).queryByText("Verified")).not.toBeInTheDocument();
  });

  it("shows the error and retries", async () => {
    const profilesFn = vi.fn().mockRejectedValueOnce("failed").mockResolvedValue(profiles);
    setup({ profiles: profilesFn });
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("XROCKER")).toBeInTheDocument();
  });
});
