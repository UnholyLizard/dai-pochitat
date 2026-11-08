// Admin tab: Parties & gatherings (#5) management (add, edit, delete events, instagram links).
import { api } from '../lib/api.js';
import { $, node, debounce } from './dom.js';

let state = {
  q: '',
  filter: '', // '' | 'upcoming' | 'past'
  events: [],
};

let editing = null;
let initialized = false;

function fmtDt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtRange(start, end) {
  const s = fmtDt(start);
  const e = fmtDt(end);
  return `${s} – ${e}`;
}

function renderList() {
  const list = $('[data-e-list]');
  const count = $('[data-e-count]');
  if (!list) return;

  const now = Date.now();
  const q = state.q.toLowerCase().trim();

  const filtered = state.events.filter((ev) => {
    const isPast = new Date(ev.end).getTime() < now;
    if (state.filter === 'upcoming' && isPast) return false;
    if (state.filter === 'past' && !isPast) return false;
    if (q) {
      const haystack = `${ev.title_ru} ${ev.title_en || ''} ${ev.text_ru || ''} ${ev.text_en || ''} ${ev.ages_ru || ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  count.textContent = `Показано событий: ${filtered.length} из ${state.events.length}`;

  list.replaceChildren(...filtered.map((ev) => {
    const isPast = new Date(ev.end).getTime() < now;
    const badgeText = isPast ? 'Прошло' : 'Предстоит';
    const badgeClass = isPast ? 'badge' : 'badge badge--owner';

    const links = [];
    if (ev.instagram_announce) {
      links.push(node('a', { href: ev.instagram_announce, target: '_blank', rel: 'noopener', textContent: '📸 Анонс' }));
    }
    if (ev.instagram_recap) {
      links.push(node('a', { href: ev.instagram_recap, target: '_blank', rel: 'noopener', textContent: '✨ Как это было' }));
    }

    const editBtn = node('button', { type: 'button', className: 'ghost', textContent: 'Изменить' });
    editBtn.addEventListener('click', () => openEditor(ev));

    const delBtn = node('button', { type: 'button', className: 'ghost', textContent: '✕' });
    delBtn.setAttribute('aria-label', 'Удалить');
    delBtn.addEventListener('click', () => askDelete(ev));

    return node('li', { className: isPast ? 'is-past' : '' },
      node('div', { className: 'event__date' },
        node('div', {}, fmtRange(ev.start, ev.end)),
        node('span', { className: badgeClass, style: 'margin-top: 4px;' }, badgeText),
        ev.ages_ru ? node('span', { className: 'badge', style: 'margin-top: 4px; margin-left: 4px;' }, ev.ages_ru) : ''
      ),
      node('div', { className: 'event__main' },
        node('strong', { textContent: ev.title_ru }),
        ev.title_en ? node('small', { textContent: ev.title_en, style: 'color: var(--ink-3);' }) : '',
        ev.text_ru ? node('p', { textContent: ev.text_ru }) : '',
        links.length ? node('div', { className: 'event__links' }, ...links) : ''
      ),
      editBtn,
      delBtn
    );
  }));
}

async function load() {
  try {
    const data = await api('/api/admin/events');
    state.events = data.events || [];
    renderList();
  } catch (err) {
    const count = $('[data-e-count]');
    if (count) count.textContent = `Ошибка загрузки событий: ${err.message || err}`;
  }
}

function openEditor(event = null) {
  editing = event;
  const dialog = $('[data-e-editor]');
  const form = $('[data-e-form]');
  const title = $('[data-e-title]');
  const err = $('[data-e-error]');
  const delBtn = $('[data-e-delete]');

  err.hidden = true;
  title.textContent = event ? 'Редактировать событие' : 'Новое событие';
  delBtn.hidden = !event;

  form.elements.title_ru.value = event?.title_ru || '';
  form.elements.title_en.value = event?.title_en || '';
  form.elements.start.value = event?.start || '';
  form.elements.end.value = event?.end || '';
  form.elements.ages_ru.value = event?.ages_ru || '';
  form.elements.ages_en.value = event?.ages_en || '';
  form.elements.text_ru.value = event?.text_ru || '';
  form.elements.text_en.value = event?.text_en || '';
  form.elements.instagram_announce.value = event?.instagram_announce || '';
  form.elements.instagram_recap.value = event?.instagram_recap || '';

  dialog.showModal();
}

function closeEditor() {
  const dialog = $('[data-e-editor]');
  dialog.close();
  editing = null;
}

function askDelete(event) {
  const dialog = $('[data-e-confirm]');
  const nameEl = $('[data-e-confirm-name]');
  nameEl.textContent = `${event.title_ru} (${fmtRange(event.start, event.end)})`;

  const onYes = async () => {
    try {
      await api(`/api/admin/events/${encodeURIComponent(event.id)}`, { method: 'DELETE' });
      dialog.close();
      await load();
    } catch (err) {
      alert(`Не удалось удалить: ${err.message || err}`);
    }
  };

  const yesBtn = $('[data-e-confirm-yes]');
  const noBtn = $('[data-e-confirm-no]');

  const cleanup = () => {
    yesBtn.removeEventListener('click', onYes);
    noBtn.removeEventListener('click', onNo);
  };
  const onNo = () => {
    cleanup();
    dialog.close();
  };

  yesBtn.addEventListener('click', onYes, { once: true });
  noBtn.addEventListener('click', onNo, { once: true });

  dialog.showModal();
}

export function initEvents() {
  if (initialized) {
    load();
    return;
  }
  initialized = true;

  const qInput = $('[data-e-q]');
  if (qInput) {
    qInput.addEventListener('input', debounce((e) => {
      state.q = e.target.value;
      renderList();
    }, 200));
  }

  const filterSelect = $('[data-e-filter]');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      state.filter = e.target.value;
      renderList();
    });
  }

  const addBtn = $('[data-e-add]');
  if (addBtn) addBtn.addEventListener('click', () => openEditor(null));

  const closeBtn = $('[data-e-close]');
  if (closeBtn) closeBtn.addEventListener('click', closeEditor);

  const cancelBtn = $('[data-e-cancel]');
  if (cancelBtn) cancelBtn.addEventListener('click', closeEditor);

  const delBtn = $('[data-e-delete]');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      if (!editing) return;
      const target = editing;
      closeEditor();
      askDelete(target);
    });
  }

  const form = $('[data-e-form]');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('[data-e-error]');
      const saveBtn = $('[data-e-save]');
      err.hidden = true;
      saveBtn.disabled = true;

      const body = {
        title_ru: form.elements.title_ru.value.trim(),
        title_en: form.elements.title_en.value.trim(),
        start: form.elements.start.value.trim(),
        end: form.elements.end.value.trim(),
        ages_ru: form.elements.ages_ru.value.trim(),
        ages_en: form.elements.ages_en.value.trim(),
        text_ru: form.elements.text_ru.value.trim(),
        text_en: form.elements.text_en.value.trim(),
        instagram_announce: form.elements.instagram_announce.value.trim(),
        instagram_recap: form.elements.instagram_recap.value.trim(),
      };

      try {
        if (editing) {
          await api(`/api/admin/events/${encodeURIComponent(editing.id)}`, { method: 'PUT', body });
        } else {
          await api('/api/admin/events', { method: 'POST', body });
        }
        closeEditor();
        await load();
      } catch (error) {
        err.textContent = error.message || String(error);
        err.hidden = false;
      } finally {
        saveBtn.disabled = false;
      }
    });
  }

  load();
}

