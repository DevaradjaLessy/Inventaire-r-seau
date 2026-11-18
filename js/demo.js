/* Jeu de données de démonstration, généré avec une graine fixe. Tout est fictif : MAC administrées localement (02:…), IP privées 10.10.x.x, WAN en 203.0.113.x, séries « DMO- ». */
import { APP, CABLE_TYPES, VLAN_GREY, VLANS_DEF } from './config.js';
import { clamp, mulberry32, nextId, pad2, today } from './utils.js';
import { DEFAULT_STOCK, defaultCatalog } from './catalogue.js';

function emptyDb() {
  return {
    meta: { app: APP.name, schemaVersion: APP.schemaVersion, updatedAt: Date.now(), demo: false, seq: 0 },
    vlans: [], sites: [], buildings: [], floors: [], rooms: [], racks: [], devices: [], ports: [], outlets: [], cables: [],
    catalog: [], stock: [], history: [],
  };
}
/* Crée les ports d'un équipement à partir des groupes de ports de son modèle */
function mkPorts(db, dev, cat) {
  const out = []; let idx = 0;
  for (const grp of cat.ports || []) {
    const n = grp.names ? grp.names.length : grp.count;
    for (let i = 0; i < n; i++) {
      const passive = grp.role === 'pp';
      out.push({
        id: nextId(db, 'p'), deviceId: dev.id, idx: idx++,
        name: grp.names ? grp.names[i] : `${grp.prefix || ''}${(grp.start ?? 1) + i}`,
        kind: grp.kind, role: grp.role || 'access', speed: grp.speed || 1000,
        status: passive ? 'up' : 'down', vlan: passive || grp.role === 'uplink' ? null : 1,
        poe: { capable: !!grp.poe, watts: 0 }, mac: '', connected: '', description: '',
      });
    }
  }
  return out;
}
/* Crée un équipement et ses ports dans la base (sans toucher au stock) */
function mkDevice(db, cat, p) {
  const dev = {
    id: nextId(db, 'dev'), catalogId: cat.id, hostname: p.hostname || cat.model, rackId: p.rackId || null, u: p.u || null,
    roomId: p.roomId || null, x: p.x ?? null, y: p.y ?? null, serial: p.serial || '', ip: p.ip || '', mac: p.mac || '',
    firmware: p.firmware ?? cat.firmware ?? '', installDate: p.installDate || today(), status: p.status || 'active', notes: p.notes || '',
  };
  db.devices.push(dev);
  const ports = mkPorts(db, dev, cat);
  db.ports.push(...ports);
  return { dev, ports };
}

function buildDemo() {
  const db = emptyDb();
  db.meta.demo = true;
  db.vlans = VLANS_DEF.map(v => ({ ...v }));
  db.catalog = defaultCatalog();
  db.stock = db.catalog.map(c => ({ catalogId: c.id, available: (DEFAULT_STOCK[c.id] || [0, 0])[0], threshold: (DEFAULT_STOCK[c.id] || [0, 0])[1], location: 'Local stock IT (Bât. A, RDC)' }));

  const R = mulberry32(20261118);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const hex = n => n.toString(16).padStart(2, '0');
  const mac = () => '02:' + [0, 0, 0, 0, 0].map(() => hex(ri(0, 255))).join(':');
  const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const serial = () => 'DMO-' + Array.from({ length: 8 }, () => ALNUM[ri(0, ALNUM.length - 1)]).join('');
  const date = (y0, y1) => `${ri(y0, y1)}-${pad2(ri(1, 12))}-${pad2(ri(1, 28))}`;
  const ipn = {};
  const ip = v => `10.10.${v}.${(ipn[v] = (ipn[v] || 10) + 1)}`;
  const cat = id => db.catalog.find(c => c.id === id);
  const portsOf = new Map();
  const add = (catId, props) => { const { dev, ports } = mkDevice(db, cat(catId), { serial: serial(), installDate: date(2021, 2025), ...props }); portsOf.set(dev.id, ports); return dev; };
  const P = (dev, i) => portsOf.get(dev.id)[i];
  const PN = (dev, name) => portsOf.get(dev.id).find(p => p.name === name);
  const ups = dev => portsOf.get(dev.id).filter(p => p.role === 'uplink');
  const cable = (a, b, type, length, color, label = '') => db.cables.push({ id: nextId(db, 'cab'), a: a.id, b: b.id, type, length, color: color || CABLE_TYPES[type].color, label });
  const vcol = v => (db.vlans.find(x => x.id === v) || {}).color || VLAN_GREY;

  // --- Site, bâtiments, étages, pièces ---
  const site = { id: nextId(db, 'site'), name: 'Campus Démo', code: 'DEMO', address: '1 rue de l\'Exemple, 00000 Villefictive' };
  db.sites.push(site);
  /* Pièce : [nom, code court, type, x, y, largeur, hauteur, besoins { d: données, v: voix, p: imprimante, ap, cam }] */
  const PLAN = [
    { code: 'A', name: 'Bâtiment A — Administration', floors: [
      { level: 0, name: 'RDC', w: 40, h: 22, rooms: [
        ['Hall d\'accueil', 'ACC', 'hall', 0, 0, 14, 10, { d: 1, v: 1, ap: 1, cam: 1 }],
        ['Salle de réunion Atrium', 'ATR', 'meeting', 14, 0, 8, 10, { d: 2 }],
        ['Bureaux Comptabilité', 'CPT', 'office', 22, 0, 8, 10, { d: 3, v: 2, p: 1 }],
        ['Salle informatique', 'INFO', 'server', 30, 0, 10, 10, { d: 2, cam: 1 }],
        ['Circulation RDC', 'CIR', 'hall', 0, 10, 40, 3, { ap: 1, cam: 1 }],
        ['Open space Services généraux', 'SG', 'open', 0, 13, 18, 9, { d: 4, v: 2, ap: 1 }],
        ['Bureaux Ressources humaines', 'RH', 'office', 18, 13, 10, 9, { d: 2, v: 1 }],
        ['Reprographie', 'REP', 'storage', 28, 13, 6, 9, { p: 1 }],
        ['Local stock IT', 'STK', 'storage', 34, 13, 6, 9, { d: 1 }],
      ] },
      { level: 1, name: 'R+1', w: 40, h: 22, rooms: [
        ['Open space Commercial', 'COM', 'open', 0, 0, 20, 10, { d: 5, v: 3, ap: 1, p: 1 }],
        ['Salle de réunion Horizon', 'HOR', 'meeting', 20, 0, 9, 10, { d: 2, ap: 1 }],
        ['Bureaux Marketing', 'MKT', 'office', 29, 0, 11, 10, { d: 3, v: 1 }],
        ['Circulation R+1', 'CIR', 'hall', 0, 10, 40, 3, { cam: 1 }],
        ['Open space Études', 'ETU', 'open', 0, 13, 22, 9, { d: 5, v: 2, ap: 1 }],
        ['Local technique A1', 'LT', 'tech', 22, 13, 5, 9, {}],
        ['Bureaux Achats', 'ACH', 'office', 27, 13, 13, 9, { d: 3, v: 2, ap: 1 }],
      ] },
      { level: 2, name: 'R+2', w: 40, h: 22, rooms: [
        ['Bureau Direction générale', 'DG', 'office', 0, 0, 12, 10, { d: 1, v: 1, ap: 1 }],
        ['Salle du conseil', 'CSL', 'meeting', 12, 0, 12, 10, { d: 2 }],
        ['Bureaux Direction financière', 'DAF', 'office', 24, 0, 16, 10, { d: 3, v: 1 }],
        ['Circulation R+2', 'CIR', 'hall', 0, 10, 40, 3, {}],
        ['Open space Juridique', 'JUR', 'open', 0, 13, 17, 9, { d: 3, v: 1, p: 1 }],
        ['Local technique A2', 'LT', 'tech', 17, 13, 5, 9, {}],
        ['Bureaux DSI', 'DSI', 'office', 22, 13, 18, 9, { d: 4, v: 2, ap: 1 }],
      ] },
    ] },
    { code: 'B', name: 'Bâtiment B — Ateliers & Logistique', floors: [
      { level: 0, name: 'RDC', w: 50, h: 28, rooms: [
        ['Atelier de production', 'ATL', 'workshop', 0, 0, 26, 18, { d: 3, v: 1, ap: 2, cam: 1 }],
        ['Magasin', 'MAG', 'storage', 26, 0, 14, 18, { d: 2, v: 1, ap: 1 }],
        ['Quai de livraison', 'QUAI', 'hall', 40, 0, 10, 18, { d: 1, cam: 1 }],
        ['Circulation RDC', 'CIR', 'hall', 0, 18, 50, 3, {}],
        ['Local technique B0', 'LT', 'tech', 0, 21, 6, 7, {}],
        ['Bureau Chef d\'atelier', 'CHEF', 'office', 6, 21, 10, 7, { d: 1, v: 1 }],
        ['Atelier Maintenance', 'MNT', 'workshop', 16, 21, 14, 7, { d: 2 }],
        ['Vestiaires et salle de pause', 'PAUSE', 'open', 30, 21, 20, 7, { ap: 1 }],
      ] },
      { level: 1, name: 'R+1', w: 36, h: 20, rooms: [
        ['Bureaux Logistique', 'LOG', 'office', 0, 0, 14, 9, { d: 3, v: 1, ap: 1 }],
        ['Salle de formation', 'FORM', 'meeting', 14, 0, 12, 9, { d: 4, ap: 1 }],
        ['Bureau Méthodes', 'MET', 'office', 26, 0, 10, 9, { d: 2, v: 1 }],
        ['Circulation R+1', 'CIR', 'hall', 0, 9, 36, 3, {}],
        ['Open space Planification', 'PLN', 'open', 0, 12, 20, 8, { d: 4, v: 1 }],
        ['Local technique B1', 'LT', 'tech', 20, 12, 4, 8, {}],
        ['Bureaux Qualité', 'QUA', 'office', 24, 12, 12, 8, { d: 2, v: 1 }],
      ] },
    ] },
  ];
  const F = {};   // contexte par étage, clé « A0 », « A1 »…
  for (const b of PLAN) {
    const bld = { id: nextId(db, 'bld'), siteId: site.id, code: b.code, name: b.name };
    db.buildings.push(bld);
    for (const f of b.floors) {
      const floor = { id: nextId(db, 'flr'), buildingId: bld.id, level: f.level, name: f.name, width: f.w, height: f.h, planImage: '' };
      db.floors.push(floor);
      const ctx = F[b.code + f.level] = { key: b.code + f.level, floor, rooms: [], need: [], pps: [], sws: [], ppi: 0, seq: 0, n: {} };
      for (const [name, code, type, x, y, w, h, need] of f.rooms) {
        const room = { id: nextId(db, 'room'), floorId: floor.id, name, type, x, y, w, h };
        db.rooms.push(room); ctx.rooms.push(room); ctx.need.push({ code, ...need });
      }
    }
  }
  const roomOf = (key, code) => F[key].rooms[F[key].need.findIndex(n => n.code === code)];
  const addRack = (key, code, catId, name, rx, ry) => {
    const room = roomOf(key, code), c = cat(catId);
    const rack = { id: nextId(db, 'rack'), roomId: room.id, catalogId: catId, name, heightU: c.heightU, x: room.x + rx, y: room.y + ry, serial: serial(), installDate: date(2020, 2022), status: 'active' };
    db.racks.push(rack); return rack;
  };
  /* Pose un équipement en baie. Les équipements actifs reçoivent une IP de gestion et une MAC. */
  const put = (rack, u, catId, hostname, extra = {}) => {
    const c = cat(catId), active = !['passive'].includes(c.category);
    return add(catId, { rackId: rack.id, u, hostname, ...(active ? { ip: ip(c.category === 'server' ? 100 : 99), mac: mac() } : {}), ...extra });
  };

  // --- Baies et équipements ---
  const rkCore = addRack('A0', 'INFO', 'cat-rack42', 'BAIE-A0-01', 3, 4.5);
  const rkSrv = addRack('A0', 'INFO', 'cat-rack42', 'BAIE-A0-02', 4.2, 4.5);
  const rkA1 = addRack('A1', 'LT', 'cat-rack42', 'BAIE-A1-01', 2.5, 4);
  const rkA2 = addRack('A2', 'LT', 'cat-rack42', 'BAIE-A2-01', 2.5, 4);
  const rkB0 = addRack('B0', 'LT', 'cat-rack42', 'BAIE-B0-01', 3, 3.5);
  const rkB1 = addRack('B1', 'LT', 'cat-rack15', 'COFFRET-B1-01', 2, 0.5);

  // Baie de cœur (bâtiment A, RDC)
  const foA0 = put(rkCore, 42, 'cat-fo24', 'FO-A0-01');
  put(rkCore, 41, 'cat-mgr1u', 'PC-A0-01');
  const core = put(rkCore, 40, 'cat-c9500-16x', 'SW-A0-CORE-01');
  const fw = put(rkCore, 38, 'cat-fg100f', 'FW-A0-01');
  const rtr = put(rkCore, 37, 'cat-isr4331', 'RTR-A0-01');
  const ppA0a = put(rkCore, 35, 'cat-pp24', 'PP-A0-01');
  put(rkCore, 34, 'cat-mgr1u', 'PC-A0-02');
  const swA0 = put(rkCore, 33, 'cat-c9200l-48p-4x', 'SW-A0-ACC-01');
  put(rkCore, 32, 'cat-mgr1u', 'PC-A0-03');
  const ppA0b = put(rkCore, 31, 'cat-pp24', 'PP-A0-02');
  const upsA0 = put(rkCore, 1, 'cat-srt3000', 'OND-A0-01');
  // Baie serveurs
  put(rkSrv, 41, 'cat-mgr1u', 'PC-A0-04');
  const swSrv = put(rkSrv, 40, 'cat-c9200l-24t-4x', 'SW-A0-SRV-01');
  const srv1 = put(rkSrv, 30, 'cat-dl380', 'SRV-A0-01', { notes: 'Hyperviseur 1' });
  const srv2 = put(rkSrv, 28, 'cat-dl380', 'SRV-A0-02', { notes: 'Hyperviseur 2' });
  const srv3 = put(rkSrv, 26, 'cat-r650', 'SRV-A0-03', { notes: 'Sauvegarde' });
  const srv4 = put(rkSrv, 25, 'cat-r650', 'SRV-A0-04', { notes: 'Supervision', status: 'maintenance' });
  const upsA0b = put(rkSrv, 1, 'cat-srt3000', 'OND-A0-02');
  // Local technique A1
  const foA1 = put(rkA1, 42, 'cat-fo24', 'FO-A1-01');
  const ppA1a = put(rkA1, 40, 'cat-pp24', 'PP-A1-01');
  put(rkA1, 39, 'cat-mgr1u', 'PC-A1-01');
  const swA1a = put(rkA1, 38, 'cat-c9200l-48p-4x', 'SW-A1-ACC-01');
  put(rkA1, 37, 'cat-mgr1u', 'PC-A1-02');
  const ppA1b = put(rkA1, 36, 'cat-pp24', 'PP-A1-02');
  const ppA1c = put(rkA1, 34, 'cat-pp24', 'PP-A1-03');
  put(rkA1, 33, 'cat-mgr1u', 'PC-A1-03');
  const swA1b = put(rkA1, 32, 'cat-c9200l-24p-4g', 'SW-A1-ACC-02');
  const upsA1 = put(rkA1, 1, 'cat-5px1500', 'OND-A1-01');
  // Local technique A2
  const foA2 = put(rkA2, 42, 'cat-fo24', 'FO-A2-01');
  const ppA2a = put(rkA2, 40, 'cat-pp24', 'PP-A2-01');
  put(rkA2, 39, 'cat-mgr1u', 'PC-A2-01');
  const swA2 = put(rkA2, 38, 'cat-c9200l-48p-4x', 'SW-A2-ACC-01');
  put(rkA2, 37, 'cat-mgr1u', 'PC-A2-02');
  const ppA2b = put(rkA2, 36, 'cat-pp24', 'PP-A2-02');
  const upsA2 = put(rkA2, 1, 'cat-5px1500', 'OND-A2-01');
  // Local technique B0 (distribution du bâtiment B)
  const foB0 = put(rkB0, 42, 'cat-fo24', 'FO-B0-01');
  const dist = put(rkB0, 40, 'cat-cx6300m-24', 'SW-B0-DIST-01');
  const ppB0a = put(rkB0, 38, 'cat-pp24', 'PP-B0-01');
  put(rkB0, 37, 'cat-mgr1u', 'PC-B0-01');
  const swB0 = put(rkB0, 36, 'cat-cx6100-48g', 'SW-B0-ACC-01');
  put(rkB0, 35, 'cat-mgr1u', 'PC-B0-02');
  const ppB0b = put(rkB0, 34, 'cat-pp24', 'PP-B0-02');
  const upsB0 = put(rkB0, 1, 'cat-srt3000', 'OND-B0-01');
  // Coffret mural B1 (presque plein : 14U sur 15)
  const foB1 = put(rkB1, 15, 'cat-fo24', 'FO-B1-01');
  const ppB1a = put(rkB1, 14, 'cat-pp24', 'PP-B1-01');
  put(rkB1, 13, 'cat-mgr1u', 'PC-B1-01');
  const swB1a = put(rkB1, 12, 'cat-cx6100-48g', 'SW-B1-ACC-01');
  put(rkB1, 11, 'cat-mgr1u', 'PC-B1-02');
  const ppB1b = put(rkB1, 10, 'cat-pp24', 'PP-B1-02');
  const ppB1c = put(rkB1, 8, 'cat-pp48', 'PP-B1-03');
  put(rkB1, 7, 'cat-mgr1u', 'PC-B1-03');
  const swB1b = put(rkB1, 6, 'cat-usw-pro-24-poe', 'SW-B1-ACC-02');
  const rtrB1 = put(rkB1, 5, 'cat-ccr2004', 'RTR-B1-01', { notes: 'Lien de secours 4G' });
  rtrB1.layer = 'access';   // niveau forcé : ce routeur de secours est raccordé à un switch d'accès
  put(rkB1, 4, 'cat-mgr1u', 'PC-B1-04');
  const upsB1 = put(rkB1, 1, 'cat-5px1500', 'OND-B1-01');

  // --- Liaisons entre équipements actifs ---
  const mark = (p, o) => { Object.assign(p, o); if (o.watts != null) { p.poe.watts = o.watts; delete p.watts; } };
  const trayNext = new Map();
  const tray = t => { const i = trayNext.get(t.id) || 0; trayNext.set(t.id, i + 1); return P(t, i); };
  /* Liaison directe (DAC ou cordon) entre deux ports actifs */
  const direct = (pa, da, pb, dbv, type, len, speed) => {
    cable(pa, pb, type, len);
    mark(pa, { status: 'up', speed, description: `Vers ${dbv.hostname} ${pb.name}` });
    mark(pb, { status: 'up', speed, description: `Vers ${da.hostname} ${pa.name}` });
  };
  /* Liaison fibre passant par deux tiroirs optiques : jarretière, rocade, jarretière */
  const fiber = (pa, da, t1, t2, pb, dbv, type, len, speed) => {
    const x = tray(t1), y = tray(t2);
    cable(pa, x, type, 2); cable(x, y, type, len, null, `Rocade ${t1.hostname} ↔ ${t2.hostname}`); cable(y, pb, type, 2);
    mark(pa, { status: 'up', speed, description: `Uplink vers ${dbv.hostname} ${pb.name}` });
    mark(pb, { status: 'up', speed, description: `Descente vers ${da.hostname} ${pa.name}` });
  };
  direct(PN(fw, 'x1'), fw, P(core, 0), core, 'dac', 2, 10000);
  direct(PN(fw, 'x2'), fw, P(core, 1), core, 'dac', 2, 10000);
  direct(PN(fw, 'wan1'), fw, PN(rtr, 'Gi0/0/1'), rtr, 'patch', 1, 1000);
  mark(PN(rtr, 'Gi0/0/0'), { status: 'up', speed: 1000, connected: 'Opérateur — lien fibre (fictif)', description: 'WAN 203.0.113.2/30' });
  direct(ups(swA0)[0], swA0, P(core, 2), core, 'dac', 2, 10000);
  direct(ups(swA0)[1], swA0, P(core, 3), core, 'dac', 2, 10000);
  direct(ups(swSrv)[0], swSrv, P(core, 4), core, 'dac', 3, 10000);
  direct(ups(swSrv)[1], swSrv, P(core, 5), core, 'dac', 3, 10000);
  fiber(ups(swA1a)[0], swA1a, foA1, foA0, P(core, 6), core, 'om3', 35, 10000);
  fiber(ups(swA1a)[1], swA1a, foA1, foA0, P(core, 7), core, 'om3', 35, 10000);
  fiber(ups(swA1b)[0], swA1b, foA1, foA0, P(core, 8), core, 'om3', 35, 1000);
  fiber(ups(swA1b)[1], swA1b, foA1, foA0, P(core, 9), core, 'om3', 35, 1000);
  fiber(ups(swA2)[0], swA2, foA2, foA0, P(core, 10), core, 'om3', 45, 10000);
  fiber(ups(swA2)[1], swA2, foA2, foA0, P(core, 11), core, 'om3', 45, 10000);
  fiber(P(dist, 24), dist, foB0, foA0, P(core, 12), core, 'os2', 180, 10000);
  fiber(P(dist, 25), dist, foB0, foA0, P(core, 13), core, 'os2', 180, 10000);
  direct(ups(swB0)[0], swB0, P(dist, 0), dist, 'dac', 1, 10000);
  direct(ups(swB0)[1], swB0, P(dist, 1), dist, 'dac', 1, 10000);
  fiber(ups(swB1a)[0], swB1a, foB1, foB0, P(dist, 2), dist, 'om3', 40, 10000);
  fiber(ups(swB1a)[1], swB1a, foB1, foB0, P(dist, 3), dist, 'om3', 40, 10000);
  fiber(ups(swB1b)[0], swB1b, foB1, foB0, P(dist, 4), dist, 'om3', 40, 10000);
  fiber(ups(swB1b)[1], swB1b, foB1, foB0, P(dist, 5), dist, 'om3', 40, 10000);

  // --- Switchs d'accès : file des ports libres (le dernier port sert à la gestion) ---
  const acc = new Map();
  const accPorts = sw => acc.get(sw.id) || acc.set(sw.id, { list: portsOf.get(sw.id).filter(p => p.role === 'access'), cur: 0, end: 0 }).get(sw.id);
  const takeFront = sw => { const a = accPorts(sw); return a.cur < a.list.length - a.end ? a.list[a.cur++] : null; };
  const takeBack = sw => { const a = accPorts(sw); a.end++; return a.list[a.list.length - a.end]; };
  /* Raccorde le port de gestion d'un équipement directement à un switch de la même baie */
  const mgmt = (dev, portName, sw, vlan = 99) => {
    const pa = PN(dev, portName), pb = takeBack(sw);
    cable(pa, pb, 'patch', 2, vcol(vlan));
    mark(pa, { status: 'up', vlan, speed: Math.min(pa.speed, pb.speed) });
    mark(pb, { status: 'up', vlan, speed: Math.min(pa.speed, pb.speed), description: `${dev.hostname} ${portName}` });
  };
  mgmt(upsA0, 'NMC', swA0); mgmt(upsA0b, 'NMC', swSrv); mgmt(upsA1, 'NMC', swA1a); mgmt(upsA2, 'NMC', swA2); mgmt(upsB0, 'NMC', swB0); mgmt(upsB1, 'NMC', swB1a);
  mgmt(fw, 'mgmt', swSrv); mgmt(rtr, 'Mgmt', swSrv); mgmt(rtrB1, 'ether1', swB1b);
  // Serveurs : cartes réseau en VLAN 100, carte de gestion en VLAN 99
  const srvLink = (srv, name, vlan) => { const pa = PN(srv, name), pb = takeFront(swSrv); cable(pa, pb, 'patch', 2, vcol(vlan)); mark(pa, { status: 'up', vlan }); mark(pb, { status: 'up', vlan, description: `${srv.hostname} ${name}` }); };
  srvLink(srv1, 'NIC1', 100); srvLink(srv1, 'NIC2', 100); srvLink(srv1, 'iLO', 99);
  srvLink(srv2, 'NIC1', 100); srvLink(srv2, 'NIC2', 100); srvLink(srv2, 'iLO', 99);
  srvLink(srv3, 'NIC1', 100); srvLink(srv3, 'iDRAC', 99);
  srvLink(srv4, 'NIC1', 100); srvLink(srv4, 'iDRAC', 99);

  // --- Prises murales, terminaux et brassage ---
  Object.assign(F.A0, { rack: rkCore, pps: [ppA0a, ppA0b], sws: [swA0] });
  Object.assign(F.A1, { rack: rkA1, pps: [ppA1a, ppA1b, ppA1c], sws: [swA1a, swA1b] });
  Object.assign(F.A2, { rack: rkA2, pps: [ppA2a, ppA2b], sws: [swA2] });
  Object.assign(F.B0, { rack: rkB0, pps: [ppB0a, ppB0b], sws: [swB0] });
  Object.assign(F.B1, { rack: rkB1, pps: [ppB1a, ppB1b, ppB1c], sws: [swB1a, swB1b] });
  const AP_MODELS = ['cat-mr46', 'cat-u6-pro', 'cat-ap515'], TEL_MODELS = ['cat-8851', 'cat-t54w'], CAM_MODELS = ['cat-p3265', 'cat-ds2cd2143'];
  /* Points répartis le long des murs d'une pièce, à 25 cm du mur */
  const wallPoints = (room, n) => {
    const per = 2 * (room.w + room.h), pts = [];
    for (let i = 0; i < n; i++) {
      let t = ((i + 0.5) / n * per + room.w * 0.3) % per, x, y;
      if (t < room.w) { x = t; y = 0.25; }
      else if ((t -= room.w) < room.h) { x = room.w - 0.25; y = t; }
      else if ((t -= room.h) < room.w) { x = room.w - t; y = room.h - 0.25; }
      else { t -= room.w; x = 0.25; y = room.h - t; }
      pts.push({ x: +clamp(room.x + x, room.x + 0.25, room.x + room.w - 0.25).toFixed(2), y: +clamp(room.y + y, room.y + 0.25, room.y + room.h - 0.25).toFixed(2) });
    }
    return pts;
  };
  for (const ctx of Object.values(F)) {
    const ppPorts = ctx.pps.flatMap(d => portsOf.get(d.id));
    const count = k => (ctx.n[k] = (ctx.n[k] || 0) + 1);
    ctx.rooms.forEach((room, ri2) => {
      const need = ctx.need[ri2];
      const wallN = (need.d || 0) + (need.v || 0) + (need.p || 0);
      const pts = wallPoints(room, wallN);
      const usages = [...Array(need.d || 0).fill('data'), ...Array(need.v || 0).fill('voice'), ...Array(need.p || 0).fill('printer')];
      // Mélange déterministe pour alterner données et voix le long des murs
      for (let i = usages.length - 1; i > 0; i--) { const j = ri(0, i); [usages[i], usages[j]] = [usages[j], usages[i]]; }
      const cx = room.x + room.w / 2, cy = room.y + room.h / 2;
      const items = usages.map((u, i) => ({ usage: u, ...pts[i] }));
      for (let i = 0; i < (need.ap || 0); i++) items.push({ usage: 'ap', x: +(room.x + room.w * (i + 1) / ((need.ap || 0) + 1)).toFixed(2), y: +cy.toFixed(2) });
      for (let i = 0; i < (need.cam || 0); i++) items.push({ usage: 'camera', x: +(room.x + room.w - 0.6).toFixed(2), y: +(room.y + 0.6).toFixed(2) });
      for (const it of items) {
        const label = `${ctx.key}-${String(++ctx.seq).padStart(3, '0')}`;
        const outlet = { id: nextId(db, 'o'), roomId: room.id, label, x: it.x, y: it.y, usage: it.usage };
        db.outlets.push(outlet);
        const ppPort = ppPorts[ctx.ppi++];
        const len = Math.round(Math.abs(it.x - ctx.rack.x) + Math.abs(it.y - ctx.rack.y) + 6);
        cable(outlet, ppPort, 'cat6a', len, null, label);
        ppPort.description = label;
        // Terminal branché sur la prise
        let term = null;
        if (it.usage === 'voice') {
          const dx = cx - it.x, dy = cy - it.y, d = Math.hypot(dx, dy) || 1;
          const dev = add(TEL_MODELS[count('tel') % 2], { hostname: `TEL-${ctx.key}-${pad2(ctx.n.tel)}`, roomId: room.id, x: +(it.x + dx / d * 0.8).toFixed(2), y: +(it.y + dy / d * 0.8).toFixed(2), ip: ip(20), mac: mac() });
          cable(P(dev, 0), outlet, 'patch', 3, '#8b9bb0');
          const pc = `PC-${need.code}-${pad2(count('pc' + need.code))}`;
          mark(P(dev, 0), { status: 'up', vlan: 20 }); mark(P(dev, 1), { status: 'up', vlan: 10, connected: pc, mac: mac() });
          term = { dev, vlan: 20, watts: cat(dev.catalogId).poeDrawW, speed: 1000, desc: `${label} — téléphone et ${pc}` };
        } else if (it.usage === 'ap') {
          const dev = add(AP_MODELS[count('ap') % 3], { hostname: `AP-${ctx.key}-${pad2(ctx.n.ap)}`, roomId: room.id, x: it.x, y: it.y, ip: ip(30), mac: mac() });
          cable(P(dev, 0), outlet, 'patch', 1, '#8b9bb0'); mark(P(dev, 0), { status: 'up', vlan: 30 });
          term = { dev, vlan: 30, watts: cat(dev.catalogId).poeDrawW + ri(-2, 1), speed: 1000, desc: `${label} — borne Wi-Fi` };
        } else if (it.usage === 'camera') {
          const dev = add(CAM_MODELS[count('cam') % 2], { hostname: `CAM-${ctx.key}-${pad2(ctx.n.cam)}`, roomId: room.id, x: it.x, y: it.y, ip: ip(40), mac: mac() });
          cable(P(dev, 0), outlet, 'patch', 1, '#8b9bb0'); mark(P(dev, 0), { status: 'up', vlan: 40, speed: 100 });
          term = { dev, vlan: 40, watts: cat(dev.catalogId).poeDrawW, speed: 100, desc: `${label} — caméra` };
        } else if (it.usage === 'printer') {
          term = { name: `IMP-${need.code}-${pad2(count('imp' + need.code))}`, vlan: 50, watts: 0, speed: 1000, desc: `${label} — imprimante` };
        } else {
          term = { name: `PC-${need.code}-${pad2(count('pc' + need.code))}`, vlan: 10, watts: 0, speed: R() < 0.12 ? 100 : 1000, desc: label };
        }
        // Brassage : environ 85 % des prises de données, et toutes les autres
        const patched = it.usage !== 'data' || R() < 0.85;
        if (!patched) continue;
        let sw = ctx.sws[ri2 % ctx.sws.length], sp = takeFront(sw);
        if (!sp) { sw = ctx.sws.find(s => s !== sw) || sw; sp = takeFront(sw); }
        if (!sp) continue;
        cable(ppPort, sp, 'patch', ri(1, 2), vcol(term.vlan));
        const r = R();
        const status = term.dev ? (r < 0.96 ? 'up' : 'down') : (r < 0.8 ? 'up' : r < 0.93 ? 'down' : 'disabled');
        mark(sp, { status, vlan: term.vlan, speed: term.speed, watts: status === 'up' ? term.watts : 0, description: term.desc, connected: term.dev ? '' : term.name, mac: term.dev ? term.dev.mac : mac() });
        if (term.dev && status !== 'up') mark(P(term.dev, 0), { status: 'down' });
      }
    });
  }

  // --- Quelques anomalies pour illustrer les alertes ---
  const swPortTo = pred => db.ports.find(p => p.role === 'access' && /^SW-/.test(db.devices.find(d => d.id === p.deviceId).hostname) && pred(p));
  const e1 = swPortTo(p => /^B0-.*caméra/.test(p.description)); if (e1) mark(e1, { status: 'error', watts: 0, description: e1.description + ' (erreurs CRC)' });
  const e2 = swPortTo(p => /^A1-.*borne/.test(p.description)); if (e2) mark(e2, { status: 'error', watts: 0, description: e2.description + ' (défaut PoE)' });
  const e3 = swPortTo(p => /^A2-/.test(p.description) && p.connected.startsWith('PC-') && p.status === 'up'); if (e3) mark(e3, { status: 'error', description: e3.description + ' (boucle détectée)' });
  const apKo = db.devices.find(d => d.hostname === 'AP-B0-03'); if (apKo) apKo.status = 'fault';

  // --- Historique de départ ---
  const now = Date.now(), H = 3600e3;
  const hist = [
    [2, 'add', 'Installation de AP-B1-02 (Salle de formation)'],
    [26, 'edit', 'Port Gi1/0/12 de SW-A1-ACC-01 : VLAN 20 (VOIX)'],
    [50, 'stock', 'Entrée en stock : 10 × Cordon RJ45 Cat6A 1 m'],
    [75, 'move', 'Déplacement de SRV-A0-04 vers BAIE-A0-02, U25'],
    [120, 'remove', 'Retrait d\'un switch USW-Pro-24-PoE (retour en stock)'],
    [200, 'import', 'Initialisation du jeu de données de démonstration'],
  ];
  db.history = hist.map(([h, type, text]) => ({ id: nextId(db, 'h'), ts: now - h * H, type, text, ref: null }));
  db.meta.updatedAt = now;
  return db;
}

export { buildDemo, emptyDb, mkDevice };
