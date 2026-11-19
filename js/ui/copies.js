/* Mode démonstration — copies de secours gardées dans le navigateur : liste, restauration, téléchargement. */
import { $, download, fmtDateTime, plural } from '../utils.js';
import { ico } from '../icones.js';
import { Store } from '../store.js';
import { Stockage } from '../stockage.js';
import { Actions, Modal, toast, undoAction } from './socle.js';

const dateDe = el => +el.closest('.cp-row').dataset.date;
async function charger() {
  const liste = await Stockage.copies(), hote = $('#copies-list');
  if (!hote) return;
  hote.innerHTML = liste.map(c => `<div class="cp-row" data-date="${c.date}"><b>${fmtDateTime(c.date)}</b>
      <span class="muted">${plural(c.equipements, 'équipement')}, ${plural(c.prises, 'prise')} — dernière modification le ${fmtDateTime(c.modifiee)}</span>
      <div class="row" style="gap:4px;justify-content:flex-end"><button class="btn sm icon" data-act="copie-telecharger" data-tip="Télécharger">${ico('download')}</button><button class="btn sm" data-act="copie-restaurer">Restaurer</button></div></div>`).join('')
    || '<div class="empty">Aucune copie pour l\'instant : la première sera faite à la prochaine ouverture de la page.</div>';
}
Actions.copies = () => {
  Modal.open({ title: 'Copies de secours', wide: true, ok: false, cancel: 'Fermer',
    body: `<p class="muted" style="margin:0 0 12px">À chaque ouverture de la page, l'état de la base est gardé ici ; les cinq copies les plus récentes sont conservées.
      Elles restent dans ce navigateur : pour une copie durable, utilisez l'export ${ico('download')} ou téléchargez une copie.</p><div id="copies-list"><div class="empty">Chargement…</div></div>` });
  charger();
};
Actions['copie-telecharger'] = async el => { const d = dateDe(el), base = await Stockage.copie(d); if (base) download(`netcarto-copie-${new Date(d).toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`, JSON.stringify(base, null, 1)); };
Actions['copie-restaurer'] = el => {
  const d = dateDe(el);
  Modal.confirm('Restaurer une copie', `Remplacer les données actuelles par la copie du <b>${fmtDateTime(d)}</b> ? La restauration peut être annulée.`, () => {
    Stockage.copie(d).then(base => {
      const err = base ? Store.validate(base) : 'Copie introuvable.';
      if (err) return toast(`Restauration impossible : ${err}`, 'err');
      Store.replace(base, `Restauration de la copie du ${fmtDateTime(d)}`); Modal.close(); toast('Copie restaurée', 'ok', undoAction);
    });
    return false;
  }, 'Restaurer');
};
