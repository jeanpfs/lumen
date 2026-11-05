import { Icon } from "../ui/Icon";
import { LinkBadge, RetryButton } from "../ui/parts";
import { useT } from "../i18n";
import { percentOfProto } from "../lib/color";
import { profileName } from "../lib/profiles";
import { useApp } from "../state/store";
import type { Go } from "../router";

const ORDERS = ["Rgb", "Rbg", "Grb", "Gbr", "Brg", "Bgr"] as const;

export function StripGeneral({ stripId, go }: { stripId: string; go: Go }) {
  const { state, actions } = useApp();
  const t = useT().targets;

  const groupsOfStrip = state.snapshot.groups.filter((g) => g.members.includes(stripId));
  const strip = state.snapshot.strips.find((s) => s.id === stripId);

  if (!strip) return null;

  const link = state.link[stripId] ?? "unknown";

  const cal = strip.calibration;
  return (
    <>
      <div className="set-row">
        <LinkBadge link={link} />
        {(link === "unreachable" || link === "retrying") && (
          <RetryButton link={link} onRetry={() => void actions.retry(stripId)} />
        )}
      </div>

      {groupsOfStrip.length > 0 && (
        <div className="set-row">
          <span className="muted">{t.stripGeneral.groups}</span>
          <div className="row-gap">
            {groupsOfStrip.map((g) => (
              <div key={g.id} className="row-gap">
                <button
                  type="button"
                  className="chip chip-btn"
                  onClick={() => go("group", g.id)}
                >
                  {g.name}
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={t.stripGeneral.leave(g.name)}
                  onClick={() => void actions.removeFromGroup(g.id, [stripId])}
                >
                  <Icon name="x" size="sm" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {state.snapshot.groups.length > groupsOfStrip.length && (
        <div className="set-row">
          <span className="muted">{t.stripGeneral.addTo}</span>
          <div className="row-gap">
            {state.snapshot.groups
              .filter((g) => !groupsOfStrip.find((og) => og.id === g.id))
              .map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className="chip chip-btn"
                  aria-label={t.stripGeneral.addToGroup(g.name)}
                  onClick={() => void actions.addToGroup(g.id, [stripId])}
                >
                  {g.name}
                </button>
              ))}
          </div>
        </div>
      )}

      <div className="set-row">
        <label htmlFor={`order-${stripId}`}>{t.stripGeneral.colorOrder}</label>
        <select
          id={`order-${stripId}`}
          className="select mono"
          value={cal.channel_order}
          onChange={(e) => void actions.setChannelOrder(stripId, e.target.value as typeof cal.channel_order)}
        >
          {ORDERS.map((o) => (
            <option key={o} value={o}>
              {o.toUpperCase()}
            </option>
          ))}
        </select>
      </div>

      <div className="set-row">
        <span className="muted">{t.stripGeneral.family}</span>
        <span>{profileName(strip.profile, t.profiles)}</span>
      </div>

      <div className="set-row">
        <span className="muted">{t.stripGeneral.minBrightness}</span>
        <span className="tnum">{percentOfProto(cal.min_brightness)}%</span>
      </div>

      <div className="set-row">
        <span className="muted">{t.common.white}</span>
        <span>{cal.has_white ? t.stripGeneral.yes : t.stripGeneral.no}</span>
      </div>

      <div className="set-row">
        <span>
          {t.stripGeneral.redoTests} <span className="muted t-12 block">{t.stripGeneral.redoTestsHint}</span>
        </span>
        <button type="button" className="btn btn-secondary btn-tight" onClick={() => go("add", stripId)}>
          <Icon name="refresh" size="sm" />
          {t.stripGeneral.recalibrate}
        </button>
      </div>
    </>
  );
}
