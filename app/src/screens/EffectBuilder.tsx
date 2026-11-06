import { useEffect, useState } from "react";
import type { Report } from "../api";
import { Icon } from "../ui/Icon";
import { FxGrid } from "../ui/FxGrid";
import { PanelShell } from "../ui/PanelShell";
import { StateBlock, Switch } from "../ui/parts";
import { rgbStr } from "../lib/color";
import { useT, type Messages } from "../i18n";
import { useApp } from "../state/store";
import { saveEffect, usePanel } from "../state/panels";
import { SWATCHES, TEMPLATES, TEMPLATE_FX, pruneLayout, type Act, type Fx, type Layout, type PathKind, type TemplateId } from "../lib/panel";
import { startFx, stopRunning, useRunning } from "../lib/runner";
import { squareSize } from "./PanelBuilder";
import type { Go } from "../router";

type Stage = "template" | "edit" | "draw" | "test";
const PATHS: Exclude<PathKind, "draw">[] = ["order", "rows", "cols", "diag", "spiral", "center", "rand"];
const ACTS: Act[] = ["run", "blink", "all", "fixed"];
const colourName = (fx: Fx, t: Messages["panel"]) => {
  const id = SWATCHES.find((s) => s.h === fx.hue && s.s === fx.sat)?.id ?? "white";
  return t.colours[id as keyof Messages["panel"]["colours"]].toLowerCase();
};

function describe(fx: Fx, t: Messages["panel"]): string {
  const s = t.effect.summary;
  const colour = colourName(fx, t);
  const path = fx.path === "order" ? s.pathOrder : fx.path === "draw" ? s.pathDrawn : t.paths[fx.path].toLowerCase();
  const base = { run: s.run(colour, path, fx.trail, fx.pingPong), blink: s.blink(colour, path), all: s.all(), fixed: s.fixed(colour) }[fx.act];
  return fx.rule ? base + s.rule(fx.n) : base;
}

/** Four screens for one group: pick a template, shape it with a live preview, optionally draw the path, then test it on the strips and save. */
export function EffectBuilder({ groupId, go }: { groupId: string; go: Go }) {
  const { state, actions, backend } = useApp();
  const t = useT().panel;
  const te = t.effect;
  const { layout: saved } = usePanel(groupId);
  const group = state.snapshot.groups.find((g) => g.id === groupId);
  const running = useRunning();
  const [stage, setStage] = useState<Stage>("template");
  const [fx, setFx] = useState<Fx>(TEMPLATE_FX.blank);
  const [name, setName] = useState(te.mine);
  const [paused, setPaused] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  const testKey = `${groupId}:test`;
  const live = running === testKey ? (report ? 2 : 1) : 0;
  // leaving the builder never leaves a test running on the strips
  useEffect(() => () => stopRunning(), []);

  if (!group) return null;
  const close = () => {
    stopRunning();
    go("group", groupId, { tab: "panel" });
  };
  if (!saved) {
    return (
      <PanelShell step={1} steps={3} stepName={te.stepTemplate} title={te.title} onClose={close} footer={null}>
        <StateBlock
          icon="scenes"
          title={te.noLayout}
          text={t.empty.text}
          actions={
            <button type="button" className="btn btn-primary" onClick={() => go("panel", groupId)}>
              {t.empty.build}
            </button>
          }
        />
      </PanelShell>
    );
  }

  const layout: Layout = pruneLayout(saved, group.members);
  const size = squareSize(layout.cols, layout.rows);
  const patch = (p: Partial<Fx>) => setFx({ ...fx, ...p });
  const pick = (id: TemplateId) => {
    setFx(TEMPLATE_FX[id]);
    setName(id === "blank" ? te.mine : te.copy(t.templates[id].name));
    setStage("edit");
  };
  const strobes = fx.act === "blink" || fx.act === "all" || fx.rule;

  const toggleTest = () => {
    if (live) {
      stopRunning();
      return;
    }
    setReport(null);
    startFx({ key: testKey, apply: backend.apply, layout, fx, onReport: setReport });
  };
  const save = () => {
    saveEffect(groupId, name.trim(), fx);
    stopRunning();
    actions.notify(te.saved(name.trim()));
    go("group", groupId, { tab: "panel" });
  };

  if (stage === "template") {
    return (
      <PanelShell
        step={1}
        steps={3}
        stepName={te.stepTemplate}
        title={te.stepTemplate}
        onClose={close}
        footer={
          <button type="button" className="btn btn-ghost" onClick={close}>
            <Icon name="chevL" size="sm" />
            {t.common.back}
          </button>
        }
      >
        <p className="muted wz-sub">{te.templateSub}</p>
        <ul className="px-templates">
          {TEMPLATES.map((id) => (
            <li key={id}>
              <button type="button" className="px-template" onClick={() => pick(id)}>
                <span className="px-thumb">
                  <FxGrid layout={layout} fx={TEMPLATE_FX[id]} size={Math.max(8, Math.min(18, Math.floor(84 / Math.max(layout.cols, layout.rows))))} paused={id === "blank"} />
                </span>
                <span className="px-template-txt">
                  <b>{t.templates[id].name}</b>
                  <span className="muted">{t.templates[id].text}</span>
                </span>
                <Icon name="chevR" size="sm" />
              </button>
            </li>
          ))}
        </ul>
      </PanelShell>
    );
  }

  if (stage === "draw") {
    const at = new Map(fx.draw.map((cell, k) => [cell, k + 1]));
    const drawing: Fx = { ...fx, path: "draw", act: "run", trail: 2, speed: 4 };
    return (
      <PanelShell
        step={2}
        steps={3}
        stepName={te.stepDraw}
        title={te.drawTitle}
        onClose={close}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setStage("edit")}>
              <Icon name="chevL" size="sm" />
              {t.common.back}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={fx.draw.length < 2}
              onClick={() => {
                patch({ path: "draw" });
                setStage("edit");
              }}
            >
              {te.done}
            </button>
          </>
        }
      >
        <p className="muted wz-sub">{te.drawSub}</p>
        <div className="px-stage">
          <FxGrid
            layout={layout}
            fx={drawing}
            size={size}
            isEmpty={(i) => !at.has(i)}
            paint={(i) => at.has(i)}
            label={(i) => at.get(i)}
            onCell={(i) => layout.cells[i] && setFx((f) => (f.draw.includes(i) ? f : { ...f, draw: [...f.draw, i] }))}
            ariaLabel={(i) => t.builder.squareLabel(i + 1)}
          />
        </div>
        <div className="px-progress">
          <span className="strong">{te.drawCount(fx.draw.length)}</span>
          <div className="chips">
            <button type="button" className="chip chip-btn" disabled={fx.draw.length === 0} onClick={() => patch({ draw: fx.draw.slice(0, -1) })}>
              <Icon name="refresh" size="sm" />
              {t.builder.undo}
            </button>
            <button type="button" className="chip chip-btn" disabled={fx.draw.length === 0} onClick={() => patch({ draw: [] })}>
              {te.clear}
            </button>
          </div>
        </div>
        {fx.draw.length < 2 && (
          <div className="wz-help" role="note">
            <Icon name="info" size="sm" />
            <p>{te.drawHelp}</p>
          </div>
        )}
      </PanelShell>
    );
  }

  if (stage === "edit") {
    return (
      <PanelShell
        step={2}
        steps={3}
        stepName={te.stepEdit}
        title={name}
        onClose={close}
        footer={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setStage("template")}>
              <Icon name="chevL" size="sm" />
              {t.common.back}
            </button>
            <button type="button" className="btn btn-primary" disabled={fx.path === "draw" && fx.draw.length < 2} onClick={() => setStage("test")}>
              {te.stepTest}
            </button>
          </>
        }
      >
        <div className="px-stage px-live">
          <FxGrid layout={layout} fx={fx} size={size} paused={paused} />
          <button type="button" className="icon-btn px-pause" aria-label={paused ? te.resume : te.pause} aria-pressed={paused} onClick={() => setPaused(!paused)}>
            <Icon name={paused ? "play" : "pause"} size="sm" />
          </button>
        </div>

        <section className="px-sec">
          <h2 className="t-16 strong">
            <i>1</i>
            {te.q1}
          </h2>
          <div className="px-paths">
            {PATHS.map((p) => (
              <button key={p} type="button" className="px-path" aria-pressed={fx.path === p} onClick={() => patch({ path: p })}>
                <FxGrid layout={layout} fx={{ ...fx, path: p, act: "run", rule: false, speed: 5, trail: 3 }} size={Math.max(7, Math.min(12, Math.floor(48 / Math.max(layout.cols, layout.rows))))} />
                <span>{t.paths[p]}</span>
              </button>
            ))}
            <button type="button" className="px-path px-draw" aria-pressed={fx.path === "draw"} onClick={() => setStage("draw")}>
              <Icon name="edit" size="lg" />
              <span>{te.drawOwn}</span>
            </button>
          </div>
        </section>

        <section className="px-sec">
          <h2 className="t-16 strong">
            <i>2</i>
            {te.q2}
          </h2>
          <div className="px-acts">
            {ACTS.map((a) => (
              <button key={a} type="button" className="px-act" aria-pressed={fx.act === a} onClick={() => patch({ act: a })}>
                <b>{te.acts[a].name}</b>
                <span className="muted t-12">{te.acts[a].text}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="px-sec">
          <h2 className="t-16 strong">
            <i>3</i>
            {te.q3}
          </h2>
          <div className="sw-row" role="radiogroup" aria-label={te.q3}>
            {SWATCHES.map((s) => (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={fx.hue === s.h && fx.sat === s.s}
                aria-label={t.colours[s.id as keyof typeof t.colours]}
                className="sw-btn"
                style={{ ["--c" as string]: rgbStr(s.h, s.s) }}
                aria-pressed={fx.hue === s.h && fx.sat === s.s}
                onClick={() => patch({ hue: s.h, sat: s.s })}
              />
            ))}
          </div>
          <div className="px-speed">
            <span className="muted t-12">{te.slow}</span>
            <input
              className="range"
              type="range"
              min={1}
              max={10}
              value={fx.speed}
              aria-label={`${te.slow} – ${te.fast}`}
              style={{ ["--p" as string]: `${((fx.speed - 1) / 9) * 100}%` }}
              onChange={(e) => patch({ speed: Number(e.target.value) })}
            />
            <span className="muted t-12">{te.fast}</span>
          </div>
        </section>

        <details className="card px-more" open={fx.rule}>
          <summary>{te.more}</summary>
          <div className="px-more-in">
            <div className="px-row">
              <div>
                <div className="strong">{te.rule}</div>
                <small className="muted">{fx.rule ? te.ruleOn(fx.n + 1) : te.ruleOff}</small>
              </div>
              <Switch on={fx.rule} label={te.rule} onToggle={() => patch({ rule: !fx.rule })} />
            </div>
            {fx.rule && <NumRow label={te.every} value={fx.n} min={1} max={8} onChange={(n) => patch({ n })} />}
            {(fx.act === "run" || fx.act === "blink") && (
              <>
                <NumRow label={te.trail} value={fx.trail} min={1} max={8} onChange={(trail) => patch({ trail })} />
                <div className="px-row">
                  <span>{te.pingPong}</span>
                  <Switch on={fx.pingPong} label={te.pingPong} onToggle={() => patch({ pingPong: !fx.pingPong })} />
                </div>
              </>
            )}
          </div>
        </details>
      </PanelShell>
    );
  }

  const missing = report?.unreachable.length ?? 0;
  return (
    <PanelShell
      step={3}
      steps={3}
      stepName={te.stepTest}
      title={te.stepTest}
      onClose={close}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={() => setStage("edit")}>
            <Icon name="chevL" size="sm" />
            {te.adjust}
          </button>
          <button type="button" className="btn btn-primary" disabled={!name.trim()} onClick={save}>
            {te.save}
          </button>
        </>
      }
    >
      <div className={`px-stage px-live${live === 2 ? " is-live" : ""}`}>
        <span className={`badge px-badge${live === 2 ? " badge-live" : ""}`}>
          <span className="dot" />
          {live === 2 ? te.badgeRunning : live === 1 ? te.badgeSending : te.badgePreview}
        </span>
        <FxGrid layout={layout} fx={fx} size={size} />
      </div>
      <p className="t-16">{describe(fx, t)}</p>
      {strobes && (
        <div className="wz-help px-warn" role="note">
          <Icon name="alert" size="sm" />
          <p>{te.flashWarn}</p>
        </div>
      )}
      <div className="card px-test">
        <div>
          <b className="strong">{live === 2 ? te.running : live === 1 ? te.testing(layout.cells.filter(Boolean).length) : te.testTitle}</b>
          <p className="muted t-12">{live === 2 ? te.runningText : live === 1 ? "" : te.testText}</p>
          {live > 0 && report && <p className="muted t-12">{te.testingText(missing)}</p>}
        </div>
        <button type="button" className="btn btn-secondary" onClick={toggleTest}>
          <Icon name="flash" size="sm" />
          {live ? te.stopTest : te.testBtn}
        </button>
      </div>
      <label className="field-l">
        <span className="strong">{te.name}</span>
        <input className="field" maxLength={24} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
    </PanelShell>
  );
}

function NumRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="px-row">
      <span>{label}</span>
      <div className="px-stepper">
        <button type="button" aria-label={`− ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          −
        </button>
        <b className="tnum">{value}</b>
        <button type="button" aria-label={`+ ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}
