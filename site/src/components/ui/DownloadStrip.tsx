import { useI18n } from '../../i18n/I18nProvider';
import { siteConfig } from '../../config/site.config';
import { formatBytes } from '../../utils/formatBytes';
import { useGitHubReleases } from '../../hooks/useGitHubReleases';
import { resolveActiveRelease } from '../../utils/activeRelease';
import { DownloadButton } from './DownloadButton';
import './DownloadStrip.css';

// Faixa compacta de download, reaproveitada no meio da pagina (alem da
// secao de download final) — repete o CTA sem repetir a cena 3D inteira.
export function DownloadStrip() {
  const { t } = useI18n();

  // Mesmo padrao de pages/Download.tsx: versao/tamanho reais vem da API do
  // GitHub (sempre da MESMA release — ver utils/activeRelease.ts), siteConfig
  // so serve de fallback enquanto a API nao responde.
  const { releases } = useGitHubReleases();
  const { version: displayVersion, sizeBytes: displaySizeBytes, prerelease: isPrerelease } = resolveActiveRelease(releases);

  return (
    <div className="download-strip">
      <div className="download-strip-info">
        <img src="/icon.png" alt="" width={36} height={36} />
        <div>
          <strong>{siteConfig.appName}</strong>
          <span>
            {t('download.versionLabel', { version: displayVersion })}
            {isPrerelease ? ` (${t('download.olderVersions.prerelease')})` : ''} · {siteConfig.requirements.os} · {formatBytes(displaySizeBytes)}
          </span>
        </div>
      </div>
      <DownloadButton size="sm" />
    </div>
  );
}
