import { useEffect, useState } from "react";
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
        {testing ? "Watch the brightness drop" : "How far can you see a difference?"}
      </h1>
      <p className="muted wz-sub">
        {testing
          ? "The same color in 6 steps, from strongest to weakest."
          : "Tap a step to see it on the strip again."}
      </p>

      <StripPreview colour="255 160 70" level={LEVELS[shown] / 100} />

      <div className="levels" role="group" aria-label="Brightness steps">
        {LEVELS.map((l, i) => (
          <button
            key={i}
            type="button"
            className="level"
            aria-pressed={shown === i}
            disabled={testing}
            style={{ "--k": 0.08 + l / 108 } as React.CSSProperties}
            aria-label={`Show ${l}% on the strip`}
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
            Repeat sequence
          </button>
          <fieldset className="qset">
            <legend className="strong">What is the lowest level that still lights up?</legend>
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
                None lit up
              </button>
            </div>
          </fieldset>

          <fieldset className="qset">
            <legend className="strong">From which level do you stop seeing a difference?</legend>
            <div className="chips">
              <button
                className="chip chip-btn"
                aria-pressed={pick.diff === "all"}
                onClick={() => onDiffChange("all")}
              >
                I see a difference at every level
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
                <p className="strong tnum">Noticeable steps: {result.steps} · useful minimum: {result.minPercent}%</p>
                <p className="muted t-12">Brightness control will start at {result.minPercent}%, with no dead zone.</p>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
