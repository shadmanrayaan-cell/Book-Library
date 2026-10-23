/* আমার পাঠাগার — views/dashboard.js
   Data-driven dashboard. Every number is computed from stored records.
   A new library shows a welcoming empty state — never fabricated stats. */

import { esc, fmtNum, fmtDate, relTime, fmtMonthLabel, truncate, todayISO } from '../util.js';
import { t, sub } from '../i18n.js';
import * as S from '../state.js';
import { coverHTML, statusBadge, emptyState, progressHTML } from '../components.js';
import { openBookForm } from '../book-form.js';
import { loadSample } from '../sample.js';
import { uiLang } from '../state.js';

export function render(el) {
  const L = uiLang();
  const books = S.state.books.filter(b => !b.isArchived);
  const n = (v) => fmtNum(v, L);

  if (!S.state.books.length) {
    el.innerHTML = `
      <div class="page-head">
        <span class="ph-en">${esc(sub('nav.dashboard'))}</span>
        <h1>${esc(t('dash.title'))}</h1>
      </div>`;
    const actions = document.createElement('div');
    actions.className = 'btn-row';
    const add = document.createElement('button');
    add.className = 'btn btn-primary btn-lg';
    add.innerHTML = `<svg class="i"><use href="#i-plus"/></svg>${esc(t('action.addBook'))}`;
    add.addEventListener('click', () => openBookForm(null, { onSaved: () => render(el) }));
    const sample = document.createElement('button');
    sample.className = 'btn btn-lg';
    sample.innerHTML = `<svg class="i"><use href="#i-books"/></svg>${esc(t('dash.trySample'))}`;
    sample.addEventListener('click', async () => {
      sample.disabled = true;
      try { await loadSample(); render(el); } catch (e) { console.error(e); sample.disabled = false; }
    });
    const imp = document.createElement('button');
    imp.className = 'btn btn-lg';
    imp.innerHTML = `<svg class="i"><use href="#i-upload"/></svg>${esc(t('action.importBooks'))}`;
    imp.addEventListener('click', () => { location.hash = '#/data'; });
    actions.append(add, imp, sample);
    el.appendChild(emptyState({ icon: 'reading', title: t('dash.emptyTitle'), body: t('dash.emptyBody'), actions }));
    return;
  }

  /* ---------- compute stats ---------- */
  const statusCount = (st) => books.filter(b => b.readingStatus === st).length;
  const totalTitles = books.length;
  const physicalCopies = books.reduce((s, b) => s + (b.ownershipStatus === 'owned' ? (b.physicalCopyCount || 0) : 0), 0);
  const withPdf = books.filter(b => (b.formats || []).some(f => f.type === 'pdf')).length;
  const attachedFiles = books.filter(b => (b.formats || []).some(f => f.attachmentId)).length;
  const completed = statusCount('completed');
  const reading = statusCount('reading');
  const queue = statusCount('to-read');
  const paused = statusCount('paused');

  const langMap = new Map();
  for (const b of books) langMap.set(b.language || 'other', (langMap.get(b.language || 'other') || 0) + 1);
  const genreMap = new Map();
  for (const b of books) {
    const gs = b.primaryGenre ? [b.primaryGenre] : (b.genres || []).slice(0, 1);
    for (const g of gs) genreMap.set(g, (genreMap.get(g) || 0) + 1);
  }
  const topGenres = [...genreMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  /* goal: completions this year from session data */
  const completedThisYear = S.completedDates().filter(d => d.startsWith(String(new Date().getFullYear()))).length;
  const goalYear = Number(S.prefs().goals?.year) || 0;
  const goalPct = goalYear > 0 ? Math.min(100, Math.round((completedThisYear / goalYear) * 100)) : null;

  /* monthly completions (last 12 months) */
  const nowD = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
    months.push({ y: d.getFullYear(), m: d.getMonth(), count: 0 });
  }
  for (const dstr of S.completedDates()) {
    const d = new Date(dstr + 'T00:00:00');
    const cell = months.find(c => c.y === d.getFullYear() && c.m === d.getMonth());
    if (cell) cell.count++;
  }
  const maxMonth = Math.max(1, ...months.map(c => c.count));

  /* pages this year (only recorded pages) */
  const year = String(new Date().getFullYear());
  let pagesThisYear = 0, pagesIncomplete = false;
  for (const s of S.state.sessions) {
    if (s.completionStatus === 'completed' && s.endDate && s.endDate.startsWith(year)) {
      const sp = s.startingPage ?? 1, ep = s.endingPage;
      if (ep != null && ep >= sp) pagesThisYear += (ep - sp);
      else pagesIncomplete = true;
    }
  }

  /* recent activity */
  const events = [];
  for (const b of books) if (b.createdAt) events.push({ at: b.createdAt, type: 'add', book: b });
  for (const s of S.state.sessions) {
    const book = S.bookById(s.bookId);
    if (!book) continue;
    if (s.completionStatus === 'active') events.push({ at: s.startDate || s.createdAt, type: 'start', book, session: s });
    else if (s.completionStatus === 'completed' && s.endDate) events.push({ at: s.endDate, type: 'finish', book, session: s });
  }
  for (const j of S.state.journal) {
    const book = j.bookId ? S.bookById(j.bookId) : null;
    events.push({ at: j.updatedAt || j.createdAt, type: 'note', book, entry: j });
  }
  events.sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const recentEvents = events.slice(0, 7);

  const recentlyAdded = [...books].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).slice(0, 6);
  const priorityUnread = S.queuedBooks()
    .sort((a, b) => ({ high: 0, medium: 1, low: 2 }[a.priority] ?? 1) - ({ high: 0, medium: 1, low: 2 }[b.priority] ?? 1))
    .slice(0, 6);
  const activeSessions = S.state.sessions.filter(s => s.completionStatus === 'active');

  /* days this week */
  const weekStart = new Date(nowD); weekStart.setDate(nowD.getDate() - ((nowD.getDay() + 6) % 7)); weekStart.setHours(0, 0, 0, 0);
  const daySet = new Set();
  for (const s of S.state.sessions) {
    const dates = [s.startDate, s.endDate, (s.updatedAt || '').slice(0, 10)].filter(Boolean);
    for (const d of dates) { if (new Date(d + 'T00:00:00') >= weekStart) daySet.add(d); }
  }

  /* ---------- paint ---------- */
  const barRows = (entries, labelFn, green) => {
    const max = Math.max(1, ...entries.map(e => e[1]));
    return `<div class="bar-list">${entries.map(([k, v]) => `
      <div class="bar-row ${green ? 'bar-green' : ''}">
        <span class="bar-label" title="${esc(labelFn(k))}">${esc(truncate(labelFn(k), 16))}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.round((v / max) * 100)}%"></div></div>
        <span class="bar-val">${esc(n(v))}</span>
      </div>`).join('')}</div>`;
  };

  el.innerHTML = `
    <div class="page-head">
      <div class="ph-row">
        <div>
          <span class="ph-en">${esc(sub('nav.dashboard'))}</span>
          <h1>${esc(t('dash.title'))}</h1>
          <div class="ph-desc">${esc(t('book.countedOnce'))}</div>
        </div>
        <div class="btn-row">
          ${activeSessions.length ? `<button class="btn btn-green" data-continue>${esc(t('action.continueReading'))}</button>` : ''}
          <button class="btn" data-open-queue>${esc(t('action.openQueue'))}</button>
          <button class="btn btn-primary" data-add><svg class="i"><use href="#i-plus"/></svg>${esc(t('action.addBook'))}</button>
        </div>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi accent"><div class="kpi-num">${esc(n(totalTitles))}</div><div class="kpi-label">${esc(t('dash.totalTitles'))}</div></div>
      <div class="kpi"><div class="kpi-num">${esc(n(physicalCopies))}</div><div class="kpi-label">${esc(t('dash.physicalCopies'))}</div></div>
      <div class="kpi blue"><div class="kpi-num">${esc(n(withPdf))}</div><div class="kpi-label">${esc(t('dash.withPdf'))}</div></div>
      <div class="kpi blue"><div class="kpi-num">${esc(n(attachedFiles))}</div><div class="kpi-label">${esc(t('dash.attachedFiles'))}</div></div>
      <div class="kpi green"><div class="kpi-num">${esc(n(completed))}</div><div class="kpi-label">${esc(t('dash.completed'))}</div></div>
      <div class="kpi green"><div class="kpi-num">${esc(n(reading))}</div><div class="kpi-label">${esc(t('dash.reading'))}</div></div>
      <div class="kpi"><div class="kpi-num">${esc(n(queue))}</div><div class="kpi-label">${esc(t('dash.queue'))}</div></div>
      <div class="kpi"><div class="kpi-num">${esc(n(paused))}</div><div class="kpi-label">${esc(t('dash.paused'))}</div></div>
    </div>

    <div class="dash-cols mt24">
      <div>
        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('dash.recentActivity'))}</h2><span class="sec-en">Recent activity</span></div>
          ${recentEvents.length ? recentEvents.map(ev).join('') : `<p class="muted small">${esc(t('dash.noActivity'))}</p>`}
        </section>

        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('dash.monthly'))}</h2></div>
          <div class="month-strip">
            ${months.map(c => `<div class="month-cell" title="${esc(fmtMonthLabel(c.y, c.m, L))}: ${esc(n(c.count))}">
              <div class="m-bar" style="height:${Math.max(3, Math.round((c.count / maxMonth) * 58))}px;${c.count === 0 ? 'opacity:.25' : ''}"></div>
              <div class="m-lab">${esc(fmtMonthLabel(c.y, c.m, L).split(' ')[0])}</div>
            </div>`).join('')}
          </div>
          <p class="small muted" style="margin-bottom:0">${esc(t('dash.thisYear', { n: n(completedThisYear) }))} · ${esc(t('dash.thisMonth', { n: n(months[months.length - 1].count) }))}${pagesThisYear ? ` · ${esc(t('dash.pagesReadYear', { n: n(pagesThisYear) }))}` : ''}</p>
          ${pagesIncomplete ? `<p class="small muted" style="margin-bottom:0">${esc(t('dash.pagesIncomplete'))}</p>` : ''}
        </section>

        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('dash.recentlyAdded'))}</h2>
            <span class="spacer"></span><a class="small" href="#/books">${esc(t('nav.books'))} →</a></div>
          <div class="row-list">${recentlyAdded.map(b => bookRow(b)).join('')}</div>
        </section>
      </div>

      <div>
        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('dash.goal'))}</h2></div>
          ${goalYear > 0 ? `
          <div class="goal-wrap">
            <div class="goal-ring">
              <svg width="96" height="96" viewBox="0 0 96 96">
                <circle cx="48" cy="48" r="40" fill="none" stroke="var(--surface-3)" stroke-width="9"/>
                <circle cx="48" cy="48" r="40" fill="none" stroke="${goalPct >= 100 ? 'var(--green)' : 'var(--accent)'}" stroke-width="9"
                  stroke-linecap="round" stroke-dasharray="${(goalPct / 100) * 251.3} 251.3"/>
              </svg>
              <div class="goal-pct">${esc(n(goalPct))}%</div>
            </div>
            <div class="goal-info">
              <div class="kpi-num" style="font-size:1.3rem">${esc(n(completedThisYear))} / ${esc(n(goalYear))}</div>
              <div class="small muted">${esc(t('dash.daysThisWeek', { n: n(daySet.size) }))}</div>
            </div>
          </div>` : `<p class="muted small">${esc(t('dash.goalNone'))}</p>`}
        </section>

        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('dash.byLanguage'))}</h2></div>
          ${barRows([...langMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5), k => t('lang.' + k), false)}
        </section>

        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('dash.byGenre'))}</h2></div>
          ${topGenres.length ? barRows(topGenres, k => S.genreLabel(k, L), true) : `<p class="muted small">—</p>`}
        </section>

        <section class="section card card-pad">
          <div class="section-head"><h2>${esc(t('dash.priorityUnread'))}</h2>
            <span class="spacer"></span><a class="small" href="#/queue">${esc(t('nav.queue'))} →</a></div>
          <div class="row-list">${priorityUnread.length ? priorityUnread.map(b => bookRow(b)).join('') : `<p class="muted small">${esc(t('q.empty'))}</p>`}</div>
        </section>
      </div>
    </div>`;

  function ev(e) {
    const icon = { add: 'plus', start: 'play', finish: 'completed', note: 'journal' }[e.type];
    const label = e.type === 'add' ? t('dash.activityAdd')
      : e.type === 'start' ? t('dash.activityStart')
      : e.type === 'finish' ? t('dash.activityFinish')
      : t('dash.activityNote');
    const title = e.book ? (e.book.titleBn || e.book.titleEn) : (e.entry?.title || t('jr.noBook'));
    return `
      <div class="act-row">
        <div class="sess-ic"><svg class="i"><use href="#i-${icon}"/></svg></div>
        <div class="act-title grow"><span class="muted small">${esc(label)}</span>
          ${e.book ? `<a href="#/book/${e.book.id}"> ${esc(truncate(title, 44))}</a>` : ` <a href="#/journal">${esc(truncate(title, 44))}</a>`}</div>
        <time>${esc(relTime(e.at, L))}</time>
      </div>`;
  }
  function bookRow(b) {
    return `
      <div class="act-row">
        <a href="#/book/${b.id}" style="width:34px;flex:none">${coverHTML(b, { withMarks: false }).replace('class="bcover', 'style="border-radius:7px;aspect-ratio:5/7;width:34px" class="bcover')}</a>
        <div class="act-title grow"><a href="#/book/${b.id}">${esc(truncate(b.titleBn || b.titleEn || '—', 40))}</a>
          <div class="muted small">${esc(truncate(S.bookAuthors(b, L) || '', 40))}</div></div>
        ${statusBadge(b.readingStatus)}
      </div>`;
  }

  el.querySelector('[data-add]').addEventListener('click', () => openBookForm(null, { onSaved: () => render(el) }));
  el.querySelector('[data-open-queue]').addEventListener('click', () => { location.hash = '#/queue'; });
  el.querySelector('[data-continue]')?.addEventListener('click', () => { location.hash = '#/reading'; });
}
