import "./index.css";
import "@fontsource-variable/manrope";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import App from "./App";
import type { Backend } from "./state/store";

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);
const render = (backend?: Backend) =>
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App backend={backend} />
      </ErrorBoundary>
    </React.StrictMode>,
  );

// Pretend strips instead of Bluetooth, for trying the UI without hardware: `npm run dev` + `/?sim`, or a build made
// with `VITE_SIM=1` (an emulator has no Bluetooth). Never set in release builds, which drop the simulator.
if (import.meta.env.VITE_SIM || (import.meta.env.DEV && new URLSearchParams(window.location.search).has("sim"))) {
  void import("./sim/simBackend").then((m) => render(m.simBackend()));
} else {
  render();
}
