import { Icon } from "../../ui/Icon";
import { StateBlock } from "../../ui/parts";
import type { WizardError as WizardErrorKind } from "../../lib/wizardMachine";

export default function WizardError({
  error,
  step,
  onRetry,
  onRedo,
  onSkip,
  canSkip,
}: {
  error: WizardErrorKind;
  step: number;
  onRetry: () => void;
  /** Drops the answers that contradicted each other (steps 5 and 7). */
  onRedo: () => void;
  onSkip: () => void;
  canSkip: boolean;
}) {
  if (error === "stalled") {
    return (
      <StateBlock
        icon="alert"
        title="The strip stopped responding"
        text="It may have been turned off or be busy with another app. Check it and try again."
        actions={
          <div className="row-gap">
            <button className="btn btn-primary" onClick={onRetry}>
              <Icon name="refresh" size="sm" />
              Try again
            </button>
            {canSkip && (
              <button className="btn btn-secondary" onClick={onSkip}>
                Skip this step
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
        title="Bluetooth unavailable"
        text="Turn on Bluetooth and check the app's permission. Then try again."
        actions={
          <div className="row-gap">
            <button className="btn btn-primary" onClick={onRetry}>
              <Icon name="refresh" size="sm" />
              Try again
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
        title="Connection lost"
        text="Move the device closer to the strip. What you've already answered is saved."
        actions={
          <div className="row-gap">
            <button className="btn btn-primary" onClick={onRetry}>
              <Icon name="refresh" size="sm" />
              Reconnect
            </button>
          </div>
        }
      />
    );
  }

  return (
    <StateBlock
      icon="approx"
      title="The answers don't match"
      text={
        step === 5
          ? "Two colors sent looked the same, or one didn't light up. This happens with strong ambient light. Let's redo it, one color at a time."
          : "The minimum level and the point where you stop seeing a difference don't match. Let's review the steps."
      }
      actions={
        <button className="btn btn-primary" onClick={onRedo}>
          <Icon name="refresh" size="sm" />
          Redo this step
        </button>
      }
    />
  );
}
