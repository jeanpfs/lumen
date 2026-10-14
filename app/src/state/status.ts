import type { Link, Presumed } from "./types";

export type StatusKind = "on" | "off" | "partial" | "unreachable";
export interface Status {
  k: StatusKind;
  label: string;
}

const UNAVAILABLE: Status = { k: "unreachable", label: "Bluetooth unavailable" };

export function stripStatus(p: Presumed, link: Link, unavailable: boolean): Status {
  if (unavailable) return UNAVAILABLE;
  if (link === "unreachable") return { k: "unreachable", label: "Unreachable" };
  if (link === "retrying") return { k: "partial", label: "Retrying…" };
  return p.on ? { k: "on", label: `On · ${p.b}%` } : { k: "off", label: "Off" };
}

export function groupStatus(p: Presumed, memberLinks: Link[], unavailable: boolean): Status {
  if (unavailable) return UNAVAILABLE;
  if (!p.on) return { k: "off", label: "Off" };
  const bad = memberLinks.filter((l) => l === "unreachable" || l === "retrying").length;
  if (bad === memberLinks.length && memberLinks.length > 0) {
    return { k: "unreachable", label: "Unreachable" };
  }
  if (bad > 0) {
    return { k: "partial", label: `Partial · ${bad} unreachable` };
  }
  return { k: "on", label: "On" };
}
