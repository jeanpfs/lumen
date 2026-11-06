// Panels: a group of strips laid out on a grid (a dance floor, a wall, a bar front). One strip is one
// square, so an effect is a light travelling over squares. Pure helpers; no UI, no backend.

export type Start = "tl" | "tr" | "bl" | "br";
export type Walk = "snake" | "row" | "col";

export interface Layout {
  cols: number;
  rows: number;
  /** Strip id per square, row by row; null = empty square. */
  cells: (string | null)[];
  /** The corner where the order starts and how it sweeps the grid. */
  start: Start;
  walk: Walk;
}

export const MAX_SIDE = 8;

export type PathKind = "order" | "rows" | "cols" | "diag" | "spiral" | "center" | "rand" | "draw";
/** run = a light travels; blink = strobe where the light passes; all = everything strobes; fixed = steady. */
export type Act = "run" | "blink" | "all" | "fixed";

export interface Fx {
  path: PathKind;
  /** Square indices the user drew, for `path: "draw"`. */
  draw: number[];
  act: Act;
  hue: number;
  sat: number;
  /** How many squares stay lit behind the light, 1-8. */
  trail: number;
  /** 1-10 */
  speed: number;
  /** Goes back and forth instead of looping. */
  pingPong: boolean;
  /** Every `n`-th square strobes white after `n` steady ones ("every 4, the 5th"). */
  rule: boolean;
  n: number;
}

export interface SavedFx {
  id: string;
  name: string;
  fx: Fx;
}

export const BASE_FX: Fx = { path: "order", draw: [], act: "run", hue: 28, sat: 72, trail: 3, speed: 5, pingPong: false, rule: false, n: 4 };

export type TemplateId = "chase" | "wave" | "center" | "flash" | "blank";
export const TEMPLATE_FX: Record<TemplateId, Fx> = {
  chase: { ...BASE_FX },
  wave: { ...BASE_FX, path: "diag", hue: 185, sat: 80, trail: 4 },
  center: { ...BASE_FX, path: "center", hue: 270, sat: 70 },
  flash: { ...BASE_FX, act: "all", hue: 0, sat: 0, speed: 4 },
  blank: { ...BASE_FX, act: "fixed" },
};
export const TEMPLATES: TemplateId[] = ["chase", "wave", "center", "flash", "blank"];

export const SWATCHES: { id: string; h: number; s: number }[] = [
  { id: "orange", h: 28, s: 72 },
  { id: "violet", h: 270, s: 70 },
  { id: "cyan", h: 185, s: 80 },
  { id: "green", h: 135, s: 70 },
  { id: "red", h: 0, s: 85 },
];

export const emptyLayout = (cols: number, rows: number): Layout => ({
  cols,
  rows,
  cells: Array<string | null>(cols * rows).fill(null),
  start: "tl",
  walk: "snake",
});

/** Squares in the order the layout sweeps them: `start` corner, then rows (snaking or not) or columns. */
export function walkOrder(l: Pick<Layout, "cols" | "rows" | "start" | "walk">): number[] {
  const { cols, rows, start, walk } = l;
  const flipRows = start[0] === "b";
  const flipCols = start[1] === "r";
  const out: number[] = [];
  const at = (r: number, c: number) => (flipRows ? rows - 1 - r : r) * cols + (flipCols ? cols - 1 - c : c);
  if (walk === "col") {
    for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) out.push(at(r, c));
  } else {
    for (let r = 0; r < rows; r++) {
      const row = Array.from({ length: cols }, (_, c) => at(r, walk === "snake" && r % 2 ? cols - 1 - c : c));
      out.push(...row);
    }
  }
  return out;
}

function spiral(cols: number, rows: number): number[] {
  const out: number[] = [];
  let top = 0;
  let bottom = rows - 1;
  let left = 0;
  let right = cols - 1;
  while (top <= bottom && left <= right) {
    for (let c = left; c <= right; c++) out.push(top * cols + c);
    top++;
    for (let r = top; r <= bottom; r++) out.push(r * cols + right);
    right--;
    if (top <= bottom) {
      for (let c = right; c >= left; c--) out.push(bottom * cols + c);
      bottom--;
    }
    if (left <= right) {
      for (let r = bottom; r >= top; r--) out.push(r * cols + left);
      left++;
    }
  }
  return out;
}

/** The squares an effect visits, in order. Only squares that hold a strip are kept. */
export function pathCells(fx: Pick<Fx, "path" | "draw">, l: Layout): number[] {
  const { cols, rows } = l;
  const all = Array.from({ length: cols * rows }, (_, i) => i);
  const rc = (i: number): [number, number] => [Math.floor(i / cols), i % cols];
  const cy = (rows - 1) / 2;
  const cx = (cols - 1) / 2;
  let order: number[];
  switch (fx.path) {
    case "order":
      order = walkOrder(l);
      break;
    case "rows":
      order = all;
      break;
    case "cols":
      order = walkOrder({ cols, rows, start: "tl", walk: "col" });
      break;
    case "diag":
      order = [...all].sort((a, b) => rc(a)[0] + rc(a)[1] - (rc(b)[0] + rc(b)[1]) || a - b);
      break;
    case "spiral":
      order = spiral(cols, rows);
      break;
    case "center": {
      const d = (i: number) => Math.hypot(rc(i)[0] - cy, rc(i)[1] - cx);
      const ang = (i: number) => Math.atan2(rc(i)[0] - cy, rc(i)[1] - cx);
      order = [...all].sort((a, b) => d(a) - d(b) || ang(a) - ang(b));
      break;
    }
    case "rand":
      // a fixed shuffle: the same panel always runs the same "random" path
      order = [...all].sort((a, b) => Math.sin((a + 1) * 91.7) - Math.sin((b + 1) * 91.7));
      break;
    case "draw":
      order = fx.draw.filter((i, k) => i >= 0 && i < cols * rows && fx.draw.indexOf(i) === k);
      break;
  }
  return order.filter((i) => l.cells[i] != null);
}

export interface Step {
  /** 0-1 brightness of the square at this step. */
  k: number;
  /** The "every N-th" rule is flashing this square white. */
  white: boolean;
}

/** State of every square on the path (`n` of them) `t` seconds after the effect started. */
export function evalFx(fx: Fx, n: number, t: number): Step[] {
  const s = t * fx.speed * 1.5;
  let pos: number;
  if (fx.pingPong && n > 1) {
    const cycle = 2 * (n - 1);
    const m = s % cycle;
    pos = m < n ? m : cycle - m;
  } else {
    pos = s % (n + fx.trail);
  }
  const strobe = (rate: number) => (Math.floor(t * rate) % 2 ? 1 : 0.05);
  const out: Step[] = [];
  for (let i = 0; i < n; i++) {
    let k = 0.08;
    if (fx.act === "fixed") k = 1;
    else if (fx.act === "all") k = strobe(fx.speed * 2.4);
    else {
      const d = fx.pingPong ? Math.abs(pos - i) : pos - i;
      const inside = fx.pingPong ? d < fx.trail : d >= 0 && d < fx.trail;
      if (inside) k = fx.act === "run" ? 1 - d / fx.trail : strobe(14);
    }
    const white = fx.rule && i % (fx.n + 1) === fx.n;
    if (white) k = strobe(fx.speed * 2.4);
    out.push({ k, white });
  }
  return out;
}

/** Strips that sit on a square, in path order, with the squares they sit on. */
export const stripsOnPath = (fx: Pick<Fx, "path" | "draw">, l: Layout): { cell: number; strip: string }[] =>
  pathCells(fx, l).map((cell) => ({ cell, strip: l.cells[cell] as string }));

/** Drops strips that left the group, so a stale layout never points at a missing strip. */
export function pruneLayout(l: Layout, members: string[]): Layout {
  const ok = new Set(members);
  return { ...l, cells: l.cells.map((c) => (c && ok.has(c) ? c : null)) };
}

/** The group's members in the order the layout sweeps them (empty squares skipped). */
export const orderedStrips = (l: Layout): string[] => walkOrder(l).flatMap((i) => (l.cells[i] ? [l.cells[i] as string] : []));
