/* আমার পাঠাগার — views/settings.js
   Appearance, language, defaults, goals, search prefs, genre/tag manager,
   storage info, sample-data removal, danger zone (clear all). */

import { esc, fmtNum, formatBytes } from '../util.js';
import { t, sub, setLang, applyStatic } from '../i18n.js';
import * as S from '../state.js';
import * as db from '../db.js';
import { toast, errToast, confirmDialog, openModal } from '../components.js';
import { removeSample } from '../sample.js';
import { uiLang } from '../state.js';

export function render(el) {
  const L = uiLang();
  const P = S.prefs();

  el.innerHTML = `
    <div class="page-head">
      <span class="ph-en">${esc(sub('nav.settings'))}</span>
      <h1>${esc(t('st.title'))}</h1>
      <div class="ph-desc">${esc(t('st.subtitle'))}</div>
    </div>

    <div class="settings-grid">
      <section class="card card-pad">
        <h3>${esc(t('st.appearance'))}</h3>
        <div class="set-row"><div><div class="s-label">${esc(t('st.theme'))}</div></div>
          <select class="select" data-p="theme">
            <option value="light" ${P.theme === 'light' ? 'selected' : ''}>${esc(t('st.themeLight'))}</option>
            <option value="dark" ${P.theme === 'dark' ? 'selected' : ''}>${esc(t('st.themeDark'))}</option>
            <option value="auto" ${P.theme === 'auto' ? 'selected' : ''}>${esc(t('st.themeAuto'))}</option>
          </select></div>
        <div class="set-row"><div><div class="s-label">${esc(t('st.uiLang'))}</div>
          <div class="s-desc">${esc(t('st.uiLangNote'))}</div></div>
          <select class="select" data-p="uiLang">
            <option value="bn" ${P.uiLang === 'bn' ? 'selected' : ''}>${esc(t('st.uiLangBn'))}</option>
            <option value="en" ${P.uiLang === 'en' ? 'selected' : ''}>${esc(t('st.uiLangEn'))}</option>
            <option value="mixed" ${P.uiLang === 'mixed' ? 'selected' : ''}>${esc(t('st.uiLangMixed'))}</option>
          </select></div>
        <div class="set-row"><div><div class="s-label">${esc(t('st.fontBody'))}</div></div>
          <select class="select" data-p="fontBody">
            <option value="sans" ${P.fontBody === 'sans' ? 'selected' : ''}>${esc(t('st.fontSans'))}</option>
            <option value="serif" ${P.fontBody === 'serif' ? 'selected' : ''}>${esc(t('st.fontSerif'))}</option>
          </select></div>
      </section>

      <section class="card card-pad">
        <h3>${esc(t('st.defaults'))}</h3>
        <div class="set-row"><div class="s-label">${esc(t('st.defaultLang'))}</div>
          <select class="select" data-p="defaultLanguage">
            ${['bn', 'en', 'bilingual', 'other'].map(v => `<option value="${v}" ${P.defaultLanguage === v ? 'selected' : ''}>${esc(t('lang.' + v))}</option>`).join('')}
          </select></div>
        <div class="set-row"><div class="s-label">${esc(t('st.defaultStatus'))}</div>
          <select class="select" data-p="defaultStatus">
            ${['to-read', 'reading', 'completed', 'paused', 'abandoned'].map(v => `<option value="${v}" ${P.defaultStatus === v ? 'selected' : ''}>${esc(t('status.' + v))}</option>`).join('')}
          </select></div>
        <div class="set-row"><div class="s-label">${esc(t('st.defaultView'))}</div>
          <select class="select" data-p="defaultView">
            <option value="grid" ${P.defaultView === 'grid' ? 'selected' : ''}>${esc(t('st.viewGrid'))}</option>
            <option value="table" ${P.defaultView === 'table' ? 'selected' : ''}>${esc(t('st.viewTable'))}</option>
          </select></div>
        <div class="set-row"><div class="s-label">${esc(t('st.defaultSort'))}</div>
          <select class="select" data-p="defaultSort">
            ${[['newest', t('tbl.sortNewest')], ['oldest', t('tbl.sortOldest')], ['titleBn', t('tbl.sortTitleBn')], ['titleEn', t('tbl.sortTitleEn')], ['author', t('tbl.sortAuthor')], ['rating', t('tbl.sortRating')]]
              .map(([v, l]) => `<option value="${v}" ${P.defaultSort === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}
          </select></div>
      </section>

      <section class="card card-pad">
        <h3>${esc(t('st.search'))}</h3>
        <div class="set-row"><div><div class="s-label">${esc(t('st.searchNotes'))}</div>
          <div class="s-desc">${esc(t('st.searchNotesHint'))}</div></div>
          <span class="switch"><input type="checkbox" data-p="searchNotes" ${P.searchNotes ? 'checked' : ''}><span class="sw-track"></span><span class="sw-dot"></span></span></div>
        <div class="set-row"><div><div class="s-label">${esc(t('st.fuzzy'))}</div>
          <div class="s-desc">${esc(t('st.fuzzyHint'))}</div></div>
          <span class="switch"><input type="checkbox" data-p="fuzzy" ${P.fuzzy ? 'checked' : ''}><span class="sw-track"></span><span class="sw-dot"></span></span></div>
      </section>

      <section class="card card-pad">
        <h3>${esc(t('st.goals'))}</h3>
        <p class="small muted" style="margin-top:2px">${esc(t('st.goalHint'))}</p>
        <div class="set-row"><div class="s-label">${esc(t('st.goalYear'))}</div>
          <input class="input" type="number" min="0" style="width:90px" data-goal="year" value="${P.goals?.year || 0}"></div>
        <div class="set-row"><div class="s-label">${esc(t('st.goalMonth'))}</div>
          <input class="input" type="number" min="0" style="width:90px" data-goal="month" value="${P.goals?.month || 0}"></div>
        <div class="set-row"><div class="s-label">${esc(t('st.goalDays'))}</div>
          <input class="input" type="number" min="0" max="7" style="width:90px" data-goal="daysPerWeek" value="${P.goals?.daysPerWeek || 0}"></div>
        <div class="set-row"><div class="s-label">${esc(t('st.goalPages'))}</div>
          <input class="input" type="number" min="0" style="width:90px" data-goal="pagesYear" value="${P.goals?.pagesYear || 0}"></div>
      </section>

      <section class="card card-pad">
        <h3>${esc(t('st.dataMgmt'))}</h3>
        <div data-storage></div>
        <p class="small muted">${esc(t('st.dbInfo', { v: String(db.DB_VERSION) }))}</p>
        <div class="warncard" style="margin-bottom:12px"><svg class="i"><use href="#i-alert"/></svg><span>${esc(t('st.dataLossWarn'))}</span></div>
        <div class="btn-row">
          <a class="btn" href="#/data"><svg class="i"><use href="#i-data"/></svg>${esc(t('nav.data'))}</a>
        </div>
        <hr class="hairline">
        <div class="set-row"><div class="s-label">${esc(t('st.sampleData'))}</div>
          <button class="btn btn-sm" data-sample>${esc(t('st.sampleRemove'))}</button></div>
      </section>

      <section class="card card-pad">
        <h3>${esc(t('st.genresTags'))}</h3>
        <p class="small muted" style="margin-top:2px">${esc(t('st.genresDesc'))}</p>
        <div class="mgmt-list" data-genres style="max-height:260px;overflow-y:auto"></div>
        <div class="btn-row mt8">
          <input class="input" data-new-genre style="max-width:220px" placeholder="${esc(t('co.nameBn'))} / ${esc(t('co.nameEn'))}">
          <button class="btn btn-sm" data-add-genre><svg class="i"><use href="#i-plus"/></svg>${esc(t('action.addGenre'))}</button>
        </div>
        <hr class="hairline">
        <div class="s-label mb8">${esc(t('st.tagList'))}</div>
        <div class="tagline" data-tags></div>
      </section>

      <section class="card card-pad">
        <h3>${esc(t('st.about'))}</h3>
        <p class="small">${esc(t('st.version'))}: <b>১.০.০</b> · ${esc(t('st.offlineInfo'))}</p>
        <p class="small muted">${esc(t('st.pwaNote'))}</p>
        <hr class="hairline">
        <h3 style="color:var(--red)">${esc(t('st.danger'))}</h3>
        <p class="small muted">${esc(t('st.clearAllDesc'))}</p>
        <button class="btn btn-danger" data-clear>${esc(t('st.clearAll'))}</button>
      </section>
    </div>`;

  /* prefs wiring */
  el.querySelectorAll('[data-p]').forEach(n => n.addEventListener('change', async () => {
    const key = n.dataset.p;
    let v = n.type === 'checkbox' ? n.checked : n.value;
    if (key === 'uiLang') { setLang(v); applyStatic(document); }
    if (key === 'searchNotes') { S.savePrefs({ [key]: v }); await S.refreshJournal(); S.refreshSearch(); }
    S.savePrefs({ [key]: v });
    document.dispatchEvent(new CustomEvent('ap:theme'));
    toast(t('common.settingsSaved'));
  }));

  el.querySelectorAll('[data-goal]').forEach(n => n.addEventListener('change', () => {
    const g = { ...S.prefs().goals, [n.dataset.goal]: Math.max(0, Number(n.value) || 0) };
    S.savePrefs({ goals: g });
    toast(t('common.settingsSaved'));
  }));

  /* storage */
  (async () => {
    const est = await db.estimateStorage();
    const box = el.querySelector('[data-storage]');
    if (est.usage == null) { box.innerHTML = `<p class="small muted">${esc(t('st.storageUsed'))}: —</p>`; return; }
    const pct = est.quota ? Math.min(100, (est.usage / est.quota) * 100) : 0;
    const counts = await db.countAll();
    box.innerHTML = `
      <div class="s-label">${esc(t('st.storageUsed'))}</div>
      <div class="storage-bar"><span style="width:${pct.toFixed(1)}%"></span></div>
      <p class="small muted" style="margin-top:4px">${esc(formatBytes(est.usage))} / ${esc(est.quota ? formatBytes(est.quota) : '—')}
       · ${esc(t('st.records'))}: ${esc(fmtNum(counts.books, L))} ${esc(t('t.book'))}, ${esc(fmtNum(counts.sessions, L))} ${esc(t('t.session'))}, ${esc(fmtNum(counts.attachments, L))} ${esc(t('t.attachment'))}</p>`;
  })();

  /* genres manager */
  function paintGenres() {
    const box = el.querySelector('[data-genres]');
    box.innerHTML = S.state.genres.map(g => {
      const inUse = S.state.books.filter(b => b.primaryGenre === g.id || (b.genres || []).includes(g.id)).length;
      return `<div class="mgmt-row">
        <span class="grow">${esc(g.nameBn || g.nameEn)} ${g.nameBn && g.nameEn ? `<span class="muted small">${esc(g.nameEn)}</span>` : ''}</span>
        <span class="m-count">${esc(fmtNum(inUse, L))} ${esc(t('t.book'))}</span>
        <button class="icon-btn sm" data-delg="${g.id}" aria-label="${esc(t('common.delete'))}"><svg class="i"><use href="#i-trash"/></svg></button>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-delg]').forEach(b => b.addEventListener('click', async () => {
      const g = S.state.genres.find(x => x.id === b.dataset.delg);
      const inUse = S.state.books.filter(x => x.primaryGenre === g.id || (x.genres || []).includes(g.id)).length;
      const ok = await confirmDialog({
        title: t('common.delete'),
        message: `<b>${esc(g.nameBn || g.nameEn)}</b> — ${esc(t('st.genreInUse', { n: fmtNum(inUse, L) }))}`,
        danger: true, okLabel: t('common.delete'),
      });
      if (!ok) return;
      S.state.genres = S.state.genres.filter(x => x.id !== g.id);
      await S.updateGenres();
      for (const bk of S.state.books) {
        let changed = false;
        if (bk.primaryGenre === g.id) { bk.primaryGenre = ''; changed = true; }
        if ((bk.genres || []).includes(g.id)) { bk.genres = bk.genres.filter(x => x !== g.id); changed = true; }
        if (changed) await db.put('books', bk);
      }
      await S.refreshBooks();
      toast(t('common.deleted'));
      paintGenres();
    }));
    const tagBox = el.querySelector('[data-tags]');
    const tags = S.allTags();
    tagBox.innerHTML = tags.length ? tags.map(x => `<span class="tag-pill">${esc(x)}</span>`).join('') : '<span class="muted small">—</span>';
  }
  paintGenres();

  el.querySelector('[data-add-genre]').addEventListener('click', async () => {
    const v = el.querySelector('[data-new-genre]').value.trim();
    if (!v) return;
    const isBn = /[\u0980-\u09FF]/.test(v);
    await S.addGenre(isBn ? v : '', isBn ? '' : v);
    el.querySelector('[data-new-genre]').value = '';
    toast(t('common.saved'));
    paintGenres();
  });

  /* sample removal */
  el.querySelector('[data-sample]').addEventListener('click', async () => {
    await removeSample();
    toast(t('st.sampleRemoved'));
    document.dispatchEvent(new CustomEvent('ap:rerender'));
  });

  /* clear all */
  el.querySelector('[data-clear]').addEventListener('click', async () => {
    const word = t('st.clearConfirmWord');
    const ok = await confirmDialog({
      title: t('st.clearAll'),
      message: `<b>${esc(t('st.clearAllDesc'))}</b>`,
      danger: true, okLabel: t('st.clearAll'), requireWord: word,
    });
    if (!ok) return;
    try {
      await db.wipeDatabase();
      try { localStorage.removeItem('ap.prefs'); localStorage.removeItem('ap.journalDraft'); } catch {}
      toast(t('st.cleared'));
      setTimeout(() => location.reload(), 600);
    } catch (e) { errToast(e); }
  });
}
