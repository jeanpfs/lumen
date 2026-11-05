import { Icon } from "../ui/Icon";
import { useT } from "../i18n";
import type { Go } from "../router";

/** What the app shows while it has no strip at all: no menus, no header, only the way into the wizard. */
export function FirstRun({ go }: { go: Go }) {
  const t = useT().shell;
  return (
    <div className="welcome" role="main" aria-labelledby="fr-title">
      <div className="welcome-inner">
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true" />
          Lumen
        </div>
        <h1 className="t-40" id="fr-title" tabIndex={-1}>
          {t.firstRunTitle}
        </h1>
        <p className="muted welcome-lead">
          {t.firstRunLead}
        </p>
        <div className="welcome-foot">
          <button type="button" className="btn btn-primary" onClick={() => go("add")}>
            <Icon name="plus" />
            {t.getStarted}
          </button>
        </div>
      </div>
    </div>
  );
}
