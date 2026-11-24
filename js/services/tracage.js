/* Services — traçage d'un chemin de câblage jusqu'au cœur. */
import { typeOf } from '../utils.js';
import { Store } from '../store.js';
import { byId, cablesOf, portsOf } from './requetes.js';
import { farEnd, isNetDev, segment } from './cablage.js';
import { levelOf, LVL } from './topologie.js';

/* --- Traçage : terminal → prise → panneau → switch d'accès → uplinks → cœur --- */
function trace(startId) {
  const seg = segment(startId);
  let nodes = [...seg.nodes], cables = [...seg.cables];
  const rank = id => { if (!id || typeOf(id) !== 'port') return 10; const p = byId(id); if (p.role === 'pp') return 10; const d = byId(p.deviceId); return isNetDev(d) ? levelOf(d) : 9; };
  if (rank(nodes[0]) < rank(nodes.at(-1))) { nodes.reverse(); cables.reverse(); }
  const internal = new Set(), seen = new Set(nodes);
  let complete = false, stop = '';
  for (let hop = 0; hop < 4; hop++) {
    const last = byId(nodes.at(-1));
    if (!last || typeOf(last.id) !== 'port' || last.role === 'pp') { stop = nodes.length > 1 ? 'Le câblage s\'arrête sur un élément passif non raccordé.' : 'Rien n\'est branché.'; break; }
    const dev = byId(last.deviceId);
    if (!isNetDev(dev)) { stop = 'Aucun équipement réseau au bout du câblage.'; break; }
    const L = levelOf(dev);
    if (L <= LVL.core) { complete = true; break; }
    const ups = portsOf(dev.id).map(p => ({ p, far: p.role !== 'pp' && cablesOf(p.id).length ? farEnd(p.id) : null })).filter(x => x.far && isNetDev(byId(x.far.deviceId)) && levelOf(byId(x.far.deviceId)) < L && !seen.has(x.p.id));
    const up = ups.find(x => x.p.status === 'up') || ups[0];
    if (!up) { stop = `${dev.hostname} n'a pas d'uplink vers le niveau supérieur.`; break; }
    internal.add(nodes.length);   // ce saut traverse l'équipement
    const s = segment(up.p.id), sn = s.nodes[0] === up.p.id ? s.nodes : [...s.nodes].reverse(), sc = s.nodes[0] === up.p.id ? s.cables : [...s.cables].reverse();
    for (const n of sn) { nodes.push(n); seen.add(n); }
    cables.push(...sc);
  }
  const devSet = new Set();
  for (const n of nodes) { if (typeOf(n) === 'port') devSet.add(byId(n).deviceId); }
  return { start: startId, rev: Store.rev, nodes, cables, internal, complete, stop, nodeSet: new Set(nodes), cableSet: new Set(cables.map(c => c.id)), devSet };
}

export { trace };
