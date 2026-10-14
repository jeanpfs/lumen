// Stroke icons (1.7, currentColor) from the Open Design prototype.
const ICONS = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  palette: "M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4-4-7.4-9-7.4zM7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01",
  modes: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  sound: "M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4",
  menu: "M4 7h16M4 12h16M4 17h16",
  plus: "M12 5v14M5 12h14",
  chevD: "m6 9 6 6 6-6",
  chevR: "m9 6 6 6-6 6",
  chevL: "m15 6-6 6 6 6",
  power: "M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0",
  bt: "m7 7 10 10-5 5V2l5 5L7 17",
  btOff: "m7 7 10 10-5 5v-7M12 9V2l5 5-2 2M3 3l18 18",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0",
  check: "m5 12 5 5L20 7",
  x: "M6 6l12 12M18 6 6 18",
  alert: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  refresh: "M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5",
  grip: "M9 6h.01M9 12h.01M9 18h.01M15 6h.01M15 12h.01M15 18h.01",
  scenes: "m12 3 9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  linkOff: "M9 15l-1 1a4 4 0 0 1-5.7-5.7l3-3M15 9l1-1a4 4 0 0 1 5.7 5.7l-3 3M3 3l18 18",
  sliders: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
  chip: "M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  star: "m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z",
  approx: "M5 9.5c2-2 5 2 7 0s5 2 7 0M5 14.5c2-2 5 2 7 0s5 2 7 0",
  bug: "M8 8V6a4 4 0 0 1 8 0v2M6 10h12v5a6 6 0 0 1-12 0zM3 13h3M18 13h3M4 8l2 2M20 8l-2 2M4 19l2-2M20 19l-2-2",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  strip: "M3 12h18M5 9v6M9 9v6M13 9v6M17 9v6M21 9v6",
  play: "M7 4v16l13-8z",
  flash: "M13 3 4 14h7l-1 7 9-11h-7z",
  send: "M4 12 20 4l-6 16-3-7z",
  edit: "M4 20h4L19 9l-4-4L4 16zM13 7l4 4",
  chevU: "m6 15 6-6 6 6",
  doc: "M6 3h8l4 4v14H6zM14 3v4h4M9 13h6M9 17h6",
  tray: "M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9s1-6.3 3.5-9z",
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size,
  className,
}: {
  name: IconName;
  size?: "xs" | "sm" | "lg";
  className?: string;
}) {
  const cls = ["ic", size, className].filter(Boolean).join(" ");
  return (
    <svg className={cls} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}
