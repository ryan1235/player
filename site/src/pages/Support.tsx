import { Link } from 'react-router-dom';
import { Navbar } from '../components/layout/Navbar';
import { Footer } from '../components/layout/Footer';
import { RevealOnScroll } from '../components/ui/RevealOnScroll';
import { FaqItem } from '../components/ui/FaqItem';
import { siteConfig } from '../config/site.config';
import { useI18n } from '../i18n/I18nProvider';
import './Support.css';

const CATEGORIES = [
  { titleKey: 'support.categoryInstall', items: ['support.i1', 'support.i2', 'support.i3'] },
  { titleKey: 'support.categoryPlayback', items: ['support.p1', 'support.p2', 'support.p3'] },
  { titleKey: 'support.categoryLive', items: ['support.l1', 'support.l2', 'support.l3'] },
  { titleKey: 'support.categoryDlna', items: ['support.d1', 'support.d2', 'support.d3'] },
] as const;

export function Support() {
  const { t } = useI18n();

  return (
    <>
      <Navbar />
      <main className="support-page">
        <section className="section support-hero">
          <div className="container">
            <RevealOnScroll>
              <Link to="/" className="back-link">
                {t('downloadPage.backToHome')}
              </Link>
              <span className="eyebrow">{t('support.eyebrow')}</span>
              <h1 className="section-title">{t('support.title')}</h1>
              <p className="section-body">{t('support.subtitle')}</p>
            </RevealOnScroll>
          </div>
        </section>

        <section className="section support-categories">
          <div className="container support-container">
            {CATEGORIES.map((cat) => (
              <RevealOnScroll key={cat.titleKey} className="support-category">
                <h2>{t(cat.titleKey)}</h2>
                <div className="support-list">
                  {cat.items.map((key) => (
                    <FaqItem key={key} question={t(`${key}.question`)} answer={t(`${key}.answer`)} />
                  ))}
                </div>
              </RevealOnScroll>
            ))}
          </div>
        </section>

        <section className="section support-cta">
          <div className="container support-cta-inner">
            <RevealOnScroll>
              <h2 className="section-title">{t('support.stillNeedHelp.title')}</h2>
              <p className="section-body">{t('support.stillNeedHelp.body')}</p>
              {siteConfig.links.github ? (
                <a
                  href={`${siteConfig.links.github}/issues/new`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-primary"
                >
                  {t('download.githubButton')}
                </a>
              ) : (
                <button type="button" className="btn btn-primary btn-disabled" disabled>
                  {t('support.stillNeedHelp.githubSoon')}
                </button>
              )}
              <a href={siteConfig.studio.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                {siteConfig.studio.name}
              </a>
            </RevealOnScroll>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
