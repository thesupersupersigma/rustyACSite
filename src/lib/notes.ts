// Release notes (GitHub-flavoured Markdown) to HTML, for the changelog. It knows the few things
// GitHub's generated notes use: headings, bullet lists, bold, code, links and bare URLs. Everything
// is escaped first and only https links are made, so the notes can never inject markup.

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const link = (href: string, label: string): string => `<a href="${href}" rel="noopener">${label}</a>`;

/** Inline Markdown of one already-escaped line. */
function inline(escaped: string): string {
  // Code and links are swapped for placeholders, so a later rule cannot reach inside them.
  const held: string[] = [];
  const hold = (html: string): string => `\u0000${held.push(html) - 1}\u0000`;

  let out = escaped.replace(/`([^`]+)`/g, (_, code: string) => hold(`<code>${code}</code>`));
  out = out.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, (_, label: string, href: string) => hold(link(href, label)));
  out = out.replace(/https:\/\/[^\s<]+[^\s<.,;:!?)]/g, (href) => hold(link(href, href.replace(/^https:\/\//, ''))));
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  return out.replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)] ?? '');
}

export function renderNotes(markdown: string): string {
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) html.push(`<p>${paragraph.join('<br>')}</p>`);
    if (list.length > 0) html.push(`<ul>${list.map((item) => `<li>${item}</li>`).join('')}</ul>`);
    paragraph = [];
    list = [];
  };

  for (const raw of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    // GitHub's notes carry HTML comments ("<!-- Release notes generated ... -->")
    if (line === '' || /^<!--.*-->$/.test(line)) {
      flush();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      html.push(`<h4>${inline(escapeHtml(heading[1] ?? ''))}</h4>`);
    } else if (bullet) {
      if (paragraph.length > 0) flush();
      list.push(inline(escapeHtml(bullet[1] ?? '')));
    } else {
      if (list.length > 0) flush();
      paragraph.push(inline(escapeHtml(line)));
    }
  }
  flush();
  return html.join('');
}
