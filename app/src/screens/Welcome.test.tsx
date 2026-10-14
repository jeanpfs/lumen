import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppProvider } from "../state/store";
import { loadPersisted } from "../state/persist";
import { fakeBackend } from "../test/fakeBackend";
import { Welcome } from "./Welcome";

describe("Welcome", () => {
  it("marks onboarding done and calls onDone", async () => {
    const onDone = vi.fn();
    render(
      <AppProvider backend={fakeBackend().b} sendDelayMs={10}>
        <Welcome onDone={onDone} />
      </AppProvider>,
    );
    expect(loadPersisted().onboarded).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(onDone).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(loadPersisted().onboarded).toBe(true));
  });
});
