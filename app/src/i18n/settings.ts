import type { Bundle } from "./lang";

const en = {
  language: "Language",
  chooseLanguage: "Choose language",
  auto: "Automatic (system language)",
  english: "English",
  portuguese: "Português (Brasil)",
};

export const settings: Bundle<typeof en> = {
  en,
  "pt-BR": {
    language: "Idioma",
    chooseLanguage: "Escolher idioma",
    auto: "Automático (idioma do sistema)",
    english: "English",
    portuguese: "Português (Brasil)",
  },
};
