/* আমার পাঠাগার — db.js
   IndexedDB layer: explicit versioning, upgrade migrations, CRUD helpers,
   cascade deletes, storage estimate. All functions return Promises.
   Failed writes surface real errors — callers show user-facing messages. */

import { normText } from './util.js';

export const DB_NAME = 'amarPathagar';
export const DB_VERSION = 1;

let _db = null;

function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (ev) => {
      const db = req.result;
      /* ---- migrations: v(n) → v(n+1). Never delete stores here. ---- */
      const migrations = {
        0: (db) => { // fresh install → v1
          const books = db.createObjectStore('books', { keyPath: 'id' });
          books.createIndex('language', 'language');
          books.createIndex('readingStatus', 'readingStatus');
          books.createIndex('ownershipStatus', 'ownershipStatus');
          books.createIndex('primaryGenre', 'primaryGenre');
          books.createIndex('isArchived', 'isArchived');
          books.createIndex('createdAt', 'createdAt');
          books.createIndex('updatedAt', 'updatedAt');
          const authors = db.createObjectStore('authors', { keyPath: 'id' });
          authors.createIndex('nameNorm', 'nameNorm');
          const pubs = db.createObjectStore('publishers', { keyPath: 'id' });
          pubs.createIndex('nameNorm', 'nameNorm');
          db.createObjectStore('collections', { keyPath: 'id' });
          const sess = db.createObjectStore('sessions', { keyPath: 'sessionId' });
          sess.createIndex('bookId', 'bookId');
          sess.createIndex('completionStatus', 'completionStatus');
          sess.createIndex('updatedAt', 'updatedAt');
          const jr = db.createObjectStore('journal', { keyPath: 'id' });
          jr.createIndex('bookId', 'bookId');
          jr.createIndex('createdAt', 'createdAt');
          const att = db.createObjectStore('attachments', { keyPath: 'attachmentId' });
          att.createIndex('bookId', 'bookId');
          db.createObjectStore('meta', { keyPath: 'key' });
        },
      };
      for (let v = ev.oldVersion; v < DB_VERSION; v++) {
        if (migrations[v]) migrations[v](db);
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB blocked by another tab'));
  });
}
export { open as openDB };

function tx(store, mode = 'readonly') {
  return open().then(db => db.transaction(store, mode).objectStore(store));
}
function reqAsPromise(req) {
  return new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });
}

/* ---------- generic CRUD ---------- */
export async function getAll(store) { return reqAsPromise((await tx(store)).getAll()); }
export async function get(store, id) { return reqAsPromise((await tx(store)).get(id)); }
export async function put(store, obj) {
  try {
    return reqAsPromise((await tx(store, 'readwrite')).put(obj));
  } catch (e) {
    if (e && (e.name === 'QuotaExceededError')) { const err = new Error('quota'); err.quota = true; throw err; }
    throw e;
  }
}
export async function bulkPut(store, arr) {
  if (!arr.length) return;
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    const os = t.objectStore(store);
    for (const o of arr) os.put(o);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('transaction aborted'));
  });
}
export async function del(store, id) { return reqAsPromise((await tx(store, 'readwrite')).delete(id)); }
export async function clearStore(store) { return reqAsPromise((await tx(store, 'readwrite')).clear()); }
export async function byIndex(store, index, value) {
  return reqAsPromise((await tx(store)).index(index).getAll(value));
}

/* ---------- meta ---------- */
export async function getMeta(key, def = null) {
  const r = await get('meta', key);
  return r ? r.value : def;
}
export async function setMeta(key, value) { return put('meta', { key, value }); }

/* ---------- domain helpers ---------- */
export async function deleteBookCascade(bookId, { deleteJournal = false } = {}) {
  const db = await open();
  const book = await get('books', bookId);
  if (!book) return { sessions: 0, attachments: 0, journal: 0 };
  const sessions = await byIndex('sessions', 'bookId', bookId);
  const attachments = await byIndex('attachments', 'bookId', bookId);
  const entries = await byIndex('journal', 'bookId', bookId);
  return new Promise((res, rej) => {
    const t = db.transaction(['books', 'sessions', 'attachments', 'journal'], 'readwrite');
    t.objectStore('sessions').index('bookId').getAll(IDBKeyRange.only(bookId)).onsuccess = function () {
      for (const s of this.result) t.objectStore('sessions').delete(s.sessionId);
    };
    t.objectStore('attachments').index('bookId').getAll(IDBKeyRange.only(bookId)).onsuccess = function () {
      for (const a of this.result) t.objectStore('attachments').delete(a.attachmentId);
    };
    if (deleteJournal) {
      t.objectStore('journal').index('bookId').getAll(IDBKeyRange.only(bookId)).onsuccess = function () {
        for (const j of this.result) t.objectStore('journal').delete(j.id);
      };
    }
    t.objectStore('books').delete(bookId);
    t.oncomplete = () => res({
      sessions: sessions.length, attachments: attachments.length,
      journal: deleteJournal ? entries.length : 0,
    });
    t.onerror = () => rej(t.error);
  });
}

export async function detachBookReferences(kind, id, books) {
  /* remove author/publisher/collection id from every book that references it */
  const affected = [];
  for (const b of books) {
    let changed = false;
    const strip = (arr) => { if (Array.isArray(arr) && arr.includes(id)) { arr = arr.filter(x => x !== id); changed = true; return arr; } return arr; };
    if (kind === 'author') {
      b.authors = strip(b.authors); b.translators = strip(b.translators);
      b.editors = strip(b.editors); b.illustrators = strip(b.illustrators);
    } else if (kind === 'publisher') b.publishers = strip(b.publishers);
    else if (kind === 'collection') b.customCollectionIds = strip(b.customCollectionIds);
    if (changed) { b.updatedAt = new Date().toISOString(); affected.push(b); }
  }
  await bulkPut('books', affected);
  return affected.length;
}

export async function deleteAuthorCascade(authorId, books) {
  const n = await detachBookReferences('author', authorId, books);
  await del('authors', authorId);
  return n;
}
export async function deletePublisherCascade(pubId, books) {
  const n = await detachBookReferences('publisher', pubId, books);
  await del('publishers', pubId);
  return n;
}
export async function deleteCollectionCascade(collId, books) {
  const n = await detachBookReferences('collection', collId, books);
  await del('collections', collId);
  return n;
}

/* ---------- wipe everything (Settings → Clear all) ---------- */
export async function wipeDatabase() {
  if (_db) { _db.close(); _db = null; }
  await new Promise((res, rej) => {
    const r = indexedDB.deleteDatabase(DB_NAME);
    r.onsuccess = () => res(); r.onerror = () => rej(r.error); r.onblocked = () => res();
  });
}

/* ---------- storage estimate ---------- */
export async function estimateStorage() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage: usage || 0, quota: quota || 0 };
    }
  } catch {}
  return { usage: null, quota: null };
}

/* ---------- persistence hint (avoid eviction) ---------- */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch {}
  return false;
}

export async function countAll() {
  const names = ['books', 'authors', 'publishers', 'collections', 'sessions', 'journal', 'attachments'];
  const out = {};
  for (const n of names) {
    try { out[n] = (await reqAsPromise((await tx(n)).count())); } catch { out[n] = 0; }
  }
  return out;
}

/* helper used at import time: normalized author name for dedupe */
export function authorKey(a) {
  return normText(a.nameBn || a.nameEn || a.aliases?.[0] || '');
}
