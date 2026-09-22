// Holidays shown in red on the calendar.
// US federal holidays are calculated by rule, so they work for any year.
// Korean holidays come from holiday-feed.js, with the 2026 and 2027 dates
// built in as a fallback.

import { toKey, daysIn } from './dates.js';

const KR_BUILTIN = {
  '2026-01-01': "New Year's Day", '2026-02-16': 'Seollal holiday', '2026-02-17': 'Seollal', '2026-02-18': 'Seollal holiday',
  '2026-03-01': 'Independence Movement Day', '2026-03-02': 'Substitute holiday', '2026-05-01': 'Labor Day',
  '2026-05-05': "Children's Day", '2026-05-24': "Buddha's Birthday", '2026-05-25': 'Substitute holiday',
  '2026-06-03': 'Local elections', '2026-06-06': 'Memorial Day', '2026-07-17': 'Constitution Day',
  '2026-08-15': 'Liberation Day', '2026-08-17': 'Substitute holiday', '2026-09-24': 'Chuseok holiday',
  '2026-09-25': 'Chuseok', '2026-09-26': 'Chuseok holiday', '2026-10-03': 'National Foundation Day',
  '2026-10-05': 'Substitute holiday', '2026-10-09': 'Hangul Day', '2026-12-25': 'Christmas Day',
  '2027-01-01': "New Year's Day", '2027-02-06': 'Seollal holiday', '2027-02-07': 'Seollal', '2027-02-08': 'Seollal holiday',
  '2027-02-09': 'Substitute holiday', '2027-03-01': 'Independence Movement Day', '2027-05-01': 'Labor Day',
  '2027-05-03': 'Substitute holiday', '2027-05-05': "Children's Day", '2027-05-13': "Buddha's Birthday",
  '2027-06-06': 'Memorial Day', '2027-07-17': 'Constitution Day', '2027-07-19': 'Substitute holiday',
  '2027-08-15': 'Liberation Day', '2027-08-16': 'Substitute holiday', '2027-09-14': 'Chuseok holiday',
  '2027-09-15': 'Chuseok', '2027-09-16': 'Chuseok holiday', '2027-10-03': 'National Foundation Day',
  '2027-10-04': 'Substitute holiday', '2027-10-09': 'Hangul Day', '2027-10-11': 'Substitute holiday',
  '2027-12-25': 'Christmas Day', '2027-12-27': 'Substitute holiday'
};

// English names for the official Korean names. Spaces are ignored when
// matching, so "부처님 오신 날" and "부처님오신날" both work.
const KR_NAMES = [
  ['1월1일', "New Year's Day"], ['신정', "New Year's Day"], ['1절', 'Independence Movement Day'],
  ['삼일절', 'Independence Movement Day'], ['노동절', 'Labor Day'], ['근로자의날', 'Labor Day'],
  ['어린이날', "Children's Day"], ['부처님오신날', "Buddha's Birthday"], ['석가탄신일', "Buddha's Birthday"],
  ['현충일', 'Memorial Day'], ['제헌절', 'Constitution Day'], ['광복절', 'Liberation Day'],
  ['개천절', 'National Foundation Day'], ['한글날', 'Hangul Day'], ['기독탄신일', 'Christmas Day'],
  ['성탄절', 'Christmas Day'], ['임시공휴일', 'Temporary holiday']
];

export function krName(name) {
  const n = name.replace(/\s/g, '');
  if (n.startsWith('대체')) return 'Substitute holiday';
  if (n.includes('선거')) return 'Election day';
  if (n.startsWith('설날')) return n === '설날' ? 'Seollal' : 'Seollal holiday';
  if (n.startsWith('추석')) return n === '추석' ? 'Chuseok' : 'Chuseok holiday';
  const match = KR_NAMES.find(([ko]) => n.includes(ko));
  return match ? match[1] : name;
}

// ---------- US ----------

const usCache = new Map();

function nthWeekday(year, month, weekday, n) {
  const first = new Date(year, month, 1).getDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
}

function lastWeekday(year, month, weekday) {
  const last = daysIn(year, month);
  const lastDay = new Date(year, month, last).getDay();
  return last - ((lastDay - weekday + 7) % 7);
}

function usHolidays(year) {
  if (usCache.has(year)) return usCache.get(year);
  const out = new Map();
  const add = (month, day, name) => out.set(toKey(new Date(year, month, day)), name);
  // Fixed-date holidays move to Friday or Monday when they fall on a weekend.
  const fixed = (month, day, name) => {
    add(month, day, name);
    const weekday = new Date(year, month, day).getDay();
    if (weekday === 6) add(month, day - 1, `${name} (observed)`);
    if (weekday === 0) add(month, day + 1, `${name} (observed)`);
  };
  fixed(0, 1, "New Year's Day");
  add(0, nthWeekday(year, 0, 1, 3), 'Martin Luther King Jr. Day');
  add(1, nthWeekday(year, 1, 1, 3), "Presidents' Day");
  add(4, lastWeekday(year, 4, 1), 'Memorial Day');
  fixed(5, 19, 'Juneteenth');
  fixed(6, 4, 'Independence Day');
  add(8, nthWeekday(year, 8, 1, 1), 'Labor Day');
  add(9, nthWeekday(year, 9, 1, 2), 'Columbus Day');
  fixed(10, 11, 'Veterans Day');
  add(10, nthWeekday(year, 10, 4, 4), 'Thanksgiving');
  fixed(11, 25, 'Christmas Day');
  usCache.set(year, out);
  return out;
}

function usName(key) {
  const year = Number(key.slice(0, 4));
  // New Year's Day observed can fall on Dec 31 of the year before.
  return usHolidays(year).get(key) || usHolidays(year + 1).get(key) || null;
}

// ---------- Korea ----------

// fetched is a map of 'YYYY-MM-DD' to a list of official Korean names.
function krNames(key, fetched) {
  const year = key.slice(0, 4);
  const hasYear = fetched && Object.keys(fetched).some((k) => k.startsWith(year));
  if (hasYear) return (fetched[key] || []).map(krName);
  return KR_BUILTIN[key] ? [KR_BUILTIN[key]] : [];
}

// Holidays on a date, as [{ name, regions: ['US', 'KR'] }].
export function holidaysOn(key, { us, kr, fetched }) {
  const found = [];
  const push = (name, region) => {
    const same = found.find((h) => h.name === name);
    if (same) {
      if (!same.regions.includes(region)) same.regions.push(region);
    } else {
      found.push({ name, regions: [region] });
    }
  };
  if (us) {
    const name = usName(key);
    if (name) push(name, 'US');
  }
  if (kr) [...new Set(krNames(key, fetched))].forEach((name) => push(name, 'KR'));
  return found;
}

export function holidayLabel(list) {
  return list.map((h) => `${h.name} (${h.regions.join(', ')})`).join(' · ');
}
