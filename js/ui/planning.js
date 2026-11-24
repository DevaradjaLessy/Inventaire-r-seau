/* Interface — interventions planifiées : fenêtre de saisie, carte du tableau de bord, section des fiches.
   Toute l'équipe voit qui doit faire quoi, sur quel objet et pour quand. */
import { INTERV_STATUS } from '../config.js';
import { esc, fmtDate, fmtDateTime, plural } from '../utils.js';
import { ico } from '../icones.js';
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { byId, labelOf, locLabel } from '../services/requetes.js';
import { avancer, enRetard, interventionsDe, modifierIntervention, ouvertes, planifier, supprimerIntervention, terminees } from '../services/planification.js';
import { Actions, Modal, toast, undoAction } from './socle.js';

const etat = i => `<span class="chip" style="border-color:${INTERV_STATUS[i.status].color};color:${INTERV_STATUS[i.status].color}">${INTERV_STATUS[i.status].label}</span>`;
/* Boutons d'une intervention : avancer d'un état, modifier, supprimer */
const boutons = i => `<span class="iv-acts">${i.status === 'planned' ? `<button class="btn sm" data-act="interv-etat" data-id="${i.id}" data-s="doing" data-tip="Commencer|L'intervention passe « en cours »">Commencer</button>` : ''}
  ${i.status !== 'done' ? `<button class="btn sm" data-act="interv-etat" data-id="${i.id}" data-s="done" data-tip="Terminer|L'intervention est faite">${ico('check')}Terminer</button>` : `<button class="btn sm" data-act="interv-etat" data-id="${i.id}" data-s="planned" data-tip="Rouvrir|L'intervention revient « à venir »">Rouvrir</button>`}
  <button class="btn sm icon ghost" data-act="interv-edit" data-id="${i.id}" data-tip="Modifier">${ico('edit')}</button><button class="btn sm icon ghost danger" data-act="interv-del" data-id="${i.id}" data-tip="Supprimer">${ico('trash')}</button></span>`;
/* Une ligne : titre, objet visé (un clic y mène), date, personne chargée, état */
function ligne(i, { objet = true } = {}) {
  const o = i.ref ? byId(i.ref) : null, retard = enRetard(i);
  return `<div class="iv-row ${retard ? 'retard' : ''}" data-id="${i.id}"><div class="iv-t"><b>${esc(i.title)}</b>
      <small>${objet ? (o ? `<a data-act="go" data-id="${i.ref}" data-tip="${esc(labelOf(i.ref))}|${esc(locLabel(i.ref))}">${esc(labelOf(i.ref))}</a> · ` : i.ref ? 'objet supprimé · ' : '') : ''}${i.date ? `prévue le ${fmtDate(i.date)}` : 'sans date'}${i.assignee ? ` · ${esc(i.assignee)}` : ' · à attribuer'}${i.status === 'done' && i.doneAt ? ` · terminée le ${fmtDateTime(i.doneAt)}` : ''}</small>
      ${i.note ? `<small class="iv-note">${esc(i.note)}</small>` : ''}</div>
    ${retard ? `<span class="chip warn">${ico('alert')}en retard</span>` : ''}${etat(i)}${boutons(i)}</div>`;
}
/* Carte du tableau de bord */
function interventionsCard() {
  const a = ouvertes(), t = terminees().slice(0, 5), retard = a.filter(enRetard).length;
  return `<div class="dcard c5" id="interv-card"><div class="dt"><span class="ti">${ico('history')}</span><h3>Interventions à venir</h3><span class="grow"></span>
      <span class="muted">${a.length ? `${plural(a.length, 'intervention')}${retard ? `, dont ${retard} en retard` : ''}` : 'rien de prévu'}</span>
      <button class="btn sm" data-act="interv-new" data-tip="Planifier|Une intervention générale. Pour viser un équipement, une prise ou une pièce, passez par sa fiche.">${ico('plus')}Planifier</button></div>
    <div class="scroll iv-ouvertes">${a.map(i => ligne(i)).join('') || '<div class="empty">Aucune intervention prévue.<br>Planifiez-en une depuis la fiche d\'un équipement, d\'une prise ou d\'une pièce.</div>'}</div>
    ${t.length ? `<details class="iv-faites"><summary>${plural(terminees().length, 'intervention terminée', 'interventions terminées')}</summary>${t.map(i => ligne(i)).join('')}</details>` : ''}</div>`;
}
/* Section d'une fiche : ce qui est prévu sur cet objet, et le bouton pour planifier */
function interventionsSec(ref) {
  const a = interventionsDe(ref);
  return `<div class="d-sec interv"><div class="sec-t">Interventions${a.length ? ` (${a.length})` : ''}</div>${a.map(i => ligne(i, { objet: false })).join('')}
    <div class="btns"><button class="btn sm" data-act="interv-new" data-id="${ref}" data-tip="Planifier une intervention|Ce qu'il est prévu de faire ici, par qui et pour quand. Toute l'équipe le voit.">${ico('plus')}Planifier une intervention</button></div></div>`;
}
/* Fenêtre de saisie, pour créer (ref : objet visé ou rien) ou modifier (i : intervention existante) */
function ouvrir(ref, i = null) {
  const o = ref && byId(ref) ? ref : null, noms = [...new Set([Sync.utilisateur?.nom, ...Store.db.interventions.map(x => x.assignee)].filter(Boolean))];
  const v = i || { title: '', note: '', date: '', assignee: Sync.utilisateur?.nom || '' };
  Modal.open({ title: `${i ? 'Modifier l\'intervention' : 'Planifier une intervention'}${o ? ` — ${esc(labelOf(o))}` : ''}`, ok: i ? 'Enregistrer' : 'Planifier',
    body: `${o ? `<p class="muted" style="margin:0 0 12px">${esc(locLabel(o))}</p>` : ''}
      <div class="form-grid"><label class="f full"><span>Ce qu'il faut faire</span><input type="text" name="title" maxlength="200" value="${esc(v.title)}" placeholder="Remplacer la borne, tirer une prise, mettre à jour le firmware…" autofocus></label>
      <label class="f"><span>Date prévue (facultative)</span><input type="date" name="date" value="${esc(v.date)}"></label>
      <label class="f"><span>Qui s'en charge</span><input type="text" name="assignee" maxlength="80" value="${esc(v.assignee)}" list="iv-noms" placeholder="Nom ou équipe"><datalist id="iv-noms">${noms.map(n => `<option value="${esc(n)}">`).join('')}</datalist></label>
      <label class="f full"><span>Note (matériel à prévoir, accès, contact sur place…)</span><textarea name="note" rows="3" maxlength="4000">${esc(v.note)}</textarea></label></div>`,
    onOk(f) {
      if (i) { modifierIntervention(i.id, f); toast('Intervention modifiée', 'ok', undoAction); }
      else { planifier(o, f); toast('Intervention planifiée', 'ok', undoAction); }
      return true;
    } });
}
const trouver = id => Store.db.interventions.find(x => x.id === id);
Actions['interv-new'] = el => ouvrir(el.dataset.id || null);
Actions['interv-edit'] = el => { const i = trouver(el.dataset.id); if (i) ouvrir(i.ref, i); };
// Depuis une alerte : un compte qui peut écrire ouvre la modification ; un compte en lecture seule est mené à l'objet visé
Actions['interv-voir'] = el => { const i = trouver(el.dataset.id); if (!i) return; if (document.body.classList.contains('role-lecture')) { if (i.ref && byId(i.ref)) Actions.go({ dataset: { id: i.ref } }); } else ouvrir(i.ref, i); };
Actions['interv-etat'] = el => { avancer(el.dataset.id, el.dataset.s); toast(`Intervention : ${INTERV_STATUS[el.dataset.s].label.toLowerCase()}`, 'ok', undoAction); };
Actions['interv-del'] = el => { const i = trouver(el.dataset.id); if (!i) return; Modal.confirm('Supprimer l\'intervention', `Supprimer « <b>${esc(i.title)}</b> » ? Pour garder sa trace, préférez « Terminer ».`, () => { supprimerIntervention(i.id); toast('Intervention supprimée', 'ok', undoAction); return true; }, 'Supprimer', 'danger'); };

export { interventionsCard, interventionsSec };
