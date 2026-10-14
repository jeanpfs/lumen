import { useCallback, useEffect, useState } from "react";
import { Icon } from "../ui/Icon";
import { StateBlock } from "../ui/parts";
import { Sheet } from "../ui/Sheet";
import { profileName } from "../lib/profiles";
import { useApp } from "../state/store";
import { errorMessage, type Capabilities, type ProfileInfo } from "../api";

const CAPS: [keyof Capabilities, string][] = [
  ["color", "Color"],
  ["brightness", "Brightness"],
  ["white", "White"],
  ["effects", "Effects"],
  ["microphone", "Microphone"],
];

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

  return (
    <Sheet title="Supported strip types" sub="Protocol families the wizard recognizes on its own" onClose={onClose}>
      {error ? (
        <div className="card">
          <StateBlock
            icon="alert"
            title="Couldn't load the list"
            text={error}
            actions={
              <button type="button" className="btn btn-secondary" onClick={onRetry}>
                Try again
              </button>
            }
          />
        </div>
      ) : profiles === null ? (
        <p className="muted" aria-live="polite">
          Loading…
        </p>
      ) : (
        <ul className="types card">
          {profiles.map((p) => (
            <li className="type-row" key={p.id}>
              <span className="orb sm" aria-hidden="true">
                <Icon name="chip" size="sm" />
              </span>
              <div className="type-txt">
                <span className="strong">{profileName(p.id)}</span>
                <span className="muted t-12">{p.verified ? "Tested on a real strip" : "Not yet verified on a real strip"}</span>
              </div>
              <div className="chips">
                {p.verified && (
                  <span className="chip">
                    <Icon name="check" size="sm" />
                    Verified
                  </span>
                )}
                {CAPS.filter(([k]) => p.capabilities[k]).map(([k, label]) => (
                  <span className="chip" key={k}>
                    {label}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="note">
        <Icon name="info" size="sm" />
        <span>
          If your strip isn't listed here, the wizard still tries all of these types. If none works, close the
          manufacturer's app, which holds the connection, and try again.
        </span>
      </p>
    </Sheet>
  );
}
