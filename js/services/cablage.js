/* Services — câblage : parcours des segments, état des prises et des ports passifs. */
import { COL } from '../config.js';
import { typeOf } from '../utils.js';
import { Cache, Store } from '../store.js';
import { byId, cablesOf, catOf, locOf } from './requetes.js';
import { measuredPort } from './mesures.js';

/* --- Câblage : parcours des segments --- */
const NET_CATS = ['switch', 'router', 'firewall'];
const isNetDev = dev => NET_CATS.includes(catOf(dev)?.category);
/* Un nœud passif (prise murale, port de panneau ou de tiroir) laisse passer le signal : au plus 2 câbles */
const isPassiveNode = id => typeOf(id) === 'outlet' || byId(id)?.role === 'pp';
const otherEnd = (cab, id) => cab.a === id ? cab.b : cab.a;
/* Avance depuis un nœud en suivant un câble, en traversant les éléments passifs */
function walk(fromId, cab) {
  const nodes = [], cables = [], seen = new Set([fromId]);
  let cur = fromId, c = cab;
  while (c) {
    const nx = otherEnd(c, cur);
    cables.push(c); nodes.push(nx);
    if (seen.has(nx) || !isPassiveNode(nx)) break;
    seen.add(nx);
    const prev = c;
    c = cablesOf(nx).find(k => k !== prev);
    cur = nx;
  }
  return { nodes, cables };
}
/* Segment complet qui passe par un nœud : d'une extrémité active à l'autre */
function segment(id) {
  return Cache.get('seg:' + id, () => {
    const cs = cablesOf(id), none = { nodes: [], cables: [] };
    if (isPassiveNode(id)) {
      const l = cs[0] ? walk(id, cs[0]) : none, r = cs[1] ? walk(id, cs[1]) : none;
      return { nodes: [...[...l.nodes].reverse(), id, ...r.nodes], cables: [...[...l.cables].reverse(), ...r.cables] };
    }
    const r = cs[0] ? walk(id, cs[0]) : none;
    return { nodes: [id, ...r.nodes], cables: r.cables };
  });
}
/* Port actif situé à l'autre bout du segment (ou null) */
function farEnd(portId) {
  const n = segment(portId).nodes, last = n[n.length - 1] === portId ? n[0] : n[n.length - 1];
  return last && last !== portId && typeOf(last) === 'port' && !isPassiveNode(last) ? byId(last) : null;
}
/* Libellé de ce qui est connecté à un port */
function connectedLabel(p) {
  const far = p.role === 'pp' ? null : farEnd(p.id);
  if (far) { const d = byId(far.deviceId); return `${d.hostname} · ${far.name}${far.connected ? ` (+ ${far.connected})` : ''}`; }
  return p.connected || '';
}
/* Chaîne d'une prise murale : port réseau, port du terminal, port du panneau, état */
function outletInfo(id) {
  return Cache.get('oi:' + id, () => {
    let net = null, term = null, pp = null;
    for (const n of segment(id).nodes) {
      if (typeOf(n) !== 'port') continue;
      const p = byId(n);
      if (p.role === 'pp') { pp = pp || p; continue; }
      if (isNetDev(byId(p.deviceId))) net = p; else term = p;
    }
    return { net, term, pp, status: net ? effStatus(net) : pp ? 'idle' : 'free' };
  });
}
/* État effectif d'un port : pour un port passif, c'est l'état du port réseau relié */
/* (si une source de supervision est active, l'état mesuré remplace l'état saisi à l'affichage) */
function effStatus(p) {
  if (p.role !== 'pp') return measuredPort(p.id)?.status ?? p.status;
  let net = null;
  for (const n of segment(p.id).nodes) { if (typeOf(n) !== 'port') continue; const q = byId(n); if (q.role !== 'pp' && isNetDev(byId(q.deviceId))) net = q; }
  return net ? effStatus(net) : cablesOf(p.id).length ? 'idle' : 'free';
}
const STATE_COL = { up: COL.up, down: COL.down, disabled: COL.dis, error: COL.crit, idle: '#44556a', free: '#2a3646' };
const STATE_LABEL = { up: 'Actif', down: 'Inactif', disabled: 'Désactivé', error: 'Erreur', idle: 'Non brassé', free: 'Libre' };
/* Pièce qui contient un point du plan */
function roomAt(floorId, x, y) {
  return (Store.idx.roomsByFloor.get(floorId) || []).find(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) || null;
}
/* Tous les objets situés sous un niveau de la hiérarchie */
function scopeOf(id) {
  return Cache.get('scope:' + id, () => {
    const t = typeOf(id), d = Store.db, inScope = x => locOf(x.id)[t]?.id === id;
    return { racks: d.racks.filter(inScope), devices: d.devices.filter(x => x.status !== 'retired' && inScope(x)), outlets: d.outlets.filter(inScope) };
  });
}
/* Dimensions au sol d'une baie, en mètres */
const rackSize = rack => { const v = catOf(rack)?.visual || {}; return { w: v.width || 0.75, d: v.depth || 1.07 }; };

export { NET_CATS, connectedLabel, effStatus, farEnd, isNetDev, isPassiveNode, otherEnd, outletInfo, rackSize, roomAt, scopeOf, segment, STATE_COL, STATE_LABEL };
