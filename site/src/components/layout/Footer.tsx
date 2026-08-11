import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nProvider';
import { siteConfig } from '../../config/site.config';
import { LanguageSwitch } from './LanguageSwitch';
import { useSectionLink } from '../../hooks/useSectionLink';
import './Footer.css';

export function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  const sectionLink = useSectionLink();

  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="footer-brand">
          <img src="/icon.png" alt="" width={26} height={26} />
          <div>
            <strong>{siteConfig.appName}</strong>
            <p>{t('footer.tagline')}</p>
          </div>
        </div>

        <nav className="footer-links" aria-label="Footer">
          <a href="/#inicio" onClick={sectionLink('inicio')}>{t('nav.home')}</a>
          <a href="/#recursos" onClick={sectionLink('recursos')}>{t('nav.features')}</a>
          <a href="/#como-funciona" onClick={sectionLink('como-funciona')}>{t('nav.howItWorks')}</a>
          <Link to="/suporte">{t('nav.support')}</Link>
          <Link to="/download">{t('nav.download')}</Link>
          {siteConfig.links.documentation && (
            <a href={siteConfig.links.documentation} target="_blank" rel="noopener noreferrer">
              Docs
            </a>
          )}
          {siteConfig.links.github && (
            <a href={siteConfig.links.github} target="_blank" rel="noopener noreferrer">
              GitHub
            </a>
          )}
        </nav>

        <LanguageSwitch />
      </div>

      <div className="container footer-bottom">
        <span>
          © {year} {siteConfig.appName} — {t('footer.rights')}
        </span>
        <span>
          {t('footer.madeByPrefix', { developer: siteConfig.developer })}{' '}
          <a href={siteConfig.studio.url} target="_blank" rel="noopener noreferrer" className="footer-studio-link">
            {siteConfig.studio.name}
          </a>
          {t('footer.madeBySuffix')}
        </span>
      </div>
    </footer>
  );
}
