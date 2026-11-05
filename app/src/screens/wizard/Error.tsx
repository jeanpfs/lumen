import { useT } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { StateBlock } from "../../ui/parts";
import type { WizardError as WizardErrorKind } from "../../lib/wizardMachine";

export default function WizardError({
  error,
  step,
  detail,
  onRetry,
  onRedo,
  onSkip,
  canSkip,
}: {
  error: WizardErrorKind;
  step: number;
  /** What the backend said, shown with "Connection lost" so a user without a debugger can report it. */
  detail?: string | null;
  onRetry: () => void;
  /** Drops the answers that contradicted each other (steps 5 and 7). */
  onRedo: () => void;
  onSkip: () => void;
  canSkip: boolean;
}) {
  const t = useT().wizard;
  if (error === "stalled") {
    return (
      <StateBlock
        icon="alert"
        title={t.errStalledTitle}
        text={t.errStalledText}
        actions={
          <div className="row-gap">
            <button className="btn btn-primary" onClick={onRetry}>
              <Icon name="refresh" size="sm" />
              {t.tryAgain}
            </button>
            {canSkip && (
              <button className="btn btn-secondary" onClick={onSkip}>
                {t.skipThisStep}
              </button>
            )}
          </div>
        }
      />
    );
  }

  if (error === "bluetooth") {
    return (
      <StateBlock
        icon="linkOff"
        title={t.errBluetoothTitle}
        text={t.errBluetoothText}
        actions={
          <div className="row-gap">
            <button className="btn btn-primary" onClick={onRetry}>
              <Icon name="refresh" size="sm" />
              {t.tryAgain}
            </button>
          </div>
        }
      />
    );
  }

  if (error === "lost") {
    return (
      <StateBlock
        icon="linkOff"
        title={t.errLostTitle}
        text={t.errLostText}
        detail={detail ?? undefined}
        actions={
          <div className="row-gap">
            <button className="btn btn-primary" onClick={onRetry}>
              <Icon name="refresh" size="sm" />
              {t.reconnect}
            </button>
          </div>
        }
      />
    );
  }

  return (
    <StateBlock
      icon="approx"
      title={t.errMismatchTitle}
      text={step === 5 ? t.errMismatchColours : t.errMismatchLevels}
      actions={
        <button className="btn btn-primary" onClick={onRedo}>
          <Icon name="refresh" size="sm" />
          {t.redoStep}
        </button>
      }
    />
  );
}
