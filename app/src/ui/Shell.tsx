import { useEffect, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Toast } from "./Toast";
import { rgbStr } from "../lib/color";
import { presumedOf, useApp } from "../state/store";
import type { TargetRef } from "../state/types";
import type { Route } from "../router";

/** The frame around every page: no menu, each page carries its own way back. */
export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const { state } = useApp();
  const unavailable = state.unavailable !== null;

  // Compute the page target from the current route for the tint effect
  const pageTarget: TargetRef | null =
    route.name === "group" && route.param ? { kind: "group", id: route.param }
    : route.name === "strip" && route.param ? { kind: "strip", id: route.param }
    : null;
  const tp = pageTarget ? presumedOf(state, pageTarget) : null;

  // --live-rgb / --live-strength tint the chrome with the color of the current page's target
  useEffect(() => {
    const root = document.documentElement.style;
    if (!tp) {
      root.setProperty("--live-rgb", "255 255 255");
      root.setProperty("--live-strength", "0.12");
      return;
    }
    root.setProperty("--live-rgb", rgbStr(tp.h, tp.s));
    root.setProperty("--live-strength", tp.on && !unavailable ? (0.35 + (0.65 * tp.b) / 100).toFixed(2) : "0.12");
  }, [tp, unavailable]);

  return (
    <>
      <div className="app">
        <div className="main">
          {unavailable && (
            <div>
              <div className="banner" role="status">
                <Icon name="btOff" size="sm" />
                <span>
                  <strong>Bluetooth unavailable.</strong> The strips are not receiving commands. Check the Bluetooth permission.
                </span>
              </div>
            </div>
          )}
          <main className="view" id="view">
            {children}
          </main>
        </div>
      </div>

      <Toast />
    </>
  );
}
