import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

if (!globalThis.ResizeObserver) {
  class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // Polyfill for test environment; ResizeObserver is not available in jsdom
  const g = globalThis as unknown;
  if (typeof g === "object" && g !== null) {
    (g as Record<string, unknown>).ResizeObserver = ResizeObserver;
  }
}
Element.prototype.scrollTo ??= () => {};

afterEach(() => {
  cleanup();
  localStorage.clear();
});
