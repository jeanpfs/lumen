import { useCallback, useEffect, useState } from "react";

export type RouteName = "home" | "group" | "strip" | "add";
export type Tab = "general" | "color" | "modes";

/**
 * `#group/<id>[/<tab>]` and `#strip/<id>[/<tab>]` are pages of one target; `?from=<groupId>` records that a strip
 * was opened from a group so Back returns there. `#add/<stripId>` recalibrates.
 */
export interface Route {
  name: RouteName;
  param?: string;
  tab?: Tab;
  from?: string;
}

const NAMES: RouteName[] = ["home", "group", "strip", "add"];
const TABS: Tab[] = ["general", "color", "modes"];

export function parseRoute(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const [name, id = "", tab = ""] = path.split("/");
  if (!(NAMES as string[]).includes(name)) return { name: "home" };
  if ((name === "group" || name === "strip") && !id) return { name: "home" };
  const route: Route = { name: name as RouteName };
  if (id) route.param = decodeURIComponent(id);
  if ((name === "group" || name === "strip") && (TABS as string[]).includes(tab)) route.tab = tab as Tab;
  const from = new URLSearchParams(query).get("from");
  if (name === "strip" && from) route.from = from;
  return route;
}

export function routeHash(r: Route): string {
  let h: string = r.name;
  if (r.param) h += `/${encodeURIComponent(r.param)}`;
  if (r.tab) h += `/${r.tab}`;
  if (r.from) h += `?from=${encodeURIComponent(r.from)}`;
  return h;
}

export type Go = (name: RouteName, param?: string, opts?: { tab?: Tab; from?: string }) => void;

/** Hash router: the app is a single window, so a hash is all it needs. */
export function useRoute(): [Route, Go] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = useCallback<Go>((name, param, opts) => {
    const r: Route = { name, param, tab: opts?.tab, from: opts?.from };
    window.location.hash = routeHash(r);
    setRoute(parseRoute(window.location.hash));
  }, []);
  return [route, go];
}
