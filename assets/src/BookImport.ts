import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { strFromU8, unzipSync } from 'fflate';
import type { BookResult } from './Books';

const decodeBase64 = (value: string): Uint8Array => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array(Math.floor((value.length * 3) / 4) - padding);
  let offset = 0;

  for (let index = 0; index < value.length; index += 4) {
    const first = alphabet.indexOf(value[index]);
    const second = alphabet.indexOf(value[index + 1]);
    const third = alphabet.indexOf(value[index + 2]);
    const fourth = alphabet.indexOf(value[index + 3]);
    const chunk = (first << 18) | (second << 12) | ((Math.max(third, 0) & 0x3f) << 6) | (Math.max(fourth, 0) & 0x3f);

    bytes[offset++] = (chunk >> 16) & 0xff;
    if (offset < bytes.length) bytes[offset++] = (chunk >> 8) & 0xff;
    if (offset < bytes.length) bytes[offset++] = chunk & 0xff;
  }

  return bytes;
};

const readFileBytes = async (asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> => {
  if (asset.file) return new Uint8Array(await asset.file.arrayBuffer());
  const base64 = await FileSystem.readAsStringAsync(asset.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return decodeBase64(base64);
};

const decodeEntities = (text: string): string => text
  .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 10)))
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (entity) => ({
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&apos;': "'",
    '&nbsp;': ' ',
  }[entity.toLowerCase()] || entity));

const xmlText = (content: string, tag: string): string | undefined => {
  const match = content.match(new RegExp(`<(?:(?:[\\w.-]+):)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w.-]+):)?${tag}\\s*>`, 'i'));
  return match?.[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
};

const attributes = (tag: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) {
    result[match[1].toLowerCase()] = decodeEntities(match[3]);
  }
  return result;
};

const resolveArchivePath = (basePath: string, href: string): string => {
  const parts = [...basePath.split('/').filter(Boolean)];
  for (const segment of href.split(/[?#]/, 1)[0].split('/')) {
    const decoded = decodeURIComponent(segment);
    if (!decoded || decoded === '.') continue;
    if (decoded === '..') parts.pop();
    else parts.push(decoded);
  }
  return parts.join('/');
};

const htmlToText = (html: string): string => decodeEntities(
  html
    .replace(/<(script|style|svg|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<(?:br|\/p|\/div|\/h[1-6]|\/li|\/section|\/article|\/blockquote|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim(),
);

const parseEpub = (bytes: Uint8Array, fallbackTitle: string): { title: string; author: string; text: string } => {
  const archive = unzipSync(bytes);
  const container = archive['META-INF/container.xml'];
  const containerXml = container && strFromU8(container);
  const rootfile = containerXml && containerXml.match(/<rootfile\b[^>]*>/i)?.[0];
  const opfPath = rootfile ? attributes(rootfile)['full-path'] : undefined;
  const packagePath = opfPath || Object.keys(archive).find((path) => /\.opf$/i.test(path));
  if (!packagePath || !archive[packagePath]) throw new Error('This EPUB does not contain a readable book package.');

  const packageXml = strFromU8(archive[packagePath]);
  const basePath = packagePath.includes('/') ? packagePath.slice(0, packagePath.lastIndexOf('/')) : '';
  const manifest = new Map<string, string>();
  for (const match of packageXml.matchAll(/<item\b[^>]*\/?>/gi)) {
    const item = attributes(match[0]);
    if (item.id && item.href && /application\/xhtml\+xml|text\/html/i.test(item['media-type'] || '')) {
      manifest.set(item.id, resolveArchivePath(basePath, item.href));
    }
  }

  const spinePaths = [...packageXml.matchAll(/<itemref\b[^>]*\/?>/gi)]
    .map((match) => manifest.get(attributes(match[0]).idref))
    .filter((path): path is string => !!path);
  const contentPaths = spinePaths.length
    ? spinePaths
    : [...manifest.values()];
  const text = contentPaths
    .map((path) => archive[path] ? htmlToText(strFromU8(archive[path])) : '')
    .filter(Boolean)
    .join('\n\n');

  return {
    title: decodeEntities(xmlText(packageXml, 'title') || fallbackTitle),
    author: decodeEntities(xmlText(packageXml, 'creator') || 'Unknown author'),
    text,
  };
};

const titleFromFilename = (name: string): string =>
  name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Imported book';

export async function importBookFile(asset: DocumentPicker.DocumentPickerAsset): Promise<{ book: BookResult; text: string }> {
  const extension = asset.name.split('.').pop()?.toLowerCase();
  if (!extension || !['epub', 'txt', 'md'].includes(extension)) {
    throw new Error('Choose an EPUB, TXT, or Markdown (.md) book file.');
  }

  const bytes = await readFileBytes(asset);
  const fallbackTitle = titleFromFilename(asset.name);
  const imported = extension === 'epub'
    ? parseEpub(bytes, fallbackTitle)
    : { title: fallbackTitle, author: 'Unknown author', text: strFromU8(bytes).replace(/^\uFEFF/, '').trim() };

  if (imported.text.length < 20) {
    throw new Error('No readable book text was found in that file.');
  }

  return {
    book: {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: imported.title,
      author: imported.author,
    },
    text: imported.text,
  };
}
