import type { targets } from "../i18n/targets";
import type { Link, Presumed } from "./types";

export type StatusKind = "on" | "off" | "partial" | "unreachable";
export interface Status {
  k: StatusKind;
  label: string;
}

export type StatusNames = (typeof targets)["en"]["status"];

const unavailable = (s: StatusNames): Status => ({ k: "unreachable", label: s.unavailable });

export function stripStatus(p: Presumed, link: Link, isUnavailable: boolean, s: StatusNames): Status {
  if (isUnavailable) return unavailable(s);
  if (link === "unreachable") return { k: "unreachable", label: s.unreachable };
  if (link === "retrying") return { k: "partial", label: s.retrying };
  return p.on ? { k: "on", label: s.stripOn(p.b) } : { k: "off", label: s.stripOff };
}

export function groupStatus(p: Presumed, memberLinks: Link[], isUnavailable: boolean, s: StatusNames): Status {
  if (isUnavailable) return unavailable(s);
  if (!p.on) return { k: "off", label: s.groupOff };
  const bad = memberLinks.filter((l) => l === "unreachable" || l === "retrying").length;
  if (bad === memberLinks.length && memberLinks.length > 0) {
    return { k: "unreachable", label: s.unreachable };
  }
  if (bad > 0) {
    return { k: "partial", label: s.partial(bad) };
  }
  return { k: "on", label: s.groupOn };
}
