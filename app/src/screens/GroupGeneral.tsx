import { useState } from "react";
import { Icon } from "../ui/Icon";
import { LinkBadge, RetryButton, StateBlock, Switch, colourVar } from "../ui/parts";
import { rgbStr } from "../lib/color";
import { presumedOf, useApp } from "../state/store";
import type { Go } from "../router";
import { AddToGroupSheet } from "./GroupSheets";

export function GroupGeneral({ groupId, go }: { groupId: string; go: Go }) {
  // All hooks live here, before any early return
  const { state, actions } = useApp();
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
          Groups have no strip limit. Up to 6 stay connected live; the others receive commands in turn.
        </span>
      </p>

      <div className="toolbar">
        <label className="check">
          <input type="checkbox" checked={allSelected} onChange={selectAll} />
          <span>All</span>
        </label>
        <span className={selectedIds.length > 0 ? "muted tnum t-12" : "sr-only"} aria-live="polite">
          {selectedIds.length} selected
        </span>
        {selectedIds.length > 0 ? (
          <div className="toolbar-actions">
            <button className="btn btn-secondary btn-tight" onClick={() => batch("on")}>
              On
            </button>
            <button className="btn btn-secondary btn-tight" onClick={() => batch("off")}>
              Off
            </button>
            <button className="btn btn-secondary btn-tight" onClick={() => batch("reset")}>
              Follow group
            </button>
            <button className="btn btn-danger btn-tight" onClick={() => batch("remove")}>
              Remove
            </button>
          </div>
        ) : (
          <span className="toolbar-spacer" />
        )}
        <button type="button" className="btn btn-ghost btn-tight" onClick={() => setAddOpen(true)}>
          <Icon name="plus" size="sm" />
          Add strips
        </button>
      </div>

      {members.length > 0 ? (
        <ol className="members card" aria-label="Strips in group, in order">
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
                      aria-label={`Select ${s.name}`}
                    />
                  </label>
                  <button
                    type="button"
                    className={`swatch-btn ${isOwn ? "is-own" : ""}`}
                    style={colourVar(rgbStr(sp.h, sp.s))}
                    onClick={() => go("strip", s.id, { tab: "color", from: groupId })}
                    aria-label={`Color of ${s.name}: ${isOwn ? "own color" : "follows the group"}. Open`}
                    title="This strip's color"
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
                      {isOwn && <span className="chip">Own color</span>}
                      {inOtherGroups.map((g) => (
                        <span key={g.id} className="chip chip-group">
                          <Icon name="scenes" size="xs" />
                          also in {g.name}
                        </span>
                      ))}
                    </span>
                  </div>
                  <div className="mrow-end">
                    <div className="mrow-move">
                      <button
                        type="button"
                        className="grip"
                        aria-label={`Move ${s.name} up`}
                        onClick={() => void reorder(s.id, -1)}
                        disabled={i === 0}
                        title="Move up"
                      >
                        <Icon name="chevU" size="sm" />
                      </button>
                      <button
                        type="button"
                        className="grip"
                        aria-label={`Move ${s.name} down`}
                        onClick={() => void reorder(s.id, 1)}
                        disabled={i === members.length - 1}
                        title="Move down"
                      >
                        <Icon name="chevD" size="sm" />
                      </button>
                    </div>
                    {bad ? <RetryButton link={sl} onRetry={() => void actions.retry(s.id)} /> : null}
                    <Switch
                      on={sp.on && sl !== "unreachable"}
                      label={`Turn on or off ${s.name}`}
                      disabled={sl === "unreachable" || unavailable}
                      onToggle={() => void actions.setPower({ kind: "strip", id: s.id }, !sp.on)}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Remove ${s.name} from group`}
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
            title="Empty group"
            text="Add strips to control this room."
            actions={
              <button type="button" className="btn btn-secondary" onClick={() => setAddOpen(true)}>
                <Icon name="plus" size="sm" />
                Add strips
              </button>
            }
          />
        </div>
      )}

      {addOpen && <AddToGroupSheet groupId={groupId} onClose={() => setAddOpen(false)} />}
    </>
  );
}
