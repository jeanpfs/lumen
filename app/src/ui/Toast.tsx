import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { useApp } from "../state/store";

/** Shows the latest `state.toast` for 2.6 s. */
export function Toast() {
  const { state } = useApp();
  const [shown, setShown] = useState(false);
  const id = state.toast?.id;
  useEffect(() => {
    if (id === undefined) return;
    setShown(true);
    const t = setTimeout(() => setShown(false), 2600);
    return () => clearTimeout(t);
  }, [id]);
  return (
    <div id="toast" role="status" aria-live="polite" className={shown ? "is-on" : ""}>
      {state.toast && (
        <div className="toast-in">
          <Icon name="check" size="sm" />
          <span>{state.toast.text}</span>
        </div>
      )}
    </div>
  );
}
