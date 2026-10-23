/* আমার পাঠাগার — quick-forms.js
   Author / Publisher / Collection editors (modal forms). */

import { esc, uid, parseNum, todayISO } from './util.js';
import { t } from './i18n.js';
import * as db from './db.js';
import * as S from './state.js';
import { openModal, toast, errToast, chipInput } from './components.js';

export function openAuthorForm(existing = null, { onSaved = null } = {}) {
  const isNew = !existing;
  const a = existing ? { ...existing } : {
    id: null, nameBn: '', nameEn: '', aliases: [], biography: '',
    birthYear: null, deathYear: null, notes: '', createdAt: null, updatedAt: null,
  };
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>${esc(t('au.nameBn'))}</label><input class="input" data-bn value="${esc(a.nameBn)}"></div>
      <div class="field"><label>${esc(t('au.nameEn'))}</label><input class="input" data-en value="${esc(a.nameEn)}"></div>
    </div>
    <div class="field"><label>${esc(t('au.aliases'))}</label><div data-aliases></div><span class="hint">${esc(t('au.aliasesHint'))}</span></div>
    <div class="field"><label>${esc(t('au.biography'))}</label><textarea class="textarea" rows="3" data-bio>${esc(a.biography)}</textarea></div>
    <div class="form-grid">
      <div class="field"><label>${esc(t('au.birthYear'))}</label><input class="input" type="number" data-birth value="${a.birthYear ?? ''}"></div>
      <div class="field"><label>${esc(t('au.deathYear'))}</label><input class="input" type="number" data-death value="${a.deathYear ?? ''}"></div>
    </div>
    <div class="field"><label>${esc(t('au.notes'))}</label><textarea class="textarea" rows="2" data-notes>${esc(a.notes)}</textarea></div>
    <div class="err-text" data-err hidden></div>`;
  const aliasChips = chipInput({ items: a.aliases || [], placeholder: 'R. Tagore, রবি ঠাকুর' });
  wrap.querySelector('[data-aliases]').appendChild(aliasChips);

  const save = document.createElement('button');
  save.className = 'btn btn-primary'; save.textContent = isNew ? t('common.create') : t('common.saveChanges');
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost'; cancel.textContent = t('common.cancel');
  const m = openModal({ title: isNew ? t('au.addTitle') : t('common.edit') + ' — ' + (a.nameBn || a.nameEn), body: wrap, footer: [cancel, save] });
  save.addEventListener('click', async () => {
    const nameBn = wrap.querySelector('[data-bn]').value.trim();
    const nameEn = wrap.querySelector('[data-en]').value.trim();
    if (!nameBn && !nameEn) {
      const err = wrap.querySelector('[data-err]');
      err.hidden = false; err.textContent = t('au.nameRequired');
      return;
    }
    const now = new Date().toISOString();
    const rec = {
      ...a,
      id: a.id || uid('au_'),
      nameBn, nameEn, aliases: aliasChips._get(),
      biography: wrap.querySelector('[data-bio]').value.trim(),
      birthYear: parseNum(wrap.querySelector('[data-birth]').value),
      deathYear: parseNum(wrap.querySelector('[data-death]').value),
      notes: wrap.querySelector('[data-notes]').value.trim(),
      createdAt: a.createdAt || now, updatedAt: now,
    };
    try {
      await db.put('authors', rec);
      await S.refreshAuthors();
      toast(t('common.saved')); m.close(); onSaved?.(rec);
    } catch (e) { errToast(e); }
  });
  cancel.addEventListener('click', () => m.close());
}

export function openPublisherForm(existing = null, { onSaved = null } = {}) {
  const isNew = !existing;
  const p = existing ? { ...existing } : {
    id: null, nameBn: '', nameEn: '', aliases: [], country: '', notes: '', createdAt: null, updatedAt: null,
  };
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>${esc(t('pb.nameBn'))}</label><input class="input" data-bn value="${esc(p.nameBn)}"></div>
      <div class="field"><label>${esc(t('pb.nameEn'))}</label><input class="input" data-en value="${esc(p.nameEn)}"></div>
      <div class="field"><label>${esc(t('pb.country'))}</label><input class="input" data-country value="${esc(p.country)}"></div>
    </div>
    <div class="field"><label>${esc(t('pb.notes'))}</label><textarea class="textarea" rows="2" data-notes>${esc(p.notes)}</textarea></div>
    <div class="err-text" data-err hidden></div>`;
  const save = document.createElement('button');
  save.className = 'btn btn-primary'; save.textContent = isNew ? t('common.create') : t('common.saveChanges');
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost'; cancel.textContent = t('common.cancel');
  const m = openModal({ title: isNew ? t('action.addPublisher') : t('common.edit') + ' — ' + (p.nameBn || p.nameEn), body: wrap, footer: [cancel, save] });
  save.addEventListener('click', async () => {
    const nameBn = wrap.querySelector('[data-bn]').value.trim();
    const nameEn = wrap.querySelector('[data-en]').value.trim();
    if (!nameBn && !nameEn) {
      const err = wrap.querySelector('[data-err]');
      err.hidden = false; err.textContent = t('au.nameRequired');
      return;
    }
    const now = new Date().toISOString();
    const rec = {
      ...p, id: p.id || uid('pb_'), nameBn, nameEn,
      country: wrap.querySelector('[data-country]').value.trim(),
      notes: wrap.querySelector('[data-notes]').value.trim(),
      createdAt: p.createdAt || now, updatedAt: now,
    };
    try {
      await db.put('publishers', rec);
      await S.refreshPublishers();
      toast(t('common.saved')); m.close(); onSaved?.(rec);
    } catch (e) { errToast(e); }
  });
  cancel.addEventListener('click', () => m.close());
}

export const COLL_COLORS = ['#a9502f', '#3f6f54', '#3e5f8a', '#a8801d', '#6b5a45', '#8a4a5e'];

export function openCollectionForm(existing = null, { onSaved = null } = {}) {
  const isNew = !existing;
  const c = existing ? { ...existing } : {
    id: null, nameBn: '', nameEn: '', description: '', color: COLL_COLORS[0], createdAt: null,
  };
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>${esc(t('co.nameBn'))}</label><input class="input" data-bn value="${esc(c.nameBn)}"></div>
      <div class="field"><label>${esc(t('co.nameEn'))}</label><input class="input" data-en value="${esc(c.nameEn)}"></div>
    </div>
    <div class="field"><label>${esc(t('co.desc'))}</label><textarea class="textarea" rows="2" data-desc>${esc(c.description)}</textarea></div>
    <div class="field"><label>${esc(t('co.color'))}</label>
      <div class="coll-colors" data-colors>
        ${COLL_COLORS.map(col => `<button type="button" data-color="${col}" style="background:${col}" class="${c.color === col ? 'sel' : ''}" aria-label="${col}"></button>`).join('')}
      </div></div>
    <div class="err-text" data-err hidden></div>`;
  wrap.querySelectorAll('[data-color]').forEach(b => b.addEventListener('click', () => {
    wrap.querySelectorAll('[data-color]').forEach(x => x.classList.remove('sel'));
    b.classList.add('sel');
  }));
  const save = document.createElement('button');
  save.className = 'btn btn-primary'; save.textContent = isNew ? t('common.create') : t('common.saveChanges');
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost'; cancel.textContent = t('common.cancel');
  const m = openModal({ title: isNew ? t('action.addCollection') : t('common.edit'), body: wrap, footer: [cancel, save] });
  save.addEventListener('click', async () => {
    const nameBn = wrap.querySelector('[data-bn]').value.trim();
    const nameEn = wrap.querySelector('[data-en]').value.trim();
    if (!nameBn && !nameEn) {
      const err = wrap.querySelector('[data-err]');
      err.hidden = false; err.textContent = t('co.nameRequired');
      return;
    }
    const rec = {
      ...c, id: c.id || uid('co_'), nameBn, nameEn,
      description: wrap.querySelector('[data-desc]').value.trim(),
      color: wrap.querySelector('[data-color].sel')?.dataset.color || COLL_COLORS[0],
      createdAt: c.createdAt || todayISO(),
    };
    try {
      await db.put('collections', rec);
      await S.refreshCollections();
      toast(t('common.saved')); m.close(); onSaved?.(rec);
    } catch (e) { errToast(e); }
  });
  cancel.addEventListener('click', () => m.close());
}
