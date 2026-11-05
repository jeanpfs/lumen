import { useT } from "../i18n";
import type { LangPref } from "../i18n/lang";
import { useApp } from "../state/store";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

/** Picks the UI language: the phone's (default) or a fixed one. The choice applies at once and is remembered. */
export function LanguageSheet({ onClose }: { onClose: () => void }) {
  const { state, actions } = useApp();
  const t = useT().settings;
  const options: { value: LangPref; label: string }[] = [
    { value: "auto", label: t.auto },
    { value: "en", label: t.english },
    { value: "pt-BR", label: t.portuguese },
  ];
  return (
    <Sheet title={t.language} onClose={onClose}>
      <div className="answers answers-1" role="radiogroup" aria-label={t.language}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={state.language === o.value}
            className="answer"
            onClick={() => {
              actions.setLanguage(o.value);
              onClose();
            }}
          >
            {state.language === o.value && <Icon name="check" size="sm" />}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
