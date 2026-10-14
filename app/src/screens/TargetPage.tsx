import { useState, type FormEvent } from "react";
import { Icon } from "../ui/Icon";
import { PowerButton, Presumed, StateBlock } from "../ui/parts";
import { Sheet } from "../ui/Sheet";
import { rgbStr } from "../lib/color";
import { presumedOf, useApp } from "../state/store";
import { findTarget, targetStatus } from "../state/targets";
import type { TargetRef } from "../state/types";
import type { Go, Tab } from "../router";
import { ColorTab } from "./Color";
import { ModesTab } from "./Modes";
import { GroupGeneral } from "./GroupGeneral";
import { StripGeneral } from "./StripGeneral";

const TABS: [Tab, string][] = [
  ["general", "General"],
  ["color", "Color"],
  ["modes", "Modes"],
];

/** One group or one strip: fixed header, tabs General · Color · Modes. The target is whatever the route says. */
export function TargetPage({ target, tab, from, go }: { target: TargetRef; tab: Tab; from?: string; go: Go }) {
  const { state, actions } = useApp();
  const [renaming, setRenaming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [name, setName] = useState("");
  const found = findTarget(state.snapshot, target);
  const isGroup = target.kind === "group";
  const fromGroup = from ? state.snapshot.groups.find((g) => g.id === from) : undefined;
  const back = () => {
    if (from && !fromGroup) {
      // the "from" group was deleted; fall back to home
      go("home");
    } else if (from) {
      go("group", from);
    } else {
      go("home");
    }
  };
  const backLabel = from && fromGroup ? `Back to ${fromGroup.name}` : "Home";

  if (!state.loaded) return null;
  if (!found) {
    return (
      <StateBlock
        icon="strip"
        title="Not found"
        text={isGroup ? "This group no longer exists." : "This strip no longer exists."}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => go("home")}>
            Back to Home
          </button>
        }
      />
    );
  }

  const p = presumedOf(state, target);
  const st = targetStatus(state, target);
  const unavailable = state.unavailable !== null;
  const noun = isGroup ? "group" : "strip";
  const onRename = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === found.name) return;
    await (isGroup ? actions.renameGroup(target.id, trimmed) : actions.renameStrip(target.id, trimmed));
    setRenaming(false);
  };
  const onRemove = async () => {
    setRemoving(false);
    const success = await (isGroup ? actions.deleteGroup(target.id) : actions.removeStrip(target.id));
    if (success) go("home");
  };

  return (
    <>
      <button type="button" className="back" onClick={back}>
        <Icon name="chevL" size="sm" />
        {backLabel}
      </button>

      <div className="group-hero card" style={{ ["--c" as string]: rgbStr(p.h, p.s) }} data-state={st.k}>
        <span className="orb lg" aria-hidden="true">
          <Icon name={isGroup ? "scenes" : "strip"} size="lg" />
        </span>
        <div className="group-hero-txt">
          <div className="title-row">
            <h1 className="t-28" tabIndex={-1}>
              {found.name}
            </h1>
            <button
              type="button"
              className="icon-btn"
              aria-label="Rename"
              title={`Rename ${noun}`}
              onClick={() => {
                setName(found.name);
                setRenaming(true);
              }}
            >
              <Icon name="edit" size="sm" />
            </button>
            <button type="button" className="icon-btn icon-btn-danger" aria-label={isGroup ? "Delete group" : "Remove strip"} title={isGroup ? "Delete group" : "Remove strip"} onClick={() => setRemoving(true)}>
              <Icon name="trash" size="sm" />
            </button>
          </div>
          <p className="muted">
            {isGroup && (
              <>
                <span className="tnum">
                  {found.members.length} strip{found.members.length === 1 ? "" : "s"}
                </span>{" "}
                ·{" "}
              </>
            )}
            <span className={`dot ${st.k}`} /> {st.label} <Presumed />
          </p>
        </div>
        <PowerButton
          on={p.on && !unavailable}
          name={found.name}
          disabled={unavailable}
          onToggle={() => void actions.setPower(target, !p.on)}
        />
      </div>

      <div className="tabs" role="tablist" aria-label={`Sections of ${found.name}`}>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-controls={`tabpanel-${id}`}
            className="tab"
            aria-selected={tab === id}
            onClick={() => go(target.kind, target.id, { tab: id, from })}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "general" && isGroup && (
        <div role="tabpanel" id="tabpanel-general" aria-labelledby="tab-general">
          <GroupGeneral groupId={target.id} go={go} />
        </div>
      )}
      {tab === "general" && !isGroup && (
        <div role="tabpanel" id="tabpanel-general" aria-labelledby="tab-general">
          <StripGeneral stripId={target.id} go={go} />
        </div>
      )}
      {tab === "color" && (
        <div role="tabpanel" id="tabpanel-color" aria-labelledby="tab-color">
          <ColorTab target={target} fromGroup={from} />
        </div>
      )}
      {tab === "modes" && (
        <div role="tabpanel" id="tabpanel-modes" aria-labelledby="tab-modes">
          <ModesTab target={target} />
        </div>
      )}

      {renaming && (
        <Sheet title={`Rename ${noun}`} onClose={() => setRenaming(false)}>
          <form className="sheet-form" onSubmit={(e) => void onRename(e)}>
            <label className="field-l">
              <span className="strong">New name</span>
              <input className="field" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </label>
            <div className="sheet-foot">
              <button type="button" className="btn btn-ghost" onClick={() => setRenaming(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={!name.trim() || name.trim() === found.name}>
                Save
              </button>
            </div>
          </form>
        </Sheet>
      )}

      {removing && (
        <Sheet
          title={isGroup ? "Delete group?" : `Remove ${found.name}?`}
          sub={isGroup ? "The strips stay in the app; they just leave the group." : "It stops showing up on Home and in groups."}
          onClose={() => setRemoving(false)}
        >
          <div className="sheet-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setRemoving(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void onRemove()}>
              {isGroup ? "Delete group" : "Remove strip"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}
