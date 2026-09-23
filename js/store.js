// Offline-first data store.
// Every change is saved on this device right away and queued in the outbox.
// sync.js sends the outbox to Supabase and merges changes from other devices.
// When the same record changed in two places, the most recent edit wins.

import { addDays } from './dates.js';
import { occursOn, cleanRule, anchorYearly } from './repeat.js';
import { nextColor } from './palette.js';

export const TABLES = ['categories', 'routines', 'tasks', 'someday', 'occurrences', 'settings'];

const listeners = new Set();
let localChangeHook = null;
let db = null;
let storageKey = null;

const now = () => new Date().toISOString();
const alive = (r) => Boolean(r) && !r.deleted;
const time = (iso) => Date.parse(iso) || 0;

function newId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function emptyDb(userId) {
  return {
    version: 2,
    userId,
    categories: {},
    tasks: {},
    someday: {},
    routines: {},
    occurrences: {},
    settings: {},
    cursors: {},
    outbox: {},
    krHolidays: {},
    krYears: {},
    seeded: false
  };
}

// ---------- Opening and saving ----------

export function open(userId) {
  storageKey = `todo.db.${userId}`;
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
  } catch (err) {
    console.warn('Saved data could not be read.', err);
  }
  db = saved && saved.version === 2 && saved.userId === userId ? { ...emptyDb(userId), ...saved } : emptyDb(userId);
  delete db.serverKr;
  delete db.holidaysFetchedAt;
  delete db.somedayCategoryId;
  // Default settings are dated 1970 so any saved server version wins.
  if (!db.settings[userId]) {
    db.settings[userId] = { id: userId, showUs: true, showKr: true, updatedAt: new Date(0).toISOString(), deleted: false };
  }
  notify();
}

export function close() {
  persist();
  db = null;
  storageKey = null;
}

export function wipe(userId) {
  localStorage.removeItem(`todo.db.${userId}`);
}

export function isOpen() {
  return Boolean(db);
}

export function userId() {
  return db ? db.userId : null;
}

export function persist() {
  if (!db) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(db));
  } catch (err) {
    console.warn('Could not save on this device.', err);
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify() {
  listeners.forEach((fn) => fn());
}

// Called on every local edit, including quiet ones that skip a redraw.
export function onLocalChange(fn) {
  localChangeHook = fn;
}

function commit() {
  persist();
  notify();
}

// Records are replaced, never edited in place, so a sync in progress keeps
// the version it read.
function put(table, record) {
  const next = { ...record, updatedAt: now() };
  db[table][next.id] = next;
  db.outbox[`${table}:${next.id}`] = true;
  if (localChangeHook) localChangeHook();
  return next;
}

// ---------- Sync support ----------

export function pendingCount() {
  return db ? Object.keys(db.outbox).length : 0;
}

export function pendingChanges() {
  if (!db) return [];
  return Object.keys(db.outbox).map((key) => {
    const i = key.indexOf(':');
    const table = key.slice(0, i);
    return { key, table, record: db[table] ? db[table][key.slice(i + 1)] : null };
  }).filter((c) => c.record);
}

// Clear sent changes, unless the record was edited again while sending.
export function markPushed(changes) {
  if (!db) return;
  for (const { key, table, record } of changes) {
    const current = db[table][record.id];
    if (!current || current.updatedAt === record.updatedAt) delete db.outbox[key];
  }
  persist();
}

export function cursor(table) {
  return db && db.cursors[table] ? db.cursors[table] : null;
}

export function setCursor(table, value) {
  if (db) db.cursors[table] = value;
}

// Merge records from the server. A local edit that is newer is kept.
export function applyRemote(table, rows) {
  if (!db) return false;
  let changed = false;
  for (const row of rows) {
    const local = db[table][row.id];
    const key = `${table}:${row.id}`;
    if (local && time(local.updatedAt) >= time(row.updatedAt)) continue;
    db[table][row.id] = row;
    delete db.outbox[key];
    changed = true;
  }
  return changed;
}

export function finishPull(changed) {
  persist();
  if (changed) notify();
}

// Korean holidays fetched by holiday-feed.js. They are the same for every
// account, so they stay on the device and are not synced.
export function krYear(year) {
  return db && db.krYears[year] ? db.krYears[year] : null;
}

// data is { 'YYYY-MM-DD': [names] }, or null when the year isn't published yet.
export function setKrYear(year, data) {
  if (!db) return;
  if (data) {
    for (const key of Object.keys(db.krHolidays)) {
      if (key.startsWith(`${year}-`)) delete db.krHolidays[key];
    }
    Object.assign(db.krHolidays, data);
  }
  db.krYears[year] = { fetchedAt: Date.now(), found: Boolean(data) };
  commit();
}

export function krHolidays() {
  return db ? db.krHolidays : {};
}

// A brand-new account starts with one category.
export function seedIfEmpty() {
  if (!db || db.seeded) return;
  db.seeded = true;
  if (!categories().length) addCategory('Personal', '#2E9E5B');
  else persist();
}

// ---------- Reading ----------

export function categories() {
  if (!db) return [];
  return Object.values(db.categories).filter(alive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

export function getCategory(id) {
  return db && alive(db.categories[id]) ? db.categories[id] : null;
}

export function getTask(id) {
  return db && alive(db.tasks[id]) ? db.tasks[id] : null;
}

export function getRoutine(id) {
  return db && alive(db.routines[id]) ? db.routines[id] : null;
}

export function settings() {
  return db ? db.settings[db.userId] : { showUs: true, showKr: true };
}

export function itemCount(categoryId) {
  if (!db) return 0;
  const tasks = Object.values(db.tasks).filter((t) => alive(t) && t.categoryId === categoryId).length;
  const routines = Object.values(db.routines).filter((r) => alive(r) && r.categoryId === categoryId).length;
  return tasks + routines;
}

function taskItem(t) {
  return {
    kind: 'task', id: t.id, date: t.date, title: t.title, note: t.note || '',
    categoryId: t.categoryId, done: Boolean(t.done), sortOrder: t.sortOrder, repeat: false
  };
}

function occurrenceItem(r, origDate) {
  const id = `${r.id}:${origDate}`;
  const o = alive(db.occurrences[id]) ? db.occurrences[id] : null;
  if (o && o.skipped) return null;
  const override = o && o.categoryId && getCategory(o.categoryId) ? o.categoryId : null;
  return {
    kind: 'occ',
    id,
    routineId: r.id,
    origDate,
    date: (o && o.moveTo) || origDate,
    title: o && o.title != null ? o.title : r.title,
    note: o && o.note != null ? o.note : r.note || '',
    categoryId: override || r.categoryId,
    done: Boolean(o && o.done),
    sortOrder: o && o.sortOrder != null ? o.sortOrder : -1,
    repeat: true
  };
}

const itemSort = (a, b) => a.sortOrder - b.sortOrder
  || (a.kind === b.kind ? 0 : a.kind === 'occ' ? -1 : 1)
  || a.title.localeCompare(b.title);

// Tasks and repeat occurrences from `from` to `to`, grouped by date.
export function itemsBetween(from, to) {
  const out = new Map();
  if (!db) return out;
  const add = (item) => {
    if (!item || item.date < from || item.date > to) return;
    if (!out.has(item.date)) out.set(item.date, []);
    out.get(item.date).push(item);
  };

  for (const t of Object.values(db.tasks)) {
    if (alive(t) && t.date >= from && t.date <= to) add(taskItem(t));
  }

  for (const r of Object.values(db.routines)) {
    if (!alive(r) || (r.endDate && r.endDate < from) || r.startDate > to) continue;
    for (let key = from < r.startDate ? r.startDate : from; key <= to; key = addDays(key, 1)) {
      if (r.endDate && key > r.endDate) break;
      if (occursOn(r, key)) add(occurrenceItem(r, key));
    }
  }

  // Occurrences moved into this range from a date outside it.
  for (const o of Object.values(db.occurrences)) {
    if (!alive(o) || !o.moveTo || o.moveTo < from || o.moveTo > to) continue;
    if (o.date >= from && o.date <= to) continue;
    const r = getRoutine(o.routineId);
    if (r && occursOn(r, o.date)) add(occurrenceItem(r, o.date));
  }

  for (const list of out.values()) list.sort(itemSort);
  return out;
}

export function dayItems(date) {
  return itemsBetween(date, date).get(date) || [];
}

export function findItem(kind, id, date) {
  return dayItems(date).find((i) => i.kind === kind && i.id === id) || null;
}

function nextSort(date, categoryId) {
  return dayItems(date).filter((i) => i.categoryId === categoryId)
    .reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1;
}

// ---------- Categories ----------

export function addCategory(name = 'New category', color) {
  const list = categories();
  const c = put('categories', {
    id: newId(),
    name,
    color: color || nextColor(list.map((x) => x.color)),
    sortOrder: list.reduce((max, x) => Math.max(max, x.sortOrder), -1) + 1,
    deleted: false
  });
  commit();
  return c;
}

export function updateCategory(id, patch, { silent = false } = {}) {
  const c = db.categories[id];
  if (!c) return;
  put('categories', { ...c, ...patch });
  persist();
  if (!silent) notify();
}

// Deleting a category also deletes its tasks and repeats.
export function deleteCategory(id) {
  const c = db.categories[id];
  if (!c) return;
  put('categories', { ...c, deleted: true });
  for (const t of Object.values(db.tasks)) if (alive(t) && t.categoryId === id) put('tasks', { ...t, deleted: true });
  for (const r of Object.values(db.routines)) if (alive(r) && r.categoryId === id) put('routines', { ...r, deleted: true });
  commit();
}

export function reorderCategories(ids) {
  ids.forEach((id, i) => {
    const c = db.categories[id];
    if (c && c.sortOrder !== i) put('categories', { ...c, sortOrder: i });
  });
  commit();
}

// ---------- Tasks ----------

export function addTask(categoryId, date, title, { silent = false } = {}) {
  const t = put('tasks', {
    id: newId(), categoryId, date, title, note: '', done: false,
    sortOrder: nextSort(date, categoryId), deleted: false
  });
  persist();
  if (!silent) notify();
  return t;
}

export function updateTask(id, patch) {
  const t = db.tasks[id];
  if (!t) return;
  const next = { ...t, ...patch };
  if (next.date !== t.date || next.categoryId !== t.categoryId) next.sortOrder = nextSort(next.date, next.categoryId);
  put('tasks', next);
  commit();
}

export function deleteTask(id) {
  const t = db.tasks[id];
  if (t) put('tasks', { ...t, deleted: true });
  commit();
}

// ---------- Someday ----------

// A someday task waits on every day from addedOn until it's checked off,
// shows as done on doneOn, and is hidden after that.
function somedayVisible(s, date) {
  return s.addedOn <= date && (!s.doneOn || s.doneOn >= date);
}

function liveSomeday() {
  return Object.values(db.someday).filter(alive).sort((a, b) => a.sortOrder - b.sortOrder);
}

// Someday tasks have no category. Older records may still carry a
// categoryId, which is ignored.
export function somedayOn(date) {
  if (!db) return [];
  return liveSomeday()
    .filter((s) => somedayVisible(s, date))
    .map((s) => ({
      kind: 'someday', id: s.id, title: s.title, note: s.note || '',
      done: s.doneOn === date, sortOrder: s.sortOrder
    }));
}

export function addSomeday(title, addedOn, { silent = false } = {}) {
  const s = put('someday', {
    id: newId(), title, note: '', addedOn, doneOn: null,
    sortOrder: liveSomeday().reduce((max, x) => Math.max(max, x.sortOrder), -1) + 1,
    deleted: false
  });
  persist();
  if (!silent) notify();
  return s;
}

export function updateSomeday(id, patch) {
  const s = db.someday[id];
  if (!s) return;
  const { title, note } = patch;
  put('someday', { ...s, title, note });
  commit();
}

// A task is never visible after doneOn, so checking on any visible day
// other than doneOn moves doneOn earlier, and checking on doneOn clears it.
export function toggleSomeday(id, date) {
  const s = db.someday[id];
  if (!s) return;
  put('someday', { ...s, doneOn: s.doneOn === date ? null : date });
  commit();
}

export function deleteSomeday(id) {
  const s = db.someday[id];
  if (s) put('someday', { ...s, deleted: true });
  commit();
}

// visibleIds is the new order of the items shown on one day. Hidden items
// keep their slots, and every live item is renumbered so orders never collide.
export function reorderSomeday(visibleIds) {
  const all = liveSomeday();
  const visible = new Set(visibleIds);
  const queue = visibleIds.map((id) => db.someday[id]).filter((s) => s && alive(s));
  const ordered = all.map((s) => (visible.has(s.id) ? queue.shift() : s));
  ordered.forEach((s, i) => {
    if (s && s.sortOrder !== i) put('someday', { ...s, sortOrder: i });
  });
  commit();
}

// ---------- Repeats ----------

function setOccurrence(routineId, origDate, patch) {
  const id = `${routineId}:${origDate}`;
  const existing = alive(db.occurrences[id]) ? db.occurrences[id] : null;
  const base = existing || {
    id, routineId, date: origDate, done: false, skipped: false, moveTo: null,
    title: null, note: null, categoryId: null, sortOrder: null, deleted: false
  };
  const next = { ...base, ...patch, deleted: false };
  if (next.moveTo === origDate) next.moveTo = null;
  put('occurrences', next);
}

export function updateOccurrence(item, patch) {
  setOccurrence(item.routineId, item.origDate, patch);
  commit();
}

export function toggleItem(item) {
  if (item.kind === 'task') {
    const t = db.tasks[item.id];
    if (t) put('tasks', { ...t, done: !t.done });
  } else {
    setOccurrence(item.routineId, item.origDate, { done: !item.done });
  }
  commit();
}

function newRoutine({ categoryId, title, note, rule, startDate, endDate }) {
  const clean = cleanRule(rule);
  if (clean.freq === 'yearly' && !clean.month) Object.assign(clean, anchorYearly(startDate));
  return put('routines', {
    id: newId(), categoryId, title, note: note || '', rule: clean,
    startDate, endDate: endDate || null, sortOrder: 0, deleted: false
  });
}

// Turn a one-off task into a repeat that starts on draft.date.
export function taskToRoutine(taskId, draft) {
  const t = db.tasks[taskId];
  if (!t) return;
  const r = newRoutine({ ...draft, startDate: draft.date });
  if (t.done && draft.date === t.date) setOccurrence(r.id, draft.date, { done: true });
  put('tasks', { ...t, deleted: true });
  commit();
}

// Edit a repeat from one occurrence onward. Earlier days keep the old version.
export function changeFuture(routineId, origDate, draft) {
  const r = db.routines[routineId];
  if (!r) return;
  const occId = `${routineId}:${origDate}`;
  const wasDone = alive(db.occurrences[occId]) && db.occurrences[occId].done;

  if (origDate <= r.startDate) {
    put('routines', { ...r, deleted: true });
  } else {
    put('routines', { ...r, endDate: addDays(origDate, -1) });
  }

  if (draft.freq === 'never') {
    put('tasks', {
      id: newId(), categoryId: draft.categoryId, date: draft.date, title: draft.title, note: draft.note || '',
      done: Boolean(wasDone), sortOrder: nextSort(draft.date, draft.categoryId), deleted: false
    });
  } else {
    const next = newRoutine({ ...draft, startDate: draft.date });
    if (wasDone && occursOn(next, draft.date)) setOccurrence(next.id, draft.date, { done: true });
  }
  commit();
}

// Delete a repeat from one occurrence onward.
export function endRoutineFrom(routineId, origDate) {
  const r = db.routines[routineId];
  if (!r) return;
  if (origDate <= r.startDate) put('routines', { ...r, deleted: true });
  else put('routines', { ...r, endDate: addDays(origDate, -1) });
  commit();
}

// ---------- Ordering ----------

// After a drag, save the new order. groups = [{ categoryId, items: [{ kind, id }] }]
export function applyOrder(date, groups) {
  for (const { categoryId, items } of groups) {
    items.forEach((ref, i) => {
      if (ref.kind === 'task') {
        const t = db.tasks[ref.id];
        if (t && (t.sortOrder !== i || t.categoryId !== categoryId || t.date !== date)) {
          put('tasks', { ...t, sortOrder: i, categoryId, date });
        }
      } else {
        const split = ref.id.indexOf(':');
        const routineId = ref.id.slice(0, split);
        const origDate = ref.id.slice(split + 1);
        const r = db.routines[routineId];
        if (r) setOccurrence(routineId, origDate, { sortOrder: i, categoryId: categoryId === r.categoryId ? null : categoryId });
      }
    });
  }
  commit();
}

// ---------- Settings ----------

export function updateSettings(patch) {
  put('settings', { ...settings(), ...patch });
  commit();
}
