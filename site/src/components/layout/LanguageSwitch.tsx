import { useI18n } from '../../i18n/I18nProvider';
import './LanguageSwitch.css';

export function LanguageSwitch() {
  const { lang, setLang } = useI18n();

  return (
    <div className="lang-switch" role="group" aria-label="Idioma / Language">
      <button
        type="button"
        className={lang === 'pt' ? 'active' : ''}
        onClick={() => setLang('pt')}
        aria-pressed={lang === 'pt'}
      >
        PT-BR
      </button>
      <span className="lang-switch-divider" aria-hidden="true" />
      <button
        type="button"
        className={lang === 'en' ? 'active' : ''}
        onClick={() => setLang('en')}
        aria-pressed={lang === 'en'}
      >
        EN
      </button>
    </div>
  );
}
