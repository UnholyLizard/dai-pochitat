// Tiny DOM helpers shared by the admin modules.
export const $ = (sel, root = document) => root.querySelector(sel);

export function node(tag, props = {}, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
}

/** Library time zone: loan due dates are whole days there. */
export const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Podgorica' }).format(new Date());

export function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Same day-of-month, `months` later; clamped to the target month's length (31 Jan → 28/29 Feb). */
export function addMonthsIso(iso, months) {
  const [y, m, d] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(y, m + months, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, last))).toISOString().slice(0, 10);
}

export const fmtDay = (iso) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString([], { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Debounce for search boxes. */
export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
