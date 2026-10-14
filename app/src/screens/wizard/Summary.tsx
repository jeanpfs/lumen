import type { Group } from "../../api";
import type { WizardModel } from "../../lib/wizardMachine";
import { intensityOutcome } from "../../lib/wizard";
import { profileName } from "../../lib/profiles";
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
  const outcome = intensityOutcome(model.pick);
  const hasWhite = model.hasWhite ?? model.capabilities?.white ?? false;
  const chips = [
    model.capabilities?.color && "Color",
    model.capabilities?.brightness && "Brightness",
    hasWhite && "White",
  ].filter((c): c is string => !!c);
  return (
    <>
      <h1 className="t-28 wz-q" id="wz-title" tabIndex={-1}>
        {model.recalibrate ? "Recalibration complete" : "Give your strip a name"}
      </h1>
      <p className="muted wz-sub">You can change all of this later on the strip's page.</p>

      <div className="wz-form">
        <label className="field-l">
          <span className="strong">Name</span>
          <input
            className="field"
            type="text"
            value={model.name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="E.g. Desk, Behind the TV"
            maxLength={32}
          />
        </label>

        <div className="field-l">
          <span className="strong">Add to groups</span>
          <p className="muted t-12">{groups.length === 0 ? "· you don't have any groups yet: create the first one here" : "· a strip can be in several groups"}</p>
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
              New group
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
            <p className="eyebrow">Detected profile</p>
            <p className="t-20">{model.name || "Unnamed strip"}</p>
          </div>
        </div>
        <dl className="profile-dl">
          {model.profileId && (
            <div>
              <dt>Family</dt>
              <dd>{profileName(model.profileId)}</dd>
            </div>
          )}
          <div>
            <dt>Channel order</dt>
            <dd>{model.order ? model.order.toUpperCase() : "RGB (untested)"}</dd>
          </div>
          <div>
            <dt>Minimum brightness</dt>
            <dd>{outcome.kind === "ok" ? `${outcome.minPercent}%` : "untested"}</dd>
          </div>
          <div>
            <dt>Visible steps</dt>
            <dd>{outcome.kind === "ok" ? outcome.steps : "untested"}</dd>
          </div>
          <div>
            <dt>White</dt>
            <dd>{model.hasWhite === null ? "Not reported" : model.hasWhite ? "RGBW" : "RGB only"}</dd>
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
