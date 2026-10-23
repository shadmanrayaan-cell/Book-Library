/* আমার পাঠাগার — views/reading.js
   Reading Queue (manual reorder + sorting), Currently Reading (progress
   cards), Completed Books (history-preserving list). */

import { esc, fmtDate, fmtNum, truncate } from '../util.js';
import { t, sub } from '../i18n.js';
import * as S from '../state.js';
import { coverHTML, statusBadge, emptyState, progressHTML, starsDisplay, toast } from '../components.js';
import * as A from '../actions.js';
import { uiLang } from '../state.js';

/* ================= QUEUE ================= */
export function renderQueue(el) {
  const L = uiLang();
  let sortMode = S.prefs().queueSort || 'manual';
  let books = S.queuedBooks();

  el.innerHTML = `
    <div class="page-head">
      <span class="ph-en">${esc(sub('nav.queue'))}</span>
      <h1>${esc(t('q.title'))}</h1>
      <div class="ph-desc">${esc(t('q.subtitle'))}</div>
    </div>
    <div class="toolbar">
      <select class="select" data-sort>
        ${[['manual', t('q.sortManual')], ['priority', t('q.sortPriority')], ['planned', t('q.sortPlanned')], ['added', t('q.sortAdded')], ['genre', t('q.sortGenre')], ['duration', t('q.sortDuration')]]
          .map(([v, l]) => `<option value="${v}" ${sortMode === v ? 'selected' : ''}>${esc(t('q.sort' + { manual: 'Manual', priority: 'Priority', planned: 'Planned', added: 'Added', genre: 'Genre', duration: 'Duration' }[v]))}</option>`).join('')}
      </select>
      <span class="count-note">${esc(fmtNum(books.length, L))} ${esc(t('t.book'))}</span>
    </div>
    <div data-list></div>
    <p class="small muted">${esc(t('q.emptyHint'))}</p>`;

  const listEl = el.querySelector('[data-list]');
  el.querySelector('[data-sort]').addEventListener('change', (e) => {
    sortMode = e.target.value;
    S.savePrefs({ queueSort: sortMode });
    paint();
  });

  function orderBooks() {
    let list = [...books];
    const locale = L === 'en' ? 'en' : 'bn';
    if (sortMode === 'priority') list.sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] ?? 1) - ({ high: 0, medium: 1, low: 2 }[b.priority] ?? 1));
    else if (sortMode === 'planned') list.sort((a, b) => (a.plannedReadingDate || '9999').localeCompare(b.plannedReadingDate || '9999'));
    else if (sortMode === 'added') list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    else if (sortMode === 'genre') list.sort((a, b) => S.genreLabel(a.primaryGenre, L).localeCompare(S.genreLabel(b.primaryGenre, L), locale));
    else if (sortMode === 'duration') list.sort((a, b) => (a.estimatedMinutes ?? 9e9) - (b.estimatedMinutes ?? 9e9));
    return list;
  }

  function paint() {
    books = S.queuedBooks();
    const list = orderBooks();
    el.querySelector('.count-note').textContent = `${fmtNum(list.length, L)} ${t('t.book')}`;
    if (!list.length) {
      listEl.innerHTML = '';
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary';
      btn.innerHTML = `<svg class="i"><use href="#i-plus"/></svg>${esc(t('action.addBook'))}`;
      btn.addEventListener('click', async () => {
        const { openBookForm } = await import('../book-form.js');
        openBookForm(null, { onSaved: () => paint() });
      });
      listEl.appendChild(emptyState({ icon: 'queue', title: t('q.empty'), body: t('q.emptyHint'), actions: [btn] }));
      return;
    }
    listEl.innerHTML = list.map((b, i) => `
      <div class="queue-row" draggable="true" data-id="${b.id}">
        ${sortMode === 'manual' ? `<svg class="i q-grip" aria-hidden="true"><use href="#i-grip"/></svg>` : `<span class="q-pos">${esc(fmtNum(i + 1, L))}</span>`}
        <div class="q-main">
          <span class="q-title" data-open="${b.id}">${esc(truncate(b.titleBn || b.titleEn || '—', 60))}</span>
          <div class="q-meta">
            ${S.bookAuthors(b, L) ? `<span>${esc(truncate(S.bookAuthors(b, L), 40))}</span>` : ''}
            ${b.priority !== 'medium' ? `<span>${esc(t('pri.' + b.priority))}</span>` : ''}
            ${b.plannedReadingDate ? `<span>${esc(t('q.plannedOn', { d: fmtDate(b.plannedReadingDate, L) }))}</span>` : ''}
            ${b.estimatedMinutes ? `<span>${esc(t('q.estTime', { n: fmtNum(b.estimatedMinutes, L) }))}</span>` : ''}
            ${b.reasonForReading ? `<span>${esc(t('q.reason', { r: truncate(b.reasonForReading, 40) }))}</span>` : ''}
            ${b.readingStatus === 'paused' ? statusBadge('paused') : ''}
          </div>
        </div>
        <div class="btn-row">
          ${sortMode === 'manual' ? `
            <button class="icon-btn sm" data-up="${i}" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('q.moveUp'))}"><svg class="i"><use href="#i-chev-u"/></svg></button>
            <button class="icon-btn sm" data-down="${i}" ${i === list.length - 1 ? 'disabled' : ''} aria-label="${esc(t('q.moveDown'))}"><svg class="i"><use href="#i-chev-d"/></svg></button>` : ''}
          <button class="btn btn-sm btn-green" data-start="${b.id}"><svg class="i sm"><use href="#i-play"/></svg>${esc(t('action.startReading'))}</button>
        </div>
      </div>`).join('');

    listEl.querySelectorAll('[data-open]').forEach(n => n.addEventListener('click', () => { location.hash = `#/book/${n.dataset.open}`; }));
    listEl.querySelectorAll('[data-start]').forEach(n => n.addEventListener('click', async () => {
      const b = S.bookById(n.dataset.start);
      const { openBookForm } = await import('../book-form.js');
      void openBookForm;
      A.startReading(b, { onDone: () => paint() });
    }));
    listEl.querySelectorAll('[data-up]').forEach(n => n.addEventListener('click', () => move(Number(n.dataset.up), -1)));
    listEl.querySelectorAll('[data-down]').forEach(n => n.addEventListener('click', () => move(Number(n.dataset.down), +1)));

    if (sortMode === 'manual') wireDrag();
  }

  function move(idx, dir) {
    const list = orderBooks();
    const j = idx + dir;
    if (j < 0 || j >= list.length) return;
    [list[idx], list[j]] = [list[j], list[idx]];
    S.saveQueueOrder(list.map(b => b.id)).then(() => { paint(); toast(t('q.reordered')); });
  }

  function wireDrag() {
    let dragId = null;
    listEl.querySelectorAll('.queue-row').forEach(row => {
      row.addEventListener('dragstart', (e) => { dragId = row.dataset.id; row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); listEl.querySelectorAll('.queue-row').forEach(r => r.classList.remove('dragover')); });
      row.addEventListener('dragover', (e) => { e.preventDefault(); if (row.dataset.id !== dragId) row.classList.add('dragover'); });
      row.addEventListener('dragleave', () => row.classList.remove('dragover'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetId = row.dataset.id;
        if (!dragId || dragId === targetId) return;
        const list = orderBooks();
        const from = list.findIndex(b => b.id === dragId);
        const to = list.findIndex(b => b.id === targetId);
        const [moved] = list.splice(from, 1);
        list.splice(to, 0, moved);
        S.saveQueueOrder(list.map(b => b.id)).then(() => { paint(); toast(t('q.reordered')); });
      });
    });
  }

  paint();
}

/* ================= CURRENTLY READING ================= */
export function renderReading(el) {
  const L = uiLang();
  const sessions = S.state.sessions.filter(s => s.completionStatus === 'active')
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  el.innerHTML = `
    <div class="page-head">
      <span class="ph-en">${esc(sub('nav.reading'))}</span>
      <h1>${esc(t('r.title'))}</h1>
    </div>
    <div data-list></div>`;

  const listEl = el.querySelector('[data-list]');
  if (!sessions.length) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.innerHTML = `<svg class="i"><use href="#i-queue"/></svg>${esc(t('action.openQueue'))}`;
    btn.addEventListener('click', () => { location.hash = '#/queue'; });
    listEl.appendChild(emptyState({ icon: 'reading', title: t('r.title'), body: t('r.empty'), actions: [btn] }));
    return;
  }

  listEl.innerHTML = sessions.map(s => {
    const b = S.bookById(s.bookId);
    if (!b) return '';
    const prog = S.sessionProgress(s, b);
    return `
    <div class="reading-card">
      <a class="rcover" href="#/book/${b.id}">${coverHTML(b, { withMarks: false })}</a>
      <div class="r-main">
        <a class="r-title" href="#/book/${b.id}">${esc(truncate(b.titleBn || b.titleEn || '—', 70))}</a>
        <div class="muted small">${esc(S.bookAuthors(b, L) || '')}</div>
        <div class="small muted">${esc(t('r.startedOn', { d: fmtDate(s.startDate, L) }))} · ${esc(t('r.medium', { m: t('medium.' + (s.medium || 'physical')) }))}</div>
        ${progressHTML(prog.pct)}
      </div>
      <div class="r-actions">
        <button class="btn btn-sm" data-upd="${s.sessionId}">${esc(t('action.updateProgress'))}</button>
        <button class="btn btn-sm btn-green" data-fin="${s.sessionId}">${esc(t('action.finish'))}</button>
        <button class="btn btn-sm" data-pause="${s.sessionId}">${esc(t('action.pause'))}</button>
        <button class="btn btn-sm btn-ghost" data-abandon="${s.sessionId}">${esc(t('action.abandon'))}</button>
      </div>
    </div>`;
  }).join('');

  const rerender = () => renderReading(el);
  listEl.querySelectorAll('[data-upd]').forEach(n => n.addEventListener('click', () => {
    const s = S.state.sessions.find(x => x.sessionId === n.dataset.upd);
    A.updateProgress(s, S.bookById(s.bookId), { onDone: rerender });
  }));
  listEl.querySelectorAll('[data-fin]').forEach(n => n.addEventListener('click', () => {
    const s = S.state.sessions.find(x => x.sessionId === n.dataset.fin);
    A.finishSession(s, S.bookById(s.bookId), { onDone: rerender });
  }));
  listEl.querySelectorAll('[data-pause]').forEach(n => n.addEventListener('click', () => {
    const s = S.state.sessions.find(x => x.sessionId === n.dataset.pause);
    A.pauseOrAbandon(s, S.bookById(s.bookId), 'paused', { onDone: rerender });
  }));
  listEl.querySelectorAll('[data-abandon]').forEach(n => n.addEventListener('click', () => {
    const s = S.state.sessions.find(x => x.sessionId === n.dataset.abandon);
    A.pauseOrAbandon(s, S.bookById(s.bookId), 'abandoned', { onDone: rerender });
  }));
}

/* ================= COMPLETED ================= */
export function renderCompleted(el) {
  const L = uiLang();
  const books = S.state.books.filter(b => !b.isArchived && b.readingStatus === 'completed')
    .sort((a, b) => lastFinished(b).localeCompare(lastFinished(a)));

  el.innerHTML = `
    <div class="page-head">
      <span class="ph-en">${esc(sub('nav.completed'))}</span>
      <h1>${esc(t('c.title'))}</h1>
      <div class="ph-desc">${esc(fmtNum(books.length, L))} ${esc(t('t.book'))}</div>
    </div>
    <div data-list></div>`;

  const listEl = el.querySelector('[data-list]');
  if (!books.length) {
    listEl.appendChild(emptyState({ icon: 'completed', title: t('c.title'), body: t('c.empty') }));
    return;
  }
  listEl.innerHTML = books.map(b => {
    const fin = lastFinished(b);
    const rereadCount = S.sessionsFor(b.id).filter(s => s.completionStatus === 'completed').length;
    return `
    <div class="reading-card">
      <a class="rcover" href="#/book/${b.id}">${coverHTML(b, { withMarks: false })}</a>
      <div class="r-main">
        <a class="r-title" href="#/book/${b.id}">${esc(truncate(b.titleBn || b.titleEn || '—', 70))}</a>
        <div class="muted small">${esc(S.bookAuthors(b, L) || '')}</div>
        <div class="small muted">${esc(t('c.finishedOn', { d: fmtDate(fin, L) }))}${rereadCount > 1 ? ` · ${esc(fmtNum(rereadCount, L))}× ${esc(t('sess.history'))}` : ''}</div>
        <div>${starsDisplay(b.rating)}</div>
      </div>
      <div class="r-actions">
        <button class="btn btn-sm" data-reread="${b.id}"><svg class="i sm"><use href="#i-refresh"/></svg>${esc(t('common.reread'))}</button>
      </div>
    </div>`;
  }).join('');

  listEl.querySelectorAll('[data-reread]').forEach(n => n.addEventListener('click', () => {
    const b = S.bookById(n.dataset.reread);
    A.startReading(b, { onDone: () => renderCompleted(el) });
  }));

  function lastFinished(b) {
    const fins = S.sessionsFor(b.id).filter(s => s.completionStatus === 'completed' && s.endDate);
    return fins.length ? fins.map(s => s.endDate).sort().pop() : (b.updatedAt || '');
  }
}
