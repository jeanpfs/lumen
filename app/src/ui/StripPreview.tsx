import type { CSSProperties } from "react";
import { useT } from "../i18n";

const LEDS = 30;

/**
 * A short piece of LED strip: a dark band with a row of discrete LEDs, each lit with its own glow.
 * It shows what the app just ASKED the real strip to show (the strip never confirms), never the real state.
 */
export function StripPreview({
  colour = "255 244 230",
  level = 1,
  on = true,
  blink = false,
  reveal = false,
  caption,
  note,
}: {
  /** "r g b" (space separated, 0-255). */
  colour?: string;
  /** 0-1 brightness. */
  level?: number;
  on?: boolean;
  blink?: boolean;
  /** Light the LEDs one after another when the preview first shows. */
  reveal?: boolean;
  caption?: string;
  note?: string;
}) {
  const t = useT().shell;
  const style = { "--c": colour, "--k": Math.max(0, Math.min(1, level)) } as CSSProperties;
  return (
    <div className="sim">
      <div className="sim-head">
        <span className="eyebrow">{caption ?? t.previewCaption}</span>
        <span className="muted t-12">{note ?? t.previewNote}</span>
      </div>
      <div className={`ledstrip ${on ? "is-on" : ""} ${blink ? "is-blink" : ""} ${reveal ? "is-reveal" : ""}`} style={style} role="img" aria-label={on ? t.previewOn : t.previewOff}>
        {Array.from({ length: LEDS }, (_, i) => (
          <i key={i} style={reveal ? ({ "--i": i } as CSSProperties) : undefined} />
        ))}
      </div>
    </div>
  );
}
