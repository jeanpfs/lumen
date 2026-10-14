// The strip's built-in effects. `id` is the effect's mode number, grouped in tabs. The "Flow" range
// (63-75) is intentionally left out.

export interface Mode {
  id: number;
  name: string;
}

export interface ModeCategory {
  id: string;
  name: string;
  /** Which preview animation in the stylesheet (`.fx[data-a]`) stands for the category. */
  preview: string;
  modes: Mode[];
}

const m = (id: number, name: string): Mode => ({ id, name });

export const MODE_CATEGORIES: ModeCategory[] = [
  {
    id: "basic",
    name: "Basic",
    preview: "fade7",
    modes: [
      m(1, "Auto cycle"),
      m(2, "Symphony"),
      m(3, "Color energy"),
      m(4, "Color jump"),
      m(7, "7-color strobe"),
      m(10, "7-color gradient"),
      m(26, "Color ripple"),
      m(27, "Red-green-blue ripple"),
      m(29, "Color sweep"),
      m(30, "Red-green-blue sweep"),
      m(31, "Yellow-cyan-purple sweep"),
      m(32, "Color sweep open/close"),
    ],
  },
  {
    id: "open",
    name: "Open/Close",
    preview: "open",
    modes: [
      m(35, "7 colors"),
      m(36, "Red-green-blue"),
      m(37, "Yellow-cyan-purple"),
      m(38, "Red"),
      m(39, "Green"),
      m(40, "Blue"),
      m(41, "Yellow"),
      m(42, "Cyan"),
      m(43, "Purple"),
      m(44, "White"),
    ],
  },
  {
    id: "trans",
    name: "Transition",
    preview: "fade7",
    modes: [
      m(45, "7-color breathing"),
      m(46, "Blue-red-green breathing"),
      m(47, "Violet-green-yellow breathing"),
      m(48, "6-color breathing, red"),
      m(49, "6-color breathing, green"),
      m(50, "6-color breathing, blue"),
      m(51, "6-color breathing, cyan"),
      m(52, "6-color breathing, yellow"),
      m(53, "6-color breathing, purple"),
      m(54, "6-color breathing, white"),
    ],
  },
  {
    id: "water",
    name: "Flowing water",
    preview: "water",
    modes: [
      m(55, "7 colors"),
      m(56, "Blue-green-red"),
      m(57, "Purple-green-yellow"),
      m(58, "Red-green"),
      m(59, "Green-blue"),
      m(60, "Yellow-blue"),
      m(61, "Yellow-cyan"),
      m(62, "Blue-purple"),
    ],
  },
  {
    id: "trail",
    name: "Trail",
    preview: "comet",
    modes: [
      m(76, "7 colors"),
      m(77, "Red"),
      m(78, "Green"),
      m(79, "Blue"),
      m(80, "Yellow"),
      m(81, "Cyan"),
      m(82, "Purple"),
      m(83, "White"),
    ],
  },
  {
    id: "run",
    name: "Chase",
    preview: "race",
    modes: [
      m(84, "Red"),
      m(85, "Green"),
      m(86, "Blue"),
      m(87, "Yellow"),
      m(88, "Cyan"),
      m(89, "Purple"),
      m(90, "White"),
      m(91, "7 colors"),
      m(92, "Blue-green-red"),
      m(93, "Purple-cyan-yellow"),
    ],
  },
];
