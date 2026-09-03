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

/** Values substituted into a message's `{name}` placeholders. */
export type Vars = Record<string, string | number>;

type TranslateFn = (key: string, vars?: Vars) => string;

function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name) =>
    name in vars ? String(vars[name]) : whole
  );
}

function lookup(lang: Lang, key: string): string {
  return messages[lang]?.[key] ?? messages.en[key] ?? key;
}

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
  t: (key, vars) => format(lookup("ja", key), vars),
});

// A mirror of the provider's language for code that runs outside React — the
// RPC and backend layers throw Errors whose text reaches the user, and they
// have no hook to read. The provider keeps this in step on every render.
let currentLang: Lang = "ja";

/**
 * Translate from outside a component. Only for module-level code (thrown
 * errors, transport failures); inside a component use `useT`, which re-renders
 * when the language changes.
 */
export function tr(key: string, vars?: Vars): string {
  return format(lookup(currentLang, key), vars);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useLocalStorageState<Lang>(
    "lang",
    detectDefaultLang()
  );

  currentLang = lang;

  const t = useCallback<TranslateFn>(
    (key, vars) => format(lookup(lang, key), vars),
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
