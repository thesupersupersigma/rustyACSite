import { describe, expect, it } from 'vitest';
import fallback from '../data/release-fallback.json';
import { renderNotes } from './notes';
import { formatSize, parseReleases } from './release';

const REPO = 'https://github.com/thesupersupersigma/rustyAC';

const release = (tag: string, published: string, extra: Record<string, unknown> = {}) => ({
  tag_name: tag,
  name: `rustyAC ${tag}`,
  published_at: published,
  html_url: `${REPO}/releases/tag/${tag}`,
  body: '',
  assets: [],
  ...extra,
});

describe('parseReleases', () => {
  it('reads the checked-in fallback', () => {
    const all = parseReleases(fallback, true);
    expect(all.length).toBeGreaterThan(0);
    const latest = all[0]!;
    expect(latest.tag).toMatch(/^v\d+\.\d+\.\d+$/);
    expect(latest.fromFallback).toBe(true);
    expect(latest.windows?.name).toBe(`rustyAC-${latest.tag}-windows-x64.zip`);
    expect(latest.windows?.sha256Url).toMatch(/\.zip\.sha256$/);
    expect(latest.web?.name).toBe(`rustyAC-${latest.tag}-web.zip`);
  });

  it('sorts newest first, by version within one day', () => {
    const all = parseReleases(
      [
        release('v0.16.0', '2026-10-08T16:52:28Z'),
        release('v0.22.2', '2026-10-11T00:24:39Z'),
        release('v0.17.0', '2026-10-08T17:02:03Z'),
      ],
      false,
    );
    expect(all.map((r) => r.tag)).toEqual(['v0.22.2', 'v0.17.0', 'v0.16.0']);
  });

  it('skips drafts, pre-releases and odd tags', () => {
    const all = parseReleases(
      [
        release('v0.3.0', '2026-10-03T00:00:00Z', { draft: true }),
        release('v0.2.0', '2026-10-02T00:00:00Z', { prerelease: true }),
        release('nightly', '2026-10-02T00:00:00Z'),
        release('v0.1.0', '2026-10-01T00:00:00Z'),
      ],
      false,
    );
    expect(all.map((r) => r.tag)).toEqual(['v0.1.0']);
  });

  it('drops download links that point outside the repository', () => {
    const [only] = parseReleases(
      [
        release('v0.1.0', '2026-10-01T00:00:00Z', {
          html_url: 'https://example.com/',
          assets: [
            { name: 'rustyAC-v0.1.0-windows-x64.zip', size: 10, browser_download_url: 'https://example.com/x.zip' },
          ],
        }),
      ],
      false,
    );
    expect(only?.windows).toBeUndefined();
    expect(only?.url).toBe(`${REPO}/releases/tag/v0.1.0`);
  });

  it('throws on an answer with no release, so the caller falls back', () => {
    expect(() => parseReleases({ message: 'API rate limit exceeded' }, false)).toThrow();
    expect(() => parseReleases([], false)).toThrow();
  });
});

describe('renderNotes', () => {
  it("renders GitHub's generated notes", () => {
    expect(renderNotes(`**Full Changelog**: ${REPO}/compare/v0.22.2...v0.23.0`)).toBe(
      `<p><strong>Full Changelog</strong>: <a href="${REPO}/compare/v0.22.2...v0.23.0" rel="noopener">github.com/thesupersupersigma/rustyAC/compare/v0.22.2...v0.23.0</a></p>`,
    );
  });

  it('renders headings, lists, code and links', () => {
    expect(renderNotes("## What's Changed\n* fix `--track` by [me](https://example.com/a)\n* more.\n\nBye")).toBe(
      '<h4>What\'s Changed</h4><ul><li>fix <code>--track</code> by <a href="https://example.com/a" rel="noopener">me</a></li><li>more.</li></ul><p>Bye</p>',
    );
  });

  it('escapes markup and refuses non-https links', () => {
    const html = renderNotes('<script>alert(1)</script> [x](javascript:alert(1)) <!-- hidden -->');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<a ');
    expect(renderNotes('<!-- Release notes generated using configuration in .github/release.yml -->')).toBe('');
  });
});

describe('formatSize', () => {
  it('formats bytes', () => {
    expect(formatSize(1801243)).toBe('1.8 MB');
    expect(formatSize(90)).toBe('1 kB');
    expect(formatSize(936015)).toBe('936 kB');
  });
});
