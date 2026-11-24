/* Services — analyse d'impact : ce qui cesse de fonctionner si un équipement réseau tombe.
   Compte ce que l'équipement dessert lui-même, et ce que desservent les équipements réseau qu'il isole du cœur. */
import { typeOf } from '../utils.js';
import { Cache } from '../store.js';
import { byId, cablesOf, catOf, locOf, portsOf, vlanOf } from './requetes.js';
import { farEnd, isNetDev, segment } from './cablage.js';
import { topology } from './topologie.js';

/* Équipements réseau qui ne rejoignent plus le cœur (ni le périmètre) sans l'équipement donné */
function isolesPar(devId) {
  const tp = topology(), reseau = new Set(tp.nodes.map(n => n.id));
  const racines = tp.nodes.filter(n => n.id !== devId && ['core', 'perimeter'].includes(tp.layer.get(n.id)));
  if (!racines.length) return [];
  const vus = new Set(racines.map(n => n.id)), file = [...vus];
  while (file.length) for (const v of tp.adj.get(file.pop()) || []) if (v !== devId && reseau.has(v) && !vus.has(v)) { vus.add(v); file.push(v); }
  return tp.nodes.filter(n => n.id !== devId && !vus.has(n.id)).sort((a, b) => a.hostname.localeCompare(b.hostname));
}
/* retour : { device, isolated, rows, outlets, terminals, rooms }
   rows : une ligne par port desservant quelque chose — { via, port, vlan, outlet, terminal, poste, room } */
function impactOf(devId) {
  return Cache.get('impact:' + devId, () => {
    const device = byId(devId), isolated = isNetDev(device) ? isolesPar(devId) : [], touches = new Set([devId, ...isolated.map(d => d.id)]);
    const rows = [], outlets = new Map(), terminals = new Map(), rooms = new Map();
    for (const id of touches) {
      const via = byId(id);
      for (const p of portsOf(id)) {
        if (p.role === 'pp' || !cablesOf(p.id).length) continue;
        const far = farEnd(p.id), autre = far ? byId(far.deviceId) : null;
        if (autre && (touches.has(autre.id) || isNetDev(autre))) continue;   // lien vers un autre équipement réseau : pas un usager
        const prise = segment(p.id).nodes.map(byId).find(n => n && typeOf(n.id) === 'outlet') || null;
        if (!prise && !autre) continue;
        const room = (prise ? byId(prise.roomId) : locOf(autre.id).room) || null;
        if (prise) outlets.set(prise.id, prise);
        if (autre) terminals.set(autre.id, autre);
        if (room) rooms.set(room.id, room);
        rows.push({ via, port: p, vlan: p.vlan == null ? 'Trunk' : `${p.vlan} ${vlanOf(p.vlan).name}`, outlet: prise, terminal: autre, poste: autre ? '' : p.connected || '', room });
      }
    }
    rows.sort((a, b) => (a.room?.name || '~').localeCompare(b.room?.name || '~') || (a.outlet?.label || '').localeCompare(b.outlet?.label || ''));
    return { device, isolated, rows, outlets: [...outlets.values()], terminals: [...terminals.values()], rooms: [...rooms.values()], categories: [...new Set([...terminals.values()].map(d => catOf(d).category))] };
  });
}

export { impactOf };
