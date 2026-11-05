// The strip's built-in effects. `id` is the effect's mode number, grouped in tabs. The "Flow" range
// (63-75) is intentionally left out. Names live in the i18n bundle, keyed by these ids.

export interface Mode {
  id: number;
}

export type CategoryId = "basic" | "open" | "trans" | "water" | "trail" | "run";

export interface ModeCategory {
  id: CategoryId;
  /** Which preview animation in the stylesheet (`.fx[data-a]`) stands for the category. */
  preview: string;
  modes: Mode[];
}

const m = (id: number): Mode => ({ id });

export const MODE_CATEGORIES: ModeCategory[] = [
  {
    id: "basic",
    preview: "fade7",
    modes: [m(1), m(2), m(3), m(4), m(7), m(10), m(26), m(27), m(29), m(30), m(31), m(32)],
  },
  {
    id: "open",
    preview: "open",
    modes: [m(35), m(36), m(37), m(38), m(39), m(40), m(41), m(42), m(43), m(44)],
  },
  {
    id: "trans",
    preview: "fade7",
    modes: [m(45), m(46), m(47), m(48), m(49), m(50), m(51), m(52), m(53), m(54)],
  },
  {
    id: "water",
    preview: "water",
    modes: [m(55), m(56), m(57), m(58), m(59), m(60), m(61), m(62)],
  },
  {
    id: "trail",
    preview: "comet",
    modes: [m(76), m(77), m(78), m(79), m(80), m(81), m(82), m(83)],
  },
  {
    id: "run",
    preview: "race",
    modes: [m(84), m(85), m(86), m(87), m(88), m(89), m(90), m(91), m(92), m(93)],
  },
];
