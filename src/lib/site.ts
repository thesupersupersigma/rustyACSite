import pkg from '../../package.json';

export const SITE_NAME = 'rustyAC';
export const SITE_URL = 'https://rustyac.com';
export const SITE_VERSION: string = pkg.version;

export const LINKS = {
  github: 'https://github.com/thesupersupersigma/rustyAC',
  releases: 'https://github.com/thesupersupersigma/rustyAC/releases',
  discord: 'https://discord.gg/trvtVNWzaf',
  docs: 'https://github.com/thesupersupersigma/rustyAC/tree/master/docs/port',
  licences: 'https://github.com/thesupersupersigma/rustyAC/blob/master/LICENSING.md',
} as const;

export interface NavLink {
  label: string;
  href: string;
  external?: boolean;
}

export const NAV: NavLink[] = [
  { label: 'Download', href: '/download' },
  { label: 'Play', href: '/play' },
  { label: 'How it works', href: '/how-it-works' },
  { label: 'Progress', href: '/progress' },
  { label: 'Devlog', href: '/devlog' },
  { label: 'FAQ', href: '/faq' },
  { label: 'Docs', href: LINKS.docs, external: true },
];

export const TRADEMARK_LINE =
  'Assetto Corsa is a trademark of its owners. rustyAC is not affiliated with them and is not endorsed by them.';
