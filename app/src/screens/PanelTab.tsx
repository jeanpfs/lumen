import { Icon } from "../ui/Icon";
import { FxGrid } from "../ui/FxGrid";
import { StateBlock } from "../ui/parts";
import { useT } from "../i18n";
import { useApp } from "../state/store";
import { deleteEffect, usePanel } from "../state/panels";
import { TEMPLATES, TEMPLATE_FX, pruneLayout, type Fx } from "../lib/panel";
import { startFx, stopRunning, useRunning } from "../lib/runner";
import type { Go } from "../router";

const miniSize = (cols: number, rows: number) => Math.max(8, Math.min(14, Math.floor(64 / Math.max(cols, rows))));

/** The group as a panel: the squares, the effects to play on it, and the way into the builders. */
export function PanelTab({ groupId, go }: { groupId: string; go: Go }) {
  const { state, backend } = useApp();
  const t = useT().panel;
  const { layout: saved, effects } = usePanel(groupId);
  const running = useRunning();
  const group = state.snapshot.groups.find((g) => g.id === groupId);
  if (!group) return null;

  if (!saved) {
    return (
      <StateBlock
        icon="scenes"
        title={t.empty.title}
        text={t.empty.text}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => go("panel", groupId)}>
            {t.empty.build}
          </button>
        }
      />
    );
  }

  const layout = pruneLayout(saved, group.members);
  const strips = layout.cells.filter(Boolean).length;
  const list: { id: string; name: string; text: string; fx: Fx; mine?: boolean }[] = [
    ...effects.map((e) => ({ id: e.id, name: e.name, text: t.paths[e.fx.path], fx: e.fx, mine: true })),
    ...TEMPLATES.filter((id) => id !== "blank").map((id) => ({ id, name: t.templates[id].name, text: t.paths[TEMPLATE_FX[id].path], fx: TEMPLATE_FX[id] })),
  ];
  const keyOf = (id: string) => `${groupId}:${id}`;
  const playing = list.find((e) => running === keyOf(e.id));
  const toggle = (e: (typeof list)[number]) => (playing?.id === e.id ? stopRunning() : startFx({ key: keyOf(e.id), apply: backend.apply, layout, fx: e.fx }));

  return (
    <div className="px-tab">
      <div className="card px-hero">
        <div className="px-stage">
          <FxGrid layout={layout} fx={playing?.fx} size={Math.max(18, Math.min(56, Math.floor(260 / Math.max(layout.cols, layout.rows))))} />
        </div>
        <div className="px-hero-bar">
          <span className="muted tnum">{t.squares(layout.cols * layout.rows, strips)}</span>
          {playing ? (
            <button type="button" className="btn btn-secondary btn-tight" onClick={stopRunning}>
              <Icon name="x" size="sm" />
              {t.stop}
            </button>
          ) : (
            <button type="button" className="btn btn-secondary btn-tight" onClick={() => go("panel", groupId)}>
              <Icon name="sliders" size="sm" />
              {t.adjust}
            </button>
          )}
        </div>
        {playing && <p className="status px-now">{t.playing(playing.name)}</p>}
      </div>

      <div className="section-head">
        <h2 className="t-16 strong">{t.effects}</h2>
        <button type="button" className="btn btn-primary btn-tight" onClick={() => go("effect", groupId)}>
          <Icon name="plus" size="sm" />
          {t.createEffect}
        </button>
      </div>
      <ul className="px-fxlist">
        {list.map((e) => (
          <li key={e.id} className={`px-fx${playing?.id === e.id ? " on" : ""}`}>
            <button type="button" className="px-fx-main" aria-pressed={playing?.id === e.id} aria-label={t.play(e.name)} onClick={() => toggle(e)}>
              <FxGrid layout={layout} fx={e.fx} size={miniSize(layout.cols, layout.rows)} />
              <span className="strong">{e.name}</span>
              <span className="muted t-12">{e.text}</span>
            </button>
            {e.mine && (
              <>
                <span className="badge px-tag">{t.yours}</span>
                <button type="button" className="icon-btn icon-btn-danger px-del" aria-label={t.deleteEffect(e.name)} onClick={() => deleteEffect(groupId, e.id)}>
                  <Icon name="trash" size="sm" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
