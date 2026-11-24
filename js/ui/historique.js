/* Historique complet des actions : filtre par texte et par type, retour à l'état d'avant une action encore annulable. */
import { HISTORY_TYPES } from '../config.js';
import { $, esc, fmtDateTime, norm, plural } from '../utils.js';
import { ico } from '../icones.js';
import { Store } from '../store.js';
import { Actions, Changes, Inputs, Modal, toast } from './socle.js';

const Hist = { q: '', type: '' };
function lister() {
  const hote = $('#hist-list');
  if (!hote) return;
  const q = norm(Hist.q.trim());
  // Rang, dans la pile d'annulation, de l'action liée à chaque entrée de l'historique (0 = la plus récente)
  const rang = new Map(); Store.undoStack.forEach((u, i) => { if (u.hid) rang.set(u.hid, Store.undoStack.length - 1 - i); });
  const lignes = Store.db.history.filter(h => (!Hist.type || h.type === Hist.type) && (!q || norm(h.text).includes(q)));
  hote.innerHTML = lignes.slice(0, 300).map(h => `<div class="h-row"><span class="muted">${fmtDateTime(h.ts)}</span><span class="chip">${HISTORY_TYPES[h.type] || esc(h.type)}</span><b>${esc(h.text)}</b>
      ${rang.has(h.id) ? `<button class="btn sm" data-act="hist-retour" data-hid="${esc(h.id)}" data-tip="Revenir à l'état d'avant cette action|Cette action et les ${rang.get(h.id) ? 'suivantes sont annulées' : 'suivantes, s\'il y en a, sont annulées'}">${ico('undo')}Revenir avant</button>` : '<span></span>'}</div>`).join('')
    || '<div class="empty">Aucune action ne correspond.</div>';
  $('#hist-n').textContent = `${plural(lignes.length, 'action')}${lignes.length > 300 ? ' (300 affichées)' : ''}`;
}
Actions.historique = () => {
  Object.assign(Hist, { q: '', type: '' });
  Modal.open({ title: 'Historique des actions', wide: true, ok: false, cancel: 'Fermer',
    body: `<div class="row" style="margin-bottom:10px;flex-wrap:wrap"><input type="search" id="hist-q" data-inp="hist-q" placeholder="Filtrer : nom, baie, prise…" style="flex:1 1 200px">
        <select id="hist-type" data-chg="hist-type"><option value="">Tous les types</option>${Object.entries(HISTORY_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><span class="muted" id="hist-n"></span></div>
      <p class="muted" style="margin:0 0 10px">« Revenir avant » défait l'action choisie et toutes celles faites après elle. Seules les actions de cette visite sont concernées (${Store.MAX_UNDO} au plus).</p>
      <div id="hist-list"></div>` });
  lister();
};
Inputs['hist-q'] = el => { Hist.q = el.value; lister(); };
Changes['hist-type'] = el => { Hist.type = el.value; lister(); };
Actions['hist-retour'] = el => {
  const hid = el.dataset.hid, i = Store.undoStack.findIndex(u => u.hid === hid);
  if (i < 0) throw new Error('Cette action ne peut plus être annulée.');
  const n = Store.undoStack.length - i, h = Store.db.history.find(x => x.id === hid);
  Modal.confirm('Revenir à un état antérieur', `${n > 1 ? `${n} actions seront annulées` : '1 action sera annulée'}, jusqu'à « <b>${esc(h?.text || '')}</b> » comprise.`, () => {
    for (let k = 0; k < n; k++) Store.undo();
    toast(n > 1 ? `${n} actions annulées` : 'Action annulée', 'ok');
    return true;
  }, 'Revenir', 'danger');
};
