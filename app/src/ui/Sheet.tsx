import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

/** Modal sheet (bottom sheet on phones, centred dialog on desktop). Closes on scrim click and Escape. */
export function Sheet({
  title,
  sub,
  onClose,
  menu = false,
  children,
}: {
  title: string;
  sub?: string;
  onClose: () => void;
  menu?: boolean;
  children: ReactNode;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".sheet input, .sheet select");
    (el ?? titleRef.current)?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCloseRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className={`sheet ${menu ? "sheet-menu" : ""}`} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
        <div className="sheet-head">
          <div>
            <h2 className="t-20" id="sheet-title" tabIndex={-1} ref={titleRef}>
              {title}
            </h2>
            {sub && <p className="muted t-12">{sub}</p>}
          </div>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}
