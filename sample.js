/* আমার পাঠাগার — sample.js
   Optional, clearly-labeled sample library. One click to load, one click
   (Settings) to remove. Never shown as real user data. */

import { buildSampleLibrary } from './seed.js';
import * as db from './db.js';
import * as S from './state.js';

const SAMPLE_TAG = 'নমুনা';

export async function loadSample() {
  const data = buildSampleLibrary();
  const now = new Date().toISOString();
  await db.bulkPut('authors', data.authors.map(a => ({ ...a, createdAt: a.createdAt || now, updatedAt: now })));
  await db.bulkPut('publishers', data.publishers.map(p => ({ ...p, createdAt: now, updatedAt: now })));
  await db.bulkPut('books', data.books);
  await db.bulkPut('sessions', data.sessions);
  await db.bulkPut('journal', data.journal);
  for (const b of data.books) if (b.tags) S.registerTags(b.tags);
  await S.refreshBooks(); await S.refreshAuthors(); await S.refreshPublishers();
  await S.refreshSessions(); await S.refreshJournal();
}

export async function removeSample() {
  const sampleBooks = S.state.books.filter(b => (b.tags || []).includes(SAMPLE_TAG));
  for (const b of sampleBooks) {
    await db.deleteBookCascade(b.id, { deleteJournal: true });
  }
  /* sample authors/publishers used only by sample books */
  const usedAuthorIds = new Set(S.state.books.flatMap(b => [...(b.authors || []), ...(b.translators || [])]));
  const sampleAuthorIds = ['au_rabindranath', 'au_nazrul', 'au_bibhutibhushan', 'au_jafar', 'au_waliullah', 'au_roy'];
  for (const id of sampleAuthorIds) {
    if (!usedAuthorIds.has(id)) await db.del('authors', id);
  }
  const usedPubIds = new Set(S.state.books.flatMap(b => b.publishers || []));
  for (const id of ['pb_prothoma', 'pb_biswabidyalay', 'pb_penguin']) {
    if (!usedPubIds.has(id)) await db.del('publishers', id);
  }
  state_genres_untouched();
  await S.refreshBooks(); await S.refreshAuthors(); await S.refreshPublishers();
  await S.refreshSessions(); await S.refreshJournal();
}

function state_genres_untouched() { /* genres/tags taxonomy is user data — never touched */ }
