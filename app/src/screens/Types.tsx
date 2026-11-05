import { useCallback, useEffect, useState } from "react";
import { Icon } from "../ui/Icon";
import { StateBlock } from "../ui/parts";
import { Sheet } from "../ui/Sheet";
import { useT } from "../i18n";
import { profileName } from "../lib/profiles";
import { useApp } from "../state/store";
import { errorMessage, type ProfileInfo } from "../api";

const CAPS = ["color", "brightness", "white", "effects", "microphone"] as const;

/**
 * Loads the catalogue once, ahead of time: the modal must open with its content already there, because a list that
 * pops in while the sheet is still sliding in changes its height mid-animation and the sheet visibly jumps.
 */
export function useProfiles() {
  const { backend } = useApp();
  const [profiles, setProfiles] = useState<ProfileInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    backend.profiles().then(setProfiles, (e) => setError(errorMessage(e)));
  }, [backend]);
  useEffect(load, [load]);
  return { profiles, error, reload: load };
}

/** The catalogue of strip types the wizard recognizes, in a modal opened from the help button on Home. */
export function TypesSheet({
  profiles,
  error,
  onRetry,
  onClose,
}: {
  profiles: ProfileInfo[] | null;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}) {
  const t = useT().targets;

  return (
    <Sheet title={t.types.title} sub={t.types.sub} onClose={onClose}>
      {error ? (
        <div className="card">
          <StateBlock
            icon="alert"
            title={t.types.loadFailed}
            text={error}
            actions={
              <button type="button" className="btn btn-secondary" onClick={onRetry}>
                {t.common.tryAgain}
              </button>
            }
          />
        </div>
      ) : profiles === null ? (
        <p className="muted" aria-live="polite">
          {t.common.loading}
        </p>
      ) : (
        <ul className="types card">
          {profiles.map((p) => (
            <li className="type-row" key={p.id}>
              <span className="orb sm" aria-hidden="true">
                <Icon name="chip" size="sm" />
              </span>
              <div className="type-txt">
                <span className="strong">{profileName(p.id, t.profiles)}</span>
                <span className="muted t-12">{p.verified ? t.types.verifiedTested : t.types.verifiedNot}</span>
              </div>
              <div className="chips">
                {p.verified && (
                  <span className="chip">
                    <Icon name="check" size="sm" />
                    {t.types.verified}
                  </span>
                )}
                {CAPS.filter((k) => p.capabilities[k]).map((k) => (
                  <span className="chip" key={k}>
                    {t.types.caps[k]}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="note">
        <Icon name="info" size="sm" />
        <span>{t.types.note}</span>
      </p>
    </Sheet>
  );
}
