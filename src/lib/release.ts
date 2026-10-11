// The latest rustyAC release, looked up once per build. A failed request (offline, rate limit,
// bad JSON) falls back to the values below so the build never depends on GitHub being up.
export interface Release {
  tag: string;
  name: string;
  /** ISO date (YYYY-MM-DD) */
  date: string;
  url: string;
  fromFallback: boolean;
}

const FALLBACK: Release = {
  tag: 'v0.22.1',
  name: 'rustyAC v0.22.1',
  date: '2026-10-10',
  url: 'https://github.com/thesupersupersigma/rustyAC/releases',
  fromFallback: true,
};

const API = 'https://api.github.com/repos/thesupersupersigma/rustyAC/releases/latest';

let cached: Promise<Release> | undefined;

async function fetchRelease(): Promise<Release> {
  try {
    const res = await fetch(API, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'rustyacsite-build' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: unknown = await res.json();
    if (typeof json !== 'object' || json === null) throw new Error('unexpected response');
    const data = json as Record<string, unknown>;
    const tag = data['tag_name'];
    if (typeof tag !== 'string' || tag.length === 0) throw new Error('no tag_name');
    const name = typeof data['name'] === 'string' && data['name'].length > 0 ? data['name'] : `rustyAC ${tag}`;
    const published = typeof data['published_at'] === 'string' ? data['published_at'].slice(0, 10) : '';
    const url = typeof data['html_url'] === 'string' ? data['html_url'] : FALLBACK.url;
    return {
      tag,
      name,
      date: /^\d{4}-\d{2}-\d{2}$/.test(published) ? published : FALLBACK.date,
      url,
      fromFallback: false,
    };
  } catch (err) {
    console.warn(`[release] using fallback ${FALLBACK.tag}: ${err instanceof Error ? err.message : String(err)}`);
    return FALLBACK;
  }
}

export function getLatestRelease(): Promise<Release> {
  cached ??= fetchRelease();
  return cached;
}

export function formatReleaseDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
