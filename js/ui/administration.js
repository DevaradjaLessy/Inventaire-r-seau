/* Page d'administration (mode serveur, administrateurs) : adresse /admin.
   Elle regroupe en un seul endroit : comptes et rôles, journal d'audit, sauvegardes, sécurité. */
import { $, esc } from '../utils.js';
import { ico } from '../icones.js';
import { Sync } from '../sync.js';
import { Actions, Modal, showTab, toast, UI, Views } from './socle.js';
import { chargerUtilisateurs, corpsAudit, corpsUtilisateurs, ouvrirAudit } from './compte.js';
import { chargerSauvegardes, corpsSauvegardes } from './sauvegardes.js';
import { remplirSecurite } from './tableau-de-bord.js';

const RUBRIQUES = {
  comptes: { t: 'Comptes et rôles', i: 'user', corps: corpsUtilisateurs, charger: chargerUtilisateurs },
  audit: { t: 'Journal d\'audit', i: 'history', corps: corpsAudit, charger: ouvrirAudit },
  sauvegardes: { t: 'Sauvegardes', i: 'download', corps: corpsSauvegardes, charger: chargerSauvegardes },
  securite: { t: 'Sécurité du serveur', i: 'alert', corps: () => '<div id="sec-etat"><div class="empty">Chargement…</div></div>', charger: async () => remplirSecurite() },
};
const Adm = { r: 'comptes' };
function rubrique() {
  const r = RUBRIQUES[Adm.r];
  for (const b of document.querySelectorAll('#tab-admin [data-act=admin-rubrique]')) b.classList.toggle('on', b.dataset.r === Adm.r);
  $('#adm-corps').innerHTML = `<h2>${ico(r.i)}${r.t}</h2>${r.corps()}`;
  Promise.resolve(r.charger()).catch(e => toast(e.message, 'err'));
}
Views.admin = {
  render() {
    const u = Sync.utilisateur;
    $('#tab-admin').innerHTML = `<div class="adm">
      <header class="adm-h"><div><h1>Administration</h1><p class="muted">Connecté : <b>${esc(u?.nom || u?.identifiant || '')}</b>${u?.courriel ? ` · ${esc(u.courriel)}` : ''}. Cette page est réservée aux administrateurs ; son adresse se termine par <span class="mono">/admin</span>.</p></div></header>
      <nav class="adm-nav">${Object.entries(RUBRIQUES).map(([k, r]) => `<button class="btn" data-act="admin-rubrique" data-r="${k}">${ico(r.i)}${r.t}</button>`).join('')}</nav>
      <section class="adm-corps" id="adm-corps"></section></div>`;
    rubrique();
  },
  show() { /* la page garde son état tant qu'on ne change pas de rubrique */ },
};
Actions['admin-rubrique'] = el => { Adm.r = el.dataset.r; rubrique(); };
Actions['compte-admin'] = () => { Modal.close(); showTab('admin'); };

/* Raccourcis vers une rubrique, depuis le reste de l'application (carte « Sécurité » du tableau de bord) et après une action
   faite dans la page (mot de passe changé, sauvegarde supprimée) : il n'existe plus de fenêtres séparées pour ces écrans. */
for (const [action, r] of [['compte-utilisateurs', 'comptes'], ['compte-audit', 'audit'], ['compte-sauvegardes', 'sauvegardes']]) {
  Actions[action] = () => { Modal.close(); Adm.r = r; if (UI.tab !== 'admin') showTab('admin'); if (UI.tab === 'admin' && $('#adm-corps')) rubrique(); };
}
