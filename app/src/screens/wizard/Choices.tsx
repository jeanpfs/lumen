import { useId, type CSSProperties, type ReactNode } from "react";

export interface Choice {
  value: string;
  label: string;
  /** CSS color variable for a leading LED swatch. */
  swatch?: string;
  data?: string;
}

/**
 * A single-choice question: tapping an option only selects it. The footer's "Continue" commits the answer, so
 * every wizard question works the same way. The selected option is drawn by `.answer[aria-checked="true"]`.
 */
export function Choices({
  label,
  value,
  options,
  onChoose,
  columns,
  showLabel = false,
  children,
}: {
  label: string;
  value: string | null;
  options: Choice[];
  onChoose: (value: string) => void;
  columns?: 2 | 3;
  /** Also print the question above the options (when the page title does not already ask it). */
  showLabel?: boolean;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <>
      {showLabel && (
        <p className="t-20" id={id}>
          {label}
        </p>
      )}
    <div className={`answers${columns === 2 ? " answers-2" : columns === 3 ? " answers-3" : ""}`} role="radiogroup" aria-label={showLabel ? undefined : label} aria-labelledby={showLabel ? id : undefined}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className="answer"
          onClick={() => onChoose(o.value)}
          data-od-id={o.data}
        >
          {o.swatch && <span className="led-sw" style={{ "--sc": o.swatch } as CSSProperties} />}
          <span>{o.label}</span>
        </button>
      ))}
      {children}
    </div>
    </>
  );
}
