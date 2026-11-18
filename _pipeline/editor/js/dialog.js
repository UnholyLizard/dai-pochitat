// Promise-based modal on <dialog>: ask({title, body, input, ok, cancel, danger}) -> input value / true, or null if cancelled.
// Resolves from the submit / cancel handlers themselves (the dialog's close event can be deferred in background tabs).
import { h } from './util.js';

export function ask({ title, body = '', input = null, ok = 'OK', cancel = 'Cancel', danger = false, extra = null }) {
  return new Promise((resolve) => {
    let done = false;
    const field = input ? h('input', { type: 'text', value: input.value || '', placeholder: input.placeholder || '', spellcheck: false, 'aria-label': title }) : null;
    const err = h('p.derr', { role: 'alert' });
    const okBtn = h(`button.primary${danger ? '.danger' : ''}`, { type: 'submit' }, ok);
    const form = h('form', { method: 'dialog' },
      h('h3', title),
      body ? (typeof body === 'string' ? h('p', body) : body) : null,
      field, err, extra,
      // cancel is type=button so Enter in the field submits OK (the form's only submit button)
      h('div.dact', cancel ? h('button', { type: 'button', on: { click: () => finish(null) } }, cancel) : null, okBtn));
    const dlg = h('dialog.dlg', form);
    const finish = (v) => {
      if (done) return;
      done = true;
      if (dlg.open) dlg.close();
      dlg.remove();
      resolve(v);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = field ? field.value.trim() : true;
      const msg = field && input.validate ? input.validate(v) : null;
      if (msg) { err.textContent = msg; field.focus(); return; }
      finish(v);
    });
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); finish(null); });   // Esc
    dlg.addEventListener('close', () => finish(null));
    document.body.append(dlg);
    dlg.showModal();
    if (field) { field.focus(); field.select(); } else okBtn.focus();
  });
}

export const confirmAsk = (title, body, ok = 'Continue', danger = false) => ask({ title, body, ok, danger }).then((v) => v === true);
