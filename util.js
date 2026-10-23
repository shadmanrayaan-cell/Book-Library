/* আমার পাঠাগার — util.js
   Pure helpers with no DOM/IndexedDB dependencies (Node-testable). */

export function uid(prefix = 'id') {
  const rnd = (crypto && crypto.randomUUID)
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return `${prefix}_${rnd}`;
}

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ----- Bangla/Latin search normalization (documented layer) -----
   1. NFKD normalization → decomposes ড়/ঢ়/য় nukta forms into base+নুকতা
   2. strip U+09BC (nukta) → ড়≈ড+়, য়≈য+় unify across encodings
   3. strip ZWJ/ZWNJ (U+200C/D) and Bangla/Latin punctuation
   4. lowercase (Latin only; Bangla has no case)
   5. collapse whitespace
   Original spellings are always preserved in stored records. */
export function normText(s) {
  if (s == null) return '';
  let t = String(s).normalize('NFKD');
  t = t.replace(/[\u09BC\u200C\u200D]/g, '');
  t = t.toLowerCase();
  t = t.replace(/[\u0964\u0965!-/:-@[-`{-~\u2013\u2014\u2018\u2019\u201C\u201D.…]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export function toEnDigits(s) {
  return String(s ?? '').replace(/[০-৯]/g, d => String(BN_DIGITS.indexOf(d)));
}
export function toBnDigits(s) {
  return String(s ?? '').replace(/\d/g, d => BN_DIGITS[+d]);
}
export function parseNum(v) {
  if (v == null || v === '') return null;
  const n = Number(toEnDigits(String(v)).replace(/[^\d.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function cleanIsbn(v) {
  const s = toEnDigits(String(v ?? '')).replace(/[^0-9Xx]/g, '').toUpperCase();
  return s || null;
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(2) + ' GB';
}

export function todayISO() { return new Date().toISOString().slice(0, 10); }

export function fmtNum(n, lang = 'bn') {
  if (n == null || n === '') return '—';
  try {
    return new Intl.NumberFormat(lang === 'en' ? 'en-IN' : 'bn-IN').format(n);
  } catch { return String(n); }
}

const BN_MONTHS = ['জানুয়ারি','ফেব্রুয়ারি','মার্চ','এপ্রিল','মে','জুন','জুলাই','আগস্ট','সেপ্টেম্বর','অক্টোবর','নভেম্বর','ডিসেম্বর'];
export function fmtDate(iso, lang = 'bn') {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
  if (isNaN(d)) return String(iso);
  if (lang === 'en') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${d.getDate()} ${BN_MONTHS[d.getMonth()]} ${toBnDigits(d.getFullYear())}`;
}

export function fmtMonthLabel(y, m, lang = 'bn') {
  if (lang === 'en') return new Date(y, m, 1).toLocaleDateString('en-GB', { month: 'short' });
  return BN_MONTHS[m].slice(0, 4) + ' ' + toBnDigits(String(y).slice(2));
}

export function relTime(iso, lang = 'bn') {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diff = Date.now() - then;
  const day = 86400000;
  if (diff < 60000) return lang === 'en' ? 'just now' : 'এইমাত্র';
  if (diff < 3600000) { const m = Math.floor(diff / 60000); return lang === 'en' ? `${m}m ago` : `${toBnDigits(m)} মিনিট আগে`; }
  if (diff < day) { const h = Math.floor(diff / 3600000); return lang === 'en' ? `${h}h ago` : `${toBnDigits(h)} ঘণ্টা আগে`; }
  if (diff < day * 30) { const d = Math.floor(diff / day); return lang === 'en' ? `${d}d ago` : `${toBnDigits(d)} দিন আগে`; }
  return fmtDate(iso, lang);
}

export function yearOf(iso) { return iso ? String(iso).slice(0, 4) : null; }

export function debounce(fn, ms = 250) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function downloadFile(name, data, mime = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1]);
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}
export async function base64ToBlob(b64, mime) {
  const r = await fetch(`data:${mime || 'application/octet-stream'};base64,${b64}`);
  return r.blob();
}

export function validUrl(s) {
  try {
    const u = new URL(String(s).trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
  } catch { return null; }
}

/* Damerau-Levenshtein distance (optimal string alignment), capped. */
export function editDistance(a, b, max = 3) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[m][n];
}

/* clamp text to n chars on a word boundary */
export function truncate(s, n = 140) {
  s = String(s ?? '');
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  return cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : n) + '…';
}

export function groupCount(arr, keyFn) {
  const m = new Map();
  for (const it of arr) {
    const k = keyFn(it);
    if (k == null || k === '') continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return m;
}

export function deepClone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

export function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

export function bnInitial(s) {
  s = String(s || '').trim();
  return s ? [...s][0] : '•';
}
