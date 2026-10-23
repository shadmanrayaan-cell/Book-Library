/* আমার পাঠাগার — csv.js
   RFC-4180-style CSV parser/serializer (quotes, embedded commas/newlines),
   delimiter auto-detection, flexible column mapping (Bangla + English
   header aliases), row validation, Bangla digit normalization. */

import { parseNum, cleanIsbn, normText } from './util.js';
import { GENRE_ID_BY_BN, GENRE_ID_BY_EN } from './seed.js';

/* ---------- parse ---------- */
export function detectDelimiter(text) {
  const firstLine = text.slice(0, text.indexOf('\n') > -1 ? text.indexOf('\n') : text.length);
  const candidates = [',', ';', '\t', '|'];
  let best = ',', bestN = -1;
  for (const c of candidates) {
    const n = countOutsideQuotes(firstLine, c);
    if (n > bestN) { best = c; bestN = n; }
  }
  return best;
}
function countOutsideQuotes(line, ch) {
  let n = 0, inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (inQ && line[i + 1] === '"') i++; else inQ = !inQ; }
    else if (c === ch && !inQ) n++;
  }
  return n;
}

export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
  const delim = detectDelimiter(text);
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);
  return { rows, delimiter: delim };
}

/* ---------- serialize ---------- */
export function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  if (/[",\n\r;]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}
export function serializeCSV(rows) {
  return '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');
}

/* ---------- column dictionary ---------- */
const C = (aliases) => aliases;
export const CSV_FIELDS = {
  titleBn:   C(['titlebn', 'title_bn', 'বইয়ের নাম', 'নাম (বাংলা)', 'শিরোনাম (বাংলা)', 'বাংলা নাম', 'বইয়ের নাম (বাংলা)', 'title (bangla)']),
  titleEn:   C(['titleen', 'title_en', 'english title', 'ইংরেজি নাম', 'নাম (ইংরেজি)', 'শিরোনাম (ইংরেজি)', 'title (english)', 'title']),
  alternateTitles: C(['alternatetitles', 'alternate_titles', 'aliases', 'অন্যান্য নাম', 'অন্য নাম']),
  transliteratedTitle: C(['transliteratedtitle', 'transliterated_title', 'transliteration', 'রোমান বানান']),
  language:  C(['language', 'ভাষা']),
  originalLanguage: C(['originallanguage', 'original_language', 'মূল ভাষা']),
  isbn:      C(['isbn', 'isbn13', 'isbn-13', 'isbn10', 'isbn-10']),
  authors:   C(['authors', 'author', 'লেখক', 'লেখকের নাম', 'author(s)']),
  translators: C(['translators', 'translator', 'অনুবাদক']),
  publishers: C(['publisher', 'publishers', 'প্রকাশক', 'প্রকাশনা']),
  publicationYear: C(['year', 'publicationyear', 'publication_year', 'publication year', 'প্রকাশকাল', 'প্রকাশ সাল', 'সাল']),
  pageCount: C(['pages', 'pagecount', 'page_count', 'page count', 'পৃষ্ঠা', 'মোট পৃষ্ঠা', 'পৃষ্ঠা সংখ্যা']),
  primaryGenre: C(['genre', 'primarygenre', 'primary_genre', 'ধরন', 'বিষয়', 'বিষয়বস্তু']),
  tags:      C(['tags', 'tag', 'ট্যাগ']),
  seriesName: C(['series', 'seriesname', 'সিরিজ']),
  edition:   C(['edition', 'সংস্করণ']),
  ownershipStatus: C(['ownership', 'ownershipstatus', 'মালিকানা']),
  readingStatus: C(['status', 'readingstatus', 'reading status', 'অবস্থা', 'পড়ার অবস্থা']),
  priority:  C(['priority', 'অগ্রাধিকার']),
  shelfLocation: C(['shelf', 'shelflocation', 'তাক', 'শেলফ']),
  rating:    C(['rating', 'রেটিং']),
  personalReview: C(['review', 'personalreview', 'রিভিউ', 'মতামত']),
  privateNotes: C(['notes', 'note', 'নোট', 'মন্তব্য']),
  acquisitionDate: C(['acquisitiondate', 'acquired', 'সংগ্রহের তারিখ']),
  plannedReadingDate: C(['planneddate', 'planned', 'পরিকল্পিত তারিখ']),
};

/* auto-map headers */
export function guessMapping(headers) {
  const norm = (h) => normText(h).replace(/\s+/g, ' ');
  const mapping = new Array(headers.length).fill('');
  const used = new Set();
  headers.forEach((h, i) => {
    const nh = norm(h);
    for (const [field, aliases] of Object.entries(CSV_FIELDS)) {
      if (used.has(field)) continue;
      if (aliases.some(a => norm(a) === nh)) { mapping[i] = field; used.add(field); return; }
    }
  });
  headers.forEach((h, i) => {
    if (mapping[i]) return;
    const nh = norm(h);
    for (const [field, aliases] of Object.entries(CSV_FIELDS)) {
      if (used.has(field)) continue;
      if (aliases.some(a => { const na = norm(a); return na.length > 3 && (nh.includes(na) || na.includes(nh)); })) {
        mapping[i] = field; used.add(field); return;
      }
    }
  });
  return mapping;
}

/* ---------- value converters ---------- */
const STATUS_WORDS = {
  'to-read': 'to-read', 'toread': 'to-read', 'to read': 'to-read', 'unread': 'to-read',
  'reading': 'reading', 'currently reading': 'reading', 'in progress': 'reading',
  'completed': 'completed', 'complete': 'completed', 'finished': 'completed', 'read': 'completed', 'done': 'completed',
  'paused': 'paused', 'on hold': 'paused', 'hold': 'paused',
  'abandoned': 'abandoned', 'dropped': 'abandoned', 'dnf': 'abandoned',
  'পড়ার অপেক্ষায়': 'to-read', 'পড়তে হবে': 'to-read', 'পড়ার তালিকা': 'to-read', 'অপঠিত': 'to-read', 'কিন্তু পড়িনি': 'to-read',
  'পড়ছি': 'reading', 'পড়া চলছে': 'reading', 'চলমান': 'reading',
  'সমাপ্ত': 'completed', 'পড়া হয়েছে': 'completed', 'শেষ': 'completed', 'পঠিত': 'completed',
  'বিরত': 'paused', 'বিরতি': 'paused',
  'ছেড়ে দেওয়া': 'abandoned', 'ছেড়ে দিয়েছি': 'abandoned', 'বাদ': 'abandoned',
};
const LANG_WORDS = {
  'bn': 'bn', 'bangla': 'bn', 'bengali': 'bn', 'বাংলা': 'bn', 'বাংলা বই': 'bn',
  'en': 'en', 'english': 'en', 'ইংরেজি': 'en', 'ইংরেজি বই': 'en', 'ingreji': 'en',
  'bilingual': 'bilingual', 'দ্বিভাষিক': 'bilingual',
  'other': 'other', 'অন্যান্য': 'other', 'অন্য': 'other',
};
const OWN_WORDS = {
  'owned': 'owned', 'own': 'owned', 'মালিকানাধীন': 'owned', 'আছে': 'owned', 'কেনা': 'owned',
  'borrowed': 'borrowed', 'ধার করা': 'borrowed', 'ধার': 'borrowed',
  'wishlist': 'wishlist', 'wish': 'wishlist', 'ইচ্ছে-তালিকা': 'wishlist', 'ইচ্ছে তালিকা': 'wishlist', 'কিনতে হবে': 'wishlist',
  'library': 'library-access', 'library-access': 'library-access', 'লাইব্রেরি': 'library-access',
};
const PRI_WORDS = { 'high': 'high', 'উচ্চ': 'high', 'medium': 'medium', 'মধ্যম': 'medium', 'low': 'low', 'নিম্ন': 'low' };

function mapWord(map, v) {
  if (!v) return '';
  const n = normText(v);
  if (map[n]) return map[n];
  for (const [k, val] of Object.entries(map)) {
    if (normText(k) === n) return val;
  }
  return '';
}
function splitNames(v) {
  if (!v) return [];
  let parts;
  const s = String(v).trim();
  if (s.includes(';')) parts = s.split(';');
  else if (s.includes('|')) parts = s.split('|');
  else if (s.includes('&&')) parts = s.split('&&');
  else parts = s.split(',');
  return parts.map(x => x.trim()).filter(Boolean);
}
function parseDateGuess(v) {
  if (!v) return '';
  const s = toEn(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; // DD/MM/YYYY
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().slice(0, 10);
  return '';
}
function toEn(s) { return String(s ?? '').replace(/[০-৯]/g, d => '০১২৩৪৫৬৭৮৯'.indexOf(d)); }

export function convertLanguage(v) { return mapWord(LANG_WORDS, v) || (v ? 'other' : ''); }

/* ---------- row → draft book ---------- */
export function rowToDraft(row, headers, mapping, ctx) {
  const g = (field) => {
    const i = mapping.indexOf(field);
    return i >= 0 ? String(row[i] ?? '').trim() : '';
  };
  const errors = [];
  const warnings = [];
  const titleBn = g('titleBn');
  const titleEn = g('titleEn');
  if (!titleBn && !titleEn) errors.push('errTitleMissing');

  const langRaw = g('language');
  const authors = splitNames(g('authors'));
  const book = {
    titleBn, titleEn,
    alternateTitles: splitNames(g('alternateTitles')),
    transliteratedTitle: g('transliteratedTitle') || '',
    language: convertLanguage(langRaw) || ctx.defaultLanguage || 'bn',
    originalLanguage: g('originalLanguage') || '',
    isbn10: '', isbn13: '',
    authors: [], translators: [], editors: [], illustrators: [], contributorsNotes: '',
    publishers: [], publicationYear: null, edition: '', volumeNumber: '', seriesName: '',
    pageCount: parseNum(g('pageCount')), countryOfPublication: '', publicationNotes: '',
    primaryGenre: '', genres: [], tags: splitNames(g('tags')), subjects: [], targetAudience: '',
    customCollectionIds: [],
    ownershipStatus: mapWord(OWN_WORDS, g('ownershipStatus')) || 'owned',
    physicalCopyCount: 0, physicalCondition: '', shelfLocation: g('shelfLocation') || '',
    bookcase: '', acquisitionDate: parseDateGuess(g('acquisitionDate')), acquisitionPrice: '',
    sourceOfAcquisition: '', lendingStatus: 'none', borrowerName: '', lendingDate: '', expectedReturnDate: '',
    formats: [],
    readingStatus: mapWord(STATUS_WORDS, g('readingStatus')) || ctx.defaultStatus || 'to-read',
    preferredMedium: 'physical', priority: mapWord(PRI_WORDS, g('priority')) || 'medium',
    plannedReadingDate: parseDateGuess(g('plannedReadingDate')), estimatedMinutes: null, reasonForReading: '',
    rating: parseNum(g('rating')), personalReview: g('personalReview') || '',
    keyTakeaways: '', favouriteQuotes: '', privateNotes: g('privateNotes') || '',
    wouldRecommend: null, rereadStatus: 'none', isArchived: false,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };

  const isbn = cleanIsbn(g('isbn'));
  if (isbn) { if (isbn.length === 13) book.isbn13 = isbn; else if (isbn.length === 10) book.isbn10 = isbn; }

  const year = parseNum(g('publicationYear'));
  if (year != null) {
    if (year > 0 && year < 2200) book.publicationYear = Math.round(year);
    else warnings.push('yearInvalid');
  }
  if (book.rating != null) {
    book.rating = Math.min(5, Math.max(0, book.rating));
  }

  /* genre → id */
  const gRaw = g('primaryGenre');
  if (gRaw) {
    let gid = GENRE_ID_BY_BN.get(gRaw) || GENRE_ID_BY_EN.get(normText(gRaw)) || ctx.genreIds.get(normText(gRaw));
    if (!gid) {
      gid = ctx.newGenreId(gRaw);
    }
    book.primaryGenre = gid;
    book.genres = [gid];
  }
  /* authors/publishers → ids (deduped via ctx) */
  for (const name of authors) book.authors.push(ctx.authorId(name));
  const trans = splitNames(g('translators'));
  for (const name of trans) book.translators.push(ctx.authorId(name));
  const pubs = splitNames(g('publishers'));
  for (const name of pubs) book.publishers.push(ctx.publisherId(name));

  return { book, errors, warnings };
}

export const EXPORT_COLUMNS = [
  ['titleBn', 'বইয়ের নাম (বাংলা)'], ['titleEn', 'Title (English)'],
  ['authors', 'লেখক'], ['translators', 'অনুবাদক'], ['publishers', 'প্রকাশক'],
  ['language', 'ভাষা'], ['publicationYear', 'প্রকাশকাল'], ['pageCount', 'পৃষ্ঠা'],
  ['primaryGenre', 'ধরন'], ['tags', 'ট্যাগ'], ['seriesName', 'সিরিজ'], ['edition', 'সংস্করণ'],
  ['isbn', 'ISBN'], ['ownershipStatus', 'মালিকানা'], ['readingStatus', 'পড়ার অবস্থা'],
  ['priority', 'অগ্রাধিকার'], ['shelfLocation', 'তাক'], ['rating', 'রেটিং'],
  ['personalReview', 'রিভিউ'], ['privateNotes', 'নোট'],
  ['acquisitionDate', 'সংগ্রহের তারিখ'], ['plannedReadingDate', 'পরিকল্পিত তারিখ'],
];

export const TEMPLATE_CSV = [
  ['বইয়ের নাম (বাংলা)', 'Title (English)', 'লেখক', 'প্রকাশক', 'ভাষা', 'প্রকাশকাল', 'পৃষ্ঠা', 'ধরন', 'পড়ার অবস্থা', 'মালিকানা', 'অগ্রাধিকার', 'তাক', 'রেটিং', 'ট্যাগ', 'রিভিউ', 'নোট'],
  ['পথের পাঁচালী', 'Pather Panchali', 'বিভূতিভূষণ বন্দ্যোপাধ্যায়', 'প্রথমা প্রকাশন', 'বাংলা', '১৯২৯', '৬২৪', 'উপন্যাস', 'সমাপ্ত', 'মালিকানাধীন', 'মধ্যম', 'উপন্যাস তাক-১', '৪.৫', 'ক্লাসিক, বাংলা', 'অপু-দুর্গার জগৎ অসাধারণ।', ''],
  ['', 'The God of Small Things', 'Arundhati Roy', 'Penguin Books', 'English', '1997', '340', 'Novel', 'Completed', 'Owned', 'Medium', '', '5', 'fiction', ' Booker winner, lush prose.', ''],
  ['লালসালু', 'Lal Salu', 'সৈয়দ ওয়ালীউল্লাহ', 'প্রথমা প্রকাশন', 'বাংলা', '', '', 'উপন্যাস', 'পড়ার অপেক্ষায়', 'মালিকানাধীন', 'উচ্চ', '', '', '', '', ''],
  ['', 'A Brief History of Time', 'Stephen Hawking', '', 'English', '1988', '256', 'Science', 'To Read', 'Wishlist', 'Low', '', '', '', '', ''],
].map(r => r.map(csvCell).join(',')).join('\r\n');
