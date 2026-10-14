import { useEffect } from "react";
import type { Capabilities, ProbeView } from "../../api";
import { profileName } from "../../lib/profiles";
import { Icon } from "../../ui/Icon";
import { StripPreview } from "../../ui/StripPreview";
import { Choices } from "./Choices";

const POWER_ANSWERS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

const COLOUR_ANSWERS = [
  { value: "red", label: "Red", swatch: "var(--led-red)" },
  { value: "green", label: "Green", swatch: "var(--led-green)" },
  { value: "blue", label: "Blue", swatch: "var(--led-blue)" },
  { value: "other", label: "Another color or nothing", swatch: "var(--led-off)" },
];

const CAPS: [keyof Capabilities, string][] = [
  ["color", "Color"],
  ["brightness", "Brightness"],
  ["white", "White"],
  ["effects", "Effects"],
  ["microphone", "Microphone"],
];

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
  const probing = recognition === "pending" && probe !== null;
  const key = probing ? `${probe.index}:${probe.phase}` : null;

  // each new question sends its probe to the strip
  useEffect(() => {
    if (key !== null) void onSend();
  }, [key, onSend]);

  return (
    <>
      <h1 className="t-28 wz-q" id="wz-title" tabIndex={-1}>
        {recognition === "pending"
          ? probe
            ? "Finding out how to talk to your strip"
            : "Testing…"
          : recognition === "recognized"
            ? profileId
              ? `Recognized: ${profileName(profileId)}`
              : "Recognized"
            : "Not recognized"}
      </h1>
      <p className="muted wz-sub">
        {recognition === "pending"
          ? `Each test sends a command to the strip and you tell us what you saw. This can take up to ${probe?.total ?? "several"} tests.`
          : recognition === "recognized"
            ? "The strip responded. Lumen now knows how to talk to it."
            : "No known type responded. Go back and pick another strip, or check that the manufacturer's app is closed."}
      </p>

      {probing && (
        <div className="probe-progress">
          <div
            className="progress"
            role="progressbar"
            aria-label="Test progress"
            aria-valuemin={0}
            aria-valuemax={probe.total}
            aria-valuenow={probe.index}
            aria-valuetext={`Test ${probe.index} of ${probe.total}`}
          >
            <i style={{ transform: `scaleX(${probe.index / probe.total})` }} />
          </div>
          <span className="muted t-12 tnum">
            Test {probe.index} of {probe.total}
          </span>
        </div>
      )}

      {probing && probe.phase === "blink" && (
        <Choices
          label="Did the strip go off and back on again?"
          showLabel
          columns={2}
          value={value}
          onChoose={onChoose}
          options={POWER_ANSWERS}
        />
      )}
      {probing && probe.phase === "blink" && (
        <button type="button" className="btn btn-ghost" onClick={() => void onSend()}>
          <Icon name="refresh" size="sm" />
          Send again
        </button>
      )}

      {probing && probe.phase === "colour" && (
        <Choices
          label="What color did the strip show?"
          showLabel
          value={value}
          onChoose={onChoose}
          options={COLOUR_ANSWERS}
        />
      )}
      {probing && probe.phase === "colour" && (
        <button type="button" className="btn btn-ghost" onClick={() => void onSend()}>
          <Icon name="refresh" size="sm" />
          Send again
        </button>
      )}

      {recognition === "recognized" && <StripPreview reveal caption="Your strip" note="ready to receive colors" />}

      {recognition === "recognized" && (
        <div className="result result-ok">
          <Icon name="check" />
          <div>
            <p className="strong">Detected capabilities</p>
            <div className="chips">
              {CAPS.filter(([k]) => capabilities?.[k]).map(([k, label]) => (
                <span key={k} className="chip">
                  {label}
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
            <p className="strong">Could not recognize this strip</p>
            <p className="muted t-12">
              Go back and pick another strip from the list. If the strip does not respond, close the manufacturer's app, which holds the
              connection, and try again. The list of supported types is at the bottom of Home, under Supported strip types.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
