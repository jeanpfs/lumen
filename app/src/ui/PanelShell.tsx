import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { useT } from "../i18n";

/** Full-screen frame of the panel and effect builders: close, "Step n of m", a progress bar, a footer. Same chrome as the strip wizard. */
export function PanelShell({
  step,
  steps,
  stepName,
  title,
  onClose,
  children,
  footer,
}: {
  step: number;
  steps: number;
  stepName: string;
  /** Heading of this step; the page's h1. */
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const t = useT().panel.common;
  return (
    <div className="wz" role="dialog" aria-modal="true" aria-labelledby="px-title">
      <header className="wz-top">
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t.close}>
          <Icon name="x" />
        </button>
        <div className="wz-steps">
          <span className="t-12 strong tnum">{t.step(step, steps)}</span>
          <span className="t-12 muted">{stepName}</span>
          <div className="wz-bar" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${steps}, 1fr)` }}>
            {Array.from({ length: steps }, (_, i) => (
              <i key={i} className={i + 1 < step ? "done" : i + 1 === step ? "cur" : ""} />
            ))}
          </div>
        </div>
        <span style={{ width: "var(--touch)" }} />
      </header>
      <main className="wz-body">
        <div className="wz-inner px-inner">
          <h1 id="px-title" className="t-28 wz-q" tabIndex={-1}>
            {title}
          </h1>
          {children}
        </div>
      </main>
      <footer className="wz-foot">{footer}</footer>
    </div>
  );
}
