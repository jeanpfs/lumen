import type { Snapshot } from "../api";
import { groupStatus, stripStatus, type Status } from "./status";
import { presumedOf } from "./store";
import type { Link, State, TargetRef } from "./types";

/** The name and the strip ids a target stands for, or null when the id no longer exists. */
export function findTarget(snapshot: Snapshot, t: TargetRef): { name: string; members: string[] } | null {
  if (t.kind === "strip") {
    const s = snapshot.strips.find((x) => x.id === t.id);
    return s ? { name: s.name, members: [s.id] } : null;
  }
  const g = snapshot.groups.find((x) => x.id === t.id);
  return g ? { name: g.name, members: g.members } : null;
}

/** Same status the cards use, for the page header. */
export function targetStatus(state: State, t: TargetRef): Status {
  const unavailable = state.unavailable !== null;
  const p = presumedOf(state, t);
  if (t.kind === "strip") return stripStatus(p, state.link[t.id] ?? "unknown", unavailable);
  const members = findTarget(state.snapshot, t)?.members ?? [];
  return groupStatus(p, members.map((m): Link => state.link[m] ?? "unknown"), unavailable);
}
