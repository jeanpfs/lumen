import { useState } from "react";
import { useT } from "../../i18n";
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
  const t = useT().wizard;
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
        {t.blinkPrefix}<span className="mono">{stripName}</span>
      </h1>
      <p className="muted wz-sub">{t.identifySub}</p>

      <div className="device device-static">
        <Icon name="bt" size="sm" />
        <span className="device-txt">
          <span className="mono strong">{stripName}</span>
          <span className="muted t-12">{t.readyToTest}</span>
        </span>
      </div>

      {/* the real blink is: off, a pause, on (the service waits ~1.2 s between the two) */}
      <StripPreview on={!blinking} />

      <button type="button" className="btn btn-secondary" onClick={handleBlink} disabled={blinking} data-od-id="wz-flash">
        <Icon name="flash" size="sm" />
        {blinking ? t.blinking : blinked ? t.blinkAgain : t.blinkToIdentify}
      </button>

      {blinked && (
        <div className="ask">
          <p className="t-20">{t.isThisYours}</p>
          <Choices
            label={t.isThisYours}
            columns={2}
            value={value}
            onChoose={onChoose}
            options={[
              { value: "yes", label: t.yesThisOne },
              { value: "no", label: t.noBackToList },
            ]}
          />
        </div>
      )}
    </>
  );
}
