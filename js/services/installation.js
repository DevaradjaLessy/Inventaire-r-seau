/* Services — installation, déplacement, retrait et mouvements de stock. */
import { fmtDate, nextId, pad2, today } from '../utils.js';
import { mkDevice } from '../demo.js';
import { Store } from '../store.js';
import { byId, catOf, locLabel, locOf, portsOf, rackMap } from './requetes.js';
import { farEnd, outletInfo } from './cablage.js';
import { canAccept } from './connexion.js';

/* --- Installation, déplacement et retrait --- */
const HOST_PREFIX = { switch: 'SW', router: 'RTR', firewall: 'FW', ap: 'AP', ups: 'OND', server: 'SRV', phone: 'TEL', camera: 'CAM', rack: 'BAIE' };
const stockOf = catId => Store.idx.stock.get(catId) || { catalogId: catId, available: 0, threshold: 0, location: '' };
const installedCount = catId => (Store.idx.devByCat.get(catId) || []).length + (catId === 'cat-outlet' ? Store.db.outlets.length : 0);
/* Propose un nom libre : préfixe du type + bâtiment et niveau + numéro */
function suggestName(cat, roomId) {
  const l = locOf(roomId), zone = l.floor ? `${l.building.code}${l.floor.level}` : 'X0';
  const pre = cat.category === 'passive' ? ({ patch: 'PP', fiber: 'FO', cablemgr: 'PC' }[cat.template] || 'PAS') : cat.template === 'wallrack' ? 'COFFRET' : HOST_PREFIX[cat.category] || 'EQ';
  const used = new Set([...Store.db.devices.map(x => x.hostname), ...Store.db.racks.map(x => x.name), ...Store.db.outlets.map(x => x.label)]);
  if (cat.template === 'outlet') { for (let i = 1; ; i++) { const s = `${zone}-${String(i).padStart(3, '0')}`; if (!used.has(s)) return s; } }
  for (let i = 1; ; i++) { const s = `${pre}-${zone}-${pad2(i)}`; if (!used.has(s)) return s; }
}
/* U libres où un équipement de hauteur hU peut être posé (U la plus basse), de haut en bas */
function freeSlots(rackId, hU, ignoreDevId = null) {
  const rack = byId(rackId), map = rackMap(rackId, ignoreDevId), out = [];
  for (let u = rack.heightU - hU + 1; u >= 1; u--) { let ok = true; for (let k = u; k < u + hU; k++) if (map[k]) ok = false; if (ok) out.push(u); }
  return out;
}
function checkPlace(cat, o, ignoreDevId = null) {
  if (cat.mount === 'rack') {
    const rack = byId(o.rackId);
    if (!rack) throw new Error('Choisissez une baie.');
    if (!freeSlots(o.rackId, cat.heightU || 1, ignoreDevId).includes(+o.u)) throw new Error(`Emplacement U${o.u} indisponible dans ${rack.name} (${cat.heightU || 1} U nécessaires).`);
  } else {
    const room = byId(o.roomId);
    if (!room) throw new Error('Choisissez une pièce.');
    if (!(o.x >= room.x && o.x <= room.x + room.w && o.y >= room.y && o.y <= room.y + room.h)) throw new Error(`Position hors de la pièce ${room.name}.`);
  }
}
/* Installe un modèle du stock. o : { rackId, u } ou { roomId, x, y }, plus name, ip, outletId */
function installFromStock(catId, o) {
  const cat = Store.idx.cat.get(catId), st = stockOf(catId);
  if (!cat) throw new Error('Modèle inconnu.');
  if (cat.mount === 'none') throw new Error('Ce modèle est un consommable : utilisez « Sortie de stock ».');
  if (st.available < 1) throw new Error(`Stock épuisé pour ${cat.brand} ${cat.model}.`);
  checkPlace(cat, o);
  const name = (o.name || '').trim() || suggestName(cat, o.roomId || byId(o.rackId).roomId);
  const where = cat.mount === 'rack' ? `${byId(o.rackId).name}, U${o.u}` : byId(o.roomId).name;
  return Store.commit('add', `Installation de ${name} — ${cat.brand} ${cat.model} (${where})`, db => {
    db.stock.find(s => s.catalogId === catId).available--;
    if (cat.category === 'rack') { const r = { id: nextId(db, 'rack'), roomId: o.roomId, catalogId: catId, name, heightU: cat.heightU, x: o.x, y: o.y, serial: '', installDate: today(), status: 'active' }; db.racks.push(r); return r.id; }
    if (cat.template === 'outlet') { const ot = { id: nextId(db, 'o'), roomId: o.roomId, label: name, x: o.x, y: o.y, usage: o.usage || 'data' }; db.outlets.push(ot); return ot.id; }
    const { dev, ports } = mkDevice(db, cat, { hostname: name, ip: o.ip || '', ...(cat.mount === 'rack' ? { rackId: o.rackId, u: +o.u } : { roomId: o.roomId, x: o.x, y: o.y }) });
    if (o.outletId && ports[0] && canAccept(o.outletId, ports[0].id)) {
      db.cables.push({ id: nextId(db, 'cab'), a: ports[0].id, b: o.outletId, type: 'patch', length: 2, color: '#8b9bb0', label: '' });
      const net = outletInfo(o.outletId).net;
      if (net && net.status !== 'disabled') { net.status = 'up'; ports[0].status = 'up'; ports[0].vlan = net.vlan; if (net.poe.capable && cat.poeDrawW) net.poe.watts = cat.poeDrawW; }
    }
    return dev.id;
  });
}
function moveDevice(id, o) {
  const dev = byId(id), cat = catOf(dev);
  checkPlace(cat, o, id);
  const where = cat.mount === 'rack' ? `${byId(o.rackId).name}, U${o.u}` : byId(o.roomId).name;
  Store.commit('move', `Déplacement de ${dev.hostname} vers ${where}`, () => {
    if (cat.mount === 'rack') Object.assign(dev, { rackId: o.rackId, u: +o.u, roomId: null, x: null, y: null });
    else Object.assign(dev, { roomId: o.roomId, x: o.x, y: o.y, rackId: null, u: null });
  }, id);
}
/* Retire un équipement : mode « stock » (retour en stock) ou « retire » (hors service, reste à l'inventaire) */
function removeDevice(id, mode) {
  const dev = byId(id), cat = catOf(dev), was = locLabel(id);
  Store.commit('remove', `Retrait de ${dev.hostname} (${mode === 'stock' ? 'retour en stock' : 'hors service'})`, db => {
    const pids = new Set(portsOf(id).map(p => p.id));
    // Les ports reliés à l'équipement retiré retombent
    for (const p of portsOf(id)) { const far = p.role !== 'pp' ? farEnd(p.id) : null; if (far && far.status === 'up') { far.status = 'down'; far.poe.watts = 0; } }
    db.cables = db.cables.filter(c => !pids.has(c.a) && !pids.has(c.b));
    if (mode === 'stock') {
      db.ports = db.ports.filter(p => !pids.has(p.id));
      db.devices.splice(db.devices.indexOf(dev), 1);
      const s = db.stock.find(x => x.catalogId === cat.id); if (s) s.available++; else db.stock.push({ catalogId: cat.id, available: 1, threshold: 0, location: '' });
    } else {
      Object.assign(dev, { status: 'retired', rackId: null, u: null, roomId: null, x: null, y: null, notes: `${dev.notes ? dev.notes + ' — ' : ''}Retiré le ${fmtDate(today())}. Ancien emplacement : ${was}` });
      for (const p of portsOf(id)) { if (p.role !== 'pp') p.status = 'down'; p.poe.watts = 0; }
    }
  });
}
function removeRack(id) {
  const rack = byId(id);
  if ((Store.idx.devByRack.get(id) || []).length) throw new Error('La baie contient encore des équipements : retirez-les d\'abord.');
  Store.commit('remove', `Retrait de la baie ${rack.name} (retour en stock)`, db => { db.racks.splice(db.racks.indexOf(rack), 1); const s = db.stock.find(x => x.catalogId === rack.catalogId); if (s) s.available++; });
}
/* Mouvement de stock : entrée (qty > 0) ou sortie (qty < 0) */
function stockMove(catId, qty, reason = '') {
  const cat = Store.idx.cat.get(catId), st = stockOf(catId);
  if (st.available + qty < 0) throw new Error(`Stock insuffisant : ${st.available} disponible(s).`);
  Store.commit('stock', `${qty > 0 ? 'Entrée en' : 'Sortie de'} stock : ${Math.abs(qty)} × ${cat.brand} ${cat.model}${reason ? ` (${reason})` : ''}`, db => {
    let s = db.stock.find(x => x.catalogId === catId); if (!s) { s = { catalogId: catId, available: 0, threshold: 0, location: '' }; db.stock.push(s); }
    s.available += qty;
  }, catId);
}

export { freeSlots, installedCount, installFromStock, moveDevice, removeDevice, removeRack, stockMove, stockOf, suggestName };
