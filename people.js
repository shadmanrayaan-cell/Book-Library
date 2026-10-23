/* আমার পাঠাগার — views/people.js
   Authors & Publishers: card grids, detail panels with their books. */

import { esc, fmtNum, truncate, hashStr, bnInitial } from '../util.js';
import { t, sub } from '../i18n.js';
import * as S from '../state.js';
import * as db from '../db.js';
import { emptyState, toast, errToast, confirmDialog, coverHTML, statusBadge } from '../components.js';
import { openAuthorForm, openPublisherForm } from '../quick-forms.js';
import { uiLang } from '../state.js';

/* ================= AUTHORS ================= */
export function renderAuthors(el, ctx) {
  const L = uiLang();
  const selId = ctx.params[0] || null;
  const q = (ctx.query.get('q') || '').toLowerCase();

  let authors = [...S.state.authors].sort((a, b) => (a.nameBn || a.nameEn || '').localeCompare(b.nameBn || b.nameEn || '', 'bn'));
  if (q) authors = authors.filter(a => [a.nameBn, a.nameEn, ...(a.aliases || [])].some(x => (x || '').toLowerCase().includes(q)));

  const selected = selId ? S.authorById(selId) : null;

  el.innerHTML = `
    <div class="page-head">
      <div class="ph-row">
        <div>
          <span class="ph-en">${esc(sub('nav.authors'))}</span>
          <h1>${esc(t('au.title'))}</h1>
          <div class="ph-desc">${esc(t('au.subtitle'))}</div>
        </div>
        <button class="btn btn-primary" data-add><svg class="i"><use href="#i-plus"/></svg>${esc(t('action.addAuthor'))}</button>
      </div>
    </div>
    <div class="toolbar"><div class="search-wrap">
      <svg class="i"><use href="#i-search"/></svg>
      <input class="input" type="search" data-q value="${esc(ctx.query.get('q') || '')}" placeholder="${esc(t('common.search'))}…" aria-label="${esc(t('common.search'))}">
    </div></div>
    <div data-body></div>`;

  const body = el.querySelector('[data-body]');
  el.querySelector('[data-add]').addEventListener('click', () => openAuthorForm(null, { onSaved: () => renderAuthors(el, ctx) }));
  const qInput = el.querySelector('[data-q]');
  qInput.addEventListener('input', () => {
    const v = qInput.value;
    const hash = selId ? `#/authors/${selId}?q=${encodeURIComponent(v)}` : `#/authors?q=${encodeURIComponent(v)}`;
    history.replaceState(null, '', hash);
    ctx.query.set('q', v);
    paintGrid();
  });

  function paintGrid() {
    const list = [...S.state.authors].sort((a, b) => (a.nameBn || a.nameEn || '').localeCompare(b.nameBn || b.nameEn || '', 'bn'));
    const filt = q ? list.filter(a => [a.nameBn, a.nameEn, ...(a.aliases || [])].some(x => (x || '').toLowerCase().includes(q))) : list;
    if (!S.state.authors.length) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.innerHTML = `<svg class="i"><use href="#i-plus"/></svg>${esc(t('action.addAuthor'))}`;
      btn.addEventListener('click', () => openAuthorForm(null, { onSaved: () => renderAuthors(el, ctx) }));
      body.innerHTML = ''; body.appendChild(emptyState({ icon: 'authors', title: t('au.title'), body: t('au.empty'), actions: [btn] }));
      return;
    }
    if (!filt.length) { body.innerHTML = `<div class="empty"><h3>${esc(t('common.noResults'))}</h3><p>${esc(t('common.noResultsHint'))}</p></div>`; return; }
    body.innerHTML = `
      ${selected ? `<section class="section card card-pad" style="margin-bottom:18px" data-panel></section>` : ''}
      <div class="people-grid">
        ${filt.map(a => {
          const count = S.state.books.filter(b => [...(b.authors || []), ...(b.translators || []), ...(b.editors || []), ...(b.illustrators || [])].includes(a.id)).length;
          const col = ['var(--accent)', 'var(--green)', 'var(--blue)', 'var(--gold)'][hashStr(a.id) % 4];
          const life = a.birthYear ? `${a.birthYear}${a.deathYear ? '–' + a.deathYear : ''}` : '';
          return `
          <div class="person-card" style="${selected?.id === a.id ? 'border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)' : ''}">
            <div class="p-ava" style="background:${col}">${esc(bnInitial(a.nameBn || a.nameEn))}</div>
            <h3><a href="#/authors/${a.id}">${esc(a.nameBn || a.nameEn)}</a></h3>
            ${a.nameBn && a.nameEn ? `<div class="p-meta">${esc(a.nameEn)}</div>` : ''}
            ${life ? `<div class="p-meta">${esc(life)}</div>` : ''}
            <div class="p-bio">${esc(truncate(a.biography || a.notes || '', 90))}</div>
            <div class="p-foot">
              <span class="badge b-neutral">${esc(fmtNum(count, L))} ${esc(t('t.book'))}</span>
              <span style="flex:1"></span>
              <button class="icon-btn sm" data-edit="${a.id}" aria-label="${esc(t('common.edit'))}"><svg class="i"><use href="#i-edit"/></svg></button>
              <button class="icon-btn sm" data-del="${a.id}" aria-label="${esc(t('common.delete'))}"><svg class="i"><use href="#i-trash"/></svg></button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      openAuthorForm(S.authorById(b.dataset.edit), { onSaved: () => renderAuthors(el, ctx) });
    }));
    body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      const a = S.authorById(b.dataset.del);
      const count = S.state.books.filter(x => [...(x.authors || []), ...(x.translators || [])].includes(a.id)).length;
      confirmDialog({
        title: t('common.delete'),
        message: `<b>${esc(a.nameBn || a.nameEn)}</b> — ${esc(t('au.deleteInUse', { n: fmtNum(count, L) }))}`,
        danger: true, okLabel: t('common.delete'),
      }).then(async (ok) => {
        if (!ok) return;
        try {
          await db.deleteAuthorCascade(a.id, S.state.books);
          await S.refreshAuthors(); await S.refreshBooks();
          toast(t('common.deleted'));
          location.hash = '#/authors';
        } catch (e) { errToast(e); }
      });
    }));
    if (selected) paintPanel();
  }

  function paintPanel() {
    const panel = body.querySelector('[data-panel]');
    if (!panel) return;
    const books = S.state.books.filter(b => [...(b.authors || []), ...(b.translators || []), ...(b.editors || []), ...(b.illustrators || [])].includes(selected.id));
    panel.innerHTML = `
      <div class="section-head"><h2>${esc(t('au.booksBy'))} — ${esc(selected.nameBn || selected.nameEn)}</h2>
        <span class="spacer"></span>
        <a class="small" href="#/authors">✕ ${esc(t('common.close'))}</a></div>
      ${selected.biography ? `<p class="small" style="margin-top:0">${esc(selected.biography)}</p>` : ''}
      ${books.length ? `<div class="row-list">${books.map(b => `
        <div class="act-row">
          <a href="#/book/${b.id}" style="width:34px;flex:none">${coverHTML(b, { withMarks: false }).replace('class="bcover', 'style="border-radius:7px;aspect-ratio:5/7;width:34px" class="bcover')}</a>
          <div class="act-title grow"><a href="#/book/${b.id}">${esc(truncate(b.titleBn || b.titleEn || '—', 50))}</a></div>
          ${statusBadge(b.readingStatus)}
        </div>`).join('')}</div>` : `<p class="muted small">—</p>`}`;
  }

  paintGrid();
}

/* ================= PUBLISHERS ================= */
export function renderPublishers(el, ctx) {
  const L = uiLang();
  const selId = ctx.params[0] || null;
  const selected = selId ? S.publisherById(selId) : null;

  el.innerHTML = `
    <div class="page-head">
      <div class="ph-row">
        <div>
          <span class="ph-en">${esc(sub('nav.publishers'))}</span>
          <h1>${esc(t('pb.title'))}</h1>
          <div class="ph-desc">${esc(t('pb.subtitle'))}</div>
        </div>
        <button class="btn btn-primary" data-add><svg class="i"><use href="#i-plus"/></svg>${esc(t('action.addPublisher'))}</button>
      </div>
    </div>
    <div data-body></div>`;

  const body = el.querySelector('[data-body]');
  el.querySelector('[data-add]').addEventListener('click', () => openPublisherForm(null, { onSaved: () => renderPublishers(el, ctx) }));

  function paint() {
    if (!S.state.publishers.length) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.innerHTML = `<svg class="i"><use href="#i-plus"/></svg>${esc(t('action.addPublisher'))}`;
      btn.addEventListener('click', () => openPublisherForm(null, { onSaved: () => renderPublishers(el, ctx) }));
      body.innerHTML = ''; body.appendChild(emptyState({ icon: 'publisher', title: t('pb.title'), body: t('pb.empty'), actions: [btn] }));
      return;
    }
    const pubs = [...S.state.publishers].sort((a, b) => (a.nameBn || a.nameEn || '').localeCompare(b.nameBn || b.nameEn || '', 'bn'));
    body.innerHTML = `
      ${selected ? `<section class="section card card-pad" style="margin-bottom:18px" data-panel></section>` : ''}
      <div class="people-grid">
        ${pubs.map(p => {
          const count = S.state.books.filter(b => (b.publishers || []).includes(p.id)).length;
          return `
          <div class="person-card" style="${selected?.id === p.id ? 'border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)' : ''}">
            <div class="p-ava" style="background:var(--surface-3);color:var(--ink-2)"><svg class="i"><use href="#i-publisher"/></svg></div>
            <h3><a href="#/publishers/${p.id}">${esc(p.nameBn || p.nameEn)}</a></h3>
            ${p.nameBn && p.nameEn ? `<div class="p-meta">${esc(p.nameEn)}</div>` : ''}
            ${p.country ? `<div class="p-meta">${esc(p.country)}</div>` : ''}
            <div class="p-foot">
              <span class="badge b-neutral">${esc(fmtNum(count, L))} ${esc(t('t.book'))}</span>
              <span style="flex:1"></span>
              <button class="icon-btn sm" data-edit="${p.id}" aria-label="${esc(t('common.edit'))}"><svg class="i"><use href="#i-edit"/></svg></button>
              <button class="icon-btn sm" data-del="${p.id}" aria-label="${esc(t('common.delete'))}"><svg class="i"><use href="#i-trash"/></svg></button>
            </div>
          </div>`;
        }).join('')}
      </div>`;
    body.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      openPublisherForm(S.publisherById(b.dataset.edit), { onSaved: () => renderPublishers(el, ctx) });
    }));
    body.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      const p = S.publisherById(b.dataset.del);
      const count = S.state.books.filter(x => (x.publishers || []).includes(p.id)).length;
      confirmDialog({
        title: t('common.delete'),
        message: `<b>${esc(p.nameBn || p.nameEn)}</b> — ${esc(t('pb.deleteInUse', { n: fmtNum(count, L) }))}`,
        danger: true, okLabel: t('common.delete'),
      }).then(async (ok) => {
        if (!ok) return;
        try {
          await db.deletePublisherCascade(p.id, S.state.books);
          await S.refreshPublishers(); await S.refreshBooks();
          toast(t('common.deleted'));
          location.hash = '#/publishers';
        } catch (e) { errToast(e); }
      });
    }));
    if (selected) {
      const panel = body.querySelector('[data-panel]');
      const books = S.state.books.filter(b => (b.publishers || []).includes(selected.id));
      panel.innerHTML = `
        <div class="section-head"><h2>${esc(t('pb.booksBy'))} — ${esc(selected.nameBn || selected.nameEn)}</h2>
          <span class="spacer"></span>
          <a class="small" href="#/publishers">✕ ${esc(t('common.close'))}</a></div>
        ${books.length ? `<div class="row-list">${books.map(b => `
          <div class="act-row">
            <a href="#/book/${b.id}" style="width:34px;flex:none">${coverHTML(b, { withMarks: false }).replace('class="bcover', 'style="border-radius:7px;aspect-ratio:5/7;width:34px" class="bcover')}</a>
            <div class="act-title grow"><a href="#/book/${b.id}">${esc(truncate(b.titleBn || b.titleEn || '—', 50))}</a></div>
            ${statusBadge(b.readingStatus)}
          </div>`).join('')}</div>` : `<p class="muted small">—</p>`}`;
    }
  }
  paint();
}
