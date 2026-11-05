import { useState } from "react";
import { Icon } from "../ui/Icon";
import { LinkBadge, RetryButton, StateBlock, Switch, colourVar } from "../ui/parts";
import { rgbStr } from "../lib/color";
import { useT } from "../i18n";
import { presumedOf, useApp } from "../state/store";
import type { Go } from "../router";
import { AddToGroupSheet } from "./GroupSheets";

export function GroupGeneral({ groupId, go }: { groupId: string; go: Go }) {
  // All hooks live here, before any early return
  const { state, actions } = useApp();
  const t = useT().targets;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);

  const group = state.snapshot.groups.find((g) => g.id === groupId);
  if (!group) return null;

  const members = group.members.map((id) => state.snapshot.strips.find((s) => s.id === id)).filter(Boolean) as typeof state.snapshot.strips;
  const unavailable = state.unavailable !== null;
  const selectedIds = members.filter((m) => selected.has(m.id)).map((m) => m.id);
  const allSelected = selectedIds.length === members.length && members.length > 0;
  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(members.map((m) => m.id)));
  };

  const batch = (op: string) => {
    if (op === "on" || op === "off") {
      for (const id of selectedIds) {
        void actions.setPower({ kind: "strip", id }, op === "on");
      }
    } else if (op === "reset") {
      for (const id of selectedIds) {
        void actions.followGroup(id, groupId);
      }
    } else if (op === "remove") {
      void actions.removeFromGroup(groupId, selectedIds).then(() => setSelected(new Set()));
    }
  };

  const reorder = async (stripId: string, delta: number) => {
    const idx = group.members.indexOf(stripId);
    if (idx === -1 || idx + delta < 0 || idx + delta >= group.members.length) return;
    const next = [...group.members];
    [next[idx], next[idx + delta]] = [next[idx + delta], next[idx]];
    await actions.reorderGroup(groupId, next);
  };

  return (
    <>
      <p className="note">
        <Icon name="info" size="sm" />
        <span>
          {t.groupGeneral.note}
        </span>
      </p>

      <div className="toolbar">
        <label className="check">
          <input type="checkbox" checked={allSelected} onChange={selectAll} />
          <span>{t.groupGeneral.all}</span>
        </label>
        <span className={selectedIds.length > 0 ? "muted tnum t-12" : "sr-only"} aria-live="polite">
          {t.groupGeneral.selected(selectedIds.length)}
        </span>
        {selectedIds.length > 0 ? (
          <div className="toolbar-actions">
            <button className="btn btn-secondary btn-tight" onClick={() => batch("on")}>
              {t.common.on}
            </button>
            <button className="btn btn-secondary btn-tight" onClick={() => batch("off")}>
              {t.common.off}
            </button>
            <button className="btn btn-secondary btn-tight" onClick={() => batch("reset")}>
              {t.common.followGroup}
            </button>
            <button className="btn btn-danger btn-tight" onClick={() => batch("remove")}>
              {t.common.remove}
            </button>
          </div>
        ) : (
          <span className="toolbar-spacer" />
        )}
        <button type="button" className="btn btn-ghost btn-tight" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size="sm" />
          {t.common.addStrips}
        </button>
      </div>

      {members.length > 0 ? (
        <ol className="members card" aria-label={t.groupGeneral.listLabel}>
          {members.map((s, i) => {
            const sp = presumedOf(state, { kind: "strip", id: s.id });
            const sl = state.link[s.id] ?? "unknown";
            const isOwn = state.overrides.includes(s.id);
            const inOtherGroups = state.snapshot.groups.filter((g) => g.id !== groupId && g.members.includes(s.id));
            const bad = sl === "unreachable" || sl === "retrying";

            return (
              <li key={s.id} className={`mrow ${selected.has(s.id) ? "is-sel" : ""}`}>
                <div className="mrow-line">
                  <label className="cb-hit">
                    <input
                      type="checkbox"
                      className="cb"
                      checked={selected.has(s.id)}
                      onChange={() => toggleSelect(s.id)}
                      aria-label={t.groupGeneral.select(s.name)}
                    />
                  </label>
                  <button
                    type="button"
                    className={`swatch-btn ${isOwn ? "is-own" : ""}`}
                    style={colourVar(rgbStr(sp.h, sp.s))}
                    onClick={() => go("strip", s.id, { tab: "color", from: groupId })}
                    aria-label={t.groupGeneral.colorOf(s.name, isOwn)}
                    title={t.groupGeneral.stripColor}
                  />
                  <div className="mrow-txt">
                    <button
                      type="button"
                      className="strong link-name"
                      onClick={() => go("strip", s.id, { tab: "general", from: groupId })}
                    >
                      {s.name}
                    </button>
                    <span className="mrow-meta">
                      <LinkBadge link={sl} />
                      {isOwn && <span className="chip">{t.common.ownColor}</span>}
                      {inOtherGroups.map((g) => (
                        <span key={g.id} className="chip chip-group">
                          <Icon name="scenes" size="xs" />
                          {t.groupGeneral.alsoIn(g.name)}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="mrow-end">
                    <div className="mrow-move">
                      <button
                        type="button"
                        className="grip"
                        aria-label={t.groupGeneral.moveUpOf(s.name)}
                        onClick={() => void reorder(s.id, -1)}
                        disabled={i === 0}
                        title={t.groupGeneral.moveUp}
                      >
                        <Icon name="chevU" size="sm" />
                      </button>
                      <button
                        type="button"
                        className="grip"
                        aria-label={t.groupGeneral.moveDownOf(s.name)}
                        onClick={() => void reorder(s.id, 1)}
                        disabled={i === members.length - 1}
                        title={t.groupGeneral.moveDown}
                      >
                        <Icon name="chevD" size="sm" />
                      </button>
                    </div>
                    {bad ? <RetryButton link={sl} onRetry={() => void actions.retry(s.id)} /> : null}
                    <Switch
                      on={sp.on && sl !== "unreachable"}
                      label={t.common.turnOnOff(s.name)}
                      disabled={sl === "unreachable" || unavailable}
                      onToggle={() => void actions.setPower({ kind: "strip", id: s.id }, !sp.on)}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={t.groupGeneral.removeFromGroup(s.name)}
                      onClick={() => void actions.removeFromGroup(groupId, [s.id]).then(() => setSelected(new Set()))}
                    >
                      <Icon name="x" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="card">
          <StateBlock
            icon="strip"
            title={t.groupGeneral.emptyTitle}
            text={t.groupGeneral.emptyText}
            actions={
              <button type="button" className="btn btn-secondary" onClick={() => setAddOpen(true)}>
                <Icon name="plus" size="sm" />
                {t.common.addStrips}
              </button>
            }
          />
        </div>
      )}

      {addOpen && <AddToGroupSheet groupId={groupId} onClose={() => setAddOpen(false)} />}
    </>
  );
}
