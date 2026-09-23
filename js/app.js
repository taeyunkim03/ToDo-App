import * as store from './store.js';
import * as sync from './sync.js';
import * as holidayFeed from './holiday-feed.js';
import {
  MONTHS, monthWeeks, todayKey, toKey, addDays, fromKey, dayTitle, shortDate, monthDay,
  ordinalSuffix, isKey, WEEKDAYS
} from './dates.js';
import { PALETTE, NEUTRALS, tintFor, isLight, needsOutline } from './palette.js';
import { holidaysOn, holidayLabel } from './holidays.js';
import {
  defaultRule, anchorYearly, cleanRule, sameRule, ruleIsValid, nextDates, describeRule, toLunar, lunarAvailable
} from './repeat.js';

// ---------- DOM helpers ----------

const $ = (selector, root = document) => root.querySelector(selector);
const cls = (...names) => names.filter(Boolean).join(' ');

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'style') {
      for (const [prop, v] of Object.entries(value)) el.style.setProperty(prop, v);
    } else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

const ICONS = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  note: '<svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h10"/></svg>',
  repeat: '<svg class="meta-icon" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></svg>',
  grip: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>'
};

function icon(name) {
  const t = document.createElement('template');
  t.innerHTML = ICONS[name];
  return t.content.firstChild;
}

// ---------- Elements and state ----------

const els = {
  views: {
    login: $('#view-login'),
    main: $('#view-main'),
    categories: $('#view-categories'),
    settings: $('#view-settings')
  },
  loginForm: $('#login-form'),
  loginEmail: $('#login-email'),
  loginPassword: $('#login-password'),
  loginError: $('#login-error'),
  loginSubmit: $('#login-submit'),
  loginSwitch: $('#login-switch'),
  loginLead: $('#login-lead'),
  syncChip: $('#sync-chip'),
  calendar: $('#calendar'),
  monthTitle: $('#month-title'),
  grid: $('#cal-grid'),
  prev: $('#prev-month'),
  next: $('#next-month'),
  todayBtn: $('#today-btn'),
  dayTitle: $('#day-title'),
  daySummary: $('#day-summary'),
  dayHoliday: $('#day-holiday'),
  groups: $('#groups'),
  someday: $('#someday'),
  somedayCount: $('#someday-count'),
  somedayList: $('#someday-list'),
  somedayAdd: $('#someday-add'),
  catList: $('#cat-list'),
  catEditor: $('#cat-editor'),
  newCat: $('#new-category'),
  toggleUs: $('#toggle-us'),
  toggleKr: $('#toggle-kr'),
  syncStatus: $('#sync-status'),
  syncNow: $('#sync-now'),
  accountEmail: $('#account-email'),
  logout: $('#logout'),
  dialog: $('#task-dialog'),
  form: $('#task-form'),
  dialogTitle: $('#task-dialog-title'),
  sheetMain: $('#sheet-main'),
  sheetScope: $('#sheet-scope'),
  scopeText: $('#scope-text'),
  fTitle: $('#f-title'),
  fNote: $('#f-note'),
  fCats: $('#f-categories'),
  fDate: $('#f-date'),
  fDateRow: $('#f-date').closest('.date-row'),
  repeatCard: $('#repeat-card'),
  toast: $('#toast')
};

const firstDay = todayKey();
const ui = {
  signedIn: false,
  email: '',
  loginMode: 'signin',
  view: 'login',
  today: firstDay,
  selected: firstDay,
  year: fromKey(firstDay).getFullYear(),
  month: fromKey(firstDay).getMonth(),
  addingIn: null,
  addingSomeday: false,
  editingCategory: null
};

let sheet = null;
let sortables = [];

const config = window.TODO_CONFIG || {};
const client = window.supabase && config.supabaseUrl
  ? window.supabase.createClient(config.supabaseUrl, config.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  })
  : null;
sync.init(client);

// ---------- Rendering ----------

function holidayOptions() {
  const s = store.settings();
  return { us: s.showUs !== false, kr: s.showKr !== false, fetched: store.krHolidays() };
}

function visibleItems(list) {
  return list.filter((i) => store.getCategory(i.categoryId));
}

function focusSelector() {
  const a = document.activeElement;
  if (!a || a === document.body) return null;
  const cell = a.closest('.cell');
  if (cell) return `.cell[data-key="${cell.dataset.key}"]`;
  const task = a.closest('.task');
  if (task) return `.task[data-id="${task.dataset.id}"] .${a.classList.contains('check') ? 'check' : 'title'}`;
  const swatch = a.closest('.swatch');
  if (swatch) return `.swatch[data-color="${swatch.dataset.color}"]`;
  const row = a.closest('.cat-row');
  if (row) return `.cat-row[data-id="${row.dataset.id}"] .cat-select`;
  if (a.id) return `#${a.id}`;
  return null;
}

function render() {
  if (!ui.signedIn || !store.isOpen()) return;
  const restore = focusSelector();
  destroySortables();
  if (ui.view === 'main') {
    renderCalendar();
    renderDay();
    renderSomeday();
  } else if (ui.view === 'categories') {
    renderCategories();
  } else if (ui.view === 'settings') {
    renderSettings();
  }
  renderSyncChip();
  makeSortables();
  if (restore && (!document.activeElement || document.activeElement === document.body)) {
    const el = document.querySelector(restore);
    if (el) el.focus({ preventScroll: true });
  }
}

// Calendar

function renderCalendar() {
  els.monthTitle.textContent = `${MONTHS[ui.month]} ${ui.year}`;
  const weeks = monthWeeks(ui.year, ui.month);
  const first = weeks[0][0].key;
  const last = weeks[weeks.length - 1][6].key;
  const items = store.itemsBetween(first, last);
  const cats = store.categories();
  const options = holidayOptions();
  if (options.kr) holidayFeed.ensureYears([Number(first.slice(0, 4)), Number(last.slice(0, 4))]);
  const cells = [];
  for (const week of weeks) {
    for (const day of week) cells.push(dayCell(day, visibleItems(items.get(day.key) || []), cats, options));
  }
  els.grid.replaceChildren(...cells);
}

function dayCell(day, items, cats, options) {
  const dots = [];
  for (const c of cats) {
    if (dots.length === 4) break;
    const mine = items.filter((i) => i.categoryId === c.id);
    if (!mine.length) continue;
    dots.push(h('span', {
      class: cls('dot', needsOutline(c.color) && 'is-outlined', mine.every((i) => i.done) && 'is-done'),
      style: { background: c.color }
    }));
  }
  const holidays = holidaysOn(day.key, options);
  const done = items.filter((i) => i.done).length;
  const d = day.date;
  const isToday = day.key === ui.today;
  const isSelected = day.key === ui.selected;
  let label = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  if (holidays.length) label += `, ${holidayLabel(holidays)}`;
  if (items.length) label += `, ${done} of ${items.length} done`;
  return h('button', {
    type: 'button',
    class: cls('cell', !day.inMonth && 'is-outside', holidays.length && 'is-holiday',
      isToday && 'is-today', isSelected && 'is-selected'),
    'aria-label': label,
    'aria-pressed': String(isSelected),
    'aria-current': isToday ? 'date' : null,
    tabindex: isSelected ? '0' : '-1',
    dataset: { key: day.key }
  }, h('span', { class: 'num', text: String(d.getDate()) }), h('span', { class: 'dots' }, dots));
}

function refreshCell(key) {
  const old = els.grid.querySelector(`.cell[data-key="${key}"]`);
  if (!old) return;
  const date = fromKey(key);
  old.replaceWith(dayCell({ key, date, inMonth: date.getMonth() === ui.month },
    visibleItems(store.dayItems(key)), store.categories(), holidayOptions()));
}

// Selected day

function renderDay() {
  els.dayTitle.textContent = dayTitle(ui.selected, ui.today);
  const holidays = holidaysOn(ui.selected, holidayOptions());
  els.dayHoliday.hidden = !holidays.length;
  els.dayHoliday.textContent = holidayLabel(holidays);
  const items = visibleItems(store.dayItems(ui.selected));
  updateSummary(items);
  const cats = store.categories();
  if (!cats.length) {
    els.groups.replaceChildren(h('div', { class: 'empty' },
      h('p', { text: 'Add a category to start planning your days.' }),
      h('a', { class: 'solid-btn', href: '#categories', text: 'Add a category' })));
    return;
  }
  els.groups.replaceChildren(...cats.map((c) => groupEl(c, items.filter((i) => i.categoryId === c.id))));
  if (ui.addingIn) {
    const input = $('#add-input');
    if (input) input.focus();
  }
}

function updateSummary(items = visibleItems(store.dayItems(ui.selected))) {
  const done = items.filter((i) => i.done).length;
  els.daySummary.textContent = items.length ? `${done} of ${items.length} done` : 'Nothing planned';
}

function groupStyle(c) {
  const outlined = needsOutline(c.color);
  return {
    '--c': c.color,
    '--tint': tintFor(c.color),
    '--border': outlined ? '#C9C7C1' : c.color,
    '--check': isLight(c.color) ? '#1D1D1F' : '#FFFFFF'
  };
}

function groupEl(c, items) {
  const list = h('ul', { class: 'tasks', 'aria-label': c.name, dataset: { categoryId: c.id } }, items.map(itemRow));
  return h('section', { class: 'group', style: groupStyle(c) },
    h('div', { class: 'group-head' },
      h('span', { class: 'chip' },
        h('span', { class: cls('chip-dot', needsOutline(c.color) && 'is-outlined') }),
        h('span', { class: 'chip-name', text: c.name })),
      h('button', {
        type: 'button', class: 'icon-btn add-btn', 'aria-label': `Add a task to ${c.name}`, onclick: () => openAdd(c.id)
      }, icon('plus'))),
    list,
    ui.addingIn === c.id ? addRow(c) : null);
}

function itemRow(item) {
  const someday = item.kind === 'someday';
  // Someday rows aren't inside a category group, so they carry its colors themselves.
  const category = someday ? store.getCategory(item.categoryId) : null;
  return h('li', {
    class: cls('task', item.done && 'is-done'),
    dataset: { id: item.id, kind: item.kind },
    style: category ? groupStyle(category) : null
  },
    h('button', {
      type: 'button',
      class: 'check',
      role: 'checkbox',
      'aria-checked': String(item.done),
      'aria-label': item.title,
      onclick: () => (someday ? store.toggleSomeday(item.id, ui.selected) : store.toggleItem(item))
    }, h('span', { class: 'box' }, icon('check'))),
    h('button', { type: 'button', class: 'title', onclick: () => openSheet(item) },
      h('span', { text: item.title }),
      item.repeat ? icon('repeat') : null,
      item.note ? icon('note') : null));
}

// Quick add

function openAdd(categoryId) {
  if (ui.addingIn === categoryId) {
    const input = $('#add-input');
    if (input) input.focus();
    return;
  }
  ui.addingIn = categoryId;
  ui.addingSomeday = false;
  render();
}

function closeAdd(row) {
  ui.addingIn = null;
  row.remove();
}

// Add without redrawing so the keyboard stays open for the next task.
function quickAdd(c, title, row) {
  const task = store.addTask(c.id, ui.selected, title, { silent: true });
  row.previousElementSibling.append(itemRow({
    kind: 'task', id: task.id, date: task.date, title: task.title, note: '', categoryId: c.id,
    done: false, sortOrder: task.sortOrder, repeat: false
  }));
  refreshCell(ui.selected);
  updateSummary();
  renderSyncChip();
}

function addRow(c) {
  const input = h('input', {
    id: 'add-input', class: 'add-input', type: 'text', placeholder: 'New task',
    'aria-label': `New task in ${c.name}`, autocomplete: 'off', enterkeyhint: 'done'
  });
  const row = h('div', { class: 'add-row' },
    h('span', { class: 'check-slot', 'aria-hidden': 'true' }, h('span', { class: 'box is-ghost' })),
    input);

  input.addEventListener('keydown', (e) => {
    // Korean input fires Enter while a syllable is still being composed.
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const title = input.value.trim();
      input.value = '';
      if (title) quickAdd(c, title, row);
      else closeAdd(row);
    } else if (e.key === 'Escape') {
      input.value = '';
      closeAdd(row);
    }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!input.isConnected || ui.addingIn !== c.id) return;
      const title = input.value.trim();
      input.value = '';
      if (title) quickAdd(c, title, row);
      closeAdd(row);
    }, 0);
  });
  return row;
}

// Someday

function renderSomeday() {
  const cats = store.categories();
  els.someday.hidden = !cats.length;
  if (!cats.length) {
    ui.addingSomeday = false;
    return;
  }
  const items = store.somedayOn(ui.selected);
  updateSomedayCount(items);
  els.somedayList.replaceChildren(...items.map(itemRow));
  els.somedayAdd.replaceChildren(ui.addingSomeday ? somedayAddRow() : somedayAddButton());
  if (ui.addingSomeday) {
    const input = $('#someday-input');
    if (input) input.focus();
  }
}

function updateSomedayCount(items = store.somedayOn(ui.selected)) {
  const waiting = items.filter((i) => !i.done).length;
  els.somedayCount.textContent = waiting ? `${waiting} waiting` : '';
}

function somedayAddButton() {
  return h('button', { type: 'button', class: 'someday-add', onclick: openSomedayAdd },
    icon('plus'), h('span', { text: 'Add a someday task' }));
}

function openSomedayAdd() {
  ui.addingIn = null;
  ui.addingSomeday = true;
  render();
}

function closeSomedayAdd(row) {
  ui.addingSomeday = false;
  row.replaceWith(somedayAddButton());
}

// Add without redrawing so the keyboard stays open for the next task.
// Adding on a past day starts it that day. Adding on a future day starts it today.
function somedayQuickAdd(categoryId, title) {
  const addedOn = ui.selected < ui.today ? ui.selected : ui.today;
  const s = store.addSomeday(categoryId, title, addedOn, { silent: true });
  els.somedayList.append(itemRow({
    kind: 'someday', id: s.id, title: s.title, note: '', categoryId, done: false, sortOrder: s.sortOrder
  }));
  updateSomedayCount();
  renderSyncChip();
}

function somedayAddRow() {
  let categoryId = store.somedayCategory();
  // Set while the chip is being tapped, so the input's blur doesn't close the row.
  let chipTap = false;
  const input = h('input', {
    id: 'someday-input', class: 'add-input', type: 'text', placeholder: 'New someday task',
    autocomplete: 'off', enterkeyhint: 'done'
  });
  const chip = h('button', { type: 'button', class: 'someday-chip' });
  const row = h('div', { class: 'add-row someday-add-row' }, chip, input);

  const showCategory = () => {
    const c = store.getCategory(categoryId);
    for (const [prop, value] of Object.entries(groupStyle(c))) row.style.setProperty(prop, value);
    chip.setAttribute('aria-label', `Category ${c.name}, tap to change`);
    input.setAttribute('aria-label', `New someday task in ${c.name}`);
    chip.replaceChildren(h('span', { class: 'chip' },
      h('span', { class: cls('chip-dot', needsOutline(c.color) && 'is-outlined') }),
      h('span', { class: 'chip-name', text: c.name })));
  };
  showCategory();

  // Keep focus in the input so the keyboard stays up. preventDefault covers
  // desktop browsers, and the flag covers iOS Safari, which can still move focus.
  chip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    chipTap = true;
  });
  chip.addEventListener('mousedown', (e) => e.preventDefault());
  chip.addEventListener('pointercancel', () => {
    chipTap = false;
  });
  chip.addEventListener('click', () => {
    const cats = store.categories();
    const i = cats.findIndex((c) => c.id === categoryId);
    categoryId = cats[(i + 1) % cats.length].id;
    store.setSomedayCategory(categoryId);
    showCategory();
    chipTap = false;
    input.focus();
  });

  input.addEventListener('keydown', (e) => {
    // Korean input fires Enter while a syllable is still being composed.
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      const title = input.value.trim();
      input.value = '';
      if (title) somedayQuickAdd(categoryId, title);
      else closeSomedayAdd(row);
    } else if (e.key === 'Escape') {
      input.value = '';
      closeSomedayAdd(row);
    }
  });

  // Leaving the row saves any typed text and closes it. Moving between the
  // input and the chip, by tap or keyboard, keeps it open.
  const onLeave = () => {
    setTimeout(() => {
      if (!row.isConnected || !ui.addingSomeday) return;
      if (chipTap || row.contains(document.activeElement)) return;
      const title = input.value.trim();
      input.value = '';
      if (title) somedayQuickAdd(categoryId, title);
      closeSomedayAdd(row);
    }, 0);
  };
  input.addEventListener('blur', onLeave);
  chip.addEventListener('blur', onLeave);
  return row;
}

// Categories

function renderCategories() {
  const cats = store.categories();
  if (!cats.some((c) => c.id === ui.editingCategory)) ui.editingCategory = cats[0] ? cats[0].id : null;
  els.catList.replaceChildren(...cats.map(catRow));
  els.catList.hidden = !cats.length;
  renderEditor(store.getCategory(ui.editingCategory));
}

function catRow(c) {
  const count = store.itemCount(c.id);
  const selected = c.id === ui.editingCategory;
  return h('li', { class: cls('cat-row', selected && 'is-selected'), dataset: { id: c.id } },
    h('span', { class: 'handle', title: 'Drag to reorder', 'aria-hidden': 'true' }, icon('grip')),
    h('button', {
      type: 'button',
      class: 'cat-select',
      'aria-pressed': String(selected),
      onclick: () => {
        ui.editingCategory = c.id;
        render();
      }
    },
    h('span', { class: cls('cat-dot', needsOutline(c.color) && 'is-outlined'), style: { background: c.color } }),
    h('span', { class: 'cat-name', text: c.name }),
    h('span', { class: 'cat-count', text: count === 1 ? '1 task' : `${count} tasks` })));
}

function renderEditor(c) {
  if (!c) {
    els.catEditor.replaceChildren(h('p', { class: 'field-label', text: 'Add a category to choose its name and color.' }));
    return;
  }
  const name = h('input', { id: 'cat-name', class: 'name-input', type: 'text', value: c.name, autocomplete: 'off' });
  const preview = h('span', { class: 'chip-name', text: c.name });
  const showName = (text) => {
    preview.textContent = text || 'Untitled';
    const label = els.catList.querySelector(`.cat-row[data-id="${c.id}"] .cat-name`);
    if (label) label.textContent = text || 'Untitled';
  };
  name.addEventListener('input', () => {
    store.updateCategory(c.id, { name: name.value }, { silent: true });
    showName(name.value);
    renderSyncChip();
  });
  name.addEventListener('change', () => {
    const value = name.value.trim() || 'Untitled';
    name.value = value;
    store.updateCategory(c.id, { name: value }, { silent: true });
    showName(value);
  });
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) name.blur();
  });

  const rows = PALETTE.map((row) => paletteRow(row.hue,
    row.shades.map((color, i) => ({ color, label: `${row.hue}, shade ${i + 1} of 5` })), c));
  rows.push(paletteRow('Neutral', NEUTRALS.map((n) => ({ color: n.color, label: n.name })), c));

  els.catEditor.replaceChildren(
    h('label', { class: 'field-label', for: 'cat-name', text: 'Name' }),
    name,
    h('div', { class: 'divider' }),
    h('div', { class: 'editor-color-head' },
      h('h2', { text: 'Color' }),
      h('span', { class: 'chip', style: { '--c': c.color, '--tint': tintFor(c.color) } },
        h('span', { class: cls('chip-dot', needsOutline(c.color) && 'is-outlined') }),
        preview)),
    h('div', { class: 'palette', role: 'group', 'aria-label': 'Color' }, rows),
    h('div', { class: 'divider' }),
    h('button', { type: 'button', class: 'danger-btn', onclick: () => removeCategory(c) }, 'Delete category'));
}

function paletteRow(hue, swatches, c) {
  return h('div', { class: 'palette-row' },
    h('span', { class: 'hue', 'aria-hidden': 'true', text: hue }),
    swatches.map((s) => h('button', {
      type: 'button',
      class: cls('swatch', needsOutline(s.color) && 'is-outlined'),
      'aria-label': s.label,
      'aria-pressed': String(s.color === c.color),
      dataset: { color: s.color },
      onclick: () => store.updateCategory(c.id, { color: s.color })
    }, h('span', { style: { background: s.color } }))));
}

function removeCategory(c) {
  const count = store.itemCount(c.id);
  const message = count
    ? `Delete "${c.name}" and its ${count === 1 ? '1 task' : `${count} tasks`}?`
    : `Delete "${c.name}"?`;
  if (!confirm(message)) return;
  store.deleteCategory(c.id);
  showToast('Category deleted');
}

// Settings

function renderSettings() {
  const s = store.settings();
  els.toggleUs.setAttribute('aria-checked', String(s.showUs !== false));
  els.toggleKr.setAttribute('aria-checked', String(s.showKr !== false));
  els.accountEmail.textContent = ui.email || 'This device';
  renderSyncStatus();
}

function syncText(s) {
  const pending = s.pending === 1 ? '1 change' : `${s.pending} changes`;
  if (!s.online) return s.pending ? `Offline. ${pending} will sync when you're back online.` : 'Offline';
  if (s.syncing) return 'Syncing';
  if (s.error) return `Couldn't sync. ${s.error}`;
  if (s.pending) return `${pending} waiting to sync`;
  if (s.lastSynced) {
    const t = new Date(s.lastSynced);
    return `Up to date as of ${t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  return 'Waiting for the first sync';
}

function renderSyncStatus() {
  els.syncStatus.textContent = syncText(sync.status());
}

function renderSyncChip() {
  const s = sync.status();
  let text = '';
  if (!s.online) text = 'Offline';
  else if (s.error) text = 'Sync issue';
  else if (s.pending && s.syncing) text = 'Syncing';
  els.syncChip.hidden = !text || ui.view !== 'main';
  els.syncChip.textContent = text;
  els.syncChip.classList.toggle('is-error', Boolean(s.online && s.error));
}

sync.onStatus(() => {
  renderSyncChip();
  if (ui.view === 'settings') renderSyncStatus();
});

els.toggleUs.addEventListener('click', () => store.updateSettings({ showUs: !(store.settings().showUs !== false) }));
els.toggleKr.addEventListener('click', () => store.updateSettings({ showKr: !(store.settings().showKr !== false) }));
els.syncNow.addEventListener('click', () => {
  if (!navigator.onLine) showToast('You are offline. Changes will sync when you reconnect.');
  sync.syncNow();
});

// ---------- Drag and drop ----------

function makeSortables() {
  const Sortable = window.Sortable;
  if (!Sortable) return;
  const common = { animation: 150, chosenClass: 'is-chosen', ghostClass: 'is-ghost-row' };
  // Long press to drag on touch, and a tap on the checkbox never starts a drag.
  const rows = { ...common, delay: 200, delayOnTouchOnly: true, touchStartThreshold: 5, filter: '.check', preventOnFilter: false };
  if (ui.view === 'main') {
    els.groups.querySelectorAll('ul.tasks').forEach((ul) => {
      sortables.push(Sortable.create(ul, { ...rows, group: 'tasks', onEnd: onItemDrop }));
    });
    // Its own group, so items can't move between Someday and the day's categories.
    if (!els.someday.hidden) {
      sortables.push(Sortable.create(els.somedayList, { ...rows, group: 'someday', onEnd: onSomedayDrop }));
    }
  } else if (ui.view === 'categories' && !els.catList.hidden) {
    sortables.push(Sortable.create(els.catList, {
      ...common,
      handle: '.handle',
      onEnd: () => {
        const ids = [...els.catList.children].map((li) => li.dataset.id);
        setTimeout(() => store.reorderCategories(ids), 0);
      }
    }));
  }
}

function destroySortables() {
  sortables.forEach((s) => s.destroy());
  sortables = [];
}

function onItemDrop(evt) {
  if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;
  const lists = evt.from === evt.to ? [evt.to] : [evt.from, evt.to];
  const groups = lists.map((ul) => ({
    categoryId: ul.dataset.categoryId,
    items: [...ul.children].map((li) => ({ kind: li.dataset.kind, id: li.dataset.id }))
  }));
  setTimeout(() => store.applyOrder(ui.selected, groups), 0);
}

function onSomedayDrop(evt) {
  if (evt.oldIndex === evt.newIndex) return;
  const ids = [...els.somedayList.children].map((li) => li.dataset.id);
  setTimeout(() => store.reorderSomeday(ids), 0);
}

// ---------- Task sheet ----------

function openSheet(item) {
  const someday = item.kind === 'someday';
  // Someday tasks have no date. The selected day stands in for the hidden
  // date and repeat controls and is never saved.
  if (someday) item = { ...item, date: ui.selected };
  const routine = item.kind === 'occ' ? store.getRoutine(item.routineId) : null;
  if (item.kind === 'occ' && !routine) return;
  sheet = {
    item,
    routine,
    freq: routine ? routine.rule.freq : 'never',
    rule: routine ? cleanRule(routine.rule) : null,
    ruleFresh: !routine,
    endMode: routine && routine.endDate ? 'date' : 'never',
    endDate: routine && routine.endDate ? routine.endDate : addDays(item.date, 90),
    scope: null
  };

  els.dialogTitle.textContent = someday ? 'Edit someday task' : routine ? 'Edit repeating task' : 'Edit task';
  els.fTitle.value = item.title;
  els.fNote.value = item.note || '';
  els.fDate.value = item.date;
  els.fCats.replaceChildren(...store.categories().map((c) =>
    h('label', { class: 'chip-option', style: { '--c': c.color, '--tint': tintFor(c.color) } },
      h('input', { type: 'radio', name: 'category', value: c.id, checked: c.id === item.categoryId }),
      h('span', { class: 'pill' },
        h('span', { class: cls('chip-dot', needsOutline(c.color) && 'is-outlined') }),
        h('span', { text: c.name })))));
  $('[data-action="skip"]', els.form).hidden = !routine;
  // Reset every time, so a normal task opened after a someday one shows everything.
  els.fDateRow.hidden = someday;
  els.fDateRow.previousElementSibling.hidden = someday;
  els.repeatCard.hidden = someday;
  $('[data-action="tomorrow"]', els.form).hidden = someday;
  showScope(null);
  renderRepeat();
  els.dialog.showModal();
  els.sheetMain.scrollTop = 0;
}

function readForm() {
  const data = new FormData(els.form);
  const date = String(data.get('date') || '');
  return {
    title: String(data.get('title') || '').trim(),
    note: String(data.get('note') || '').trim(),
    categoryId: String(data.get('category') || (sheet && sheet.item.categoryId) || ''),
    date: isKey(date) ? date : sheet.item.date
  };
}

function setRule(patch, { keepFresh = false } = {}) {
  sheet.rule = { ...sheet.rule, ...patch };
  if (!keepFresh) sheet.ruleFresh = false;
  renderRepeat();
}

function segmented(label, options, current, onPick) {
  return h('div', { class: 'segmented', role: 'group', 'aria-label': label },
    options.map(([value, text]) => h('button', {
      type: 'button',
      'aria-pressed': String(value === current),
      onclick: () => onPick(value)
    }, text)));
}

function stepper(label, valueText, onMinus, onPlus, unit, { minusDisabled, plusDisabled, name }) {
  return h('div', { class: 'stepper' },
    h('span', { class: 'label', text: label }),
    h('button', { type: 'button', class: 'step-btn', 'aria-label': `Fewer ${name}`, disabled: minusDisabled, onclick: onMinus }, icon('minus')),
    h('span', { class: 'value', 'aria-live': 'polite', text: valueText }),
    h('button', { type: 'button', class: 'step-btn', 'aria-label': `More ${name}`, disabled: plusDisabled, onclick: onPlus }, icon('plus')),
    unit ? h('span', { class: 'unit', text: unit }) : null);
}

// The repeat card is redrawn on its own so typing in the title is never interrupted.
function renderRepeat() {
  const form = readForm();
  const category = store.getCategory(form.categoryId);
  if (category) {
    els.repeatCard.style.setProperty('--c', category.color);
    els.repeatCard.style.setProperty('--tint', tintFor(category.color));
  }
  const parts = [h('span', { class: 'field-label', text: 'Repeat' })];

  parts.push(segmented('Repeat', [['never', 'Never'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['yearly', 'Yearly']],
    sheet.freq, (freq) => {
      sheet.freq = freq;
      if (freq === 'never') sheet.rule = null;
      else if (sheet.routine && freq === sheet.routine.rule.freq) {
        sheet.rule = cleanRule(sheet.routine.rule);
        sheet.ruleFresh = false;
      } else {
        sheet.rule = defaultRule(freq, form.date);
        sheet.ruleFresh = true;
      }
      renderRepeat();
    }));

  if (sheet.freq !== 'never') {
    const r = sheet.rule;
    const n = r.interval || 1;
    const units = { daily: ['day', 'days'], weekly: ['week', 'weeks'], monthly: ['month', 'months'], yearly: ['year', 'years'] }[r.freq];
    parts.push(stepper('Every', String(n),
      () => setRule({ interval: Math.max(1, n - 1) }, { keepFresh: true }),
      () => setRule({ interval: Math.min(99, n + 1) }, { keepFresh: true }),
      n === 1 ? units[0] : units[1], { minusDisabled: n <= 1, plusDisabled: n >= 99, name: units[1] }));

    if (r.freq === 'weekly') {
      parts.push(h('div', { class: 'weekday-pills', role: 'group', 'aria-label': 'Days of the week' },
        ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((letter, i) => {
          const on = (r.weekdays || []).includes(i);
          return h('button', {
            type: 'button',
            'aria-label': WEEKDAYS[i],
            'aria-pressed': String(on),
            onclick: () => setRule({ weekdays: on ? r.weekdays.filter((x) => x !== i) : [...(r.weekdays || []), i] })
          }, letter);
        })));
    }

    if (r.freq === 'monthly') {
      parts.push(segmented('Repeat on', [['date', 'Date'], ['last', 'Last day'], ['weekday', 'Weekday']],
        r.monthMode, (mode) => setRule({ monthMode: mode })));
      if (r.monthMode === 'date') {
        parts.push(stepper('Day', ordinalSuffix(r.monthDay),
          () => setRule({ monthDay: Math.max(1, r.monthDay - 1) }),
          () => setRule({ monthDay: Math.min(31, r.monthDay + 1) }),
          '', { minusDisabled: r.monthDay <= 1, plusDisabled: r.monthDay >= 31, name: 'days' }));
      }
      if (r.monthMode === 'weekday') {
        const ordinal = h('select', { 'aria-label': 'Which week of the month' },
          [[1, 'First'], [2, 'Second'], [3, 'Third'], [4, 'Fourth'], [-1, 'Last']].map(([v, t]) =>
            h('option', { value: String(v), selected: v === r.ordinal }, t)));
        const weekday = h('select', { 'aria-label': 'Day of the week' },
          WEEKDAYS.map((t, v) => h('option', { value: String(v), selected: v === r.weekday }, t)));
        ordinal.addEventListener('change', () => setRule({ ordinal: Number(ordinal.value) }));
        weekday.addEventListener('change', () => setRule({ weekday: Number(weekday.value) }));
        parts.push(h('div', { class: 'select-pair' }, ordinal, weekday));
      }
    }

    if (r.freq === 'yearly') {
      parts.push(segmented('Calendar', [['solar', 'Solar'], ['lunar', 'Lunar']], r.calendar || 'solar',
        (calendar) => setRule({ calendar }, { keepFresh: true })));
      const anchor = sheet.ruleFresh ? anchorYearly(form.date) : r;
      if (r.calendar === 'lunar') {
        if (!lunarAvailable() || !anchor.lunarMonth) {
          parts.push(h('p', { class: 'repeat-note', text: 'Lunar dates are not available right now. Reload the app and try again.' }));
        } else {
          const lunar = toLunar(form.date);
          const leapNote = sheet.ruleFresh && lunar && lunar.leap ? ' This date is in a leap month, so it repeats in the regular month.' : '';
          parts.push(h('p', { class: 'repeat-note', text: `Lunar month ${anchor.lunarMonth}, day ${anchor.lunarDay}.${leapNote}` }));
        }
      }
    }

    // Ends
    const endsRow = h('div', { class: 'ends-row' },
      h('span', { class: 'label', text: 'Ends' }),
      segmented('Ends', [['never', 'Never'], ['date', 'On a date']], sheet.endMode, (mode) => {
        sheet.endMode = mode;
        renderRepeat();
      }));
    parts.push(endsRow);
    if (sheet.endMode === 'date') {
      const end = h('input', { type: 'date', value: sheet.endDate, 'aria-label': 'End date', min: form.date });
      end.addEventListener('change', () => {
        if (isKey(end.value)) sheet.endDate = end.value;
        renderRepeat();
      });
      parts.push(h('div', { class: 'date-row' }, h('span', { class: 'field-label', text: 'Last day' }), end));
    }

    // Summary and preview
    const rule = previewRule(form);
    const valid = ruleIsValid(rule);
    parts.push(h('div', { class: cls('repeat-summary', !valid && 'is-warning'), text: describeRule(rule) }));
    if (rule.freq === 'monthly' && rule.monthMode === 'date' && rule.monthDay >= 29) {
      parts.push(h('p', { class: 'repeat-note', text: `Months without a ${ordinalSuffix(rule.monthDay)} use their last day.` }));
    }
    if (valid) {
      const dates = nextDates({ id: 'preview', rule, startDate: form.date, endDate: endDateValue(form) }, form.date, 6);
      const year = fromKey(form.date).getFullYear();
      parts.push(h('div', {},
        h('span', { class: 'field-label', text: 'Next dates' }),
        h('div', { class: 'next-dates', text: dates.length ? dates.map((k) => monthDay(k, year).replace(/ /g, '\u00a0')).join(' · ') : 'None before the end date' })));
    }
  }
  els.repeatCard.replaceChildren(...parts);
}

function endDateValue(form) {
  return sheet.endMode === 'date' && sheet.endDate >= form.date ? sheet.endDate : null;
}

// The rule as it will be saved. Yearly repeats take their month and day
// from the date when the repeat is new or starts on a different day.
function previewRule(form) {
  const rule = cleanRule(sheet.rule);
  if (rule.freq === 'yearly' && (sheet.ruleFresh || (sheet.item.kind === 'occ' && form.date !== sheet.item.origDate))) {
    Object.assign(rule, anchorYearly(form.date));
  }
  return rule;
}

els.fDate.addEventListener('change', () => {
  if (!sheet) return;
  if (sheet.freq !== 'never' && sheet.ruleFresh) {
    const interval = sheet.rule.interval;
    const calendar = sheet.rule.calendar;
    sheet.rule = { ...defaultRule(sheet.freq, readForm().date), interval };
    if (calendar) sheet.rule.calendar = calendar;
  }
  renderRepeat();
});
els.fCats.addEventListener('change', () => {
  if (sheet) renderRepeat();
});

function showScope(mode, ruleChanged = false) {
  if (sheet) sheet.scope = mode;
  els.sheetMain.hidden = Boolean(mode);
  els.sheetScope.hidden = !mode;
  $('.sheet-head [type="submit"]', els.form).hidden = Boolean(mode);
  if (!mode) return;
  const dayBtn = $('[data-action="scope-day"]', els.sheetScope);
  const futureBtn = $('[data-action="scope-future"]', els.sheetScope);
  if (mode === 'save') {
    els.scopeText.textContent = ruleChanged
      ? 'A new repeat setting applies from this day on. Earlier days stay as they were.'
      : 'Save the changes for this day only, or for this day and every later one?';
    dayBtn.hidden = ruleChanged;
    dayBtn.textContent = 'This day only';
    futureBtn.textContent = 'This and future days';
  } else {
    els.scopeText.textContent = 'Delete this repeating task for this day only, or for this day and every later one?';
    dayBtn.hidden = false;
    dayBtn.textContent = 'Delete this day only';
    futureBtn.textContent = 'Delete this and future days';
  }
  (dayBtn.hidden ? futureBtn : dayBtn).focus();
}

function closeSheet() {
  els.dialog.close();
}

function saveSheet() {
  const form = readForm();
  if (!form.title) {
    els.fTitle.focus();
    showToast('Add a task name to save');
    return;
  }
  if (!store.getCategory(form.categoryId)) form.categoryId = sheet.item.categoryId;
  if (sheet.item.kind === 'someday') {
    store.updateSomeday(sheet.item.id, { title: form.title, note: form.note, categoryId: form.categoryId });
    closeSheet();
    return;
  }
  const rule = sheet.freq === 'never' ? null : previewRule(form);
  if (rule && !ruleIsValid(rule)) {
    showToast(rule.freq === 'weekly' ? 'Pick at least one day of the week' : 'Check the repeat settings');
    return;
  }
  const endDate = sheet.freq === 'never' ? null : endDateValue(form);
  const { item, routine } = sheet;

  if (item.kind === 'task') {
    if (!rule) {
      store.updateTask(item.id, form);
      closeSheet();
      if (form.date !== item.date) showToast(`Moved to ${shortDate(form.date)}`);
    } else {
      store.taskToRoutine(item.id, { ...form, rule, endDate });
      closeSheet();
      showToast('Repeat saved');
    }
    return;
  }

  const ruleChanged = !rule || !sameRule(rule, routine.rule) || (endDate || null) !== (routine.endDate || null);
  const fieldsChanged = form.title !== item.title || form.note !== (item.note || '')
    || form.categoryId !== item.categoryId || form.date !== item.date;
  if (!ruleChanged && !fieldsChanged) {
    closeSheet();
    return;
  }
  sheet.pending = { form, rule, endDate };
  showScope('save', ruleChanged);
}

function applyScope(which) {
  const { item, routine, scope } = sheet;
  if (scope === 'delete') {
    if (which === 'day') {
      store.updateOccurrence(item, { skipped: true });
      showToast('Deleted for this day');
    } else {
      store.endRoutineFrom(routine.id, item.origDate);
      showToast('Deleted from this day on');
    }
    closeSheet();
    return;
  }
  const { form, rule, endDate } = sheet.pending;
  if (which === 'day') {
    store.updateOccurrence(item, {
      title: form.title !== routine.title ? form.title : null,
      note: form.note !== (routine.note || '') ? form.note : null,
      categoryId: form.categoryId !== routine.categoryId ? form.categoryId : null,
      moveTo: form.date !== item.origDate ? form.date : null
    });
    closeSheet();
    if (form.date !== item.date) showToast(`Moved to ${shortDate(form.date)}`);
  } else {
    store.changeFuture(routine.id, item.origDate, { ...form, freq: rule ? rule.freq : 'never', rule, endDate });
    closeSheet();
    showToast('Saved from this day on');
  }
}

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (sheet && !sheet.scope) saveSheet();
});

els.form.addEventListener('click', (e) => {
  const button = e.target.closest('[data-action]');
  if (!button || !sheet) return;
  const { item } = sheet;
  switch (button.dataset.action) {
    case 'cancel':
      closeSheet();
      break;
    case 'tomorrow':
      if (item.kind === 'task') {
        const form = readForm();
        store.updateTask(item.id, { ...form, title: form.title || item.title, date: addDays(item.date, 1) });
      } else {
        store.updateOccurrence(item, { moveTo: addDays(item.date, 1) });
      }
      closeSheet();
      showToast(`Moved to ${shortDate(addDays(item.date, 1))}`);
      break;
    case 'skip':
      store.updateOccurrence(item, { skipped: true });
      closeSheet();
      showToast('Skipped for this day');
      break;
    case 'delete':
      if (item.kind === 'task' || item.kind === 'someday') {
        if (!confirm(`Delete "${item.title}"?`)) return;
        if (item.kind === 'someday') store.deleteSomeday(item.id);
        else store.deleteTask(item.id);
        closeSheet();
        showToast('Task deleted');
      } else {
        showScope('delete');
      }
      break;
    case 'scope-day':
      applyScope('day');
      break;
    case 'scope-future':
      applyScope('future');
      break;
    case 'scope-back':
      showScope(null);
      break;
    default:
      break;
  }
});

els.dialog.addEventListener('click', (e) => {
  if (e.target === els.dialog) closeSheet();
});
els.dialog.addEventListener('close', () => {
  sheet = null;
  showScope(null);
});

// ---------- Navigation ----------

function selectDay(key) {
  ui.selected = key;
  ui.addingIn = null;
  ui.addingSomeday = false;
  const d = fromKey(key);
  ui.year = d.getFullYear();
  ui.month = d.getMonth();
  render();
}

function showMonth(offset) {
  const first = new Date(ui.year, ui.month + offset, 1);
  const today = fromKey(ui.today);
  const inMonth = today.getFullYear() === first.getFullYear() && today.getMonth() === first.getMonth();
  selectDay(inMonth ? ui.today : toKey(first));
}

els.prev.addEventListener('click', () => showMonth(-1));
els.next.addEventListener('click', () => showMonth(1));
els.todayBtn.addEventListener('click', () => selectDay(ui.today));

els.grid.addEventListener('click', (e) => {
  const cell = e.target.closest('.cell');
  if (cell) selectDay(cell.dataset.key);
});

els.grid.addEventListener('keydown', (e) => {
  const moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  if (!(e.key in moves) || !e.target.closest('.cell')) return;
  e.preventDefault();
  selectDay(addDays(ui.selected, moves[e.key]));
  const cell = els.grid.querySelector(`.cell[data-key="${ui.selected}"]`);
  if (cell) cell.focus();
});

let touchStart = null;
els.calendar.addEventListener('touchstart', (e) => {
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}, { passive: true });
els.calendar.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  touchStart = null;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) showMonth(dx < 0 ? 1 : -1);
}, { passive: true });

els.newCat.addEventListener('click', () => {
  const c = store.addCategory();
  ui.editingCategory = c.id;
  render();
  const input = $('#cat-name');
  if (input) {
    input.focus();
    input.select();
  }
});

function showView(view) {
  ui.view = view;
  for (const [name, el] of Object.entries(els.views)) el.hidden = name !== view;
}

function route() {
  if (!ui.signedIn) {
    showView('login');
    return;
  }
  const hash = location.hash.replace('#', '');
  showView(['categories', 'settings'].includes(hash) ? hash : 'main');
  ui.addingIn = null;
  ui.addingSomeday = false;
  render();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

function checkToday() {
  const now = todayKey();
  if (now === ui.today) return;
  const wasOnToday = ui.selected === ui.today;
  ui.today = now;
  if (wasOnToday) selectDay(now);
  else render();
}
setInterval(checkToday, 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  checkToday();
  if (store.isOpen()) holidayFeed.refresh();
});
window.addEventListener('online', () => {
  if (store.isOpen()) holidayFeed.refresh();
});

// ---------- Sign in ----------

function setLoginMode(mode) {
  ui.loginMode = mode;
  const signup = mode === 'signup';
  els.loginSubmit.textContent = signup ? 'Create account' : 'Sign in';
  els.loginSwitch.textContent = signup ? 'I already have an account' : 'Create an account';
  els.loginPassword.autocomplete = signup ? 'new-password' : 'current-password';
  els.loginLead.textContent = signup
    ? 'Create your account. Use at least 6 characters for the password.'
    : 'Sign in to keep your tasks in sync on all your devices.';
  els.loginError.textContent = '';
}

function showLogin(message = '') {
  showView('login');
  els.loginError.textContent = message;
  if (!navigator.onLine && !message) els.loginError.textContent = 'Connect to the internet to sign in.';
}

els.loginSwitch.addEventListener('click', () => setLoginMode(ui.loginMode === 'signin' ? 'signup' : 'signin'));

els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!client) {
    els.loginError.textContent = 'The app could not load its sync library. Reload and try again.';
    return;
  }
  const email = els.loginEmail.value.trim();
  const password = els.loginPassword.value;
  if (!email || password.length < 6) {
    els.loginError.textContent = 'Enter your email and a password of at least 6 characters.';
    return;
  }
  if (!navigator.onLine) {
    els.loginError.textContent = 'Connect to the internet to sign in.';
    return;
  }
  els.loginSubmit.disabled = true;
  els.loginError.textContent = '';
  try {
    if (ui.loginMode === 'signup') {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      if (data.session) enterApp(data.session.user.id, email);
      else {
        setLoginMode('signin');
        els.loginError.textContent = 'Check your email to confirm your account, then sign in.';
      }
    } else {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      enterApp(data.session.user.id, email);
    }
    els.loginPassword.value = '';
  } catch (err) {
    const text = String(err.message || err);
    els.loginError.textContent = /invalid login/i.test(text) ? "That email and password don't match."
      : /fetch|network/i.test(text) ? 'Could not reach the server. Check your connection.'
        : text;
  } finally {
    els.loginSubmit.disabled = false;
  }
});

function enterApp(userId, email) {
  if (store.userId() !== userId) {
    if (store.isOpen()) store.close();
    store.open(userId);
  }
  localStorage.setItem('todo.lastUser', userId);
  if (email) localStorage.setItem('todo.lastEmail', email);
  ui.email = email || localStorage.getItem('todo.lastEmail') || '';
  ui.signedIn = true;
  route();
  sync.start();
  holidayFeed.refresh();
}

function signedOut({ keepData }) {
  sync.stop();
  const id = store.userId();
  if (store.isOpen()) store.close();
  if (!keepData && id) store.wipe(id);
  if (!keepData) {
    localStorage.removeItem('todo.lastUser');
    localStorage.removeItem('todo.lastEmail');
  }
  ui.signedIn = false;
  if (els.dialog.open) els.dialog.close();
  showLogin(keepData ? 'Please sign in again to keep syncing.' : '');
}

els.logout.addEventListener('click', async () => {
  const pending = store.pendingCount();
  const message = pending
    ? `${pending === 1 ? '1 change has' : `${pending} changes have`} not synced yet and will be lost. Log out anyway?`
    : 'Log out of ToDo on this device?';
  if (!confirm(message)) return;
  try {
    if (client) await client.auth.signOut({ scope: 'local' });
  } catch (err) {
    console.warn(err);
  }
  signedOut({ keepData: false });
});

// ---------- Toast ----------

let toastTimer = null;
function showToast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), 2400);
}

// ---------- Start ----------

store.subscribe(render);

function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Offline support is off.', err));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  setLoginMode('signin');
  const lastUser = localStorage.getItem('todo.lastUser');
  // Open saved data right away, even offline. The session is confirmed below.
  if (lastUser) enterApp(lastUser, localStorage.getItem('todo.lastEmail'));
  else showLogin();

  if (!client) return;
  client.auth.onAuthStateChange((event, session) => {
    // Work outside the auth callback, as Supabase recommends.
    setTimeout(() => {
      if (session && session.user) {
        if (!ui.signedIn || store.userId() !== session.user.id) enterApp(session.user.id, session.user.email);
        else if (session.user.email && session.user.email !== ui.email) {
          ui.email = session.user.email;
          localStorage.setItem('todo.lastEmail', ui.email);
        }
      } else if (event === 'SIGNED_OUT') {
        if (ui.signedIn) signedOut({ keepData: true });
      } else if (event === 'INITIAL_SESSION' && ui.signedIn && navigator.onLine) {
        signedOut({ keepData: true });
      }
    }, 0);
  });
}

boot();
