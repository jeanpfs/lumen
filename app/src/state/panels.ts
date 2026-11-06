import { useSyncExternalStore } from "react";
import { BASE_FX, MAX_SIDE, type Fx, type Layout, type SavedFx } from "../lib/panel";

// Layouts and saved effects, keyed by group id. They live on this device only (own key, not the registry):
// shortcut: they do not follow a reinstall or a second phone; move them into the core registry if that matters.
const KEY = "lumen.panels.v1";

interface Data {
  layouts: Record<string, Layout>;
  effects: Record<string, SavedFx[]>;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const side = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= MAX_SIDE;

function validLayout(v: unknown): v is Layout {
  return (
    isObj(v) &&
    side(v.cols) &&
    side(v.rows) &&
    Array.isArray(v.cells) &&
    v.cells.length === v.cols * v.rows &&
    v.cells.every((c) => c === null || typeof c === "string") &&
    ["tl", "tr", "bl", "br"].includes(v.start as string) &&
    ["snake", "row", "col"].includes(v.walk as string)
  );
}

function validFx(v: unknown): v is Fx {
  return (
    isObj(v) &&
    ["order", "rows", "cols", "diag", "spiral", "center", "rand", "draw"].includes(v.path as string) &&
    Array.isArray(v.draw) &&
    v.draw.every(isNum) &&
    ["run", "blink", "all", "fixed"].includes(v.act as string) &&
    isNum(v.hue) &&
    isNum(v.sat) &&
    isNum(v.trail) &&
    isNum(v.speed) &&
    typeof v.pingPong === "boolean" &&
    typeof v.rule === "boolean" &&
    isNum(v.n)
  );
}

/** Reads what the app saved; anything malformed is dropped entry by entry, never thrown. */
export function loadPanels(): Data {
  const out: Data = { layouts: {}, effects: {} };
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? "null") as unknown;
    if (!isObj(data)) return out;
    if (isObj(data.layouts)) for (const [k, v] of Object.entries(data.layouts)) if (validLayout(v)) out.layouts[k] = v;
    if (isObj(data.effects)) {
      for (const [k, list] of Object.entries(data.effects)) {
        if (!Array.isArray(list)) continue;
        out.effects[k] = list.filter(
          (e): e is SavedFx => isObj(e) && typeof e.id === "string" && typeof e.name === "string" && validFx(e.fx),
        );
      }
    }
  } catch {
    // unreadable: start empty
  }
  return out;
}

let data: Data = loadPanels();
const subs = new Set<() => void>();

function commit(next: Data) {
  data = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // storage unavailable: the session keeps working, it just forgets
  }
  subs.forEach((f) => f());
}

/** Test seam: forget the in-memory copy and re-read storage. */
export const reloadPanels = () => {
  data = loadPanels();
  subs.forEach((f) => f());
};

export const setLayout = (group: string, layout: Layout) => commit({ ...data, layouts: { ...data.layouts, [group]: layout } });

export function saveEffect(group: string, name: string, fx: Fx): string {
  const id = `fx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  commit({ ...data, effects: { ...data.effects, [group]: [...(data.effects[group] ?? []), { id, name, fx: { ...BASE_FX, ...fx } }] } });
  return id;
}

export const deleteEffect = (group: string, id: string) =>
  commit({ ...data, effects: { ...data.effects, [group]: (data.effects[group] ?? []).filter((e) => e.id !== id) } });

/** Layout and saved effects of one group; re-renders when they change. */
export function usePanel(group: string): { layout: Layout | undefined; effects: SavedFx[] } {
  const snap = useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => data,
  );
  return { layout: snap.layouts[group], effects: snap.effects[group] ?? [] };
}
