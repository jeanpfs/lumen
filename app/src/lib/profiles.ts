import type { targets } from "../i18n/targets";

export type ProfileNames = (typeof targets)["en"]["profiles"];

const KEYS: Record<string, keyof ProfileNames> = {
  mrstar: "mrstar",
  xrocker: "xrocker",
  xsl: "xsl",
  ledble: "ledble",
  "led-jackyled": "ledJackyled",
};

/** Human name of a profile id from the catalogue (`probe profiles`), in the caller's language. */
export function profileName(id: string, names: ProfileNames): string {
  const key = KEYS[id];
  if (key) return names[key];
  if (id.startsWith("elk-") || id.startsWith("melk-")) return names.elk;
  return id;
}
