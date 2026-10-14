import { Choices } from "./Choices";
import { useEffect } from "react";
import { Icon } from "../../ui/Icon";
import { StripPreview } from "../../ui/StripPreview";
import type { OrderName } from "../../lib/wizard";
import { ORDER_MESSAGE } from "../../lib/wizard";

const LED_NAME: Record<string, string> = { R: "red", G: "green", B: "blue", Y: "yellow", W: "white", N: "off" };

const COLOURS = [
  { k: "R", n: "Red", hue: 0 },
  { k: "G", n: "Green", hue: 120 },
  { k: "B", n: "Blue", hue: 240 },
];

const ANSWERS = [
  { k: "R", n: "Red" },
  { k: "G", n: "Green" },
  { k: "B", n: "Blue" },
  { k: "Y", n: "Yellow" },
  { k: "W", n: "White" },
  { k: "N", n: "None" },
];

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return [f(5) * 255, f(3) * 255, f(1) * 255].map(Math.round) as [number, number, number];
}

export default function WizardColour({
  index,
  onTest,
  value,
  onChoose,
  order,
}: {
  index: number;
  onTest: (index: number) => Promise<void>;
  value: string | null;
  onChoose: (value: string) => void;
  order: OrderName | null;
}) {
  // every question sends its own pure primary to the strip
  useEffect(() => {
    if (order === null && index < COLOURS.length) void onTest(index);
  }, [index, order, onTest]);

  if (order) {
    return (
      <>
        <h1 className="t-28 wz-q" id="wz-title" tabIndex={-1}>
          Calibration ready
        </h1>
        <p className="muted wz-sub">Based on what you saw, Lumen worked out this strip's channel order.</p>

        <div className="result result-ok">
          <Icon name="check" />
          <div>
            <p className="strong">{ORDER_MESSAGE[order]}</p>
            <p className="muted t-12">Channel order: <span className="mono">{order.toUpperCase()}</span></p>
          </div>
        </div>
      </>
    );
  }

  const c = COLOURS[index];
  if (!c) return null;
  const [r, g, b] = hsvToRgb(c.hue, 1, 1);

  return (
    <>
      <h1 className="t-28 wz-q" id="wz-title" tabIndex={-1}>
        What color do you see on the strip?
      </h1>
      <p className="muted wz-sub">
        {`Color ${index + 1} of 3. `}Answer based on what appears on the strip, not on the screen.
      </p>

      <StripPreview colour={`${r} ${g} ${b}`} />

      <Choices
        label="What color do you see?"
        value={value}
        onChoose={onChoose}
        options={ANSWERS.map((a) => ({
          value: a.k,
          label: a.n,
          swatch: `var(--led-${LED_NAME[a.k]})`,
          data: `ans-${a.k}`,
        }))}
      />

      <button type="button" className="btn btn-ghost" onClick={() => void onTest(index)}>
        <Icon name="refresh" size="sm" />
        Send again
      </button>

      <div className="dots-prog" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <i key={i} className={i < index ? "done" : i === index ? "cur" : ""} />
        ))}
      </div>
    </>
  );
}
