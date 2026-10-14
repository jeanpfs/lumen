import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { api as realApi, errorMessage, type Command, type Report, type Target } from "../api";
import { protoB, protoS } from "../lib/color";
import { loadPersisted, savePersisted } from "./persist";
import { Sender } from "./sender";
import {
  DEFAULT_PRESUMED,
  targetKey,
  type EventLine,
  type Favourite,
  type Link,
  type Presumed,
  type State,
  type TargetRef,
  type Theme,
} from "./types";
import type { BluetoothState, Snapshot } from "../api";

/** The Tauri commands the app uses (tests pass a fake). */
export type Backend = typeof realApi;

type Action =
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "unavailable"; message: string }
  | { type: "loaded" }
  | { type: "presumed"; keys: string[]; patch: Partial<Presumed> }
  | { type: "link"; ids: string[]; link: Link }
  | { type: "favourite"; favourite: Favourite }
  | { type: "override"; id: string; on: boolean }
  | { type: "theme"; theme: Theme }
  | { type: "onboarded" }
  | { type: "event"; line: EventLine }
  | { type: "bluetooth"; value: BluetoothState }
  | { type: "effect"; keys: string[]; id: number | null }
  | { type: "toast"; id: number; text: string };

export function membersOf(snapshot: Snapshot, t: TargetRef): string[] {
  if (t.kind === "strip") return [t.id];
  return snapshot.groups.find((g) => g.id === t.id)?.members ?? [];
}

export function reducer(state: State, a: Action): State {
  switch (a.type) {
    case "snapshot": {
      const stripIds = new Set(a.snapshot.strips.map((s) => s.id));
      const groupIds = new Set(a.snapshot.groups.map((g) => g.id));
      const live = new Set([
        ...[...stripIds].map((id) => targetKey({ kind: "strip", id })),
        ...[...groupIds].map((id) => targetKey({ kind: "group", id })),
      ]);
      return {
        ...state,
        snapshot: a.snapshot,
        loaded: true,
        unavailable: null,
        presumed: Object.fromEntries(Object.entries(state.presumed).filter(([k]) => live.has(k))),
        overrides: state.overrides.filter((id) => stripIds.has(id)),
      };
    }
    case "unavailable":
      return { ...state, loaded: true, unavailable: a.message };
    case "loaded":
      return { ...state, loaded: true };
    case "presumed": {
      const presumed = { ...state.presumed };
      for (const k of a.keys) presumed[k] = { ...(presumed[k] ?? DEFAULT_PRESUMED), ...a.patch };
      return { ...state, presumed };
    }
    case "link": {
      const link = { ...state.link };
      for (const id of a.ids) link[id] = a.link;
      return { ...state, link };
    }
    case "favourite": {
      const exists = state.favourites.some((f) => f.h === a.favourite.h && f.s === a.favourite.s);
      return exists ? state : { ...state, favourites: [...state.favourites, a.favourite].slice(-12) };
    }
    case "override": {
      const without = state.overrides.filter((id) => id !== a.id);
      return { ...state, overrides: a.on ? [...without, a.id] : without };
    }
    case "theme":
      return { ...state, theme: a.theme };
    case "onboarded":
      return { ...state, onboarded: true };
    case "bluetooth":
      return state.bluetooth === a.value ? state : { ...state, bluetooth: a.value };
    case "event":
      return { ...state, events: [a.line, ...state.events].slice(0, 30) };
    case "effect": {
      const effects = { ...state.effects };
      for (const k of a.keys) {
        if (a.id === null) delete effects[k];
        else effects[k] = a.id;
      }
      return { ...state, effects };
    }
    case "toast":
      return { ...state, toast: { id: a.id, text: a.text } };
  }
}

export interface Actions {
  refresh(): Promise<void>;
  setPower(t: TargetRef, on: boolean): Promise<void>;
  /** Color is hue 0-360 and saturation 0-100. Sent throttled; turns the target on. */
  setColour(t: TargetRef, h: number, s: number): void;
  /** Brightness is 3-100 percent. Sent throttled; turns the target on. */
  setBrightness(t: TargetRef, b: number): void;
  /** Sends whatever is queued right now (pointer released). */
  flush(): Promise<void>;
  /**
   * Plays built-in effect `id` (the mode number) at `speed` 1-100 on the target, switching it on
   * first when it looks off. A color sent later to a strip it reaches replaces it; power and brightness do not.
   */
  setEffect(t: TargetRef, id: number, speed: number): void;
  /** Speed 1-100 of the running effect. Sent throttled. */
  setSpeed(t: TargetRef, speed: number): void;
  setDirection(t: TargetRef, on: boolean): void;
  retry(stripId: string): Promise<void>;
  saveFavourite(h: number, s: number): void;
  notify(text: string): void;
  setTheme(theme: Theme): void;
  finishOnboarding(): void;
  /** Gives one strip its own color inside its groups. */
  setStripOwnColour(stripId: string, h: number, s: number): void;
  /** Makes the strip follow `groupId` again and sends it the group's color. */
  followGroup(stripId: string, groupId: string): void;
  createGroup(name: string, stripIds: string[]): Promise<string | null>;
  addToGroup(groupId: string, stripIds: string[]): Promise<void>;
  removeFromGroup(groupId: string, stripIds: string[]): Promise<void>;
  reorderGroup(groupId: string, order: string[]): Promise<void>;
  renameGroup(groupId: string, name: string): Promise<void>;
  deleteGroup(groupId: string): Promise<boolean>;
  renameStrip(stripId: string, name: string): Promise<void>;
  removeStrip(stripId: string): Promise<boolean>;
  /** Android: asks the system to switch Bluetooth on. Elsewhere: opens the system's Bluetooth settings. */
  enableBluetooth(): void;
  setChannelOrder(stripId: string, order: Parameters<Backend["setChannelOrder"]>[1]): Promise<void>;
}

interface Ctx {
  state: State;
  actions: Actions;
  backend: Backend;
}

const AppCtx = createContext<Ctx | null>(null);

export function useApp(): Ctx {
  const ctx = useContext(AppCtx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

function initialState(): State {
  const p = loadPersisted();
  return {
    snapshot: { strips: [], groups: [] },
    loaded: false,
    unavailable: null,
    presumed: p.presumed,
    link: {},
    favourites: p.favourites,
    overrides: p.overrides,
    theme: p.theme,
    onboarded: p.onboarded,
    events: [],
    bluetooth: "unknown",
    effects: {},
    toast: null,
  };
}

const UNAVAILABLE = "service unavailable";
const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "group";

export function AppProvider({
  backend = realApi,
  sendDelayMs = 150,
  returnRetryMs = 1500,
  bluetoothPollMs = 2000,
  children,
}: {
  backend?: Backend;
  sendDelayMs?: number;
  /** How long after the app comes back to the foreground unreachable strips are tried again. */
  returnRetryMs?: number;
  /** How often the Bluetooth radio's state is read. */
  bluetoothPollMs?: number;
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const toastId = useRef(0);

  useEffect(() => {
    savePersisted(state);
  }, [state.presumed, state.favourites, state.overrides, state.theme, state.onboarded]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
  }, [state.theme]);

  const notify = useCallback((text: string) => dispatch({ type: "toast", id: ++toastId.current, text }), []);
  const event = useCallback((text: string) => dispatch({ type: "event", line: { at: Date.now(), text } }), []);

  const fail = useCallback(
    (e: unknown, label: string) => {
      const msg = errorMessage(e);
      if (msg.includes(UNAVAILABLE)) dispatch({ type: "unavailable", message: msg });
      else notify(`${label}: ${msg}`);
      event(`${label}: ${msg}`);
    },
    [notify, event],
  );

  /** Which strips a command reaches: a group's color/brightness skips strips with their own color. */
  const targetsFor = useCallback((t: TargetRef, command: Command): Target[] => {
    const s = stateRef.current;
    if (t.kind === "group" && command.type !== "power" && s.overrides.length > 0) {
      const own = new Set(s.overrides);
      return membersOf(s.snapshot, t)
        .filter((id) => !own.has(id))
        .map((id) => ({ type: "strip" as const, id }));
    }
    return [{ type: t.kind, id: t.id }];
  }, []);

  const send = useCallback(
    async (t: TargetRef, command: Command): Promise<Report | null> => {
      const targets = targetsFor(t, command);
      if (targets.length === 0) return null;
      try {
        const report = await backend.apply(targets, command);
        dispatch({ type: "link", ids: report.ok, link: "live" });
        dispatch({ type: "link", ids: report.unreachable, link: "unreachable" });
        if (report.unreachable.length > 0) event(`Unreachable: ${report.unreachable.length}`);
        if (report.unsupported.length > 0 && ["effect", "speed", "direction"].includes(command.type)) {
          notify(`Effects are not available on ${report.unsupported.length} strip(s) of this target`);
        }
        return report;
      } catch (e) {
        fail(e, "Send");
        return null;
      }
    },
    [backend, fail, event, notify, targetsFor],
  );

  const sendRef = useRef(send);
  sendRef.current = send;
  const sender = useMemo(
    () =>
      new Sender(async (t, c) => {
        await sendRef.current(t, c);
      }, sendDelayMs),
    [sendDelayMs],
  );

  /** Forgets the effect shown on every target that shares a strip with `t`: a color sent now replaces it. */
  const endEffect = useCallback((t: TargetRef) => {
    const snapshot = stateRef.current.snapshot;
    const mine = new Set(membersOf(snapshot, t));
    const keys = [targetKey(t)];
    for (const s of snapshot.strips) if (mine.has(s.id)) keys.push(targetKey({ kind: "strip", id: s.id }));
    for (const g of snapshot.groups) if (g.members.some((id) => mine.has(id))) keys.push(targetKey({ kind: "group", id: g.id }));
    dispatch({ type: "effect", keys, id: null });
  }, []);

  /** Updates what we believe a target shows. Color and brightness skip strips with their own color. */
  const patch = useCallback((t: TargetRef, p: Partial<Presumed>) => {
    const s = stateRef.current;
    const keys = [targetKey(t)];
    if (t.kind === "group") {
      const own = new Set(s.overrides);
      const touchesColour = "h" in p || "s" in p || "b" in p;
      for (const id of membersOf(s.snapshot, t)) {
        if (touchesColour && own.has(id)) continue;
        keys.push(targetKey({ kind: "strip", id }));
      }
    }
    dispatch({ type: "presumed", keys, patch: p });
  }, []);

  const wasOn = (t: TargetRef) => stateRef.current.presumed[targetKey(t)]?.on ?? false;
  const presumedNow = (t: TargetRef): Presumed => stateRef.current.presumed[targetKey(t)] ?? DEFAULT_PRESUMED;

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>, after?: () => Promise<void>): Promise<boolean> => {
      try {
        await fn();
        return true;
      } catch (e) {
        fail(e, label);
        return false;
      } finally {
        if (after) await after();
      }
    },
    [fail],
  );

  const runVoid = useCallback(
    async (label: string, fn: () => Promise<unknown>, after?: () => Promise<void>): Promise<void> => {
      await run(label, fn, after);
    },
    [run],
  );

  const actions = useMemo<Actions>(() => {
    const refresh = async () => {
      try {
        dispatch({ type: "snapshot", snapshot: await backend.snapshot() });
      } catch (e) {
        dispatch({ type: "loaded" });
        fail(e, "Load strips");
      }
    };
    return {
      refresh,
      async setPower(t, on) {
        patch(t, { on });
        // through the Sender so a power change queued by setColour/setBrightness cannot outlive it
        // Turning on also re-sends the brightness the screen shows: the strip keeps whatever level it was last left
        // at (another app, a test), and a dim strip looks switched off while the UI says it is on.
        sender.queue(t, on ? { power: true, brightness: protoB(presumedNow(t).b) } : { power: false });
        await sender.flush();
      },
      setColour(t, h, s) {
        endEffect(t);
        const turnOn = !wasOn(t);
        patch(t, { h, s, on: true });
        sender.queue(t, { ...(turnOn ? { power: true } : {}), colour: { hue: h, sat: protoS(s) } });
      },
      setBrightness(t, b) {
        const turnOn = !wasOn(t);
        patch(t, { b, on: true });
        sender.queue(t, { ...(turnOn ? { power: true } : {}), brightness: protoB(b) });
      },
      flush: () => sender.flush(),
      setEffect(t, id, speed) {
        const turnOn = !wasOn(t);
        patch(t, { on: true });
        dispatch({ type: "effect", keys: [targetKey(t)], id });
        sender.queue(t, { ...(turnOn ? { power: true } : {}), effect: id, speed });
        void sender.flush();
      },
      setSpeed(t, speed) {
        sender.queue(t, { speed });
      },
      setDirection(t, on) {
        sender.queue(t, { direction: on });
        void sender.flush();
      },
      async retry(stripId) {
        dispatch({ type: "link", ids: [stripId], link: "retrying" });
        const t: TargetRef = { kind: "strip", id: stripId };
        const report = await send(t, { type: "power", value: presumedNow(t).on });
        if (!report || (!report.ok.includes(stripId) && !report.unreachable.includes(stripId))) {
          dispatch({ type: "link", ids: [stripId], link: "unknown" });
        }
      },
      saveFavourite: (h, s) => dispatch({ type: "favourite", favourite: { h, s } }),
      notify,
      setTheme: (theme) => dispatch({ type: "theme", theme }),
      finishOnboarding: () => dispatch({ type: "onboarded" }),
      setStripOwnColour(stripId, h, s) {
        endEffect({ kind: "strip", id: stripId });
        dispatch({ type: "override", id: stripId, on: true });
        const t: TargetRef = { kind: "strip", id: stripId };
        // the override is recorded first so a group command in flight does not overwrite it
        stateRef.current = { ...stateRef.current, overrides: [...stateRef.current.overrides, stripId] };
        dispatch({ type: "presumed", keys: [targetKey(t)], patch: { h, s, on: true } });
        sender.queue(t, { colour: { hue: h, sat: protoS(s) }, ...(wasOn(t) ? {} : { power: true }) });
        void sender.flush();
      },
      followGroup(stripId, groupId) {
        endEffect({ kind: "strip", id: stripId });
        dispatch({ type: "override", id: stripId, on: false });
        const g = presumedNow({ kind: "group", id: groupId });
        const t: TargetRef = { kind: "strip", id: stripId };
        dispatch({ type: "presumed", keys: [targetKey(t)], patch: { h: g.h, s: g.s, b: g.b } });
        sender.queue(t, { colour: { hue: g.h, sat: protoS(g.s) }, brightness: protoB(g.b) });
        void sender.flush();
      },
      async createGroup(name, stripIds) {
        const id = `${slug(name)}-${Date.now().toString(36)}`;
        let ok = false;
        await run("Create group", async () => {
          await backend.createGroup(id, name);
          for (const s of stripIds) await backend.addToGroup(id, s);
          ok = true;
        }, refresh);
        return ok ? id : null;
      },
      addToGroup: (g, ids) =>
        runVoid("Add to group", async () => {
          for (const s of ids) await backend.addToGroup(g, s);
        }, refresh),
      removeFromGroup: (g, ids) =>
        runVoid("Remove from group", async () => {
          for (const s of ids) await backend.removeFromGroup(g, s);
        }, refresh),
      reorderGroup: (g, order) => runVoid("Reorder", () => backend.reorderGroup(g, order), refresh),
      renameGroup: (g, name) => runVoid("Rename group", () => backend.renameGroup(g, name), refresh),
      deleteGroup: (g) => run("Delete group", () => backend.deleteGroup(g), refresh),
      renameStrip: (s, name) => runVoid("Rename strip", () => backend.renameStrip(s, name), refresh),
      removeStrip: (s) => run("Remove strip", () => backend.removeStrip(s), refresh),
      enableBluetooth() {
        const native = window.LumenNative;
        if (native) native.enableBluetooth();
        else void backend.openBluetoothSettings().catch(() => undefined);
      },
      setChannelOrder: (s, order) => runVoid("Color order", () => backend.setChannelOrder(s, order), refresh),
    };
  }, [backend, endEffect, fail, notify, patch, run, runVoid, send, sender]);

  useEffect(() => {
    void actions.refresh();
  }, [actions]);

  // Without Bluetooth nothing works, so the app watches the radio and blocks itself while it is off. Android answers
  // through `window.LumenNative` (the WebView bridge in MainActivity); the desktop asks the backend.
  useEffect(() => {
    let live = true;
    let last: BluetoothState = "unknown";
    const read = async (): Promise<BluetoothState> => {
      const native = window.LumenNative;
      if (native) return native.bluetoothEnabled() ? "on" : "off";
      try {
        return await backend.bluetoothState();
      } catch {
        return "unknown";
      }
    };
    const tick = async () => {
      const next = await read();
      if (!live) return;
      dispatch({ type: "bluetooth", value: next });
      // at start, and each time the radio comes back, connect the saved strips so the first command is instant
      if (next !== "off" && last !== "on") {
        void backend.warmUp().then(
          (ids) => live && dispatch({ type: "link", ids, link: "live" }),
          () => undefined,
        );
      }
      // the radio just came back: strips that failed meanwhile are worth another try now
      if (last === "off" && next === "on") {
        for (const [id, link] of Object.entries(stateRef.current.link)) {
          if (link === "unreachable") void actions.retry(id);
        }
      }
      last = next;
    };
    void tick();
    const timer = setInterval(() => void tick(), bluetoothPollMs);
    window.addEventListener("focus", tick);
    return () => {
      live = false;
      clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [actions, backend, bluetoothPollMs]);

  // Coming back to the app (from the system's "turn Bluetooth on" prompt, or from another app) is when a strip
  // that was unreachable is most likely reachable again. Try those once, after Bluetooth has had a moment to start.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const [id, link] of Object.entries(stateRef.current.link)) {
          if (link === "unreachable") void actions.retry(id);
        }
      }, returnRetryMs);
    };
    document.addEventListener("visibilitychange", onReturn);
    window.addEventListener("focus", onReturn);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onReturn);
      window.removeEventListener("focus", onReturn);
    };
  }, [actions, returnRetryMs]);

  return <AppCtx.Provider value={{ state, actions, backend }}>{children}</AppCtx.Provider>;
}

export const presumedOf = (state: State, t: TargetRef): Presumed =>
  state.presumed[targetKey(t)] ?? DEFAULT_PRESUMED;
