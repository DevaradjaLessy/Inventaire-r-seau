/* Services — liaisons entre bâtiments et entre sites : les câbles dont les deux bouts ne sont pas dans le même bâtiment
   (rocades de fibre entre deux tiroirs optiques, lien direct entre deux switchs). Tout vient du câblage saisi. */
import { CABLE_TYPES } from '../config.js';
import { typeOf } from '../utils.js';
import { Cache, Store } from '../store.js';
import { byId, locOf } from './requetes.js';
import { effStatus, segment } from './cablage.js';

/* Liste des liaisons : { a, b (bâtiments), entreSites, cables, types (libellés), longueur (m, la plus grande), actifs, bouts: [[nom, nom]] } */
function liaisons() {
  return Cache.get('liaisons', () => {
    const paires = new Map();
    for (const c of Store.db.cables) {
      const la = locOf(c.a), lb = locOf(c.b);
      if (!la.building || !lb.building || la.building.id === lb.building.id) continue;
      const [x, y] = la.building.id < lb.building.id ? [la, lb] : [lb, la], cle = `${x.building.id}|${y.building.id}`;
      const l = paires.get(cle) || paires.set(cle, { a: x.building, b: y.building, entreSites: x.site?.id !== y.site?.id, cables: [], types: new Set(), longueur: 0, actifs: 0, bouts: [] }).get(cle);
      l.cables.push(c); l.types.add(CABLE_TYPES[c.type]?.label || c.type); l.longueur = Math.max(l.longueur, +c.length || 0);
      // Lien actif : le port réseau au bout de la chaîne est monté
      const port = typeOf(c.a) === 'port' ? byId(c.a) : null;
      if (port && effStatus(port) === 'up') l.actifs++;
      // Équipements actifs aux deux bouts de la chaîne (au-delà des tiroirs optiques), pour dire ce que le lien relie
      const n = segment(c.a).nodes, nom = id => { const e = byId(id), d = e && typeOf(id) === 'port' ? byId(e.deviceId) : null; return d ? d.hostname : ''; };
      if (n.length > 1) l.bouts.push([nom(n[0]), nom(n.at(-1))]);
    }
    return [...paires.values()].map(l => ({ ...l, types: [...l.types] })).sort((p, q) => q.entreSites - p.entreSites || p.a.name.localeCompare(q.a.name));
  });
}
/* Liaisons qui touchent un bâtiment ou un site donné */
const liaisonsDe = id => liaisons().filter(l => [l.a.id, l.b.id, l.a.siteId, l.b.siteId].includes(id));

export { liaisons, liaisonsDe };
