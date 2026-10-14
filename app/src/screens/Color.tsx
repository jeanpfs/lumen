import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Icon } from "../ui/Icon";
import { RetryButton, colourVar } from "../ui/parts";
import { clamp, hexToHsv, hsvHex, hsvToRgb, protoB, protoS, rgbStr } from "../lib/color";
import { presumedOf, useApp } from "../state/store";
import { type TargetRef } from "../state/types";

const PRESETS = [
  { n: "Amber", h: 28, s: 78 },
  { n: "Warm white", h: 34, s: 32 },
  { n: "Cool white", h: 210, s: 8 },
  { n: "Red", h: 0, s: 100 },
  { n: "Orange", h: 18, s: 95 },
  { n: "Green", h: 130, s: 85 },
  { n: "Cyan", h: 186, s: 80 },
  { n: "Blue", h: 225, s: 90 },
  { n: "Violet", h: 265, s: 72 },
  { n: "Pink", h: 325, s: 58 },
];

function drawWheel(cv: HTMLCanvasElement) {
  const size = cv.clientWidth;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const n = Math.round(size * dpr);
  if (n <= 0) return;
  cv.width = cv.height = n;
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(n, n);
  const r = n / 2;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - r + 0.5;
      const dy = y - r + 0.5;
      const d = Math.hypot(dx, dy);
      if (d > r) continue;
      const i = (y * n + x) * 4;
      const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
      const [cr, cg, cb] = hsvToRgb(h, Math.min(1, d / r), 1);
      img.data[i] = cr;
      img.data[i + 1] = cg;
      img.data[i + 2] = cb;
      img.data[i + 3] = Math.round(clamp(r - d, 0, 1) * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
}

export function ColorTab({ target, fromGroup }: { target: TargetRef; fromGroup?: string }) {
  const { state, actions } = useApp();
  const p = presumedOf(state, target);

  const wheelRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hex, setHex] = useState(hsvHex(p.h, p.s));
  const [hexFocused, setHexFocused] = useState(false);

  useEffect(() => {
    const el = wheelRef.current;
    const cv = canvasRef.current;
    if (!el || !cv) return;
    const redraw = () => {
      setSize(el.clientWidth);
      drawWheel(cv);
    };
    redraw();
    const ro = new ResizeObserver(redraw);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!hexFocused) setHex(hsvHex(p.h, p.s));
  }, [p.h, p.s, hexFocused]);

  const groupsOfStrip = target.kind === "strip" ? state.snapshot.groups.filter((g) => g.members.includes(target.id)) : [];
  const preferredGroup = fromGroup && groupsOfStrip.some((g) => g.id === fromGroup) ? fromGroup : groupsOfStrip[0]?.id;
  const isOwn = target.kind === "strip" && state.overrides.includes(target.id);
  
  // F3: determine if unreachable/retrying
  const isUnreachable = target.kind === "strip" 
    ? (state.link[target.id] === "unreachable" || state.link[target.id] === "retrying")
    : state.snapshot.groups.find((g) => g.id === target.id)?.members.some((m) => state.link[m] === "unreachable" || state.link[m] === "retrying");

  // group page: every member, and which of them keep a color of their own
  const members = target.kind === "group" ? (state.snapshot.groups.find((g) => g.id === target.id)?.members ?? []) : [];
  const ownMembers = members.filter((id) => state.overrides.includes(id));
  const applyToAll = () => {
    if (target.kind !== "group") return;
    // followGroup drops the strip's own color and sends it the group's color and brightness
    for (const id of ownMembers) actions.followGroup(id, target.id);
    actions.notify(ownMembers.length === 1 ? "Group color applied to the strip" : `Group color applied to ${ownMembers.length} strips`);
  };

  const set = (h: number, s: number) => {
    if (target.kind === "strip" && groupsOfStrip.length > 0 && !isOwn) {
      actions.setStripOwnColour(target.id, Math.round(h), Math.round(s));
    } else {
      actions.setColour(target, Math.round(h), Math.round(s));
    }
  };
  const ensureOwnColour = () => {
    if (target.kind === "strip" && groupsOfStrip.length > 0 && !isOwn) {
      actions.setStripOwnColour(target.id, Math.round(p.h), Math.round(p.s));
    }
  };

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const b = e.currentTarget.getBoundingClientRect();
    const r = b.width / 2;
    const dx = e.clientX - b.left - r;
    const dy = e.clientY - b.top - r;
    const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
    set(h, Math.min(1, Math.hypot(dx, dy) / r) * 100);
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    pick(e);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    void actions.flush();
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 10 : 2;
    const m: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const d = m[e.key];
    if (!d) return;
    e.preventDefault();
    set((p.h + d[0] + 360) % 360, clamp(p.s + d[1], 0, 100));
  };

  const r = size / 2;
  const a = ((p.h - 90) * Math.PI) / 180;
  const dist = (p.s / 100) * r;
  const markerStyle = {
    left: `${r + Math.cos(a) * dist}px`,
    top: `${r + Math.sin(a) * dist}px`,
    ["--c" as string]: rgbStr(p.h, p.s),
  };

  return (
    <>
      {isUnreachable && (
        <div className="result result-warn">
          <p>{target.kind === "strip" ? "Can't reach the strip. Commands are queued." : "A strip in the group can't be reached."}</p>
          {target.kind === "strip" ? (
            <RetryButton link={state.link[target.id] ?? "unknown"} onRetry={() => void actions.retry(target.id)} />
          ) : (
            <button type="button" className="btn btn-secondary btn-tight" onClick={() => {
              const unreach = state.snapshot.groups.find((g) => g.id === target.id)?.members.filter((m) => state.link[m] === "unreachable" || state.link[m] === "retrying") || [];
              for (const m of unreach) void actions.retry(m);
            }}>
              <Icon name="refresh" size="sm" />
              Try again
            </button>
          )}
        </div>
      )}
      {target.kind === "group" && ownMembers.length > 0 && (
        <div className="apply-all card">
          <div className="apply-all-txt">
            <span className="strong">Apply to all strips</span>
            <span className="muted t-12">
              {`${ownMembers.length} ${ownMembers.length === 1 ? "strip has" : "strips have"} a saved color of their own. This replaces it with the group's color and brightness.`}
            </span>
          </div>
          <button type="button" className="btn btn-secondary" onClick={applyToAll}>
            <Icon name="palette" size="sm" />
            Apply to all
          </button>
        </div>
      )}
      {groupsOfStrip.length > 0 && (
        <div className="seg seg-sm follow-seg" role="radiogroup" aria-label="Where this strip's color comes from">
          <button type="button" role="radio" aria-checked={!isOwn} onClick={() => preferredGroup && actions.followGroup(target.id, preferredGroup)}>
            Follow group
          </button>
          <button type="button" role="radio" aria-checked={isOwn} onClick={() => actions.setStripOwnColour(target.id, p.h, p.s)}>
            Own color
          </button>
        </div>
      )}
      <div className="color-grid">
        <section className="card wheel-card">
          <div
            ref={wheelRef}
            className={`wheel-wrap ${dragging ? "is-drag" : ""}`}
            tabIndex={0}
            role="slider"
            aria-label="Color wheel. Left and right arrows change the hue; up and down, the saturation."
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={p.h}
            aria-valuetext={`Hue ${p.h}°, saturation ${p.s}%`}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onKeyDown={key}
          >
            <canvas ref={canvasRef} aria-hidden="true" />
            <span className="wheel-marker" aria-hidden="true" style={markerStyle} />
          </div>
        </section>

        <div className="color-side">
          <section className="card card-pad">
            <div className="ctl-head">
              <label htmlFor="rng-b" className="strong">
                Brightness
              </label>
              <output className="t-20 tnum">{p.b}%</output>
            </div>
            <input
              id="rng-b"
              type="range"
              className="range range-live"
              min={3}
              max={100}
              step={1}
              value={p.b}
              aria-valuetext={`${p.b}%`}
              style={{ ["--p" as string]: `${((p.b - 3) / 97) * 100}%` }}
              onChange={(e) => {
                ensureOwnColour();
                actions.setBrightness(target, Number(e.target.value));
              }}
              onPointerUp={() => void actions.flush()}
              onKeyUp={() => void actions.flush()}
            />
          </section>

          <section className="card card-pad">
            <h2 className="eyebrow">Presets</h2>
            <div className="sw-row">
              {PRESETS.map((c) => (
                <button
                  key={c.n}
                  type="button"
                  className="sw-btn"
                  style={colourVar(rgbStr(c.h, c.s))}
                  aria-label={c.n}
                  title={c.n}
                  onClick={() => {
                    set(c.h, c.s);
                    void actions.flush();
                  }}
                />
              ))}
            </div>
            <div className="ctl-head fav-head">
              <h2 className="eyebrow">Favorites</h2>
              <button type="button" className="btn btn-ghost btn-tight" onClick={() => actions.saveFavourite(p.h, p.s)}>
                <Icon name="star" size="sm" />
                Save current color
              </button>
            </div>
            <div className="sw-row">
              {state.favourites.length > 0 ? (
                state.favourites.map((c, i) => (
                  <button
                    key={`${c.h}-${c.s}-${i}`}
                    type="button"
                    className="sw-btn"
                    style={colourVar(rgbStr(c.h, c.s))}
                    aria-label={`Favorite ${i + 1}: ${hsvHex(c.h, c.s)}`}
                    onClick={() => {
                      set(c.h, c.s);
                      void actions.flush();
                    }}
                  />
                ))
              ) : (
                <span className="muted t-12">No favorites yet.</span>
              )}
            </div>
          </section>

          <section className="card card-pad values">
            <div className="val">
              <label htmlFor="in-h" className="eyebrow">
                Hue
              </label>
              <div className="val-in">
                <input
                  id="in-h"
                  type="number"
                  min={0}
                  max={360}
                  value={p.h}
                  className="num-in tnum"
                  onChange={(e) => set(clamp(Number(e.target.value) || 0, 0, 360), p.s)}
                  onBlur={() => void actions.flush()}
                />
                <span className="muted">°</span>
              </div>
            </div>
            <div className="val">
              <label htmlFor="in-s" className="eyebrow">
                Saturation
              </label>
              <div className="val-in">
                <input
                  id="in-s"
                  type="number"
                  min={0}
                  max={100}
                  value={p.s}
                  className="num-in tnum"
                  onChange={(e) => set(p.h, clamp(Number(e.target.value) || 0, 0, 100))}
                  onBlur={() => void actions.flush()}
                />
                <span className="muted">%</span>
              </div>
            </div>
            <div className="val">
              <label htmlFor="in-hex" className="eyebrow">
                Hex
              </label>
              <div className="val-in">
                <input
                  id="in-hex"
                  type="text"
                  value={hex}
                  maxLength={7}
                  spellCheck={false}
                  className="num-in mono hex-in"
                  onFocus={() => setHexFocused(true)}
                  onChange={(e) => {
                    setHex(e.target.value);
                    const c = hexToHsv(e.target.value);
                    if (c) {
                      set(c.h, c.s);
                    }
                  }}
                  onBlur={() => {
                    setHexFocused(false);
                    void actions.flush();
                  }}
                />
              </div>
            </div>
            <details className="details">
              <summary>Details</summary>
              <dl>
                <div>
                  <dt>Sent to the strip</dt>
                  <dd className="tnum">
                    hue {p.h} · saturation {protoS(p.s)} · brightness {protoB(p.b)} of 1000
                  </dd>
                </div>
              </dl>
            </details>
          </section>
        </div>
      </div>
    </>
  );
}
