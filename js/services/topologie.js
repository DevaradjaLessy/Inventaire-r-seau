/* Services — topologie logique calculée à partir du câblage. */
import { Cache, Store } from '../store.js';
import { byId, cablesOf, catOf, isPassive, portsOf } from './requetes.js';
import { farEnd, isNetDev } from './cablage.js';

/* --- Topologie logique : liens entre équipements actifs et niveaux calculés --- */
const LVL = { perimeter: 0, core: 1, distribution: 2, access: 3 };
function topology() {
  return Cache.get('topo', () => {
    const devs = Store.db.devices.filter(d => d.status !== 'retired' && catOf(d) && !isPassive(d));
    const links = new Map(), adj = new Map(devs.map(d => [d.id, new Set()]));
    for (const d of devs) for (const p of portsOf(d.id)) {
      if (p.role === 'pp' || !cablesOf(p.id).length) continue;
      const far = farEnd(p.id);
      if (!far || far.deviceId === d.id || p.id > far.id || !adj.has(far.deviceId)) continue;
      const [a, b] = d.id < far.deviceId ? [d.id, far.deviceId] : [far.deviceId, d.id], k = a + '|' + b;
      if (!links.has(k)) links.set(k, { a, b, pairs: [] });
      links.get(k).pairs.push(d.id === a ? [p, far] : [far, p]);
      adj.get(a).add(b); adj.get(b).add(a);
    }
    const net = devs.filter(isNetDev), layer = new Map(), cat = d => catOf(d).category;
    const nb = d => [...adj.get(d.id)].map(byId).filter(isNetDev);
    for (const d of net) { if (d.layer && d.layer in LVL) layer.set(d.id, d.layer); else if (cat(d) !== 'switch') layer.set(d.id, 'perimeter'); }
    const free = () => net.filter(d => !layer.has(d.id));
    // Cœur : switchs reliés à un pare-feu (à défaut à un routeur, à défaut modèle marqué « cœur »)
    // (seuls comptent les liens portés par un port d'uplink du switch : un simple port de gestion ne suffit pas)
    const viaUplink = (d, n) => (links.get(d.id < n.id ? d.id + '|' + n.id : n.id + '|' + d.id)?.pairs || []).some(pr => pr.some(p => p.deviceId === d.id && p.role === 'uplink'));
    let core = free().filter(d => nb(d).some(n => cat(n) === 'firewall' && layer.get(n.id) === 'perimeter' && viaUplink(d, n)));
    if (!core.length) core = free().filter(d => nb(d).some(n => layer.get(n.id) === 'perimeter' && viaUplink(d, n)));
    if (!core.length) core = free().filter(d => catOf(d).layer === 'core');
    core.forEach(d => layer.set(d.id, 'core'));
    const nearCore = d => nb(d).some(n => layer.get(n.id) === 'core');
    // Distribution : reliés au cœur, avec des switchs en aval qui ne voient pas le cœur
    for (const d of free().filter(nearCore)) if (nb(d).some(n => !layer.has(n.id) && !nearCore(n))) layer.set(d.id, 'distribution');
    for (const d of free()) layer.set(d.id, 'access');
    // Terminaux rattachés à leur équipement réseau
    const ends = new Map();
    for (const d of devs) { if (isNetDev(d)) continue; const up = [...adj.get(d.id)].map(byId).find(isNetDev); if (up) (ends.get(up.id) || ends.set(up.id, []).get(up.id)).push(d); }
    return { nodes: net, layer, links: [...links.values()], adj, ends };
  });
}
const levelOf = dev => LVL[topology().layer.get(dev.id)] ?? 9;

export { levelOf, LVL, topology };
