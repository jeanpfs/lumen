import { useEffect, useState } from "react";
import { useT } from "../../i18n";
import { Icon } from "../../ui/Icon";
import { StripPreview } from "../../ui/StripPreview";
import { Choices } from "./Choices";

/** Step 4: sends off+on (`wizard_power_test`) and asks whether the strip followed; "Continue" commits the answer. */
export default function WizardPower({
  onTest,
  value,
  onChoose,
}: {
  onTest: () => Promise<boolean>;
  value: string | null;
  onChoose: (value: string) => void;
}) {
  const t = useT().wizard;
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);

  const run = async () => {
    setTesting(true);
    const ok = await onTest();
    setTesting(false);
    setTested(ok);
  };

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <h1 className="t-28 wz-q" id="wz-title" tabIndex={-1}>
        {testing ? t.powerTitleTesting : tested ? t.powerTitleAsk : t.testing}
      </h1>
      <p className="muted wz-sub">
        {testing ? t.powerSubTesting : t.powerSubDone}
      </p>

      {/* mirrors the real test: off during the pause, then on again */}
      <StripPreview on={!testing} />

      {tested && !testing && (
        <>
          <Choices
            label={t.powerTitleAsk}
            columns={2}
            value={value}
            onChoose={onChoose}
            options={[
              { value: "yes", label: t.yesTurned },
              { value: "no", label: t.no },
            ]}
          />
          <button type="button" className="btn btn-ghost" onClick={() => void run()}>
            <Icon name="refresh" size="sm" />
            {t.repeat}
          </button>
        </>
      )}
    </>
  );
}
