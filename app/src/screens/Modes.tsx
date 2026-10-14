import { useMemo, type ChangeEvent } from "react";
import { Icon } from "../ui/Icon";
import { MODE_CATEGORIES } from "../lib/modes";
import { useLocalSetting } from "../lib/localSettings";
import { useApp, membersOf, presumedOf } from "../state/store";
import { targetKey, type TargetRef } from "../state/types";

const MAX_LIVE = 6;

/** Orange stand-in for the preview bars: the real colors are decided by the strip. */
const PREVIEW_COLOUR = "255 140 60";

export function ModesTab({ target }: { target: TargetRef }) {
  const { state, actions } = useApp();
  const count = target.kind === "group" ? membersOf(state.snapshot, target).length : 1;

  const [catId, setCatId] = useLocalSetting<string>("mode.cat", MODE_CATEGORIES[0].id);
  const [speed, setSpeed] = useLocalSetting("mode.speed", 50);
  const [brightness, setBrightness] = useLocalSetting("mode.b", 100);
  const [reversed, setReversed] = useLocalSetting("mode.dir", false);

  const cat = useMemo(() => MODE_CATEGORIES.find((c) => c.id === catId) ?? MODE_CATEGORIES[0], [catId]);
  const playing = state.effects[targetKey(target)] ?? null;
  const playingMode = useMemo(
    () => MODE_CATEGORIES.flatMap((c) => c.modes).find((m) => m.id === playing),
    [playing],
  );
  const approx = count > MAX_LIVE;

  const play = (id: number) => actions.setEffect(target, id, speed);

  const handleSpeed = (e: ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.currentTarget.value);
    setSpeed(v);
    actions.setSpeed(target, v);
  };
  const handleBrightness = (e: ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.currentTarget.value);
    setBrightness(v);
    actions.setBrightness(target, v);
  };
  const handleDirection = () => {
    setReversed(!reversed);
    actions.setDirection(target, !reversed);
  };
  /** The strip has no "stop" command: a color replaces the effect, so go back to the color it was showing. */
  const stop = () => {
    const shown = presumedOf(state, target);
    actions.setColour(target, shown.h, shown.s);
    void actions.flush();
  };

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Effect categories">
        {MODE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            role="tab"
            className={`tab ${c.id === cat.id ? "is-sel" : ""}`}
            aria-selected={c.id === cat.id}
            onClick={() => setCatId(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="modes-grid">
        <ul className="fx-list" role="radiogroup" aria-label={cat.name}>
          {cat.modes.map((mode) => (
            <li key={mode.id}>
              <button
                className={`fx-card ${mode.id === playing ? "is-sel" : ""}`}
                role="radio"
                aria-checked={mode.id === playing}
                onClick={() => play(mode.id)}
              >
                <span
                  className="fx"
                  data-a={cat.preview}
                  style={{ "--c": PREVIEW_COLOUR } as React.CSSProperties}
                  aria-hidden="true"
                >
                  <i></i>
                  <b></b>
                </span>
                <span className="fx-txt">
                  <span className="strong">{mode.name}</span>
                </span>
                <span className="radio" aria-hidden="true"></span>
              </button>
            </li>
          ))}
        </ul>

        <section className="card card-pad fx-panel">
          <div className="ctl-head">
            <h2 className="t-20">{playingMode ? playingMode.name : "No effect"}</h2>
            {approx && (
              <span className="tip-wrap">
                <button className="badge badge-warn" aria-describedby="tip-approx">
                  <Icon name="approx" size="sm" />
                  approximate effect
                </button>
                <span role="tooltip" id="tip-approx" className="tooltip">
                  {count} strips, {MAX_LIVE} live connections. Strips in the queue run the effect without exact sync.
                </span>
              </span>
            )}
          </div>
          <div className="ctl">
            <div className="ctl-head">
              <label htmlFor="rng-spd" className="strong">
                Speed
              </label>
              <output className="tnum" id="out-spd">
                {speed}
              </output>
            </div>
            <input
              type="range"
              className="range"
              id="rng-spd"
              min="1"
              max="100"
              value={speed}
              style={{ ["--p" as string]: `${((speed - 1) / 99) * 100}%` }}
              onChange={handleSpeed}
              onPointerUp={() => void actions.flush()}
            />
            <div className="ctl-foot muted t-12">
              <span>Slow</span>
              <span>Default 50</span>
              <span>Fast</span>
            </div>
          </div>
          <div className="ctl">
            <div className="ctl-head">
              <label htmlFor="rng-mb" className="strong">
                Brightness
              </label>
              <output className="tnum" id="out-mb">
                {brightness}%
              </output>
            </div>
            <input
              type="range"
              className="range range-live"
              id="rng-mb"
              min="3"
              max="100"
              value={brightness}
              style={{ ["--p" as string]: `${((brightness - 3) / 97) * 100}%` }}
              onChange={handleBrightness}
              onPointerUp={() => void actions.flush()}
            />
          </div>
          <div className="ctl">
            <div className="ctl-head">
              <span className="strong" id="lbl-dir">
                Reverse direction
              </span>
              <button
                type="button"
                role="switch"
                className="switch"
                aria-checked={reversed}
                aria-labelledby="lbl-dir"
                onClick={handleDirection}
              >
                <span></span>
              </button>
            </div>
          </div>
          <button className="btn" onClick={stop} disabled={playing === null}>
            Stop effect
          </button>
        </section>
      </div>
    </>
  );
}
