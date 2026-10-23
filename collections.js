/* আমার পাঠাগার — views/collections.js
   Custom collections: create, edit, delete, browse books inside. */

import { esc, fmtNum, truncate } from '../util.js';
import { t, sub } from '../i18n.js';
import * as S from '../state.js';
import * as db from '../db.js';
import { emptyState, toast, errToast, confirmDialog, coverHTML, statusBadge } from '../components.js';
import { openCollectionForm } from '../quick-forms.js';
import { uiLang } from '../state.js';

export function render(el, ctx) {
  const L = uiLang();
  const selId = ctx.params[0] || null;
  const selected = selId ? S.collectionById(selId) : null;

  el.innerHTML = `
    <div class="page-head">
      <div class="ph-row">
        <div>
          <span class="ph-en">${esc(sub('nav.collections'))}</span>
          <h1>${esc(t('co.title'))}</h1>
          <div class="ph-desc">${esc(t('co.subtitle'))}</div>
        </div>
        <button class="btn btn-primary" data-add><svg class="i"><use href="#i-plus"/></svg>${esc(t('action.addCollection'))}</button>
      </div>
    </div>
    <div data-body></div>`;

  const body = el.querySelector('[data-body]');
  el.querySelector('[data-add]').addEventListener('click', () => openCollectionForm(null, { onSaved: () => render(el, ctx) }));

  function countOf(c) {
    return S.state.books.filter(b => (b.customCollectionIds || []).includes(c.id) && !b.isArchived).length;
  }

  function paint() {
    if (!S.state.collections.length) {
      body.innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.innerHTML = `<svg class="i"><use href="#i-plus"/></svg>${esc(t('action.addCollection'))}`;
      btn.addEventListener('click', () => openCollectionForm(null, { onSaved: () => render(el, ctx) }));
      body.appendChild(emptyState({ icon: 'collection', title: t('co.title'), body: t('co.empty'), actions: [btn] }));
      return;
    }
    const colls = [...S.state.collections].sort((a, b) => (a.nameBn || a.nameEn || '').localeCompare(b.nameBn || b.nameEn || '', 'bn'));
    body.innerHTML = `
      ${selected ? `<section class="section card card-pad" data-panel style="margin-bottom:18px"></section>` : ''}
      <div class="coll-grid">
        ${colls.map(c => `
        <button class="coll-card" data-open="${c.id}" style="${selected?.id === c.id ? 'border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)' : ''}">
          <div class="flex" style="gap:8px"><span class="c-dot" style="background:${esc(c.color || '#a9502f')}"></span>
            <h3>${esc(c.nameBn || c.nameEn)}</h3></div>
          ${c.nameBn && c.nameEn ? `<div class="muted small">${esc(c.nameEn)}</div>` : ''}
          <div class="c-desc">${esc(c.description || '')}</div>
          <div class="c-count">${esc(t('co.count', { n: fmtNum(countOf(c), L) }))}</div>
        </button>`).join('')}
      </div>`;
    body.querySelectorAll('[data-open]').forEach(n => n.addEventListener('click', () => {
      location.hash = `#/collections/${n.dataset.open}`;
    }));
    if (selected) paintPanel();
  }

  function paintPanel() {
    const panel = body.querySelector('[data-panel]');
    const books = S.state.books.filter(b => (b.customCollectionIds || []).includes(selected.id));
    panel.innerHTML = `
      <div class="section-head">
        <h2><span class="c-dot" style="background:${esc(selected.color || '#a9502f')};display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:6px"></span>${esc(selected.nameBn || selected.nameEn)}</h2>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-edit-c>${esc(t('common.edit'))}</button>
        <button class="btn btn-sm btn-ghost" data-del-c>${esc(t('common.delete'))}</button>
        <a class="small" href="#/collections">✕ ${esc(t('common.close'))}</a>
      </div>
      ${selected.description ? `<p class="small" style="margin-top:0">${esc(selected.description)}</p>` : ''}
      ${books.length ? `<div class="row-list">${books.map(b => `
        <div class="act-row">
          <a href="#/book/${b.id}" style="width:34px;flex:none">${coverHTML(b, { withMarks: false }).replace('class="bcover', 'style="border-radius:7px;aspect-ratio:5/7;width:34px" class="bcover')}</a>
          <div class="act-title grow"><a href="#/book/${b.id}">${esc(truncate(b.titleBn || b.titleEn || '—', 50))}</a>
            <div class="muted small">${esc(truncate(S.bookAuthors(b, L) || '', 44))}</div></div>
          ${statusBadge(b.readingStatus)}
          <button class="icon-btn sm" data-remove="${b.id}" title="${esc(t('common.remove'))}" aria-label="${esc(t('common.remove'))}"><svg class="i"><use href="#i-x"/></svg></button>
        </div>`).join('')}</div>` : `<p class="muted small">${esc(t('common.noResults'))}</p>`}`;
    panel.querySelector('[data-edit-c]').addEventListener('click', () => {
      openCollectionForm(selected, { onSaved: () => render(el, ctx) });
    });
    panel.querySelector('[data-del-c]').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: t('common.delete'),
        message: esc(t('co.deleteConfirm', { name: selected.nameBn || selected.nameEn })),
        danger: true, okLabel: t('common.delete'),
      });
      if (!ok) return;
      try {
        await db.deleteCollectionCascade(selected.id, S.state.books);
        await S.refreshCollections(); await S.refreshBooks();
        toast(t('common.deleted'));
        location.hash = '#/collections';
      } catch (e) { errToast(e); }
    });
    panel.querySelectorAll('[data-remove]').forEach(n => n.addEventListener('click', async () => {
      const b = S.bookById(n.dataset.remove);
      b.customCollectionIds = (b.customCollectionIds || []).filter(x => x !== selected.id);
      b.updatedAt = new Date().toISOString();
      await db.put('books', b);
      await S.refreshBooks();
      toast(t('common.saved'));
      paint();
    }));
  }

  paint();
}
