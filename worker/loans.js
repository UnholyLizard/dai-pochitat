// Loan helpers shared by the public catalog and the admin routes.

const TZ = 'Europe/Podgorica';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Today as YYYY-MM-DD in the library's time zone (loan due dates are whole days). */
export const today = () => fmt.format(new Date());

/** Validate a YYYY-MM-DD date that is a real day within a year of today. */
export function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) return false;
  const now = Date.parse(`${today()}T00:00:00Z`);
  return Math.abs(t - now) <= 366 * 86_400_000;
}

const marks = (n) => Array.from({ length: n }, () => '?').join(',');

/** Map of book id → due date for the books among `ids` that are out right now. */
export async function dueDates(env, ids) {
  const out = new Map();
  if (!ids.length) return out;
  const { results } = await env.DB.prepare(
    `SELECT book_id, due_date FROM loans WHERE returned_at IS NULL AND book_id IN (${marks(ids.length)})`,
  ).bind(...ids).all();
  for (const r of results ?? []) out.set(r.book_id, r.due_date);
  return out;
}

/** Public view: add `due_date` (no reader details) to borrowed books. */
export async function withDueDates(env, books) {
  const out = await dueDates(env, books.filter((b) => b.status === 'borrowed').map((b) => b.id));
  return books.map((b) => (out.has(b.id) ? { ...b, due_date: out.get(b.id) } : b));
}

/** Staff view: add the current loan with the reader's name to every book that is out. */
export async function withLoans(env, books) {
  const ids = books.map((b) => b.id);
  if (!ids.length) return books;
  const { results } = await env.DB.prepare(
    `SELECT l.id, l.book_id, l.user_id, l.due_date, u.first_name, u.last_name, u.username
       FROM loans l JOIN users u ON u.id = l.user_id
      WHERE l.returned_at IS NULL AND l.book_id IN (${marks(ids.length)})`,
  ).bind(...ids).all();
  const byBook = new Map((results ?? []).map((r) => [r.book_id, {
    id: r.id,
    user_id: r.user_id,
    user: [r.first_name, r.last_name].filter(Boolean).join(' ') || r.username || `#${r.user_id}`,
    due_date: r.due_date,
  }]));
  return books.map((b) => (byBook.has(b.id) ? { ...b, loan: byBook.get(b.id) } : b));
}
