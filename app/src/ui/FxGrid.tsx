import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { rgbStr } from "../lib/color";
import { evalFx, pathCells, type Fx, type Layout } from "../lib/panel";

const WHITE = "255 244 230";

/**
 * A panel as a grid of squares, one per strip. With `fx`, the squares play it (the same math that drives the
 * real strips); without, the squares that hold a strip sit at a steady glow. Squares are buttons when `onCell` is given.
 */
export function FxGrid({
  layout,
  fx,
  size,
  paused,
  paint,
  label,
  isEmpty,
  selected,
  hint,
  onCell,
  ariaLabel,
}: {
  layout: Layout;
  fx?: Fx;
  /** Side of a square in px. */
  size: number;
  paused?: boolean;
  /** Squares the effect does not own (the light is not on them) stay dark. Default: those holding a strip. */
  paint?: (cell: number) => boolean;
  /** Text in a square's corner (its number). */
  label?: (cell: number) => ReactNode;
  /** Dashed, unfilled look. Default: no strip on the square. */
  isEmpty?: (cell: number) => boolean;
  selected?: number | null;
  /** Pulses the empty squares: "put it here". */
  hint?: boolean;
  onCell?: (cell: number) => void;
  ariaLabel?: (cell: number) => string;
}) {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const path = useMemo(() => (fx ? pathCells(fx, layout) : []), [fx, layout]);
  const { cols, rows, cells } = layout;

  useEffect(() => {
    const el = refs.current;
    const set = (cell: number, k: number, c: string) => {
      el[cell]?.style.setProperty("--k", k.toFixed(2));
      el[cell]?.style.setProperty("--c", c);
    };
    const total = cols * rows;
    if (!fx) {
      for (let i = 0; i < total; i++) set(i, cells[i] ? 0.5 : 0, rgbStr(28, 72));
      return;
    }
    const colour = rgbStr(fx.hue, fx.sat);
    const frame = (t: number) => {
      const steps = evalFx(fx, path.length, t);
      for (let i = 0; i < total; i++) set(i, 0.08, colour);
      path.forEach((cell, i) => set(cell, steps[i].k, steps[i].white ? WHITE : colour));
    };
    // reduced motion: one still frame, no loop
    if (paused || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      frame(0.6);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const loop = (now: number) => {
      frame((now - t0) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fx, path, paused, cols, rows, cells]);

  const gap = size < 30 ? 2 : 4;
  return (
    <div className={`px-grid${size < 30 ? " px-small" : ""}`} style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap }}>
      {Array.from({ length: cols * rows }, (_, i) => {
        const empty = isEmpty ? isEmpty(i) : cells[i] == null;
        const lit = paint ? paint(i) : !empty;
        const cls = `px-sq${empty ? " empty" : ""}${lit ? "" : " dark"}${selected === i ? " sel" : ""}${hint && empty ? " hint" : ""}`;
        const text = label?.(i);
        const common = {
          ref: (e: HTMLElement | null) => {
            refs.current[i] = e;
          },
          className: cls,
          style: { width: size, height: size },
        };
        return onCell ? (
          <button key={i} type="button" {...common} aria-label={ariaLabel?.(i)} onClick={() => onCell(i)}>
            {text != null && <b>{text}</b>}
          </button>
        ) : (
          <i key={i} {...common}>
            {text != null && <b>{text}</b>}
          </i>
        );
      })}
    </div>
  );
}
