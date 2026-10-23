/* আমার পাঠাগার — views/journal.js
   Reading journal: reflections, summaries, chapter notes, quotes.
   Distraction-free writing, localStorage draft autosave, search, export.
   Content never leaves the browser. */

import { esc, uid, todayISO, fmtDate, truncate, downloadFile } from '../util.js';
import { t, sub } from '../i18n.js';
import * as S from '../state.js';
import * as db from '../db.js';
import { openModal, emptyState, toast, errToast, confirmDialog } from '../components.js';
import { searchJournal, buildNoteIndex } from '../search.js';
import { uiLang } from '../state.js';
import { serializeCSV } from '../csv.js';

const DRAFT_KEY = 'ap.journalDraft';
const TYPES = ['reflection', 'summary', 'chapter-note', 'quote', 'session-log'];

export function render(el, ctx) {
  const L = uiLang();
  let q = ctx.query.get('q') || '';
  let typeF = '';
  let bookF = '';

  el.innerHTML = `
    <div class="page-head">
      <div class="ph-row">
        <div>
          <span class="ph-en">${esc(sub('nav.journal'))}</span>
          <h1>${esc(t('jr.title'))}</h1>
          <div class="ph-desc">${esc(t('jr.subtitle'))}</div>
        </div>
        <div class="btn-row">
          <button class="btn" data-export>${esc(t('jr.export'))}</button>
          <button class="btn btn-primary" data-new><svg class="i"><use href="#i-plus"/></svg>${esc(t('action.newEntry'))}</button>
        </div>
      </div>
    </div>
    <div class="infocard" style="margin-bottom:16px"><svg class="i"><use href="#i-info"/></svg><span>${esc(t('jr.privacy'))}</span></div>
    <div class="toolbar">
      <div class="search-wrap">
        <svg class="i"><use href="#i-search"/></svg>
        <input class="input" type="search" data-q value="${esc(q)}" placeholder="${esc(t('jr.searchPh'))}" aria-label="${esc(t('jr.searchPh'))}">
      </div>
      <select class="select" data-type>
        <option value="">${esc(t('jr.type'))}: ${esc(t('common.all'))}</option>
        ${TYPES.map(x => `<option value="${x}">${esc(t('jr.' + x))}</option>`).join('')}
      </select>
      <select class="select" data-book>
        <option value="">${esc(t('jr.book'))}: ${esc(t('common.all'))}</option>
        ${[...S.state.books].sort((a, b) => (a.titleBn || a.titleEn || '').localeCompare(b.titleBn || b.titleEn || '', 'bn'))
          .map(b => `<option value="${b.id}">${esc(truncate(b.titleBn || b.titleEn || '—', 40))}</option>`).join('')}
      </select>
    </div>
    <div data-list></div>`;

  const listEl = el.querySelector('[data-list]');
  el.querySelector('[data-new]').addEventListener('click', () => openEntryForm(null, { onSaved: () => render(el, ctx) }));
  el.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; paint(); });
  el.querySelector('[data-type]').addEventListener('change', (e) => { typeF = e.target.value; paint(); });
  el.querySelector('[data-book]').addEventListener('change', (e) => { bookF = e.target.value; paint(); });
  el.querySelector('[data-export]').addEventListener('click', exportJournal);

  function paint() {
    let entries = [...S.state.journal].sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
    if (typeF) entries = entries.filter(j => (j.type || 'reflection') === typeF);
    if (bookF) entries = entries.filter(j => j.bookId === bookF);
    if (q.trim()) {
      buildNoteIndex(S.state.journal);
      const hit = searchJournal(q);
      entries = entries.filter(j => hit && hit.has(j.id));
    }
    if (!S.state.journal.length) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary btn-lg';
      btn.innerHTML = `<svg class="i"><use href="#i-plus"/></svg>${esc(t('action.newEntry'))}`;
      btn.addEventListener('click', () => openEntryForm(null, { onSaved: () => render(el, ctx) }));
      listEl.innerHTML = '';
      listEl.appendChild(emptyState({ icon: 'journal', title: t('jr.title'), body: t('jr.empty'), actions: [btn] }));
      return;
    }
    if (!entries.length) {
      listEl.innerHTML = `<div class="empty"><h3>${esc(t('common.noResults'))}</h3><p>${esc(t('jr.noResults'))}</p></div>`;
      return;
    }
    listEl.innerHTML = entries.map(j => {
      const b = j.bookId ? S.bookById(j.bookId) : null;
      return `
      <article class="jr-card">
        <div class="jr-head">
          <span class="badge b-neutral">${esc(t('jr.' + (j.type || 'reflection')))}</span>
          ${j.title ? `<b>${esc(j.title)}</b>` : ''}
          ${b ? `<a class="small" href="#/book/${b.id}">📖 ${esc(truncate(b.titleBn || b.titleEn, 40))}</a>` : `<span class="muted small">${esc(t('jr.noBook'))}</span>`}
          <span style="flex:1"></span>
          <time class="muted small">${esc(fmtDate(j.date || j.createdAt, L))}${j.chapter ? ' · ' + esc(j.chapter) : ''}</time>
          <button class="icon-btn sm" data-edit="${j.id}" aria-label="${esc(t('common.edit'))}"><svg class="i"><use href="#i-edit"/></svg></button>
          <button class="icon-btn sm" data-del="${j.id}" aria-label="${esc(t('common.delete'))}"><svg class="i"><use href="#i-trash"/></svg></button>
        </div>
        <div class="jr-body clamp">${esc(j.body || '')}</div>
      </article>`;
    }).join('');
    listEl.querySelectorAll('[data-edit]').forEach(n => n.addEventListener('click', () => {
      const j = S.state.journal.find(x => x.id === n.dataset.edit);
      openEntryForm(j, { onSaved: () => render(el, ctx) });
    }));
    listEl.querySelectorAll('[data-del]').forEach(n => n.addEventListener('click', () => {
      const j = S.state.journal.find(x => x.id === n.dataset.del);
      confirmDialog({ title: t('common.delete'), message: esc(t('jr.deleteConfirm')), danger: true, okLabel: t('common.delete') })
        .then(async (ok) => {
          if (!ok) return;
          try { await db.del('journal', j.id); await S.refreshJournal(); toast(t('common.deleted')); render(el, ctx); }
          catch (e) { errToast(e); }
        });
    }));
  }

  function exportJournal() {
    const rows = [['তারিখ', 'ধরন', 'বই', 'শিরোনাম', 'অধ্যায়', 'লেখা']];
    for (const j of [...S.state.journal].sort((a, b) => (a.date || a.createdAt || '').localeCompare(b.date || b.createdAt || ''))) {
      const b = j.bookId ? S.bookById(j.bookId) : null;
      rows.push([j.date || (j.createdAt || '').slice(0, 10), t('jr.' + (j.type || 'reflection')), b ? (b.titleBn || b.titleEn) : '', j.title || '', j.chapter || '', j.body || '']);
    }
    downloadFile(`amar-pathagar-journal-${todayISO()}.csv`, serializeCSV(rows), 'text/csv;charset=utf-8');
    toast(t('ie.exported'));
  }

  paint();
}

/* ---------- entry form (with zen mode + autosave) ---------- */
export function openEntryForm(existing = null, { onSaved = null } = {}) {
  const L = uiLang();
  const isNew = !existing;
  const j = existing ? { ...existing } : {
    id: null, bookId: '', type: 'reflection', title: '', body: '',
    chapter: '', date: todayISO(), createdAt: null, updatedAt: null,
  };
  let dirty = false;
  let zenOpen = false;
  let autosaveTimer = null;

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>${esc(t('jr.type'))}</label>
        <select class="select" data-type>${TYPES.map(x => `<option value="${x}" ${j.type === x ? 'selected' : ''}>${esc(t('jr.' + x))}</option>`).join('')}</select></div>
      <div class="field"><label>${esc(t('jr.book'))}</label>
        <select class="select" data-book><option value="">${esc(t('jr.noBook'))}</option>
        ${[...S.state.books].sort((a, b) => (a.titleBn || a.titleEn || '').localeCompare(b.titleBn || b.titleEn || '', 'bn'))
          .map(b => `<option value="${b.id}" ${j.bookId === b.id ? 'selected' : ''}>${esc(truncate(b.titleBn || b.titleEn || '—', 44))}</option>`).join('')}</select></div>
      <div class="field"><label>${esc(t('common.date'))}</label><input class="input" type="date" data-date value="${esc(j.date || todayISO())}"></div>
      <div class="field"><label>${esc(t('jr.chapter'))}</label><input class="input" data-chapter value="${esc(j.chapter)}"></div>
    </div>
    <div class="field"><label>${esc(t('jr.entryTitle'))}</label><input class="input" data-title value="${esc(j.title)}"></div>
    <div class="field" data-bodyf><label>${esc(t('jr.body'))}</label><textarea class="textarea" rows="8" data-body style="font-family:var(--font-display);font-size:1rem;line-height:2">${esc(j.body)}</textarea></div>
    <div class="flex" style="justify-content:space-between">
      <span class="hint" data-draft-ind></span>
    </div>`;

  const zenBtn = document.createElement('button');
  zenBtn.type = 'button'; zenBtn.className = 'btn btn-sm';
  zenBtn.innerHTML = `<svg class="i"><use href="#i-reading"/></svg>${esc(t('jr.zen'))}`;
  wrap.querySelector('[data-draft-ind]').parentElement.prepend(zenBtn);

  const save = document.createElement('button');
  save.className = 'btn btn-primary'; save.textContent = isNew ? t('common.create') : t('common.saveChanges');
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost'; cancel.textContent = t('common.cancel');

  const m = openModal({
    title: isNew ? t('action.newEntry') : t('common.edit'), size: 'modal-lg',
    body: wrap, footer: [cancel, save],
    onBeforeClose: () => {
      if (!dirty) return true;
      confirmDialog({ title: t('common.unsaved'), message: esc(t('common.unsavedMsg')), okLabel: t('common.discard'), danger: true })
        .then(ok => { if (ok) { clearDraft(); dirty = false; m.close(); } });
      return false;
    },
  });

  const bodyTa = wrap.querySelector('[data-body]');
  bodyTa.addEventListener('input', () => {
    dirty = true;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(collect()));
        wrap.querySelector('[data-draft-ind]').textContent = t('jr.autosaved');
      } catch {}
    }, 1200);
  });
  wrap.querySelectorAll('input,select,textarea').forEach(n => n.addEventListener('change', () => { dirty = true; }));

  function collect() {
    return {
      bookId: wrap.querySelector('[data-book]').value || null,
      type: wrap.querySelector('[data-type]').value,
      title: wrap.querySelector('[data-title]').value.trim(),
      body: bodyTa.value,
      chapter: wrap.querySelector('[data-chapter]').value.trim(),
      date: wrap.querySelector('[data-date]').value || todayISO(),
    };
  }
  function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch {} }

  zenBtn.addEventListener('click', () => {
    zenOpen = true;
    const zen = document.createElement('div');
    zen.className = 'zen-overlay';
    zen.innerHTML = `
      <div class="zen-head">
        <div class="z-title">
          <b>${esc(wrap.querySelector('[data-title]').value || t('jr.zen'))}</b>
          <div class="muted small">${esc(t('jr.zenHint'))}</div>
        </div>
        <button class="btn btn-sm" data-zen-exit>${esc(t('common.back'))}</button>
      </div>
      <textarea class="zen-ta" placeholder="${esc(t('jr.body'))}…"></textarea>
      <div class="zen-foot"><span data-zen-count></span><span data-zen-draft></span></div>`;
    const ta = zen.querySelector('.zen-ta');
    ta.value = bodyTa.value;
    const cnt = zen.querySelector('[data-zen-count]');
    const upd = () => { cnt.textContent = `${t('common.page')}: ${ta.value.length}`; };
    upd();
    ta.addEventListener('input', () => { upd(); dirty = true; bodyTa.value = ta.value; });
    const exit = () => { zenOpen = false; zen.remove(); document.removeEventListener('keydown', escH, true); };
    const escH = (e) => { if (e.key === 'Escape' && zenOpen) { e.stopPropagation(); exit(); } };
    zen.querySelector('[data-zen-exit]').addEventListener('click', exit);
    document.addEventListener('keydown', escH, true);
    document.body.appendChild(zen);
    ta.focus();
  });

  save.addEventListener('click', async () => {
    const data = collect();
    if (!data.body.trim() && !data.title.trim()) { toast(t('jr.body'), 'err'); return; }
    const now = new Date().toISOString();
    const rec = { ...j, ...data, id: j.id || uid('jr_'), createdAt: j.createdAt || now, updatedAt: now };
    try {
      await db.put('journal', rec);
      await S.refreshJournal();
      clearDraft();
      dirty = false;
      toast(t('common.saved'));
      m.close(); onSaved?.(rec);
    } catch (e) { errToast(e); }
  });
  cancel.addEventListener('click', () => m.close());

  /* draft recovery for new entries */
  if (isNew) {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.body || draft.title) {
          confirmDialog({ title: t('jr.draftFound'), message: esc(t('jr.draftFound')), okLabel: t('common.restore') })
            .then(ok => {
              if (!ok) { clearDraft(); return; }
              wrap.querySelector('[data-type]').value = draft.type || 'reflection';
              wrap.querySelector('[data-book]').value = draft.bookId || '';
              wrap.querySelector('[data-title]').value = draft.title || '';
              wrap.querySelector('[data-chapter]').value = draft.chapter || '';
              wrap.querySelector('[data-date]').value = draft.date || todayISO();
              bodyTa.value = draft.body || '';
              toast(t('jr.draftRestored'));
            });
        }
      }
    } catch {}
  }
  wrap.querySelector('[data-title]').focus();
}

/* quick note from a book page */
export function openQuickNote({ bookId = null, type = 'reflection' } = {}, opts = {}) {
  openEntryForm({ bookId, type, title: '', body: '', chapter: '', date: todayISO(), id: null, createdAt: null, updatedAt: null }, opts);
}
