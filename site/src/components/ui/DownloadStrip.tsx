import { useI18n } from '../../i18n/I18nProvider';
import { siteConfig } from '../../config/site.config';
import { formatBytes } from '../../utils/formatBytes';
import { useGitHubReleases } from '../../hooks/useGitHubReleases';
import { DownloadButton } from './DownloadButton';
import './DownloadStrip.css';

// Faixa compacta de download, reaproveitada no meio da pagina (alem da
// secao de download final) — repete o CTA sem repetir a cena 3D inteira.
export function DownloadStrip() {
  const { t } = useI18n();

  // Mesmo padrao de pages/Download.tsx: versao/tamanho reais vem da API do
  // GitHub, siteConfig so serve de fallback enquanto a API nao responde.
  const { releases } = useGitHubReleases();
  const latestRelease = releases[0] ?? null;
  const displayVersion = latestRelease?.version || siteConfig.version;
  const displaySizeBytes = latestRelease?.installerSizeBytes ?? siteConfig.installerSizeBytes;

  return (
    <div className="download-strip">
      <div className="download-strip-info">
        <img src="/icon.png" alt="" width={36} height={36} />
        <div>
          <strong>{siteConfig.appName}</strong>
          <span>
            {t('download.versionLabel', { version: displayVersion })} · {siteConfig.requirements.os} · {formatBytes(displaySizeBytes)}
          </span>
        </div>
      </div>
      <DownloadButton size="sm" />
    </div>
  );
}
