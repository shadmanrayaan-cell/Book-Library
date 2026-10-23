/* আমার পাঠাগার — state.js
   In-memory caches over IndexedDB + localStorage-backed preferences.
   After any mutation, views call refresh*() then re-render. */

import * as db from './db.js';
import { SEED_GENRES, DEFAULT_SETTINGS } from './seed.js';
import { rebuild as searchRebuild } from './search.js';
import { setLang } from './i18n.js';

export const state = {
  ready: false,
  books: [], authors: [], publishers: [], collections: [],
  sessions: [], journal: [], attachments: [],
  genres: [], tags: [], queueOrder: [],
};

/* ---------- preferences (localStorage: lightweight only) ---------- */
const PREFS_KEY = 'ap.prefs';
let _prefs = { ...DEFAULT_SETTINGS };
try {
  const raw = localStorage.getItem(PREFS_KEY);
  if (raw) _prefs = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  if (_prefs.goals) _prefs.goals = { ...DEFAULT_SETTINGS.goals, ..._prefs.goals };
} catch { _prefs = { ...DEFAULT_SETTINGS }; }

export function prefs() { return _prefs; }
export function savePrefs(patch) {
  _prefs = { ..._prefs, ...patch };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(_prefs)); } catch {}
  return _prefs;
}
export function uiLang() { return _prefs.uiLang || 'bn'; }

/* ---------- load everything ---------- */
export async function loadAll() {
  const [books, authors, publishers, collections, sessions, journal, attachments, genresMeta, tagsMeta, queueOrder] =
    await Promise.all([
      db.getAll('books'), db.getAll('authors'), db.getAll('publishers'),
      db.getAll('collections'), db.getAll('sessions'), db.getAll('journal'), db.getAll('attachments'),
      db.getMeta('genres', null), db.getMeta('tags', []), db.getMeta('queueOrder', []),
    ]);
  state.books = books; state.authors = authors; state.publishers = publishers;
  state.collections = collections; state.sessions = sessions; state.journal = journal;
  state.attachments = attachments;
  state.genres = Array.isArray(genresMeta) && genresMeta.length ? genresMeta : SEED_GENRES;
  state.tags = Array.isArray(tagsMeta) ? tagsMeta : [];
  state.queueOrder = Array.isArray(queueOrder) ? queueOrder : [];
  setLang(_prefs.uiLang);
  refreshSearch();
  state.ready = true;
}

export function refreshSearch() {
  searchRebuild(state.books, state.authors, state.publishers, state.genres, state.journal, !!_prefs.searchNotes);
}

export async function refreshBooks() {
  state.books = await db.getAll('books');
  refreshSearch();
}
export async function refreshAuthors() { state.authors = await db.getAll('authors'); refreshSearch(); }
export async function refreshPublishers() { state.publishers = await db.getAll('publishers'); refreshSearch(); }
export async function refreshCollections() { state.collections = await db.getAll('collections'); }
export async function refreshSessions() { state.sessions = await db.getAll('sessions'); }
export async function refreshJournal() { state.journal = await db.getAll('journal'); refreshSearch(); }
export async function refreshAttachments() { state.attachments = await db.getAll('attachments'); }

/* ---------- derived lookups ---------- */
export function bookById(id) { return state.books.find(b => b.id === id) || null; }
export function authorById(id) { return state.authors.find(a => a.id === id) || null; }
export function publisherById(id) { return state.publishers.find(p => p.id === id) || null; }
export function collectionById(id) { return state.collections.find(c => c.id === id) || null; }
export function genreById(id) { return state.genres.find(g => g.id === id) || null; }

export function genreLabel(id, lang = 'bn') {
  const g = genreById(id);
  if (!g) return id || '';
  return lang === 'en' ? (g.nameEn || g.nameBn) : (g.nameBn || g.nameEn);
}
export function authorLabel(id, lang = 'bn') {
  const a = authorById(id);
  if (!a) return '';
  if (lang === 'en') return a.nameEn || a.nameBn || '';
  return a.nameBn || a.nameEn || '';
}
export function bookAuthors(book, lang = 'bn') {
  return (book.authors || []).map(id => authorLabel(id, lang)).filter(Boolean).join(', ');
}
export function bookPublishers(book, lang = 'bn') {
  return (book.publishers || []).map(id => {
    const p = publisherById(id); if (!p) return '';
    return lang === 'en' ? (p.nameEn || p.nameBn) : (p.nameBn || p.nameEn);
  }).filter(Boolean).join(', ');
}

export async function ensureGenresSeeded() {
  if (!state.genres.length) {
    state.genres = SEED_GENRES;
    await db.setMeta('genres', SEED_GENRES);
  }
}

export async function addGenre(nameBn, nameEn) {
  const id = 'gn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const g = { id, nameBn: nameBn || '', nameEn: nameEn || '' };
  state.genres.push(g);
  await db.setMeta('genres', state.genres);
  return g;
}
export async function updateGenres() { await db.setMeta('genres', state.genres); }
export async function updateTags() { await db.setMeta('tags', state.tags); }

export function allTags() {
  const set = new Set(state.tags);
  for (const b of state.books) (b.tags || []).forEach(t => set.add(t));
  return [...set].sort((a, b) => a.localeCompare(b, 'bn'));
}
export function registerTags(tags) {
  let changed = false;
  for (const t of tags || []) if (!state.tags.includes(t)) { state.tags.push(t); changed = true; }
  if (changed) db.setMeta('tags', state.tags);
}

/* ---------- queue order ---------- */
export function queuedBooks() {
  const q = state.books.filter(b => !b.isArchived && (b.readingStatus === 'to-read' || b.readingStatus === 'paused'));
  const order = state.queueOrder.filter(id => q.some(b => b.id === id));
  for (const b of q) if (!order.includes(b.id)) order.push(b.id);
  return order.map(id => bookById(id));
}
export async function saveQueueOrder(ids) {
  state.queueOrder = ids;
  await db.setMeta('queueOrder', ids);
}

/* ---------- reading sessions ---------- */
export function activeSessionFor(bookId) {
  return state.sessions.find(s => s.bookId === bookId && s.completionStatus === 'active') || null;
}
export function sessionsFor(bookId) {
  return state.sessions.filter(s => s.bookId === bookId)
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
}
export function sessionProgress(session, book) {
  if (!session) return { pct: null, pages: null };
  const from = session.startingPage ?? 1;
  const pageCount = book?.pageCount || null;
  if (pageCount && pageCount > 0) {
    const cur = session.completionStatus === 'completed' ? (session.endingPage ?? session.currentPage ?? pageCount) : (session.currentPage ?? from);
    const denom = pageCount - from;
    const pct = denom > 0 ? Math.min(100, Math.max(0, ((cur - from) / denom) * 100)) : (session.completionStatus === 'completed' ? 100 : null);
    return { pct, pages: cur };
  }
  if (typeof session.manualProgress === 'number') return { pct: Math.min(100, Math.max(0, session.manualProgress)), pages: null };
  return { pct: null, pages: session.currentPage ?? null };
}

/* ---------- stats ---------- */
export function completedDates() {
  return state.sessions
    .filter(s => s.completionStatus === 'completed' && s.endDate)
    .map(s => s.endDate.slice(0, 10));
}

/* first-run helpers */
export function hasData() {
  return state.books.length > 0;
}
