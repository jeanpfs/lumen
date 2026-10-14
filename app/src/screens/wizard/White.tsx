import { Choices } from "./Choices";

/** Step 6. The backend cannot light only the white channel yet, so this is a plain question
 * (the user knows the strip from its box or controller) and never pretends to test anything.
 * Tapping an answer only selects it; "Continue" records it. */
export default function WizardWhite({ value, onChoose }: { value: string | null; onChoose: (value: string) => void }) {
  return (
    <>
      <h1 className="t-28 wz-q" id="wz-title" tabIndex={-1}>
        Does your strip have a separate white LED?
      </h1>
      <p className="muted wz-sub">
        RGBW strips have a fourth LED that is white only. Check the box or the controller. If you are not sure, tap
        Skip: the white will be mixed with red, green and blue.
      </p>
      <Choices
        label="Does your strip have a separate white LED?"
        columns={3}
        value={value}
        onChoose={onChoose}
        options={[
          { value: "yes", label: "Yes, RGBW", swatch: "var(--led-white)" },
          { value: "no", label: "No, RGB only", swatch: "var(--led-off)" },
        ]}
      />
    </>
  );
}
