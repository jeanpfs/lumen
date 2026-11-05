export type Lang = "en" | "pt-BR";
/** What the user picked: follow the OS, or a fixed language. */
export type LangPref = "auto" | Lang;

export const LANG_PREFS: readonly LangPref[] = ["auto", "en", "pt-BR"];

/** One area's texts in every language; `pt-BR` must have exactly the keys and signatures of `en`. */
export type Bundle<T> = Record<Lang, T>;

/**
 * The language the UI shows. Any Portuguese (`pt`, `pt-BR`, `pt-PT`, `pt_BR`) gets the Brazilian translation,
 * everything else English. Until the backend has answered, the WebView's own guess stands in for the OS.
 */
export function resolveLang(pref: LangPref, systemLocale: string | null): Lang {
  if (pref !== "auto") return pref;
  const tag = systemLocale ?? (typeof navigator === "undefined" ? "" : navigator.language);
  return /^pt($|[-_])/i.test(tag) ? "pt-BR" : "en";
}

/** The language on `<html lang>`, for code that runs outside the React tree (the crash screen). */
export const documentLang = (): Lang => (document.documentElement.lang === "pt-BR" ? "pt-BR" : "en");
