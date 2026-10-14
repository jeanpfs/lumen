import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { Discovered, Seen, WizardState } from "../api";
import { Icon } from "../ui/Icon";
import { LEVELS_PERCENT, intensityOutcome, toSeen } from "../lib/wizard";
import { WZ_SKIP, WZ_STEPS, backLeavesWizard, canNext, initialModel, wizardReducer } from "../lib/wizardMachine";
import { useApp } from "../state/store";
import type { Go } from "../router";
import WizardScan, { SCAN_SECS } from "./wizard/Scan";
import WizardIdentify from "./wizard/Identify";
import WizardRecognition from "./wizard/Recognition";
import WizardPower from "./wizard/Power";
import WizardColour from "./wizard/Colour";
import WizardWhite from "./wizard/White";
import WizardEffects from "./wizard/Effects";
import WizardIntensity from "./wizard/Intensity";
import WizardError from "./wizard/Error";
import WizardSummary from "./wizard/Summary";
import { NewGroupSheet } from "./GroupSheets";

const WZ_HELP: Record<number, string> = {
  1: "The search takes about 8 seconds. If the strip doesn't appear, close the manufacturer's app: the strip accepts only one connection at a time.",
  2: "With several strips in the same room, blinking is the safest way to tell them apart.",
  3: "If the strip wasn't recognized, go back and pick another from the list. Close the manufacturer's app if it's stuck.",
  4: "Try again. If nothing changes, close the manufacturer's app and retry.",
  5: "Many strips swap the channel order. Answer the color you see on the strip; Lumen corrects it automatically.",
  6: "RGBW strips have a separate white LED. RGB strips make white by mixing the three colors.",
  7: "At low brightness, many strips turn off or stop changing. This test avoids a dead range in the controller.",
  8: "Effects come later. For now you can skip this step.",
  9: "The name appears on Home and in groups. A strip can join as many groups as you want.",
};

const SCAN_TIMEOUT_MS = 20000;
// a cold connect can take find-scan 4 s + connect 8 s + discovery 8 s; do not call that "stalled" while it is still working
const STEP_TIMEOUT_MS = 25000;
const INTENSITY_HOLD_MS = 900;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let reject: (reason?: unknown) => void;
  const racePromise = new Promise<T>((_, rej) => {
    reject = rej;
  });
  const timer = setTimeout(() => reject(new Error("stalled")), ms);
  return Promise.race([promise, racePromise]).finally(() => clearTimeout(timer));
}

export interface WizardProps {
  /** Id of a saved strip to recalibrate: the wizard starts at step 4 and keeps the strip's id. */
  recalibrate?: string;
  onClose: () => void;
  go: Go;
}

export function Wizard({ recalibrate, onClose }: WizardProps) {
  const { state, actions, backend } = useApp();
  const [m, dispatch] = useReducer(wizardReducer, recalibrate || "", (rec) =>
    initialModel(
      !!rec,
      state.snapshot.strips.find((s) => s.id === rec)?.name || "",
      rec ? state.snapshot.groups.filter((g) => g.members.includes(rec)).map((g) => g.id) : [],
    ),
  );
  // the snapshot may load after the first render: seed the name and groups of the strip once it is there
  const seededRef = useRef(false);
  useEffect(() => {
    if (!recalibrate || seededRef.current) return;
    const saved = state.snapshot.strips.find((s) => s.id === recalibrate);
    if (!saved) return;
    seededRef.current = true;
    dispatch({
      type: "seed",
      name: saved.name,
      groups: state.snapshot.groups.filter((g) => g.members.includes(recalibrate)).map((g) => g.id),
    });
  }, [recalibrate, state.snapshot]);
  // a recalibration needs its backend session before step 4 may talk to the strip
  const [ready, setReady] = useState(!recalibrate);
  const [newGroupOpen, setNewGroupOpen] = useState(false);

  // Every step puts focus on something real (its title, or the name field on the last step). Without it the focus
  // stays on the button that was just pressed and removed, and the window can stop taking clicks until the app is
  // switched away and back.
  useEffect(() => {
    if (!ready || m.error) return;
    const id = requestAnimationFrame(() => {
      const target =
        m.step === 9
          ? document.querySelector<HTMLElement>(".wz input[type=text]")
          : document.getElementById("wz-title");
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [m.step, m.error, ready]);

  const mountedRef = useRef(true);
  const finishingRef = useRef(false);
  const selectedStripRef = useRef<{ id: string; name: string | null } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleError = useCallback((msg: unknown) => {
    if (!mountedRef.current) return;
    const text = typeof msg === "string" ? msg : msg instanceof Error ? msg.message : "";
    if (text.includes("service unavailable") || text.includes("Bluetooth")) {
      dispatch({ type: "error", error: "bluetooth" });
    } else if (text === "stalled") {
      dispatch({ type: "error", error: "stalled" });
    } else {
      dispatch({ type: "error", error: "lost" });
      console.error("Wizard error:", msg);
    }
  }, []);

  /** Mirrors the backend's recognizer into the model. */
  const applyState = useCallback((s: WizardState) => {
    if (s.state === "probing") {
      dispatch({ type: "probe", probe: s.probe });
      dispatch({ type: "recognition", value: "pending" });
    } else if (s.state === "recognized") {
      dispatch({ type: "capabilities", value: s.capabilities, profileId: s.profile_id });
      dispatch({ type: "recognition", value: "recognized" });
    } else {
      dispatch({ type: "recognition", value: "exhausted" });
    }
  }, []);

  const prepareRecalibration = useCallback(async () => {
    if (!recalibrate) return;
    try {
      const s = await withTimeout(backend.wizardRecalibrate(recalibrate), STEP_TIMEOUT_MS);
      if (!mountedRef.current) return;
      applyState(s);
      setReady(true);
    } catch (e) {
      handleError(e);
    }
  }, [recalibrate, backend, applyState, handleError]);

  useEffect(() => {
    void prepareRecalibration();
  }, [prepareRecalibration]);

  const scanStrips = useCallback(async (): Promise<Discovered[]> => {
    try {
      const discovered = await withTimeout(backend.scan(SCAN_SECS), SCAN_TIMEOUT_MS);
      return mountedRef.current ? discovered : [];
    } catch (e) {
      handleError(e);
      return [];
    }
  }, [backend, handleError]);

  const startWizard = useCallback(
    async (stripId: string, advertisedName: string | null) => {
      selectedStripRef.current = { id: stripId, name: advertisedName };
      try {
        const result = await withTimeout(backend.wizardStart(stripId, advertisedName), STEP_TIMEOUT_MS);
        if (!mountedRef.current) return;
        applyState(result);
        dispatch({ type: "go", step: 2 });
      } catch (e) {
        handleError(e);
      }
    },
    [backend, applyState, handleError],
  );

  const probeStrip = useCallback(async () => {
    try {
      await withTimeout(backend.wizardProbe(), STEP_TIMEOUT_MS);
    } catch (e) {
      handleError(e);
    }
  }, [backend, handleError]);

  const answerProbe = useCallback(
    async (send: () => Promise<WizardState>) => {
      try {
        const result = await withTimeout(send(), STEP_TIMEOUT_MS);
        if (mountedRef.current) applyState(result);
      } catch (e) {
        handleError(e);
      }
    },
    [applyState, handleError],
  );

  /** Resolves true when the strip was sent the off+on pair. */
  const testPower = useCallback(async (): Promise<boolean> => {
    try {
      await withTimeout(backend.wizardPowerTest(), STEP_TIMEOUT_MS);
      return mountedRef.current;
    } catch (e) {
      handleError(e);
      return false;
    }
  }, [backend, handleError]);

  const testColour = useCallback(
    async (index: number) => {
      try {
        await withTimeout(backend.wizardColourTest(index), STEP_TIMEOUT_MS);
      } catch (e) {
        handleError(e);
      }
    },
    [backend, handleError],
  );

  const testIntensity = useCallback(async (onLevel: (level: number) => void) => {
    try {
      // levels are indices into the core's INTENSITY_LEVELS (100, 70, 40, 20, 10, 3 percent)
      for (let level = 0; level < LEVELS_PERCENT.length; level++) {
        if (!mountedRef.current) return;
        onLevel(level);
        await withTimeout(backend.wizardIntensityTest(level), STEP_TIMEOUT_MS);
        await new Promise((r) => setTimeout(r, INTENSITY_HOLD_MS));
      }
      // the 3 % step looks like a switched-off strip: leave it at full brightness while the user answers
      onLevel(0);
      await withTimeout(backend.wizardIntensityTest(0), STEP_TIMEOUT_MS);
    } catch (e) {
      handleError(e);
    }
  }, [backend, handleError]);

  const showLevel = useCallback(
    async (level: number) => {
      try {
        await withTimeout(backend.wizardIntensityTest(level), STEP_TIMEOUT_MS);
      } catch (e) {
        handleError(e);
      }
    },
    [backend, handleError],
  );

  const finishWizard = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    try {
      // what the user saw for logical red, green, blue, in test order (wire bytes 0, 1, 2)
      const colours: [Seen, Seen, Seen] | null =
        m.colourAnswers.length === 3
          ? [toSeen(m.colourAnswers[0]), toSeen(m.colourAnswers[1]), toSeen(m.colourAnswers[2])]
          : null;
      const outcome = intensityOutcome(m.pick);
      const intensity = outcome.kind === "ok" ? outcome.answers : null;
      const strip = await withTimeout(
        backend.wizardFinish(m.name.trim(), colours, m.hasWhite ?? false, intensity),
        STEP_TIMEOUT_MS,
      );
      if (!mountedRef.current) return;
      // when recalibrating, sync the group membership: remove from unticked groups, add to newly ticked ones
      if (m.recalibrate) {
        const ticked: Record<string, true> = Object.fromEntries(m.groups.map((g) => [g, true]));
        for (const group of state.snapshot.groups) {
          const wasMember = group.members.includes(strip.id);
          const shouldBeMember = group.id in ticked;
          if (wasMember && !shouldBeMember) {
            await actions.removeFromGroup(group.id, [strip.id]);
          } else if (!wasMember && shouldBeMember) {
            await actions.addToGroup(group.id, [strip.id]);
          }
        }
      } else {
        // new strip: add to all ticked groups
        for (const gid of m.groups) {
          const group = state.snapshot.groups.find((g) => g.id === gid);
          if (group && !group.members.includes(strip.id)) await actions.addToGroup(gid, [strip.id]);
        }
      }
      await actions.refresh();
      onClose();
    } catch (e) {
      finishingRef.current = false;
      handleError(e);
    }
  }, [m, state.snapshot.groups, backend, actions, onClose, handleError]);

  const cancelWizard = useCallback(async () => {
    try {
      await backend.wizardCancel();
    } catch {
      // the session is gone either way
    }
    onClose();
  }, [backend, onClose]);

  const onBack = useCallback(() => {
    if (backLeavesWizard(m)) {
      void cancelWizard();
    } else {
      dispatch({ type: "back" });
    }
  }, [m, cancelWizard]);

  const onRetry = useCallback(() => {
    dispatch({ type: "clearError" });
    if (!ready) void prepareRecalibration();
  }, [ready, prepareRecalibration]);

  const onNext = useCallback(async () => {
    // step 1: commit the selected strip and call startWizard
    if (m.step === 1 && m.choice) {
      const [id, name] = JSON.parse(m.choice) as [string, string];
      await startWizard(id, name || null);
      return;
    }
    // step 3: commit the chosen answer to the recognizer
    if (m.step === 3 && m.probe !== null && m.choice !== null) {
      if (m.probe.phase === "blink") {
        await answerProbe(() => backend.wizardAnswerPower(m.choice === "yes"));
      } else if (m.probe.phase === "colour") {
        const seen = m.choice === "red" ? "red" : m.choice === "green" ? "green" : m.choice === "blue" ? "blue" : "other";
        await answerProbe(() => backend.wizardAnswerColour(seen));
      }
      return; // the recognizer's answer decides what comes next (another question, recognized, exhausted)
    }
    // for all other steps, just dispatch next (the machine will handle commits)
    if (m.step === 9) {
      void finishWizard();
    } else {
      dispatch({ type: "next" });
    }
  }, [m.step, m.probe, m.choice, backend, answerProbe, finishWizard, startWizard]);

  const nextLbl = m.step === 9 ? (recalibrate ? "Save profile" : "Finish") : "Continue";
  const showNext = [1, 2, 3, 4, 5, 6, 7, 8, 9].includes(m.step) && !m.error && ready;
  const showStep = !m.error && ready;

  return (
    <div className="wz" role="dialog" aria-modal="true" aria-labelledby="wz-title" data-step={m.step}>
      <header className="wz-top">
        <button className="icon-btn" onClick={() => void cancelWizard()} aria-label="Exit setup">
          <Icon name="x" />
        </button>
        <div className="wz-steps">
          <span className="t-12 strong tnum">Step {m.step} of 9</span>
          <span className="t-12 muted">{WZ_STEPS[m.step - 1]}</span>
          <div className="wz-bar" aria-hidden="true">
            {WZ_STEPS.map((_, i) => (
              <i
                key={i}
                className={i + 1 < m.step ? "done" : i + 1 === m.step ? "cur" : ""}
              />
            ))}
          </div>
        </div>
        <button
          className="btn btn-ghost btn-tight"
          onClick={() => dispatch({ type: "help" })}
          aria-expanded={m.help}
        >
          <Icon name="help" size="sm" />
          <span className="hide-xs">I need help</span>
        </button>
      </header>

      <main className="wz-body">
        <div className="wz-inner">
          {m.help && (
            <div className="wz-help" role="note">
              <Icon name="help" size="sm" />
              <p>{WZ_HELP[m.step]}</p>
              <button
                className="icon-btn"
                onClick={() => dispatch({ type: "help" })}
                aria-label="Close help"
              >
                <Icon name="x" size="sm" />
              </button>
            </div>
          )}

          {m.error && (
            <WizardError
              error={m.error}
              step={m.step}
              onRetry={onRetry}
              onRedo={() => dispatch({ type: "redo" })}
              onSkip={() => dispatch({ type: "skip" })}
              canSkip={WZ_SKIP[m.step] ?? false}
            />
          )}

          {!m.error && !ready && <p className="muted">Preparing the strip…</p>}

          {showStep && m.step === 1 && <WizardScan onScan={scanStrips} value={m.choice} onChoose={(v) => dispatch({ type: "choose", value: v })} />}
          {showStep && m.step === 2 && (
            <WizardIdentify
              stripName={selectedStripRef.current?.name ?? selectedStripRef.current?.id ?? "Strip"}
              onBlink={probeStrip}
              value={m.choice}
              onChoose={(v) => dispatch({ type: "choose", value: v })}
            />
          )}
          {showStep && m.step === 3 && (
            <WizardRecognition
              recognition={m.recognition}
              probe={m.probe}
              capabilities={m.capabilities}
              profileId={m.profileId}
              onSend={probeStrip}
              value={m.choice}
              onChoose={(v) => dispatch({ type: "choose", value: v })}
            />
          )}
          {showStep && m.step === 4 && (
            <WizardPower
              onTest={testPower}
              value={m.choice}
              onChoose={(v) => dispatch({ type: "choose", value: v })}
            />
          )}
          {showStep && m.step === 5 && (
            <WizardColour
              index={m.colourAnswers.length}
              onTest={testColour}
              value={m.choice}
              onChoose={(v) => dispatch({ type: "choose", value: v })}
              order={m.order}
            />
          )}
          {showStep && m.step === 6 && (
            <WizardWhite
              value={m.choice}
              onChoose={(v) => dispatch({ type: "choose", value: v })}
            />
          )}
          {showStep && m.step === 7 && (
            <WizardIntensity
              onTest={testIntensity}
              onShow={showLevel}
              onMinChange={(v) => dispatch({ type: "min", value: v })}
              onDiffChange={(v) => dispatch({ type: "diff", value: v })}
              pick={m.pick}
            />
          )}
          {showStep && m.step === 8 && <WizardEffects />}
          {showStep && m.step === 9 && (
            <WizardSummary
              model={m}
              groups={state.snapshot.groups}
              onNameChange={(name) => dispatch({ type: "name", value: name })}
              onGroupChange={(id) => dispatch({ type: "group", id })}
              onCreateGroup={() => setNewGroupOpen(true)}
            />
          )}
        </div>
      </main>

      <footer className="wz-foot">
        <button className="btn btn-ghost" onClick={onBack}>
          <Icon name="chevL" size="sm" />
          {m.step === 1 || backLeavesWizard(m) ? "Cancel" : "Back"}
        </button>
        <div className="row-gap">
          {WZ_SKIP[m.step] && !m.error && (
            <button className="btn btn-ghost" onClick={() => dispatch({ type: "skip" })}>
              Skip
            </button>
          )}
          {showNext && (
            <button
              className="btn btn-primary"
              disabled={!canNext(m)}
              onClick={() => void onNext()}
              data-od-id="wz-next"
            >
              {nextLbl}
              <Icon name={m.step === 9 ? "check" : "chevR"} size="sm" />
            </button>
          )}
        </div>
      </footer>
      {newGroupOpen && (
        <NewGroupSheet
          onClose={() => setNewGroupOpen(false)}
          // the group made here is ticked for the strip being added
          onCreated={(id) => dispatch({ type: "group", id })}
        />
      )}
    </div>
  );
}
