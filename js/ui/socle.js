/* Interface — socle : onglets, notifications, infobulles, fenêtres modales, gestionnaires délégués, actions de l'en-tête. */
import { COL, DEVICE_STATUS, PORT_STATUS } from '../config.js';
import { $, $$, clamp, download, esc, plural, today } from '../utils.js';
import { ico } from '../icones.js';
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { computeAlerts, vlanOf } from '../services/requetes.js';
import { Live } from '../services/mesures.js';

const UI = { tab: 'carto', dirty: new Set(['carto', 'inv', 'mat', 'dash', 'admin']) };
const TABS = [
  { id: 'carto', label: 'Cartographie', icon: 'carto' },
  { id: 'inv', label: 'Inventaire', icon: 'list' },
  { id: 'mat', label: 'Matériel disponible', short: 'Matériel', icon: 'box' },
  { id: 'dash', label: 'Tableau de bord', short: 'Tableau', icon: 'gauge' },
  { id: 'admin', label: 'Administration', short: 'Admin', icon: 'user', admin: true },   // mode serveur, administrateurs seulement ; adresse /admin
];
const estAdmin = () => Store.mode === 'serveur' && Sync.utilisateur?.role === 'administrateur';
const ongletsVisibles = () => TABS.filter(t => !t.admin || estAdmin());
/* Vrai sur un écran étroit (téléphone) : même seuil que la feuille de styles */
const isMobile = () => matchMedia('(max-width: 900px)').matches;
const Views = {};       // chaque onglet enregistre ici { render() }
const Actions = {};     // gestionnaires des attributs data-act (clic)
const Changes = {};     // gestionnaires des attributs data-chg (change)
const Inputs = {};      // gestionnaires des attributs data-inp (saisie)

/* Pastilles d'état réutilisables */
const stPort = s => `<span class="st ${s === 'disabled' ? 'dis' : ''}"><i style="background:${PORT_STATUS[s].color}"></i>${PORT_STATUS[s].label}</span>`;
const stDev = s => `<span class="st"><i style="background:${DEVICE_STATUS[s].color}"></i>${DEVICE_STATUS[s].label}</span>`;
const vlanChip = v => { const x = vlanOf(v); return `<span class="vl"><i style="background:${x.color}"></i>${v == null ? 'Trunk' : `${x.id} ${esc(x.name)}`}</span>`; };
const levelColor = l => ({ crit: COL.crit, serious: COL.serious, warn: COL.warn }[l]);

/* Thème clair ou sombre, mémorisé dans le navigateur */
const Theme = {
  KEY: 'netcarto:theme',
  get() { return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'; },
  set(t) {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem(this.KEY, t); } catch { /* stockage indisponible : le choix vaut pour cette visite */ }
    document.dispatchEvent(new Event('netcarto:theme'));
  },
};
function renderShell() {
  $('.demo-tag').classList.toggle('hidden', !Store.db.meta.demo);
  const tag = $('#srv-tag'), e = Sync.etat;
  tag.classList.toggle('hidden', Store.mode !== 'serveur');
  tag.className = `srv-tag ${e}${Store.mode !== 'serveur' ? ' hidden' : ''}`;
  tag.innerHTML = `<i></i>${e === 'envoi' ? 'Enregistrement…' : e === 'horsligne' ? 'Hors ligne' : 'Serveur · enregistré'}`;
  tag.dataset.tip = e === 'horsligne' ? 'Serveur injoignable|Les modifications ne sont pas enregistrées tant que la liaison n\'est pas rétablie.' : 'Base sur le serveur NetCarto|Chaque modification est enregistrée dans la base du serveur.';
  const nAlerts = computeAlerts().filter(a => a.level !== 'warn' || a.kind === 'stock').length;
  // Un compte en lecture seule ne voit pas les boutons dont il ne peut pas se servir (règles « role-lecture » de la feuille de styles)
  document.body.classList.toggle('role-lecture', Store.mode === 'serveur' && Sync.utilisateur?.role === 'lecture');
  $('#tabs').innerHTML = ongletsVisibles().map(t => `<button data-act="tab" data-tab="${t.id}" class="${UI.tab === t.id ? 'on' : ''}">${ico(t.icon)}<span class="lg">${t.label}</span><span class="sh">${t.short || t.label}</span>${t.id === 'dash' && nAlerts ? `<span class="badge" data-tip="${plural(nAlerts, 'alerte')} à traiter">${nAlerts}</span>` : ''}</button>`).join('');
  $('#tools').innerHTML = `
    ${Store.mode === 'serveur' && Sync.utilisateur ? `<button class="btn" id="user-chip" data-act="compte-menu" data-tip="${esc(Sync.utilisateur.nom || Sync.utilisateur.identifiant)}|${{ lecture: 'Lecture seule', technicien: 'Technicien', administrateur: 'Administrateur' }[Sync.utilisateur.role]}|Clic : mon compte, déconnexion">${ico('user')}<span>${esc(Sync.utilisateur.identifiant)}</span></button>` : ''}
    <button class="btn icon" data-act="theme" data-tip="${Theme.get() === 'dark' ? 'Passer au thème clair' : 'Passer au thème sombre'}|Le choix est mémorisé dans ce navigateur">${ico(Theme.get() === 'dark' ? 'sun' : 'moon')}</button>
    <button class="btn icon" data-act="sources" data-tip="Sources de données|${Live.state === 'ok' ? `Supervision active (${esc(Live.source)})` : Live.state === 'error' ? 'Source en erreur : ' + esc(Live.error) : 'Aucune source de supervision : état saisi à la main'}" style="position:relative">${ico('gauge')}<i class="live-dot ${Live.state}"></i></button>
    <button class="btn icon" data-act="import" data-tip="Importer|Charger un fichier JSON exporté depuis NetCarto">${ico('upload')}</button>
    <button class="btn icon" data-act="export" data-tip="Exporter|Télécharger toute la base au format JSON">${ico('download')}</button>
    <button class="btn icon" data-act="undo" ${Store.undoStack.length ? '' : 'disabled'} data-tip="Annuler (Ctrl+Z)|${esc(Store.undoStack.at(-1)?.text || 'Rien à annuler')}">${ico('undo')}</button>
    ${Store.mode === 'serveur' ? '' : `<button class="btn icon" data-act="copies" data-tip="Copies de secours|États précédents de la base, gardés dans ce navigateur">${ico('history')}</button>`}
    <button class="btn icon" data-act="reset" data-tip="Réinitialiser|Recharger la démonstration ou repartir d'une base vide">${ico('reset')}</button>`;
}
function showTab(id) {
  if (TABS.find(t => t.id === id)?.admin && !estAdmin()) { if (Store.mode === 'serveur') toast('La page d\'administration est réservée aux administrateurs.', 'err'); id = 'carto'; }
  UI.tab = id;
  // En mode serveur, l'adresse suit : /admin pour l'administration, / pour le reste
  if (Store.mode === 'serveur') { const chemin = id === 'admin' ? '/admin' : '/'; if (location.pathname !== chemin) history.replaceState(null, '', chemin); }
  for (const t of TABS) $('#tab-' + t.id).classList.toggle('on', t.id === id);
  renderShell();
  renderActive();
}
/* Redessine l'onglet visible s'il n'est plus à jour */
function renderActive(force) {
  if (force) UI.dirty.add(UI.tab);
  if (!UI.dirty.has(UI.tab)) { Views[UI.tab]?.show?.(); return; }
  UI.dirty.delete(UI.tab);
  Views[UI.tab]?.render();
}
Store.onSaveError = () => toast('Sauvegarde locale impossible (stockage plein ou bloqué). Pensez à exporter vos données.', 'warn');
/* Mode serveur : état de l'enregistrement, refus du serveur, changements faits par un autre poste */
Sync.surEtat = () => { if (Store.db) renderShell(); };
Store.onSyncError = e => toast(e.code === 'conflit' ? e.message : e.code === 'reseau' ? e.message : `Modification refusée par le serveur : ${e.message}`, e.code === 'conflit' ? 'warn' : 'err');
Store.onExternalChange = () => toast('Données mises à jour : un autre poste a modifié la base.', 'ok');
Store.on(() => { TABS.filter(t => !t.admin).forEach(t => UI.dirty.add(t.id)); renderShell(); renderActive(); });   // l'administration ne dépend pas de la base : elle n'est pas redessinée sous les doigts

/* --- Notifications --- */
function toast(msg, kind = 'ok', action = null) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="btn sm">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { action.fn(); el.remove(); };
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), action ? 7000 : 4200);
}
/* Exécute une action et affiche l'erreur éventuelle au lieu de planter */
function run(fn) {
  try { return fn(); }
  catch (e) { console.warn(e); toast(e.message || 'Erreur inattendue', 'err'); return undefined; }
}
const undoAction = { label: 'Annuler', fn: () => Actions.undo() };

/* --- Infobulles : attribut data-tip="Titre|ligne|ligne" ou appel direct Tip.show(html, x, y) --- */
const Tip = {
  el: null,
  show(html, x, y) {
    const el = this.el || (this.el = $('#tip'));
    el.innerHTML = html; el.style.display = 'block';
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = clamp(x + 14, 6, innerWidth - w - 6) + 'px';
    el.style.top = (y + 18 + h > innerHeight ? y - h - 10 : y + 18) + 'px';
  },
  hide() { if (this.el) this.el.style.display = 'none'; },
  /* Convertit le texte « Titre|ligne|ligne » en HTML */
  fmt(s) { const [t, ...l] = String(s).split('|'); return `<b>${esc(t)}</b>${l.map(x => `<div class="l">${esc(x)}</div>`).join('')}`; },
};
document.addEventListener('mousemove', e => {
  const el = e.target.closest?.('[data-tip]');
  if (el) Tip.show(Tip.fmt(el.dataset.tip), e.clientX, e.clientY);
  else if (!e.target.closest?.('[data-tipkeep]')) Tip.hide();
});
document.addEventListener('mouseleave', () => Tip.hide());

/* --- Modales --- */
const Modal = {
  onOk: null,
  /* open({ title, body, ok, okClass, cancel, wide, onOk(données du formulaire), onOpen(élément) }) */
  open(o) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal ${o.wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <header><h2>${o.title}</h2><button class="btn icon sm" data-act="modal-close" aria-label="Fermer">${ico('x')}</button></header>
      <div class="body">${o.body}</div>
      <footer>${o.footer || ''}<button class="btn" data-act="modal-close">${o.cancel || 'Annuler'}</button>${o.ok === false ? '' : `<button class="btn ${o.okClass || 'pri'}" data-act="modal-ok">${o.ok || 'Valider'}</button>`}</footer></div>`;
    root.classList.add('on');
    this.onOk = o.onOk || null;
    o.onOpen?.(root.firstElementChild);
    (root.querySelector('[autofocus]') || root.querySelector('.body input, .body select'))?.focus();
  },
  close() { const r = $('#modal-root'); r.classList.remove('on'); r.innerHTML = ''; this.onOk = null; },
  /* Lit tous les champs nommés de la modale */
  data() {
    const o = {};
    for (const el of $$('#modal-root [name]')) o[el.name] = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value.trim();
    return o;
  },
  confirm(title, text, onOk, ok = 'Confirmer', okClass = 'pri') { this.open({ title, body: `<p style="margin:0">${text}</p>`, ok, okClass, onOk }); },
};
Actions['modal-close'] = () => Modal.close();
Actions['modal-ok'] = () => {
  if (!Modal.onOk) return Modal.close();
  const res = run(() => Modal.onOk(Modal.data()));
  if (res !== false && res !== undefined) Modal.close();
};
$('#modal-root').addEventListener('mousedown', e => { if (e.target.id === 'modal-root') Modal.close(); });

/* --- Accessibilité : un bouton à icône seule reçoit comme nom le titre de son infobulle --- */
const nommer = racine => { for (const b of racine.querySelectorAll?.('button.icon[data-tip]:not([aria-label])') || []) b.setAttribute('aria-label', b.dataset.tip.split('|')[0]); };
new MutationObserver(muts => { for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) nommer(n.parentElement || n); }).observe(document.body, { childList: true, subtree: true });

/* --- Gestionnaires délégués --- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled) { const fn = Actions[el.dataset.act]; if (fn) { Tip.hide(); run(() => fn(el, e)); } }
  if (!e.target.closest('.gsearch')) $('#gsearch-res').classList.add('hidden');
});
document.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el) { const fn = Changes[el.dataset.chg]; if (fn) run(() => fn(el, e)); } });
document.addEventListener('input', e => { const el = e.target.closest('[data-inp]'); if (el) { const fn = Inputs[el.dataset.inp]; if (fn) run(() => fn(el, e)); } });
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === 'Escape') { if ($('#modal-root').classList.contains('on')) Modal.close(); else { $('#gsearch-res').classList.add('hidden'); if (typing) e.target.blur(); } }
  else if (e.key === '/' && !typing) { e.preventDefault(); $('#gsearch').focus(); $('#gsearch').select(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); Actions.undo(); }
  else if (e.key === 'Enter' && Modal.onOk && $('#modal-root').classList.contains('on') && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); Actions['modal-ok'](); }
});

/* --- Actions de l'en-tête --- */
Actions.tab = el => showTab(el.dataset.tab);
Actions.theme = () => { Theme.set(Theme.get() === 'dark' ? 'light' : 'dark'); renderShell(); };
Actions.undo = () => { const t = Store.undo(); if (t) toast(`Annulé : ${t}`, 'ok'); };
Actions.export = () => {
  download(`netcarto-export-${today()}.json`, JSON.stringify(Store.db, null, 1));
  toast('Export JSON téléchargé');
};
Actions.import = () => { const f = $('#file-import'); f.value = ''; f.click(); };
$('#file-import').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  run(() => { /* la lecture est asynchrone : les erreurs sont traitées ci-dessous */ });
  try {
    const d = JSON.parse(await file.text());
    const err = Store.validate(d);
    if (err) throw new Error(err);
    Modal.confirm('Importer une base', `Remplacer les données actuelles par le fichier <b>${esc(file.name)}</b> ?<br><span class="muted">${d.devices.length} équipements, ${d.outlets.length} prises, ${d.catalog.length} modèles. L'import peut être annulé avec Ctrl+Z.</span>`, () => {
      d.meta.seq = Math.max(d.meta.seq || 0, 100000);
      Store.replace(d, `Import du fichier ${file.name}`);
      toast('Base importée', 'ok', undoAction);
      return true;
    }, 'Importer');
  } catch (err) { toast(`Import impossible : ${err.message}`, 'err'); }
});
export { Actions, Changes, estAdmin, Inputs, isMobile, levelColor, Modal, renderActive, renderShell, run, showTab, stDev, stPort, TABS, Tip, toast, UI, undoAction, Views, vlanChip };
