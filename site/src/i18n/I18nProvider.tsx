import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import ptBR from './locales/pt-BR.json';
import enUS from './locales/en-US.json';

export type Lang = 'pt' | 'en';

const DICTS: Record<Lang, Record<string, string>> = {
  pt: ptBR,
  en: enUS,
};

type Vars = Record<string, string | number>;

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Vars) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function detectInitialLang(): Lang {
  const stored = localStorage.getItem('site-lang');
  if (stored === 'pt' || stored === 'en') return stored;
  return navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectInitialLang);

  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : 'en-US';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = (next: Lang) => {
    localStorage.setItem('site-lang', next);
    setLangState(next);
    document.documentElement.lang = next === 'pt' ? 'pt-BR' : 'en-US';
  };

  const t = useMemo(() => {
    const dict = DICTS[lang];
    return (key: string, vars?: Vars) => {
      let str = dict[key] ?? DICTS.pt[key] ?? key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        }
      }
      return str;
    };
  }, [lang]);

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n deve ser usado dentro de <I18nProvider>');
  return ctx;
}
