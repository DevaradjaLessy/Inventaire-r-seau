/* Interface — socle : onglets, notifications, infobulles, fenêtres modales, gestionnaires délégués, actions de l'en-tête. */
import { COL, DEVICE_STATUS, PORT_STATUS } from '../config.js';
import { $, $$, clamp, download, esc, plural, today } from '../utils.js';
import { ico } from '../icones.js';
import { buildDemo } from '../demo.js';
import { Store } from '../store.js';
import { computeAlerts, vlanOf } from '../services/requetes.js';

const UI = { tab: 'carto', dirty: new Set(['carto', 'inv', 'mat', 'dash']) };
const TABS = [
  { id: 'carto', label: 'Cartographie', icon: 'carto' },
  { id: 'inv', label: 'Inventaire', icon: 'list' },
  { id: 'mat', label: 'Matériel disponible', icon: 'box' },
  { id: 'dash', label: 'Tableau de bord', icon: 'gauge' },
];
const Views = {};       // chaque onglet enregistre ici { render() }
const Actions = {};     // gestionnaires des attributs data-act (clic)
const Changes = {};     // gestionnaires des attributs data-chg (change)
const Inputs = {};      // gestionnaires des attributs data-inp (saisie)

/* Pastilles d'état réutilisables */
const stPort = s => `<span class="st ${s === 'disabled' ? 'dis' : ''}"><i style="background:${PORT_STATUS[s].color}"></i>${PORT_STATUS[s].label}</span>`;
const stDev = s => `<span class="st"><i style="background:${DEVICE_STATUS[s].color}"></i>${DEVICE_STATUS[s].label}</span>`;
const vlanChip = v => { const x = vlanOf(v); return `<span class="vl"><i style="background:${x.color}"></i>${v == null ? 'Trunk' : `${x.id} ${esc(x.name)}`}</span>`; };
const levelColor = l => ({ crit: COL.crit, serious: COL.serious, warn: COL.warn }[l]);

function renderShell() {
  const nAlerts = computeAlerts().filter(a => a.level !== 'warn' || a.kind === 'stock').length;
  $('#tabs').innerHTML = TABS.map(t => `<button data-act="tab" data-tab="${t.id}" class="${UI.tab === t.id ? 'on' : ''}">${ico(t.icon)}${t.label}${t.id === 'dash' && nAlerts ? `<span class="badge" data-tip="${plural(nAlerts, 'alerte')} à traiter">${nAlerts}</span>` : ''}</button>`).join('');
  $('#tools').innerHTML = `
    <button class="btn icon" data-act="import" data-tip="Importer|Charger un fichier JSON exporté depuis NetCarto">${ico('upload')}</button>
    <button class="btn icon" data-act="export" data-tip="Exporter|Télécharger toute la base au format JSON">${ico('download')}</button>
    <button class="btn icon" data-act="undo" ${Store.undoStack.length ? '' : 'disabled'} data-tip="Annuler (Ctrl+Z)|${esc(Store.undoStack.at(-1)?.text || 'Rien à annuler')}">${ico('undo')}</button>
    <button class="btn icon" data-act="reset" data-tip="Réinitialiser la démo|Recharger le jeu de données fictif d'origine">${ico('reset')}</button>`;
}
function showTab(id) {
  UI.tab = id;
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
Store.on(() => { TABS.forEach(t => UI.dirty.add(t.id)); renderShell(); renderActive(); });

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

/* --- Gestionnaires délégués --- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled) { const fn = Actions[el.dataset.act]; if (fn) run(() => fn(el, e)); }
  if (!e.target.closest('.gsearch')) $('#gsearch-res').classList.add('hidden');
});
document.addEventListener('change', e => { const el = e.target.closest('[data-chg]'); if (el) { const fn = Changes[el.dataset.chg]; if (fn) run(() => fn(el, e)); } });
document.addEventListener('input', e => { const el = e.target.closest('[data-inp]'); if (el) { const fn = Inputs[el.dataset.inp]; if (fn) run(() => fn(el, e)); } });
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if (e.key === 'Escape') { if ($('#modal-root').classList.contains('on')) Modal.close(); else { $('#gsearch-res').classList.add('hidden'); if (typing) e.target.blur(); } }
  else if (e.key === '/' && !typing) { e.preventDefault(); $('#gsearch').focus(); $('#gsearch').select(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); Actions.undo(); }
  else if (e.key === 'Enter' && $('#modal-root').classList.contains('on') && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'BUTTON') { e.preventDefault(); Actions['modal-ok'](); }
});

/* --- Actions de l'en-tête --- */
Actions.tab = el => showTab(el.dataset.tab);
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
Actions.reset = () => Modal.confirm('Réinitialiser la démo', 'Recharger le jeu de données fictif d\'origine ? Les modifications faites dans ce navigateur seront remplacées (annulable avec Ctrl+Z).', () => {
  Store.replace(buildDemo(), 'Réinitialisation du jeu de données de démonstration');
  toast('Jeu de démonstration rechargé', 'ok', undoAction);
  return true;
}, 'Réinitialiser', 'danger');

export { Actions, Changes, Inputs, levelColor, Modal, run, showTab, stDev, stPort, Tip, toast, UI, undoAction, Views, vlanChip };
