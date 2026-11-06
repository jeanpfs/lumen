import { useEffect, useMemo, useState } from "react";
import { Icon } from "../ui/Icon";
import { FxGrid } from "../ui/FxGrid";
import { PanelShell } from "../ui/PanelShell";
import { useT } from "../i18n";
import { useApp } from "../state/store";
import { setLayout, usePanel } from "../state/panels";
import { BASE_FX, MAX_SIDE, emptyLayout, orderedStrips, pruneLayout, walkOrder, type Layout, type Start, type Walk } from "../lib/panel";
import { blink } from "../lib/runner";
import type { Go } from "../router";

/** Biggest square (px) that fits `cols` x `rows` in the builder's stage. */
export const squareSize = (cols: number, rows: number) => Math.max(18, Math.min(70, Math.floor(Math.min(314 / cols, 284 / rows)) - 4));

const fit = (n: number): Layout => {
  const cols = Math.min(MAX_SIDE, Math.max(1, Math.ceil(Math.sqrt(n))));
  return emptyLayout(cols, Math.min(MAX_SIDE, Math.max(1, Math.ceil(n / cols))));
};

type Move = { kind: "place"; cell: number } | { kind: "skip"; id: string };

/** Three steps for one group: how the strips are laid out, where each one is, and the order the light follows. */
export function PanelBuilder({ groupId, go }: { groupId: string; go: Go }) {
  const { state, actions, backend } = useApp();
  const t = useT().panel;
  const tb = t.builder;
  const { layout: saved } = usePanel(groupId);
  const group = state.snapshot.groups.find((g) => g.id === groupId);
  const strips = useMemo(
    () => (group ? group.members.flatMap((id) => state.snapshot.strips.filter((s) => s.id === id)) : []),
    [group, state.snapshot.strips],
  );
  const members = useMemo(() => strips.map((s) => s.id), [strips]);

  const [layout, setL] = useState<Layout>(() => (saved ? pruneLayout(saved, members) : fit(members.length)));
  const [step, setStep] = useState(1);
  const [moves, setMoves] = useState<Move[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [bad, setBad] = useState<Set<string>>(new Set());
  const [again, setAgain] = useState(0);
  const [line, setLine] = useState(() => saved != null && saved.rows === 1 && saved.cols > 1);

  const placed = new Set(layout.cells.filter((c): c is string => c != null));
  const cur = strips.find((s) => !placed.has(s.id) && !skipped.has(s.id));
  const hasRoom = layout.cells.includes(null);
  const done = !cur || !hasRoom;
  const curBad = cur ? bad.has(cur.id) : false;

  // Each strip blinks on its own while it is the one being placed, so the user can find it in the room.
  useEffect(() => {
    if (step !== 2 || !cur) return;
    let live = true;
    void blink(backend.apply, cur.id).then((r) => {
      if (live && r?.unreachable.includes(cur.id)) setBad((b) => new Set(b).add(cur.id));
    });
    return () => {
      live = false;
    };
  }, [step, cur?.id, again, backend]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!group) return null;
  const close = () => go("group", groupId, { tab: "panel" });
  const nameOf = (id: string) => strips.find((s) => s.id === id)?.name ?? id;
  const total = layout.cols * layout.rows;

  const resize = (cols: number, rows: number) => {
    const c = Math.min(MAX_SIDE, Math.max(1, cols));
    const r = Math.min(MAX_SIDE, Math.max(1, rows));
    if (c === layout.cols && r === layout.rows) return;
    const next = emptyLayout(c, r);
    for (let y = 0; y < Math.min(r, layout.rows); y++)
      for (let x = 0; x < Math.min(c, layout.cols); x++) next.cells[y * c + x] = layout.cells[y * layout.cols + x];
    setL({ ...next, start: layout.start, walk: layout.walk });
    setMoves([]);
  };

  const put = (cell: number) => {
    if (!cur || layout.cells[cell] || curBad) return;
    const cells = [...layout.cells];
    cells[cell] = cur.id;
    setL({ ...layout, cells });
    setMoves([...moves, { kind: "place", cell }]);
  };
  const undo = () => {
    const m = moves[moves.length - 1];
    if (!m) return;
    if (m.kind === "place") setL({ ...layout, cells: layout.cells.map((c, i) => (i === m.cell ? null : c)) });
    else setSkipped((s) => new Set([...s].filter((x) => x !== m.id)));
    setMoves(moves.slice(0, -1));
  };
  const skip = () => {
    if (!cur) return;
    setSkipped(new Set(skipped).add(cur.id));
    setMoves([...moves, { kind: "skip", id: cur.id }]);
  };
  const fill = () => {
    const free = layout.cells.flatMap((c, i) => (c ? [] : [i]));
    const cells = [...layout.cells];
    const skip2 = new Set(skipped);
    for (const s of strips) {
      if (placed.has(s.id) || skip2.has(s.id)) continue;
      if (bad.has(s.id)) skip2.add(s.id);
      else if (free.length) cells[free.shift() as number] = s.id;
    }
    setSkipped(skip2);
    setL({ ...layout, cells });
    setMoves([]);
  };

  const save = async () => {
    const rest = members.filter((id) => !placed.has(id));
    setLayout(groupId, layout);
    await actions.reorderGroup(groupId, [...orderedStrips(layout), ...rest]);
    actions.notify(tb.saved);
    close();
  };

  const back = () => (step === 1 ? close() : setStep(step - 1));
  const next = () => (step === 3 ? void save() : setStep(step + 1));
  const rank = new Map(walkOrder(layout).map((cell, k) => [cell, k + 1]));

  const footer = (
    <>
      <button type="button" className="btn btn-ghost" onClick={back}>
        <Icon name="chevL" size="sm" />
        {step === 1 ? t.common.close : t.common.back}
      </button>
      <button type="button" className="btn btn-primary" onClick={next} disabled={(step === 1 && members.length === 0) || (step === 2 && !done)}>
        {step === 3 ? tb.save : t.common.next}
      </button>
    </>
  );

  if (step === 1) {
    // `line` is the user's choice, not "one row": a 2-strip group fits a 2x1 grid too
    const n = members.length;
    const msg = total === n ? tb.perfect(n) : total < n ? tb.fewer(total, n) : tb.more(total, n);
    return (
      <PanelShell step={1} steps={3} stepName={tb.stepFormat} title={tb.q0} onClose={close} footer={footer}>
        <p className="muted wz-sub">{tb.q0sub}</p>
        <div className="px-formats" role="radiogroup">
          <button type="button" role="radio" aria-checked={!line} className="px-format" onClick={() => (setLine(false), setL(fit(n)))}>
            <Icon name="scenes" />
            <span className="strong">{tb.grid}</span>
            <span className="muted t-12">{tb.gridSub}</span>
          </button>
          <button type="button" role="radio" aria-checked={line} className="px-format" onClick={() => (setLine(true), setL(emptyLayout(Math.min(MAX_SIDE, Math.max(1, n)), 1)))}>
            <Icon name="strip" />
            <span className="strong">{tb.line}</span>
            <span className="muted t-12">{tb.lineSub}</span>
          </button>
        </div>
        <div className="px-stage">
          <FxGrid layout={layout} size={squareSize(layout.cols, layout.rows)} isEmpty={() => true} paint={() => false} />
        </div>
        <div className="px-dims">
          <Stepper label={tb.cols} value={layout.cols} onChange={(v) => resize(v, layout.rows)} />
          {!line && <Stepper label={tb.rows} value={layout.rows} onChange={(v) => resize(layout.cols, v)} />}
        </div>
        <div className={`wz-help${total === n ? "" : " px-warn"}`} role="note">
          <Icon name="info" size="sm" />
          <p>{msg}</p>
        </div>
      </PanelShell>
    );
  }

  if (step === 2) {
    const mapped = layout.cells.filter(Boolean).length;
    return (
      <PanelShell step={2} steps={3} stepName={tb.stepPlace} title={done ? tb.allPlaced : curBad && cur ? tb.noSignal(cur.name) : cur ? tb.blinking(cur.name) : ""} onClose={close} footer={footer}>
        <p className="muted wz-sub">{done ? (skipped.size ? tb.skipped(skipped.size) : "") : tb.q1sub}</p>
        <div className="px-stage">
          <FxGrid
            layout={layout}
            size={squareSize(layout.cols, layout.rows)}
            label={(i) => (layout.cells[i] ? nameOf(layout.cells[i] as string).replace(/\D+/g, "") || undefined : undefined)}
            hint={!done && !curBad}
            onCell={put}
            ariaLabel={(i) => (layout.cells[i] ? nameOf(layout.cells[i] as string) : tb.empty)}
          />
        </div>
        <div className="px-progress" aria-label={tb.progress(mapped, Math.min(members.length, total))}>
          <span className="muted tnum">{tb.progress(mapped, Math.min(members.length, total))}</span>
          <div className="progress">
            <i style={{ transform: `scaleX(${Math.min(1, mapped / Math.max(1, Math.min(members.length, total)))})` }} />
          </div>
        </div>
        {curBad && cur && (
          <div className="wz-help px-bad" role="alert">
            <Icon name="alert" size="sm" />
            <p>{tb.noSignalText(cur.name)}</p>
          </div>
        )}
        <div className="chips">
          {!done && (
            <button
              type="button"
              className="chip chip-btn"
              onClick={() => {
                if (cur) setBad((b) => new Set([...b].filter((x) => x !== cur.id)));
                setAgain(again + 1);
              }}
            >
              <Icon name="flash" size="sm" />
              {tb.blinkAgain}
            </button>
          )}
          <button type="button" className="chip chip-btn" onClick={undo} disabled={moves.length === 0}>
            <Icon name="refresh" size="sm" />
            {tb.undo}
          </button>
          {curBad && (
            <button type="button" className="chip chip-btn" onClick={skip}>
              {tb.skip}
            </button>
          )}
          {!done && (
            <button type="button" className="chip chip-btn" onClick={fill}>
              <Icon name="play" size="sm" />
              {tb.fill}
            </button>
          )}
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell step={3} steps={3} stepName={tb.stepOrder} title={tb.q2} onClose={close} footer={footer}>
      <p className="muted wz-sub">{tb.q2sub}</p>
      <div className="px-stage">
        <FxGrid
          layout={layout}
          fx={ORDER_FX}
          size={squareSize(layout.cols, layout.rows)}
          label={(i) => (layout.cells[i] ? rank.get(i) : undefined)}
        />
      </div>
      <div className="px-opts">
        <div className="px-opt">
          <span className="eyebrow">{tb.startAt}</span>
          <div className="px-corners" role="radiogroup" aria-label={tb.startAt}>
            {(["tl", "tr", "bl", "br"] as Start[]).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={layout.start === s} aria-label={tb.corners[s]} className={`px-corner c-${s}`} onClick={() => setL({ ...layout, start: s })}>
                <i />
              </button>
            ))}
          </div>
        </div>
        <div className="px-opt grow">
          <span className="eyebrow">{tb.walk}</span>
          <div className="seg px-seg" role="radiogroup" aria-label={tb.walk}>
            {(["snake", "row", "col"] as Walk[]).map((w) => (
              <button key={w} type="button" role="radio" aria-checked={layout.walk === w} onClick={() => setL({ ...layout, walk: w })}>
                {tb.walks[w]}
              </button>
            ))}
          </div>
        </div>
      </div>
    </PanelShell>
  );
}

const ORDER_FX = { ...BASE_FX, path: "order" as const, trail: 3, speed: 4 };

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="px-dim">
      <span className="eyebrow">{label}</span>
      <div className="px-stepper">
        <button type="button" aria-label={`− ${label}`} onClick={() => onChange(value - 1)} disabled={value <= 1}>
          −
        </button>
        <b className="tnum">{value}</b>
        <button type="button" aria-label={`+ ${label}`} onClick={() => onChange(value + 1)} disabled={value >= MAX_SIDE}>
          +
        </button>
      </div>
    </div>
  );
}
