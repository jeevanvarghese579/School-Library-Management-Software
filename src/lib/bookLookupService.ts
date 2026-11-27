import type { AppSettings } from '@/types';

export interface LookedUpBook {
  isbn: string;
  title: string;
  authors: string[];
  category: string | null;
  publisher: string | null;
  publishedDate: string | null;
  description: string | null;
  coverUrl: string | null;
  source: 'Google Books' | 'Open Library';
}

export function normalizeIsbn(value: string) {
  return value.replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isPossibleIsbn(value: string) {
  const isbn = normalizeIsbn(value);
  return /^\d{13}$/.test(isbn) || /^\d{9}[\dX]$/.test(isbn);
}

async function googleLookup(isbn: string, apiKey?: string | null): Promise<LookedUpBook | null> {
  const params = new URLSearchParams({ q: `isbn:${isbn}`, maxResults: '1', printType: 'books' });
  if (apiKey?.trim()) params.set('key', apiKey.trim());
  const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`);
  if (!response.ok) throw new Error(`Google Books returned ${response.status}.`);
  const payload = await response.json() as { items?: Array<{ volumeInfo?: Record<string, unknown> }> };
  const info = payload.items?.[0]?.volumeInfo;
  if (!info) return null;
  const imageLinks = info.imageLinks as Record<string, string> | undefined;
  return {
    isbn,
    title: String(info.title ?? ''),
    authors: Array.isArray(info.authors) ? info.authors.map(String) : [],
    category: Array.isArray(info.categories) ? String(info.categories[0] ?? '') || null : null,
    publisher: info.publisher ? String(info.publisher) : null,
    publishedDate: info.publishedDate ? String(info.publishedDate) : null,
    description: info.description ? String(info.description) : null,
    coverUrl: imageLinks?.thumbnail?.replace('http://', 'https://') ?? null,
    source: 'Google Books',
  };
}

async function openLibraryLookup(isbn: string): Promise<LookedUpBook | null> {
  const key = `ISBN:${isbn}`;
  const params = new URLSearchParams({ bibkeys: key, jscmd: 'data', format: 'json' });
  const response = await fetch(`https://openlibrary.org/api/books?${params}`);
  if (!response.ok) throw new Error(`Open Library returned ${response.status}.`);
  const payload = await response.json() as Record<string, Record<string, unknown>>;
  const info = payload[key];
  if (!info) return null;
  const cover = info.cover as Record<string, string> | undefined;
  const authors = Array.isArray(info.authors) ? info.authors as Array<Record<string, unknown>> : [];
  const subjects = Array.isArray(info.subjects) ? info.subjects as Array<Record<string, unknown>> : [];
  const publishers = Array.isArray(info.publishers) ? info.publishers as Array<Record<string, unknown>> : [];
  return {
    isbn,
    title: String(info.title ?? ''),
    authors: authors.map((author) => String(author.name ?? '')).filter(Boolean),
    category: subjects[0]?.name ? String(subjects[0].name) : null,
    publisher: publishers[0]?.name ? String(publishers[0].name) : null,
    publishedDate: info.publish_date ? String(info.publish_date) : null,
    description: info.notes ? String(info.notes) : null,
    coverUrl: cover?.medium ?? cover?.large ?? cover?.small ?? null,
    source: 'Open Library',
  };
}

export async function lookupBookByIsbn(isbnInput: string, settings: AppSettings) {
  const isbn = normalizeIsbn(isbnInput);
  if (!isPossibleIsbn(isbn)) throw new Error('Enter or scan a valid 10 or 13 digit ISBN.');
  const providers: Array<() => Promise<LookedUpBook | null>> = [];
  if (settings.google_books_enabled !== false) providers.push(() => googleLookup(isbn, settings.google_books_api_key));
  if (settings.open_library_enabled !== false) providers.push(() => openLibraryLookup(isbn));
  if (providers.length === 0) throw new Error('Enable at least one book information provider in Settings.');

  const errors: string[] = [];
  for (const provider of providers) {
    try {
      const result = await provider();
      if (result?.title) return result;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Provider request failed.');
    }
  }
  if (errors.length === providers.length) throw new Error(errors.join(' '));
  return null;
}
