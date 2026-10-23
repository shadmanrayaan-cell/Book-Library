/* আমার পাঠাগার — book-form.js
   Add/Edit book modal. Progressive disclosure sections, Bangla-first fields,
   format rows with attachments, duplicate warning, unsaved-change guard.
   Only hard requirement: a title in any language (+ default To Read status). */

import { esc, uid, todayISO, parseNum, validUrl, formatBytes, deepClone } from './util.js';
import { t } from './i18n.js';
import * as db from './db.js';
import * as S from './state.js';
import { findDuplicates } from './search.js';
import { openModal, confirmDialog, toast, errToast, chipInput, idChipField, starsInput, fieldRow } from './components.js';

const FMT_TYPES = [
  { value: 'physical', label: () => t('fmt.physical') },
  { value: 'pdf', label: () => t('fmt.pdf') },
  { value: 'epub', label: () => t('fmt.epub') },
  { value: 'ebook-other', label: () => t('fmt.ebook-other') },
  { value: 'audiobook', label: () => t('fmt.audiobook') },
  { value: 'other', label: () => t('fmt.other') },
];
const FMT_AVAIL = [
  { value: 'attached', label: () => t('favail.attached') },
  { value: 'external-link', label: () => t('favail.external-link') },
  { value: 'known-unlinked', label: () => t('favail.known-unlinked') },
];

function inp(id, value, type = 'text', opts = {}) {
  return `<input id="${id}" class="input" type="${type}" value="${esc(value ?? '')}" ${opts.min != null ? `min="${opts.min}"` : ''} ${opts.max != null ? `max="${opts.max}"` : ''} ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ''} ${opts.ac ? `autocomplete="${opts.ac}"` : ''}>`;
}
function txt(id, value, rows = 3, ph = '') {
  return `<textarea id="${id}" class="textarea" rows="${rows}" ${ph ? `placeholder="${esc(ph)}"` : ''}>${esc(value ?? '')}</textarea>`;
}
function sel(id, value, options) {
  return `<select id="${id}" class="select">${options.map(o =>
    `<option value="${esc(o.value)}" ${o.value === value ? 'selected' : ''}>${esc(typeof o.label === 'function' ? o.label() : o.label)}</option>`).join('')}</select>`;
}

const LANG_OPTS = () => [
  { value: 'bn', label: t('lang.bn') }, { value: 'en', label: t('lang.en') },
  { value: 'bilingual', label: t('lang.bilingual') }, { value: 'other', label: t('lang.other') },
];
const STATUS_OPTS = () => ['to-read', 'reading', 'completed', 'paused', 'abandoned'].map(v => ({ value: v, label: t('status.' + v) }));
const OWN_OPTS = () => ['owned', 'borrowed', 'wishlist', 'library-access'].map(v => ({ value: v, label: t('own.' + v) }));
const PRI_OPTS = () => ['high', 'medium', 'low'].map(v => ({ value: v, label: t('pri.' + v) }));
const MED_OPTS = () => ['physical', 'pdf', 'epub', 'other-digital', 'audiobook'].map(v => ({ value: v, label: t('medium.' + v) }));
const COND_OPTS = () => [{ value: '', label: t('common.notSet') }, ...['new', 'good', 'fair', 'worn', 'damaged'].map(v => ({ value: v, label: t('cond.' + v) }))];
const LEND_OPTS = () => [
  { value: 'none', label: t('lend.none') }, { value: 'lent-out', label: t('lend.lent-out') },
  { value: 'borrowed-from', label: t('lend.borrowed-from') },
];
const REREAD_OPTS = () => ['none', 'want', 'have'].map(v => ({ value: v, label: t('reread.' + v) }));

export function openBookForm(existing = null, { onSaved = null } = {}) {
  const isNew = !existing;
  const b = existing ? deepClone(existing) : {
    id: null, titleBn: '', titleEn: '', alternateTitles: [], originalTitle: '', transliteratedTitle: '',
    language: S.prefs().defaultLanguage || 'bn', originalLanguage: '',
    isbn10: '', isbn13: '',
    authors: [], translators: [], editors: [], illustrators: [], contributorsNotes: '',
    publishers: [], publicationYear: null, edition: '', volumeNumber: '', seriesName: '',
    pageCount: null, countryOfPublication: '', publicationNotes: '',
    primaryGenre: '', genres: [], tags: [], subjects: [], targetAudience: '', customCollectionIds: [],
    ownershipStatus: 'owned', physicalCopyCount: 0, physicalCondition: '', shelfLocation: '', bookcase: '',
    acquisitionDate: '', acquisitionPrice: '', sourceOfAcquisition: '',
    lendingStatus: 'none', borrowerName: '', lendingDate: '', expectedReturnDate: '',
    formats: [], readingStatus: S.prefs().defaultStatus || 'to-read', preferredMedium: 'physical',
    priority: 'medium', plannedReadingDate: '', estimatedMinutes: null, reasonForReading: '',
    coverDataUrl: null, rating: null, personalReview: '', keyTakeaways: '', favouriteQuotes: '',
    privateNotes: '', wouldRecommend: null, rereadStatus: 'none', isArchived: false,
    createdAt: null, updatedAt: null,
  };

  let dirty = false;
  const markDirty = () => { dirty = true; };

  /* pending creations (persisted only when the book is saved) */
  const pendingAuthors = new Map();
  const pendingPublishers = new Map();
  const pendingGenres = [];
  const pendingFiles = new Map();   // formatId → {file, name, size, mime}
  const dropAttachmentIds = new Set();

  const authorSugs = () => S.state.authors
    .map(a => ({ id: a.id, label: a.nameBn || a.nameEn || a.id, sub: a.nameEn && a.nameBn ? a.nameEn : '' }))
    .concat([...pendingAuthors.values()].map(p => ({ id: p.id, label: p.label, sub: t('common.new') })));
  const pubSugs = () => S.state.publishers
    .map(p => ({ id: p.id, label: p.nameBn || p.nameEn || p.id, sub: p.nameEn && p.nameBn ? p.nameEn : '' }))
    .concat([...pendingPublishers.values()].map(p => ({ id: p.id, label: p.label, sub: t('common.new') })));
  const genreSugs = () => S.state.genres
    .map(g => ({ id: g.id, label: g.nameBn || g.nameEn, sub: g.nameEn || '' }))
    .concat(pendingGenres.map(g => ({ id: g.id, label: g.nameBn || g.nameEn, sub: t('common.new') })));

  const newAuthor = (label) => {
    const existing = authorSugs().find(s => s.label === label);
    if (existing) return existing;
    const p = { id: uid('au_'), label };
    pendingAuthors.set(p.id, p);
    return p;
  };
  const newPub = (label) => {
    const existing = pubSugs().find(s => s.label === label);
    if (existing) return existing;
    const p = { id: uid('pb_'), label };
    pendingPublishers.set(p.id, p);
    return p;
  };
  const newGenre = (label) => {
    const found = genreSugs().find(s => s.label === label);
    if (found) return found;
    const g = { id: uid('gn_'), nameBn: /[\u0980-\u09FF]/.test(label) ? label : '', nameEn: /[\u0980-\u09FF]/.test(label) ? '' : label };
    pendingGenres.push(g);
    return { id: g.id, label };
  };

  /* ---------- build the form ---------- */
  const form = document.createElement('form');
  form.className = 'book-form';
  form.noValidate = true;
  const V = (id) => form.querySelector('#' + id)?.value.trim() ?? '';

  const fmtRowHTML = (f) => {
    const isPhys = f.type === 'physical';
    const att = f.attachmentId ? S.state.attachments.find(a => a.attachmentId === f.attachmentId) : null;
    return `
    <div class="fmt-row card" data-fmt="${f.formatId}" style="padding:12px 14px;margin-bottom:10px">
      <div class="flex wrap" style="gap:10px">
        <div class="field" style="margin:0;min-width:150px"><label>${esc(t('f.type'))}</label>
          <select class="select" data-f="type">${FMT_TYPES.map(o => `<option value="${o.value}" ${f.type === o.value ? 'selected' : ''}>${esc(o.label())}</option>`).join('')}</select></div>
        <div class="field" style="margin:0;min-width:160px" data-avail-wrap><label>${esc(t('f.availability'))}</label>
          <select class="select" data-f="availabilityStatus">${FMT_AVAIL.map(o => `<option value="${o.value}" ${f.availabilityStatus === o.value ? 'selected' : ''}>${esc(o.label())}</option>`).join('')}</select></div>
        <button type="button" class="icon-btn" data-fmt-del style="align-self:end" aria-label="${esc(t('common.remove'))}"><svg class="i"><use href="#i-trash"/></svg></button>
      </div>
      <div class="form-grid" data-fmt-detail style="margin-top:10px">
        <div class="field" data-file-wrap></div>
        <div class="field"><label>${esc(t('f.languageOfEdition'))}</label>${inp('', f.languageOfEdition, 'text', { ac: 'off' }).replace('id=""', 'data-f="languageOfEdition"')}</div>
        <div class="field span-2"><label>${esc(t('f.formatNotes'))}</label>${inp('', f.notes, 'text').replace('id=""', 'data-f="notes"')}</div>
      </div>
    </div>`;
  };

  form.innerHTML = `
    <details open class="sec">
      <summary><svg class="i"><use href="#i-book"/></svg> ${esc(t('book.secIdentity'))} <span class="req">*</span></summary>
      <div class="form-grid">
        <div class="field" data-f="titleBnF"><label>${esc(t('f.titleBn'))}</label>${inp('f_titleBn', b.titleBn, 'text', { ac: 'off' })}</div>
        <div class="field" data-f="titleEnF"><label>${esc(t('f.titleEn'))}</label>${inp('f_titleEn', b.titleEn, 'text', { ac: 'off' })}</div>
        <div class="field span-2"><label>${esc(t('f.alternateTitles'))}</label><div data-alt-titles></div><span class="hint">${esc(t('f.alternateTitlesHint'))}</span></div>
        <div class="field"><label>${esc(t('f.originalTitle'))}</label>${inp('f_originalTitle', b.originalTitle)}</div>
        <div class="field"><label>${esc(t('f.transliteratedTitle'))}</label>${inp('f_translit', b.transliteratedTitle)}</div>
        <div class="field"><label>${esc(t('f.language'))}</label>${sel('f_language', b.language, LANG_OPTS())}</div>
        <div class="field"><label>${esc(t('f.originalLanguage'))}</label>${inp('f_origLang', b.originalLanguage, 'text', { ph: 'English, হিন্দি…' })}</div>
        <div class="field"><label>ISBN-13</label>${inp('f_isbn13', b.isbn13, 'text', { ph: '978-…' })}</div>
        <div class="field"><label>ISBN-10</label>${inp('f_isbn10', b.isbn10)}</div>
      </div>
    </details>

    <details class="sec">
      <summary><svg class="i"><use href="#i-authors"/></svg> ${esc(t('book.secPeople'))}</summary>
      <div class="field"><label>${esc(t('f.authors'))}</label><div data-authors></div><span class="hint">${esc(t('f.authorsHint'))}</span></div>
      <div class="form-grid">
        <div class="field"><label>${esc(t('f.translators'))}</label><div data-translators></div></div>
        <div class="field"><label>${esc(t('f.editors'))}</label><div data-editors></div></div>
        <div class="field"><label>${esc(t('f.illustrators'))}</label><div data-illustrators></div></div>
      </div>
      <div class="field"><label>${esc(t('f.contributorsNotes'))}</label>${txt('f_contribNotes', b.contributorsNotes, 2)}</div>
    </details>

    <details class="sec">
      <summary><svg class="i"><use href="#i-publisher"/></svg> ${esc(t('book.secPublication'))}</summary>
      <div class="form-grid">
        <div class="field"><label>${esc(t('f.publishers'))}</label><div data-publishers></div></div>
        <div class="field"><label>${esc(t('f.publicationYear'))}</label>${inp('f_year', b.publicationYear ?? '', 'number', { min: 0, max: 2100 })}</div>
        <div class="field"><label>${esc(t('f.edition'))}</label>${inp('f_edition', b.edition)}</div>
        <div class="field"><label>${esc(t('f.volumeNumber'))}</label>${inp('f_volume', b.volumeNumber)}</div>
        <div class="field"><label>${esc(t('f.seriesName'))}</label>${inp('f_series', b.seriesName)}</div>
        <div class="field"><label>${esc(t('f.pageCount'))}</label>${inp('f_pages', b.pageCount ?? '', 'number', { min: 1 })}</div>
        <div class="field"><label>${esc(t('f.countryOfPublication'))}</label>${inp('f_country', b.countryOfPublication)}</div>
      </div>
      <div class="field"><label>${esc(t('f.publicationNotes'))}</label>${txt('f_pubNotes', b.publicationNotes, 2)}</div>
    </details>

    <details class="sec">
      <summary><svg class="i"><use href="#i-tag"/></svg> ${esc(t('book.secClassification'))}</summary>
      <div class="form-grid">
        <div class="field"><label>${esc(t('f.primaryGenre'))}</label>
          <div class="flex" style="gap:6px"><select id="f_primaryGenre" class="select grow"><option value="">${esc(t('common.notSet'))}</option>${S.state.genres.map(g => `<option value="${g.id}" ${b.primaryGenre === g.id ? 'selected' : ''}>${esc(g.nameBn || g.nameEn)}</option>`).join('')}</select>
          <button type="button" class="icon-btn" data-add-genre title="${esc(t('action.addGenre'))}"><svg class="i"><use href="#i-plus"/></svg></button></div></div>
        <div class="field"><label>${esc(t('f.genres'))}</label><div data-genres></div></div>
        <div class="field"><label>${esc(t('f.targetAudience'))}</label>${inp('f_audience', b.targetAudience)}</div>
      </div>
      <div class="field"><label>${esc(t('f.tags'))}</label><div data-tags></div><span class="hint">${esc(t('f.tagsHint'))}</span></div>
      <div class="field"><label>${esc(t('f.subjects'))}</label><div data-subjects></div></div>
      <div class="field"><label>${esc(t('f.collections'))}</label><div data-collections></div></div>
    </details>

    <details class="sec">
      <summary><svg class="i"><use href="#i-collection"/></svg> ${esc(t('book.secOwnership'))}</summary>
      <div class="form-grid">
        <div class="field"><label>${esc(t('f.ownershipStatus'))}</label>${sel('f_own', b.ownershipStatus, OWN_OPTS())}</div>
        <div class="field"><label>${esc(t('f.physicalCopyCount'))}</label>${inp('f_copies', b.physicalCopyCount ?? 0, 'number', { min: 0 })}</div>
        <div class="field"><label>${esc(t('f.physicalCondition'))}</label>${sel('f_cond', b.physicalCondition, COND_OPTS())}</div>
        <div class="field"><label>${esc(t('f.shelfLocation'))}</label>${inp('f_shelf', b.shelfLocation)}</div>
        <div class="field"><label>${esc(t('f.bookcase'))}</label>${inp('f_bookcase', b.bookcase)}</div>
        <div class="field"><label>${esc(t('f.acquisitionDate'))}</label>${inp('f_acqDate', b.acquisitionDate, 'date')}</div>
        <div class="field"><label>${esc(t('f.acquisitionPrice'))}</label>${inp('f_price', b.acquisitionPrice, 'text', { ph: t('common.optional') })}</div>
        <div class="field"><label>${esc(t('f.sourceOfAcquisition'))}</label>${inp('f_src', b.sourceOfAcquisition, 'text', { ph: 'বইমেলা, রোকেয়া কর্নার…' })}</div>
      </div>
      <div class="form-grid" data-lend-block>
        <div class="field"><label>${esc(t('f.lendingStatus'))}</label>${sel('f_lend', b.lendingStatus, LEND_OPTS())}</div>
        <div class="field"><label>${esc(t('f.borrowerName'))}</label>${inp('f_borrower', b.borrowerName)}</div>
        <div class="field"><label>${esc(t('f.lendingDate'))}</label>${inp('f_lendDate', b.lendingDate, 'date')}</div>
        <div class="field"><label>${esc(t('f.expectedReturnDate'))}</label>${inp('f_retDate', b.expectedReturnDate, 'date')}</div>
      </div>
    </details>

    <details class="sec">
      <summary><svg class="i"><use href="#i-digital"/></svg> ${esc(t('book.secFormats'))}</summary>
      <p class="hint" style="margin-top:0">${esc(t('f.formatsHint'))} ${esc(t('book.noPdf'))}</p>
      <div data-fmt-rows>${(b.formats || []).map(fmtRowHTML).join('')}</div>
      <button type="button" class="btn btn-sm" data-fmt-add><svg class="i"><use href="#i-plus"/></svg>${esc(t('action.addFormat'))}</button>
    </details>

    <details class="sec">
      <summary><svg class="i"><use href="#i-queue"/></svg> ${esc(t('book.secPlan'))}</summary>
      <div class="form-grid">
        <div class="field"><label>${esc(t('f.readingStatus'))}</label>${sel('f_status', b.readingStatus, STATUS_OPTS())}</div>
        <div class="field"><label>${esc(t('f.preferredMedium'))}</label>${sel('f_medium', b.preferredMedium, MED_OPTS())}</div>
        <div class="field"><label>${esc(t('f.priority'))}</label>${sel('f_pri', b.priority, PRI_OPTS())}</div>
        <div class="field"><label>${esc(t('f.plannedReadingDate'))}</label>${inp('f_planned', b.plannedReadingDate, 'date')}</div>
        <div class="field"><label>${esc(t('f.estimatedMinutes'))}</label>${inp('f_estMin', b.estimatedMinutes ?? '', 'number', { min: 0 })}</div>
      </div>
      <div class="field"><label>${esc(t('f.reasonForReading'))}</label>${txt('f_reason', b.reasonForReading, 2)}</div>
    </details>

    <details class="sec">
      <summary><svg class="i"><use href="#i-star"/></svg> ${esc(t('book.secReview'))}</summary>
      <div class="field"><label>${esc(t('f.cover'))}</label>
        <div class="flex wrap">
          <div class="bcover" data-cover-prev style="width:64px;border-radius:6px"></div>
          <input type="file" accept="image/*" data-cover-file class="small">
          ${b.coverDataUrl ? '<button type="button" class="btn btn-sm btn-ghost" data-cover-del>' + esc(t('action.removeCover')) + '</button>' : ''}
        </div>
        <span class="hint">${esc(t('f.coverHint'))}</span>
      </div>
      <div class="form-grid">
        <div class="field"><label>${esc(t('f.rating'))}</label><div data-rating></div></div>
        <div class="field"><label>${esc(t('f.wouldRecommend'))}</label>${sel('f_recom', b.wouldRecommend == null ? '' : String(b.wouldRecommend), [
          { value: '', label: t('common.notSet') }, { value: 'true', label: t('common.yes') }, { value: 'false', label: t('common.no') }])}</div>
        <div class="field"><label>${esc(t('f.rereadStatus'))}</label>${sel('f_reread', b.rereadStatus, REREAD_OPTS())}</div>
      </div>
      <div class="field"><label>${esc(t('f.personalReview'))}</label>${txt('f_review', b.personalReview, 4)}</div>
      <div class="field"><label>${esc(t('f.keyTakeaways'))}</label>${txt('f_takeaways', b.keyTakeaways, 3)}</div>
      <div class="field"><label>${esc(t('f.favouriteQuotes'))}</label>${txt('f_quotes', b.favouriteQuotes, 3)}</div>
      <div class="field"><label>${esc(t('f.privateNotes'))}</label>${txt('f_privnotes', b.privateNotes, 3)}</div>
    </details>`;

  /* chip / id-chip fields */
  const altChips = chipInput({ items: b.alternateTitles || [], placeholder: 'সোনার তরী, The Golden Boat', onChange: markDirty });
  form.querySelector('[data-alt-titles]').appendChild(altChips);

  const authorsF = idChipField({
    items: b.authors || [], suggestions: authorSugs, placeholder: 'রবীন্দ্রনাথ ঠাকুর…',
    labelCreate: t('common.new'), getId: s => s.id, newLabel: (v) => { markDirty(); return newAuthor(v); },
  });
  form.querySelector('[data-authors]').appendChild(authorsF.el);
  const translatorsF = idChipField({ items: b.translators || [], suggestions: authorSugs, placeholder: '…', labelCreate: t('common.new'), getId: s => s.id, newLabel: (v) => { markDirty(); return newAuthor(v); } });
  form.querySelector('[data-translators]').appendChild(translatorsF.el);
  const editorsF = idChipField({ items: b.editors || [], suggestions: authorSugs, placeholder: '…', labelCreate: t('common.new'), getId: s => s.id, newLabel: (v) => { markDirty(); return newAuthor(v); } });
  form.querySelector('[data-editors]').appendChild(editorsF.el);
  const illusF = idChipField({ items: b.illustrators || [], suggestions: authorSugs, placeholder: '…', labelCreate: t('common.new'), getId: s => s.id, newLabel: (v) => { markDirty(); return newAuthor(v); } });
  form.querySelector('[data-illustrators]').appendChild(illusF.el);
  const pubsF = idChipField({ items: b.publishers || [], suggestions: pubSugs, placeholder: 'প্রথমা প্রকাশন…', labelCreate: t('common.new'), getId: s => s.id, newLabel: (v) => { markDirty(); return newPub(v); } });
  form.querySelector('[data-publishers]').appendChild(pubsF.el);
  const genresF = idChipField({ items: b.genres || [], suggestions: genreSugs, placeholder: 'উপন্যাস…', labelCreate: t('common.new'), getId: s => s.id, newLabel: (v) => { markDirty(); return newGenre(v); } });
  form.querySelector('[data-genres]').appendChild(genresF.el);
  const knownTags = S.allTags();
  const tagsChips = chipInput({ items: b.tags || [], suggestions: knownTags, placeholder: t('f.tagsHint'), onChange: markDirty });
  form.querySelector('[data-tags]').appendChild(tagsChips);
  const subjChips = chipInput({ items: b.subjects || [], placeholder: '…', onChange: markDirty });
  form.querySelector('[data-subjects]').appendChild(subjChips);
  const collF = idChipField({
    items: b.customCollectionIds || [],
    suggestions: S.state.collections.map(c => ({ id: c.id, label: c.nameBn || c.nameEn, sub: c.nameEn || '' })),
    placeholder: '…', labelCreate: t('common.new'), getId: s => s.id,
    newLabel: (v) => { markDirty(); const id = uid('co_'); pendingCollectionLabels.set(id, v); return { id, label: v }; },
  });
  form.querySelector('[data-collections]').appendChild(collF.el);

  let rating = b.rating ?? 0;
  const ratingEl = starsInput(rating, (v) => { rating = v || null; markDirty(); });
  form.querySelector('[data-rating]').appendChild(ratingEl);

  /* cover */
  let coverDataUrl = b.coverDataUrl || null;
  const coverPrev = form.querySelector('[data-cover-prev]');
  const paintCover = () => {
    coverPrev.innerHTML = coverDataUrl
      ? `<img src="${coverDataUrl}" alt="">`
      : `<span class="letter">•</span>`;
    coverPrev.style.background = coverDataUrl ? 'transparent' : 'var(--surface-3)';
  };
  paintCover();
  form.querySelector('[data-cover-file]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      coverDataUrl = await resizeImage(file, 360, 300 * 1024);
      paintCover(); markDirty();
    } catch (err) { errToast(err); }
  });
  const coverDel = form.querySelector('[data-cover-del]');
  if (coverDel) coverDel.addEventListener('click', () => { coverDataUrl = null; paintCover(); markDirty(); coverDel.remove(); });

  /* new genre button */
  form.querySelector('[data-add-genre]').addEventListener('click', () => {
    openQuickGenre((g) => {
      const s = form.querySelector('#f_primaryGenre');
      s.insertAdjacentHTML('beforeend', `<option value="${g.id}" selected>${esc(g.nameBn || g.nameEn)}</option>`);
      markDirty();
    });
  });

  /* format rows behavior */
  const fmtRows = form.querySelector('[data-fmt-rows]');
  function wireRow(row) {
    const id = row.dataset.fmt;
    const typeSel = row.querySelector('[data-f="type"]');
    const availWrap = row.querySelector('[data-avail-wrap]');
    const fileWrap = row.querySelector('[data-file-wrap]');
    const sync = () => {
      const type = typeSel.value;
      const avail = row.querySelector('[data-f="availabilityStatus"]')?.value || '';
      availWrap.style.display = type === 'physical' ? 'none' : '';
      fileWrap.innerHTML = '';
      if (type === 'physical') return;
      if (avail === 'attached') {
        const f = (b.formats || []).find(x => x.formatId === id);
        const att = f?.attachmentId ? S.state.attachments.find(a => a.attachmentId === f.attachmentId) : null;
        const pending = pendingFiles.get(id);
        const name = pending ? pending.name : (att ? att.fileName : null);
        fileWrap.innerHTML = `<label>${esc(t('f.attachment'))}</label>
          <input type="file" class="small" data-fmt-file ${type === 'pdf' ? 'accept="application/pdf,.pdf"' : type === 'epub' ? 'accept=".epub,application/epub+zip"' : ''}>
          <span class="hint">${name ? esc(name) + (att && !pending ? ` (${formatBytes(att.size)})` : pending ? ` (${formatBytes(pending.size)})` : '') : esc(t('book.noPdf'))}</span>`;
        fileWrap.querySelector('[data-fmt-file]').addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          pendingFiles.set(id, { file, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' });
          sync(); markDirty();
        });
      } else if (avail === 'external-link') {
        const f = (b.formats || []).find(x => x.formatId === id);
        fileWrap.innerHTML = `<label>${esc(t('f.externalUrl'))}</label>
          <input class="input" type="url" data-f="externalUrl" value="${esc(f?.externalUrl || '')}" placeholder="https://…">`;
        fileWrap.querySelector('input').addEventListener('input', markDirty);
      } else {
        const f = (b.formats || []).find(x => x.formatId === id);
        fileWrap.innerHTML = `<label>${esc(t('f.fileName'))}</label>
          <input class="input" type="text" data-f="fileName" value="${esc(f?.fileName || '')}" placeholder="boi.pdf">`;
        fileWrap.querySelector('input').addEventListener('input', markDirty);
      }
    };
    typeSel.addEventListener('change', () => { sync(); markDirty(); });
    row.querySelector('[data-f="availabilityStatus"]')?.addEventListener('change', () => { sync(); markDirty(); });
    row.querySelector('[data-f="languageOfEdition"]').addEventListener('input', markDirty);
    row.querySelector('[data-f="notes"]').addEventListener('input', markDirty);
    row.querySelector('[data-fmt-del]').addEventListener('click', () => {
      const f = (b.formats || []).find(x => x.formatId === id);
      if (f?.attachmentId) dropAttachmentIds.add(f.attachmentId);
      pendingFiles.delete(id);
      row.remove(); markDirty();
    });
    sync();
  }
  fmtRows.querySelectorAll('.fmt-row').forEach(wireRow);
  form.querySelector('[data-fmt-add]').addEventListener('click', () => {
    const id = uid('fm_');
    fmtRows.insertAdjacentHTML('beforeend', fmtRowHTML({ formatId: id, type: 'pdf', availabilityStatus: 'attached', languageOfEdition: '', notes: '' }));
    wireRow(fmtRows.lastElementChild);
    markDirty();
  });

  /* lending visibility */
  const lendBlock = form.querySelector('[data-lend-block]');
  const lendSel = form.querySelector('#f_lend');
  const syncLend = () => {
    const show = lendSel.value !== 'none' || form.querySelector('#f_own').value === 'borrowed';
    lendBlock.querySelectorAll('.field').forEach((f, i) => { if (i > 0) f.style.display = show ? '' : 'none'; });
  };
  lendSel.addEventListener('change', () => { syncLend(); markDirty(); });
  form.querySelector('#f_own').addEventListener('change', () => { syncLend(); markDirty(); });
  syncLend();

  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);

  /* ---------- collect & validate ---------- */
  function collect() {
    const book = { ...b };
    book.titleBn = V('f_titleBn');
    book.titleEn = V('f_titleEn');
    book.alternateTitles = altChips._get();
    book.originalTitle = V('f_originalTitle');
    book.transliteratedTitle = V('f_translit');
    book.language = V('f_language');
    book.originalLanguage = V('f_origLang');
    book.isbn13 = V('f_isbn13').replace(/[\s-]/g, '');
    book.isbn10 = V('f_isbn10').replace(/[\s-]/g, '');
    book.authors = authorsF.get();
    book.translators = translatorsF.get();
    book.editors = editorsF.get();
    book.illustrators = illusF.get();
    book.contributorsNotes = V('f_contribNotes');
    book.publishers = pubsF.get();
    book.publicationYear = parseNum(V('f_year'));
    book.edition = V('f_edition');
    book.volumeNumber = V('f_volume');
    book.seriesName = V('f_series');
    book.pageCount = parseNum(V('f_pages'));
    book.countryOfPublication = V('f_country');
    book.publicationNotes = V('f_pubNotes');
    book.primaryGenre = V('f_primaryGenre');
    book.genres = genresF.get();
    if (book.primaryGenre && !book.genres.includes(book.primaryGenre)) book.genres = [book.primaryGenre, ...book.genres];
    book.targetAudience = V('f_audience');
    book.tags = tagsChips._get();
    book.subjects = subjChips._get();
    book.customCollectionIds = collF.get().filter(id => S.collectionById(id));
    book.ownershipStatus = V('f_own');
    book.physicalCopyCount = parseNum(V('f_copies')) ?? 0;
    book.physicalCondition = V('f_cond');
    book.shelfLocation = V('f_shelf');
    book.bookcase = V('f_bookcase');
    book.acquisitionDate = V('f_acqDate');
    book.acquisitionPrice = V('f_price');
    book.sourceOfAcquisition = V('f_src');
    book.lendingStatus = V('f_lend');
    book.borrowerName = V('f_borrower');
    book.lendingDate = V('f_lendDate');
    book.expectedReturnDate = V('f_retDate');
    book.readingStatus = V('f_status');
    book.preferredMedium = V('f_medium');
    book.priority = V('f_pri');
    book.plannedReadingDate = V('f_planned');
    book.estimatedMinutes = parseNum(V('f_estMin'));
    book.reasonForReading = V('f_reason');
    book.rating = rating || null;
    book.wouldRecommend = V('f_recom') === '' ? null : V('f_recom') === 'true';
    book.rereadStatus = V('f_reread');
    book.personalReview = V('f_review');
    book.keyTakeaways = V('f_takeaways');
    book.favouriteQuotes = V('f_quotes');
    book.privateNotes = V('f_privnotes');
    book.coverDataUrl = coverDataUrl;

    /* formats */
    const formats = [];
    fmtRows.querySelectorAll('.fmt-row').forEach(row => {
      const id = row.dataset.fmt;
      const type = row.querySelector('[data-f="type"]').value;
      const f = { formatId: id, type, languageOfEdition: row.querySelector('[data-f="languageOfEdition"]').value, notes: row.querySelector('[data-f="notes"]').value };
      const old = (b.formats || []).find(x => x.formatId === id);
      if (old?.attachmentId && !dropAttachmentIds.has(old.attachmentId)) f.attachmentId = old.attachmentId;
      if (type === 'physical') {
        f.availabilityStatus = 'owned';
      } else {
        f.availabilityStatus = row.querySelector('[data-f="availabilityStatus"]').value;
        if (f.availabilityStatus === 'external-link') f.externalUrl = row.querySelector('[data-f="externalUrl"]')?.value?.trim() || '';
        else if (f.availabilityStatus === 'known-unlinked') f.fileName = row.querySelector('[data-f="fileName"]')?.value?.trim() || '';
      }
      formats.push(f);
    });
    /* auto physical format for owned books with copies */
    if (book.ownershipStatus === 'owned' && book.physicalCopyCount > 0 && !formats.some(f => f.type === 'physical')) {
      formats.push({ formatId: uid('fm_'), type: 'physical', availabilityStatus: 'owned', languageOfEdition: book.language, notes: '' });
    }
    book.formats = formats;
    return book;
  }

  function validate(book) {
    let ok = true;
    const mark = (sel2, bad) => {
      const wrap = form.querySelector(`[data-f="${sel2}"]`);
      if (wrap) {
        const inputEl = wrap.querySelector('input');
        if (inputEl) inputEl.setAttribute('aria-invalid', bad ? 'true' : 'false');
        wrap.querySelector('.err-text')?.remove();
        if (bad) wrap.insertAdjacentHTML('beforeend', `<div class="err-text">${esc(t('book.titleRequired'))}</div>`);
      }
      if (bad) ok = false;
    };
    mark('titleBnF', !book.titleBn && !book.titleEn);
    mark('titleEnF', !book.titleBn && !book.titleEn);
    return ok;
  }

  /* ---------- save ---------- */
  async function save() {
    const book = collect();
    if (!validate(book)) {
      form.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const dupes = findDuplicates(book, S.state.books);
    if (dupes.length) {
      const proceed = await confirmDupes(dupes);
      if (!proceed) return;
    }
    const now = new Date().toISOString();
    if (!book.id) book.id = uid('bk_');
    book.createdAt = b.createdAt || now;
    book.updatedAt = now;
    try {
      /* pending people/publishers/collections */
      for (const p of pendingAuthors.values()) {
        const isBn = /[\u0980-\u09FF]/.test(p.label);
        await db.put('authors', { id: p.id, nameBn: isBn ? p.label : '', nameEn: isBn ? '' : p.label, aliases: [], biography: '', birthYear: null, deathYear: null, notes: '', createdAt: now, updatedAt: now });
      }
      for (const p of pendingPublishers.values()) {
        const isBn = /[\u0980-\u09FF]/.test(p.label);
        await db.put('publishers', { id: p.id, nameBn: isBn ? p.label : '', nameEn: isBn ? '' : p.label, aliases: [], notes: '', country: '', createdAt: now, updatedAt: now });
      }
      if (pendingGenres.length) { S.state.genres.push(...pendingGenres); await S.updateGenres(); }
      /* pending collections */
      for (const id of book.customCollectionIds) {
        if (!S.collectionById(id)) {
          const label = pendingCollectionLabels.get(id);
          if (label) {
            const isBn = /[\u0980-\u09FF]/.test(label);
            await db.put('collections', { id, nameBn: isBn ? label : '', nameEn: isBn ? '' : label, description: '', color: '#a9502f', createdAt: now });
          }
        }
      }
      /* attachments */
      for (const f of book.formats) {
        if (f.availabilityStatus === 'attached') {
          const pending = pendingFiles.get(f.formatId);
          if (pending) {
            if (f.attachmentId && !dropAttachmentIds.has(f.attachmentId)) await db.del('attachments', f.attachmentId);
            const attachmentId = uid('at_');
            await db.put('attachments', { attachmentId, bookId: book.id, fileName: pending.name, mimeType: pending.mime, size: pending.size, blob: pending.file, addedAt: now });
            f.attachmentId = attachmentId;
          }
        }
      }
      for (const aid of dropAttachmentIds) await db.del('attachments', aid);

      await db.put('books', book);
      S.registerTags(book.tags || []);
      await S.refreshBooks();
      await S.refreshAttachments();
      await S.refreshAuthors();
      await S.refreshPublishers();
      await S.refreshCollections();
      dirty = false;
      toast(isNew ? t('action.addBook') + ' ✓' : t('common.saved'));
      modal.close();
      onSaved?.(book);
    } catch (e) { errToast(e); }
  }

  /* pending collection labels declared here; newLabel closure captures it */
  const pendingCollectionLabels = new Map();

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button'; saveBtn.className = 'btn btn-primary';
  saveBtn.textContent = isNew ? t('action.addBook') : t('common.saveChanges');
  saveBtn.addEventListener('click', save);
  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button'; cancelBtn.className = 'btn btn-ghost';
  cancelBtn.textContent = t('common.cancel');
  const modal = openModal({
    title: isNew ? t('book.addTitle') : t('book.editTitle'),
    size: 'modal-lg',
    body: form,
    footer: [cancelBtn, saveBtn],
    onBeforeClose: () => {
      if (!dirty) return true;
      confirmDialog({ title: t('common.unsaved'), message: esc(t('common.unsavedMsg')), okLabel: t('common.discard'), danger: true })
        .then(ok => { if (ok) { dirty = false; modal.close(); } });
      return false;
    },
  });
  cancelBtn.addEventListener('click', () => modal.close());
  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
  form.querySelector('#f_titleBn').focus();
}

export function confirmDupes(dupes) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <p>${esc(t('book.duplicateMsg'))}</p>
      <ul style="padding-left:18px;margin:8px 0">
        ${dupes.slice(0, 6).map(d => `<li style="margin-bottom:4px">
          <b>${esc(d.book.titleBn || d.book.titleEn)}</b>
          <span class="badge b-neutral" style="margin-left:6px">${esc(d.reason === 'isbn' ? t('t.dupeSameIsbn') : t('t.dupeSameTitle'))}</span>
        </li>`).join('')}
      </ul>`;
    const viewBtns = dupes.slice(0, 6).map(d => d.book.id);
    void viewBtns;
    const save = document.createElement('button');
    save.className = 'btn btn-primary'; save.textContent = t('book.saveAnyway');
    const cancel = document.createElement('button');
    cancel.className = 'btn btn-ghost'; cancel.textContent = t('common.cancel');
    let decided = false;
    save.addEventListener('click', () => { decided = true; m.close(); resolve(true); });
    cancel.addEventListener('click', () => { decided = true; m.close(); resolve(false); });
    const m = openModal({
      title: t('book.duplicateTitle'), body: wrap, footer: [cancel, save],
      onClose: () => { if (!decided) resolve(false); },
    });
  });
}

function openQuickGenre(onCreated) {
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>${esc(t('co.nameBn'))}</label><input class="input" data-bn></div>
      <div class="field"><label>${esc(t('co.nameEn'))}</label><input class="input" data-en></div>
    </div>`;
  const save = document.createElement('button');
  save.className = 'btn btn-primary'; save.textContent = t('common.create');
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost'; cancel.textContent = t('common.cancel');
  const m = openModal({ title: t('action.addGenre'), body: wrap, footer: [cancel, save] });
  save.addEventListener('click', async () => {
    const bn = wrap.querySelector('[data-bn]').value.trim();
    const enName = wrap.querySelector('[data-en]').value.trim();
    if (!bn && !enName) return;
    const g = await S.addGenre(bn, enName);
    toast(t('common.saved')); m.close(); onCreated(g);
  });
  cancel.addEventListener('click', () => m.close());
}

function resizeImage(file, maxDim, maxBytes) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Not an image'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let q = 0.82, url = c.toDataURL('image/jpeg', q);
        while (url.length * 0.75 > maxBytes && q > 0.4) { q -= 0.15; url = c.toDataURL('image/jpeg', q); }
        resolve(url);
      };
      img.src = String(fr.result);
    };
    fr.readAsDataURL(file);
  });
}
