import type { GitHubRelease } from '../hooks/useGitHubReleases';
import { siteConfig } from '../config/site.config';

export interface ActiveRelease {
  version: string;
  href: string | null;
  sizeBytes: number;
  prerelease: boolean;
  htmlUrl: string | null;
}

// Antes, cada componente (Download, DownloadFinal, DownloadStrip) montava
// "versao" e "link de download" a partir de duas cadeias de fallback
// INDEPENDENTES (`latestRelease?.version || siteConfig.version` para um,
// `latestRelease?.installerUrl ?? siteConfig.links...` para outro) — se uma
// release nova fosse publicada no GitHub antes do .exe terminar de subir
// como asset, a badge mostrava a versao nova enquanto o botao continuava
// baixando o instalador antigo, sem nenhum aviso disso pro usuario. Aqui os
// dois sempre vem da MESMA fonte: real (com asset) ou estatica, nunca misto.
export function resolveActiveRelease(releases: GitHubRelease[]): ActiveRelease {
  const latest = releases[0] ?? null;
  const hasAsset = !!latest?.installerUrl;

  if (hasAsset && latest) {
    return {
      version: latest.version,
      href: latest.installerUrl,
      sizeBytes: latest.installerSizeBytes ?? siteConfig.installerSizeBytes,
      prerelease: latest.prerelease,
      htmlUrl: latest.htmlUrl,
    };
  }

  return {
    version: siteConfig.version,
    href: siteConfig.links.releaseDownloadWindows,
    sizeBytes: siteConfig.installerSizeBytes,
    prerelease: false,
    htmlUrl: null,
  };
}
