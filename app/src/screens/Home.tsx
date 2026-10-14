import { useState } from "react";
import { PageHead, Presumed, PowerButton, Switch, LinkBadge, RetryButton, colourVar } from "../ui/parts";
import { Icon } from "../ui/Icon";
import { rgbStr } from "../lib/color";
import { profileName } from "../lib/profiles";
import { groupStatus, stripStatus } from "../state/status";
import { presumedOf, useApp } from "../state/store";
import { NewGroupSheet } from "./GroupSheets";
import { TypesSheet, useProfiles } from "./Types";
import type { Link, TargetRef } from "../state/types";
import type { Group, Strip } from "../api";
import type { Go } from "../router";

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function Home({ go }: { go: Go }) {
  const { state, actions } = useApp();
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const types = useProfiles();
  const { strips, groups } = state.snapshot;
  const unavailable = state.unavailable !== null;
  const linkOf = (id: string): Link => state.link[id] ?? "unknown";

  if (!state.loaded) {
    return <PageHead title="Home" sub="Loading…" />;
  }

  const byId = new Map(strips.map((s) => [s.id, s]));
  const grouped = new Set(groups.flatMap((g) => g.members));
  const loose = strips.filter((s) => !grouped.has(s.id));
  const unreachable = strips.filter((s) => linkOf(s.id) === "unreachable").length;

  return (
    <>
      <PageHead
        title={greeting()}
        sub={
          <span className="tnum">
            {strips.length} {strips.length === 1 ? "strip" : "strips"} · {groups.length} {groups.length === 1 ? "group" : "groups"}
            {unreachable ? ` · ${unreachable} unreachable` : ""}
          </span>
        }
        actions={
          <div style={{ display: "flex", gap: "var(--space-2)" }}>
            <button type="button" className="btn btn-primary" onClick={() => go("add")}>
              <Icon name="plus" />
              Add strip
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setNewGroupOpen(true)}>
              <Icon name="plus" />
              New group
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={state.theme === "dark" ? "Use light theme" : "Use dark theme"}
              title={state.theme === "dark" ? "Light theme" : "Dark theme"}
              onClick={() => actions.setTheme(state.theme === "dark" ? "light" : "dark")}
            >
              <Icon name={state.theme === "dark" ? "sun" : "moon"} />
            </button>
          </div>
        }
      />

      {groups.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2 className="t-16 strong">Groups</h2>
          </div>
          <div className="grid-groups">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                members={g.members.map((id) => byId.get(id)).filter((s): s is Strip => !!s)}
                go={go}
              />
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="t-16 strong">Loose strips</h2>
          <span className="muted tnum">{loose.length}</span>
        </div>
        {loose.length > 0 ? (
          <ul className="list card">
            {loose.map((s) => {
              const t: TargetRef = { kind: "strip", id: s.id };
              const p = presumedOf(state, t);
              const link = linkOf(s.id);
              const st = stripStatus(p, link, unavailable);
              const bad = link === "unreachable" || link === "retrying";
              return (
                <li key={s.id} className="srow" style={colourVar(rgbStr(p.h, p.s))}>
                  <button type="button" className="srow-main" aria-label={`Open ${s.name}`} onClick={() => go("strip", s.id)}>
                    <span className={`orb sm ${st.k}`} aria-hidden="true">
                      <Icon name="strip" size="sm" />
                    </span>
                    <span className="srow-txt">
                      <span className="strong">{s.name}</span>
                      <span className="muted t-12">
                        {profileName(s.profile)} · {st.label}
                      </span>
                    </span>
                  </button>
                  {bad ? <RetryButton link={link} onRetry={() => void actions.retry(s.id)} /> : <LinkBadge link={link} />}
                  <Switch
                    on={p.on && link !== "unreachable"}
                    label={`Turn on or off ${s.name}`}
                    disabled={link === "unreachable" || unavailable}
                    onToggle={() => void actions.setPower(t, !p.on)}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="muted">All strips are in a group.</p>
        )}
      </section>

      <button
        type="button"
        className="help-fab"
        aria-label="Supported strip types"
        title="Supported strip types"
        onClick={() => setTypesOpen(true)}
      >
        <Icon name="help" />
      </button>
      {typesOpen && (
        <TypesSheet profiles={types.profiles} error={types.error} onRetry={types.reload} onClose={() => setTypesOpen(false)} />
      )}

      {newGroupOpen && <NewGroupSheet onClose={() => setNewGroupOpen(false)} go={go} />}
    </>
  );
}

function GroupCard({
  group,
  members,
  go,
}: {
  group: Group;
  members: Strip[];
  go: Go;
}) {
  const { state, actions } = useApp();
  const t: TargetRef = { kind: "group", id: group.id };
  const p = presumedOf(state, t);
  const links = members.map((m) => state.link[m.id] ?? "unknown");
  const unavailable = state.unavailable !== null;
  const st = groupStatus(p, links, unavailable);
  return (
    <article className="gcard card" data-state={st.k} style={colourVar(rgbStr(p.h, p.s))}>
      <div className="gcard-top">
        <button
          type="button"
          className="gcard-main"
          aria-label={`Open ${group.name}`}
          onClick={() => go("group", group.id)}
        >
          <span className="orb" aria-hidden="true">
            <Icon name="scenes" />
          </span>
          <span className="gcard-txt">
            <span className="t-20">{group.name}</span>
            <span className="muted tnum">
              {members.length} {members.length === 1 ? "strip" : "strips"} · {p.b}%
            </span>
          </span>
        </button>
        <PowerButton on={p.on && !unavailable} name={group.name} disabled={unavailable} onToggle={() => void actions.setPower(t, !p.on)} />
      </div>
      <div className="mini" aria-hidden="true">
        {members.map((m) => {
          const mp = presumedOf(state, { kind: "strip", id: m.id });
          const ml = state.link[m.id] ?? "unknown";
          return (
            <i
              key={m.id}
              style={colourVar(rgbStr(mp.h, mp.s))}
              className={`${ml === "unreachable" || unavailable ? "unr" : ""} ${!mp.on || !p.on ? "off" : ""}`}
            />
          );
        })}
      </div>
      <div className="gcard-foot">
        <span className="status">
          <span className={`dot ${st.k}`} />
          {st.label}
          {st.k !== "off" && <Presumed withText={false} />}
        </span>
      </div>
    </article>
  );
}
