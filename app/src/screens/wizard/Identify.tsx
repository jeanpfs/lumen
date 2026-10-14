import { useState } from "react";
import { Icon } from "../../ui/Icon";
import { StripPreview } from "../../ui/StripPreview";
import { Choices } from "./Choices";

export default function WizardIdentify({
  stripName,
  onBlink,
  value,
  onChoose,
}: {
  stripName: string;
  onBlink: () => Promise<void>;
  value: string | null;
  onChoose: (value: string) => void;
}) {
  const [blinking, setBlinking] = useState(false);
  const [blinked, setBlinked] = useState(false);

  const handleBlink = async () => {
    setBlinking(true);
    await onBlink();
    setBlinking(false);
    setBlinked(true);
  };

  return (
    <>
      <h1 className="t-28 wz-q" id="wz-title" tabIndex={-1}>
        Let's blink <span className="mono">{stripName}</span>
      </h1>
      <p className="muted wz-sub">Look at your strips. The one that blinks is this one.</p>

      <div className="device device-static">
        <Icon name="bt" size="sm" />
        <span className="device-txt">
          <span className="mono strong">{stripName}</span>
          <span className="muted t-12">ready to test</span>
        </span>
      </div>

      {/* the real blink is: off, a pause, on (the service waits ~1.2 s between the two) */}
      <StripPreview on={!blinking} />

      <button type="button" className="btn btn-secondary" onClick={handleBlink} disabled={blinking} data-od-id="wz-flash">
        <Icon name="flash" size="sm" />
        {blinking ? "Blinking…" : blinked ? "Blink again" : "Blink to identify"}
      </button>

      {blinked && (
        <div className="ask">
          <p className="t-20">Is this your strip?</p>
          <Choices
            label="Is this your strip?"
            columns={2}
            value={value}
            onChoose={onChoose}
            options={[
              { value: "yes", label: "Yes, this one" },
              { value: "no", label: "No, back to the list" },
            ]}
          />
        </div>
      )}
    </>
  );
}
