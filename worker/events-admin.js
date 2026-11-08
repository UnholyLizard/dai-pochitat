// /api/admin/events* — Manage block #5 parties & gatherings.
import { json, readJson } from './util.js';
import { translateEvent } from './ai-translate.js';

const TEXT = {
  title_ru: 300, title_en: 300,
  text_ru: 2000, text_en: 2000,
  ages_ru: 100, ages_en: 100,
  start: 32, end: 32,
  instagram_announce: 500, instagram_recap: 500,
};

function slugify(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .replace(/[^\w\u0400-\u04FF-]+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'event';
}

function clean(body, { partial = false } = {}) {
  const v = {};
  for (const [key, max] of Object.entries(TEXT)) {
    if (!(key in body)) continue;
    if (body[key] != null && typeof body[key] !== 'string') return { error: `${key} must be text` };
    v[key] = (body[key] ?? '').trim().slice(0, max);
  }
  if (!partial || 'title_ru' in body) {
    if (!v.title_ru) return { error: 'title_ru is required' };
  }
  if (!partial || 'start' in body) {
    if (!v.start) return { error: 'start is required' };
  }
  if (!partial || 'end' in body) {
    v.end = v.end || '';
  }
  return { values: v };
}

export async function eventsAdminRoutes(request, env, url) {
  const path = url.pathname;
  if (!path.startsWith('/api/admin/events')) return null;

  const idMatch = path.match(/^\/api\/admin\/events\/([a-zA-Z0-9_-]+)$/);
  const targetId = idMatch ? decodeURIComponent(idMatch[1]) : null;

  // GET /api/admin/events
  if (request.method === 'GET' && path === '/api/admin/events') {
    const { results } = await env.DB.prepare('SELECT * FROM events ORDER BY start DESC').all();
    return json({ events: results || [] });
  }

  // POST /api/admin/events/translate
  if (request.method === 'POST' && path === '/api/admin/events/translate') {
    const body = await readJson(request, 16384);
    if (!body) return json({ error: 'bad request' }, 400);
    const tr = await translateEvent(body, env);
    return json({ translation: tr });
  }

  // POST /api/admin/events
  if (request.method === 'POST' && path === '/api/admin/events') {
    const body = await readJson(request, 16384);
    if (!body) return json({ error: 'bad request' }, 400);

    const { values, error } = clean(body, { partial: false });
    if (error) return json({ error }, 400);

    if (body.ai_translate || (!values.title_en && body.ai_translate !== false)) {
      const tr = await translateEvent({
        title_ru: values.title_ru,
        ages_ru: values.ages_ru,
        text_ru: values.text_ru,
      }, env);
      if (tr.title_en && !values.title_en) values.title_en = tr.title_en;
      if (tr.ages_en && !values.ages_en) values.ages_en = tr.ages_en;
      if (tr.text_en && !values.text_en) values.text_en = tr.text_en;
    }

    const id = body.id?.trim() || `${slugify(values.title_ru || values.title_en)}-${Date.now().toString(36)}`;
    const now = Date.now();

    await env.DB.prepare(
      `INSERT INTO events (id, start, end, title_ru, title_en, text_ru, text_en, ages_ru, ages_en, instagram_announce, instagram_recap, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`
    ).bind(
      id, values.start, values.end, values.title_ru, values.title_en || '',
      values.text_ru || '', values.text_en || '', values.ages_ru || '', values.ages_en || '',
      values.instagram_announce || '', values.instagram_recap || '', now, now
    ).run();

    const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(id).first();
    return json({ event }, 201);
  }

  // PUT /api/admin/events/:id
  if (request.method === 'PUT' && targetId) {
    const body = await readJson(request, 16384);
    if (!body) return json({ error: 'bad request' }, 400);

    const existing = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(targetId).first();
    if (!existing) return json({ error: 'event not found' }, 404);

    const { values, error } = clean(body, { partial: true });
    if (error) return json({ error }, 400);

    if (body.ai_translate || (values.title_ru && !values.title_en && body.ai_translate !== false)) {
      const tr = await translateEvent({
        title_ru: values.title_ru || existing.title_ru,
        ages_ru: values.ages_ru || existing.ages_ru,
        text_ru: values.text_ru || existing.text_ru,
      }, env);
      if (tr.title_en && !values.title_en) values.title_en = tr.title_en;
      if (tr.ages_en && !values.ages_en) values.ages_en = tr.ages_en;
      if (tr.text_en && !values.text_en) values.text_en = tr.text_en;
    }

    const merged = { ...existing, ...values, updated_at: Date.now() };

    await env.DB.prepare(
      `UPDATE events SET start = ?1, end = ?2, title_ru = ?3, title_en = ?4, text_ru = ?5, text_en = ?6,
                         ages_ru = ?7, ages_en = ?8, instagram_announce = ?9, instagram_recap = ?10, updated_at = ?11
       WHERE id = ?12`
    ).bind(
      merged.start, merged.end, merged.title_ru, merged.title_en, merged.text_ru, merged.text_en,
      merged.ages_ru, merged.ages_en, merged.instagram_announce, merged.instagram_recap, merged.updated_at, targetId
    ).run();

    const event = await env.DB.prepare('SELECT * FROM events WHERE id = ?').bind(targetId).first();
    return json({ event });
  }

  // DELETE /api/admin/events/:id
  if (request.method === 'DELETE' && targetId) {
    const res = await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(targetId).run();
    if (!res.meta?.changes && res.changes === 0) return json({ error: 'event not found' }, 404);
    return json({ ok: true, deleted: targetId });
  }

  return json({ error: 'not found' }, 404);
}

