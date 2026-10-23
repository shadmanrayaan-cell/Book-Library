/* আমার পাঠাগার — views/books.js
   All Books: cover grid + sortable table, Bangla-first search, multi-field
   filters, pagination, multi-select with bulk actions, export. Reused for
   বাংলা বই / Completed presets. */

import { esc, fmtDate, fmtNum, debounce, truncate, downloadFile } from '../util.js';
import { t, sub } from '../i18n.js';
import * as S from '../state.js';
import { query as searchQuery } from '../search.js';
import { statusBadge, ownBadge, priBadge, coverHTML, pager, emptyState, toast, errToast, starsDisplay, confirmDialog, openModal } from '../components.js';
import { openBookForm } from '../book-form.js';
import { serializeCSV } from '../csv.js';
import * as db from '../db.js';
import { uiLang } from '../state.js';

const PAGE_SIZE_GRID = 24;
const PAGE_SIZE_TABLE = 50;
const ALL_COLS = ['authors', 'language', 'genre', 'formats', 'ownership', 'status', 'priority', 'rating', 'pages', 'shelf', 'added'];
function colLabels() {
  return { authors: t('tbl.colAuthor'), language: t('tbl.colLanguage'), genre: t('tbl.colGenre'), formats: t('tbl.colFormat'), ownership: t('tbl.colOwnership'), status: t('tbl.colStatus'), priority: t('tbl.colPriority'), rating: t('tbl.colRating'), pages: t('tbl.colPages'), shelf: t('tbl.colShelf'), added: t('tbl.colAdded') };
}

let lockedKeys = new Set();

let lastFilters = {};   // persisted per-preset in-session
let lastPage = 1;
let lastSort = null;
let lastCols = [...ALL_COLS];
let lastSelection = new Set();

export function render(el, ctx = {}) {
  const presetKey = ctx.presetKey || 'all';
  const preset = ctx.preset || {};
  const L = uiLang();

  let F = {
    q: '', lang: preset.language || '', genre: '', author: '', publisher: '',
    format: '', pdf: '', own: '', status: preset.status || '', pri: '', rating: '',
    added: '', shelf: '', coll: preset.collection || '', archived: false,
    ...lastFilters[presetKey],
  };
  lockedKeys = new Set(preset.locked || []);
  let view = S.prefs().defaultView || 'grid';
  let sort = lastSort || S.prefs().defaultSort || 'newest';
  let cols = lastCols;
  let page = 1;
  let selection = new Set(presetKey === 'all' ? lastSelection : []);

  el.innerHTML = `
    <div class="page-head">
      <div class="ph-row">
        <div>
          ${preset.en ? `<span class="ph-en">${esc(preset.en)}</span>` : ''}
          <h1>${esc(preset.title || t('nav.books'))}</h1>
          ${preset.desc ? `<div class="ph-desc">${esc(preset.desc)}</div>` : ''}
        </div>
        <div class="btn-row">
          <button class="btn" data-export><svg class="i"><use href="#i-download"/></svg>${esc(t('tbl.exportSel'))}</button>
          <button class="btn btn-primary" data-add><svg class="i"><use href="#i-plus"/></svg>${esc(t('action.addBook'))}</button>
        </div>
      </div>
    </div>
    <div class="toolbar" data-toolbar></div>
    <div class="filter-chips" data-chips></div>
    <div data-count class="count-note" style="margin-bottom:10px"></div>
    <div data-list></div>
    <div data-pager></div>`;

  const listEl = el.querySelector('[data-list]');
  const chipsEl = el.querySelector('[data-chips]');
  const countEl = el.querySelector('[data-count]');
  const pagerEl = el.querySelector('[data-pager]');
  const toolbarEl = el.querySelector('[data-toolbar]');

  el.querySelector('[data-add]').addEventListener('click', () => openBookForm(null, { onSaved: () => rerender() }));
  el.querySelector('[data-export]').addEventListener('click', () => exportList());

  /* ---------- filtering ---------- */
  function filtered() {
    return S.state.books.filter(b => {
      if (!F.archived && b.isArchived) return false;
      if (F.archived && !b.isArchived) return false;
      if (F.lang && b.language !== F.lang) return false;
      if (F.status && b.readingStatus !== F.status) return false;
      if (F.own && b.ownershipStatus !== F.own) return false;
      if (F.pri && b.priority !== F.pri) return false;
      if (F.genre && !(b.primaryGenre === F.genre || (b.genres || []).includes(F.genre))) return false;
      if (F.author && !(b.authors || []).includes(F.author)) return false;
      if (F.publisher && !(b.publishers || []).includes(F.publisher)) return false;
      if (F.coll && !(b.customCollectionIds || []).includes(F.coll)) return false;
      if (F.shelf && (b.shelfLocation || '').trim() !== F.shelf) return false;
      if (F.rating) {
        const r = b.rating || 0;
        if (r < Number(F.rating)) return false;
      }
      if (F.pdf) {
        const hasPdf = (b.formats || []).some(f => f.type === 'pdf');
        const attached = (b.formats || []).some(f => f.type === 'pdf' && (f.availabilityStatus === 'attached' || f.attachmentId));
        const linked = (b.formats || []).some(f => f.type === 'pdf' && f.availabilityStatus === 'external-link' && f.externalUrl);
        if (F.pdf === 'yes' && !hasPdf) return false;
        if (F.pdf === 'no' && hasPdf) return false;
        if (F.pdf === 'attached' && !attached) return false;
        if (F.pdf === 'linked' && !linked) return false;
      }
      if (F.format) {
        const has = (b.formats || []).some(f => f.type === F.format) || (F.format === 'physical' && (b.physicalCopyCount || 0) > 0);
        if (!has) return false;
      }
      if (F.added) {
        const days = { '1': 1, '7': 7, '30': 30, '365': 365 }[F.added];
        if (days && b.createdAt) {
          const age = (Date.now() - new Date(b.createdAt).getTime()) / 86400000;
          if (age > days) return false;
        }
      }
      return true;
    });
  }

  function applySearch(list) {
    if (!F.q.trim()) return list;
    const ids = new Set(searchQuery(F.q).map(r => r.id));
    return list.filter(b => ids.has(b.id));
  }

  function sorted(list) {
    const locale = L === 'en' ? 'en' : 'bn';
    const byTitle = (b) => (L === 'en' ? (b.titleEn || b.titleBn || '') : (b.titleBn || b.titleEn || ''));
    const authorFirst = (b) => (b.authors || []).map(id => S.authorLabel(id, L)).filter(Boolean)[0] || '';
    const priOrder = { high: 0, medium: 1, low: 2 };
    const statusOrder = { reading: 0, 'to-read': 1, paused: 2, completed: 3, abandoned: 4 };
    const cmp = (a, b, key) => {
      switch (key) {
        case 'newest': return (b.createdAt || '').localeCompare(a.createdAt || '');
        case 'oldest': return (a.createdAt || '').localeCompare(b.createdAt || '');
        case 'titleBn': return byTitle(a).localeCompare(byTitle(b), locale);
        case 'titleEn': return byTitle(a).localeCompare(byTitle(b), 'en');
        case 'author': return authorFirst(a).localeCompare(authorFirst(b), locale);
        case 'rating': return (b.rating || 0) - (a.rating || 0);
        case 'priority': return (priOrder[a.priority] ?? 1) - (priOrder[b.priority] ?? 1);
        case 'status': return (statusOrder[a.readingStatus] ?? 9) - (statusOrder[b.readingStatus] ?? 9);
        case 'year': return (b.publicationYear || 0) - (a.publicationYear || 0);
        default: return 0;
      }
    };
    return [...list].sort((a, b) => cmp(a, b, sort));
  }

  /* ---------- toolbar ---------- */
  function renderToolbar() {
    const langOpts = [
      { value: '', label: t('fl.language') + ': ' + t('common.all') },
      ...['bn', 'en', 'bilingual', 'other'].map(v => ({ value: v, label: t('lang.' + v) })),
    ];
    const statusOpts = [{ value: '', label: t('fl.status') + ': ' + t('common.all') },
      ...['to-read', 'reading', 'completed', 'paused', 'abandoned'].map(v => ({ value: v, label: t('status.' + v) }))];
    toolbarEl.innerHTML = `
      <div class="search-wrap">
        <svg class="i"><use href="#i-search"/></svg>
        <input class="input" type="search" data-q value="${esc(F.q)}" placeholder="${esc(t('common.searchPh'))}" aria-label="${esc(t('common.search'))}">
        <button class="icon-btn sm search-clear" data-qclear hidden aria-label="${esc(t('common.clear'))}"><svg class="i"><use href="#i-x"/></svg></button>
      </div>
      <select class="select" data-f="lang">${langOpts.map(o => `<option value="${o.value}" ${F.lang === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
      <select class="select" data-f="status">${statusOpts.map(o => `<option value="${o.value}" ${F.status === o.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
      <select class="select" data-f="genre"><option value="">${esc(t('fl.genre'))}: ${esc(t('common.all'))}</option>${S.state.genres.map(g => `<option value="${g.id}" ${F.genre === g.id ? 'selected' : ''}>${esc(g.nameBn || g.nameEn)}</option>`).join('')}</select>
      <select class="select" data-f="own"><option value="">${esc(t('fl.ownership'))}: ${esc(t('common.all'))}</option>${['owned', 'borrowed', 'wishlist', 'library-access'].map(v => `<option value="${v}" ${F.own === v ? 'selected' : ''}>${esc(t('own.' + v))}</option>`).join('')}</select>
      <select class="select" data-f="pdf">
        <option value="">${esc(t('fl.pdf'))}: ${esc(t('common.all'))}</option>
        <option value="yes" ${F.pdf === 'yes' ? 'selected' : ''}>${esc(t('fl.yes'))}</option>
        <option value="no" ${F.pdf === 'no' ? 'selected' : ''}>${esc(t('fl.no'))}</option>
        <option value="attached" ${F.pdf === 'attached' ? 'selected' : ''}>${esc(t('fl.attached'))}</option>
        <option value="linked" ${F.pdf === 'linked' ? 'selected' : ''}>${esc(t('fl.linked'))}</option>
      </select>
      <details class="dropdown" data-more-f>
        <summary class="btn"><svg class="i"><use href="#i-filter"/></svg>${esc(t('tbl.filters'))}</summary>
        <div class="dropdown-body" data-more-body></div>
      </details>
      <span style="flex:1"></span>
      <select class="select" data-sort>
        ${[['newest', t('tbl.sortNewest')], ['oldest', t('tbl.sortOldest')], ['titleBn', t('tbl.sortTitleBn')], ['titleEn', t('tbl.sortTitleEn')], ['author', t('tbl.sortAuthor')], ['rating', t('tbl.sortRating')], ['priority', t('tbl.sortPriority')], ['year', t('tbl.sortYear')]]
          .map(([v, l]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
      </select>
      <div class="btn-row" style="gap:0">
        <button class="icon-btn" data-view-grid title="${esc(t('st.viewGrid'))}" style="${view === 'grid' ? 'color:var(--accent-ink);background:var(--accent-soft)' : ''}"><svg class="i"><use href="#i-grid"/></svg></button>
        <button class="icon-btn" data-view-table title="${esc(t('st.viewTable'))}" style="${view === 'table' ? 'color:var(--accent-ink);background:var(--accent-soft)' : ''}"><svg class="i"><use href="#i-table"/></svg></button>
      </div>
      ${view === 'table' ? `<details class="dropdown" data-cols-dd>
        <summary class="btn"><svg class="i"><use href="#i-table"/></svg>${esc(t('common.columnSettings'))}</summary>
        <div class="dropdown-body" style="padding:10px 14px;min-width:190px">
          ${ALL_COLS.map(c => `<label class="checkbox-row small"><input type="checkbox" data-col="${c}" ${cols.includes(c) ? 'checked' : ''}><span>${esc(colLabels()[c])}</span></label>`).join('')}
        </div>
      </details>` : ''}
      <label class="checkbox-row small" style="gap:6px"><span class="switch"><input type="checkbox" data-arch ${F.archived ? 'checked' : ''}><span class="sw-track"></span><span class="sw-dot"></span></span>${esc(t('tbl.showArchived'))}</label>`;
    const moreBody = toolbarEl.querySelector('[data-more-body]');
    moreBody.innerHTML = `
      <div class="form-grid" style="padding:12px 14px;min-width:520px">
        <div class="field"><label>${esc(t('fl.author'))}</label><select class="select" data-f="author"><option value="">${esc(t('common.all'))}</option>${S.state.authors.map(a => `<option value="${a.id}" ${F.author === a.id ? 'selected' : ''}>${esc(a.nameBn || a.nameEn)}</option>`).join('')}</select></div>
        <div class="field"><label>${esc(t('fl.publisher'))}</label><select class="select" data-f="publisher"><option value="">${esc(t('common.all'))}</option>${S.state.publishers.map(p => `<option value="${p.id}" ${F.publisher === p.id ? 'selected' : ''}>${esc(p.nameBn || p.nameEn)}</option>`).join('')}</select></div>
        <div class="field"><label>${esc(t('fl.format'))}</label><select class="select" data-f="format"><option value="">${esc(t('common.all'))}</option>${['physical', 'pdf', 'epub', 'ebook-other', 'audiobook', 'other'].map(v => `<option value="${v}" ${F.format === v ? 'selected' : ''}>${esc(t('fmt.' + v))}</option>`).join('')}</select></div>
        <div class="field"><label>${esc(t('fl.priority'))}</label><select class="select" data-f="pri"><option value="">${esc(t('common.all'))}</option>${['high', 'medium', 'low'].map(v => `<option value="${v}" ${F.pri === v ? 'selected' : ''}>${esc(t('pri.' + v))}</option>`).join('')}</select></div>
        <div class="field"><label>${esc(t('fl.rating'))} ≥</label><select class="select" data-f="rating"><option value="">${esc(t('common.all'))}</option>${[1, 2, 3, 4, 4.5].map(v => `<option value="${v}" ${F.rating === String(v) ? 'selected' : ''}>${v}+</option>`).join('')}</select></div>
        <div class="field"><label>${esc(t('fl.added'))}</label><select class="select" data-f="added"><option value="">${esc(t('common.all'))}</option><option value="1" ${F.added === '1' ? 'selected' : ''}>${esc(t('fl.addedToday'))}</option><option value="7" ${F.added === '7' ? 'selected' : ''}>${esc(t('fl.addedWeek'))}</option><option value="30" ${F.added === '30' ? 'selected' : ''}>${esc(t('fl.addedMonth'))}</option><option value="365" ${F.added === '365' ? 'selected' : ''}>${esc(t('fl.addedYear'))}</option></select></div>
        <div class="field"><label>${esc(t('fl.shelf'))}</label><select class="select" data-f="shelf"><option value="">${esc(t('common.all'))}</option>${shelfOptions().map(s => `<option value="${esc(s)}" ${F.shelf === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="field"><label>${esc(t('fl.collection'))}</label><select class="select" data-f="coll"><option value="">${esc(t('common.all'))}</option>${S.state.collections.map(c => `<option value="${c.id}" ${F.coll === c.id ? 'selected' : ''}>${esc(c.nameBn || c.nameEn)}</option>`).join('')}</select></div>
      </div>`;

    toolbarEl.querySelector('[data-q]').addEventListener('input', debounce((e) => {
      F.q = e.target.value; page = 1; paint();
    }, 200));
    toolbarEl.querySelector('[data-qclear]').addEventListener('click', () => { F.q = ''; page = 1; paint(); });
    toolbarEl.querySelectorAll('[data-f]').forEach(s => s.addEventListener('change', () => {
      F[s.dataset.f] = s.value; page = 1; paint();
    }));
    toolbarEl.querySelector('[data-sort]').addEventListener('change', (e) => { sort = e.target.value; paint(); });
    toolbarEl.querySelector('[data-view-grid]').addEventListener('click', () => { view = 'grid'; paint(); });
    toolbarEl.querySelector('[data-view-table]').addEventListener('click', () => { view = 'table'; paint(); });
    toolbarEl.querySelectorAll('[data-col]').forEach(cb => cb.addEventListener('change', () => {
      const c = cb.dataset.col;
      if (cb.checked && !cols.includes(c)) cols.push(c);
      if (!cb.checked) cols = cols.filter(x => x !== c);
      paint();
    }));
    toolbarEl.querySelector('[data-arch]').addEventListener('change', (e) => { F.archived = e.target.checked; page = 1; paint(); });
  }
  function shelfOptions() {
    return [...new Set(S.state.books.map(b => (b.shelfLocation || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'bn'));
  }

  /* ---------- chips ---------- */
  function renderChips() {
    const chips = [];
    const add = (key, label, locked) => {
      chips.push(`<span class="fchip ${locked ? 'locked' : ''}"><b>${esc(label)}</b>${locked ? '' : `<button data-chip="${key}" aria-label="${esc(t('common.clear'))}"><svg class="i"><use href="#i-x"/></svg></button>`}</span>`);
    };
    if (F.lang) add('lang', `${t('fl.language')}: ${t('lang.' + F.lang)}`, lockedKeys.has('lang'));
    if (F.status) add('status', `${t('fl.status')}: ${t('status.' + F.status)}`, lockedKeys.has('status'));
    if (F.genre) add('genre', `${t('fl.genre')}: ${S.genreLabel(F.genre, L)}`);
    if (F.own) add('own', `${t('fl.ownership')}: ${t('own.' + F.own)}`);
    if (F.pdf) add('pdf', `${t('fl.pdf')}: ${F.pdf}`);
    if (F.format) add('format', `${t('fl.format')}: ${t('fmt.' + F.format)}`);
    if (F.author) { const a = S.authorById(F.author); if (a) add('author', `${t('fl.author')}: ${a.nameBn || a.nameEn}`); }
    if (F.publisher) { const p = S.publisherById(F.publisher); if (p) add('publisher', `${t('fl.publisher')}: ${p.nameBn || p.nameEn}`); }
    if (F.pri) add('pri', `${t('fl.priority')}: ${t('pri.' + F.pri)}`);
    if (F.rating) add('rating', `${t('fl.rating')}: ${F.rating}+`);
    if (F.added) add('added', `${t('fl.added')}: ${t('fl.added' + ['', 'Today', 'Week', 'Month', 'Year'][{ '1': 1, '7': 2, '30': 3, '365': 4 }[F.added]] || '')}`);
    if (F.shelf) add('shelf', `${t('fl.shelf')}: ${F.shelf}`);
    if (F.coll) { const c = S.collectionById(F.coll); if (c) add('coll', `${t('fl.collection')}: ${c.nameBn || c.nameEn}`); }
    chipsEl.innerHTML = chips.join('');
    chipsEl.querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => {
      F[b.dataset.chip] = ''; page = 1; paint();
    }));
    if (chips.length > 1) {
      const clearAll = document.createElement('button');
      clearAll.className = 'btn btn-sm btn-ghost';
      clearAll.textContent = t('common.clearFilters');
      clearAll.addEventListener('click', () => {
        F = { q: '', lang: lockedKeys.has('lang') ? preset.language || '' : '', genre: '', author: '', publisher: '', format: '', pdf: '', own: '', status: lockedKeys.has('status') ? preset.status || '' : '', pri: '', rating: '', added: '', shelf: '', coll: '', archived: F.archived };
        page = 1; paint();
      });
      chipsEl.appendChild(clearAll);
    }
  }

  /* ---------- list rendering ---------- */
  function renderList(list) {
    const size = view === 'grid' ? PAGE_SIZE_GRID : PAGE_SIZE_TABLE;
    const total = list.length;
    const pages = Math.max(1, Math.ceil(total / size));
    if (page > pages) page = pages;
    const slice = list.slice((page - 1) * size, page * size);
    countEl.innerHTML = total
      ? `${esc(fmtNum(total, L))} ${esc(t('common.booksFound'))}${F.q ? ' · “' + esc(truncate(F.q, 30)) + '”' : ''} · ${esc(t('common.showing'))} ${esc(fmtNum(slice.length, L))}`
      : '';
    if (!total) {
      const anyBooks = S.state.books.length > 0;
      listEl.innerHTML = '';
      listEl.appendChild(emptyState({
        icon: 'books',
        title: anyBooks ? t('common.noResults') : t('book.emptyTitle'),
        body: anyBooks ? t('common.noResultsHint') : t('book.emptyBody'),
        actions: anyBooks ? [] : [mkAddBtn(), mkImportBtn()],
      }));
      pagerEl.innerHTML = '';
      return;
    }
    if (view === 'grid') renderGrid(slice);
    else renderTable(slice);
    pagerEl.innerHTML = '';
    pagerEl.appendChild(pager(total, page, size, (p) => { page = p; paint(); }));
  }

  function mkAddBtn() {
    const b = document.createElement('button');
    b.className = 'btn btn-primary';
    b.innerHTML = `<svg class="i"><use href="#i-plus"/></svg>${esc(t('action.addBook'))}`;
    b.addEventListener('click', () => openBookForm(null, { onSaved: () => rerender() }));
    return b;
  }
  function mkImportBtn() {
    const b = document.createElement('button');
    b.className = 'btn';
    b.innerHTML = `<svg class="i"><use href="#i-upload"/></svg>${esc(t('action.importBooks'))}`;
    b.addEventListener('click', () => { location.hash = '#/data'; });
    return b;
  }

  function renderGrid(slice) {
    const grid = document.createElement('div');
    grid.className = 'covers-grid';
    grid.innerHTML = slice.map(b => {
      const id = b.id;
      const sel = selection.has(id);
      return `
      <div class="cover-card" data-id="${id}" role="button" tabindex="0" aria-label="${esc(b.titleBn || b.titleEn)}">
        <div style="position:relative">
          <input type="checkbox" data-sel="${id}" ${sel ? 'checked' : ''} aria-label="${esc(t('common.selectAll'))}" style="position:absolute;top:8px;left:8px;z-index:2;width:17px;height:17px;accent-color:var(--accent);cursor:pointer">
          ${coverHTML(b)}
        </div>
        <div class="cover-meta">
          <span class="cover-title">${esc(b.titleBn || b.titleEn || b.transliteratedTitle || '—')}</span>
          ${b.titleBn && b.titleEn ? `<span class="cover-author">${esc(b.titleEn)}</span>` : ''}
          <span class="cover-author">${esc(S.bookAuthors(b, L) || '—')}</span>
          <div class="cover-tags">
            ${statusBadge(b.readingStatus)}
            ${b.language !== 'bn' ? `<span class="lang-tag">${esc(t('lang.' + (b.language || 'other')))}</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
    listEl.innerHTML = '';
    listEl.appendChild(grid);
    grid.querySelectorAll('.cover-card').forEach(card => {
      const id = card.dataset.id;
      card.addEventListener('click', (e) => {
        if (e.target.matches('input[type="checkbox"]')) return;
        location.hash = `#/book/${id}`;
      });
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter') location.hash = `#/book/${id}`; });
    });
    grid.querySelectorAll('[data-sel]').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) selection.add(cb.dataset.sel); else selection.delete(cb.dataset.sel);
      renderBulkBar();
    }));
  }

  function renderTable(slice) {
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    const colDefs = {
      authors: { label: t('tbl.colAuthor'), cell: b => esc(S.bookAuthors(b, L) || '—') },
      language: { label: t('tbl.colLanguage'), cell: b => `<span class="lang-tag">${esc(t('lang.' + (b.language || 'other')))}</span>` },
      genre: { label: t('tbl.colGenre'), cell: b => esc(b.primaryGenre ? S.genreLabel(b.primaryGenre, L) : '—') },
      formats: {
        label: t('tbl.colFormat'), cell: b => {
          const marks = [];
          if ((b.physicalCopyCount || 0) > 0 || (b.formats || []).some(f => f.type === 'physical')) marks.push('📕');
          if ((b.formats || []).some(f => f.type === 'pdf')) marks.push('PDF');
          if ((b.formats || []).some(f => f.type === 'epub')) marks.push('EPUB');
          if ((b.formats || []).some(f => f.type === 'audiobook')) marks.push('♪');
          return `<span class="small" style="font-family:var(--font-latin)">${marks.join(' · ') || '—'}</span>`;
        }
      },
      ownership: { label: t('tbl.colOwnership'), cell: b => ownBadge(b.ownershipStatus) },
      status: { label: t('tbl.colStatus'), cell: b => statusBadge(b.readingStatus) },
      priority: { label: t('tbl.colPriority'), cell: b => priBadge(b.priority) || '<span class="muted small">—</span>' },
      rating: { label: t('tbl.colRating'), cell: b => starsDisplay(b.rating) || '<span class="muted small">—</span>' },
      pages: { label: t('tbl.colPages'), cell: b => b.pageCount ? fmtNum(b.pageCount, L) : '—' },
      shelf: { label: t('tbl.colShelf'), cell: b => esc(b.shelfLocation || '—') },
      added: { label: t('tbl.colAdded'), cell: b => `<span class="muted small">${esc(fmtDate(b.createdAt, L))}</span>` },
    };
    const visible = cols.filter(c => ALL_COLS.includes(c));
    wrap.innerHTML = `
      <table class="data">
        <thead><tr>
          <th style="width:34px"><input type="checkbox" data-selall aria-label="${esc(t('common.selectAll'))}" style="width:16px;height:16px;accent-color:var(--accent)"></th>
          <th data-sortcol="titleBn" class="sortable">${esc(t('tbl.colTitle'))}<span class="sort-ind">${['titleBn', 'titleEn'].includes(sort) ? (sort === 'titleBn' ? '▲' : '▲') : ''}</span></th>
          ${visible.map(c => `<th data-sortcol="${c === 'authors' ? 'author' : c === 'added' ? 'newest' : c}" class="sortable">${esc(colDefs[c].label)}</th>`).join('')}
          <th style="width:60px"></th>
        </tr></thead>
        <tbody>
          ${slice.map(b => `
          <tr data-id="${b.id}">
            <td><input type="checkbox" data-sel="${b.id}" ${selection.has(b.id) ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent)"></td>
            <td><a class="t-title" href="#/book/${b.id}">${esc(b.titleBn || b.titleEn || '—')}</a>
              <span class="t-sub">${esc((b.titleBn && b.titleEn) ? b.titleEn : b.transliteratedTitle || '')}</span></td>
            ${visible.map(c => `<td>${colDefs[c].cell(b)}</td>`).join('')}
            <td><div class="cell-actions">
              <button class="icon-btn sm" data-edit="${b.id}" title="${esc(t('common.edit'))}" aria-label="${esc(t('common.edit'))}"><svg class="i"><use href="#i-edit"/></svg></button>
            </div></td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    listEl.innerHTML = '';
    listEl.appendChild(wrap);
    wrap.querySelector('[data-selall]').addEventListener('change', (e) => {
      if (e.target.checked) slice.forEach(b => selection.add(b.id));
      else slice.forEach(b => selection.delete(b.id));
      paint();
    });
    wrap.querySelectorAll('[data-sel]').forEach(cb => cb.addEventListener('change', () => {
      if (cb.checked) selection.add(cb.dataset.sel); else selection.delete(cb.dataset.sel);
      renderBulkBar();
    }));
    wrap.querySelectorAll('th[data-sortcol]').forEach(th => th.addEventListener('click', () => {
      const k = th.dataset.sortcol;
      sort = sort === k ? 'newest' : k;
      paint();
    }));
    wrap.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      openBookForm(S.bookById(b.dataset.edit), { onSaved: () => rerender() });
    }));
  }

  /* ---------- bulk bar ---------- */
  let bulkEl = null;
  function renderBulkBar() {
    bulkEl?.remove(); bulkEl = null;
    if (!selection.size) return;
    bulkEl = document.createElement('div');
    bulkEl.className = 'bulk-bar';
    bulkEl.innerHTML = `
      <span class="bb-count">${esc(fmtNum(selection.size, L))} ${esc(t('common.selected'))}</span>
      <button data-b="status">${esc(t('tbl.bulkStatus'))}</button>
      <button data-b="pri">${esc(t('tbl.bulkPriority'))}</button>
      <button data-b="tags">${esc(t('tbl.bulkTags'))}</button>
      <button data-b="coll">${esc(t('tbl.bulkCollections'))}</button>
      <button data-b="archive">${esc(t('common.archive'))}</button>
      <button data-b="export">${esc(t('tbl.exportSel'))}</button>
      <button data-b="del" class="danger">${esc(t('common.delete'))}</button>
      <button data-b="clear" aria-label="${esc(t('common.clear'))}"><svg class="i"><use href="#i-x"/></svg></button>`;
    document.body.appendChild(bulkEl);
    bulkEl.querySelector('[data-b="clear"]').addEventListener('click', () => { selection.clear(); renderBulkBar(); });
    bulkEl.querySelector('[data-b="status"]').addEventListener('click', () => bulkSelect(t('tbl.bulkStatus'), ['to-read', 'reading', 'completed', 'paused', 'abandoned'].map(v => ({ value: v, label: t('status.' + v) })), 'readingStatus'));
    bulkEl.querySelector('[data-b="pri"]').addEventListener('click', () => bulkSelect(t('tbl.bulkPriority'), ['high', 'medium', 'low'].map(v => ({ value: v, label: t('pri.' + v) })), 'priority'));
    bulkEl.querySelector('[data-b="own"]')?.remove();
    bulkEl.querySelector('[data-b="tags"]').addEventListener('click', bulkTags);
    bulkEl.querySelector('[data-b="coll"]').addEventListener('click', bulkCollections);
    bulkEl.querySelector('[data-b="archive"]').addEventListener('click', async () => {
      try {
        const now = new Date().toISOString();
        for (const id of selection) {
          const b = S.bookById(id); if (!b) continue;
          b.isArchived = true; b.updatedAt = now;
          await db.put('books', b);
        }
        await S.refreshBooks();
        toast(t('tbl.bulkDone', { n: fmtNum(selection.size, L) }));
        selection.clear(); renderBulkBar(); paint();
      } catch (e) { errToast(e); }
    });
    bulkEl.querySelector('[data-b="export"]').addEventListener('click', () => exportList([...selection]));
    bulkEl.querySelector('[data-b="del"]').addEventListener('click', async () => {
      const ok = await import('../components.js').then(m => m.confirmDialog({
        title: t('common.delete'),
        message: esc(t('tbl.bulkDeleteConfirm', { n: fmtNum(selection.size, L) })),
        danger: true, okLabel: t('common.delete'),
      }));
      if (!ok) return;
      try {
        for (const id of selection) await db.deleteBookCascade(id, { deleteJournal: true });
        await S.refreshBooks(); await S.refreshSessions(); await S.refreshAttachments(); await S.refreshJournal();
        toast(t('common.deleted'));
        selection.clear(); renderBulkBar(); paint();
      } catch (e) { errToast(e); }
    });
  }
  function bulkSelect(title, options, key) {
    import('../components.js').then(({ openModal }) => {
      const wrap = document.createElement('div');
      wrap.appendChild(selectDropdown(options, ''));
      const ok = document.createElement('button');
      ok.className = 'btn btn-primary'; ok.textContent = t('common.apply');
      const cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost'; cancel.textContent = t('common.cancel');
      const m = openModal({ title, body: wrap, footer: [cancel, ok] });
      ok.addEventListener('click', async () => {
        const v = wrap.querySelector('select').value;
        if (!v) { m.close(); return; }
        try {
          const now = new Date().toISOString();
          for (const id of selection) {
            const b = S.bookById(id); if (!b) continue;
            b[key] = v; b.updatedAt = now;
            await db.put('books', b);
          }
          await S.refreshBooks();
          toast(t('tbl.bulkDone', { n: fmtNum(selection.size, L) }));
          m.close(); selection.clear(); renderBulkBar(); paint();
        } catch (e) { errToast(e); }
      });
      cancel.addEventListener('click', () => m.close());
    });
  }
  function selectDropdown(options, value) {
    const sel = document.createElement('select');
    sel.className = 'select';
    sel.innerHTML = options.map(o => `<option value="${o.value}">${esc(o.label)}</option>`).join('');
    return sel;
  }
  function bulkTags() {
    import('../components.js').then(({ openModal }) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `<div class="field"><label>${esc(t('tbl.bulkTagAdd'))}</label><input class="input" data-tags></div>`;
      const ok = document.createElement('button');
      ok.className = 'btn btn-primary'; ok.textContent = t('common.apply');
      const cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost'; cancel.textContent = t('common.cancel');
      const m = openModal({ title: t('tbl.bulkTags'), body: wrap, footer: [cancel, ok] });
      ok.addEventListener('click', async () => {
        const tags = wrap.querySelector('[data-tags]').value.split(',').map(s => s.trim()).filter(Boolean);
        if (!tags.length) { m.close(); return; }
        try {
          const now = new Date().toISOString();
          for (const id of selection) {
            const b = S.bookById(id); if (!b) continue;
            b.tags = [...new Set([...(b.tags || []), ...tags])];
            b.updatedAt = now;
            await db.put('books', b);
          }
          S.registerTags(tags);
          await S.refreshBooks();
          toast(t('tbl.bulkDone', { n: fmtNum(selection.size, L) }));
          m.close(); selection.clear(); renderBulkBar(); paint();
        } catch (e) { errToast(e); }
      });
      cancel.addEventListener('click', () => m.close());
    });
  }
  function bulkCollections() {
    import('../components.js').then(({ openModal }) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = S.state.collections.length
        ? S.state.collections.map(c => `<label class="checkbox-row"><input type="checkbox" value="${c.id}"><span>${esc(c.nameBn || c.nameEn)}</span></label>`).join('')
        : `<p class="muted small">${esc(t('co.empty'))}</p>`;
      const ok = document.createElement('button');
      ok.className = 'btn btn-primary'; ok.textContent = t('common.apply'); ok.disabled = !S.state.collections.length;
      const cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost'; cancel.textContent = t('common.cancel');
      const m = openModal({ title: t('tbl.bulkCollections'), body: wrap, footer: [cancel, ok] });
      ok.addEventListener('click', async () => {
        const ids = [...wrap.querySelectorAll('input:checked')].map(i => i.value);
        if (!ids.length) { m.close(); return; }
        try {
          const now = new Date().toISOString();
          for (const id of selection) {
            const b = S.bookById(id); if (!b) continue;
            b.customCollectionIds = [...new Set([...(b.customCollectionIds || []), ...ids])];
            b.updatedAt = now;
            await db.put('books', b);
          }
          await S.refreshBooks();
          toast(t('tbl.bulkDone', { n: fmtNum(selection.size, L) }));
          m.close(); selection.clear(); renderBulkBar(); paint();
        } catch (e) { errToast(e); }
      });
      cancel.addEventListener('click', () => m.close());
    });
  }

  /* ---------- export ---------- */
  function exportList(onlyIds = null) {
    let list = sorted(filtered());
    if (onlyIds) list = list.filter(b => onlyIds.includes(b.id));
    if (!list.length) { toast(t('tbl.selectSome'), 'err'); return; }
    const L2 = L;
    const rows = [[...EXPORT_HEADER]];
    for (const b of list) {
      rows.push([
        b.titleBn || '', b.titleEn || '',
        S.bookAuthors(b, 'bn'), (b.translators || []).map(id => S.authorLabel(id, 'bn')).join('; '),
        S.bookPublishers(b, 'bn'), b.language || '', b.publicationYear || '', b.pageCount || '',
        b.primaryGenre ? S.genreLabel(b.primaryGenre, 'bn') : '',
        (b.tags || []).join('; '), b.seriesName || '', b.edition || '',
        b.isbn13 || b.isbn10 || '', t('own.' + (b.ownershipStatus || 'owned')), t('status.' + (b.readingStatus || 'to-read')),
        t('pri.' + (b.priority || 'medium')), b.shelfLocation || '', b.rating ?? '',
        b.personalReview || '', b.privateNotes || '', b.acquisitionDate || '', b.plannedReadingDate || '',
      ]);
    }
    const name = `amar-pathagar-${presetKey}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(name, serializeCSV(rows), 'text/csv;charset=utf-8');
    toast(t('ie.exported'));
  }
  const EXPORT_HEADER = [
    'বইয়ের নাম (বাংলা)', 'Title (English)', 'লেখক', 'অনুবাদক', 'প্রকাশক', 'ভাষা', 'প্রকাশকাল', 'পৃষ্ঠা',
    'ধরন', 'ট্যাগ', 'সিরিজ', 'সংস্করণ', 'ISBN', 'মালিকানা', 'পড়ার অবস্থা', 'অগ্রাধিকার', 'তাক', 'রেটিং',
    'রিভিউ', 'নোট', 'সংগ্রহের তারিখ', 'পরিকল্পিত তারিখ',
  ];

  /* ---------- paint ---------- */
  function paint() {
    renderToolbar();
    renderChips();
    let list = filtered();
    if (F.q.trim()) list = applySearch(list);
    list = sorted(list);
    lastFilters[presetKey] = { ...F };
    lastSort = sort; lastCols = cols;
    if (presetKey === 'all') lastSelection = selection;
    renderList(list);
    renderBulkBar();
  }
  function rerender() { paint(); }

  paint();

  /* cleanup bulk bar when leaving */
  const obs = new MutationObserver(() => {
    if (!document.contains(el)) { bulkEl?.remove(); bulkEl = null; obs.disconnect(); }
  });
  obs.observe(document.body, { childList: true });
  return { destroy() { bulkEl?.remove(); bulkEl = null; obs.disconnect(); } };
}
