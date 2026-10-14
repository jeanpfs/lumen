const NAMES: Record<string, string> = {
  mrstar: "MR Star and compatibles",
  xrocker: "XROCKER",
  xsl: "XSL (white only)",
  ledble: "LEDBLE",
  "led-jackyled": "LED- / JACKYLED",
};

/** Human name of a profile id from the catalogue (`probe profiles`). */
export function profileName(id: string): string {
  if (NAMES[id]) return NAMES[id];
  if (id.startsWith("elk-") || id.startsWith("melk-")) return "ELK-BLEDOM and compatibles";
  return id;
}
