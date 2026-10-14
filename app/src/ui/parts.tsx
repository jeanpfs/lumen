import type { CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import type { Link } from "../state/types";

/** `style` with the `--c` custom property the stylesheet reads. */
export const colourVar = (rgb: string): CSSProperties => ({ ["--c" as string]: rgb });

export function PageHead({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-txt">
        <h1 className="t-28" tabIndex={-1}>
          {title}
        </h1>
        {sub && <p className="muted page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  );
}

const PRESUMED_TIP = "The strip does not confirm commands. The state shown is the last one sent.";

export function Presumed({ withText = true }: { withText?: boolean }) {
  return (
    <span className="presumed" title={PRESUMED_TIP}>
      <Icon name="approx" size="sm" />
      <span className={withText ? "" : "sr-only"}>presumed state</span>
    </span>
  );
}

export function PowerButton({
  on,
  name,
  onToggle,
  disabled,
}: {
  on: boolean;
  name: string;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`power ${on ? "is-on" : ""}`}
      aria-pressed={on}
      aria-label={`${on ? "Turn off" : "Turn on"} ${name}`}
      disabled={disabled}
      onClick={onToggle}
    >
      <Icon name="power" />
    </button>
  );
}

export function Switch({
  on,
  label,
  onToggle,
  disabled,
}: {
  on: boolean;
  label: string;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
    >
      <span />
    </button>
  );
}

export function StateBlock({
  icon,
  title,
  text,
  actions,
}: {
  icon: IconName;
  title: string;
  text: string;
  actions?: ReactNode;
}) {
  return (
    <div className="state">
      <span className="state-ic">
        <Icon name={icon} size="lg" />
      </span>
      <h2 className="t-20">{title}</h2>
      <p className="muted">{text}</p>
      {actions && <div className="state-actions">{actions}</div>}
    </div>
  );
}

const LINK_LABEL: Record<Link, string> = {
  live: "Live",
  unknown: "No contact yet",
  unreachable: "Unreachable",
  retrying: "Retrying…",
};
const LINK_BADGE: Record<Link, string> = { live: "live", unknown: "queue", unreachable: "unreachable", retrying: "retrying" };
const LINK_DOT: Record<Link, string> = { live: "on", unknown: "queue", unreachable: "unreachable", retrying: "partial" };

export function LinkBadge({ link }: { link: Link }) {
  return (
    <span className={`badge badge-${LINK_BADGE[link]}`}>
      <span className={`dot ${LINK_DOT[link]}`} />
      {LINK_LABEL[link]}
    </span>
  );
}

export function RetryButton({ link, onRetry }: { link: Link; onRetry: () => void }) {
  const busy = link === "retrying";
  return (
    <button type="button" className="btn btn-secondary btn-tight" disabled={busy} onClick={onRetry}>
      <Icon name="refresh" size="sm" />
      {busy ? "Retrying…" : "Try again"}
    </button>
  );
}
