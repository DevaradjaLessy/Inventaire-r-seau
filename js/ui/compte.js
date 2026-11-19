/* Interface — comptes (mode serveur) : écran de connexion et de première initialisation,
   menu du compte, gestion des utilisateurs et consultation du journal d'audit. */
import { $, download, esc, fmtDateTime, today } from '../utils.js';
import { ico } from '../icones.js';
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { Actions, Changes, Inputs, Modal, toast } from './socle.js';

const ROLES = { lecture: 'Lecture seule', technicien: 'Technicien', administrateur: 'Administrateur' };
const champ = (label, name, type = 'text', extra = '') => `<label class="f"><span>${label}</span><input type="${type}" name="${name}" ${extra}></label>`;

/* Affiche l'écran de connexion (ou de création du premier compte) et attend qu'il aboutisse */
function ecran(mode, message = '') {
  return new Promise(fini => {
    $('#auth')?.remove();
    const el = document.createElement('div');
    el.id = 'auth';
    const init = mode === 'initialisation';
    el.innerHTML = `<form class="auth-card" data-mode="${mode}" autocomplete="on">
      <div class="brand" style="justify-content:center;margin-bottom:6px"><span>Net<b>Carto</b></span></div>
      <h2>${init ? 'Créer le compte administrateur' : 'Connexion'}</h2>
      <p class="muted">${init ? 'Premier lancement : aucun compte n\'existe encore. Saisissez le code d\'initialisation affiché au démarrage du serveur (dans sa console ou son journal).' : esc(message) || 'Identifiez-vous pour accéder à NetCarto.'}</p>
      ${init ? champ('Code d\'initialisation', 'code', 'text', 'placeholder="XXXX-XXXX-XXXX" autocomplete="off" required autofocus') : ''}
      ${champ('Identifiant', 'identifiant', 'text', `autocomplete="username" required ${init ? '' : 'autofocus'}`)}
      ${init ? champ('Nom affiché', 'nom', 'text', 'autocomplete="name"') : ''}
      ${champ(init ? 'Mot de passe (12 caractères au moins)' : 'Mot de passe', 'motDePasse', 'password', `autocomplete="${init ? 'new-password' : 'current-password'}" required`)}
      ${init ? champ('Confirmer le mot de passe', 'confirmation', 'password', 'autocomplete="new-password" required') : ''}
      <div class="auth-err" role="alert"></div>
      <button class="btn pri" type="submit">${init ? 'Créer le compte et entrer' : 'Se connecter'}</button></form>`;
    document.body.appendChild(el);
    const form = el.firstElementChild, err = form.querySelector('.auth-err');
    form.querySelector('[autofocus]')?.focus();
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const v = Object.fromEntries(new FormData(form)), bouton = form.querySelector('button[type=submit]');
      err.textContent = '';
      if (init && v.motDePasse !== v.confirmation) { err.textContent = 'Les deux mots de passe ne sont pas identiques.'; return; }
      bouton.disabled = true;
      try { Sync.utilisateur = (init ? await Sync.appel('POST', '/initialisation', v) : await Sync.appel('POST', '/session', { identifiant: v.identifiant, motDePasse: v.motDePasse })).utilisateur; el.remove(); fini(); }
      catch (e2) { err.textContent = e2.message; bouton.disabled = false; }
    });
  });
}
/* S'assure qu'une session est ouverte : affiche l'écran qui convient si ce n'est pas le cas */
async function ouvrirSession(message) {
  const s = await Sync.appel('GET', '/session');
  if (s.connecte) { Sync.utilisateur = s.utilisateur; return; }
  Sync.utilisateur = null;
  await ecran(s.initialisation ? 'initialisation' : 'connexion', message);
}
/* Session expirée pendant le travail : on se reconnecte, puis on relit la base */
let reconnexion = null;
Sync.surDeconnexion = () => {
  if (reconnexion) return;
  Modal.close();
  reconnexion = ecran('connexion', 'Votre session a expiré. Reconnectez-vous pour continuer.').then(async () => { reconnexion = null; await Store.recharger(); toast('Reconnecté', 'ok'); });
};

/* --- Menu du compte --- */
Actions['compte-menu'] = () => {
  const u = Sync.utilisateur, admin = u.role === 'administrateur';
  Modal.open({ title: 'Mon compte', ok: false, cancel: 'Fermer',
    body: `<div class="d-head" style="margin:0 0 14px"><div class="dico">${ico('user')}</div><div><h2>${esc(u.nom || u.identifiant)}</h2><div class="sub">${esc(u.identifiant)} · ${ROLES[u.role]}</div></div></div>
      <div class="compte-actions"><button class="btn" data-act="compte-mdp">${ico('edit')}Changer mon mot de passe</button>
      ${admin ? `<button class="btn" data-act="compte-utilisateurs">${ico('user')}Utilisateurs</button><button class="btn" data-act="compte-audit">${ico('history')}Journal d'audit</button><button class="btn" data-act="compte-sauvegardes">${ico('download')}Sauvegardes</button>` : ''}
      <button class="btn danger" data-act="compte-deconnexion">${ico('out')}Se déconnecter</button></div>` });
};
Actions['compte-deconnexion'] = async () => { Modal.close(); try { await Sync.appel('DELETE', '/session'); } catch { /* déjà déconnecté */ } location.reload(); };
Actions['compte-mdp'] = () => Modal.open({
  title: 'Changer mon mot de passe', ok: 'Changer',
  body: `<div class="form-grid" style="grid-template-columns:1fr">${champ('Mot de passe actuel', 'actuel', 'password', 'autocomplete="current-password" autofocus')}${champ('Nouveau mot de passe (12 caractères au moins)', 'nouveau', 'password', 'autocomplete="new-password"')}${champ('Confirmer le nouveau mot de passe', 'confirmation', 'password', 'autocomplete="new-password"')}</div>`,
  onOk(v) {
    if (v.nouveau !== v.confirmation) throw new Error('Les deux mots de passe ne sont pas identiques.');
    Sync.appel('PUT', '/session/mot-de-passe', { actuel: v.actuel, nouveau: v.nouveau }).then(() => { Modal.close(); toast('Mot de passe changé. Vos autres sessions ont été fermées.', 'ok'); }, e => toast(e.message, 'err'));
    return false;
  },
});

/* --- Utilisateurs (administrateur) --- */
const roleOptions = cur => Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${v}</option>`).join('');
async function chargerUtilisateurs() {
  const liste = await Sync.appel('GET', '/utilisateurs'), moi = Sync.utilisateur.id, hote = $('#users-list');
  if (!hote) return;
  hote.innerHTML = liste.map(u => `<div class="u-row" data-id="${u.id}">
    <div><b>${esc(u.identifiant)}</b>${u.id === moi ? ' <span class="chip">vous</span>' : ''}<div class="muted">${esc(u.nom)}${u.derniereConnexion ? ` · vu le ${fmtDateTime(u.derniereConnexion)}` : ' · jamais connecté'}</div></div>
    <select data-chg="user-role" ${u.id === moi ? 'disabled' : ''}>${roleOptions(u.role)}</select>
    <label class="row" style="gap:5px" data-tip="Un compte désactivé ne peut plus se connecter"><input type="checkbox" data-chg="user-actif" ${u.actif ? 'checked' : ''} ${u.id === moi ? 'disabled' : ''}>Actif</label>
    <div class="row" style="gap:4px;justify-content:flex-end">${u.verrouille ? `<button class="btn sm" data-act="user-unlock" data-tip="Compte verrouillé après plusieurs échecs">${ico('alert')}Déverrouiller</button>` : ''}
      <button class="btn sm" data-act="user-mdp" data-ident="${esc(u.identifiant)}">Mot de passe</button><button class="btn sm icon danger" data-act="user-del" data-ident="${esc(u.identifiant)}" ${u.id === moi ? 'disabled' : ''} data-tip="Supprimer">${ico('trash')}</button></div></div>`).join('');
}
const ouvrirUtilisateurs = () => {
  Modal.open({ title: 'Utilisateurs', wide: true, ok: false, cancel: 'Fermer',
    body: `<p class="muted" style="margin:0 0 12px"><b>Lecture seule</b> : consulte tout. <b>Technicien</b> : modifie les données. <b>Administrateur</b> : gère aussi les comptes, le journal d'audit et le remplacement de la base.</p>
      <div id="users-list"><div class="empty">Chargement…</div></div>
      <div class="sec-t" style="margin:16px 0 8px">Nouveau compte</div>
      <div class="u-new" id="user-new"><input type="text" name="u-identifiant" placeholder="Identifiant" autocomplete="off"><input type="text" name="u-nom" placeholder="Nom affiché" autocomplete="off"><select name="u-role">${roleOptions('technicien')}</select><input type="password" name="u-mdp" placeholder="Mot de passe (12 caractères au moins)" autocomplete="new-password"><button class="btn pri" data-act="user-add">${ico('plus')}Créer</button></div>` });
  chargerUtilisateurs().catch(e => toast(e.message, 'err'));
};
const requeteCompte = (p, message) => p.then(() => { if (message) toast(message, 'ok'); return chargerUtilisateurs(); }).catch(e => { toast(e.message, 'err'); return chargerUtilisateurs().catch(() => {}); });
const idLigne = el => el.closest('.u-row').dataset.id;
Actions['compte-utilisateurs'] = ouvrirUtilisateurs;
Actions['user-add'] = () => { const v = n => $(`#user-new [name=u-${n}]`).value; requeteCompte(Sync.appel('POST', '/utilisateurs', { identifiant: v('identifiant'), nom: v('nom'), role: v('role'), motDePasse: v('mdp') }).then(() => { for (const n of ['identifiant', 'nom', 'mdp']) $(`#user-new [name=u-${n}]`).value = ''; }), 'Compte créé'); };
Changes['user-role'] = el => requeteCompte(Sync.appel('PUT', '/utilisateurs/' + idLigne(el), { role: el.value }), 'Rôle modifié');
Changes['user-actif'] = el => requeteCompte(Sync.appel('PUT', '/utilisateurs/' + idLigne(el), { actif: el.checked }), el.checked ? 'Compte réactivé' : 'Compte désactivé : ses sessions sont fermées');
Actions['user-unlock'] = el => requeteCompte(Sync.appel('PUT', '/utilisateurs/' + idLigne(el), { deverrouiller: true }), 'Compte déverrouillé');
Actions['user-del'] = el => { const id = idLigne(el); Modal.confirm('Supprimer le compte', `Supprimer le compte <b>${esc(el.dataset.ident)}</b> ? Le journal d'audit garde la trace de ses actions.`, () => { requeteCompte(Sync.appel('DELETE', '/utilisateurs/' + id), 'Compte supprimé').then(ouvrirUtilisateurs); return false; }, 'Supprimer', 'danger'); };
Actions['user-mdp'] = el => { const id = idLigne(el); Modal.open({ title: `Nouveau mot de passe — ${esc(el.dataset.ident)}`, ok: 'Enregistrer',
  body: `<div class="form-grid" style="grid-template-columns:1fr">${champ('Nouveau mot de passe (12 caractères au moins)', 'motDePasse', 'password', 'autocomplete="new-password" autofocus')}</div><p class="muted" style="margin:10px 0 0">Les sessions ouvertes de ce compte seront fermées.</p>`,
  onOk(v) { Sync.appel('PUT', '/utilisateurs/' + id, { motDePasse: v.motDePasse, deverrouiller: true }).then(() => { toast('Mot de passe enregistré', 'ok'); ouvrirUtilisateurs(); }, e => toast(e.message, 'err')); return false; } }); };

/* --- Journal d'audit (administrateur) --- */
const ACTIONS = { sauvegarde: 'Sauvegarde', sauvegarde_supprimer: 'Sauvegarde supprimée', restauration: 'Restauration', creer: 'Création', modifier: 'Modification', supprimer: 'Suppression', remplacement: 'Remplacement de la base', connexion: 'Connexion', echec_connexion: 'Échec de connexion', utilisateur_creer: 'Compte créé', utilisateur_modifier: 'Compte modifié', utilisateur_supprimer: 'Compte supprimé', mot_de_passe: 'Mot de passe changé' };
const OBJETS = { sites: 'site', buildings: 'bâtiment', floors: 'étage', rooms: 'pièce', racks: 'baie', devices: 'équipement', ports: 'port', outlets: 'prise', cables: 'câble', catalog: 'modèle', stock: 'stock', vlans: 'VLAN', utilisateurs: 'compte' };
const court = v => { const s = v === null || v === undefined || v === '' ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 60 ? s.slice(0, 57) + '…' : s; };
/* Champs qui diffèrent entre la valeur avant et la valeur après */
function ecarts(avant, apres) {
  const plat = o => Object.fromEntries(Object.entries(o || {}).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v).map(([k2, v2]) => [`${k}.${k2}`, v2]) : [[k, v]])));
  const a = plat(avant), b = plat(apres);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(k => `<span class="a-chg"><b>${esc(k)}</b> : ${esc(court(a[k]))} → ${esc(court(b[k]))}</span>`);
}
const Audit = { identifiant: '', lignes: [] };
function ligneAudit(a) {
  const detail = a.action === 'modifier' ? ecarts(a.avant, a.apres).join('') : a.action === 'remplacement' || a.action === 'restauration' ? esc(Object.entries(a.apres || {}).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ')) : a.action === 'utilisateur_modifier' ? esc(Object.entries(a.apres || {}).map(([k, v]) => `${k} : ${v}`).join(', ')) : '';
  return `<div class="a-row"><span class="muted">${fmtDateTime(a.date)}</span><b>${esc(a.identifiant || 'système')}</b><span class="chip">${ACTIONS[a.action] || esc(a.action)}</span>
    <div><span>${a.collection && OBJETS[a.collection] ? OBJETS[a.collection] + ' ' : ''}<b>${esc(a.libelle)}</b></span>${detail ? `<div class="a-detail">${detail}</div>` : ''}</div></div>`;
}
async function chargerAudit(suite = false) {
  const dernier = suite ? Audit.lignes.at(-1)?.id : null;
  const lignes = await Sync.appel('GET', `/audit?limite=100${Audit.identifiant ? '&identifiant=' + encodeURIComponent(Audit.identifiant) : ''}${dernier ? '&avant=' + dernier : ''}`);
  Audit.lignes = suite ? [...Audit.lignes, ...lignes] : lignes;
  const hote = $('#audit-list');
  if (!hote) return;
  hote.innerHTML = Audit.lignes.map(ligneAudit).join('') || '<div class="empty">Aucune entrée</div>';
  $('#audit-suite').classList.toggle('hidden', lignes.length < 100);
}
Actions['compte-audit'] = () => {
  Audit.identifiant = ''; Audit.lignes = [];
  Modal.open({ title: 'Journal d\'audit', wide: true, ok: false, cancel: 'Fermer',
    body: `<div class="row" style="margin-bottom:12px"><input type="search" id="audit-filtre" data-inp="audit-filtre" placeholder="Filtrer par identifiant" style="flex:1"><button class="btn" data-act="audit-csv" data-tip="Exporter|Télécharger les entrées affichées (CSV)">${ico('download')}CSV</button><span class="muted">Qui, quand, quoi, valeur avant → après. Ce journal ne se modifie pas.</span></div>
      <div id="audit-list"><div class="empty">Chargement…</div></div><div style="text-align:center;margin-top:10px"><button class="btn hidden" id="audit-suite" data-act="audit-suite">Entrées plus anciennes</button></div>` });
  chargerAudit().catch(e => toast(e.message, 'err'));
};
/* Le filtre s'applique pendant la saisie, après une courte pause */
let minuterieFiltre = 0;
Inputs['audit-filtre'] = el => { clearTimeout(minuterieFiltre); minuterieFiltre = setTimeout(() => { Audit.identifiant = el.value.trim(); chargerAudit().catch(e => toast(e.message, 'err')); }, 250); };
/* Export des entrées affichées, pour un rapport ou une enquête */
Actions['audit-csv'] = () => {
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`, j = v => (v == null ? '' : JSON.stringify(v));
  const lignes = Audit.lignes.map(a => [new Date(a.date).toISOString(), a.identifiant, a.action, a.collection, a.libelle, j(a.avant), j(a.apres), a.ip].map(q).join(';'));
  download(`netcarto-audit-${today()}.csv`, '\ufeff' + ['date;identifiant;action;objet;libelle;avant;apres;adresse', ...lignes].join('\r\n'), 'text/csv');
};
Actions['audit-suite'] = () => chargerAudit(true).catch(e => toast(e.message, 'err'));

export { ouvrirSession, ROLES };
