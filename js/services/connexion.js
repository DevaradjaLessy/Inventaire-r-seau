/* Services — connexion et débranchement de câbles. */
import { CABLE_TYPES } from '../config.js';
import { nextId, typeOf } from '../utils.js';
import { Store } from '../store.js';
import { byId, cablesOf, labelOf, vlanOf } from './requetes.js';
import { isNetDev, isPassiveNode, otherEnd, segment } from './cablage.js';

/* --- Connexion et débranchement --- */
const mediaOf = id => typeOf(id) === 'outlet' || byId(id).kind === 'rj45' ? 'cuivre' : 'fibre';
/* Un port actif n'accepte qu'un câble ; un nœud passif en accepte un à l'arrière (vers un autre passif) et un à l'avant */
function canAccept(id, otherId) {
  const cs = cablesOf(id);
  if (!isPassiveNode(id)) return cs.length === 0;
  const rear = isPassiveNode(otherId);
  return !cs.some(c => isPassiveNode(otherEnd(c, id)) === rear);
}
function connectCheck(a, b) {
  if (a === b) return 'Impossible de relier un élément à lui-même.';
  if (typeOf(a) === 'outlet' && typeOf(b) === 'outlet') return 'Deux prises murales ne se relient pas directement.';
  if (typeOf(a) === 'port' && typeOf(b) === 'port' && byId(a).deviceId === byId(b).deviceId) return 'Les deux ports sont sur le même équipement.';
  if (mediaOf(a) !== mediaOf(b)) return 'Types incompatibles : cuivre d\'un côté, fibre de l\'autre.';
  if (!canAccept(a, b)) return `${labelOf(a)} est déjà câblé de ce côté.`;
  if (!canAccept(b, a)) return `${labelOf(b)} est déjà câblé de ce côté.`;
  return null;
}
function connect(a, b, type, length) {
  const err = connectCheck(a, b);
  if (err) throw new Error(err);
  return Store.commit('edit', `Connexion ${labelOf(a)} ↔ ${labelOf(b)} (${type.toUpperCase()}, ${length} m)`, db => {
    const cab = { id: nextId(db, 'cab'), a, b, type, length, color: CABLE_TYPES[type].color, label: '' };
    db.cables.push(cab);
    Store.reindex();
    // Si la liaison relie maintenant deux ports actifs, le lien monte
    const ends = segment(a).nodes.map(byId).filter(n => n && n.deviceId && n.role !== 'pp');
    if (ends.length === 2) { for (const p of ends) if (p.status === 'down') p.status = 'up'; const v = ends.find(p => isNetDev(byId(p.deviceId)))?.vlan; if (type === 'patch' && v != null) cab.color = vlanOf(v).color; }
    return cab;
  }, a);
}
function disconnect(cableId) {
  const cab = byId(cableId);
  if (!cab) return;
  const ends = segment(cab.a).nodes.map(byId).filter(n => n && n.deviceId && n.role !== 'pp');
  Store.commit('edit', `Débranchement ${labelOf(cab.a)} ↔ ${labelOf(cab.b)}`, db => {
    db.cables.splice(db.cables.indexOf(cab), 1);
    if (ends.length === 2) for (const p of ends) if (p.status === 'up') { p.status = 'down'; p.poe.watts = 0; }
  }, cab.a);
}

export { canAccept, connect, connectCheck, disconnect, mediaOf };
