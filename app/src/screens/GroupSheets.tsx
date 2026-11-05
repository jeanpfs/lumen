import { useState, type FormEvent } from "react";
import { Sheet } from "../ui/Sheet";
import { colourVar } from "../ui/parts";
import { useT } from "../i18n";
import { rgbStr } from "../lib/color";
import { presumedOf, useApp } from "../state/store";
import type { Strip } from "../api";
import type { Go } from "../router";

function PickList({
  strips,
  picked,
  onToggle,
}: {
  strips: Strip[];
  picked: Set<string>;
  onToggle: (id: string) => void;
}) {
  const { state } = useApp();
  const t = useT().targets;
  return (
    <ul className="pick-list">
      {strips.map((s) => {
        const p = presumedOf(state, { kind: "strip", id: s.id });
        const where = state.snapshot.groups.filter((g) => g.members.includes(s.id)).map((g) => g.name);
        return (
          <li key={s.id}>
            <label className="pick">
              <input type="checkbox" checked={picked.has(s.id)} onChange={() => onToggle(s.id)} />
              <span className="sw" style={colourVar(rgbStr(p.h, p.s))} />
              <span className="pick-txt">
                {s.name}
                <span className="muted t-12">{where.join(", ") || t.common.noGroup}</span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function usePicked() {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return [picked, toggle] as const;
}

export function NewGroupSheet({
  onClose,
  go,
  onCreated,
}: {
  onClose: () => void;
  go?: Go;
  /** Called with the new group's id (the wizard uses it to tick the group). */
  onCreated?: (id: string) => void;
}) {
  const { state, actions } = useApp();
  const t = useT().targets;
  const [name, setName] = useState("");
  const [picked, toggle] = usePicked();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    // keep the order the strips have on screen, not the order they were ticked
    const ids = state.snapshot.strips.filter((s) => picked.has(s.id)).map((s) => s.id);
    const id = await actions.createGroup(trimmed, ids);
    setBusy(false);
    if (id === null) return; // the store already told the user what failed
    actions.notify(t.groupSheets.created(trimmed));
    onClose();
    onCreated?.(id);
    go?.("group", id);
  };

  return (
    <Sheet title={t.common.newGroup} sub={t.groupSheets.newGroupSub} onClose={onClose}>
      <form className="sheet-form" onSubmit={(e) => void submit(e)}>
        <label className="field-l">
          <span className="strong">{t.groupSheets.name}</span>
          <input
            className="field"
            name="name"
            required
            maxLength={24}
            placeholder={t.groupSheets.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <PickList strips={state.snapshot.strips} picked={picked} onToggle={toggle} />
        <div className="sheet-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {t.groupSheets.createGroup}
          </button>
        </div>
      </form>
    </Sheet>
  );
}

export function AddToGroupSheet({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const { state, actions } = useApp();
  const group = state.snapshot.groups.find((g) => g.id === groupId);
  const [picked, toggle] = usePicked();
  const [busy, setBusy] = useState(false);
  const t = useT().targets;
  if (!group) return null;
  const rest = state.snapshot.strips.filter((s) => !group.members.includes(s.id));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (picked.size === 0 || busy) return;
    setBusy(true);
    const ids = rest.filter((s) => picked.has(s.id)).map((s) => s.id);
    await actions.addToGroup(groupId, ids);
    setBusy(false);
    actions.notify(t.groupSheets.added(ids.length, group.name));
    onClose();
  };

  return (
    <Sheet title={t.groupSheets.addStripsTo(group.name)} sub={t.groupSheets.addSub} onClose={onClose}>
      <form className="sheet-form" onSubmit={(e) => void submit(e)}>
        {rest.length > 0 ? (
          <PickList strips={rest} picked={picked} onToggle={toggle} />
        ) : (
          <p className="muted">{t.groupSheets.allAlreadyIn}</p>
        )}
        <div className="sheet-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t.common.cancel}
          </button>
          <button className="btn btn-primary" type="submit" disabled={picked.size === 0 || busy}>
            {t.common.add}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
