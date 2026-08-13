import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// Le os releases publicados direto da API publica do GitHub, no navegador
// do visitante — sem backend proprio, sem precisar editar site.config.ts a
// cada versao nova. A API do GitHub manda CORS liberado (Access-Control-
// Allow-Origin: *) pra endpoints publicos de leitura exatamente pra
// permitir esse tipo de uso client-side. Nao autenticado: limite de 60
// requisicoes/hora por IP, generoso pra um site de apresentacao.
const REPO = 'ryan1235/player';

export interface GitHubRelease {
  tagName: string;
  version: string; // tagName sem o "v" na frente
  name: string;
  publishedAt: string;
  htmlUrl: string;
  prerelease: boolean;
  installerUrl: string | null;
  installerSizeBytes: number | null;
}

interface GitHubReleasesState {
  releases: GitHubRelease[];
  loading: boolean;
  error: boolean;
}

function parseRelease(raw: any): GitHubRelease {
  const assets: any[] = Array.isArray(raw.assets) ? raw.assets : [];
  const installer = assets.find((a) => typeof a.name === 'string' && a.name.toLowerCase().endsWith('.exe'));
  const tagName = String(raw.tag_name || '');
  return {
    tagName,
    version: tagName.replace(/^v/i, ''),
    name: raw.name || tagName,
    publishedAt: raw.published_at || '',
    htmlUrl: raw.html_url || `https://github.com/${REPO}/releases/tag/${tagName}`,
    prerelease: !!raw.prerelease,
    installerUrl: installer ? installer.browser_download_url : null,
    installerSizeBytes: installer ? installer.size : null,
  };
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) throw new Error(`GitHub respondeu ${res.status}`);
  return res.json();
}

// Observado na pratica: /repos/{repo}/releases (lista) pode devolver []
// mesmo com uma release real e publica existindo — /releases/latest, que
// busca por tag em vez de listar, encontra ela normalmente. Parece
// inconsistencia/atraso de propagacao do lado do GitHub, nao um erro
// nosso. Por isso: se a lista vier vazia, tenta /latest como fallback pra
// pelo menos ter a mais recente (mesmo sem "versoes anteriores" nesse
// caso) — melhor que mostrar nada quando existe uma release de verdade.
async function fetchReleases(): Promise<GitHubRelease[]> {
  const list = await fetchJson(`https://api.github.com/repos/${REPO}/releases`);
  const releases = (Array.isArray(list) ? list : [])
    .filter((r) => !r.draft)
    .map(parseRelease)
    .sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : -1));

  if (releases.length > 0) return releases;

  try {
    const latest = await fetchJson(`https://api.github.com/repos/${REPO}/releases/latest`);
    return latest && latest.tag_name ? [parseRelease(latest)] : [];
  } catch {
    return [];
  }
}

// Nao fica preso em "carregando" pra sempre: comeca com loading=true e
// releases=[], quem usa o hook deve continuar mostrando os valores
// estaticos de siteConfig ate os dados reais chegarem (ou falharem) — troca
// suave, sem tela de carregamento bloqueante.
//
// Contexto em vez de cada componente chamando o hook direto: DownloadStrip,
// DownloadFinal e a pagina /download podem estar montados ao mesmo tempo
// (Trust/DownloadStrip e DownloadFinal na home, por exemplo) — sem
// compartilhar o resultado, cada um disparava sua propria busca contra a
// API do GitHub (nao-autenticada, limite de 60 req/hora/IP), desperdicando
// chamadas com o mesmo resultado. Uma unica busca no provider, consumida por
// todo mundo via useGitHubReleases().
const GitHubReleasesContext = createContext<GitHubReleasesState | null>(null);

export function GitHubReleasesProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GitHubReleasesState>({ releases: [], loading: true, error: false });

  useEffect(() => {
    let cancelled = false;

    fetchReleases()
      .then((releases) => {
        if (!cancelled) setState({ releases, loading: false, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ releases: [], loading: false, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return <GitHubReleasesContext.Provider value={state}>{children}</GitHubReleasesContext.Provider>;
}

export function useGitHubReleases(): GitHubReleasesState {
  const ctx = useContext(GitHubReleasesContext);
  if (!ctx) throw new Error('useGitHubReleases deve ser usado dentro de <GitHubReleasesProvider>');
  return ctx;
}
