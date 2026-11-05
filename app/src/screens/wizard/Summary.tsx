import type { Group } from "../../api";
import type { WizardModel } from "../../lib/wizardMachine";
import { intensityOutcome } from "../../lib/wizard";
import { profileName } from "../../lib/profiles";
import { useT } from "../../i18n";
import { Icon } from "../../ui/Icon";

export default function WizardSummary({
  model,
  groups,
  onNameChange,
  onGroupChange,
  onCreateGroup,
}: {
  model: WizardModel;
  groups: Group[];
  onNameChange: (name: string) => void;
  onGroupChange: (groupId: string) => void;
  /** Opens the new-group modal. */
  onCreateGroup: () => void;
}) {
  const all = useT();
  const t = all.wizard;
  const outcome = intensityOutcome(model.pick);
  const hasWhite = model.hasWhite ?? model.capabilities?.white ?? false;
  const chips = [
    model.capabilities?.color && t.caps.color,
    model.capabilities?.brightness && t.caps.brightness,
    hasWhite && t.caps.white,
  ].filter((c): c is string => !!c);
  return (
    <>
      <h1 className="t-28 wz-q" id="wz-title" tabIndex={-1}>
        {model.recalibrate ? t.recalibrationComplete : t.nameYourStrip}
      </h1>
      <p className="muted wz-sub">{t.summarySub}</p>

      <div className="wz-form">
        <label className="field-l">
          <span className="strong">{t.nameLabel}</span>
          <input
            className="field"
            type="text"
            value={model.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder={t.namePlaceholder}
            maxLength={32}
          />
        </label>

        <div className="field-l">
          <span className="strong">{t.addToGroups}</span>
          <p className="muted t-12">{groups.length === 0 ? t.noGroupsYet : t.severalGroups}</p>
          <div className="chips">
            {groups.map((g) => (
              <button
                key={g.id}
                className="chip chip-btn"
                aria-pressed={model.groups.includes(g.id)}
                onClick={() => onGroupChange(g.id)}
              >
                {g.name}
              </button>
            ))}
            <button type="button" className="chip chip-btn" onClick={onCreateGroup}>
              <Icon name="plus" size="sm" />
              {t.newGroup}
            </button>
          </div>
        </div>
      </div>

      <section className="profile card">
        <div className="profile-head">
          <span className="orb">
            <Icon name="strip" />
          </span>
          <div>
            <p className="eyebrow">{t.detectedProfile}</p>
            <p className="t-20">{model.name || t.unnamedStrip}</p>
          </div>
        </div>
        <dl className="profile-dl">
          {model.profileId && (
            <div>
              <dt>{t.family}</dt>
              <dd>{profileName(model.profileId, all.targets.profiles)}</dd>
            </div>
          )}
          <div>
            <dt>{t.channelOrderLabel}</dt>
            <dd>{model.order ? model.order.toUpperCase() : t.rgbUntested}</dd>
          </div>
          <div>
            <dt>{t.minBrightness}</dt>
            <dd>{outcome.kind === "ok" ? `${outcome.minPercent}%` : t.untested}</dd>
          </div>
          <div>
            <dt>{t.visibleSteps}</dt>
            <dd>{outcome.kind === "ok" ? outcome.steps : t.untested}</dd>
          </div>
          <div>
            <dt>{t.whiteLabel}</dt>
            <dd>{model.hasWhite === null ? t.notReported : model.hasWhite ? t.rgbw : t.rgbOnly}</dd>
          </div>
        </dl>
        <div className="chips">
          {chips.map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
