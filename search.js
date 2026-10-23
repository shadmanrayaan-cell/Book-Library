/* আমার পাঠাগার — search.js
   Bangla-first search engine.
   - Unicode-safe normalization (see util.normText: NFKD, nukta/ZWJ strip, casefold)
   - AND token matching across weighted fields
   - Optional approximate (typo-tolerant) fallback for Latin tokens
   - Duplicate detection by ISBN / normalized title+author
   In-memory index rebuilt from state — fast for several thousand records. */

import { normText, editDistance, cleanIsbn } from './util.js';

let INDEX = [];          // [{id, title, author, other, notes, titlesTok, authorsTok}]
let NOTE_INDEX = [];     // journal entries: [{id, hay}]
let byId = new Map();

export function rebuild(books, authors, publishers, genres, journal, includeNotes) {
  byId = new Map(books.map(b => [b.id, b]));
  const authorById = new Map(authors.map(a => [a.id, a]));
  const pubById = new Map(publishers.map(p => [p.id, p]));
  const genreName = new Map((genres || []).map(g => [g.id, normText([g.nameBn, g.nameEn].filter(Boolean).join(' '))]));

  INDEX = books.map(b => {
    const titles = [b.titleBn, b.titleEn, b.originalTitle, b.transliteratedTitle, ...(b.alternateTitles || [])].filter(Boolean);
    const authorsTxt = (b.authors || []).concat(b.translators || [], b.editors || [], b.illustrators || [])
      .map(id => authorById.get(id))
      .filter(Boolean)
      .flatMap(a => [a.nameBn, a.nameEn, ...(a.aliases || [])])
      .filter(Boolean);
    const pubsTxt = (b.publishers || []).map(id => pubById.get(id)).filter(Boolean)
      .flatMap(p => [p.nameBn, p.nameEn, ...(p.aliases || [])]).filter(Boolean);
    const genresTxt = [b.primaryGenre, ...(b.genres || [])].filter(Boolean).map(g => genreName.get(g) || normText(g));
    const other = [
      ...pubsTxt, ...genresTxt, ...(b.tags || []), ...(b.subjects || []),
      b.seriesName, b.isbn10, b.isbn13, b.targetAudience, b.shelfLocation, b.bookcase,
    ].filter(Boolean);

    const notesOn = includeNotes ? [
      b.personalReview, b.keyTakeaways, b.favouriteQuotes, b.privateNotes,
    ].filter(Boolean).join(' ') : '';

    const t = normText(titles.join(' '));
    const a = normText(authorsTxt.join(' '));
    const o = normText(other.join(' '));
    return {
      id: b.id, title: t, author: a, other: o, notes: normText(notesOn),
      titlesTok: t.split(' ').filter(w => w.length > 1),
      authorsTok: a.split(' ').filter(w => w.length > 1),
    };
  });

  NOTE_INDEX = includeNotes
    ? (journal || []).map(j => ({ id: j.id, hay: normText([j.title, j.body, j.quoteText].filter(Boolean).join(' ')) }))
    : [];
}

function scoreEntry(e, toks) {
  let score = 0;
  for (const tok of toks) {
    let s = 0;
    if (e.title.includes(tok)) s += 3;
    else if (e.titlesTok.some(w => w.startsWith(tok))) s += 2.5;
    if (e.author.includes(tok)) s += 2;
    if (e.other.includes(tok)) s += 1;
    if (e.notes && e.notes.includes(tok)) s += 1;
    if (!s) return 0;           // AND semantics: every token must match
    score += s;
  }
  return score;
}

function fuzzyScoreEntry(e, toks) {
  let score = 0;
  for (const tok of toks) {
    const latin = /^[a-z0-9]+$/.test(tok);
    let s = scoreEntry(e, [tok]);
    if (!s && latin && tok.length >= 5) {
      const maxD = tok.length >= 8 ? 2 : 1;
      const pool = e.titlesTok.concat(e.authorsTok);
      let hit = false;
      for (const w of pool) {
        if (Math.abs(w.length - tok.length) > maxD) continue;
        if (editDistance(tok, w, maxD) <= maxD) { hit = true; break; }
      }
      if (hit) s = 1.5;
    }
    if (!s) return 0;
    score += s;
  }
  return score;
}

export function query(q, { limit = 300 } = {}) {
  const toks = normText(q).split(' ').filter(Boolean);
  if (!toks.length) return [];
  const results = [];
  for (const e of INDEX) {
    const s = scoreEntry(e, toks);
    if (s > 0) results.push({ id: e.id, score: s, noteMatch: false });
  }
  if (!results.length) {
    for (const e of INDEX) {
      const s = fuzzyScoreEntry(e, toks);
      if (s > 0) results.push({ id: e.id, score: s * 0.5, noteMatch: false, fuzzy: true });
    }
  }
  const noteHits = new Set();
  for (const n of NOTE_INDEX) {
    if (toks.every(tok => n.hay.includes(tok))) noteHits.add(n.id);
  }
  const seen = new Set();
  results.sort((a, b) => b.score - a.score);
  const out = [];
  for (const r of results) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    r.noteHit = noteHits.has(r.id);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

export function buildNoteIndex(journal) {
  NOTE_INDEX = (journal || []).map(j => ({ id: j.id, hay: normText([j.title, j.body, j.quoteText].filter(Boolean).join(' ')) }));
}

export function searchJournal(q) {
  const toks = normText(q).split(' ').filter(Boolean);
  if (!toks.length) return null;
  return new Set(NOTE_INDEX.filter(n => toks.every(t => n.hay.includes(t))).map(n => n.id));
}

/* ---------- duplicate detection ----------
   Strong: matching ISBN-13/10 (digits-only compare).
   Probable: same normalized title AND (shared author OR both authorless). */
export function findDuplicates(candidate, books) {
  const out = [];
  const tBn = normText(candidate.titleBn);
  const tEn = normText(candidate.titleEn);
  const tAlt = (candidate.alternateTitles || []).map(normText).filter(Boolean);
  const tTranslit = normText(candidate.transliteratedTitle);
  const isbn13 = cleanIsbn(candidate.isbn13);
  const isbn10 = cleanIsbn(candidate.isbn10);
  const myAuthors = new Set((candidate.authors || []).concat(candidate.translators || []));
  const exclude = candidate.id;

  for (const b of books) {
    if (exclude != null && b.id === exclude) continue;
    let reason = null;
    if ((isbn13 && cleanIsbn(b.isbn13) === isbn13) || (isbn10 && cleanIsbn(b.isbn10) === isbn10)) reason = 'isbn';
    if (!reason) {
      const bAlt = (b.alternateTitles || []).map(normText);
      const names = [normText(b.titleBn), normText(b.titleEn), ...bAlt];
      const sameTitle =
        (tBn && names.includes(tBn)) || (tEn && names.includes(tEn)) ||
        (tTranslit && [normText(b.transliteratedTitle), ...bAlt].includes(tTranslit)) ||
        (tBn && bAlt.includes(tBn)) || (tEn && bAlt.includes(tEn));
      if (sameTitle) {
        /* title match alone is enough for a non-blocking duplicate warning;
           different editions are never auto-merged */
        reason = 'title';
      }
    }
    if (reason) out.push({ book: b, reason });
  }
  return out;
}
