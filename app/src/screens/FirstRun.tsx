import { Icon } from "../ui/Icon";
import type { Go } from "../router";

/** What the app shows while it has no strip at all: no menus, no header, only the way into the wizard. */
export function FirstRun({ go }: { go: Go }) {
  return (
    <div className="welcome" role="main" aria-labelledby="fr-title">
      <div className="welcome-inner">
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true" />
          Lumen
        </div>
        <h1 className="t-40" id="fr-title" tabIndex={-1}>
          Let's add your first strip
        </h1>
        <p className="muted welcome-lead">
          The wizard finds your strip over Bluetooth, shows it colors and brightness, and you just answer what you see. At the end, Lumen knows exactly how to talk to it.
        </p>
        <div className="welcome-foot">
          <button type="button" className="btn btn-primary" onClick={() => go("add")}>
            <Icon name="plus" />
            Get started
          </button>
        </div>
      </div>
    </div>
  );
}
