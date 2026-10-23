/* আমার পাঠাগার — views/book-detail.js
   Full book page: identity, ownership, digital formats, reading sessions
   (history-preserving), personal review, collections, journal links. */

import { esc, fmtDate, fmtNum, formatBytes, deepClone, validUrl } from '../util.js';
import { t } from '../i18n.js';
import * as S from '../state.js';
import { statusBadge, ownBadge, priBadge, coverHTML, starsDisplay, emptyState, toast, errToast, confirmDialog } from '../components.js';
import { openBookForm } from '../book-form.js';
import * as A from '../actions.js';
import * as db from '../db.js';
import { uiLang } from '../state.js';
import { openQuickNote } from './journal.js';

export function render(el, ctx) {
  const id = ctx.params[0];
  const book = S.bookById(id);
  const L = uiLang();
  if (!book) {
    el.innerHTML = '';
    el.appendChild(emptyState({ icon: 'books', title: t('common.noResults'), body: t('common.noResultsHint') }));
    return;
  }

  el.innerHTML = `
    <div class="detail-head">
      <div class="detail-cover">${coverHTML(book, { withMarks: false })}</div>
      <div class="detail-headinfo">
        <h1>${esc(book.titleBn || book.titleEn || '—')}</h1>
        ${book.titleBn && book.titleEn ? `<div class="d-title-en">${esc(book.titleEn)}</div>` : ''}
        ${book.transliteratedTitle ? `<div class="d-title-en">${esc(book.transliteratedTitle)}</div>` : ''}
        <div class="detail-authors">${esc(S.bookAuthors(book, L) || t('common.unknown'))}</div>
        <div class="detail-badges">
          <span data-status-badge>${statusBadge(book.readingStatus)}</span>
          ${ownBadge(book.ownershipStatus)}
          ${priBadge(book.priority)}
          ${book.isArchived ? `<span class="badge b-archived">${esc(t('common.archived'))}</span>` : ''}
          ${book.language ? `<span class="lang-tag">${esc(t('lang.' + book.language))}</span>` : ''}
        </div>
        <div class="rating-row">${starsDisplay(book.rating) || `<span class="muted small">${esc(t('f.rating'))}: ${esc(t('common.notSet'))}</span>`}</div>
        <div class="detail-actions">
          ${book.readingStatus === 'reading' ? `
            <button class="btn btn-green" data-continue><svg class="i"><use href="#i-play"/></svg>${esc(t('action.continueReading'))}</button>
            <button class="btn" data-finish><svg class="i"><use href="#i-completed"/></svg>${esc(t('action.finish'))}</button>` : `
            <button class="btn btn-green" data-start><svg class="i"><use href="#i-play"/></svg>${esc(t('action.startReading'))}</button>`}
          <button class="btn" data-add-note><svg class="i"><use href="#i-journal"/></svg>${esc(t('action.addNote'))}</button>
          <button class="btn" data-edit><svg class="i"><use href="#i-edit"/></svg>${esc(t('common.edit'))}</button>
          <button class="btn" data-dup><svg class="i"><use href="#i-copy"/></svg>${esc(t('common.copy'))}</button>
          <button class="btn" data-archive>${esc(book.isArchived ? t('common.unarchive') : t('common.archive'))}</button>
          <button class="btn btn-danger" data-del><svg class="i"><use href="#i-trash"/></svg>${esc(t('common.delete'))}</button>
        </div>
      </div>
    </div>

    <div class="dash-cols">
      <div>
        <section class="section card card-pad" data-sec-sessions>
          <div class="section-head"><h2>${esc(t('sess.history'))}</h2><span class="spacer"></span></div>
          <div data-sessions></div>
        </section>

        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('book.secFormats'))}</h2></div>
          <div data-formats></div>
        </section>

        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('book.secReview'))}</h2>
            <span class="spacer"></span>
            <button class="btn btn-sm" data-edit-review>${esc(t('common.edit'))}</button></div>
          <div data-review></div>
        </section>

        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('nav.journal'))}</h2>
            <span class="spacer"></span>
            <button class="btn btn-sm" data-add-note2><svg class="i"><use href="#i-plus"/></svg>${esc(t('action.newEntry'))}</button></div>
          <div data-journal></div>
        </section>
      </div>

      <div>
        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('common.details'))}</h2></div>
          <dl class="meta-grid" data-meta style="grid-template-columns:1fr"></dl>
        </section>

        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('book.secOwnership'))}</h2></div>
          <dl class="meta-grid" data-own style="grid-template-columns:1fr"></dl>
        </section>

        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('nav.collections'))}</h2></div>
          <div data-collections></div>
        </section>

        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('book.secPlan'))}</h2></div>
          <dl class="meta-grid" data-plan style="grid-template-columns:1fr"></dl>
        </section>
      </div>
    </div>`;

  const dt = (v) => `<div class="meta-item"><dt>${esc(v[0])}</dt><dd>${v[1]}</dd></div>`;
  const dash = `<span class="muted">—</span>`;

  /* meta */
  const metaEl = el.querySelector('[data-meta]');
  const metaRows = [
    [t('f.originalTitle'), book.originalTitle ? esc(book.originalTitle) : dash],
    [t('f.originalLanguage'), book.originalLanguage ? esc(book.originalLanguage) : dash],
    [t('f.publishers'), S.bookPublishers(book, L) ? esc(S.bookPublishers(book, L)) : dash],
    [t('f.publicationYear'), book.publicationYear ? esc(fmtNum(book.publicationYear, L)) : dash],
    [t('f.edition'), book.edition ? esc(book.edition) : dash],
    [t('f.volumeNumber'), book.volumeNumber ? esc(book.volumeNumber) : dash],
    [t('f.seriesName'), book.seriesName ? esc(book.seriesName) : dash],
    [t('f.pageCount'), book.pageCount ? esc(fmtNum(book.pageCount, L)) : dash],
    [t('f.countryOfPublication'), book.countryOfPublication ? esc(book.countryOfPublication) : dash],
    ['ISBN-13', book.isbn13 ? esc(book.isbn13) : dash],
    ['ISBN-10', book.isbn10 ? esc(book.isbn10) : dash],
    [t('f.primaryGenre'), book.primaryGenre ? esc(S.genreLabel(book.primaryGenre, L)) : dash],
    [t('f.genres'), (book.genres || []).map(g => esc(S.genreLabel(g, L))).join(' · ') || dash],
    [t('f.tags'), (book.tags || []).map(x => `<span class="tag-pill">${esc(x)}</span>`).join(' ') || dash],
    [t('f.subjects'), (book.subjects || []).map(x => `<span class="tag-pill">${esc(x)}</span>`).join(' ') || dash],
    [t('f.targetAudience'), book.targetAudience ? esc(book.targetAudience) : dash],
    [t('f.contributorsNotes'), book.contributorsNotes ? esc(book.contributorsNotes) : dash],
  ];
  metaEl.innerHTML = metaRows.map(dt).join('');

  /* ownership */
  const ownEl = el.querySelector('[data-own]');
  const condTxt = book.physicalCondition ? t('cond.' + book.physicalCondition) : '';
  let lendRow = '';
  if (book.lendingStatus && book.lendingStatus !== 'none') {
    lendRow = dt([t('f.lendingStatus'), esc(t('lend.' + book.lendingStatus))]) +
      (book.borrowerName ? dt([t('f.borrowerName'), esc(book.borrowerName)]) : '') +
      (book.lendingDate ? dt([t('f.lendingDate'), esc(fmtDate(book.lendingDate, L))]) : '') +
      (book.expectedReturnDate ? dt([t('f.expectedReturnDate'), esc(fmtDate(book.expectedReturnDate, L)) + (new Date(book.expectedReturnDate) < new Date() ? ' ⚠' : '')]) : '') +
      `<div class="meta-item"><dt></dt><dd><button class="btn btn-sm btn-green" data-returned>${esc(t('action.returned'))}</button></dd></div>`;
  }
  ownEl.innerHTML = [
    dt([t('f.ownershipStatus'), ownBadge(book.ownershipStatus)]),
    dt([t('f.physicalCopyCount'), esc(fmtNum(book.physicalCopyCount || 0, L))]),
    dt([t('f.physicalCondition'), condTxt ? esc(condTxt) : dash]),
    dt([t('f.shelfLocation'), book.shelfLocation ? esc(book.shelfLocation + (book.bookcase ? ' · ' + book.bookcase : '')) : dash]),
    dt([t('f.acquisitionDate'), book.acquisitionDate ? esc(fmtDate(book.acquisitionDate, L)) : dash]),
    dt([t('f.acquisitionPrice'), book.acquisitionPrice ? esc(book.acquisitionPrice) : dash]),
    dt([t('f.sourceOfAcquisition'), book.sourceOfAcquisition ? esc(book.sourceOfAcquisition) : dash]),
    lendRow,
  ].join('');

  /* collections */
  const collEl = el.querySelector('[data-collections]');
  const myColls = (book.customCollectionIds || []).map(id => S.collectionById(id)).filter(Boolean);
  collEl.innerHTML = myColls.length
    ? `<div class="tagline">${myColls.map(c => `<a class="tag-pill" href="#/collections/${c.id}" style="border-color:${esc(c.color)};color:${esc(c.color)}">${esc(c.nameBn || c.nameEn)}</a>`).join('')}</div>`
    : `<span class="muted small">${esc(t('cv.collectionsEmpty'))}</span>`;

  /* plan */
  el.querySelector('[data-plan]').innerHTML = [
    dt([t('f.preferredMedium'), esc(t('medium.' + (book.preferredMedium || 'physical')))]),
    dt([t('f.plannedReadingDate'), book.plannedReadingDate ? esc(fmtDate(book.plannedReadingDate, L)) : dash]),
    dt([t('f.estimatedMinutes'), book.estimatedMinutes ? esc(t('q.estTime', { n: fmtNum(book.estimatedMinutes, L) })) : dash]),
    dt([t('f.reasonForReading'), book.reasonForReading ? esc(book.reasonForReading) : dash]),
    dt([t('f.rereadStatus'), esc(t('reread.' + (book.rereadStatus || 'none')))]),
  ].join('');

  /* sessions */
  const sessionsEl = el.querySelector('[data-sessions]');
  const sessions = S.sessionsFor(book.id);
  if (!sessions.length) {
    sessionsEl.innerHTML = `<p class="muted small">${esc(t('cv.sessionsEmpty'))}</p>`;
  } else {
    sessionsEl.innerHTML = sessions.map(s => {
      const prog = S.sessionProgress(s, book);
      const st = s.completionStatus === 'active' ? `<span class="badge b-reading">${esc(t('sess.active'))}</span>`
        : `<span class="badge b-neutral">${esc(t('status.' + (s.completionStatus === 'completed' ? 'completed' : s.completionStatus === 'paused' ? 'paused' : 'abandoned')))}</span>`;
      const pg = s.startingPage != null || s.endingPage != null || s.currentPage != null
        ? ` · ${esc(t('common.page'))} ${esc(fmtNum(s.startingPage ?? 1, L))}–${esc(fmtNum(s.endingPage ?? s.currentPage ?? '?', L))}` : '';
      return `
      <div class="session-row">
        <div class="sess-ic"><svg class="i"><use href="#i-${s.medium === 'physical' ? 'book' : s.medium === 'audiobook' ? 'audio' : 'file'}"/></svg></div>
        <div class="sess-main">
          <div class="sess-dates">${esc(A.sessionDateLabel(s))} ${st}</div>
          <div class="sess-meta">${esc(t('sess.medium'))}: ${esc(t('medium.' + (s.medium || 'physical')))}${pg}</div>
          ${prog.pct != null ? `<div style="max-width:300px;margin-top:5px"><div class="progress"><span style="width:${Math.round(prog.pct)}%"></span></div></div>` : ''}
          ${s.sessionNotes ? `<div class="sess-notes">${esc(s.sessionNotes)}</div>` : ''}
          ${s.rating ? `<div style="margin-top:4px">${starsDisplay(s.rating)}</div>` : ''}
        </div>
        <div class="btn-row" style="gap:2px;flex-direction:column;align-items:flex-end">
          ${s.completionStatus === 'active' ? `
            <button class="btn btn-sm" data-upd="${s.sessionId}">${esc(t('action.updateProgress'))}</button>
            <button class="btn btn-sm btn-green" data-fin="${s.sessionId}">${esc(t('action.finish'))}</button>` : `
            <button class="btn btn-sm" data-edit-s="${s.sessionId}">${esc(t('common.edit'))}</button>`}
          <button class="icon-btn sm" data-del-s="${s.sessionId}" aria-label="${esc(t('common.delete'))}"><svg class="i"><use href="#i-trash"/></svg></button>
        </div>
      </div>`;
    }).join('');
  }
  sessionsEl.querySelectorAll('[data-upd]').forEach(b => b.addEventListener('click', () => {
    const s = S.state.sessions.find(x => x.sessionId === b.dataset.upd);
    A.updateProgress(s, book, { onDone: () => rerender() });
  }));
  sessionsEl.querySelectorAll('[data-fin]').forEach(b => b.addEventListener('click', () => {
    const s = S.state.sessions.find(x => x.sessionId === b.dataset.fin);
    A.finishSession(s, book, { onDone: () => rerender() });
  }));
  sessionsEl.querySelectorAll('[data-edit-s]').forEach(b => b.addEventListener('click', () => {
    const s = S.state.sessions.find(x => x.sessionId === b.dataset.editS);
    A.editSession(s, book, { onDone: () => rerender() });
  }));
  sessionsEl.querySelectorAll('[data-del-s]').forEach(b => b.addEventListener('click', () => {
    const s = S.state.sessions.find(x => x.sessionId === b.dataset.delS);
    A.deleteSessionFlow(s, { onDone: () => rerender() });
  }));

  /* formats */
  const fmtEl = el.querySelector('[data-formats]');
  const formats = book.formats || [];
  if (!formats.length) {
    fmtEl.innerHTML = `<p class="muted small">${esc(t('book.formatsEmpty'))}</p>`;
  } else {
    fmtEl.innerHTML = formats.map(f => {
      const att = f.attachmentId ? S.state.attachments.find(a => a.attachmentId === f.attachmentId) : null;
      const isPhys = f.type === 'physical';
      const avail = isPhys ? t('favail.owned') : t('favail.' + (f.availabilityStatus || 'known-unlinked'));
      const size = att ? formatBytes(att.size) : '';
      const fileLabel = att ? esc(att.fileName) + ` <span class="dig-size">${esc(size)}</span>`
        : f.externalUrl ? `<a href="${esc(validUrl(f.externalUrl) || '#')}" target="_blank" rel="noopener">${esc(f.externalUrl)}</a>`
        : f.fileName ? esc(f.fileName) : '—';
      return `
      <div class="dig-row">
        <div class="dig-ic ${esc(f.type)}"><svg class="i"><use href="#i-${f.type === 'physical' ? 'book' : f.type === 'audiobook' ? 'audio' : 'file'}"/></svg></div>
        <div class="dig-main">
          <div class="d-name">${esc(t('fmt.' + f.type))} <span class="badge b-neutral">${esc(avail)}</span></div>
          <div class="d-book">${fileLabel}${f.languageOfEdition ? ` · ${esc(f.languageOfEdition)}` : ''}${f.notes ? ` · ${esc(f.notes)}` : ''}</div>
        </div>
        <div class="btn-row">
          ${att ? `<button class="btn btn-sm" data-open="${att.attachmentId}">${esc(t('common.open'))}</button>
                   <button class="btn btn-sm" data-dl="${att.attachmentId}">${esc(t('common.download'))}</button>
                   <button class="btn btn-sm" data-repl="${esc(f.formatId)}">${esc(t('dg.replace'))}</button>
                   <button class="btn btn-sm btn-ghost" data-rmatt="${esc(f.formatId)}">${esc(t('dg.removeAttachment'))}</button>`
            : f.externalUrl ? `<button class="btn btn-sm" data-ext="${esc(f.formatId)}">${esc(t('dg.openLink'))}</button>
                   <button class="btn btn-sm" data-attach="${esc(f.formatId)}">${esc(t('action.attachPdf'))}</button>`
            : `<button class="btn btn-sm" data-attach="${esc(f.formatId)}">${esc(t('action.attachPdf'))}</button>`}
        </div>
      </div>`;
    }).join('');
  }
  fmtEl.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => {
    const att = S.state.attachments.find(a => a.attachmentId === b.dataset.open);
    if (att) A.openAttachment(att);
  }));
  fmtEl.querySelectorAll('[data-dl]').forEach(b => b.addEventListener('click', () => {
    const att = S.state.attachments.find(a => a.attachmentId === b.dataset.dl);
    if (att) A.downloadAttachment(att);
  }));
  fmtEl.querySelectorAll('[data-repl]').forEach(b => b.addEventListener('click', () => {
    const f = formats.find(x => x.formatId === b.dataset.repl);
    A.pickAndAttach(book, f, { onDone: () => rerender() });
  }));
  fmtEl.querySelectorAll('[data-attach]').forEach(b => b.addEventListener('click', () => {
    const f = formats.find(x => x.formatId === b.dataset.attach);
    A.pickAndAttach(book, f, { onDone: () => rerender() });
  }));
  fmtEl.querySelectorAll('[data-rmatt]').forEach(b => b.addEventListener('click', () => {
    const f = formats.find(x => x.formatId === b.dataset.rmatt);
    A.removeAttachmentFlow(book, f, { onDone: () => rerender() });
  }));
  fmtEl.querySelectorAll('[data-ext]').forEach(b => b.addEventListener('click', () => {
    const f = formats.find(x => x.formatId === b.dataset.ext);
    A.openExternal(f.externalUrl);
  }));

  /* review */
  const revEl = el.querySelector('[data-review]');
  const rev = [];
  if (book.personalReview) rev.push(`<p>${esc(book.personalReview)}</p>`);
  if (book.keyTakeaways) rev.push(`<p><b>${esc(t('f.keyTakeaways'))}:</b> ${esc(book.keyTakeaways)}</p>`);
  if (book.favouriteQuotes) rev.push(`<div class="quote-block">${esc(book.favouriteQuotes)}</div>`);
  if (book.privateNotes) rev.push(`<p class="muted small">🔒 ${esc(book.privateNotes)}</p>`);
  if (book.wouldRecommend != null) rev.push(`<p class="small">${esc(t('f.wouldRecommend'))}: ${esc(book.wouldRecommend ? t('common.yes') : t('common.no'))}</p>`);
  revEl.innerHTML = rev.length ? rev.join('') : `<p class="muted small">${esc(t('book.reviewEmpty'))}</p>`;

  /* journal linked */
  const jrEl = el.querySelector('[data-journal]');
  const entries = S.state.journal.filter(j => j.bookId === book.id).sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
  jrEl.innerHTML = entries.length
    ? entries.slice(0, 5).map(j => `
      <div class="act-row">
        <div class="sess-ic"><svg class="i"><use href="#i-journal"/></svg></div>
        <div class="act-title grow"><a href="#/journal">${esc(j.title || t('jr.' + (j.type || 'reflection')))}</a>
          <div class="muted small">${esc((j.body || '').slice(0, 110))}${(j.body || '').length > 110 ? '…' : ''}</div></div>
        <time>${esc(fmtDate(j.date || j.createdAt, L))}</time>
      </div>`).join('') + (entries.length > 5 ? `<a href="#/journal" class="small">${esc(t('common.view'))} →</a>` : '')
    : `<p class="muted small">${esc(t('jr.empty'))}</p>`;

  /* actions */
  el.querySelector('[data-start]')?.addEventListener('click', () => A.startReading(book, { onDone: () => rerender() }));
  el.querySelector('[data-continue]')?.addEventListener('click', () => {
    const s = S.activeSessionFor(book.id);
    if (s) A.updateProgress(s, book, { onDone: () => rerender() });
  });
  el.querySelector('[data-finish]')?.addEventListener('click', () => {
    const s = S.activeSessionFor(book.id);
    if (s) A.finishSession(s, book, { onDone: () => rerender() });
    else toast(t('cv.sessionsEmpty'), 'err');
  });
  el.querySelector('[data-edit]')?.addEventListener('click', () => openBookForm(book, { onSaved: () => rerender() }));
  el.querySelector('[data-dup]')?.addEventListener('click', async () => {
    const copy = deepClone(book);
    delete copy.id; delete copy.createdAt; delete copy.updatedAt;
    copy.readingStatus = 'to-read';
    copy.titleBn = book.titleBn ? book.titleBn + ' (অনুলিপি)' : '';
    copy.titleEn = book.titleEn ? book.titleEn + ' (copy)' : '';
    copy.formats = (copy.formats || []).map(f => ({ ...f }));
    for (const f of copy.formats) delete f.attachmentId; // files are not duplicated
    await db.put('books', copy);
    await S.refreshBooks();
    toast(t('book.copied'));
    location.hash = `#/book/${copy.id}`;
  });
  el.querySelector('[data-archive]')?.addEventListener('click', async () => {
    book.isArchived = !book.isArchived;
    book.updatedAt = new Date().toISOString();
    await db.put('books', book);
    await S.refreshBooks();
    toast(book.isArchived ? t('book.archivedMsg') : t('book.unarchivedMsg'));
    rerender();
  });
  el.querySelector('[data-del]')?.addEventListener('click', async () => {
    const sessionsN = sessions.length;
    const attsN = (book.formats || []).filter(f => f.attachmentId).length;
    const journalN = S.state.journal.filter(j => j.bookId === book.id).length;
    const extra = document.createElement('div');
    if (journalN) {
      extra.innerHTML = `<label class="checkbox-row"><input type="checkbox" data-jr checked><span>${esc(t('book.deleteJournalQ', { n: fmtNum(journalN, L) }))}</span></label>`;
    }
    const ok = await confirmDialog({
      title: t('book.deleteConfirm'),
      message: esc(t('book.deleteMsg', { title: book.titleBn || book.titleEn, sessions: fmtNum(sessionsN, L), attachments: fmtNum(attsN, L) })),
      danger: true, okLabel: t('common.delete'), extra,
    });
    if (!ok) return;
    try {
      const delJr = extra.querySelector('[data-jr]')?.checked ?? true;
      await db.deleteBookCascade(book.id, { deleteJournal: delJr });
      await S.refreshBooks(); await S.refreshSessions(); await S.refreshAttachments(); await S.refreshJournal();
      toast(t('book.deletedMsg'));
      location.hash = '#/books';
    } catch (e) { errToast(e); }
  });
  el.querySelector('[data-returned]')?.addEventListener('click', async () => {
    book.lendingStatus = 'none'; book.borrowerName = ''; book.lendingDate = ''; book.expectedReturnDate = '';
    book.updatedAt = new Date().toISOString();
    await db.put('books', book);
    await S.refreshBooks();
    toast(t('common.saved')); rerender();
  });
  el.querySelector('[data-edit-review]')?.addEventListener('click', () => openBookForm(book, { onSaved: () => rerender() }));
  el.querySelectorAll('[data-add-note], [data-add-note2]').forEach(b => b.addEventListener('click', () => {
    openQuickNote({ bookId: book.id }, { onSaved: () => rerender() });
  }));

  function rerender() { render(el, ctx); }
}
