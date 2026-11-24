/* Interface — comptes (mode serveur) : écran de connexion et de première initialisation,
   menu du compte, gestion des utilisateurs et consultation du journal d'audit. */
import { $, csvCell, download, esc, fmtDateTime, today } from '../utils.js';
import { ico } from '../icones.js';
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { Actions, Changes, Inputs, Modal, toast } from './socle.js';

const ROLES = { lecture: 'Lecture seule', technicien: 'Technicien', administrateur: 'Administrateur' };
const champ = (label, name, type = 'text', extra = '') => `<label class="f"><span>${label}</span><input type="${type}" name="${name}" ${extra}></label>`;

/* Écrans d'entrée : connexion, création du premier compte, mot de passe oublié, choix d'un nouveau mot de passe.
   La promesse aboutit quand une session est ouverte. */
const Entree = { parCourriel: false };
function ecran(mode, message = '', jeton = '') {
  return new Promise(fini => {
    $('#auth')?.remove();
    const el = document.createElement('div');
    el.id = 'auth'; document.body.appendChild(el);
    const dessiner = (m, msg = '') => {
      const init = m === 'initialisation', titre = { initialisation: 'Créer le compte administrateur', connexion: 'Connexion', oubli: 'Mot de passe oublié', reinitialisation: 'Choisir un nouveau mot de passe' }[m];
      const texte = { initialisation: 'Premier lancement : aucun compte n\'existe encore. Saisissez le code d\'initialisation affiché au démarrage du serveur (dans sa console ou son journal).', connexion: 'Identifiez-vous pour accéder à NetCarto.',
        oubli: Entree.parCourriel ? 'Indiquez votre adresse de courriel ou votre identifiant. Si un compte correspond, un lien valable 30 minutes lui est envoyé.' : 'Adressez-vous à un administrateur de NetCarto : depuis la page d\'administration, il vous remet un lien pour choisir un nouveau mot de passe.',
        reinitialisation: 'Ce lien ne sert qu\'une fois. Choisissez un mot de passe d\'au moins 12 caractères.' }[m];
      el.innerHTML = `<form class="auth-card" data-mode="${m}" autocomplete="on">
        <div class="brand" style="justify-content:center;margin-bottom:6px"><span>Net<b>Carto</b></span></div>
        <h2>${titre}</h2><p class="muted">${esc(msg) || texte}</p>
        ${init ? champ('Code d\'initialisation', 'code', 'text', 'placeholder="XXXX-XXXX-XXXX" autocomplete="off" required autofocus') : ''}
        ${init ? champ('Identifiant', 'identifiant', 'text', 'autocomplete="username" required') + champ('Nom affiché', 'nom', 'text', 'autocomplete="name"') + champ('Adresse de courriel (facultatif)', 'courriel', 'email', 'autocomplete="email"') : ''}
        ${m === 'connexion' ? champ('Identifiant ou adresse de courriel', 'identifiant', 'text', 'autocomplete="username" required autofocus') + champ('Mot de passe', 'motDePasse', 'password', 'autocomplete="current-password" required') : ''}
        ${m === 'oubli' && Entree.parCourriel ? champ('Adresse de courriel ou identifiant', 'compte', 'text', 'autocomplete="username" required autofocus') : ''}
        ${init || m === 'reinitialisation' ? champ(init ? 'Mot de passe (12 caractères au moins)' : 'Nouveau mot de passe', 'motDePasse', 'password', `autocomplete="new-password" required ${init ? '' : 'autofocus'}`) + champ('Confirmer le mot de passe', 'confirmation', 'password', 'autocomplete="new-password" required') : ''}
        <div class="auth-err" role="alert"></div>
        ${m === 'oubli' && !Entree.parCourriel ? '' : `<button class="btn pri" type="submit">${{ initialisation: 'Créer le compte et entrer', connexion: 'Se connecter', oubli: 'Envoyer le lien', reinitialisation: 'Enregistrer le mot de passe' }[m]}</button>`}
        ${m === 'connexion' ? '<a class="auth-lien" data-auth="oubli" href="#">Mot de passe oublié ?</a>' : m === 'oubli' || m === 'reinitialisation' ? '<a class="auth-lien" data-auth="retour" href="#">Retour à la connexion</a>' : ''}</form>`;
      const form = el.firstElementChild, err = form.querySelector('.auth-err');
      form.querySelector('[autofocus]')?.focus();
      form.addEventListener('click', e => { const a = e.target.closest('[data-auth]'); if (!a) return; e.preventDefault(); dessiner(a.dataset.auth === 'oubli' ? 'oubli' : 'connexion'); });
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const v = Object.fromEntries(new FormData(form)), bouton = form.querySelector('button[type=submit]');
        err.textContent = '';
        if ((init || m === 'reinitialisation') && v.motDePasse !== v.confirmation) { err.textContent = 'Les deux mots de passe ne sont pas identiques.'; return; }
        bouton.disabled = true;
        try {
          if (m === 'oubli') { await Sync.appel('POST', '/recuperation', { compte: v.compte }); return dessiner('connexion', 'Si un compte correspond, un courriel vient de lui être envoyé. Pensez à regarder les courriers indésirables.'); }
          if (m === 'reinitialisation') {
            await Sync.appel('POST', '/recuperation/mot-de-passe', { jeton, motDePasse: v.motDePasse });
            history.replaceState(null, '', location.pathname);   // le lien ne reste ni dans l'adresse ni dans l'historique
            return dessiner('connexion', 'Mot de passe changé. Connectez-vous avec le nouveau.');
          }
          Sync.utilisateur = (init ? await Sync.appel('POST', '/initialisation', v) : await Sync.appel('POST', '/session', { identifiant: v.identifiant, motDePasse: v.motDePasse })).utilisateur;
          el.remove(); fini();
        } catch (e2) { err.textContent = e2.message; bouton.disabled = false; }
      });
    };
    dessiner(mode, message);
  });
}
/* S'assure qu'une session est ouverte : affiche l'écran qui convient si ce n'est pas le cas */
async function ouvrirSession(message) {
  const s = await Sync.appel('GET', '/session'), jeton = new URLSearchParams(location.search).get('reinitialisation');
  Entree.parCourriel = !!s.recuperationParCourriel;
  // Lien de réinitialisation : il passe avant tout, même si une session est ouverte sur ce poste
  if (jeton) { if (s.connecte) { try { await Sync.appel('DELETE', '/session'); } catch { /* session déjà fermée */ } } Sync.utilisateur = null; return ecran('reinitialisation', '', jeton); }
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
      ${admin ? `<button class="btn pri" data-act="compte-admin" data-tip="Comptes, journal d'audit, sauvegardes, sécurité">${ico('user')}Page d'administration</button>` : ''}
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
    <div><b>${esc(u.identifiant)}</b>${u.id === moi ? ' <span class="chip">vous</span>' : ''}<div class="muted">${esc(u.nom)}${u.courriel ? ` · ${esc(u.courriel)}` : ' · <span class="dim">sans courriel</span>'}${u.derniereConnexion ? ` · vu le ${fmtDateTime(u.derniereConnexion)}` : ' · jamais connecté'}</div></div>
    <select data-chg="user-role" ${u.id === moi ? 'disabled' : ''}>${roleOptions(u.role)}</select>
    <label class="row" style="gap:5px" data-tip="Un compte désactivé ne peut plus se connecter"><input type="checkbox" data-chg="user-actif" ${u.actif ? 'checked' : ''} ${u.id === moi ? 'disabled' : ''}>Actif</label>
    <div class="row" style="gap:4px;justify-content:flex-end">${u.verrouille ? `<button class="btn sm" data-act="user-unlock" data-tip="Compte verrouillé après plusieurs échecs">${ico('alert')}Déverrouiller</button>` : ''}
      <button class="btn sm" data-act="user-courriel" data-ident="${esc(u.identifiant)}" data-courriel="${esc(u.courriel)}" data-tip="Adresse de courriel|Elle sert à se connecter et à recevoir un lien de réinitialisation">Courriel</button>
      <button class="btn sm" data-act="user-lien" data-ident="${esc(u.identifiant)}" data-tip="Lien de réinitialisation|À remettre au collègue : il choisit lui-même son nouveau mot de passe">Lien</button>
      <button class="btn sm" data-act="user-mdp" data-ident="${esc(u.identifiant)}">Mot de passe</button><button class="btn sm icon danger" data-act="user-del" data-ident="${esc(u.identifiant)}" ${u.id === moi ? 'disabled' : ''} data-tip="Supprimer">${ico('trash')}</button></div></div>`).join('');
}
/* Contenu de la gestion des comptes : dans une fenêtre, ou dans la page d'administration */
const corpsUtilisateurs = () => `<p class="muted" style="margin:0 0 12px"><b>Lecture seule</b> : consulte tout. <b>Technicien</b> : modifie les données. <b>Administrateur</b> : gère aussi les comptes, le journal d'audit et le remplacement de la base.</p>
      <div id="users-list"><div class="empty">Chargement…</div></div>
      <div class="sec-t" style="margin:16px 0 8px">Nouveau compte</div>
      <div class="u-new" id="user-new"><input type="text" name="u-identifiant" placeholder="Identifiant" autocomplete="off"><input type="text" name="u-nom" placeholder="Nom affiché" autocomplete="off"><input type="email" name="u-courriel" placeholder="Courriel (facultatif)" autocomplete="off"><select name="u-role">${roleOptions('technicien')}</select><input type="password" name="u-mdp" placeholder="Mot de passe (12 caractères au moins)" autocomplete="new-password"><button class="btn pri" data-act="user-add">${ico('plus')}Créer</button></div>`;
const requeteCompte = (p, message) => p.then(() => { if (message) toast(message, 'ok'); return chargerUtilisateurs(); }).catch(e => { toast(e.message, 'err'); return chargerUtilisateurs().catch(() => {}); });
const idLigne = el => el.closest('.u-row').dataset.id;
/* Les champs lus sont ceux du formulaire qui porte le bouton, pas ceux d'un autre endroit de la page */
Actions['user-add'] = el => { const f = el.closest('.u-new'), c = n => f.querySelector(`[name=u-${n}]`), v = n => c(n).value; requeteCompte(Sync.appel('POST', '/utilisateurs', { identifiant: v('identifiant'), nom: v('nom'), courriel: v('courriel'), role: v('role'), motDePasse: v('mdp') }).then(() => { for (const n of ['identifiant', 'nom', 'courriel', 'mdp']) c(n).value = ''; }), 'Compte créé'); };
Changes['user-role'] = el => requeteCompte(Sync.appel('PUT', '/utilisateurs/' + idLigne(el), { role: el.value }), 'Rôle modifié');
Changes['user-actif'] = el => requeteCompte(Sync.appel('PUT', '/utilisateurs/' + idLigne(el), { actif: el.checked }), el.checked ? 'Compte réactivé' : 'Compte désactivé : ses sessions sont fermées');
Actions['user-unlock'] = el => requeteCompte(Sync.appel('PUT', '/utilisateurs/' + idLigne(el), { deverrouiller: true }), 'Compte déverrouillé');
Actions['user-del'] = el => { const id = idLigne(el); Modal.confirm('Supprimer le compte', `Supprimer le compte <b>${esc(el.dataset.ident)}</b> ? Le journal d'audit garde la trace de ses actions.`, () => { requeteCompte(Sync.appel('DELETE', '/utilisateurs/' + id), 'Compte supprimé').then(() => Actions['compte-utilisateurs']()); return false; }, 'Supprimer', 'danger'); };
Actions['user-mdp'] = el => { const id = idLigne(el); Modal.open({ title: `Nouveau mot de passe — ${esc(el.dataset.ident)}`, ok: 'Enregistrer',
  body: `<div class="form-grid" style="grid-template-columns:1fr">${champ('Nouveau mot de passe (12 caractères au moins)', 'motDePasse', 'password', 'autocomplete="new-password" autofocus')}</div><p class="muted" style="margin:10px 0 0">Les sessions ouvertes de ce compte seront fermées.</p>`,
  onOk(v) { Sync.appel('PUT', '/utilisateurs/' + id, { motDePasse: v.motDePasse, deverrouiller: true }).then(() => { toast('Mot de passe enregistré', 'ok'); Actions['compte-utilisateurs'](); }, e => toast(e.message, 'err')); return false; } }); };

Actions['user-courriel'] = el => { const id = idLigne(el); Modal.open({ title: `Adresse de courriel — ${esc(el.dataset.ident)}`, ok: 'Enregistrer',
  body: `<div class="form-grid" style="grid-template-columns:1fr">${champ('Adresse de courriel (vide pour l\'effacer)', 'courriel', 'email', `value="${esc(el.dataset.courriel)}" autocomplete="off" autofocus`)}</div>`,
  onOk(v) { Sync.appel('PUT', '/utilisateurs/' + id, { courriel: v.courriel }).then(() => { toast('Adresse enregistrée', 'ok'); Actions['compte-utilisateurs'](); }, e => toast(e.message, 'err')); return false; } }); };
/* Lien de réinitialisation à remettre à un collègue : l'administrateur ne connaît jamais le nouveau mot de passe */
Actions['user-lien'] = el => {
  const id = idLigne(el), ident = el.dataset.ident;
  Sync.appel('POST', '/recuperation/lien', { id }).then(r => {
    Modal.open({ title: `Lien de réinitialisation — ${esc(ident)}`, ok: 'Copier le lien', cancel: 'Fermer',
      body: `<p style="margin:0 0 10px">Remettez ce lien à <b>${esc(ident)}</b> par un moyen sûr (de vive voix, messagerie interne). Il lui permet de choisir un nouveau mot de passe.</p>
        <input type="text" id="lien-reinit" class="mono" readonly value="${esc(location.origin + r.lien)}" style="width:100%">
        <p class="muted" style="margin:10px 0 0">Valable 30 minutes, utilisable une seule fois. Créer un nouveau lien n'annule pas celui-ci : il expire seul.</p>`,
      onOk() { const champLien = $('#lien-reinit'); champLien.select(); navigator.clipboard?.writeText(champLien.value).then(() => toast('Lien copié', 'ok'), () => toast('Copie impossible : sélectionnez le lien à la main', 'warn')); return false; } });
  }, e => toast(e.message, 'err'));
};

/* --- Journal d'audit (administrateur) --- */
const ACTIONS = { operation: 'Opération', sauvegarde_telecharger: 'Sauvegarde téléchargée', lien_reinitialisation: 'Lien de réinitialisation', demande_reinitialisation: 'Mot de passe oublié', mot_de_passe_reinitialise: 'Mot de passe réinitialisé', sauvegarde: 'Sauvegarde', sauvegarde_supprimer: 'Sauvegarde supprimée', restauration: 'Restauration', creer: 'Création', modifier: 'Modification', supprimer: 'Suppression', remplacement: 'Remplacement de la base', connexion: 'Connexion', echec_connexion: 'Échec de connexion', utilisateur_creer: 'Compte créé', utilisateur_modifier: 'Compte modifié', utilisateur_supprimer: 'Compte supprimé', mot_de_passe: 'Mot de passe changé' };
const OBJETS = { sites: 'site', buildings: 'bâtiment', floors: 'étage', rooms: 'pièce', racks: 'baie', devices: 'équipement', ports: 'port', outlets: 'prise', cables: 'câble', catalog: 'modèle', stock: 'stock', vlans: 'VLAN', interventions: 'intervention', utilisateurs: 'compte' };
const court = v => { const s = v === null || v === undefined || v === '' ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v); return s.length > 60 ? s.slice(0, 57) + '…' : s; };
/* Noms des champs les plus courants, tels que l'interface les affiche ; un champ absent d'ici garde son nom technique */
const CHAMPS = { hostname: 'nom', name: 'nom', label: 'repère', ip: 'adresse IP', mac: 'adresse MAC', serial: 'n° de série', firmware: 'firmware', installDate: 'installé le', status: 'statut', notes: 'notes', description: 'description', u: 'position (U)', rackId: 'baie', roomId: 'pièce', floorId: 'étage', catalogId: 'modèle', vlan: 'VLAN', speed: 'débit', connected: 'terminal', subnet: 'sous-réseau', color: 'couleur', available: 'disponible', threshold: 'seuil d\'alerte', location: 'lieu de stockage', length: 'longueur', type: 'type', usage: 'usage', address: 'adresse', title: 'titre', assignee: 'chargé de', date: 'date prévue', note: 'note', doneAt: 'terminée le' };
/* Champs qui diffèrent entre la valeur avant et la valeur après */
function ecarts(avant, apres) {
  const plat = o => Object.fromEntries(Object.entries(o || {}).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v).map(([k2, v2]) => [`${k}.${k2}`, v2]) : [[k, v]])));
  const a = plat(avant), b = plat(apres);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map(k => `<span class="a-chg"><b>${esc(CHAMPS[k] || k)}</b> : ${esc(court(a[k]))} → ${esc(court(b[k]))}</span>`);
}
/* Noms au pluriel, pour les décomptes */
const PLURIELS = { sites: 'sites', buildings: 'bâtiments', floors: 'étages', rooms: 'pièces', racks: 'baies', devices: 'équipements', ports: 'ports', outlets: 'prises', cables: 'câbles', catalog: 'modèles', stock: 'lignes de stock', vlans: 'VLAN', interventions: 'interventions', history: 'actions d\'historique' };
const compte = (c, n) => `${n} ${n > 1 ? PLURIELS[c] || c : OBJETS[c] || c}`;
/* Familles d'actions proposées dans le filtre */
const FAMILLES = {
  acces: ['Connexions et échecs', ['connexion', 'echec_connexion']],
  donnees: ['Données', ['operation', 'creer', 'modifier', 'supprimer', 'remplacement', 'restauration']],
  comptes: ['Comptes', ['utilisateur_creer', 'utilisateur_modifier', 'utilisateur_supprimer', 'mot_de_passe', 'lien_reinitialisation', 'demande_reinitialisation', 'mot_de_passe_reinitialise']],
  sauvegardes: ['Sauvegardes', ['sauvegarde', 'sauvegarde_supprimer', 'sauvegarde_telecharger', 'restauration']],
};
const Audit = { identifiant: '', famille: '', lignes: [] };
function ligneAudit(a) {
  const detail = a.action === 'modifier' ? ecarts(a.avant, a.apres).join('') : a.action === 'remplacement' || a.action === 'restauration' ? esc(Object.entries(a.apres || {}).filter(([, n]) => n).map(([k, n]) => compte(k, n)).join(', ')) : a.action === 'utilisateur_modifier' ? esc(Object.entries(a.apres || {}).map(([k, v]) => `${k} : ${v}`).join(', ')) : '';
  return `<div class="a-row"><span class="muted">${fmtDateTime(a.date)}</span><b>${esc(a.identifiant || 'système')}</b><span class="chip">${ACTIONS[a.action] || esc(a.action)}</span>
    <div><span>${a.collection && OBJETS[a.collection] ? OBJETS[a.collection] + ' ' : ''}<b>${esc(a.libelle)}</b></span>${detail ? `<div class="a-detail">${detail}</div>` : ''}</div></div>`;
}
/* Regroupe les lignes d'un même lot : une opération faite d'un seul geste (un remplacement, un import) tient en une ligne */
function operations(lignes) {
  const groupes = [];
  for (const a of lignes) { const g = groupes.at(-1); if (g && a.lot != null && g[0].lot === a.lot && g[0].identifiant === a.identifiant) g.push(a); else groupes.push([a]); }
  return groupes;
}
function ligneOperation(g) {
  const tete = g.find(a => a.action === 'operation'), ch = g.filter(a => a !== tete), a0 = g[0];
  // Décompte par action : « Création : 28 ports, 6 câbles »
  const parAction = new Map();
  for (const a of ch) { const m = parAction.get(a.action) || parAction.set(a.action, new Map()).get(a.action); m.set(a.collection, (m.get(a.collection) || 0) + 1); }
  const resume = [...parAction].map(([act, m]) => `${ACTIONS[act] || esc(act)} : ${[...m].map(([c, n]) => compte(c, n)).join(', ')}`).join(' · ');
  const etiquette = parAction.size === 1 ? ACTIONS[ch[0].action] || esc(ch[0].action) : 'Opération';
  const titre = tete ? `<b>${esc(tete.libelle)}</b>` : `<b>${ch.length} changements</b>`;
  // Un seul changement : son détail suit le titre. Plusieurs : le décompte, et le détail se déplie.
  const corps = ch.length === 1 ? `<div class="a-detail"><span>${OBJETS[ch[0].collection] ? OBJETS[ch[0].collection] + ' ' : ''}<b>${esc(ch[0].libelle)}</b></span>${ch[0].action === 'modifier' ? ecarts(ch[0].avant, ch[0].apres).join('') : ''}</div>`
    : `<details class="a-plus"><summary>${tete ? `${ch.length} changements — ` : ''}${resume}</summary>${ch.map(ligneAudit).join('')}</details>`;
  return `<div class="a-row a-op"><span class="muted">${fmtDateTime(a0.date)}</span><b>${esc(a0.identifiant || 'système')}</b><span class="chip">${etiquette}</span><div>${titre}${corps}</div></div>`;
}
async function chargerAudit(suite = false) {
  const dernier = suite ? Audit.lignes.at(-1)?.id : null;
  const lignes = await Sync.appel('GET', `/audit?limite=100${Audit.identifiant ? '&identifiant=' + encodeURIComponent(Audit.identifiant) : ''}${Audit.famille ? '&actions=' + FAMILLES[Audit.famille][1].join(',') : ''}${dernier ? '&avant=' + dernier : ''}`);
  Audit.lignes = suite ? [...Audit.lignes, ...lignes] : lignes;
  const hote = $('#audit-list');
  if (!hote) return;
  hote.innerHTML = operations(Audit.lignes).map(g => (g.length > 1 ? ligneOperation(g) : ligneAudit(g[0]))).join('') || '<div class="empty">Aucune entrée</div>';
  $('#audit-suite').classList.toggle('hidden', lignes.length < 100);
}
const corpsAudit = () => `<div class="row" style="margin-bottom:12px"><input type="search" id="audit-filtre" data-inp="audit-filtre" placeholder="Filtrer par identifiant" style="flex:1"><select id="audit-famille" data-chg="audit-famille" data-tip="Famille d'actions"><option value="">Toutes les actions</option>${Object.entries(FAMILLES).map(([k, [t]]) => `<option value="${k}">${t}</option>`).join('')}</select><button class="btn" data-act="audit-csv" data-tip="Exporter|Télécharger les entrées affichées (CSV)">${ico('download')}CSV</button><span class="muted">Qui, quand, quoi, valeur avant → après. Ce journal ne se modifie pas.</span></div>
      <div id="audit-list"><div class="empty">Chargement…</div></div><div style="text-align:center;margin-top:10px"><button class="btn hidden" id="audit-suite" data-act="audit-suite">Entrées plus anciennes</button></div>`;
/* Remet le journal à zéro avant de l'afficher (rubrique de la page d'administration) */
const ouvrirAudit = () => { Audit.identifiant = ''; Audit.famille = ''; Audit.lignes = []; return chargerAudit(); };
Changes['audit-famille'] = el => { Audit.famille = FAMILLES[el.value] ? el.value : ''; chargerAudit().catch(e => toast(e.message, 'err')); };
/* Le filtre s'applique pendant la saisie, après une courte pause */
let minuterieFiltre = 0;
Inputs['audit-filtre'] = el => { clearTimeout(minuterieFiltre); minuterieFiltre = setTimeout(() => { Audit.identifiant = el.value.trim(); chargerAudit().catch(e => toast(e.message, 'err')); }, 250); };
/* Export des entrées affichées, pour un rapport ou une enquête */
Actions['audit-csv'] = () => {
  const q = csvCell, j = v => (v == null ? '' : JSON.stringify(v));
  const lignes = Audit.lignes.map(a => [new Date(a.date).toISOString(), a.identifiant, a.action, a.collection, a.libelle, j(a.avant), j(a.apres), a.ip].map(q).join(';'));
  download(`netcarto-audit-${today()}.csv`, '\ufeff' + ['date;identifiant;action;objet;libelle;avant;apres;adresse', ...lignes].join('\r\n'), 'text/csv');
};
Actions['audit-suite'] = () => chargerAudit(true).catch(e => toast(e.message, 'err'));

export { chargerUtilisateurs, corpsAudit, corpsUtilisateurs, ouvrirAudit, ouvrirSession, ROLES };
