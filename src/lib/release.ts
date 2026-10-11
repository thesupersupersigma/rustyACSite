// rustyAC's releases, looked up once per build from GitHub. A failed request (offline, rate limit,
// bad JSON) falls back to src/data/release-fallback.json, a trimmed copy of a real answer, so the
// build never depends on GitHub being up.
//
// `npm run build` runs scripts/fetch-web-preview.mjs first, which asks GitHub for the same list and
// leaves the answer in node_modules/.cache/rustyacsite/releases.json. That copy is used when it is
// fresh, so one build makes one request. `astro dev` has no such copy and asks GitHub itself.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fallbackJson from '../data/release-fallback.json';
import { renderNotes } from './notes';

export interface ReleaseAsset {
  name: string;
  url: string;
  /** bytes */
  size: number;
  /** the `.sha256` file next to it, when the release has one */
  sha256Url?: string;
}

export interface Release {
  tag: string;
  name: string;
  /** ISO date (YYYY-MM-DD) */
  date: string;
  url: string;
  /** the release notes, as safe HTML */
  notesHtml: string;
  /** rustyAC-vX.Y.Z-windows-x64.zip */
  windows?: ReleaseAsset;
  /** rustyAC-vX.Y.Z-web.zip (the browser preview) */
  web?: ReleaseAsset;
  fromFallback: boolean;
}

export interface Releases {
  latest: Release;
  /** newest first */
  all: Release[];
  fromFallback: boolean;
}

const REPO = 'https://github.com/thesupersupersigma/rustyAC';
const API = 'https://api.github.com/repos/thesupersupersigma/rustyAC/releases?per_page=30';
const CACHE = path.join('node_modules', '.cache', 'rustyacsite', 'releases.json');
const CACHE_MAX_AGE_MS = 15 * 60 * 1000;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
/** Only links into the rustyAC repository are passed on to the pages. */
const repoUrl = (value: unknown): string | undefined => {
  const url = text(value);
  return url.startsWith(`${REPO}/`) ? url : undefined;
};

/** Reads GitHub's "list releases" answer (or the trimmed copy of it). Drafts and pre-releases are skipped. */
export function parseReleases(json: unknown, fromFallback: boolean): Release[] {
  if (!Array.isArray(json)) throw new Error('unexpected response');
  const releases: Release[] = [];
  for (const item of json as unknown[]) {
    if (typeof item !== 'object' || item === null) continue;
    const data = item as Record<string, unknown>;
    const tag = text(data['tag_name']);
    const date = text(data['published_at']).slice(0, 10);
    if (!/^v\d+\.\d+\.\d+$/.test(tag) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    if (data['draft'] === true || data['prerelease'] === true) continue;

    const assets = new Map<string, ReleaseAsset>();
    for (const entry of Array.isArray(data['assets']) ? (data['assets'] as unknown[]) : []) {
      if (typeof entry !== 'object' || entry === null) continue;
      const asset = entry as Record<string, unknown>;
      const name = text(asset['name']);
      const url = repoUrl(asset['browser_download_url']);
      const size = asset['size'];
      if (name === '' || !url || typeof size !== 'number') continue;
      assets.set(name, { name, url, size });
    }
    const pick = (name: string): ReleaseAsset | undefined => {
      const asset = assets.get(name);
      if (!asset) return undefined;
      const sum = assets.get(`${name}.sha256`);
      return sum ? { ...asset, sha256Url: sum.url } : asset;
    };

    const windows = pick(`rustyAC-${tag}-windows-x64.zip`);
    const web = pick(`rustyAC-${tag}-web.zip`);
    releases.push({
      tag,
      name: text(data['name']) || `rustyAC ${tag}`,
      date,
      url: repoUrl(data['html_url']) ?? `${REPO}/releases/tag/${tag}`,
      notesHtml: renderNotes(text(data['body'])),
      ...(windows ? { windows } : {}),
      ...(web ? { web } : {}),
      fromFallback,
    });
  }
  // newest first; a tie on the day is settled by the version number
  const version = (tag: string) => tag.slice(1).split('.').map(Number);
  releases.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    const [x, y] = [version(a.tag), version(b.tag)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (y[i] ?? 0) - (x[i] ?? 0);
    return 0;
  });
  if (releases.length === 0) throw new Error('no releases in the response');
  return releases;
}

/** The answer the prebuild script saved, when there is one and it is fresh. */
async function readCache(): Promise<unknown | undefined> {
  try {
    const cache: unknown = JSON.parse(await readFile(CACHE, 'utf8'));
    if (typeof cache !== 'object' || cache === null) return undefined;
    const { fetchedAt, releases } = cache as Record<string, unknown>;
    if (typeof fetchedAt !== 'number' || Date.now() - fetchedAt > CACHE_MAX_AGE_MS) return undefined;
    return releases;
  } catch {
    return undefined;
  }
}

async function fetchList(): Promise<unknown> {
  const token = process.env['GITHUB_TOKEN'];
  const res = await fetch(API, {
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'rustyacsite-build',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

let cached: Promise<Releases> | undefined;

async function loadReleases(): Promise<Releases> {
  let all: Release[];
  try {
    all = parseReleases((await readCache()) ?? (await fetchList()), false);
  } catch (err) {
    all = parseReleases(fallbackJson, true);
    const why = err instanceof Error ? err.message : String(err);
    console.warn(`[release] using the checked-in fallback (${all[0]?.tag}): ${why}`);
  }
  const latest = all[0];
  if (!latest) throw new Error('src/data/release-fallback.json holds no release');
  return { latest, all, fromFallback: latest.fromFallback };
}

export function getReleases(): Promise<Releases> {
  cached ??= loadReleases();
  return cached;
}

export async function getLatestRelease(): Promise<Release> {
  return (await getReleases()).latest;
}

export function formatReleaseDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** 1801243 -> "1.8 MB" */
export function formatSize(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} kB`;
}
