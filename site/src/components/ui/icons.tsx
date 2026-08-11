// Icones inline, estilo consistente (stroke, currentColor) — mesma
// linguagem visual usada no app (viewBox 24x24, stroke-width ~1.6).
type IconProps = { size?: number };

export const IconPlay = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><path d="M8 5v14l11-7-11-7Z" fill="currentColor" /></svg>
);

export const IconWifi = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><path d="M4 10a8 8 0 0 1 16 0M7 12.5a4.5 4.5 0 0 1 9 0M12 19a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);

export const IconCast = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><path d="M3 10V6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M3 14a6 6 0 0 1 6 6M3 17.5a2.5 2.5 0 0 1 2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="3.75" cy="20.25" r="1" fill="currentColor" /></svg>
);

export const IconLive = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><circle cx="12" cy="12" r="3" fill="currentColor" /><path d="M7 7a7 7 0 0 0 0 10M17 7a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16M20 4a11 11 0 0 1 0 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
);

export const IconHistory = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><circle cx="12" cy="12.5" r="7.5" stroke="currentColor" strokeWidth="1.6" /><path d="M12 8.5V12.5l3 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export const IconSubtitles = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" /><path d="M7 15v-2a2 2 0 0 1 2-2h1M14 15v-2a2 2 0 0 1 2-2h1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);

export const IconWindows = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><path d="M3 5.5 10.5 4.4V11.5H3V5.5ZM11.5 4.3 21 3v8.5h-9.5V4.3ZM3 12.5h7.5v7.1L3 18.5v-6ZM11.5 12.5H21V21l-9.5-1.3v-7.2Z" fill="currentColor" /></svg>
);

export const IconServer = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><rect x="3" y="4" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="3" y="14" width="18" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><circle cx="7" cy="7" r="1" fill="currentColor" /><circle cx="7" cy="17" r="1" fill="currentColor" /></svg>
);

export const IconPhone = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><rect x="6.5" y="2.5" width="11" height="19" rx="2.2" stroke="currentColor" strokeWidth="1.6" /><path d="M10.5 18.5h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);

export const IconCheck = ({ size = 16 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export const IconChevronDown = ({ size = 18 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export const IconNoAds = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><rect x="3" y="6" width="18" height="12" rx="2.2" stroke="currentColor" strokeWidth="1.6" /><path d="M7 10.5h6M7 13.5h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="m4 20 16-16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);

export const IconShieldCheck = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><path d="M12 3.5 5 6v6c0 4.4 3 7.7 7 8.5 4-.8 7-4.1 7-8.5V6l-7-2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="m9 12 2 2 4-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export const IconHome = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><path d="M4 11.5 12 4l8 7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M6 10v8.5a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1V10" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" /></svg>
);

export const IconCpu = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><rect x="7" y="7" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.6" /><rect x="10" y="10" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.4" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5 7.5 7.5M18.5 5.5l-2 2M5.5 18.5l2-2M18.5 18.5l-2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
);

export const IconDownload = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><path d="M12 4v11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="m7 11 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 19.5h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);

export const IconAlertTriangle = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><path d="M12 4 2.5 20h19L12 4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M12 10.5v4M12 17.2v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);

export const IconCode = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><path d="m9 8-4.5 4 4.5 4M15 8l4.5 4-4.5 4M13.5 5.5l-3 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export const IconCheckCircle = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" /><path d="m8.5 12.3 2.3 2.3 4.7-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export const IconXCircle = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" /><path d="m9.5 9.5 5 5m0-5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
);

export const IconDashCircle = ({ size = 20 }: IconProps) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" /><path d="M8.5 12h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
);
