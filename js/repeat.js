// Repeat rules. A routine has a rule, a start date and an optional end date.
//
// rule = {
//   freq: 'daily' | 'weekly' | 'monthly' | 'yearly',
//   interval: 1,                         every N days, weeks, months or years
//   weekdays: [1, 3, 5],                 weekly, 0 = Sunday
//   monthMode: 'date' | 'last' | 'weekday',
//   monthDay: 31,                        monthly by date (short months use their last day)
//   ordinal: 1..4 or -1, weekday: 0..6,  monthly by weekday, -1 = last
//   calendar: 'solar' | 'lunar',         yearly
//   month: 9, day: 21,                   yearly solar (Feb 29 uses Feb 28 in other years)
//   lunarMonth: 8, lunarDay: 11          yearly lunar (a missing 30th uses the 29th)
// }

import {
  fromKey, toKey, pad, addDays, daysIn, daysBetween,
  MONTHS, MONTHS_SHORT, WEEKDAYS, WEEKDAYS_SHORT, ordinalSuffix
} from './dates.js';

const ORDINALS = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', '-1': 'last' };

// ---------- Lunar calendar ----------

function lunarLib() {
  return globalThis.KoreanLunarCalendar || null;
}

export function lunarAvailable() {
  return Boolean(lunarLib());
}

// Solar date key to its Korean lunar date.
export function toLunar(key) {
  const Lib = lunarLib();
  if (!Lib) return null;
  const d = fromKey(key);
  const cal = new Lib();
  if (!cal.setSolarDate(d.getFullYear(), d.getMonth() + 1, d.getDate())) return null;
  const l = cal.getLunarCalendar();
  return { year: l.year, month: l.month, day: l.day, leap: Boolean(l.intercalation) };
}

// Lunar date to a solar date key. Leap months repeat in the regular month,
// and a 30th that a month lacks uses the 29th.
export function lunarToSolar(year, month, day) {
  const Lib = lunarLib();
  if (!Lib) return null;
  const cal = new Lib();
  let ok = cal.setLunarDate(year, month, day, false);
  if (!ok && day === 30) ok = cal.setLunarDate(year, month, 29, false);
  if (!ok) return null;
  const s = cal.getSolarCalendar();
  return `${s.year}-${pad(s.month)}-${pad(s.day)}`;
}

const lunarCache = new Map();

// Solar dates in year Y on which a lunar yearly routine falls.
function lunarDatesInYear(routine, year) {
  const r = routine.rule;
  const n = Math.max(1, r.interval || 1);
  const cacheKey = [routine.startDate, r.lunarMonth, r.lunarDay, n, year].join('|');
  if (lunarCache.has(cacheKey)) return lunarCache.get(cacheKey);
  const start = toLunar(routine.startDate);
  const dates = [];
  for (const lunarYear of [year - 1, year]) {
    if (start && (lunarYear - start.year) % n !== 0) continue;
    const key = lunarToSolar(lunarYear, r.lunarMonth, r.lunarDay);
    if (key && key.startsWith(`${year}-`)) dates.push(key);
  }
  lunarCache.set(cacheKey, dates);
  return dates;
}

// ---------- Rules ----------

function ordinalOf(date) {
  const n = Math.ceil(date.getDate() / 7);
  return n <= 4 ? n : -1;
}

// A sensible rule for a frequency, based on the task's date.
export function defaultRule(freq, key) {
  const d = fromKey(key);
  const rule = { freq, interval: 1 };
  if (freq === 'weekly') rule.weekdays = [d.getDay()];
  if (freq === 'monthly') {
    Object.assign(rule, { monthMode: 'date', monthDay: d.getDate(), ordinal: ordinalOf(d), weekday: d.getDay() });
  }
  if (freq === 'yearly') {
    rule.calendar = 'solar';
    Object.assign(rule, anchorYearly(key));
  }
  return rule;
}

// Month and day for a yearly routine, in both calendars.
export function anchorYearly(key) {
  const d = fromKey(key);
  const lunar = toLunar(key);
  return {
    month: d.getMonth() + 1,
    day: d.getDate(),
    lunarMonth: lunar ? lunar.month : null,
    lunarDay: lunar ? lunar.day : null
  };
}

// The same rule, keeping only the fields its frequency uses.
export function cleanRule(rule) {
  const out = { freq: rule.freq, interval: Math.max(1, Math.min(99, Number(rule.interval) || 1)) };
  if (rule.freq === 'weekly') out.weekdays = [...new Set(rule.weekdays || [])].sort((a, b) => a - b);
  if (rule.freq === 'monthly') {
    out.monthMode = rule.monthMode || 'date';
    out.monthDay = rule.monthDay;
    out.ordinal = rule.ordinal;
    out.weekday = rule.weekday;
  }
  if (rule.freq === 'yearly') {
    out.calendar = rule.calendar === 'lunar' ? 'lunar' : 'solar';
    out.month = rule.month;
    out.day = rule.day;
    out.lunarMonth = rule.lunarMonth;
    out.lunarDay = rule.lunarDay;
  }
  return out;
}

export function sameRule(a, b) {
  return JSON.stringify(cleanRule(a)) === JSON.stringify(cleanRule(b));
}

export function ruleIsValid(rule) {
  if (rule.freq === 'weekly') return (rule.weekdays || []).length > 0;
  if (rule.freq === 'yearly' && rule.calendar === 'lunar') return Boolean(rule.lunarMonth && rule.lunarDay);
  return true;
}

// Does the routine fall on this date (before any single-day changes)?
export function occursOn(routine, key) {
  if (key < routine.startDate) return false;
  if (routine.endDate && key > routine.endDate) return false;
  const r = routine.rule;
  const n = Math.max(1, r.interval || 1);
  const d = fromKey(key);
  const s = fromKey(routine.startDate);

  switch (r.freq) {
    case 'daily':
      return daysBetween(s, d) % n === 0;

    case 'weekly': {
      if (!(r.weekdays || []).includes(d.getDay())) return false;
      const weeks = Math.floor((daysBetween(s, d) + s.getDay()) / 7);
      return weeks % n === 0;
    }

    case 'monthly': {
      const months = (d.getFullYear() - s.getFullYear()) * 12 + d.getMonth() - s.getMonth();
      if (months % n !== 0) return false;
      const last = daysIn(d.getFullYear(), d.getMonth());
      const day = d.getDate();
      if (r.monthMode === 'last') return day === last;
      if (r.monthMode === 'weekday') {
        if (d.getDay() !== r.weekday) return false;
        return r.ordinal === -1 ? day + 7 > last : Math.ceil(day / 7) === r.ordinal;
      }
      return day === Math.min(r.monthDay, last);
    }

    case 'yearly': {
      if (r.calendar === 'lunar') return lunarDatesInYear(routine, d.getFullYear()).includes(key);
      if ((d.getFullYear() - s.getFullYear()) % n !== 0) return false;
      if (d.getMonth() + 1 !== r.month) return false;
      return d.getDate() === Math.min(r.day, daysIn(d.getFullYear(), r.month - 1));
    }

    default:
      return false;
  }
}

// The next `count` dates on or after `fromKey`.
export function nextDates(routine, fromKeyValue, count = 6) {
  const dates = [];
  let key = fromKeyValue < routine.startDate ? routine.startDate : fromKeyValue;
  const limit = routine.rule.freq === 'yearly' ? 366 * (count + 1) * Math.max(1, routine.rule.interval || 1) : 3700;
  for (let i = 0; i < limit && dates.length < count; i++) {
    if (routine.endDate && key > routine.endDate) break;
    if (occursOn(routine, key)) dates.push(key);
    key = addDays(key, 1);
  }
  return dates;
}

// Plain-English summary, such as "Repeats every Mon, Wed and Fri".
export function describeRule(rule) {
  const n = Math.max(1, rule.interval || 1);
  const joinAnd = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  switch (rule.freq) {
    case 'daily':
      return n === 1 ? 'Repeats every day' : `Repeats every ${n} days`;
    case 'weekly': {
      const days = (rule.weekdays || []).slice().sort((a, b) => a - b).map((i) => WEEKDAYS_SHORT[i]);
      if (!days.length) return 'Pick at least one day';
      return n === 1 ? `Repeats every ${joinAnd(days)}` : `Repeats every ${n} weeks on ${joinAnd(days)}`;
    }
    case 'monthly': {
      let what = `the ${ordinalSuffix(rule.monthDay)}`;
      if (rule.monthMode === 'last') what = 'the last day';
      if (rule.monthMode === 'weekday') what = `the ${ORDINALS[rule.ordinal]} ${WEEKDAYS[rule.weekday]}`;
      return n === 1 ? `Repeats on ${what} of every month` : `Repeats on ${what} every ${n} months`;
    }
    case 'yearly': {
      const what = rule.calendar === 'lunar'
        ? `lunar month ${rule.lunarMonth}, day ${rule.lunarDay}`
        : `${MONTHS[rule.month - 1]} ${rule.day}`;
      return n === 1 ? `Repeats every year on ${what}` : `Repeats every ${n} years on ${what}`;
    }
    default:
      return 'Does not repeat';
  }
}

export { MONTHS_SHORT, toKey };
