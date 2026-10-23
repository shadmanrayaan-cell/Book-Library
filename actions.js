/* আমার পাঠাগার — actions.js
   Reading-session flows (start / update / finish / pause / reread) and
   attachment operations (open / download / replace / remove).
   Session history is append-friendly: rereads create NEW sessions. */

import { esc, uid, todayISO, parseNum, fmtDate, validUrl, downloadFile, formatBytes, toEnDigits } from './util.js';
import { t } from './i18n.js';
import * as db from './db.js';
import * as S from './state.js';
import { openModal, confirmDialog, toast, errToast, selectEl, starsInput } from './components.js';

const MED_OPTS = () => ['physical', 'pdf', 'epub', 'other-digital', 'audiobook'].map(v => ({ value: v, label: t('medium.' + v) }));

export async function setBookStatus(book, status, { silent = false } = {}) {
  book.readingStatus = status;
  book.updatedAt = new Date().toISOString();
  await db.put('books', book);
  await S.refreshBooks();
  if (!silent) toast(t('common.saved'));
}

export function startReading(book, { onDone = null } = {}) {
  const existing = S.activeSessionFor(book.id);
  if (existing) { toast(t('action.continueReading')); onDone?.(); return; }
  /* resume a paused session instead of creating a duplicate */
  const pausedSess = S.state.sessions.find(s => s.bookId === book.id && s.completionStatus === 'paused');
  if (pausedSess) {
    pausedSess.completionStatus = 'active';
    pausedSess.updatedAt = new Date().toISOString();
    db.put('sessions', pausedSess)
      .then(() => setBookStatus(book, 'reading', { silent: true }))
      .then(() => S.refreshSessions())
      .then(() => { toast(t('action.resume')); onDone?.(pausedSess); })
      .catch(errToast);
    return;
  }
  const wrap = document.createElement('div');
  const suggestedMedium = book.preferredMedium || ((book.formats || []).some(f => f.type === 'pdf') ? 'pdf' : 'physical');
  wrap.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>${esc(t('sess.startDate'))}</label><input class="input" type="date" data-start value="${todayISO()}"></div>
      <div class="field"><label>${esc(t('sess.medium'))}</label><div data-medium></div></div>
      <div class="field"><label>${esc(t('sess.startingPage'))}</label><input class="input" type="number" min="0" data-sp value="${book.pageCount ? 1 : ''}" ${book.pageCount ? '' : 'placeholder="1"'}></div>
    </div>
    <div class="field"><label>${esc(t('sess.notes'))}</label><textarea class="textarea" rows="2" data-notes></textarea></div>`;
  wrap.querySelector('[data-medium]').appendChild(selectEl(MED_OPTS(), suggestedMedium, t('sess.medium')));

  const start = document.createElement('button');
  start.className = 'btn btn-green'; start.textContent = t('action.startReading');
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost'; cancel.textContent = t('common.cancel');
  const m = openModal({ title: t('action.startReading') + ' — ' + (book.titleBn || book.titleEn), body: wrap, footer: [cancel, start] });
  start.addEventListener('click', async () => {
    const now = new Date().toISOString();
    const session = {
      sessionId: uid('ss_'), bookId: book.id,
      startDate: wrap.querySelector('[data-start]').value || todayISO(),
      endDate: null, medium: wrap.querySelector('select').value,
      startingPage: parseNum(wrap.querySelector('[data-sp]').value),
      endingPage: null, currentPage: parseNum(wrap.querySelector('[data-sp]').value),
      manualProgress: null, completionStatus: 'active',
      sessionNotes: wrap.querySelector('[data-notes]').value.trim(),
      rating: null, createdAt: now, updatedAt: now,
    };
    try {
      await db.put('sessions', session);
      await setBookStatus(book, 'reading', { silent: true });
      await S.refreshSessions();
      toast(t('cv.sessionAdded'));
      m.close(); onDone?.(session);
    } catch (e) { errToast(e); }
  });
  cancel.addEventListener('click', () => m.close());
}

export function updateProgress(session, book, { onDone = null } = {}) {
  const hasPages = !!book.pageCount;
  const prog = S.sessionProgress(session, book);
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="form-grid">
      ${hasPages ? `
      <div class="field"><label>${esc(t('sess.currentPage'))} (${esc(t('common.page'))} 1–${book.pageCount})</label>
        <input class="input" type="number" min="0" max="${book.pageCount}" data-cur value="${session.currentPage ?? ''}"></div>` : `
      <div class="field"><label>${esc(t('sess.progressManual'))}</label>
        <input class="input" type="number" min="0" max="100" data-manual value="${session.manualProgress ?? ''}">
        <span class="hint">${esc(t('cv.needPages'))}</span></div>`}
      <div class="field"><label>${esc(t('common.date'))}</label><input class="input" type="date" data-date value="${todayISO()}"></div>
    </div>
    <div class="field"><label>${esc(t('sess.notes'))}</label><textarea class="textarea" rows="2" data-notes>${esc(session.sessionNotes || '')}</textarea></div>`;
  if (prog.pct != null) wrap.insertAdjacentHTML('beforeend', `<div class="mt8">${esc(t('sess.progress'))}: ${Math.round(prog.pct)}%</div>`);

  const ok = document.createElement('button');
  ok.className = 'btn btn-primary'; ok.textContent = t('common.save');
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost'; cancel.textContent = t('common.cancel');
  const m = openModal({ title: t('action.updateProgress') + ' — ' + (book.titleBn || book.titleEn), body: wrap, footer: [cancel, ok] });
  ok.addEventListener('click', async () => {
    session.updatedAt = new Date().toISOString();
    if (hasPages) session.currentPage = parseNum(wrap.querySelector('[data-cur]')?.value);
    else {
      const mp = parseNum(wrap.querySelector('[data-manual]')?.value);
      session.manualProgress = mp == null ? null : Math.min(100, Math.max(0, mp));
    }
    session.sessionNotes = wrap.querySelector('[data-notes]').value.trim();
    try {
      await db.put('sessions', session);
      await S.refreshSessions();
      toast(t('cv.sessionUpdated'));
      m.close(); onDone?.();
    } catch (e) { errToast(e); }
  });
  cancel.addEventListener('click', () => m.close());
}

export function finishSession(session, book, { onDone = null } = {}) {
  const hasPages = !!book.pageCount;
  const wrap = document.createElement('div');
  let rating = session.rating ?? 0;
  wrap.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>${esc(t('sess.endDate'))}</label><input class="input" type="date" data-end value="${todayISO()}"></div>
      ${hasPages ? `<div class="field"><label>${esc(t('sess.endingPage'))}</label><input class="input" type="number" min="0" max="${book.pageCount}" data-ep value="${book.pageCount}"></div>`
        : `<div class="field"><label>${esc(t('sess.progressManual'))}</label><input class="input" type="number" min="0" max="100" value="100" data-manual></div>`}
    </div>
    <div class="field"><label>${esc(t('sess.rating'))}</label><div data-rating></div></div>
    <div class="field"><label>${esc(t('sess.notes'))}</label><textarea class="textarea" rows="2" data-notes>${esc(session.sessionNotes || '')}</textarea></div>
    <label class="checkbox-row"><input type="checkbox" data-markbook checked><span>${esc(t('cv.markCompletedQ'))}</span></label>`;
  wrap.querySelector('[data-rating]').appendChild(starsInput(rating, v => { rating = v || null; }));

  const ok = document.createElement('button');
  ok.className = 'btn btn-green'; ok.textContent = t('action.finish');
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost'; cancel.textContent = t('common.cancel');
  const m = openModal({ title: t('action.finish') + ' — ' + (book.titleBn || book.titleEn), body: wrap, footer: [cancel, ok] });
  ok.addEventListener('click', async () => {
    session.endDate = wrap.querySelector('[data-end]').value || todayISO();
    if (hasPages) session.endingPage = parseNum(wrap.querySelector('[data-ep]').value);
    else session.manualProgress = 100;
    session.sessionNotes = wrap.querySelector('[data-notes]').value.trim();
    if (rating) session.rating = rating;
    session.completionStatus = 'completed';
    session.updatedAt = new Date().toISOString();
    try {
      await db.put('sessions', session);
      if (wrap.querySelector('[data-markbook]').checked) {
        await setBookStatus(book, 'completed', { silent: true });
      }
      await S.refreshSessions();
      toast(t('cv.sessionFinished'));
      m.close(); onDone?.();
    } catch (e) { errToast(e); }
  });
  cancel.addEventListener('click', () => m.close());
}

export function pauseOrAbandon(session, book, kind, { onDone = null } = {}) {
  session.completionStatus = kind; // 'paused' | 'abandoned'
  session.updatedAt = new Date().toISOString();
  db.put('sessions', session)
    .then(() => setBookStatus(book, kind === 'paused' ? 'paused' : 'abandoned', { silent: true }))
    .then(() => S.refreshSessions())
    .then(() => { toast(kind === 'paused' ? t('cv.pausedMsg') : t('cv.abandonedMsg')); onDone?.(); })
    .catch(errToast);
}

export function deleteSessionFlow(session, { onDone = null } = {}) {
  confirmDialog({ title: t('common.confirm'), message: esc(t('cv.deleteSession')), danger: true, okLabel: t('common.delete') })
    .then(async (ok) => {
      if (!ok) return;
      try {
        await db.del('sessions', session.sessionId);
        await S.refreshSessions();
        toast(t('common.deleted')); onDone?.();
      } catch (e) { errToast(e); }
    });
}

export function editSession(session, book, { onDone = null } = {}) {
  const hasPages = !!book.pageCount;
  const wrap = document.createElement('div');
  let rating = session.rating ?? 0;
  wrap.innerHTML = `
    <div class="form-grid">
      <div class="field"><label>${esc(t('sess.startDate'))}</label><input class="input" type="date" data-start value="${session.startDate || ''}"></div>
      <div class="field"><label>${esc(t('sess.endDate'))}</label><input class="input" type="date" data-end value="${session.endDate || ''}"></div>
      <div class="field"><label>${esc(t('sess.medium'))}</label><div data-medium></div></div>
      ${hasPages ? `
      <div class="field"><label>${esc(t('sess.startingPage'))}</label><input class="input" type="number" min="0" data-sp value="${session.startingPage ?? ''}"></div>
      <div class="field"><label>${esc(t('sess.endingPage'))}</label><input class="input" type="number" min="0" data-ep value="${session.endingPage ?? ''}"></div>
      <div class="field"><label>${esc(t('sess.currentPage'))}</label><input class="input" type="number" min="0" data-cur value="${session.currentPage ?? ''}"></div>` : `
      <div class="field"><label>${esc(t('sess.progressManual'))}</label><input class="input" type="number" min="0" max="100" data-manual value="${session.manualProgress ?? ''}"></div>`}
    </div>
    <div class="field"><label>${esc(t('sess.completion'))}</label><div data-completion></div></div>
    <div class="field"><label>${esc(t('sess.rating'))}</label><div data-rating></div></div>
    <div class="field"><label>${esc(t('sess.notes'))}</label><textarea class="textarea" rows="2" data-notes>${esc(session.sessionNotes || '')}</textarea></div>`;
  wrap.querySelector('[data-medium]').appendChild(selectEl(MED_OPTS(), session.medium || 'physical', t('sess.medium')));
  wrap.querySelector('[data-completion]').appendChild(selectEl(
    ['active', 'paused', 'completed', 'abandoned'].map(v => ({ value: v, label: v === 'active' ? t('sess.active') : t('status.' + v) })),
    session.completionStatus || 'active', t('sess.completion')));
  wrap.querySelector('[data-rating]').appendChild(starsInput(rating, v => { rating = v || null; }));

  const ok = document.createElement('button');
  ok.className = 'btn btn-primary'; ok.textContent = t('common.save');
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost'; cancel.textContent = t('common.cancel');
  const m = openModal({ title: t('sess.sessionN'), body: wrap, footer: [cancel, ok] });
  ok.addEventListener('click', async () => {
    session.startDate = wrap.querySelector('[data-start]').value || null;
    session.endDate = wrap.querySelector('[data-end]').value || null;
    session.medium = wrap.querySelector('[data-medium] select').value;
    if (hasPages) {
      session.startingPage = parseNum(wrap.querySelector('[data-sp]').value);
      session.endingPage = parseNum(wrap.querySelector('[data-ep]').value);
      session.currentPage = parseNum(wrap.querySelector('[data-cur]').value);
    } else {
      session.manualProgress = parseNum(wrap.querySelector('[data-manual]').value);
    }
    session.completionStatus = wrap.querySelector('[data-completion] select').value;
    session.rating = rating || null;
    session.sessionNotes = wrap.querySelector('[data-notes]').value.trim();
    session.updatedAt = new Date().toISOString();
    try {
      await db.put('sessions', session);
      await S.refreshSessions();
      toast(t('common.saved')); m.close(); onDone?.();
    } catch (e) { errToast(e); }
  });
  cancel.addEventListener('click', () => m.close());
}

/* ---------- attachments ---------- */
const MAX_SOFT = 50 * 1024 * 1024;   // warn beyond 50 MB
const MAX_HARD = 200 * 1024 * 1024;  // refuse beyond 200 MB

export function validateFile(file, type) {
  if (file.size > MAX_HARD) return { err: t('dg.tooBig', { size: formatBytes(file.size), max: formatBytes(MAX_HARD) }) };
  const wants = type === 'pdf' ? ['application/pdf'] : type === 'epub' ? ['application/epub+zip'] : null;
  const extOk = type === 'pdf' ? /\.pdf$/i.test(file.name) : type === 'epub' ? /\.epub$/i.test(file.name) : true;
  if (wants && !wants.includes(file.type) && !extOk) return { err: t('dg.badType', { type: file.type || file.name }) };
  return { warn: file.size > MAX_SOFT };
}

export function openAttachment(att) {
  try {
    const url = URL.createObjectURL(att.blob);
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) { errToast(e); }
}

export function downloadAttachment(att) {
  try { downloadFile(att.fileName || 'file', att.blob, att.mimeType); }
  catch (e) { errToast(e); }
}

export async function saveAttachment(book, format, file) {
  const now = new Date().toISOString();
  if (format.attachmentId) await db.del('attachments', format.attachmentId);
  const attachmentId = uid('at_');
  await db.put('attachments', { attachmentId, bookId: book.id, fileName: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, blob: file, addedAt: now });
  format.attachmentId = attachmentId;
  format.availabilityStatus = 'attached';
  book.updatedAt = now;
  await db.put('books', book);
  await S.refreshBooks();
  await S.refreshAttachments();
}

export function removeAttachmentFlow(book, format, { onDone = null } = {}) {
  const att = S.state.attachments.find(a => a.attachmentId === format.attachmentId);
  confirmDialog({
    title: t('dg.removeAttachment'),
    message: esc(t('dg.removeConfirm', { name: att?.fileName || format.fileName || 'file' })),
    danger: true, okLabel: t('common.remove'),
  }).then(async (ok) => {
    if (!ok) return;
    try {
      if (format.attachmentId) await db.del('attachments', format.attachmentId);
      delete format.attachmentId;
      format.availabilityStatus = 'known-unlinked';
      book.updatedAt = new Date().toISOString();
      await db.put('books', book);
      await S.refreshBooks(); await S.refreshAttachments();
      toast(t('common.deleted')); onDone?.();
    } catch (e) { errToast(e); }
  });
}

export function pickAndAttach(book, format, { onDone = null } = {}) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = format.type === 'epub' ? '.epub,application/epub+zip' : format.type === 'pdf' ? '.pdf,application/pdf' : '';
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    const v = validateFile(file, format.type);
    if (v.err) { toast(v.err, 'err'); return; }
    if (v.warn) toast(t('dg.tooBig', { size: formatBytes(file.size), max: formatBytes(MAX_SOFT) }));
    try {
      await saveAttachment(book, format, file);
      toast(t('dg.attachedOk')); onDone?.();
    } catch (e) { errToast(e); }
  });
  input.click();
}

export function openExternal(url) {
  const u = validUrl(url);
  if (!u) { toast(t('dg.badType', { type: url }), 'err'); return; }
  window.open(u, '_blank', 'noopener,noreferrer');
}

/* render a readable session date range */
export function sessionDateLabel(s) {
  if (s.startDate && s.endDate) return `${fmtDate(s.startDate)} → ${fmtDate(s.endDate)}`;
  if (s.startDate) return `${t('sess.started')}: ${fmtDate(s.startDate)}`;
  return '—';
}

export function digits(s) { return toEnDigits(String(s ?? '')); }
