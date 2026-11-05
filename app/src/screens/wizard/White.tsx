import { useT } from "../../i18n";
import { Choices } from "./Choices";

/** Step 6. The backend cannot light only the white channel yet, so this is a plain question
 * (the user knows the strip from its box or controller) and never pretends to test anything.
 * Tapping an answer only selects it; "Continue" records it. */
export default function WizardWhite({ value, onChoose }: { value: string | null; onChoose: (value: string) => void }) {
  const t = useT().wizard;
  return (
    <>
      <h1 className="t-28 wz-q" id="wz-title" tabIndex={-1}>
        {t.whiteTitle}
      </h1>
      <p className="muted wz-sub">{t.whiteSub}</p>
      <Choices
        label={t.whiteTitle}
        columns={3}
        value={value}
        onChoose={onChoose}
        options={[
          { value: "yes", label: t.yesRgbw, swatch: "var(--led-white)" },
          { value: "no", label: t.noRgbOnly, swatch: "var(--led-off)" },
        ]}
      />
    </>
  );
}
