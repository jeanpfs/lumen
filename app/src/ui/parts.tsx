import type { CSSProperties, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import type { Link } from "../state/types";
import { useT } from "../i18n";

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

export function Presumed({ withText = true }: { withText?: boolean }) {
  const t = useT().shell;
  return (
    <span className="presumed" title={t.presumedTip}>
      <Icon name="approx" size="sm" />
      <span className={withText ? "" : "sr-only"}>{t.presumedState}</span>
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
  const t = useT().shell;
  return (
    <button
      type="button"
      className={`power ${on ? "is-on" : ""}`}
      aria-pressed={on}
      aria-label={on ? t.turnOff(name) : t.turnOn(name)}
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
  detail,
  actions,
}: {
  icon: IconName;
  title: string;
  text: string;
  /** Technical detail under the text, for error reports. */
  detail?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="state">
      <span className="state-ic">
        <Icon name={icon} size="lg" />
      </span>
      <h2 className="t-20">{title}</h2>
      <p className="muted">{text}</p>
      {detail && <p className="mono muted t-12">{detail}</p>}
      {actions && <div className="state-actions">{actions}</div>}
    </div>
  );
}

const LINK_LABEL: Record<Link, "linkLive" | "linkUnknown" | "linkUnreachable" | "linkRetrying"> = {
  live: "linkLive",
  unknown: "linkUnknown",
  unreachable: "linkUnreachable",
  retrying: "linkRetrying",
};
const LINK_BADGE: Record<Link, string> = { live: "live", unknown: "queue", unreachable: "unreachable", retrying: "retrying" };
const LINK_DOT: Record<Link, string> = { live: "on", unknown: "queue", unreachable: "unreachable", retrying: "partial" };

export function LinkBadge({ link }: { link: Link }) {
  const t = useT().shell;
  return (
    <span className={`badge badge-${LINK_BADGE[link]}`}>
      <span className={`dot ${LINK_DOT[link]}`} />
      {t[LINK_LABEL[link]]}
    </span>
  );
}

export function RetryButton({ link, onRetry }: { link: Link; onRetry: () => void }) {
  const t = useT().shell;
  const busy = link === "retrying";
  return (
    <button type="button" className="btn btn-secondary btn-tight" disabled={busy} onClick={onRetry}>
      <Icon name="refresh" size="sm" />
      {busy ? t.linkRetrying : t.tryAgain}
    </button>
  );
}
