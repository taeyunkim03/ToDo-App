// Korean public holidays from the holidays-kr project (MIT license), which
// publishes the official government holiday calendar as one JSON file per
// year. No API key is needed. Each year is kept on the device for offline use
// and refreshed every 12 hours. If neither source can be reached, the dates
// built into holidays.js are used for 2026 and 2027.

import * as store from './store.js';

const SOURCES = [
  (year) => `https://raw.githubusercontent.com/hyunbinseo/holidays-kr/main/public/${year}.json`,
  (year) => `https://cdn.jsdelivr.net/gh/hyunbinseo/holidays-kr@main/public/${year}.json`
];
const FRESH_MS = 12 * 60 * 60 * 1000;
const RETRY_MS = 10 * 60 * 1000;
const inFlight = new Map();
const lastTry = new Map();

// Expected shape: { "2026-09-25": ["추석"], ... }
function isValid(data, year) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const entries = Object.entries(data);
  return entries.length > 0 && entries.every(([key, names]) =>
    /^\d{4}-\d{2}-\d{2}$/.test(key) && key.startsWith(`${year}-`)
    && Array.isArray(names) && names.every((n) => typeof n === 'string'));
}

// { status: 'ok', data }, { status: 'missing' } when the year isn't
// published yet, or null when no source could be reached.
async function download(year) {
  for (const source of SOURCES) {
    try {
      const response = await fetch(source(year), { cache: 'no-store' });
      if (response.status === 404) return { status: 'missing' };
      if (!response.ok) continue;
      const data = JSON.parse(await response.text());
      if (isValid(data, year)) return { status: 'ok', data };
    } catch (err) {
      // Try the next source.
    }
  }
  return null;
}

function loadYear(year) {
  if (!store.isOpen() || !navigator.onLine) return Promise.resolve();
  if (inFlight.has(year)) return inFlight.get(year);
  const now = Date.now();
  const saved = store.krYear(year);
  if (saved && now - saved.fetchedAt < FRESH_MS) return Promise.resolve();
  if (now - (lastTry.get(year) || 0) < RETRY_MS) return Promise.resolve();
  lastTry.set(year, now);
  const job = download(year)
    .then((result) => {
      if (result && store.isOpen()) store.setKrYear(year, result.status === 'ok' ? result.data : null);
    })
    .finally(() => inFlight.delete(year));
  inFlight.set(year, job);
  return job;
}

// Last year, this year and next year.
export function refresh() {
  const year = new Date().getFullYear();
  return Promise.all([year - 1, year, year + 1].map(loadYear));
}

// Years shown on the calendar, fetched the first time they come into view.
export function ensureYears(years) {
  [...new Set(years)].forEach(loadYear);
}
