/* আমার পাঠাগার — views/digital.js
   PDF & Digital Shelf: attached files / external links / known-unlinked,
   with file size, storage usage, and safe open/download actions. */

import { esc, formatBytes, fmtNum, truncate } from '../util.js';
import { t, sub } from '../i18n.js';
import * as S from '../state.js';
import * as db from '../db.js';
import { emptyState, toast, errToast } from '../components.js';
import * as A from '../actions.js';
import { uiLang } from '../state.js';

export function render(el) {
  const L = uiLang();
  let tab = 'attached';
  let q = '';
  let statusF = '';

  el.innerHTML = `
    <div class="page-head">
      <span class="ph-en">${esc(sub('nav.digital'))}</span>
      <h1>${esc(t('dg.title'))}</h1>
      <div class="ph-desc">${esc(t('dg.subtitle'))}</div>
    </div>
    <div class="infocard" style="margin-bottom:16px"><svg class="i"><use href="#i-info"/></svg><span>${esc(t('dg.storageNote'))}</span></div>
    <div class="warncard" data-storage style="margin-bottom:16px"></div>
    <div class="toolbar">
      <div class="search-wrap">
        <svg class="i"><use href="#i-search"/></svg>
        <input class="input" type="search" data-q placeholder="${esc(t('dg.searchFilePh'))}" aria-label="${esc(t('dg.searchFilePh'))}">
      </div>
      <select class="select" data-lang>
        <option value="">${esc(t('dg.language'))}: ${esc(t('common.all'))}</option>
        ${['bn', 'en', 'bilingual', 'other'].map(v => `<option value="${v}">${esc(t('lang.' + v))}</option>`).join('')}
      </select>
      <select class="select" data-status>
        <option value="">${esc(t('dg.filterStatus'))}: ${esc(t('common.all'))}</option>
        ${['to-read', 'reading', 'completed', 'paused', 'abandoned'].map(v => `<option value="${v}">${esc(t('status.' + v))}</option>`).join('')}
      </select>
    </div>
    <div class="tabs" data-tabs>
      <button class="tab active" data-tab="attached">${esc(t('dg.tabAttached'))}</button>
      <button class="tab" data-tab="linked">${esc(t('dg.tabLinked'))}</button>
      <button class="tab" data-tab="unlinked">${esc(t('dg.tabUnlinked'))}</button>
    </div>
    <div class="card" style="padding:6px 18px" data-list></div>`;

  const listEl = el.querySelector('[data-list]');
  el.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value.toLowerCase(); paint(); });
  el.querySelector('[data-lang]').addEventListener('change', (e) => { langF = e.target.value; paint(); });
  el.querySelector('[data-status]').addEventListener('change', (e) => { statusF = e.target.value; paint(); });
  let langF = '';
  el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    el.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
    paint();
  }));

  async function paintStorage() {
    const est = await db.estimateStorage();
    const elS = el.querySelector('[data-storage]');
    if (est.usage == null) { elS.innerHTML = `<svg class="i"><use href="#i-info"/></svg><span>${esc(t('dg.storage'))}: —</span>`; return; }
    const pct = est.quota ? Math.min(100, (est.usage / est.quota) * 100) : 0;
    elS.innerHTML = `
      <svg class="i"><use href="#i-digital"/></svg>
      <div style="flex:1">
        <b>${esc(t('dg.storage'))}</b> — ${esc(formatBytes(est.usage))} / ${esc(est.quota ? formatBytes(est.quota) : '—')}
        <div class="storage-bar"><span style="width:${pct.toFixed(1)}%"></span></div>
      </div>`;
  }

  function collect() {
    const rows = [];
    for (const b of S.state.books) {
      if (langF && b.language !== langF) continue;
      if (statusF && b.readingStatus !== statusF) continue;
      for (const f of b.formats || []) {
        const att = f.attachmentId ? S.state.attachments.find(a => a.attachmentId === f.attachmentId) : null;
        const kind = f.type === 'physical' ? null
          : (f.availabilityStatus === 'attached' && att) ? 'attached'
          : (f.availabilityStatus === 'external-link' && f.externalUrl) ? 'linked'
          : f.type !== 'physical' ? 'unlinked' : null;
        if (!kind) continue;
        rows.push({ b, f, att, kind });
      }
    }
    return rows;
  }

  function paint() {
    const rows = collect().filter(r => r.kind === tab);
    const filt = q ? rows.filter(r => {
      const hay = [r.att?.fileName, r.f?.fileName, r.f?.externalUrl, r.b.titleBn, r.b.titleEn].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }) : rows;
    filt.sort((a, b) => (a.b.titleBn || a.b.titleEn || '').localeCompare(b.b.titleBn || b.b.titleEn || '', 'bn'));

    const emptyMsg = { attached: t('dg.emptyAttached'), linked: t('dg.emptyLinked'), unlinked: t('dg.emptyUnlinked') }[tab];
    if (!filt.length) {
      listEl.innerHTML = `<div class="empty" style="border:none;margin:10px 0"><h3>${esc(t('common.noResults'))}</h3><p>${esc(emptyMsg)}</p></div>`;
      return;
    }
    listEl.innerHTML = filt.map(({ b, f, att }) => {
      const isPhysIcon = f.type === 'audiobook' ? 'audio' : 'file';
      return `
      <div class="dig-row">
        <div class="dig-ic ${esc(f.type === 'pdf' ? 'pdf' : f.type)}"><svg class="i"><use href="#i-${isPhysIcon}"/></svg></div>
        <div class="dig-main">
          <div class="d-name">${esc(att?.fileName || f.fileName || (f.externalUrl ? truncate(f.externalUrl, 70) : '—'))}
            ${att ? `<span class="dig-size" style="margin-left:8px">${esc(formatBytes(att.size))}</span>` : ''}
            <span class="badge b-neutral" style="margin-left:8px">${esc(t('fmt.' + f.type))}</span>
          </div>
          <div class="d-book"><a href="#/book/${b.id}">${esc(b.titleBn || b.titleEn)}</a>${S.bookAuthors(b, L) ? ` · ${esc(truncate(S.bookAuthors(b, L), 40))}` : ''}
            ${f.languageOfEdition ? ` · ${esc(f.languageOfEdition)}` : ''}</div>
        </div>
        <div class="btn-row">
          ${att ? `
            <button class="btn btn-sm" data-open="${att.attachmentId}">${esc(t('common.open'))}</button>
            <button class="btn btn-sm" data-dl="${att.attachmentId}">${esc(t('common.download'))}</button>
            <button class="btn btn-sm" data-repl="${esc(f.formatId)}">${esc(t('dg.replace'))}</button>
            <button class="btn btn-sm btn-ghost" data-rm="${esc(f.formatId)}">${esc(t('dg.removeAttachment'))}</button>`
          : f.externalUrl ? `
            <button class="btn btn-sm" data-ext="${esc(f.formatId)}"><svg class="i sm"><use href="#i-external"/></svg>${esc(t('dg.openLink'))}</button>
            <button class="btn btn-sm" data-attach="${esc(f.formatId)}">${esc(t('action.attachPdf'))}</button>`
          : `<button class="btn btn-sm" data-attach="${esc(f.formatId)}">${esc(t('action.attachPdf'))}</button>`}
        </div>
      </div>`;
    }).join('');

    listEl.querySelectorAll('[data-open]').forEach(n => n.addEventListener('click', () => {
      const att = S.state.attachments.find(a => a.attachmentId === n.dataset.open);
      if (att) A.openAttachment(att);
    }));
    listEl.querySelectorAll('[data-dl]').forEach(n => n.addEventListener('click', () => {
      const att = S.state.attachments.find(a => a.attachmentId === n.dataset.dl);
      if (att) A.downloadAttachment(att);
    }));
    listEl.querySelectorAll('[data-ext]').forEach(n => n.addEventListener('click', () => {
      const row = filt.find(r => r.f.formatId === n.dataset.ext);
      if (row) A.openExternal(row.f.externalUrl);
    }));
    listEl.querySelectorAll('[data-attach]').forEach(n => n.addEventListener('click', () => {
      const row = filt.find(r => r.f.formatId === n.dataset.attach);
      if (!row) return;
      A.pickAndAttach(row.b, row.f, { onDone: () => { paint(); paintStorage(); } });
    }));
    listEl.querySelectorAll('[data-repl]').forEach(n => n.addEventListener('click', () => {
      const row = filt.find(r => r.f.formatId === n.dataset.repl);
      if (!row) return;
      A.pickAndAttach(row.b, row.f, { onDone: () => { paint(); paintStorage(); } });
    }));
    listEl.querySelectorAll('[data-rm]').forEach(n => n.addEventListener('click', () => {
      const row = filt.find(r => r.f.formatId === n.dataset.rm);
      if (!row) return;
      A.removeAttachmentFlow(row.b, row.f, { onDone: () => { paint(); paintStorage(); } });
    }));
  }

  paintStorage();
  paint();
}
