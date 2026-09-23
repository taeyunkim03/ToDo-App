// Background sync with Supabase.
// Push: send queued changes from this device.
// Pull: fetch rows other devices changed since the last pull.
// Runs after edits, when the app comes back to the screen, when the
// connection returns, and every 30 seconds while the app is open.

import * as store from './store.js';

const FIELDS = {
  categories: { id: 'id', name: 'name', color: 'color', sortOrder: 'sort_order', updatedAt: 'updated_at', deleted: 'deleted' },
  routines: {
    id: 'id', categoryId: 'category_id', title: 'title', note: 'note', rule: 'rule', startDate: 'start_date',
    endDate: 'end_date', sortOrder: 'sort_order', updatedAt: 'updated_at', deleted: 'deleted'
  },
  tasks: {
    id: 'id', categoryId: 'category_id', title: 'title', note: 'note', date: 'date', done: 'done',
    sortOrder: 'sort_order', updatedAt: 'updated_at', deleted: 'deleted'
  },
  someday: {
    id: 'id', categoryId: 'category_id', title: 'title', note: 'note', addedOn: 'added_on',
    doneOn: 'done_on', sortOrder: 'sort_order', updatedAt: 'updated_at', deleted: 'deleted'
  },
  occurrences: {
    id: 'id', routineId: 'routine_id', date: 'date', done: 'done', skipped: 'skipped', moveTo: 'move_to',
    title: 'title', note: 'note', categoryId: 'category_id', sortOrder: 'sort_order', updatedAt: 'updated_at', deleted: 'deleted'
  },
  settings: { id: 'id', showUs: 'show_us', showKr: 'show_kr', updatedAt: 'updated_at', deleted: 'deleted' }
};

const PAGE = 1000;
const MARGIN_MS = 5000;

let client = null;
let running = false;
let again = false;
let started = false;
let timer = null;
let pushTimer = null;
let unsubscribe = null;
const statusListeners = new Set();
const state = { syncing: false, lastSynced: 0, error: null };

function toRemote(table, record) {
  const out = {};
  for (const [local, remote] of Object.entries(FIELDS[table])) {
    out[remote] = record[local] === undefined ? null : record[local];
  }
  return out;
}

function fromRemote(table, row) {
  const out = {};
  for (const [local, remote] of Object.entries(FIELDS[table])) out[local] = row[remote];
  return out;
}

export function init(supabaseClient) {
  client = supabaseClient;
}

export function onStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

export function status() {
  return {
    online: navigator.onLine,
    syncing: state.syncing,
    pending: store.pendingCount(),
    lastSynced: state.lastSynced,
    error: state.error
  };
}

function emit() {
  const s = status();
  statusListeners.forEach((fn) => fn(s));
}

function isNetworkError(err) {
  const text = String((err && (err.message || err.details)) || err);
  return !navigator.onLine || /fetch|network|load failed|timed out|offline/i.test(text);
}

// A failing table doesn't stop the others. Its changes stay in the outbox,
// and the first error is thrown at the end so the status shows Sync issue.
async function push() {
  const changes = store.pendingChanges();
  if (!changes.length) return;
  let firstError = null;
  for (const table of store.TABLES) {
    const mine = changes.filter((c) => c.table === table);
    for (let i = 0; i < mine.length; i += 500) {
      const chunk = mine.slice(i, i + 500);
      const { error } = await client.from(table).upsert(chunk.map((c) => toRemote(table, c.record)), { onConflict: 'id' });
      if (error) {
        firstError = firstError || error;
        break;
      }
      store.markPushed(chunk);
    }
  }
  if (firstError) throw firstError;
}

// Like push, one failing table doesn't stop the rest from pulling.
async function pull() {
  let changed = false;
  let firstError = null;
  for (const table of store.TABLES) {
    const saved = store.cursor(table);
    let since = saved ? new Date(Date.parse(saved) - MARGIN_MS).toISOString() : '1970-01-01T00:00:00Z';
    for (;;) {
      const { data, error } = await client.from(table).select('*')
        .gt('synced_at', since).order('synced_at', { ascending: true }).limit(PAGE);
      if (error) {
        firstError = firstError || error;
        break;
      }
      if (!data.length) break;
      if (store.applyRemote(table, data.map((row) => fromRemote(table, row)))) changed = true;
      since = data[data.length - 1].synced_at;
      const latest = store.cursor(table);
      if (!latest || Date.parse(since) > Date.parse(latest)) store.setCursor(table, since);
      if (data.length < PAGE) break;
    }
  }
  store.finishPull(changed);
  if (firstError) throw firstError;
}

export async function syncNow() {
  if (!client || !store.isOpen()) return;
  if (running) {
    again = true;
    return;
  }
  if (!navigator.onLine) {
    emit();
    return;
  }
  running = true;
  state.syncing = true;
  emit();
  try {
    const { data } = await client.auth.getSession();
    if (!data.session) throw new Error('Signed out');
    if (data.session.user.id !== store.userId()) throw new Error('Different account');
    // Pull even when a push failed, so one broken table doesn't stop
    // changes from other devices coming in.
    const pushError = await push().then(() => null, (err) => err);
    await pull();
    if (pushError) throw pushError;
    store.seedIfEmpty();
    state.lastSynced = Date.now();
    state.error = null;
  } catch (err) {
    state.error = isNetworkError(err) ? null : String(err.message || err);
    if (state.error) console.warn('Sync failed', err);
  } finally {
    running = false;
    state.syncing = false;
    emit();
    if (again) {
      again = false;
      setTimeout(syncNow, 0);
    }
  }
}

// Send edits a moment after they happen, batching quick successive changes.
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, 800);
}

function onVisible() {
  if (!document.hidden) syncNow();
  else store.persist();
}

export function start() {
  if (started) {
    syncNow();
    return;
  }
  started = true;
  store.onLocalChange(() => {
    schedulePush();
    setTimeout(emit, 0);
  });
  unsubscribe = store.subscribe(emit);
  window.addEventListener('online', syncNow);
  window.addEventListener('offline', emit);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pagehide', store.persist);
  timer = setInterval(() => {
    if (!document.hidden) syncNow();
  }, 30000);
  syncNow();
}

export function stop() {
  if (!started) return;
  started = false;
  clearInterval(timer);
  clearTimeout(pushTimer);
  if (unsubscribe) unsubscribe();
  store.onLocalChange(null);
  window.removeEventListener('online', syncNow);
  window.removeEventListener('offline', emit);
  document.removeEventListener('visibilitychange', onVisible);
  window.removeEventListener('pagehide', store.persist);
}
