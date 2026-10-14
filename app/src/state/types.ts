import type { BluetoothState, Snapshot } from "../api";

export type TargetKind = "group" | "strip";
export interface TargetRef {
  kind: TargetKind;
  id: string;
}

/** What the app last asked the strip to show. The strip never confirms commands. */
export interface Presumed {
  on: boolean;
  /** hue 0-360 */
  h: number;
  /** saturation 0-100 */
  s: number;
  /** brightness 3-100 (percent) */
  b: number;
}

export type Link = "unknown" | "live" | "unreachable" | "retrying";

export interface Favourite {
  h: number;
  s: number;
}

export type Theme = "dark" | "light";

export interface EventLine {
  at: number;
  text: string;
}

export interface State {
  snapshot: Snapshot;
  loaded: boolean;
  /** Message from `service unavailable: …` when the backend cannot reach Bluetooth. */
  unavailable: string | null;
  presumed: Record<string, Presumed>;
  link: Record<string, Link>;
  favourites: Favourite[];
  /** Strip ids whose color is their own and does not follow the group. */
  overrides: string[];
  theme: Theme;
  onboarded: boolean;
  events: EventLine[];
  /** The radio's state; the app is blocked while it is `off`. */
  bluetooth: BluetoothState;
  /** Target key -> built-in effect (mode number) the app last started on it. Not persisted. */
  effects: Record<string, number>;
  toast: { id: number; text: string } | null;
}

export const DEFAULT_PRESUMED: Presumed = { on: false, h: 28, s: 72, b: 80 };

export const targetKey = (t: TargetRef) => `${t.kind}:${t.id}`;
