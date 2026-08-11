import { Link } from 'react-router-dom';
import { siteConfig } from '../../config/site.config';
import { useI18n } from '../../i18n/I18nProvider';

interface DownloadButtonProps {
  variant?: 'primary' | 'secondary';
  size?: 'md' | 'sm';
  label?: string;
}

// Unico ponto que decide se o botao de download leva pra pagina dedicada de
// download (/download — onde o usuario aceita os termos antes do arquivo
// baixar de verdade) ou mostra o estado "em breve", controlado por
// siteConfig.links.releaseDownloadWindows. Nunca inventa uma URL: enquanto o
// valor for null, o botao fica desabilitado e honesto — nem a pagina de
// download real faria sentido apontar pra lugar nenhum ainda.
export function DownloadButton({ variant = 'primary', size = 'md', label }: DownloadButtonProps) {
  const { t } = useI18n();
  const hasRelease = !!siteConfig.links.releaseDownloadWindows;
  const cls = `btn ${variant === 'primary' ? 'btn-primary' : 'btn-secondary'} ${size === 'sm' ? 'btn-sm' : ''}`;

  if (!hasRelease) {
    return (
      <button type="button" className={`${cls} btn-disabled`} disabled title={t('download.notPublished')}>
        {label ?? t('download.buttonSoon')}
      </button>
    );
  }

  return (
    <Link to="/download" className={cls}>
      {label ?? t('download.button')}
    </Link>
  );
}
