import "./index.css";
import "@fontsource-variable/manrope";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
 <React.StrictMode>
 <ErrorBoundary>
 <App />
 </ErrorBoundary>
 </React.StrictMode>,
);
