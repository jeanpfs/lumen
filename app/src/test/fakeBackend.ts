import { vi } from "vitest";
import type { Command, Report, Snapshot, Target } from "../api";
import type { Backend } from "../state/store";

export const calibration = { channel_order: "Rgb" as const, min_brightness: 3, steps: 0, has_white: false };
export const strip = (id: string, name = id.toUpperCase()) => ({ id, name, profile: "mrstar", calibration });

export const snapshot: Snapshot = {
  strips: [strip("a"), strip("b"), strip("c")],
  groups: [{ id: "living-room", name: "Living room", members: ["a", "b"] }],
};

export interface FakeBackendResult {
  b: Backend;
  apply: ReturnType<typeof vi.fn>;
}

/** A backend whose every method is a spy; override what a test needs. */
export function fakeBackend(over: Partial<Backend> = {}): FakeBackendResult {
  const apply = vi.fn(async (targets: Target[], _command: Command): Promise<Report> => ({
    ok: targets.flatMap((t) => (t.type === "strip" ? [t.id] : (snapshot.groups.find((g) => g.id === t.id)?.members ?? []))),
    unreachable: [],
    unsupported: [],
  }));
  const ok = async () => undefined;
  const b = {
    snapshot: vi.fn(async () => snapshot),
    bluetoothState: vi.fn(async () => "on" as const),
    warmUp: vi.fn(async () => [] as string[]),
    openBluetoothSettings: vi.fn(ok),
    scan: vi.fn(async () => []),
    apply,
    createGroup: vi.fn(ok),
    addToGroup: vi.fn(ok),
    removeStrip: vi.fn(ok),
    removeFromGroup: vi.fn(ok),
    reorderGroup: vi.fn(ok),
    renameGroup: vi.fn(ok),
    deleteGroup: vi.fn(ok),
    renameStrip: vi.fn(ok),
    profiles: vi.fn(async () => []),
    setChannelOrder: vi.fn(ok),
    wizardRecalibrate: vi.fn(),
    wizardStart: vi.fn(),
    wizardProbe: vi.fn(),
    wizardAnswerPower: vi.fn(),
    wizardAnswerColour: vi.fn(),
    wizardPowerTest: vi.fn(),
    wizardColourTest: vi.fn(),
    wizardIntensityTest: vi.fn(),
    wizardFinish: vi.fn(),
    wizardCancel: vi.fn(ok),
    ...over,
  } as unknown as Backend;
  return { b, apply };
}
