/* আমার পাঠাগার — components.js
   Shared UI: modals, toasts, confirm dialogs, chip inputs, autocomplete,
   stars, covers, pagination, empty states. All user text passes esc(). */

import { esc, uid, truncate, hashStr, bnInitial } from './util.js';
import { t, sub } from './i18n.js';

/* ---------- modal system ---------- */
let openModals = [];
export function openModal({ title, titleEn, body, footer, size = '', onClose = null, onBeforeClose = null, labelId }) {
  const root = document.getElementById('modalRoot');
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" ${labelId ? `aria-labelledby="${labelId}"` : ''}>
      <div class="modal-head">
        <h2 ${labelId ? `id="${labelId}"` : ''}>${esc(title)}${titleEn ? ` <span class="sec-en" style="font-weight:500">${esc(titleEn)}</span>` : ''}</h2>
        <button class="icon-btn" data-close aria-label="${esc(t('a11y.closeModal'))}"><svg class="i"><use href="#i-x"/></svg></button>
      </div>
      <div class="modal-body"></div>
      ${footer !== false ? '<div class="modal-foot"></div>' : ''}
    </div>`;
  const bodyEl = back.querySelector('.modal-body');
  const footEl = back.querySelector('.modal-foot');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);
  if (footer) {
    for (const f of [].concat(footer)) footEl.appendChild(f);
  }

  const rec = { back, onClose, prevFocus: document.activeElement };
  const close = () => {
    if (!openModals.includes(rec)) return;
    if (onBeforeClose && onBeforeClose() === false) return;
    openModals = openModals.filter(m => m !== rec);
    back.remove();
    if (onClose) onClose();
    if (rec.prevFocus && document.contains(rec.prevFocus)) rec.prevFocus.focus();
    document.removeEventListener('keydown', keyH, true);
  };
  rec.close = close;

  back.addEventListener('mousedown', (e) => { if (e.target === back) { e.preventDefault(); } });
  back.addEventListener('click', (e) => { if (e.target === back) close(); });
  back.querySelector('[data-close]').addEventListener('click', close);
  back.querySelectorAll('[data-modal-close]').forEach(b => b.addEventListener('click', close));

  function keyH(e) {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
    else if (e.key === 'Tab') {
      const focusables = back.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (!focusables.length) return;
      const list = [...focusables].filter(n => !n.disabled && n.offsetParent !== null);
      if (!list.length) return;
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }
  document.addEventListener('keydown', keyH, true);

  root.appendChild(back);
  openModals.push(rec);
  const af = bodyEl.querySelector('input, select, textarea, button:not([data-close])');
  setTimeout(() => { (af || back.querySelector('[data-close]')).focus?.(); }, 30);
  return rec;
}
export function activeModal() { return openModals[openModals.length - 1] || null; }

export function confirmDialog({ title, message, okLabel, danger = false, extra = null, requireWord = null }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <p style="margin-top:0">${message}</p>
      ${extra ? '<div class="mt8" data-extra></div>' : ''}
      ${requireWord ? `<div class="field mt8"><label>${esc(t('ie.typeToConfirm', { word: requireWord }))}</label>
        <input class="input" data-word autocomplete="off"></div>` : ''}
    `;
    if (extra) wrap.querySelector('[data-extra]').appendChild(extra);
    const ok = document.createElement('button');
    ok.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    ok.textContent = okLabel || t('common.confirm');
    const cancel = document.createElement('button');
    cancel.className = 'btn btn-ghost';
    cancel.textContent = t('common.cancel');
    let wordOk = !requireWord;
    const wordInput = wrap.querySelector('[data-word]');
    if (wordInput) {
      wordInput.addEventListener('input', () => {
        wordOk = wordInput.value.trim() === requireWord;
        ok.disabled = !wordOk;
      });
    }
    ok.disabled = !wordOk;
    let decided = false;
    ok.addEventListener('click', () => { decided = true; m.close(); resolve(true); });
    cancel.addEventListener('click', () => { decided = true; m.close(); resolve(false); });
    const m = openModal({
      title,
      body: wrap,
      onClose: () => { if (!decided) resolve(false); },
      footer: [cancel, ok],
    });
  });
}

/* ---------- toast ---------- */
export function toast(msg, type = 'ok') {
  const root = document.getElementById('toastRoot');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<svg class="i"><use href="#i-${type === 'err' ? 'alert' : 'check'}"/></svg><span>${esc(msg)}</span>`;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 3400);
}
export function errToast(e) {
  console.error(e);
  const quota = e && (e.quota || e.name === 'QuotaExceededError');
  toast(quota ? t('common.storageFull') : (e?.message ? `${t('common.error')}: ${truncate(e.message, 90)}` : t('common.error')), 'err');
}

/* ---------- stars ---------- */
export function starsDisplay(rating) {
  if (rating == null || rating === '') return '';
  const r = Number(rating);
  const full = Math.floor(r), half = r - full >= 0.25 && r - full < 0.75;
  let html = '<span class="stars" role="img" aria-label="' + esc(t('f.rating')) + ': ' + r + '/5">';
  for (let i = 1; i <= 5; i++) {
    const on = i <= full || (i === full + 1 && half);
    html += `<svg class="i ${on ? '' : 'off'}"><use href="#i-star${on ? '-f' : ''}"/></svg>`;
  }
  return html + '</span>';
}
export function starsInput(value, onChange) {
  const wrap = document.createElement('span');
  wrap.className = 'stars-input';
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', t('f.rating'));
  let cur = value || 0;
  const paint = () => {
    wrap.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = i <= cur ? 'on' : '';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(i === cur));
      b.setAttribute('aria-label', `${i}/5`);
      b.innerHTML = `<svg class="i"><use href="#i-star${i <= cur ? '-f' : ''}"/></svg>`;
      b.addEventListener('click', () => { cur = (cur === i) ? 0 : i; paint(); onChange(cur); });
      wrap.appendChild(b);
    }
    const clear = document.createElement('button');
    clear.type = 'button'; clear.className = 'muted small'; clear.style.marginLeft = '6px';
    clear.textContent = '×';
    clear.setAttribute('aria-label', t('common.clear'));
    clear.addEventListener('click', () => { cur = 0; paint(); onChange(0); });
    wrap.appendChild(clear);
  };
  paint();
  return wrap;
}

/* ---------- status / ownership badges ---------- */
import { t as _t } from './i18n.js';
export function statusBadge(status) {
  if (!status) return '';
  return `<span class="badge b-${esc(status)}"><svg class="i"><use href="#i-${status === 'completed' ? 'completed' : status === 'reading' ? 'reading' : status === 'paused' ? 'pause' : status === 'abandoned' ? 'x' : 'book'}"/></svg>${esc(_t('status.' + status))}</span>`;
}
export function ownBadge(own) {
  if (!own) return '';
  return `<span class="badge b-${esc(own)}">${esc(_t('own.' + own))}</span>`;
}
export function priBadge(p) {
  if (!p || p === 'medium') return '';
  return `<span class="badge b-p-${esc(p)}"><svg class="i"><use href="#i-flag"/></svg>${esc(_t('pri.' + p))}</span>`;
}

/* ---------- cover ---------- */
export function coverHTML(book, { withMarks = true } = {}) {
  const lv = hashStr(book.id || book.titleBn || 'x') % 6;
  const letter = esc(bnInitial(book.titleBn || book.titleEn || book.transliteratedTitle || '•'));
  const marks = [];
  if (withMarks) {
    for (const f of book.formats || []) {
      if (f.type === 'pdf' || f.type === 'epub' || f.type === 'audiobook' || f.type === 'ebook-other') {
        marks.push(`<span class="fm" title="${esc(_t('fmt.' + f.type))}"><svg class="i"><use href="#i-${f.type === 'audiobook' ? 'audio' : 'file'}"/></svg></span>`);
      }
    }
    if ((book.physicalCopyCount || 0) > 0 || (book.formats || []).some(f => f.type === 'physical')) {
      marks.unshift(`<span class="fm" title="${esc(_t('fmt.physical'))}"><svg class="i"><use href="#i-book"/></svg></span>`);
    }
  }
  const img = book.coverDataUrl
    ? `<img src="${book.coverDataUrl}" alt="" loading="lazy">`
    : `<span class="letter">${letter}</span><span class="spine" aria-hidden="true"></span>`;
  return `<div class="bcover lv-${lv}">${img}${marks.length && withMarks ? `<span class="fmt-marks">${marks.join('')}</span>` : ''}</div>`;
}

/* ---------- empty state ---------- */
export function emptyState({ icon = 'books', title, body, actions = [] }) {
  const el = document.createElement('div');
  el.className = 'empty';
  el.innerHTML = `
    <div class="empty-ic"><svg class="i"><use href="#i-${icon}"/></svg></div>
    <h3>${esc(title)}</h3>
    <p>${esc(body)}</p>
    <div class="btn-row"></div>`;
  const row = el.querySelector('.btn-row');
  for (const a of (Array.isArray(actions) ? actions : actions ? [actions] : [])) row.appendChild(a);
  return el;
}

/* ---------- pagination ---------- */
export function pager(total, page, size, onPage) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return document.createDocumentFragment();
  const el = document.createElement('nav');
  el.className = 'pager';
  el.setAttribute('aria-label', 'Pagination');
  const mk = (label, p, cur = false, disabled = false, aria = label) => {
    const b = document.createElement('button');
    b.innerHTML = label; b.disabled = disabled; b.setAttribute('aria-label', aria);
    if (cur) b.className = 'cur';
    b.addEventListener('click', () => { if (!disabled) onPage(p); });
    return b;
  };
  const dots = '<span class="pg-info">…</span>';
  const pageNums = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) pageNums.push(p);
  }
  el.appendChild(mk(`<svg class="i sm"><use href="#i-chev-l"/></svg>`, page - 1, false, page <= 1, t('common.back')));
  let last = 0;
  for (const p of pageNums) {
    if (p - last > 1) el.insertAdjacentHTML('beforeend', dots);
    el.appendChild(mk(String(p), p, p === page));
    last = p;
  }
  if (pages - last > 1) el.insertAdjacentHTML('beforeend', dots);
  el.appendChild(mk(`<svg class="i sm"><use href="#i-chev-r"/></svg>`, page + 1, false, page >= pages, 'Next'));
  return el;
}

/* ---------- chip input (tags, alternate titles) ---------- */
export function chipInput({ items = [], suggestions = [], placeholder = '', onChange, allowDuplicates = false }) {
  const box = document.createElement('div');
  box.className = 'chips-box';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  let vals = [...items];
  const paint = () => {
    box.querySelectorAll('.chip').forEach(c => c.remove());
    for (const v of vals) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `<span>${esc(v)}</span><button type="button" class="chip-x" aria-label="${esc(t('common.remove'))}"><svg class="i"><use href="#i-x"/></svg></button>`;
      chip.querySelector('button').addEventListener('click', () => {
        vals = vals.filter(x => x !== v); paint(); onChange?.(vals);
      });
      box.insertBefore(chip, input);
    }
  };
  const commit = () => {
    const v = input.value.trim().replace(/,+$/, '');
    if (v) {
      for (const part of v.split(',').map(s => s.trim()).filter(Boolean)) {
        if (allowDuplicates || !vals.includes(part)) vals.push(part);
      }
      input.value = ''; paint(); onChange?.(vals);
    }
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); }
    else if (e.key === 'Backspace' && !input.value && vals.length) { vals.pop(); paint(); onChange?.(vals); }
  });
  input.addEventListener('blur', commit);
  box.addEventListener('click', (e) => { if (e.target === box) input.focus(); });
  box.appendChild(input);
  paint();
  box._set = (v) => { vals = [...v]; paint(); };
  box._get = () => vals;
  box._suggestions = suggestions;
  return box;
}

/* ---------- autocomplete attach (authors, publishers) ---------- */
export function attachAutocomplete({ input, menu, getOptions, renderOption, onPick }) {
  let hl = -1, current = [];
  const show = () => {
    const q = input.value.trim();
    current = getOptions(q).slice(0, 8);
    if (!current.length) { menu.classList.remove('open'); menu.innerHTML = ''; return; }
    menu.innerHTML = current.map((o, i) => renderOption(o, i)).join('');
    menu.classList.add('open');
    hl = -1;
    menu.querySelectorAll('.ac-item').forEach((n, i) => {
      n.addEventListener('mousedown', (e) => { e.preventDefault(); pick(i); });
    });
  };
  const pick = (i) => {
    const o = current[i];
    if (!o) return;
    menu.classList.remove('open');
    input.value = '';
    onPick(o);
  };
  input.addEventListener('input', show);
  input.addEventListener('focus', show);
  input.addEventListener('blur', () => setTimeout(() => menu.classList.remove('open'), 120));
  input.addEventListener('keydown', (e) => {
    if (!menu.classList.contains('open')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); hl = Math.min(hl + 1, current.length - 1); hlMenu(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); hl = Math.max(hl - 1, 0); hlMenu(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (hl >= 0) pick(hl); else if (current.length === 1) pick(0); }
    else if (e.key === 'Escape') menu.classList.remove('open');
  });
  const hlMenu = () => {
    menu.querySelectorAll('.ac-item').forEach((n, i) => n.classList.toggle('hl', i === hl));
  };
  return { refresh: show, close: () => menu.classList.remove('open') };
}

/* ---------- id-based chips with autocomplete (form field) ---------- */
export function idChipField({ items, suggestions, placeholder, labelCreate, getId, newLabel }) {
  /* items: array of ids; suggestions: array or () => array of {id, label, sub} */
  const wrap = document.createElement('div');
  wrap.className = 'ac-wrap';
  const box = document.createElement('div');
  box.className = 'chips-box';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder;
  const menu = document.createElement('div');
  menu.className = 'ac-menu';
  let ids = [...items];
  const labelMap = new Map();   // id → label (stable for pending/unsaved items)
  const suggOf = () => (typeof suggestions === 'function' ? suggestions() : suggestions);
  for (const id of ids) {
    const s = suggOf().find(x => getId(x) === id);
    if (s) labelMap.set(id, s.label);
  }
  function paint() {
    box.querySelectorAll('.chip').forEach(c => c.remove());
    for (const id of ids) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `<span>${esc(labelMap.get(id) || id)}</span><button type="button" class="chip-x" aria-label="${esc(t('common.remove'))}"><svg class="i"><use href="#i-x"/></svg></button>`;
      chip.querySelector('button').addEventListener('click', () => { ids = ids.filter(x => x !== id); paint(); });
      box.insertBefore(chip, input);
    }
  }
  const ac = attachAutocomplete({
    input, menu,
    getOptions: (q) => suggOf().filter(s => !ids.includes(getId(s))),
    renderOption: (o) => `<span>${esc(o.label)}</span>${o.sub ? `<span class="ac-sub">${esc(o.sub)}</span>` : ''}`,
    onPick: (o) => { ids.push(getId(o)); labelMap.set(getId(o), o.label); paint(); },
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value.trim();
      if (!v || menu.classList.contains('open') && menu.querySelector('.ac-item')) return;
      const created = newLabel(v);
      if (created) { ids.push(getId(created)); labelMap.set(getId(created), created.label || v); paint(); input.value = ''; }
    }
  });
  box.addEventListener('click', (e) => { if (e.target === box) input.focus(); });
  box.appendChild(input);
  wrap.appendChild(box);
  wrap.appendChild(menu);
  paint();
  return {
    el: wrap,
    get: () => ids,
    set: (v) => {
      ids = [...v];
      for (const id of ids) {
        if (!labelMap.has(id)) {
          const s = suggOf().find(x => getId(x) === id);
          if (s) labelMap.set(id, s.label);
        }
      }
      paint();
    },
  };
}

/* ---------- progress ---------- */
export function progressHTML(pct) {
  if (pct == null) return `<div class="progress-row"><div class="progress na"><span style="width:100%"></span></div><span>${esc(t('sess.progressUnknown'))}</span></div>`;
  const p = Math.round(pct);
  return `<div class="progress-row"><div class="progress"><span style="width:${p}%"></span></div><span>${p}%</span></div>`;
}

/* ---------- helpers for forms ---------- */
export function fieldRow(labelKey, control, { req = false, hint = null, id = null } = {}) {
  const el = document.createElement('div');
  el.className = 'field';
  const lab = document.createElement('label');
  if (id) { lab.htmlFor = id; control.id = id; }
  lab.innerHTML = `${esc(t(labelKey))}${req ? ' <span class="req">*</span>' : ''}`;
  el.appendChild(lab);
  if (control.nodeType) el.appendChild(control);
  else el.insertAdjacentHTML('beforeend', control);
  if (hint) el.insertAdjacentHTML('beforeend', `<span class="hint">${esc(hint)}</span>`);
  return el;
}

export function selectEl(options, value, attrs = '') {
  const sel = document.createElement('select');
  sel.className = 'select';
  if (attrs) sel.setAttribute('aria-label', attrs);
  for (const o of options) {
    const opt = document.createElement('option');
    opt.value = o.value;
    opt.textContent = o.label;
    if (o.value === value) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}
