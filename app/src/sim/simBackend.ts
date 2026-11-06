import type { Report, Snapshot, Strip, Target } from "../api";
import type { Backend } from "../state/store";

// Development only (`npm run dev`, open /?sim): 16 pretend strips in one group, so the whole UI can be tried
// in a browser or an emulator without Bluetooth. Strip 12 never answers, to show the "no signal" paths.

const calibration = { channel_order: "Rgb" as const, min_brightness: 3, steps: 0, has_white: false };
const pad = (n: number) => String(n).padStart(2, "0");
const strips: Strip[] = Array.from({ length: 16 }, (_, i) => ({ id: `fita-${pad(i + 1)}`, name: `Fita ${pad(i + 1)}`, profile: "mrstar", calibration }));
const DEAD = "fita-12";

export function simBackend(): Backend {
  const snap: Snapshot = { strips: [...strips], groups: [{ id: "pista", name: "Pista de dança", members: strips.map((s) => s.id) }] };
  const copy = (): Snapshot => JSON.parse(JSON.stringify(snap)) as Snapshot;
  const group = (id: string) => snap.groups.find((g) => g.id === id);
  const ids = (targets: Target[]) => targets.flatMap((t) => (t.type === "strip" ? [t.id] : (group(t.id)?.members ?? [])));
  const nope = async () => {
    throw new Error("not available in the simulator");
  };
  const ok = async () => undefined;

  const b = {
    snapshot: async () => copy(),
    bluetoothState: async () => "on" as const,
    openBluetoothSettings: ok,
    warmUp: async () => strips.map((s) => s.id),
    scan: async () => [],
    apply: async (targets: Target[]): Promise<Report> => {
      const all = ids(targets);
      await new Promise((r) => setTimeout(r, 15));
      return { ok: all.filter((id) => id !== DEAD), unreachable: all.filter((id) => id === DEAD), unsupported: [] };
    },
    createGroup: async (id: string, name: string) => void snap.groups.push({ id, name, members: [] }),
    addToGroup: async (g: string, s: string) => void group(g)?.members.push(s),
    removeStrip: async (id: string) => void (snap.strips = snap.strips.filter((s) => s.id !== id)),
    removeFromGroup: async (g: string, s: string) => {
      const grp = group(g);
      if (grp) grp.members = grp.members.filter((m) => m !== s);
    },
    reorderGroup: async (g: string, order: string[]) => {
      const grp = group(g);
      if (grp) grp.members = order;
    },
    renameGroup: async (g: string, name: string) => {
      const grp = group(g);
      if (grp) grp.name = name;
    },
    deleteGroup: async (g: string) => void (snap.groups = snap.groups.filter((x) => x.id !== g)),
    renameStrip: async (id: string, name: string) => {
      const s = snap.strips.find((x) => x.id === id);
      if (s) s.name = name;
    },
    profiles: async () => [],
    systemLocale: async () => null,
    setChannelOrder: ok,
    wizardRecalibrate: nope,
    wizardStart: nope,
    wizardProbe: nope,
    wizardAnswerPower: nope,
    wizardAnswerColour: nope,
    wizardPowerTest: nope,
    wizardColourTest: nope,
    wizardIntensityTest: nope,
    wizardFinish: nope,
    wizardCancel: ok,
  };
  return b as unknown as Backend;
}
