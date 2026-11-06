import { createContext, useContext } from "react";
import type { Lang } from "./lang";
import { panel } from "./panel";
import { settings } from "./settings";
import { shell } from "./shell";
import { targets } from "./targets";
import { wizard } from "./wizard";

const bundles = { panel, settings, shell, targets, wizard };

export type Messages = { [K in keyof typeof bundles]: (typeof bundles)[K]["en"] };

function build(lang: Lang): Messages {
  return Object.fromEntries(Object.entries(bundles).map(([k, b]) => [k, b[lang]])) as Messages;
}

export const MESSAGES: Record<Lang, Messages> = { en: build("en"), "pt-BR": build("pt-BR") };

/** The UI language. `AppProvider` sets it; outside it (isolated component tests) the UI is in English. */
export const LangContext = createContext<Lang>("en");

export const useLang = (): Lang => useContext(LangContext);

/** The texts of the current language: `const t = useT(); t.targets.addStrip`. */
export const useT = (): Messages => MESSAGES[useContext(LangContext)];
