/* Cartographie — création et modification de la structure (sites, bâtiments, étages, pièces),
   dessin d'une pièce à la souris sur le plan, et gestion des VLAN. */
import { ROOM_TYPES } from '../../config.js';
import { $, esc, typeOf } from '../../utils.js';
import { ico } from '../../icones.js';
import { buildDemo } from '../../demo.js';
import { Store } from '../../store.js';
import { byId, labelOf } from '../../services/requetes.js';
import { addBuilding, addFloor, addRoom, addSite, deleteStructure, deleteVlan, emptyBase, saveVlan, updateStructure, vlanUse } from '../../services/structure.js';
import { Actions, Changes, Modal, toast, undoAction } from '../socle.js';
import { Carto, renderCarto, select } from './carto.js';
import { opt } from './fiches.js';

const fld = (label, name, value, extra = '') => `<label class="f"><span>${label}</span><input type="${/type="number"/.test(extra) ? 'number' : 'text'}" name="${name}" value="${esc(value ?? '')}" ${extra.replace('type="number"', '')}></label>`;
const KIND = { site: 'site', building: 'bâtiment', floor: 'étage', room: 'pièce' };
/* Champs du formulaire selon le type d'élément */
function form(kind, e = {}, parent = null) {
  if (kind === 'site') return fld('Nom du site', 'name', e.name, 'autofocus') + fld('Code court', 'code', e.code, 'placeholder="SIEGE"') + `<div class="full">${fld('Adresse', 'address', e.address)}</div>`;
  if (kind === 'building') return fld('Nom du bâtiment', 'name', e.name, 'autofocus placeholder="Bâtiment A — Administration"') + fld('Code (une ou deux lettres)', 'code', e.code, 'maxlength="4" placeholder="A"');
  if (kind === 'floor') return fld('Nom de l\'étage', 'name', e.name, 'autofocus placeholder="RDC, R+1…"') + fld('Niveau (0 = rez-de-chaussée)', 'level', e.level ?? 0, 'type="number" step="1"') + fld('Largeur (m)', 'width', e.width ?? 40, 'type="number" step="0.5" min="2"') + fld('Profondeur (m)', 'height', e.height ?? 22, 'type="number" step="0.5" min="2"');
  const f = parent || byId(e.floorId);
  return fld('Nom de la pièce', 'name', e.name, 'autofocus') + `<label class="f"><span>Type</span><select name="type">${Object.entries(ROOM_TYPES).map(([k, v]) => opt(k, v.label, e.type || 'office')).join('')}</select></label>` +
    fld(`Position X (m) — 0 à ${f.width}`, 'x', e.x ?? 0, 'type="number" step="0.5" min="0"') + fld(`Position Y (m) — 0 à ${f.height}`, 'y', e.y ?? 0, 'type="number" step="0.5" min="0"') +
    fld('Largeur (m)', 'w', e.w ?? 6, 'type="number" step="0.5" min="1"') + fld('Profondeur (m)', 'h', e.h ?? 5, 'type="number" step="0.5" min="1"');
}
/* Ouvre la fenêtre de création. preset : valeurs proposées (pièce dessinée à la souris) */
function openAdd(kind, parentId, preset = {}) {
  const parent = parentId ? byId(parentId) : null;
  Modal.open({
    title: `${kind === 'room' ? 'Nouvelle' : 'Nouveau'} ${kind === 'floor' ? 'étage' : KIND[kind]}${parent ? ` — ${esc(labelOf(parentId))}` : ''}`, ok: 'Créer', body: `<div class="form-grid">${form(kind, preset, parent)}</div>`,
    onOk(v) {
      const id = kind === 'site' ? addSite(v) : kind === 'building' ? addBuilding(parentId, v) : kind === 'floor' ? addFloor(parentId, v) : addRoom(parentId, v);
      toast(`${labelOf(id)} : création enregistrée`, 'ok', undoAction);
      select(id, { view: 'plan' });
      return true;
    },
  });
}
Actions['st-add'] = el => openAdd(el.dataset.kind, el.dataset.parent || null);
Actions['st-edit'] = el => {
  const e = byId(el.dataset.id), kind = typeOf(e.id);
  Modal.open({ title: `Modifier ${esc(labelOf(e.id))}`, ok: 'Enregistrer', body: `<div class="form-grid">${form(kind, e)}</div>`, onOk(v) { updateStructure(e.id, v); toast('Modification enregistrée', 'ok', undoAction); return true; } });
};
Actions['st-del'] = el => {
  const e = byId(el.dataset.id), kind = typeOf(e.id), up = e.floorId || e.buildingId || e.siteId || null;
  Modal.confirm(`Supprimer ${esc(labelOf(e.id))}`, `Supprimer ${kind === 'room' ? 'cette' : 'ce'} ${kind === 'floor' ? 'étage' : KIND[kind]} ? L'élément doit être vide.`, () => {
    deleteStructure(e.id); toast('Suppression enregistrée', 'ok', undoAction);
    if (up) select(up, { view: 'plan' }); else { Carto.sel = null; Carto.floorId = null; renderCarto(); }
    return true;
  }, 'Supprimer', 'danger');
};
/* Boutons de structure affichés en tête de fiche */
function structButtons(e) {
  const t = typeOf(e.id), child = { site: ['building', 'Ajouter un bâtiment'], building: ['floor', 'Ajouter un étage'], floor: ['room', 'Ajouter une pièce'] }[t];
  return `<div class="btns">${child ? `<button class="btn sm pri" data-act="st-add" data-kind="${child[0]}" data-parent="${e.id}">${ico('plus')}${child[1]}</button>` : ''}
    ${t === 'floor' ? `<button class="btn sm ${Carto.draw ? 'on' : ''}" data-act="plan-draw" data-tip="Dessiner une pièce|Tracez un rectangle à la souris sur le plan">${ico('room')}Dessiner</button>` : ''}
    <button class="btn sm" data-act="st-edit" data-id="${e.id}">${ico('edit')}Modifier</button><button class="btn sm danger" data-act="st-del" data-id="${e.id}">${ico('trash')}Supprimer</button></div>`;
}
Actions['plan-draw'] = () => { Carto.draw = !Carto.draw; if (Carto.draw) { Carto.edit = false; Carto.view = 'plan'; toast('Tracez la pièce sur le plan : cliquez, glissez, relâchez', 'ok'); } renderCarto(); };
/* Appelé par le plan quand un rectangle vient d'être tracé (coordonnées en mètres) */
function roomDrawn(r) { Carto.draw = false; renderCarto(); openAdd('room', Carto.floorId, r); }

/* Écran d'accueil d'une base sans aucun site */
const emptyState = () => `<div class="empty-state"><div class="dico">${ico('site')}</div><h2>Base vide</h2>
  <p class="muted">Commencez par créer votre site. Vous ajouterez ensuite ses bâtiments, ses étages et ses pièces, puis les baies et les équipements depuis l'onglet « Matériel disponible ».</p>
  <div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap"><button class="btn pri" data-act="st-add" data-kind="site">${ico('plus')}Créer un site</button><button class="btn" data-act="reset">${ico('reset')}Charger la démonstration</button></div></div>`;

/* --- Réinitialisation : jeu de démonstration ou base vide --- */
Actions.reset = () => Modal.open({
  title: 'Réinitialiser les données', ok: 'Réinitialiser', okClass: 'danger',
  body: `<p style="margin:0 0 12px">Les données de ce navigateur seront remplacées. L'opération reste annulable avec Ctrl+Z, mais pensez à exporter d'abord ce que vous voulez garder.</p>
    <label class="row" style="margin-bottom:8px;align-items:flex-start"><input type="radio" name="kind" value="demo" checked style="margin-top:3px"> <span><b>Jeu de démonstration</b> — un campus fictif complet, pour découvrir l'outil</span></label>
    <label class="row" style="align-items:flex-start"><input type="radio" name="kind" value="vide" style="margin-top:3px"> <span><b>Base vide</b> — aucun site ni équipement ; le catalogue de modèles est conservé, avec un stock à zéro</span></label>`,
  onOk() {
    const vide = $('#modal-root input[name=kind]:checked').value === 'vide';
    Carto.sel = null; Carto.floorId = null; Carto.rackId = null; Carto.trace = null; Carto.view = 'plan';
    Store.replace(vide ? emptyBase() : buildDemo(), vide ? 'Démarrage sur une base vide' : 'Réinitialisation du jeu de données de démonstration');
    toast(vide ? 'Base vide prête : créez votre premier site' : 'Jeu de démonstration rechargé', 'ok', undoAction);
    return true;
  },
});

/* --- Gestion des VLAN --- */
function vlanRows() {
  return Store.db.vlans.map(v => { const n = vlanUse(v.id); return `<div class="vl-row" data-id="${v.id}">
    <input type="number" data-f="id" value="${v.id}" min="1" max="4094" data-chg="vlan-f" data-tip="Numéro du VLAN"><input type="text" data-f="name" value="${esc(v.name)}" data-chg="vlan-f" data-tip="Nom">
    <input type="color" data-f="color" value="${esc(v.color)}" data-chg="vlan-f" data-tip="Couleur"><input type="text" class="mono" data-f="subnet" value="${esc(v.subnet || '')}" placeholder="10.10.10.0/24" data-chg="vlan-f" data-tip="Sous-réseau">
    <span class="muted" data-tip="Ports affectés à ce VLAN">${n} port${n > 1 ? 's' : ''}</span><button class="btn sm icon danger" data-act="vlan-del" data-id="${v.id}" ${n ? 'disabled' : ''} data-tip="${n ? 'Supprimer|Impossible : des ports utilisent ce VLAN' : 'Supprimer'}">${ico('trash')}</button></div>`; }).join('') || '<div class="dim">Aucun VLAN</div>';
}
Actions.vlans = () => Modal.open({
  title: 'VLAN', wide: true, ok: false, cancel: 'Fermer',
  body: `<p class="muted" style="margin:0 0 12px">Chaque modification est enregistrée aussitôt. La couleur sert sur le plan, la vue 3D et les cordons.</p><div id="vlan-list">${vlanRows()}</div>
    <div class="sec-t" style="margin:16px 0 8px">Nouveau VLAN</div><div class="vl-row" id="vlan-new"><input type="number" data-f="id" min="1" max="4094" placeholder="N°"><input type="text" data-f="name" placeholder="Nom"><input type="color" data-f="color" value="#3987e5"><input type="text" class="mono" data-f="subnet" placeholder="10.10.10.0/24"><span></span><button class="btn sm pri" data-act="vlan-add">${ico('plus')}Ajouter</button></div>`,
});
const vlanRead = row => Object.fromEntries([...row.querySelectorAll('[data-f]')].map(i => [i.dataset.f, i.value]));
const vlanRefresh = () => { const l = $('#vlan-list'); if (l) l.innerHTML = vlanRows(); };
Changes['vlan-f'] = el => { const row = el.closest('.vl-row'); try { saveVlan(vlanRead(row), +row.dataset.id); } finally { vlanRefresh(); } };
Actions['vlan-add'] = () => { const row = $('#vlan-new'); saveVlan(vlanRead(row)); row.querySelector('[data-f=id]').value = ''; row.querySelector('[data-f=name]').value = ''; row.querySelector('[data-f=subnet]').value = ''; vlanRefresh(); toast('VLAN ajouté', 'ok'); };
Actions['vlan-del'] = el => { deleteVlan(+el.dataset.id); vlanRefresh(); toast('VLAN supprimé', 'ok', undoAction); };

export { emptyState, roomDrawn, structButtons };
