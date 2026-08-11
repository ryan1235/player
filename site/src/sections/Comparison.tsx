import { useI18n } from '../i18n/I18nProvider';
import { RevealOnScroll } from '../components/ui/RevealOnScroll';
import { DownloadButton } from '../components/ui/DownloadButton';
import { IconCheckCircle, IconXCircle, IconDashCircle } from '../components/ui/icons';
import './Comparison.css';

type Status = 'yes' | 'no' | 'partial';

function StatusIcon({ status }: { status: Status }) {
  return (
    <span className={`comparison-status comparison-status-${status}`}>
      {status === 'yes' && <IconCheckCircle size={20} />}
      {status === 'no' && <IconXCircle size={20} />}
      {status === 'partial' && <IconDashCircle size={20} />}
    </span>
  );
}

// Linhas da comparacao — categorias genericas ("player comum", "streaming
// pago"), nao produtos especificos nomeados. "partial" usado onde a
// generalizacao nao seria justa como sim/nao fechado (ex.: alguns players
// comuns tem algum suporte a DLNA, mas nao como recurso central).
const ROWS: { key: string; other1: Status; other2: Status; aura: Status }[] = [
  { key: 'comparison.row1', other1: 'yes', other2: 'no', aura: 'yes' },
  { key: 'comparison.row2', other1: 'partial', other2: 'no', aura: 'yes' },
  { key: 'comparison.row3', other1: 'yes', other2: 'no', aura: 'yes' },
  { key: 'comparison.row4', other1: 'yes', other2: 'no', aura: 'yes' },
  { key: 'comparison.row5', other1: 'partial', other2: 'no', aura: 'yes' },
  { key: 'comparison.row6', other1: 'no', other2: 'yes', aura: 'yes' },
];

export function Comparison() {
  const { t } = useI18n();

  return (
    <section className="section comparison">
      <div className="container">
        <RevealOnScroll className="comparison-header">
          <span className="eyebrow">{t('comparison.eyebrow')}</span>
          <h2 className="section-title">{t('comparison.title')}</h2>
          <p className="section-body">{t('comparison.subtitle')}</p>
        </RevealOnScroll>

        <RevealOnScroll delay={0.1} className="comparison-table-wrap">
          <div className="comparison-table">
            <div className="comparison-row comparison-row-head">
              <div className="comparison-cell comparison-cell-label" />
              <div className="comparison-cell comparison-col-head">
                <span>{t('comparison.col.other1')}</span>
              </div>
              <div className="comparison-cell comparison-col-head comparison-col-highlight">
                <span className="comparison-badge">{t('comparison.badge')}</span>
                <span className="comparison-col-highlight-name">{t('comparison.col.aura')}</span>
              </div>
              <div className="comparison-cell comparison-col-head">
                <span>{t('comparison.col.other2')}</span>
              </div>
            </div>

            {ROWS.map((row) => (
              <div className="comparison-row" key={row.key}>
                <div className="comparison-cell comparison-cell-label">{t(row.key)}</div>
                <div className="comparison-cell">
                  <StatusIcon status={row.other1} />
                </div>
                <div className="comparison-cell comparison-col-highlight">
                  <StatusIcon status={row.aura} />
                </div>
                <div className="comparison-cell">
                  <StatusIcon status={row.other2} />
                </div>
              </div>
            ))}

            <div className="comparison-row comparison-row-cta">
              <div className="comparison-cell comparison-cell-label" />
              <div className="comparison-cell" />
              <div className="comparison-cell comparison-col-highlight">
                <DownloadButton size="sm" label={t('comparison.cta')} />
              </div>
              <div className="comparison-cell" />
            </div>
          </div>
        </RevealOnScroll>
      </div>
    </section>
  );
}
