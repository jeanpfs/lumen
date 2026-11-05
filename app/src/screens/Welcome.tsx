import { useEffect, useRef } from "react";
import { Icon, type IconName } from "../ui/Icon";
import { useApp } from "../state/store";
import { useT } from "../i18n";

const PERMS: { icon: IconName; name: string; why: "permBluetoothWhy"; required: boolean }[] = [
  { icon: "bt", name: "Bluetooth", why: "permBluetoothWhy", required: true },
];

export function Welcome({ onDone }: { onDone: () => void }) {
  const { actions } = useApp();
  const t = useT().shell;
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => title.current?.focus(), []);

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="wl-title">
      <div className="welcome-inner">
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true" />
          Lumen
        </div>
        <h1 className="t-40" id="wl-title" tabIndex={-1} ref={title}>
          {t.welcomeTitle}
        </h1>
        <p className="muted welcome-lead">
          {t.welcomeLead}
        </p>
        <ul className="perms">
          {PERMS.map((p) => (
            <li className="perm card" key={p.name}>
              <span className="orb sm" aria-hidden="true">
                <Icon name={p.icon} size="sm" />
              </span>
              <div className="perm-txt">
                <span className="strong">
                  {p.name} <span className="muted t-12">· {p.required ? t.permRequired : t.permOptional}</span>
                </span>
                <span className="muted t-12">{t[p.why]}</span>
              </div>
            </li>
          ))}
        </ul>
        <div className="welcome-foot">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              actions.finishOnboarding();
              onDone();
            }}
          >
            {t.continue}
            <Icon name="chevR" size="sm" />
          </button>
        </div>
      </div>
    </div>
  );
}
