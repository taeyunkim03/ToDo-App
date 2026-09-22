// Date helpers. Every date is stored as a 'YYYY-MM-DD' string in local time,
// which keeps comparisons simple and avoids time zone surprises.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isKey(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function todayKey() {
  return toKey(new Date());
}

export function addDays(key, n) {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

// Number of days in a month (month is 0-based).
export function daysIn(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Whole days from a to b, safe across daylight saving changes.
export function daysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

// Weeks for a month view, starting on Sunday.
export function monthWeeks(year, month) {
  const lead = new Date(year, month, 1).getDay();
  const rows = Math.ceil((lead + daysIn(year, month)) / 7);
  const weeks = [];
  for (let w = 0; w < rows; w++) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(year, month, 1 - lead + w * 7 + i);
      week.push({ key: toKey(date), date, inMonth: date.getMonth() === month });
    }
    weeks.push(week);
  }
  return weeks;
}

// "Monday, Sep 21", with the year when it is not the current year.
export function dayTitle(key, today) {
  const d = fromKey(key);
  let title = `${WEEKDAYS[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  if (d.getFullYear() !== fromKey(today).getFullYear()) title += `, ${d.getFullYear()}`;
  return title;
}

// "Tue, Sep 22"
export function shortDate(key) {
  const d = fromKey(key);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

// "Sep 22" or "Sep 22, 2027" when the year differs from the reference.
export function monthDay(key, referenceYear) {
  const d = fromKey(key);
  const text = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  return referenceYear && d.getFullYear() !== referenceYear ? `${text}, ${d.getFullYear()}` : text;
}

export function ordinalSuffix(n) {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  const o = n % 10;
  return n + (o === 1 ? 'st' : o === 2 ? 'nd' : o === 3 ? 'rd' : 'th');
}
