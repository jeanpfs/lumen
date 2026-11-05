import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../state/store";
import { StateBlock } from "./parts";
import { useT } from "../i18n";

/** Covers the whole app while Bluetooth is off: nothing in Lumen works without it. */
export function BluetoothGate() {
  const { state, actions } = useApp();
  const t = useT().shell;
  const off = state.bluetooth === "off";
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!off) return;
    // the app underneath must not be reachable by keyboard or screen reader either
    const root = document.getElementById("root");
    if (root) root.inert = true;
    button.current?.focus();
    return () => {
      if (root) root.inert = false;
    };
  }, [off]);

  if (!off) return null;
  const android = window.LumenNative !== undefined;
  return createPortal(
    <div className="bt-gate" role="alertdialog" aria-modal="true" aria-label={t.btOffTitle}>
      <StateBlock
        icon="linkOff"
        title={t.btOffTitle}
        text={
          android
            ? t.btOffTextAndroid
            : t.btOffTextDesktop
        }
        actions={
          <button ref={button} className="btn btn-primary" onClick={actions.enableBluetooth}>
            {android ? t.btTurnOn : t.btOpenSettings}
          </button>
        }
      />
    </div>,
    document.body,
  );
}
