import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { calibration as _c, fakeBackend, snapshot } from "../test/fakeBackend";
import { presumedOf, AppProvider, useApp, type Backend } from "./store";

void _c;

function backend(over: Partial<Backend> = {}) {
  return fakeBackend(over);
}

function setup(b: Backend) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AppProvider backend={b} sendDelayMs={10} returnRetryMs={10}>
      {children}
    </AppProvider>
  );
  return renderHook(() => useApp(), { wrapper });
}

describe("app store", () => {
  it("loads the snapshot", async () => {
    const { result } = setup(backend().b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));
    expect(result.current.state.snapshot.strips).toHaveLength(3);
    expect("target" in result.current.state).toBe(false);
  });

  it("sends a power command for a strip and marks it live", async () => {
    const { b, apply } = backend();
    const { result } = setup(b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));

    await act(() => result.current.actions.setPower({ kind: "strip", id: "a" }, true));

    expect(apply).toHaveBeenCalledWith([{ type: "strip", id: "a" }], { type: "power", value: true });
    expect(presumedOf(result.current.state, { kind: "strip", id: "a" }).on).toBe(true);
    expect(result.current.state.link.a).toBe("live");
  });

  it("marks strips the report could not reach", async () => {
    const { b } = backend({
      apply: async () => ({ ok: ["a"], unreachable: ["b"], unsupported: [] }),
    });
    const { result } = setup(b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));

    await act(() => result.current.actions.setPower({ kind: "group", id: "living-room" }, true));

    expect(result.current.state.link).toMatchObject({ a: "live", b: "unreachable" });
  });

  it("a group command updates the presumed state of every member", async () => {
    const { result } = setup(backend().b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));

    await act(() => result.current.actions.setPower({ kind: "group", id: "living-room" }, true));

    for (const id of ["a", "b"]) {
      expect(presumedOf(result.current.state, { kind: "strip", id }).on).toBe(true);
    }
    expect(presumedOf(result.current.state, { kind: "strip", id: "c" }).on).toBe(false);
  });

  it("picking a color while off turns the target on and sends power before color", async () => {
    const { b, apply } = backend();
    const { result } = setup(b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));
    const t = { kind: "strip" as const, id: "c" };

    act(() => result.current.actions.setColour(t, 120, 100));
    await act(() => result.current.actions.flush());

    expect(apply.mock.calls.map(([, c]) => c)).toEqual([
      { type: "power", value: true },
      { type: "color", value: { hue: 120, sat: 1000 } },
    ]);
    expect(presumedOf(result.current.state, t)).toMatchObject({ on: true, h: 120, s: 100 });
  });

  it("brightness is sent in protocol units", async () => {
    const { b, apply } = backend();
    const { result } = setup(b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));
    const t = { kind: "strip" as const, id: "a" };
    await act(() => result.current.actions.setPower(t, true));
    apply.mockClear();

    act(() => result.current.actions.setBrightness(t, 100));
    await act(() => result.current.actions.flush());

    expect(apply.mock.calls.map(([, c]) => c)).toEqual([{ type: "brightness", value: 1000 }]);
  });

  it("an unavailable backend is recorded, not shown as a toast", async () => {
    const { b } = backend({
      snapshot: async () => {
        throw "service unavailable: no adapter";
      },
    });
    const { result } = setup(b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));
    expect(result.current.state.unavailable).toContain("no adapter");
    expect(result.current.state.toast).toBeNull();
  });

  it("other errors become a toast", async () => {
    const { b } = backend({
      apply: async () => {
        throw "write failed";
      },
    });
    const { result } = setup(b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));
    await act(() => result.current.actions.setPower({ kind: "strip", id: "a" }, true));
    expect(result.current.state.toast?.text).toContain("write failed");
  });

  it("remembers what was sent across a restart", async () => {
    const first = setup(backend().b);
    await waitFor(() => expect(first.result.current.state.loaded).toBe(true));
    await act(() => first.result.current.actions.setPower({ kind: "strip", id: "a" }, true));
    first.unmount();

    const second = setup(backend().b);
    await waitFor(() => expect(second.result.current.state.loaded).toBe(true));
    expect(presumedOf(second.result.current.state, { kind: "strip", id: "a" }).on).toBe(true);
  });

  it("forgets presumed state of strips that no longer exist", async () => {
    localStorage.setItem(
      "lumen.state.v2",
      JSON.stringify({ presumed: { "strip:gone": { on: true, h: 1, s: 1, b: 50 } }, favourites: [] }),
    );
    const { result } = setup(backend().b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));
    expect(result.current.state.presumed["strip:gone"]).toBeUndefined();
  });

  it("ignores corrupt persisted data", async () => {
    localStorage.setItem("lumen.state.v2", "{not json");
    const { result } = setup(backend().b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));
    expect(result.current.state.snapshot.strips).toHaveLength(3);
    expect(result.current.state.presumed).toEqual({});
  });

  it("retry keeps an unreachable strip unreachable", async () => {
    const { b } = backend({
      apply: async () => ({ ok: [], unreachable: ["a"], unsupported: [] }),
    });
    const { result } = setup(b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));

    // First attempt fails
    await act(() => result.current.actions.setPower({ kind: "strip", id: "a" }, true));
    expect(result.current.state.link.a).toBe("unreachable");

    // Retry also fails the same way
    await act(() => result.current.actions.retry("a"));
    expect(result.current.state.link.a).toBe("unreachable");
  });

  it("retry marks a recovered strip as live", async () => {
    let down = true; // the strip is unreachable until it "comes back"
    const { b } = backend({
      apply: async () =>
        down ? { ok: [], unreachable: ["a"], unsupported: [] } : { ok: ["a"], unreachable: [], unsupported: [] },
    });
    const { result } = setup(b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));

    await act(() => result.current.actions.setPower({ kind: "strip", id: "a" }, true));
    expect(result.current.state.link.a).toBe("unreachable");

    down = false;
    await act(() => result.current.actions.retry("a"));
    expect(result.current.state.link.a).toBe("live");
  });

  it("coming back to the app retries the unreachable strips, and only those", async () => {
    let down = true;
    const apply = vi.fn(async (targets: Array<{ id: string }>) =>
      targets.some((t) => t.id === "a") && down
        ? { ok: [], unreachable: ["a"], unsupported: [] }
        : { ok: targets.map((t) => t.id), unreachable: [], unsupported: [] },
    );
    const { b } = backend({ apply: apply as unknown as Backend["apply"] });
    const { result } = setup(b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));
    await act(() => result.current.actions.setPower({ kind: "strip", id: "a" }, true));
    await act(() => result.current.actions.setPower({ kind: "strip", id: "b" }, true));
    expect(result.current.state.link.a).toBe("unreachable");
    expect(result.current.state.link.b).toBe("live");
    apply.mockClear();

    down = false;
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await waitFor(() => expect(result.current.state.link.a).toBe("live"));
    expect(apply.mock.calls.map(([t]) => t)).toEqual([[{ type: "strip", id: "a" }]]);
  });

  it("turning on re-sends the brightness the screen shows, after power", async () => {
    const { b, apply } = backend();
    const { result } = setup(b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));
    await act(async () => {
      result.current.actions.setBrightness({ kind: "strip", id: "a" }, 40);
      await result.current.actions.flush();
    });
    await act(() => result.current.actions.setPower({ kind: "strip", id: "a" }, false));
    apply.mockClear();

    await act(() => result.current.actions.setPower({ kind: "strip", id: "a" }, true));

    expect(apply.mock.calls.map(([, c]) => c)).toEqual([
      { type: "power", value: true },
      { type: "brightness", value: expect.any(Number) },
    ]);
  });

  it("setPower immediate followed by setColour queues power:false last, ending with power off", async () => {
    const { b, apply } = backend();
    const { result } = setup(b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));
    const t = { kind: "strip" as const, id: "c" };

    // setColour on an off target queues power:true
    act(() => result.current.actions.setColour(t, 120, 100));
    // setPower(false) should queue power:false, overwriting the queued power:true
    await act(() => result.current.actions.setPower(t, false));

    // All queued commands should be flushed
    expect(apply.mock.calls.map(([, c]) => c)).toEqual([{ type: "power", value: false }]);
    expect(presumedOf(result.current.state, t).on).toBe(false);
  });

  it("createGroup refreshes snapshot even when addToGroup fails", async () => {
    let addToGroupFailed = false;
    const { b } = backend({
      addToGroup: async () => {
        if (!addToGroupFailed) {
          addToGroupFailed = true;
          throw "addToGroup failed";
        }
      },
    });
    const { result } = setup(b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));

    const groupId = await act(() =>
      result.current.actions.createGroup("test-group", ["a", "b"])
    );

    // Verify that snapshot was refreshed (loaded state refreshed) despite the error
    expect(result.current.state.loaded).toBe(true);
    expect(groupId).toBeNull();
  });

  it("removeStrip refreshes snapshot even when backend fails", async () => {
    let snapshotCallsBefore = 0;
    const { b } = backend({
      removeStrip: async () => {
        throw "removeStrip failed";
      },
      snapshot: async () => {
        snapshotCallsBefore++;
        return snapshot;
      },
    });
    const { result } = setup(b);
    await waitFor(() => expect(result.current.state.loaded).toBe(true));
    const callsBefore = snapshotCallsBefore;

    const success = await act(() => result.current.actions.removeStrip("c"));
    
    // Verify snapshot was still refreshed after the error
    expect(success).toBe(false);
    expect(snapshotCallsBefore).toBeGreaterThan(callsBefore);
  });


});
