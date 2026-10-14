import type { Favourite, Presumed, State, Theme } from "./types";

const KEY = "lumen.state.v2";

export interface Persisted {
  presumed: Record<string, Presumed>;
  favourites: Favourite[];
  overrides: string[];
  theme: Theme;
  onboarded: boolean;
}

export const EMPTY: Persisted = {
  presumed: {},
  favourites: [],
  overrides: [],
  theme: "dark",
  onboarded: false,
};

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function validEntry(v: unknown): v is Presumed {
  return isObj(v) && typeof v.on === "boolean" && isNum(v.h) && isNum(v.s) && isNum(v.b);
}

/** Reads what the app remembers. Anything malformed is dropped field by field, never thrown. */
export function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const data = JSON.parse(raw) as unknown;
    if (!isObj(data)) return { ...EMPTY };

    const presumed: Record<string, Presumed> = {};
    if (isObj(data.presumed)) {
      for (const [k, v] of Object.entries(data.presumed)) if (validEntry(v)) presumed[k] = v;
    }
    return {
      presumed,
      favourites: Array.isArray(data.favourites)
        ? data.favourites.filter(
            (f): f is Favourite => isObj(f) && isNum(f.h) && isNum(f.s),
          )
        : [],
      overrides: Array.isArray(data.overrides) ? data.overrides.filter((x): x is string => typeof x === "string") : [],
      theme: data.theme === "light" ? "light" : "dark",
      onboarded: data.onboarded === true,
    };
  } catch {
    return { ...EMPTY };
  }
}

export function savePersisted(state: Pick<State, keyof Persisted>): void {
  try {
    const out: Persisted = {
      presumed: state.presumed,
      favourites: state.favourites,
      overrides: state.overrides,
      theme: state.theme,
      onboarded: state.onboarded,
    };
    localStorage.setItem(KEY, JSON.stringify(out));
  } catch {
    // storage unavailable (private mode, quota): the app still works, it just forgets
  }
}
