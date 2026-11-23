/* Services — interventions planifiées : ce qu'il est prévu de faire, sur quel objet, par qui et pour quand.
   Une intervention suit trois états : à venir, en cours, terminée. Elle peut ne viser aucun objet (tâche générale). */
import { INTERV_STATUS } from '../config.js';
import { nextId, today } from '../utils.js';
import { Cache, Store } from '../store.js';
import { Sync } from '../sync.js';
import { byId, labelOf } from './requetes.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/* Contrôle et met en forme la saisie : { title, note, date, assignee } */
function saisie(v) {
  const title = String(v.title ?? '').trim(), note = String(v.note ?? '').trim(), date = String(v.date ?? '').trim(), assignee = String(v.assignee ?? '').trim();
  if (!title) throw new Error('Le titre de l\'intervention est obligatoire.');
  if (title.length > 200) throw new Error('Titre trop long (200 caractères au plus).');
  if (note.length > 4000) throw new Error('Note trop longue (4 000 caractères au plus).');
  if (assignee.length > 80) throw new Error('Nom trop long (80 caractères au plus).');
  if (date && (!DATE.test(date) || Number.isNaN(Date.parse(date)))) throw new Error('Date attendue au format jour/mois/année.');
  return { title, note, date, assignee };
}
const cible = ref => (ref && byId(ref) ? ` (${labelOf(ref)})` : '');
/* Planifie une intervention. ref : identifiant de l'objet visé, ou rien. Renvoie l'identifiant créé. */
function planifier(ref, v) {
  const s = saisie(v);
  return Store.commit('add', `Intervention planifiée : ${s.title}${cible(ref)}`, db => {
    const i = { id: nextId(db, 'int'), ref: ref && byId(ref) ? ref : null, ...s, status: 'planned', createdBy: Sync.utilisateur?.identifiant || '', createdAt: Date.now(), doneAt: null };
    db.interventions.push(i); return i.id;
  }, ref || null);
}
function modifierIntervention(id, v) {
  const s = saisie(v), i = Store.db.interventions.find(x => x.id === id);
  if (!i) throw new Error('Intervention introuvable : elle a peut-être été supprimée.');
  Store.commit('edit', `Intervention modifiée : ${s.title}${cible(i.ref)}`, db => { Object.assign(db.interventions.find(x => x.id === id), s); }, i.ref);
}
/* Change l'état : planned, doing ou done. Terminer note l'heure ; rouvrir l'efface. */
function avancer(id, status) {
  const i = Store.db.interventions.find(x => x.id === id);
  if (!i || !INTERV_STATUS[status]) throw new Error('Intervention ou état inconnu.');
  if (i.status === status) return;
  Store.commit('edit', `Intervention « ${i.title} » : ${INTERV_STATUS[status].label.toLowerCase()}${cible(i.ref)}`, db => { Object.assign(db.interventions.find(x => x.id === id), { status, doneAt: status === 'done' ? Date.now() : null }); }, i.ref);
}
function supprimerIntervention(id) {
  const i = Store.db.interventions.find(x => x.id === id);
  if (!i) return;
  Store.commit('remove', `Intervention supprimée : ${i.title}${cible(i.ref)}`, db => { db.interventions.splice(db.interventions.findIndex(x => x.id === id), 1); }, i.ref);
}
/* En retard : date prévue passée, et pas terminée */
const enRetard = i => i.status !== 'done' && !!i.date && i.date < today();
/* À faire, dans l'ordre où s'en occuper : en cours d'abord, puis par date prévue (sans date à la fin) */
function ouvertes() {
  return Cache.get('interv-ouvertes', () => Store.db.interventions.filter(i => i.status !== 'done')
    .sort((a, b) => (b.status === 'doing') - (a.status === 'doing') || (a.date || '9999').localeCompare(b.date || '9999') || a.createdAt - b.createdAt));
}
const terminees = () => Store.db.interventions.filter(i => i.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
const interventionsDe = ref => ouvertes().filter(i => i.ref === ref);

export { avancer, enRetard, interventionsDe, modifierIntervention, ouvertes, planifier, supprimerIntervention, terminees };
