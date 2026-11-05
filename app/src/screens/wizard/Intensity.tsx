import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { StripPreview } from "../../ui/StripPreview";
import { intensityOutcome, type IntensityPick } from "../../lib/wizard";

const LEVELS = [100, 70, 40, 20, 10, 3];

export default function WizardIntensity({
  onTest,
  onShow,
  onMinChange,
  onDiffChange,
  pick,
}: {
  /** Runs the six levels in order, telling which one is on the strip right now. */
  onTest: (onLevel: (level: number) => void) => Promise<void>;
  /** Sends one level (index 0..5) again. */
  onShow: (level: number) => Promise<void>;
  onMinChange: (value: IntensityPick["min"]) => void;
  onDiffChange: (value: IntensityPick["diff"]) => void;
  pick: IntensityPick;
}) {
  const t = useT().wizard;
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!testing && !tested) {
      const go = async () => {
        setTesting(true);
        await onTest(setShown);
        setTesting(false);
        setTested(true);
      };
      void go();
    }
  }, [onTest, testing, tested]);

  const result = intensityOutcome(pick);

  return (
    <>
      <h1 className="t-28 wz-q" id="wz-title" tabIndex={-1}>
        {testing ? t.intensityTitleTesting : t.intensityTitleAsk}
      </h1>
      <p className="muted wz-sub">
        {testing ? t.intensitySubTesting : t.intensitySubAsk}
      </p>

      <StripPreview colour="255 160 70" level={LEVELS[shown] / 100} />

      <div className="levels" role="group" aria-label={t.brightnessSteps}>
        {LEVELS.map((l, i) => (
          <button
            key={i}
            type="button"
            className="level"
            aria-pressed={shown === i}
            disabled={testing}
            style={{ "--k": 0.08 + l / 108 } as React.CSSProperties}
            aria-label={t.showPercent(l)}
            onClick={() => {
              setShown(i);
              void onShow(i);
            }}
          >
            <i />
            <span className="tnum">{l}%</span>
          </button>
        ))}
      </div>

      {tested && !testing && (
        <>
          <button type="button" className="btn btn-ghost btn-tight" onClick={() => setTested(false)}>
            <Icon name="refresh" size="sm" />
            {t.repeatSequence}
          </button>
          <fieldset className="qset">
            <legend className="strong">{t.lowestLevelQ}</legend>
            <div className="chips">
              {LEVELS.map((l, i) => (
                <button
                  key={i}
                  className="chip chip-btn tnum"
                  aria-pressed={pick.min === i}
                  onClick={() => onMinChange(i)}
                >
                  {l}%
                </button>
              ))}
              <button
                className="chip chip-btn"
                aria-pressed={pick.min === "none"}
                onClick={() => onMinChange("none")}
              >
                {t.noneLit}
              </button>
            </div>
          </fieldset>

          <fieldset className="qset">
            <legend className="strong">{t.stopSeeingQ}</legend>
            <div className="chips">
              <button
                className="chip chip-btn"
                aria-pressed={pick.diff === "all"}
                onClick={() => onDiffChange("all")}
              >
                {t.differenceEveryLevel}
              </button>
              {LEVELS.slice(1).map((l, i) => (
                <button
                  key={i + 1}
                  className="chip chip-btn tnum"
                  aria-pressed={pick.diff === i + 1}
                  onClick={() => onDiffChange(i + 1)}
                >
                  {l}%
                </button>
              ))}
            </div>
          </fieldset>

          {result.kind === "ok" && (
            <div className="result result-ok">
              <Icon name="check" />
              <div>
                <p className="strong tnum">{t.noticeable(result.steps, result.minPercent)}</p>
                <p className="muted t-12">{t.brightnessStarts(result.minPercent)}</p>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
