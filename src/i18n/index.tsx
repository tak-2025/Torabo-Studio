import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useLocalStorageState } from "../misc/useLocalStorageState";
import { Lang, messages } from "./messages";

export type { Lang } from "./messages";
export { LANGS } from "./messages";

type TranslateFn = (key: string) => string;

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: TranslateFn;
}

function detectDefaultLang(): Lang {
  // torabo-tsuki is a Japanese-focused fork: default to Japanese unless the
  // browser is explicitly non-Japanese.
  if (
    typeof navigator !== "undefined" &&
    navigator.language &&
    !navigator.language.toLowerCase().startsWith("ja")
  ) {
    return "en";
  }
  return "ja";
}

const I18nContext = createContext<I18nContextValue>({
  lang: "ja",
  setLang: () => {},
  t: (key) => messages.ja[key] ?? key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useLocalStorageState<Lang>(
    "lang",
    detectDefaultLang()
  );

  const t = useCallback<TranslateFn>(
    (key) => messages[lang]?.[key] ?? messages.en[key] ?? key,
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, t }),
    [lang, setLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}

// Convenience hook when only the translate function is needed.
export function useT(): TranslateFn {
  return useContext(I18nContext).t;
}
