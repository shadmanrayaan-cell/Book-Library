/* আমার পাঠাগার — app.js
   Bootstrap: IndexedDB open → state load → hash router → view render.
   Theme management, nav state, breadcrumbs, offline indicator, SW. */

import { esc, fmtNum } from './util.js';
import { t, sub, setLang, applyStatic } from './i18n.js';
import * as db from './db.js';
import * as S from './state.js';
import { toast } from './components.js';
import { openBookForm } from './book-form.js';
import { render as dashboardView } from './views/dashboard.js';
import { render as booksView } from './views/books.js';
import { render as bookDetailView } from './views/book-detail.js';
import { renderAuthors, renderPublishers } from './views/people.js';
import { renderQueue, renderReading, renderCompleted } from './views/reading.js';
import { render as digitalView } from './views/digital.js';
import { render as collectionsView } from './views/collections.js';
import { render as journalView } from './views/journal.js';
import { render as dataView } from './views/data.js';
import { render as settingsView } from './views/settings.js';

const main = document.getElementById('main');
let currentRender = null;

/* ---------- theme ---------- */
function applyTheme() {
  const pref = S.prefs().theme || 'light';
  let dark = pref === 'dark';
  if (pref === 'auto') {
    dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const label = document.getElementById('themeBtnLabel');
  const icon = document.getElementById('themeIcon')?.querySelector('use');
  const darkNow = document.documentElement.getAttribute('data-theme') === 'dark';
  if (label) label.textContent = darkNow ? t('st.themeLight') : t('st.themeDark');
  if (icon) icon.setAttribute('href', darkNow ? '#i-sun' : '#i-moon');
  const meta = document.querySelector('meta[name="theme-color"]:not([media])') || document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', darkNow ? '#17130e' : '#faf6ef');
}
document.addEventListener('ap:theme', applyTheme);
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if ((S.prefs().theme || 'light') === 'auto') applyTheme();
});

/* ---------- fonts ---------- */
function applyFont() {
  const serif = (S.prefs().fontBody === 'serif');
  document.body.style.setProperty('--font-ui', serif
    ? "var(--font-display),'Inter','Nirmala UI',sans-serif"
    : "'Noto Sans Bengali','Noto Sans Bengali UI','Inter','Nirmala UI','Segoe UI',system-ui,sans-serif");
}

/* ---------- routes ---------- */
const ROUTES = {
  'dashboard':   { title: 'nav.dashboard', render: (el) => dashboardView(el) },
  'books':       { title: 'nav.books', render: (el) => booksView(el, { presetKey: 'all', preset: { title: t('nav.books'), en: sub('nav.books') } }) },
  'bangla-books':{ title: 'nav.bangla', render: (el) => booksView(el, { presetKey: 'bn', preset: { title: t('nav.bangla'), en: sub('nav.bangla'), language: 'bn', locked: ['lang'] } }) },
  'authors':     { title: 'nav.authors', render: (el, ctx) => renderAuthors(el, ctx) },
  'publishers':  { title: 'nav.publishers', render: (el, ctx) => renderPublishers(el, ctx) },
  'queue':       { title: 'nav.queue', render: (el) => renderQueue(el) },
  'reading':     { title: 'nav.reading', render: (el) => renderReading(el) },
  'completed':   { title: 'nav.completed', render: (el) => renderCompleted(el) },
  'digital':     { title: 'nav.digital', render: (el) => digitalView(el) },
  'collections': { title: 'nav.collections', render: (el, ctx) => collectionsView(el, ctx) },
  'journal':     { title: 'nav.journal', render: (el, ctx) => journalView(el, ctx) },
  'data':        { title: 'nav.data', render: (el) => dataView(el) },
  'settings':    { title: 'nav.settings', render: (el) => settingsView(el) },
  'book':        { title: '', render: (el, ctx) => bookDetailView(el, ctx) },
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const segs = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(queryPart || '');
  return { route: segs[0] || 'dashboard', params: segs.slice(1), query };
}

function setNav(route) {
  document.querySelectorAll('.nav-item').forEach(a => {
    a.classList.toggle('active', a.dataset.route === route || (route === 'book' && a.dataset.route === 'books'));
  });
}

function setCrumbs(items) {
  const c = document.getElementById('crumbs');
  c.innerHTML = items.map((it, i) => {
    if (i === items.length - 1) return `<span class="crumb-here">${esc(it.label)}</span>`;
    return `<a href="${esc(it.href)}">${esc(it.label)}</a><span class="crumb-sep">/</span>`;
  }).join('');
}

function closeMobileNav() { document.body.classList.remove('nav-open'); document.getElementById('navOverlay').hidden = true; }

/* ---------- render current route ---------- */
async function renderRoute() {
  const { route, params, query } = parseHash();
  const def = ROUTES[route] || ROUTES['dashboard'];
  currentRender?.destroy?.();
  currentRender = null;
  main.innerHTML = `<div class="muted" style="padding:40px;text-align:center">${esc(t('common.loading'))}</div>`;
  setNav(route);
  closeMobileNav();

  const titleKey = def.title;
  const crumbItems = [{ label: t('nav.home'), href: '#/dashboard' }];
  if (['book'].includes(route)) {
    crumbItems.push({ label: t('nav.books'), href: '#/books' });
    const b = S.bookById(params[0]);
    if (b) crumbItems.push({ label: b.titleBn || b.titleEn || '—', href: `#/book/${b.id}` });
  } else if (['collections'].includes(route) && params[0]) {
    crumbItems.push({ label: t('nav.collections'), href: '#/collections' });
    const c = S.collectionById(params[0]);
    if (c) crumbItems.push({ label: c.nameBn || c.nameEn, href: `#/collections/${c.id}` });
  } else if (['authors'].includes(route) && params[0]) {
    crumbItems.push({ label: t('nav.authors'), href: '#/authors' });
    const a = S.authorById(params[0]);
    if (a) crumbItems.push({ label: a.nameBn || a.nameEn, href: `#/authors/${a.id}` });
  } else if (['publishers'].includes(route) && params[0]) {
    crumbItems.push({ label: t('nav.publishers'), href: '#/publishers' });
    const p = S.publisherById(params[0]);
    if (p) crumbItems.push({ label: p.nameBn || p.nameEn, href: `#/publishers/${p.id}` });
  } else if (titleKey) {
    crumbItems.push({ label: t(titleKey), href: `#/${route}` });
  }
  setCrumbs(crumbItems);
  document.title = `${crumbItems[crumbItems.length - 1].label} — আমার পাঠাগার`;

  try {
    const res = def.render(main, { params, query });
    currentRender = res && res.destroy ? res : null;
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="empty"><h3>${esc(t('common.error'))}</h3><p>${esc(String(e?.message || e))}</p></div>`;
  }
  main.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
}

window.addEventListener('hashchange', renderRoute);
document.addEventListener('ap:rerender', renderRoute);

/* ---------- nav buttons ---------- */
document.getElementById('navOpen').addEventListener('click', () => {
  document.body.classList.add('nav-open');
  document.getElementById('navOverlay').hidden = false;
});
document.getElementById('navClose').addEventListener('click', closeMobileNav);
document.getElementById('navOverlay').addEventListener('click', closeMobileNav);
document.querySelectorAll('.nav-item').forEach(a => a.addEventListener('click', closeMobileNav));
document.getElementById('quickAddBtn').addEventListener('click', () => openBookForm(null, { onSaved: () => renderRoute() }));
document.getElementById('themeBtn').addEventListener('click', () => {
  const darkNow = document.documentElement.getAttribute('data-theme') === 'dark';
  S.savePrefs({ theme: darkNow ? 'light' : 'dark' });
  applyTheme();
});

/* ---------- offline pill ---------- */
function updateOnlinePill() {
  let pill = document.querySelector('.offline-pill');
  if (!navigator.onLine) {
    if (!pill) {
      pill = document.createElement('div');
      pill.className = 'offline-pill';
      pill.innerHTML = `<svg class="i"><use href="#i-offline"/></svg><span>${esc(t('st.offlineInfo'))}</span>`;
      document.body.appendChild(pill);
    }
  } else pill?.remove();
}
window.addEventListener('online', updateOnlinePill);
window.addEventListener('offline', updateOnlinePill);

/* ---------- boot ---------- */
(async function boot() {
  try {
    applyStatic();
    await db.openDB();
    await S.loadAll();
    await S.ensureGenresSeeded();
    db.requestPersistence();
    applyTheme();
    applyFont();
    await renderRoute();
    updateOnlinePill();
    /* storage note in sidebar */
    const note = document.getElementById('storageNote');
    if (note) {
      note.textContent = `${t('st.dbInfo', { v: String(db.DB_VERSION) }).replace('ডেটাবেস: ', '')}`;
      note.title = t('st.dataLossWarn');
    }
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./sw.js'); }
      catch (e) { console.warn('SW registration failed:', e); }
    }
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="empty"><h3>${esc(t('common.error'))}</h3><p>${esc(String(e?.message || e))}</p>
      <p class="small muted">IndexedDB সম্ভবত এই ব্রাউজারে বন্ধ আছে — প্রাইভেট উইন্ডো নয়, সাধারণ মোডে খুলুন।</p></div>`;
  }
})();

/* debug/test hooks (safe, read-only helpers used by automated tests) */
window.AP = {
  state: S.state,
  db,
  async debugAttachment(bookId, fileName = 'test.pdf', sizeKB = 64) {
    const { uid } = await import('./util.js');
    const blob = new Blob([new Uint8Array(sizeKB * 1024).fill(0x25)], { type: 'application/pdf' });
    const attachmentId = uid('at_');
    await db.put('attachments', { attachmentId, bookId, fileName, mimeType: 'application/pdf', size: blob.size, blob, addedAt: new Date().toISOString() });
    const book = S.bookById(bookId);
    book.formats = book.formats || [];
    book.formats.push({ formatId: uid('fm_'), type: 'pdf', availabilityStatus: 'attached', attachmentId, languageOfEdition: '', notes: '' });
    await db.put('books', book);
    await S.refreshBooks(); await S.refreshAttachments();
    return attachmentId;
  },
  fmtNum,
  toast,
};
