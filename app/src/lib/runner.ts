import { useSyncExternalStore } from "react";
import type { Command, Report, Target } from "../api";
import { evalFx, stripsOnPath, type Fx, type Layout } from "./panel";

// Plays an effect on a panel's real strips. The app drives it: it sends a power command to a strip
// whenever the square it sits on changes between lit and dark, so closing the app stops the effect.
// shortcut: runs in the UI, not in lumen-core; move it to the core if effects must outlive the app.

type Apply = (targets: Target[], command: Command) => Promise<Report>;

const TICK_MS = 120;
const WHITE: Command = { type: "color", value: { hue: 0, sat: 0 } };

interface Active {
  key: string;
  stop: () => void;
}

let active: Active | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

/** Key of the effect playing now, or null. */
export function useRunning(): string | null {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => active?.key ?? null,
  );
}

export function stopRunning() {
  active?.stop();
}

/**
 * What to send when the squares change from `prev` to `next`: the strips that lit up, went dark, turned
 * white for the "every N-th" rule or came back to the effect's color. Pure, so it can be tested.
 */
export function plan(prev: Map<string, string>, next: Map<string, string>) {
  const out = { on: [] as string[], off: [] as string[], white: [] as string[], base: [] as string[] };
  for (const [id, state] of next) {
    const was = prev.get(id) ?? "off";
    if (state === was) continue;
    if (state === "off") {
      out.off.push(id);
      if (was === "white") out.base.push(id); // back to the effect's color while dark, so the next lit step is right
    } else {
      if (was === "off") out.on.push(id);
      if (state === "white") out.white.push(id);
      else if (was === "white") out.base.push(id);
    }
  }
  return out;
}

const targets = (ids: string[]): Target[] => ids.map((id) => ({ type: "strip", id }));

/**
 * Starts `fx` on the strips of `layout`, replacing whatever ran before. `key` names it for `useRunning`.
 * `onReport` gets the answer of the first command (which strips answered, which did not).
 */
export function startFx(opts: { key: string; apply: Apply; layout: Layout; fx: Fx; onReport?: (r: Report) => void }) {
  stopRunning();
  const { apply, layout, fx } = opts;
  const path = stripsOnPath(fx, layout);
  const all = layout.cells.filter((c): c is string => c != null);
  const base: Command = { type: "color", value: { hue: fx.hue, sat: fx.sat * 10 } };
  const t0 = performance.now();
  let prev = new Map<string, string>();
  let busy = false;
  let dead = false;

  const send = (ids: string[], command: Command) => (ids.length ? apply(targets(ids), command).catch(() => undefined) : undefined);

  // Everything dark and in the effect's color before the first step, so a strip that lights up is already the right color.
  void (async () => {
    const first = await apply(targets(all), base).catch(() => undefined);
    if (first) opts.onReport?.(first);
    await send(all, { type: "power", value: false });
  })();

  const timer = setInterval(() => {
    if (busy || dead) return;
    busy = true;
    const steps = evalFx(fx, path.length, (performance.now() - t0) / 1000);
    const next = new Map<string, string>();
    path.forEach((p, i) => next.set(p.strip, steps[i].k < 0.5 ? "off" : steps[i].white ? "white" : "base"));
    const p = plan(prev, next);
    prev = next;
    void (async () => {
      await Promise.all([send(p.white, WHITE), send(p.base, base)]); // colors first, then power
      await Promise.all([send(p.on, { type: "power", value: true }), send(p.off, { type: "power", value: false })]);
    })().finally(() => {
      busy = false;
    });
  }, TICK_MS);

  const me: Active = {
    key: opts.key,
    stop: () => {
      dead = true;
      clearInterval(timer);
      if (active === me) active = null;
      void send(all, { type: "power", value: false });
      notify();
    },
  };
  active = me;
  notify();
}

/** Makes one strip flash white for a moment so the user can see which one it is. Resolves to the first report. */
export async function blink(apply: Apply, id: string): Promise<Report | null> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  try {
    const report = await apply(targets([id]), WHITE);
    for (let i = 0; i < 3; i++) {
      await apply(targets([id]), { type: "power", value: true });
      await wait(260);
      await apply(targets([id]), { type: "power", value: false });
      await wait(200);
    }
    return report;
  } catch {
    return null;
  }
}
