export const cleanDocumentText = (raw: string): string => {
  let text = raw || '';
  text = text.replace(/\[\s*\d+(?:\s*[,–-]\s*\d+)*\s*\]/g, ''); // [1], [2, 3]
  text = text.replace(/(\b\w+)-\s*\n\s*(\w+\b)/g, '$1$2'); // broken hyphens
  text = text.replace(/^\s*(?:page\s+)?\d+(?:\s+of\s+\d+)?\s*$/gim, ''); // page counts
  text = text.replace(/[ \t]{2,}/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
};

export const findNarrationStart = (text: string): number | null => {
  const headings = [
    /(?:^|\n)[ \t]*chapter[ \t]+(?:1|i|one)\b[^\n]*/i,
    /(?:^|\n)[ \t]*prologue\b[^\n]*/i,
    /(?:^|\n)[ \t]*act[ \t]+(?:1|i|one)\b[^\n]*/i,
  ];
  for (const heading of headings) {
    const match = heading.exec(text);
    if (match) return match.index + match[0].search(/\S/);
  }
  return null;
};

export interface Chunk {
  start: number;
  end: number;
}

/**
 * Splits text into sentences, then merges them into chunks of ~maxLen chars.
 * Bigger chunks = fewer TTS requests and smoother narration.
 */
export const buildChunks = (text: string, maxLen = 1200): Chunk[] => {
  const sentences: Chunk[] = [];
  const re = /[^.!?\n]+(?:[.!?]+["')\]”’]*)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const start = m.index + (raw.length - raw.trimStart().length);
    sentences.push({ start, end: start + trimmed.length });
  }

  const chunks: Chunk[] = [];
  for (const s of sentences) {
    const last = chunks[chunks.length - 1];
    const sameParagraph = last && !text.slice(last.end, s.start).includes('\n');
    if (last && sameParagraph && s.end - last.start <= maxLen) last.end = s.end;
    else chunks.push({ ...s });
  }
  return chunks;
};