import { useEffect } from "react";
import type { Capabilities, ProbeView } from "../../api";
import { useT } from "../../i18n";
import { profileName } from "../../lib/profiles";
import { Icon } from "../../ui/Icon";
import { StripPreview } from "../../ui/StripPreview";
import { Choices } from "./Choices";

const CAPS = ["color", "brightness", "white", "effects", "microphone"] as const;

/** Step 3: the recognizer asks one question per candidate family (blink, then colour). */
export default function WizardRecognition({
  recognition,
  probe,
  capabilities,
  profileId,
  onSend,
  value,
  onChoose,
}: {
  recognition: "pending" | "recognized" | "exhausted";
  probe: ProbeView | null;
  capabilities: Capabilities | null;
  profileId: string | null;
  onSend: () => Promise<void>;
  /** The option picked for the current question; "Continue" sends it to the recognizer. */
  value: string | null;
  onChoose: (value: string) => void;
}) {
  const all = useT();
  const t = all.wizard;
  const probing = recognition === "pending" && probe !== null;
  const key = probing ? `${probe.index}:${probe.phase}` : null;

  // each new question sends its probe to the strip
  useEffect(() => {
    if (key !== null) void onSend();
  }, [key, onSend]);

  const powerAnswers = [
    { value: "yes", label: t.yes },
    { value: "no", label: t.no },
  ];
  const colourAnswers = [
    { value: "red", label: t.red, swatch: "var(--led-red)" },
    { value: "green", label: t.green, swatch: "var(--led-green)" },
    { value: "blue", label: t.blue, swatch: "var(--led-blue)" },
    { value: "other", label: t.otherColour, swatch: "var(--led-off)" },
  ];

  return (
    <>
      <h1 className="t-28 wz-q" id="wz-title" tabIndex={-1}>
        {recognition === "pending"
          ? probe
            ? t.recFinding
            : t.testing
          : recognition === "recognized"
            ? profileId
              ? t.recognizedProfile(profileName(profileId, all.targets.profiles))
              : t.recognized
            : t.notRecognized}
      </h1>
      <p className="muted wz-sub">
        {recognition === "pending"
          ? t.recSubPending(probe?.total ?? null)
          : recognition === "recognized"
            ? t.recSubRecognized
            : t.recSubExhausted}
      </p>

      {probing && (
        <div className="probe-progress">
          <div
            className="progress"
            role="progressbar"
            aria-label={t.testProgress}
            aria-valuemin={0}
            aria-valuemax={probe.total}
            aria-valuenow={probe.index}
            aria-valuetext={t.testOf(probe.index, probe.total)}
          >
            <i style={{ transform: `scaleX(${probe.index / probe.total})` }} />
          </div>
          <span className="muted t-12 tnum">
            {t.testOf(probe.index, probe.total)}
          </span>
        </div>
      )}

      {probing && probe.phase === "blink" && (
        <Choices
          label={t.didBlink}
          showLabel
          columns={2}
          value={value}
          onChoose={onChoose}
          options={powerAnswers}
        />
      )}
      {probing && probe.phase === "blink" && (
        <button type="button" className="btn btn-ghost" onClick={() => void onSend()}>
          <Icon name="refresh" size="sm" />
          {t.sendAgain}
        </button>
      )}

      {probing && probe.phase === "colour" && (
        <Choices
          label={t.whatColourShown}
          showLabel
          value={value}
          onChoose={onChoose}
          options={colourAnswers}
        />
      )}
      {probing && probe.phase === "colour" && (
        <button type="button" className="btn btn-ghost" onClick={() => void onSend()}>
          <Icon name="refresh" size="sm" />
          {t.sendAgain}
        </button>
      )}

      {recognition === "recognized" && <StripPreview reveal caption={t.yourStrip} note={t.readyForColours} />}

      {recognition === "recognized" && (
        <div className="result result-ok">
          <Icon name="check" />
          <div>
            <p className="strong">{t.detectedCaps}</p>
            <div className="chips">
              {CAPS.filter((k) => capabilities?.[k]).map((k) => (
                <span key={k} className="chip">
                  {t.caps[k]}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {recognition === "exhausted" && (
        <div className="result result-warn">
          <Icon name="alert" />
          <div>
            <p className="strong">{t.couldNotRecognize}</p>
            <p className="muted t-12">{t.couldNotRecognizeHelp}</p>
          </div>
        </div>
      )}
    </>
  );
}
