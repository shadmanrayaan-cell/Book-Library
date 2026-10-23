/* আমার পাঠাগার — views/data.js
   CSV import (mapping → preview → summary), CSV export, JSON backup
   (optional attachments as base64), restore (merge/replace with preview
   and safety backup), template download, backup reminder. */

import { esc, uid, fmtNum, formatBytes, downloadFile, todayISO, parseNum } from '../util.js';
import { t, sub } from '../i18n.js';
import * as S from '../state.js';
import * as db from '../db.js';
import * as C from '../csv.js';
import { findDuplicates } from '../search.js';
import { openModal, toast, errToast, confirmDialog } from '../components.js';
import { uiLang } from '../state.js';
import { blobToBase64, base64ToBlob } from '../util.js';

const BACKUP_SCHEMA = { app: 'amar-pathagar', schemaVersion: 1 };

export function render(el) {
  const L = uiLang();
  let tab = 'import';
  let pendingPrefs = { reminderDays: S.prefs().backupReminderDays || 30 };

  el.innerHTML = `
    <div class="page-head">
      <span class="ph-en">${esc(sub('nav.data'))}</span>
      <h1>${esc(t('ie.title'))}</h1>
      <div class="ph-desc">${esc(t('ie.subtitle'))}</div>
    </div>
    <div data-reminder></div>
    <div class="tabs" data-tabs>
      <button class="tab active" data-tab="import">${esc(t('ie.tabImport'))}</button>
      <button class="tab" data-tab="export">${esc(t('ie.tabExport'))}</button>
      <button class="tab" data-tab="backup">${esc(t('ie.tabBackup'))}</button>
      <button class="tab" data-tab="restore">${esc(t('ie.tabRestore'))}</button>
      <button class="tab" data-tab="template">${esc(t('ie.tabTemplate'))}</button>
    </div>
    <div data-pane></div>`;

  const pane = el.querySelector('[data-pane]');
  el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
    tab = b.dataset.tab;
    el.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x === b));
    paint();
  }));

  function paintReminder() {
    const days = Number(S.prefs().backupReminderDays) || 0;
    const last = S.prefs().lastBackupAt;
    const elR = el.querySelector('[data-reminder]');
    if (!days) { elR.innerHTML = ''; return; }
    const due = !last || (Date.now() - new Date(last).getTime()) > days * 86400000;
    elR.innerHTML = due ? `
      <div class="warncard" style="margin-bottom:16px">
        <svg class="i"><use href="#i-info"/></svg>
        <div style="flex:1">
          <b>${esc(t('ie.backupDue'))}</b>
          <div class="small">${esc(t('ie.lastBackup', { d: last ? esc(fmtDateStr(last)) : esc(t('ie.neverBackedUp')) }))}</div>
        </div>
        <button class="btn btn-sm" data-go-backup>${esc(t('ie.tabBackup'))}</button>
      </div>` : '';
    elR.querySelector('[data-go-backup]')?.addEventListener('click', () => {
      tab = 'backup';
      el.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('active', x.dataset.tab === 'backup'));
      paint();
    });
  }
  const fmtDateStr = (iso) => iso ? iso.slice(0, 10) : '';

  function paint() {
    paintReminder();
    if (tab === 'import') paintImport();
    else if (tab === 'export') paintExport();
    else if (tab === 'backup') paintBackup();
    else if (tab === 'restore') paintRestore();
    else paintTemplate();
  }

  /* ================= CSV IMPORT ================= */
  function paintImport() {
    pane.innerHTML = `
      <div class="step-dots"><span class="sd on" data-s="1"></span><span class="sd" data-s="2"></span><span class="sd" data-s="3"></span><span class="sd" data-s="4"></span></div>
      <div class="card card-pad" data-stage></div>`;
    const stage = pane.querySelector('[data-stage]');
    const setStep = (n) => {
      pane.querySelectorAll('.sd').forEach((d, i) => d.classList.toggle('on', i < n));
    };
    let parsed = null; // {headers, rows}
    let mapping = null;
    let validated = null;

    stage.innerHTML = `
      <div class="dropzone" data-drop>
        <svg class="i lg" style="width:34px;height:34px"><use href="#i-upload"/></svg>
        <p style="margin:8px 0 0">${esc(t('ie.dropHere'))}</p>
        <input type="file" accept=".csv,text/csv,.txt" hidden data-file>
      </div>
      ${t('book.emptyTitle') ? `<p class="small muted mt8">${esc(t('ie.csvNote'))}</p>` : ''}`;

    const drop = stage.querySelector('[data-drop]');
    const fileInput = stage.querySelector('[data-file]');
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('drag');
      const f = e.dataTransfer.files[0]; if (f) readFile(f);
    });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) readFile(fileInput.files[0]); });

    function readFile(f) {
      const fr = new FileReader();
      fr.onerror = () => toast(t('ie.errBadFile'), 'err');
      fr.onload = () => {
        try {
          const text = String(fr.result);
          const { rows } = C.parseCSV(text);
          if (rows.length < 2) { toast(t('ie.errBadFile'), 'err'); return; }
          parsed = { headers: rows[0], rows: rows.slice(1) };
          mapping = C.guessMapping(parsed.headers);
          paintMapping();
        } catch (e) { errToast(e); toast(t('ie.errBadFile'), 'err'); }
      };
      fr.readAsText(f, 'utf-8');
    }

    function paintMapping() {
      setStep(2);
      const mappedCount = mapping.filter(Boolean).length;
      stage.innerHTML = `
        <p style="margin-top:0">${esc(t('ie.mapIntro'))} · ${esc(fmtNum(mappedCount, L))} ${esc(t('common.results'))}</p>
        <div class="table-wrap" style="border:none;max-height:340px;overflow-y:auto">
        <table class="map-table">
          <thead><tr><th>${esc(t('ie.colSource'))}</th><th>${esc(t('ie.colMap'))}</th><th>${esc(t('ie.colExample'))}</th></tr></thead>
          <tbody>
            ${parsed.headers.map((h, i) => `
            <tr>
              <td><b>${esc(h || '—')}</b></td>
              <td><select class="select" data-map="${i}" style="min-width:190px">
                <option value="">${esc(t('ie.ignore'))}</option>
                ${Object.keys(C.CSV_FIELDS).map(f => `<option value="${f}" ${mapping[i] === f ? 'selected' : ''}>${esc(f)}</option>`).join('')}
              </select></td>
              <td class="map-example">${esc(parsed.rows[0]?.[i] || '')}</td>
            </tr>`).join('')}
          </tbody>
        </table></div>
        <div class="btn-row mt16">
          <button class="btn btn-ghost" data-back>${esc(t('common.back'))}</button>
          <span style="flex:1"></span>
          <button class="btn btn-primary" data-next>${esc(t('common.apply'))} →</button>
        </div>`;
      stage.querySelectorAll('[data-map]').forEach(s => s.addEventListener('change', () => { mapping[Number(s.dataset.map)] = s.value; }));
      stage.querySelector('[data-back]').addEventListener('click', paintImport);
      stage.querySelector('[data-next]').addEventListener('click', () => {
        const ctx = {
          defaultLanguage: S.prefs().defaultLanguage || 'bn',
          defaultStatus: S.prefs().defaultStatus || 'to-read',
          genreIds: new Map(S.state.genres.map(g => [normG(g.nameBn) || normG(g.nameEn), g.id])),
          authorId: (name) => {
            const key = normG(name);
            if (ctx._authors.has(key)) return ctx._authors.get(key);
            const exist = S.state.authors.find(a => [a.nameBn, a.nameEn, ...(a.aliases || [])].some(x => normG(x) === key));
            if (exist) { ctx._authors.set(key, exist.id); return exist.id; }
            const id = uid('au_');
            ctx._newAuthors.set(id, name);
            ctx._authors.set(key, id);
            return id;
          },
          publisherId: (name) => {
            const key = normG(name);
            if (ctx._pubs.has(key)) return ctx._pubs.get(key);
            const exist = S.state.publishers.find(p => [p.nameBn, p.nameEn].some(x => normG(x) === key));
            if (exist) { ctx._pubs.set(key, exist.id); return exist.id; }
            const id = uid('pb_');
            ctx._newPubs.set(id, name);
            ctx._pubs.set(key, id);
            return id;
          },
          newGenreId: (name) => {
            const key = normG(name);
            if (ctx._genres.has(key)) return ctx._genres.get(key);
            const g = { id: uid('gn_'), nameBn: /[\u0980-\u09FF]/.test(name) ? name : '', nameEn: /[\u0980-\u09FF]/.test(name) ? '' : name };
            ctx._newGenres.push(g);
            ctx._genres.set(key, g.id);
            return g.id;
          },
          _authors: new Map(), _pubs: new Map(), _genres: new Map(),
          _newAuthors: new Map(), _newPubs: new Map(), _newGenres: [],
        };
        validated = { ctx, drafts: [], invalid: [] };
        parsed.rows.forEach((row, idx) => {
          try {
            const { book, errors, warnings } = C.rowToDraft(row, parsed.headers, mapping, ctx);
            if (errors.length) validated.invalid.push({ row: idx + 2, errs: errors.map(e => t('ie.' + e)) });
            else validated.drafts.push({ book, warnings, rowNo: idx + 2 });
          } catch {
            validated.invalid.push({ row: idx + 2, errs: ['parse'] });
          }
        });
        paintPreview();
      });
    }
    const normG = (s) => (s || '').toString().trim().toLowerCase();

    function paintPreview() {
      setStep(3);
      let skipInvalid = true, skipDupes = true;
      /* duplicates are checked against existing books AND earlier rows of the
         same import file, so identical rows are caught within one batch */
      const accepted = [];
      const dupChecks = validated.drafts.map(d => {
        const dupes = findDupes(d.book, S.state.books.concat(accepted));
        const row = { d, dupes };
        if (!dupes.length) accepted.push(d.book);
        return row;
      });
      const nInvalid = validated.invalid.length;
      const nDupes = dupChecks.filter(x => x.dupes.length).length;

      const goBtn = () => {
        const list = dupChecks
          .filter(x => (skipDupes ? !x.dupes.length : true))
          .filter(x => (skipInvalid ? true : true));
        const invalidList = skipInvalid ? [] : [];
        return { list, invalidList };
      };
      const renderCount = () => {
        const { list } = goBtn();
        const btn = stage.querySelector('[data-go]');
        btn.disabled = !list.length;
        btn.textContent = t('ie.importN', { n: fmtNum(list.length, L) });
      };

      stage.innerHTML = `
        <div class="flex wrap" style="margin-bottom:12px">
          <span class="badge b-owned">${esc(t('ie.rowsValid', { n: fmtNum(dupChecks.length, L) }))}</span>
          ${nDupes ? `<span class="badge b-paused">${esc(t('ie.rowsDuplicate', { n: fmtNum(nDupes, L) }))}</span>` : ''}
          ${nInvalid ? `<span class="badge b-abandoned">${esc(t('ie.rowsInvalid', { n: fmtNum(nInvalid, L) }))}</span>` : ''}
        </div>
        <div class="flex wrap" style="margin-bottom:10px">
          <label class="checkbox-row small"><input type="checkbox" data-skip-invalid ${skipInvalid ? 'checked' : ''}><span>${esc(t('ie.skipInvalid'))}</span></label>
          <label class="checkbox-row small"><input type="checkbox" data-skip-dupes ${skipDupes ? 'checked' : ''}><span>${esc(t('ie.skipDuplicates'))}</span></label>
        </div>
        <div class="table-wrap" style="border:none;max-height:380px;overflow:auto">
        <table class="prev-table">
          <thead><tr><th>#</th><th>${esc(t('f.titleBn'))}</th><th>${esc(t('f.titleEn'))}</th><th>${esc(t('f.authors'))}</th><th>${esc(t('f.readingStatus'))}</th><th></th></tr></thead>
          <tbody>
            ${dupChecks.slice(0, 100).map(({ d, dupes }) => `
              <tr ${dupes.length ? 'class="errrow"' : ''}><td>${d.rowNo}</td><td>${esc(d.book.titleBn)}</td><td>${esc(d.book.titleEn)}</td>
              <td>${esc(d.book.authors.map(id => ctxName(d, id)).join('; '))}</td>
              <td>${esc(t('status.' + d.book.readingStatus))}</td>
              ${dupes.length ? `<td class="row-err">${esc(t('book.duplicateTitle'))}</td></tr>` : '<td></td></tr>'}`).join('')}
            ${validated.invalid.slice(0, 30).map(x => `
              <tr class="errrow"><td>${x.row}</td><td colspan="4" class="row-err">${esc(x.errs.join(' · '))}</td><td></td></tr>`).join('')}
          </tbody>
        </table></div>
        <div class="btn-row mt16">
          <button class="btn btn-ghost" data-back>${esc(t('common.back'))}</button>
          <span style="flex:1"></span>
          <button class="btn btn-primary" data-go></button>
        </div>`;
      function ctxName(d, id) {
        if (d.ctxAuthors?.[id]) return d.ctxAuthors[id];
        const a = S.authorById(id);
        return a ? (a.nameBn || a.nameEn) : validated.ctx._newAuthors.get(id) || id;
      }
      stage.querySelector('[data-skip-invalid]').addEventListener('change', (e) => { skipInvalid = e.target.checked; renderCount(); });
      stage.querySelector('[data-skip-dupes]').addEventListener('change', (e) => { skipDupes = e.target.checked; renderCount(); });
      stage.querySelector('[data-back]').addEventListener('click', paintMapping);
      renderCount();
      stage.querySelector('[data-go]').addEventListener('click', () => {
        const list = goBtn().list.filter(x => (skipDupes ? !x.dupes.length : true));
        doImport(list, { skipInvalid, skipDupes });
      });
    }

    async function doImport(list, { skipInvalid = true, skipDupes = true } = {}) {
      setStep(4);
      const btn = stage.querySelector('[data-go]');
      btn.disabled = true;
      const ctx = validated.ctx;
      try {
        const now = new Date().toISOString();
        for (const [id, name] of ctx._newAuthors) {
          const isBn = /[\u0980-\u09FF]/.test(name);
          await db.put('authors', { id, nameBn: isBn ? name : '', nameEn: isBn ? '' : name, aliases: [], biography: '', birthYear: null, deathYear: null, notes: '', createdAt: now, updatedAt: now });
        }
        for (const [id, name] of ctx._newPubs) {
          const isBn = /[\u0980-\u09FF]/.test(name);
          await db.put('publishers', { id, nameBn: isBn ? name : '', nameEn: isBn ? '' : name, aliases: [], notes: '', country: '', createdAt: now, updatedAt: now });
        }
        if (ctx._newGenres.length) { S.state.genres.push(...ctx._newGenres); await S.updateGenres(); }
        for (const { d } of list) {
          const rec = { ...d.book };
          if (!rec.id) rec.id = uid('bk_');
          if (!rec.createdAt) rec.createdAt = now;
          await db.put('books', rec);
          if (rec.tags) S.registerTags(rec.tags);
        }
        await S.refreshBooks(); await S.refreshAuthors(); await S.refreshPublishers();
        stage.innerHTML = `
          <div class="infocard"><svg class="i"><use href="#i-check"/></svg>
          <span>${esc(t('ie.done', { imported: fmtNum(list.length, L), skipped: fmtNum(validated.invalid.length, L) }))}</span></div>
          ${ctx._newAuthors.size ? `<p class="small muted">${esc(t('ie.authorsCreated', { n: fmtNum(ctx._newAuthors.size, L) }))}</p>` : ''}
          <div class="btn-row mt16">
            <a class="btn btn-primary" href="#/books">${esc(t('nav.books'))} →</a>
          </div>`;
        toast(t('ie.done', { imported: fmtNum(list.length, L), skipped: fmtNum(validated.invalid.length, L) }));
      } catch (e) { errToast(e); btn.disabled = false; }
    }
  }

  function findDupes(book, list) {
    return findDuplicates(book, list || S.state.books);
  }

  /* ================= CSV EXPORT ================= */
  function paintExport() {
    pane.innerHTML = `
      <div class="card card-pad">
        <h3 style="margin-top:0">${esc(t('ie.tabExport'))}</h3>
        <p class="small muted">${esc(t('ie.csvNote'))}</p>
        <p class="small muted">${esc(t('ie.exportFromBooks'))}</p>
        <button class="btn btn-primary" data-all><svg class="i"><use href="#i-download"/></svg>${esc(t('ie.exportAll'))}</button>
      </div>`;
    pane.querySelector('[data-all]').addEventListener('click', () => {
      const rows = [C.EXPORT_COLUMNS.map(c => c[1])];
      for (const b of S.state.books) {
        rows.push(C.EXPORT_COLUMNS.map(([field]) => exportValue(b, field)));
      }
      downloadFile(`amar-pathagar-books-${todayISO()}.csv`, C.serializeCSV(rows), 'text/csv;charset=utf-8');
      S.savePrefs({ lastBackupAt: new Date().toISOString() });
      toast(t('ie.exported'));
      paintReminder();
    });
  }
  function exportValue(b, field) {
    switch (field) {
      case 'authors': return S.bookAuthors(b, 'bn');
      case 'translators': return (b.translators || []).map(id => S.authorLabel(id, 'bn')).join('; ');
      case 'publishers': return S.bookPublishers(b, 'bn');
      case 'primaryGenre': return b.primaryGenre ? S.genreLabel(b.primaryGenre, 'bn') : '';
      case 'tags': return (b.tags || []).join('; ');
      case 'isbn': return b.isbn13 || b.isbn10 || '';
      case 'ownershipStatus': return t('own.' + (b.ownershipStatus || 'owned'));
      case 'readingStatus': return t('status.' + (b.readingStatus || 'to-read'));
      case 'priority': return t('pri.' + (b.priority || 'medium'));
      default: return b[field] ?? '';
    }
  }

  /* ================= JSON BACKUP ================= */
  function paintBackup() {
    const attCount = S.state.attachments.length;
    const attSize = S.state.attachments.reduce((s, a) => s + (a.size || 0), 0);
    pane.innerHTML = `
      <div class="card card-pad">
        <h3 style="margin-top:0">${esc(t('ie.tabBackup'))}</h3>
        <label class="checkbox-row" style="margin-bottom:10px">
          <input type="checkbox" data-withatt ${attCount ? '' : 'disabled'}>
          <span>${esc(t('ie.backupIncludeAtt'))} ${attCount ? `(${esc(fmtNum(attCount, L))} · ${esc(formatBytes(attSize))})` : ''}</span>
        </label>
        <div class="infocard" data-warn style="margin-bottom:14px"></div>
        <div class="btn-row">
          <button class="btn btn-primary" data-go><svg class="i"><use href="#i-download"/></svg>${esc(t('ie.backupNow'))}</button>
        </div>
        <hr class="hairline">
        <div class="field" style="max-width:320px;margin-bottom:0">
          <label>${esc(t('ie.reminderEvery'))}</label>
          <select class="select" data-rem>
            <option value="0" ${!pendingPrefs.reminderDays ? 'selected' : ''}>${esc(t('common.no'))}</option>
            <option value="7" ${pendingPrefs.reminderDays === 7 ? 'selected' : ''}>7 ${esc(t('ie.days'))}</option>
            <option value="30" ${pendingPrefs.reminderDays === 30 ? 'selected' : ''}>30 ${esc(t('ie.days'))}</option>
            <option value="90" ${pendingPrefs.reminderDays === 90 ? 'selected' : ''}>90 ${esc(t('ie.days'))}</option>
          </select>
          <span class="hint">${esc(t('ie.reminderDesc'))}</span>
        </div>
      </div>`;
    const warn = pane.querySelector('[data-warn]');
    const withAtt = pane.querySelector('[data-withatt]');
    const updWarn = () => {
      warn.innerHTML = withAtt.checked && attCount
        ? `<svg class="i"><use href="#i-alert"/></svg><span>${esc(t('ie.backupBigWarn', { size: formatBytes(Math.round(attSize * 1.37)) }))}</span>`
        : `<svg class="i"><use href="#i-info"/></svg><span>${esc(t('ie.backupNoAtt'))}</span>`;
    };
    withAtt.addEventListener('change', updWarn);
    updWarn();
    pane.querySelector('[data-rem]').addEventListener('change', (e) => {
      pendingPrefs.reminderDays = Number(e.target.value);
      S.savePrefs({ backupReminderDays: pendingPrefs.reminderDays });
      toast(t('common.settingsSaved'));
      paintReminder();
    });
    pane.querySelector('[data-go]').addEventListener('click', async () => {
      const includeAtt = withAtt.checked && attCount > 0;
      pane.querySelector('[data-go]').disabled = true;
      try {
        const backup = await buildBackup(includeAtt);
        const name = `amar-pathagar-backup-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;
        downloadFile(name, JSON.stringify(backup), 'application/json');
        S.savePrefs({ lastBackupAt: new Date().toISOString() });
        toast(t('ie.exported'));
        paintReminder();
      } catch (e) { errToast(e); }
      pane.querySelector('[data-go]').disabled = false;
    });
  }

  async function buildBackup(includeAttachments) {
    const data = {
      books: await db.getAll('books'),
      authors: await db.getAll('authors'),
      publishers: await db.getAll('publishers'),
      collections: await db.getAll('collections'),
      sessions: await db.getAll('sessions'),
      journalEntries: await db.getAll('journal'),
      meta: {
        genres: S.state.genres,
        tags: S.state.tags,
        queueOrder: S.state.queueOrder,
        settings: {
          uiLang: S.prefs().uiLang, theme: S.prefs().theme,
          defaultLanguage: S.prefs().defaultLanguage, defaultStatus: S.prefs().defaultStatus,
          defaultView: S.prefs().defaultView, defaultSort: S.prefs().defaultSort,
          goals: S.prefs().goals, backupReminderDays: S.prefs().backupReminderDays,
        },
      },
    };
    const backup = {
      ...BACKUP_SCHEMA,
      exportedAt: new Date().toISOString(),
      counts: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, Array.isArray(v) ? v.length : undefined])),
      attachmentsIncluded: !!includeAttachments,
      data,
    };
    if (includeAttachments) {
      const atts = await db.getAll('attachments');
      backup.attachments = { included: true, items: [] };
      for (const a of atts) {
        const b64 = await blobToBase64(a.blob);
        backup.attachments.items.push({ attachmentId: a.attachmentId, bookId: a.bookId, fileName: a.fileName, mimeType: a.mimeType, size: a.size, addedAt: a.addedAt, dataBase64: b64 });
      }
    }
    return backup;
  }

  /* ================= RESTORE ================= */
  function paintRestore() {
    pane.innerHTML = `
      <div class="card card-pad">
        <h3 style="margin-top:0">${esc(t('ie.tabRestore'))}</h3>
        <div class="dropzone" data-drop>
          <svg class="i" style="width:30px;height:30px"><use href="#i-upload"/></svg>
          <p style="margin:8px 0 0">${esc(t('ie.restoreDrop'))}</p>
          <input type="file" accept=".json,application/json" hidden data-file>
        </div>
        <div data-preview></div>
      </div>`;
    const drop = pane.querySelector('[data-drop]');
    const fileInput = pane.querySelector('[data-file]');
    const prev = pane.querySelector('[data-preview]');
    drop.addEventListener('click', () => fileInput.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('drag');
      const f = e.dataTransfer.files[0]; if (f) readFile(f);
    });
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) readFile(fileInput.files[0]); });

    function readFile(f) {
      const fr = new FileReader();
      fr.onerror = () => toast(t('ie.restoreInvalid'), 'err');
      fr.onload = () => {
        try {
          const backup = JSON.parse(String(fr.result));
          if (backup?.app !== 'amar-pathagar' || !backup?.data) { toast(t('ie.restoreInvalid'), 'err'); return; }
          paintPreview(backup);
        } catch { toast(t('ie.restoreInvalid'), 'err'); }
      };
      fr.readAsText(f, 'utf-8');
    }

    function paintPreview(backup) {
      const d = backup.data;
      const isNewCount = (arr, key) => arr.filter(x => !S.state[mapKey(key)].some(y => y[idOf(key)] === x[idOf(key)])).length;
      const idOf = (key) => key === 'journalEntries' ? 'id' : key === 'sessions' ? 'sessionId' : 'id';
      const mapKey = (key) => key === 'journalEntries' ? 'journal' : key;
      const stores = [
        ['books', t('nav.books')], ['authors', t('nav.authors')], ['publishers', t('nav.publishers')],
        ['collections', t('nav.collections')], ['sessions', t('sess.history')], ['journalEntries', t('nav.journal')],
      ];
      prev.innerHTML = `
        <hr class="hairline">
        <h3>${esc(t('ie.restorePreview'))} <span class="muted small">(${esc((backup.exportedAt || '').slice(0, 10))})</span></h3>
        <table class="map-table" style="max-width:480px">
          <thead><tr><th></th><th>${esc(t('common.new'))}</th><th>${esc(t('common.copy'))}</th></tr></thead>
          <tbody>
            ${stores.map(([k, label]) => `<tr><td>${esc(label)}</td>
              <td>${esc(fmtNum(isNewCount(d[k] || [], k), L))}</td>
              <td>${esc(fmtNum((d[k] || []).length - isNewCount(d[k] || [], k), L))}</td></tr>`).join('')}
          </tbody>
        </table>
        ${backup.attachmentsIncluded ? `<p class="small mt8">${esc(t('ie.backupIncludeAtt'))}: ${esc(fmtNum(backup.attachments?.items?.length || 0, L))}</p>`
          : `<div class="infocard mt8"><svg class="i"><use href="#i-info"/></svg><span>${esc(t('ie.backupNoAtt'))}</span></div>`}
        <div class="field mt16">
          <label>${esc(t('ie.restoreMode'))}</label>
          <label class="checkbox-row"><input type="radio" name="rmode" value="merge" checked><span>${esc(t('ie.modeMerge'))}</span></label>
          <label class="checkbox-row"><input type="radio" name="rmode" value="replace"><span>${esc(t('ie.modeReplace'))}</span></label>
        </div>
        <div class="warncard" data-replace-warn hidden><svg class="i"><use href="#i-alert"/></svg><span>${esc(t('ie.replaceDanger'))}</span></div>
        <div class="btn-row mt16">
          <button class="btn btn-primary" data-go>${esc(t('ie.tabRestore'))}</button>
        </div>`;
      const replaceWarn = prev.querySelector('[data-replace-warn]');
      prev.querySelectorAll('input[name="rmode"]').forEach(r => r.addEventListener('change', () => {
        replaceWarn.hidden = prev.querySelector('input[name="rmode"]:checked').value !== 'replace';
      }));
      prev.querySelector('[data-go]').addEventListener('click', async () => {
        const mode = prev.querySelector('input[name="rmode"]:checked').value;
        if (mode === 'replace') {
          /* safety backup of current data downloads automatically */
          const safety = await buildBackup(false);
          downloadFile(`safety-backup-before-restore-${todayISO()}.json`, JSON.stringify(safety), 'application/json');
          const word = t('st.clearConfirmWord');
          const ok = await confirmDialog({
            title: t('ie.modeReplace'), message: esc(t('ie.replaceDanger')), danger: true,
            okLabel: t('ie.tabRestore'), requireWord: word,
          });
          if (!ok) return;
          await restoreBackup(backup, 'replace');
        } else {
          await restoreBackup(backup, 'merge');
        }
      });
    }
  }

  async function restoreBackup(backup, mode) {
    try {
      if (mode === 'replace') {
        await db.wipeDatabase();
        S.state.genres = []; S.state.tags = []; S.state.queueOrder = [];
      }
      const d = backup.data;
      const now = new Date().toISOString();
      const w = (arr) => arr.map(x => ({ ...x }));
      if (d.authors) await db.bulkPut('authors', w(d.authors));
      if (d.publishers) await db.bulkPut('publishers', w(d.publishers));
      if (d.collections) await db.bulkPut('collections', w(d.collections));
      if (d.books) await db.bulkPut('books', w(d.books));
      if (d.sessions) await db.bulkPut('sessions', w(d.sessions));
      if (d.journalEntries) await db.bulkPut('journal', w(d.journalEntries));
      if (d.meta?.genres) await db.setMeta('genres', d.meta.genres);
      if (d.meta?.tags) await db.setMeta('tags', d.meta.tags);
      if (d.meta?.queueOrder) await db.setMeta('queueOrder', d.meta.queueOrder);
      if (backup.attachments?.included && Array.isArray(backup.attachments.items)) {
        for (const item of backup.attachments.items) {
          const blob = await base64ToBlob(item.dataBase64, item.mimeType);
          await db.put('attachments', { attachmentId: item.attachmentId, bookId: item.bookId, fileName: item.fileName, mimeType: item.mimeType, size: item.size || blob.size, addedAt: item.addedAt || now, blob });
        }
      }
      /* reconcile format↔attachment references: a metadata-only restore keeps
         no files, so dangling references degrade to "known, not linked" */
      {
        const attIds = new Set((await db.getAll('attachments')).map(a => a.attachmentId));
        const allBooks = await db.getAll('books');
        for (const b of allBooks) {
          let dirty = false;
          for (const f of b.formats || []) {
            if (f.attachmentId && !attIds.has(f.attachmentId)) {
              delete f.attachmentId;
              if (f.availabilityStatus === 'attached') f.availabilityStatus = 'known-unlinked';
              dirty = true;
            }
          }
          if (dirty) await db.put('books', b);
        }
      }
      await S.loadAll();
      const n = (d.books?.length || 0) + (d.authors?.length || 0) + (d.sessions?.length || 0) + (d.journalEntries?.length || 0);
      toast(t('ie.restored', { n: fmtNum(n, L) }));
      tab = 'restore';
      paint();
    } catch (e) { errToast(e); }
  }

  /* ================= TEMPLATE ================= */
  function paintTemplate() {
    pane.innerHTML = `
      <div class="card card-pad">
        <h3 style="margin-top:0">${esc(t('ie.tabTemplate'))}</h3>
        <p class="small muted">${esc(t('ie.templateDesc'))}</p>
        <button class="btn btn-primary" data-dl><svg class="i"><use href="#i-download"/></svg>${esc(t('ie.downloadTemplate'))}</button>
        <hr class="hairline">
        <h3>${esc(t('ie.templateCols'))}</h3>
        <div class="tagline" style="margin-top:8px">
          ${Object.entries(C.CSV_FIELDS).slice(0, 40).map(([f, aliases]) => `<span class="tag-pill" title="${esc(aliases.slice(0, 4).join(', '))}">${esc(f)}</span>`).join('')}
        </div>
        <p class="small muted mt8">${esc(t('ie.skipInvalid'))} · ${esc(t('ie.skipDuplicates'))}</p>
      </div>`;
    pane.querySelector('[data-dl]').addEventListener('click', () => {
      downloadFile('amar-pathagar-import-template.csv', C.TEMPLATE_CSV, 'text/csv;charset=utf-8');
      toast(t('ie.exported'));
    });
  }

  paint();
}
