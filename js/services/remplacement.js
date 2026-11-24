/* Services — remplacement d'un équipement par un modèle du stock (échange standard).
   Le nouveau reprend le nom, l'adresse IP, l'emplacement, la configuration des ports et le câblage. */
import { fmtDate, plural, today } from '../utils.js';
import { mkDevice } from '../demo.js';
import { Store } from '../store.js';
import { byId, cablesOf, catOf, portsOf } from './requetes.js';
import { farEnd } from './cablage.js';
import { freeSlots, stockOf } from './installation.js';

/* Ports d'un modèle, dans l'ordre de la façade : [{ kind, role }] */
const portsDuModele = cat => (cat.ports || []).flatMap(g => Array.from({ length: g.names ? g.names.length : g.count }, () => ({ kind: g.kind, role: g.role || 'access', poe: !!g.poe, speed: g.speed || 1000 })));
const optique = k => k === 'sfp' || k === 'sfp+';
const compatible = (a, b) => (a.kind === b.kind || (optique(a.kind) && optique(b.kind))) && (a.role === 'pp') === (b.role === 'pp');

/* Prépare le remplacement sans rien modifier.
   retour : { cat, correspondance (Map ancien port → rang du nouveau), repris (câbles gardés), perdus (anciens ports câblés sans équivalent), erreur } */
function planRemplacement(devId, catId) {
  const dev = byId(devId), ancien = catOf(dev), cat = Store.idx.cat.get(catId), vide = { cat, correspondance: new Map(), repris: 0, perdus: [], erreur: '' };
  if (!cat) return { ...vide, erreur: 'Modèle inconnu.' };
  if (cat.mount !== ancien.mount || cat.category === 'rack' || cat.template === 'outlet') return { ...vide, erreur: 'Ce modèle ne se monte pas au même endroit que l\'équipement à remplacer.' };
  if (stockOf(cat.id).available < 1) return { ...vide, erreur: `Stock épuisé pour ${cat.brand} ${cat.model}.` };
  if (dev.rackId && !freeSlots(dev.rackId, cat.heightU || 1, dev.id).includes(dev.u)) return { ...vide, erreur: `Le nouveau modèle (${cat.heightU || 1} U) ne tient pas à l'emplacement U${dev.u}.` };
  const neufs = portsDuModele(cat), pris = new Set(), correspondance = new Map(), perdus = [];
  const anciens = [...portsOf(devId)].sort((a, b) => a.idx - b.idx), cable = p => cablesOf(p.id).length > 0;
  const placer = (p, strict) => {
    let i = neufs[p.idx] && !pris.has(p.idx) && compatible(p, neufs[p.idx]) ? p.idx : -1;
    if (i < 0 && !strict) i = neufs.findIndex((n, k) => !pris.has(k) && compatible(p, n) && n.role === p.role);
    if (i < 0 && !strict) i = neufs.findIndex((n, k) => !pris.has(k) && compatible(p, n));
    if (i >= 0) { pris.add(i); correspondance.set(p.id, i); }
    return i >= 0;
  };
  // Les ports câblés d'abord (ils cherchent un port équivalent ailleurs s'il le faut), puis les autres au même rang
  for (const p of anciens.filter(cable)) if (!placer(p, false)) perdus.push(p);
  for (const p of anciens.filter(p => !cable(p))) placer(p, true);
  const repris = anciens.filter(p => cable(p) && correspondance.has(p.id)).reduce((n, p) => n + cablesOf(p.id).length, 0);
  return { cat, correspondance, repris, perdus, sansPort: perdus.reduce((n, p) => n + cablesOf(p.id).length, 0), erreur: '' };
}
/* Remplace l'équipement. sort : « retire » (l'ancien reste à l'inventaire, hors service) ou « stock » (il retourne en stock).
   Renvoie l'identifiant du nouvel équipement. */
function replaceDevice(devId, catId, sort = 'retire') {
  const dev = byId(devId), ancien = catOf(dev), plan = planRemplacement(devId, catId);
  if (plan.erreur) throw new Error(plan.erreur);
  const cat = plan.cat, nom = dev.hostname;
  return Store.commit('add', `Remplacement de ${nom} (${ancien.model} → ${cat.model})${plan.perdus.length ? `, ${plural(plan.sansPort, 'câble')} sans port` : ''}`, db => {
    db.stock.find(s => s.catalogId === cat.id).available--;
    const place = dev.rackId ? { rackId: dev.rackId, u: dev.u } : { roomId: dev.roomId, x: dev.x, y: dev.y };
    const reprise = { ip: dev.ip, layer: dev.layer };
    // L'ancien libère son nom, son adresse et sa place avant que le nouveau les prenne
    let libre = `${nom}-ANCIEN`; for (let i = 2; db.devices.some(d => d.hostname === libre); i++) libre = `${nom}-ANCIEN-${i}`;
    const anciensPorts = portsOf(devId);
    Object.assign(dev, { hostname: libre, ip: '', rackId: null, u: null, roomId: null, x: null, y: null });
    const { dev: neuf, ports } = mkDevice(db, cat, { hostname: nom, ip: reprise.ip, ...place, notes: `Remplace ${ancien.brand} ${ancien.model}${dev.serial ? ` (série ${dev.serial})` : ''} le ${fmtDate(today())}.${dev.notes ? ' ' + dev.notes : ''}` });
    if (reprise.layer) neuf.layer = reprise.layer;
    // Configuration et câbles, port par port
    const versNeuf = new Map();
    for (const p of anciensPorts) {
      const i = plan.correspondance.get(p.id);
      if (i == null) continue;
      const n = ports[i]; versNeuf.set(p.id, n.id);
      Object.assign(n, { status: p.status, vlan: p.vlan, description: p.description, connected: p.connected, mac: p.mac, speed: Math.min(p.speed, n.speed) || n.speed });
      if (n.poe.capable) n.poe.watts = p.poe.watts;
    }
    const perdus = new Set(plan.perdus.map(p => p.id));
    for (const p of plan.perdus) { const far = farEnd(p.id); if (far && far.status === 'up') { far.status = 'down'; far.poe.watts = 0; } }
    db.cables = db.cables.filter(c => !perdus.has(c.a) && !perdus.has(c.b));
    for (const c of db.cables) { if (versNeuf.has(c.a)) c.a = versNeuf.get(c.a); if (versNeuf.has(c.b)) c.b = versNeuf.get(c.b); }
    // Sort de l'ancien équipement
    if (sort === 'stock') {
      const ids = new Set(anciensPorts.map(p => p.id));
      db.ports = db.ports.filter(p => !ids.has(p.id)); db.devices.splice(db.devices.indexOf(dev), 1);
      const s = db.stock.find(x => x.catalogId === ancien.id); if (s) s.available++; else db.stock.push({ catalogId: ancien.id, available: 1, threshold: 0, location: '' });
    } else {
      Object.assign(dev, { status: 'retired', mac: dev.mac, notes: `${dev.notes ? dev.notes + ' — ' : ''}Remplacé le ${fmtDate(today())} par ${cat.brand} ${cat.model}.` });
      for (const p of anciensPorts) { if (p.role !== 'pp') p.status = 'down'; p.poe.watts = 0; p.connected = ''; }
    }
    return neuf.id;
  }, devId);
}

export { planRemplacement, replaceDevice };
