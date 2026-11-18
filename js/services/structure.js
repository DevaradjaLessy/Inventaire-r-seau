/* Services — structure du réseau : base vide, sites, bâtiments, étages, pièces et VLAN.
   Chaque fonction contrôle les valeurs, puis enregistre la modification (annulable). */
import { VLAN_GREY, VLANS_DEF } from '../config.js';
import { nextId, typeOf } from '../utils.js';
import { defaultCatalog } from '../catalogue.js';
import { emptyDb } from '../demo.js';
import { Store } from '../store.js';
import { byId, labelOf } from './requetes.js';

/* Base vide pour démarrer sur un vrai réseau : aucun site, catalogue de départ, stock à zéro, VLAN usuels */
function emptyBase() {
  const db = emptyDb();
  db.vlans = VLANS_DEF.map(v => ({ ...v }));
  db.catalog = defaultCatalog();
  db.stock = db.catalog.map(c => ({ catalogId: c.id, available: 0, threshold: 0, location: '' }));
  db.meta.seq = 100;
  return db;
}
const txt = (v, nom) => { const s = String(v ?? '').trim(); if (!s) throw new Error(`${nom} est obligatoire.`); return s; };
const num = (v, nom, min, max) => { const n = +v; if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${nom} : valeur attendue entre ${min} et ${max}.`); return +n.toFixed(2); };
const kids = id => { const I = Store.idx; return { site: I.bldBySite, building: I.floorsByBld, floor: I.roomsByFloor }[typeOf(id)]?.get(id) || []; };

/* Deux pièces ne doivent pas se chevaucher (une tolérance de 5 cm évite les faux positifs sur les murs mitoyens) */
function checkRoom(floor, r, ignoreId = null) {
  if (r.x < 0 || r.y < 0 || r.x + r.w > floor.width + 0.001 || r.y + r.h > floor.height + 0.001) throw new Error(`La pièce dépasse de l'étage (${floor.width} × ${floor.height} m).`);
  const t = 0.05, clash = (Store.idx.roomsByFloor.get(floor.id) || []).find(o => o.id !== ignoreId && r.x < o.x + o.w - t && o.x < r.x + r.w - t && r.y < o.y + o.h - t && o.y < r.y + r.h - t);
  if (clash) throw new Error(`La pièce chevauche « ${clash.name} ».`);
}
function addSite(v) {
  const e = { name: txt(v.name, 'Le nom du site'), code: String(v.code || '').trim().toUpperCase(), address: String(v.address || '').trim() };
  return Store.commit('add', `Création du site ${e.name}`, db => { e.id = nextId(db, 'site'); db.sites.push(e); return e.id; });
}
function addBuilding(siteId, v) {
  const name = txt(v.name, 'Le nom du bâtiment'), code = txt(v.code, 'Le code du bâtiment').toUpperCase();
  if ((Store.idx.bldBySite.get(siteId) || []).some(b => b.code === code)) throw new Error(`Le code ${code} est déjà utilisé sur ce site.`);
  return Store.commit('add', `Création du bâtiment ${name}`, db => { const e = { id: nextId(db, 'bld'), siteId, code, name }; db.buildings.push(e); return e.id; });
}
function addFloor(buildingId, v) {
  const e = { buildingId, level: Math.round(num(v.level, 'Le niveau', -10, 200)), name: txt(v.name, 'Le nom de l\'étage'), width: num(v.width, 'La largeur', 2, 1000), height: num(v.height, 'La profondeur', 2, 1000), planImage: '' };
  if ((Store.idx.floorsByBld.get(buildingId) || []).some(f => f.level === e.level)) throw new Error(`Le niveau ${e.level} existe déjà dans ce bâtiment.`);
  return Store.commit('add', `Création de l'étage ${e.name} (${labelOf(buildingId)})`, db => { e.id = nextId(db, 'flr'); db.floors.push(e); return e.id; });
}
function addRoom(floorId, v) {
  const floor = byId(floorId), e = { floorId, name: txt(v.name, 'Le nom de la pièce'), type: v.type || 'office', x: num(v.x, 'X', 0, 1000), y: num(v.y, 'Y', 0, 1000), w: num(v.w, 'La largeur', 1, 1000), h: num(v.h, 'La profondeur', 1, 1000) };
  checkRoom(floor, e);
  return Store.commit('add', `Création de la pièce ${e.name} (${labelOf(floorId)})`, db => { e.id = nextId(db, 'room'); db.rooms.push(e); return e.id; });
}
/* Modifie un site, un bâtiment, un étage ou une pièce */
function updateStructure(id, v) {
  const e = byId(id), t = typeOf(id), n = {};
  if (t === 'site') Object.assign(n, { name: txt(v.name, 'Le nom'), code: String(v.code || '').trim().toUpperCase(), address: String(v.address || '').trim() });
  if (t === 'building') { Object.assign(n, { name: txt(v.name, 'Le nom'), code: txt(v.code, 'Le code').toUpperCase() }); if ((Store.idx.bldBySite.get(e.siteId) || []).some(b => b.id !== id && b.code === n.code)) throw new Error(`Le code ${n.code} est déjà utilisé sur ce site.`); }
  if (t === 'floor') {
    Object.assign(n, { name: txt(v.name, 'Le nom'), level: Math.round(num(v.level, 'Le niveau', -10, 200)), width: num(v.width, 'La largeur', 2, 1000), height: num(v.height, 'La profondeur', 2, 1000) });
    if ((Store.idx.floorsByBld.get(e.buildingId) || []).some(f => f.id !== id && f.level === n.level)) throw new Error(`Le niveau ${n.level} existe déjà dans ce bâtiment.`);
    const out = (Store.idx.roomsByFloor.get(id) || []).find(r => r.x + r.w > n.width + 0.001 || r.y + r.h > n.height + 0.001);
    if (out) throw new Error(`Dimensions trop petites : la pièce « ${out.name} » dépasserait de l'étage.`);
  }
  if (t === 'room') {
    Object.assign(n, { name: txt(v.name, 'Le nom'), type: v.type || e.type, x: num(v.x, 'X', 0, 1000), y: num(v.y, 'Y', 0, 1000), w: num(v.w, 'La largeur', 1, 1000), h: num(v.h, 'La profondeur', 1, 1000) });
    checkRoom(byId(e.floorId), n, id);
    const I = Store.idx, inside = o => o.x >= n.x && o.x <= n.x + n.w && o.y >= n.y && o.y <= n.y + n.h;
    const lost = [...(I.racksByRoom.get(id) || []), ...(I.devByRoom.get(id) || []), ...(I.outByRoom.get(id) || [])].find(o => !inside(o));
    if (lost) throw new Error(`${labelOf(lost.id)} se retrouverait hors de la pièce : déplacez-le d'abord.`);
  }
  Store.commit('edit', `Modification de ${labelOf(id)}`, () => Object.assign(e, n), id);
}
/* Supprime un élément de structure, seulement s'il est vide */
function deleteStructure(id) {
  const e = byId(id), t = typeOf(id), I = Store.idx;
  const n = kids(id).length;
  if (n) throw new Error(`Suppression impossible : ${labelOf(id)} contient encore ${n} ${{ site: 'bâtiment(s)', building: 'étage(s)', floor: 'pièce(s)' }[t]}.`);
  if (t === 'room') { const c = (I.racksByRoom.get(id) || []).length + (I.devByRoom.get(id) || []).length + (I.outByRoom.get(id) || []).length; if (c) throw new Error(`Suppression impossible : la pièce contient encore ${c} élément(s) (baies, équipements ou prises).`); }
  const key = { site: 'sites', building: 'buildings', floor: 'floors', room: 'rooms' }[t];
  Store.commit('remove', `Suppression de ${labelOf(id)}`, db => { db[key].splice(db[key].indexOf(e), 1); });
}
/* --- VLAN --- */
const vlanUse = id => Store.db.ports.filter(p => p.vlan === id).length;
function saveVlan(v, originalId = null) {
  const id = Math.round(+v.id);
  if (!Number.isInteger(id) || id < 1 || id > 4094) throw new Error('Numéro de VLAN attendu entre 1 et 4094.');
  const color = /^#[0-9a-fA-F]{6}$/.test(v.color || '') ? v.color : VLAN_GREY, name = txt(v.name, 'Le nom du VLAN').toUpperCase(), subnet = String(v.subnet || '').trim();
  if (subnet && !/^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/.test(subnet)) throw new Error('Sous-réseau attendu sous la forme 10.10.10.0/24.');
  if (id !== originalId && Store.idx.vlan.has(id)) throw new Error(`Le VLAN ${id} existe déjà.`);
  Store.commit('edit', originalId == null ? `Création du VLAN ${id} (${name})` : `Modification du VLAN ${id} (${name})`, db => {
    if (originalId == null) db.vlans.push({ id, name, color, subnet });
    else { Object.assign(db.vlans.find(x => x.id === originalId), { id, name, color, subnet }); if (id !== originalId) for (const p of db.ports) if (p.vlan === originalId) p.vlan = id; }
    db.vlans.sort((a, b) => a.id - b.id);
  });
}
function deleteVlan(id) {
  const n = vlanUse(id);
  if (n) throw new Error(`Suppression impossible : le VLAN ${id} est encore affecté à ${n} port(s).`);
  Store.commit('remove', `Suppression du VLAN ${id}`, db => { db.vlans = db.vlans.filter(v => v.id !== id); });
}

export { addBuilding, addFloor, addRoom, addSite, deleteStructure, deleteVlan, emptyBase, saveVlan, updateStructure, vlanUse };
