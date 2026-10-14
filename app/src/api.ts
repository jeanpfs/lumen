// Typed client for the Tauri commands in src-tauri/src/lib.rs. The shapes mirror the serde
// output of lumen-core; see core/src/service.rs (`command_and_target_have_the_json_shape_...`).
import { invoke } from "@tauri-apps/api/core";

export type Command =
  | { type: "power"; value: boolean }
  | { type: "color"; value: { hue: number; sat: number } }
  | { type: "brightness"; value: number }
  | { type: "effect"; value: number }
  | { type: "speed"; value: number }
  | { type: "direction"; value: boolean };

export type BluetoothState = "on" | "off" | "unknown";

export type Target = { type: "strip"; id: string } | { type: "group"; id: string };

export type Seen = "red" | "green" | "blue" | "other";

export interface IntensityAnswer {
  lit: boolean;
  differs: boolean;
}

export type ChannelOrder = "Rgb" | "Rbg" | "Grb" | "Gbr" | "Brg" | "Bgr";

export interface Calibration {
  channel_order: ChannelOrder;
  min_brightness: number;
  steps: number;
  has_white: boolean;
}

export interface Capabilities {
  color: boolean;
  brightness: boolean;
  white: boolean;
  effects: boolean;
  microphone: boolean;
}

export interface Strip {
  id: string;
  name: string;
  profile: string;
  calibration: Calibration;
}

export interface Group {
  id: string;
  name: string;
  members: string[];
}

export interface Snapshot {
  strips: Strip[];
  groups: Group[];
}

export interface Discovered {
  id: string;
  name: string | null;
  rssi: number | null;
  services: string[];
}

export interface Report {
  ok: string[];
  unreachable: string[];
  unsupported: string[];
}

export type ProbePhase = "blink" | "colour";

export interface ProbeView {
  index: number;
  total: number;
  profile_id: string;
  phase: ProbePhase;
  commands: Command[];
}

export type WizardState =
  | { state: "probing"; probe: ProbeView }
  | { state: "recognized"; profile_id: string; capabilities: Capabilities }
  | { state: "exhausted" };

export interface ProfileInfo {
  id: string;
  capabilities: Capabilities;
  /** Confirmed on a real strip. Only `mrstar` is, so far. */
  verified: boolean;
}

export const api = {
  snapshot: () => invoke<Snapshot>("snapshot"),
  /** `unknown` when the platform cannot tell (the gate only closes the app on `off`). */
  bluetoothState: () => invoke<BluetoothState>("bluetooth_state"),
  openBluetoothSettings: () => invoke<void>("open_bluetooth_settings"),
  /** Connects the saved strips ahead of the first command; resolves to the ids now connected. */
  warmUp: () => invoke<string[]>("warm_up"),
  scan: (secs: number) => invoke<Discovered[]>("scan", { secs }),
  apply: (targets: Target[], command: Command) => invoke<Report>("apply", { targets, command }),
  createGroup: (id: string, name: string) => invoke<void>("create_group", { id, name }),
  addToGroup: (group: string, strip: string) => invoke<void>("add_to_group", { group, strip }),
  removeStrip: (id: string) => invoke<void>("remove_strip", { id }),
  removeFromGroup: (group: string, strip: string) => invoke<void>("remove_from_group", { group, strip }),
  reorderGroup: (group: string, order: string[]) => invoke<void>("reorder_group", { group, order }),
  renameGroup: (group: string, name: string) => invoke<void>("rename_group", { group, name }),
  deleteGroup: (group: string) => invoke<void>("delete_group", { group }),
  renameStrip: (strip: string, name: string) => invoke<void>("rename_strip", { strip, name }),
  profiles: () => invoke<ProfileInfo[]>("profiles"),
  setChannelOrder: (strip: string, order: ChannelOrder) => invoke<void>("set_channel_order", { strip, order }),
  wizardRecalibrate: (strip: string) => invoke<WizardState>("wizard_recalibrate", { strip }),
  wizardPowerTest: () => invoke<Report>("wizard_power_test"),
  wizardStart: (strip: string, advertisedName: string | null) =>
    invoke<WizardState>("wizard_start", { strip, advertisedName }),
  wizardProbe: () => invoke<Report>("wizard_probe"),
  wizardAnswerPower: (turnedOffAndOn: boolean) =>
    invoke<WizardState>("wizard_answer_power", { turnedOffAndOn }),
  wizardAnswerColour: (seen: Seen) => invoke<WizardState>("wizard_answer_colour", { seen }),
  wizardColourTest: (index: number) => invoke<Report>("wizard_colour_test", { index }),
  wizardIntensityTest: (level: number) => invoke<Report>("wizard_intensity_test", { level }),
  wizardFinish: (
    name: string,
    colours: [Seen, Seen, Seen] | null,
    hasWhite: boolean,
    intensity: IntensityAnswer[] | null,
  ) => invoke<Strip>("wizard_finish", { name, colours, hasWhite, intensity }),
  wizardCancel: () => invoke<void>("wizard_cancel"),
};

export function errorMessage(e: unknown): string {
  return typeof e === "string" ? e : e instanceof Error ? e.message : JSON.stringify(e);
}
