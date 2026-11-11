// Free, keyless book sources.
//  1) Project Gutenberg via Gutendex  – https://gutendex.com
//  2) Open Library / Internet Archive – public-domain scans only
// Note: in-copyright books on Open Library are "borrowed" through a login + DRM
// reader, so their text can't be read by an app. Public-domain titles can.

export type BookSource = 'gutenberg' | 'openlibrary';

export interface BookResult {
  id: string;
  source: BookSource;
  title: string;
  author: string;
  cover?: string;
  textUrls: string[];
}

const MAX_CHARS = 40000; // demo cap (~45 min of audio)

const flipName = (n?: string) => {
  if (!n) return 'Unknown author';
  const [last, first] = n.split(',').map((s) => s.trim());
  return first ? `${first} ${last}` : n;
};

export async function searchGutenberg(query: string): Promise<BookResult[]> {
  const q = query.trim() ? `&search=${encodeURIComponent(query.trim())}` : '';
  const res = await fetch(`https://gutendex.com/books/?languages=en${q}`);
  if (!res.ok) throw new Error(`Gutenberg search failed (${res.status})`);
  const json = await res.json();

  return (json.results || [])
    .map((b: any): BookResult | null => {
      const formats = b.formats || {};
      const key = Object.keys(formats).find((k) => k.startsWith('text/plain') && !String(formats[k]).endsWith('.zip'));
      if (!key) return null;
      return {
        id: `pg-${b.id}`,
        source: 'gutenberg',
        title: b.title,
        author: flipName(b.authors?.[0]?.name),
        cover: formats['image/jpeg'],
        textUrls: [formats[key]],
      };
    })
    .filter(Boolean) as BookResult[];
}

export async function searchOpenLibrary(query: string): Promise<BookResult[]> {
  const q = encodeURIComponent(query.trim() || 'classic literature');
  const url =
    `https://openlibrary.org/search.json?q=${q}&has_fulltext=true&language=eng&limit=20` +
    `&fields=key,title,author_name,cover_i,ia,public_scan_b`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open Library search failed (${res.status})`);
  const json = await res.json();

  return (json.docs || [])
    .filter((d: any) => d.public_scan_b && d.ia?.length)
    .map((d: any): BookResult => ({
      id: `ol-${d.key}`,
      source: 'openlibrary',
      title: d.title,
      author: d.author_name?.[0] || 'Unknown author',
      cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : undefined,
      textUrls: d.ia.slice(0, 3).map((ia: string) => `https://archive.org/download/${ia}/${ia}_djvu.txt`),
    }));
}

const stripGutenberg = (t: string) => {
  const s = t.search(/\*\*\* ?START OF (THE|THIS) PROJECT GUTENBERG[^\n]*\n/i);
  if (s >= 0) t = t.slice(t.indexOf('\n', s) + 1);
  const e = t.search(/\*\*\* ?END OF (THE|THIS) PROJECT GUTENBERG/i);
  if (e >= 0) t = t.slice(0, e);
  return t;
};

// Books are hard-wrapped at ~70 chars; join lines so narration flows.
const unwrap = (t: string) =>
  t
    .replace(/\r\n/g, '\n')
    .replace(/([^\n])\n(?!\n)/g, '$1 ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n\n')
    .trim();

export async function fetchBookText(book: BookResult): Promise<string> {
  let lastErr = 'No readable text found for this book.';
  for (const url of book.textUrls) {
    try {
      const res = await fetch(url);
      if (!res.ok) { lastErr = `Download failed (${res.status})`; continue; }
      let text = unwrap(stripGutenberg(await res.text()));
      if (text.length < 500) continue;
      if (text.length > MAX_CHARS) {
        text = text.slice(0, MAX_CHARS);
        const cut = text.lastIndexOf('. ');
        if (cut > MAX_CHARS * 0.8) text = text.slice(0, cut + 1);
      }
      return text;
    } catch (e: any) {
      lastErr = e?.message || lastErr;
    }
  }
  throw new Error(lastErr);
}