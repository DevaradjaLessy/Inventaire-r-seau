/* Services — lecture de la base : accès par identifiant, emplacement, occupation des baies, PoE, alertes. */
import { CATEGORIES, POE_STEPS, POE_WARN_PCT, RACK_FULL_PCT, VLAN_GREY } from '../config.js';
import { pct, sum, typeOf } from '../utils.js';
import { Cache, Store } from '../store.js';
import { planAdressage, SEUIL_PLEIN_PCT } from './adressage.js';
import { Live } from './mesures.js';
import { alertesSecurite } from './securite.js';

const byId = id => Store.idx.id.get(id);
const catOf = e => Store.idx.cat.get(e.catalogId);
const portsOf = devId => Store.idx.portsByDev.get(devId) || [];
const cablesOf = id => Store.idx.cabByEnd.get(id) || [];
const vlanOf = id => Store.idx.vlan.get(id) || { id, name: id == null ? 'Trunk' : `VLAN ${id}`, color: VLAN_GREY };
const poeColor = w => POE_STEPS.find(s => w <= s.max).color;
const isPassive = dev => catOf(dev)?.category === 'passive';
const deviceIcon = dev => CATEGORIES[catOf(dev)?.category]?.icon || 'box';

/* Remonte la hiérarchie d'un objet : { port, device, outlet, rack, room, floor, building, site } */
function locOf(id) {
  const r = {}; let t = typeOf(id), e = byId(id);
  if (!e) return r;
  if (t === 'port') { r.port = e; e = byId(e.deviceId); t = 'device'; }
  if (t === 'device') { r.device = e; if (e.rackId) { e = byId(e.rackId); t = 'rack'; } else if (e.roomId) { e = byId(e.roomId); t = 'room'; } else return r; }
  if (t === 'outlet') { r.outlet = e; e = byId(e.roomId); t = 'room'; }
  if (t === 'rack') { r.rack = e; e = byId(e.roomId); t = 'room'; }
  if (t === 'room') { r.room = e; e = byId(e.floorId); t = 'floor'; }
  if (t === 'floor') { r.floor = e; e = byId(e.buildingId); t = 'building'; }
  if (t === 'building') { r.building = e; e = byId(e.siteId); t = 'site'; }
  if (t === 'site') r.site = e;
  return r;
}
/* Emplacement en clair : « Bât. A · R+1 · Local technique A1 · BAIE-A1-01 · U38 » */
/* Nom court d'un bâtiment. Avec plusieurs sites, le site est nommé : deux sites peuvent avoir chacun leur « Bât. A ». */
function batLabel(b) {
  const site = Store.db.sites.length > 1 ? byId(b.siteId) : null;
  return `${site ? `${site.code || site.name} · ` : ''}Bât. ${b.code}`;
}
function locLabel(id, { short = false } = {}) {
  const l = locOf(id), parts = [];
  if (l.building) parts.push(batLabel(l.building));
  if (l.floor) parts.push(l.floor.name);
  if (l.room && !(short && l.rack)) parts.push(l.room.name);
  if (l.rack) parts.push(l.rack.name);
  if (l.device && l.rack && l.device.u) parts.push(`U${l.device.u}`);
  return parts.join(' · ') || '—';
}
/* Nom affichable d'un objet quelconque */
function labelOf(id) {
  const e = byId(id), t = typeOf(id);
  if (!e) return '?';
  if (t === 'port') { const d = byId(e.deviceId); return `${d ? d.hostname : '?'} · ${e.name}`; }
  if (t === 'outlet') return `Prise ${e.label}`;
  if (t === 'device') return e.hostname;
  if (t === 'floor') return `${byId(e.buildingId)?.code || ''} ${e.name}`.trim();
  if (t === 'catalog') return `${e.brand} ${e.model}`;
  return e.name || e.label || id;
}
/* Occupation d'une baie */
function rackUsage(rackId) {
  const rack = byId(rackId), devs = Store.idx.devByRack.get(rackId) || [];
  const used = sum(devs, d => catOf(d)?.heightU || 1);
  return { used, total: rack.heightU, pct: pct(used, rack.heightU), devices: devs };
}
/* U occupées d'une baie : tableau indexé par U → équipement */
function rackMap(rackId, ignoreDevId = null) {
  const map = [];
  for (const d of Store.idx.devByRack.get(rackId) || []) {
    if (d.id === ignoreDevId) continue;
    const hU = catOf(d)?.heightU || 1;
    for (let u = d.u; u < d.u + hU; u++) map[u] = d;
  }
  return map;
}
/* Budget PoE d'un switch */
function poeUsage(dev) {
  const c = catOf(dev), used = sum(portsOf(dev.id), p => p.status === 'up' ? (p.poe.watts || 0) : 0);
  return { used, budget: c.poeBudgetW || 0, pct: pct(used, c.poeBudgetW || 0) };
}
/* Liste des alertes : stock bas, ports en erreur, baies pleines, PoE, équipements en panne */
function computeAlerts() {
  return Cache.get('alerts', () => {
    const d = Store.db, out = [];
    for (const p of d.ports) if (p.status === 'error') { const dev = byId(p.deviceId); if (dev && dev.status !== 'retired') out.push({ level: 'crit', kind: 'port', icon: 'alert', text: `Port en erreur : ${dev.hostname} · ${p.name}`, sub: p.description || locLabel(p.id), ref: p.id }); }
    for (const x of d.devices) {
      if (x.status === 'fault') out.push({ level: 'crit', kind: 'device', icon: deviceIcon(x), text: `Équipement en panne : ${x.hostname}`, sub: locLabel(x.id), ref: x.id });
      if (x.status === 'maintenance') out.push({ level: 'warn', kind: 'device', icon: deviceIcon(x), text: `Équipement en maintenance : ${x.hostname}`, sub: locLabel(x.id), ref: x.id });
    }
    for (const r of d.racks) { const u = rackUsage(r.id); if (u.pct >= RACK_FULL_PCT) out.push({ level: u.pct >= 100 ? 'crit' : 'serious', kind: 'rack', icon: 'rack', text: `Baie presque pleine : ${r.name} (${u.used}/${u.total} U, ${u.pct} %)`, sub: locLabel(r.id), ref: r.id }); }
    for (const x of d.devices) { if (x.status === 'retired') continue; const c = catOf(x); if (c?.poeBudgetW) { const u = poeUsage(x); if (u.pct >= POE_WARN_PCT) out.push({ level: 'serious', kind: 'poe', icon: 'bolt', text: `Budget PoE élevé : ${x.hostname} (${u.used}/${u.budget} W)`, sub: locLabel(x.id), ref: x.id }); } }
    for (const s of d.stock) { const c = Store.idx.cat.get(s.catalogId); if (c && s.available <= s.threshold && s.threshold > 0) out.push({ level: s.available === 0 ? 'serious' : 'warn', kind: 'stock', icon: 'box', text: `Stock bas : ${c.brand} ${c.model}`, sub: `${s.available} disponible(s), seuil ${s.threshold}`, ref: c.id }); }
    // Supervision : équipements que la source mesure comme injoignables
    for (const [id, m] of Live.dev) { const x = byId(id); if (x && m.state === 'down' && x.status !== 'fault') out.push({ level: 'crit', kind: 'live', icon: deviceIcon(x), text: `Équipement injoignable (supervision) : ${x.hostname}`, sub: m.message || locLabel(x.id), ref: x.id }); }
    // Plan d'adressage : sous-réseaux presque pleins
    for (const v of planAdressage().vlans) if (v.pct >= SEUIL_PLEIN_PCT) out.push({ level: 'serious', kind: 'ip', icon: 'floor', text: `Sous-réseau presque plein : VLAN ${v.vlan.id} ${v.vlan.name} (${v.utilisees}/${v.hotes} adresses)`, sub: v.libre ? `Prochaine adresse libre : ${v.libre}` : 'Plus aucune adresse libre', act: 'vlans', ref: '' });
    // Sécurité du serveur (administrateur seulement : l'état n'est chargé que pour lui)
    out.push(...alertesSecurite());
    const order = { crit: 0, serious: 1, warn: 2 };
    return out.sort((a, b) => order[a.level] - order[b.level]);
  });
}

export { batLabel, byId, cablesOf, catOf, computeAlerts, deviceIcon, isPassive, labelOf, locLabel, locOf, poeColor, poeUsage, portsOf, rackMap, rackUsage, vlanOf };
