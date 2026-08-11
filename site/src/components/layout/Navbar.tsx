import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n/I18nProvider';
import { siteConfig } from '../../config/site.config';
import { LanguageSwitch } from './LanguageSwitch';
import { DownloadButton } from '../ui/DownloadButton';
import { useSectionLink } from '../../hooks/useSectionLink';
import './Navbar.css';

// Links de secao (id) usam useSectionLink (ver hook) — precisam funcionar
// vindo de qualquer pagina, nao so da home. 'Suporte' e uma rota de verdade,
// entao usa <Link> normal do react-router.
const SECTION_LINKS = [
  { id: 'inicio', key: 'nav.home' },
  { id: 'recursos', key: 'nav.features' },
  { id: 'como-funciona', key: 'nav.howItWorks' },
] as const;

export function Navbar() {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  const sectionLink = useSectionLink();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <motion.header
      className={`navbar ${scrolled ? 'navbar-scrolled' : ''}`}
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="navbar-inner container">
        <a href="/#inicio" onClick={sectionLink('inicio')} className="navbar-brand">
          <img src="/icon.png" alt="" width={28} height={28} />
          <span>{siteConfig.appName}</span>
        </a>

        <nav className="navbar-links" aria-label="Navegação principal">
          {SECTION_LINKS.map((link) => (
            <a key={link.id} href={`/#${link.id}`} onClick={sectionLink(link.id)}>
              {t(link.key)}
            </a>
          ))}
          <Link to="/suporte">{t('nav.support')}</Link>
        </nav>

        <div className="navbar-actions">
          <LanguageSwitch />
          <DownloadButton size="sm" label={t('nav.downloadButton')} />
        </div>
      </div>
    </motion.header>
  );
}
