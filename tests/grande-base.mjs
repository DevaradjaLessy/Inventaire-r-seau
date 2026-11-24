/* Grande base fictive pour les essais de montée en charge (lot 14).
   Tout est inventé : noms « BAT-nn », adresses 10.x privées, MAC administrées localement (02:…), séries « CHG- ».
   Par défaut : 20 bâtiments de 5 étages, soit environ 4 000 équipements, 37 000 ports, 8 000 prises et 18 000 câbles. */
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const racine = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const charger = f => import(pathToFileURL(path.join(racine, 'js', f)).href);

export async function grandeBase({ batiments = 20, etages = 5, pieces = 10, prisesParPiece = 8 } = {}) {
  const { emptyDb, mkDevice } = await charger('demo.js'), { defaultCatalog } = await charger('catalogue.js');
  const { VLANS_DEF } = await charger('config.js'), { nextId, mulberry32 } = await charger('utils.js');
  const db = emptyDb(), R = mulberry32(14), ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  db.vlans = VLANS_DEF.map(v => ({ ...v }));
  db.catalog = defaultCatalog();
  db.stock = db.catalog.map(c => ({ catalogId: c.id, available: 5, threshold: 1, location: 'Magasin (fictif)' }));
  const cat = Object.fromEntries(db.catalog.map(c => [c.id, c]));
  const deux = n => String(n).padStart(2, '0');
  let nMac = 0, nSerie = 0, nIp = 0;
  const mac = () => { const n = ++nMac; return '02:c4:' + [n >> 24, n >> 16, n >> 8, n].map(x => (x & 255).toString(16).padStart(2, '0')).join(':'); };
  const serie = () => 'CHG-' + String(++nSerie).padStart(8, '0');
  const ip = () => { const n = ++nIp; return `10.${100 + (n >> 16)}.${(n >> 8) & 255}.${n & 255}`; };
  const ports = new Map();
  const poser = (catId, p, actif = true) => { const r = mkDevice(db, cat[catId], { serial: serie(), installDate: `${ri(2019, 2025)}-${deux(ri(1, 12))}-${deux(ri(1, 28))}`, ...(actif ? { ip: ip(), mac: mac() } : {}), ...p }); ports.set(r.dev.id, r.ports); return r.dev; };
  const cable = (a, b, type, length, label = '') => db.cables.push({ id: nextId(db, 'cab'), a: a.id, b: b.id, type, length, color: { cat6a: '#8b9bb0', patch: '#3987e5', om3: '#35c2c2', dac: '#3a424d' }[type], label });
  const lien = (pa, da, pb, dbv, type, len) => { cable(pa, pb, type, len); Object.assign(pa, { status: 'up', speed: 10000, description: `Vers ${dbv.hostname} ${pb.name}` }); Object.assign(pb, { status: 'up', speed: 10000, description: `Vers ${da.hostname} ${pa.name}` }); };
  const montants = d => ports.get(d.id).filter(p => p.role === 'uplink');

  const site = { id: nextId(db, 'site'), name: 'Campus de charge (fictif)', code: 'CHG', address: '1 rue de l\'Essai, 00000 Villefictive' };
  db.sites.push(site);
  const coeurs = [], libreCoeur = [0, 0];
  for (let b = 1; b <= batiments; b++) {
    const code = 'B' + deux(b), bld = { id: nextId(db, 'bld'), siteId: site.id, code, name: `Bâtiment ${deux(b)}` };
    db.buildings.push(bld);
    let dist = null, libreDist = 0;
    for (let e = 0; e < etages; e++) {
      const z = `${code}E${e}`, floor = { id: nextId(db, 'flr'), buildingId: bld.id, level: e, name: e ? `R+${e}` : 'RDC', width: 60, height: 30, planImage: '' };
      db.floors.push(floor);
      const lt = { id: nextId(db, 'room'), floorId: floor.id, name: `Local technique ${z}`, type: 'tech', x: 0, y: 0, w: 6, h: 8 };
      db.rooms.push(lt);
      const baies = [1, 2].map(i => { const r = { id: nextId(db, 'rack'), roomId: lt.id, catalogId: 'cat-rack42', name: `BAIE-${z}-${deux(i)}`, heightU: 42, x: 1 + i * 1.4, y: 4, serial: serie(), installDate: '2020-01-15', status: 'active' }; db.racks.push(r); return r; });
      // Première baie du bâtiment : distribution ; première baie du campus : cœur
      if (e === 0) {
        dist = poser('cat-cx6300m-24', { rackId: baies[0].id, u: 30, hostname: `SW-${code}-DIST-01` });
        if (coeurs.length < 2) coeurs.push(poser('cat-c9500-16x', { rackId: baies[0].id, u: 28, hostname: `SW-CHG-CORE-${deux(coeurs.length + 1)}` }));
      }
      const tiroirs = [], commutateurs = [];
      for (const [i, baie] of baies.entries()) {
        for (const k of [0, 1]) {
          const n = i * 2 + k + 1, u = 42 - k * 4;
          tiroirs.push(poser('cat-pp24', { rackId: baie.id, u, hostname: `PP-${z}-${deux(n)}` }, false));
          poser('cat-mgr1u', { rackId: baie.id, u: u - 1, hostname: `PC-${z}-${deux(n)}` }, false);
          const sw = poser('cat-c9200l-48p-4x', { rackId: baie.id, u: u - 2, hostname: `SW-${z}-ACC-${deux(n)}` });
          commutateurs.push(sw);
          lien(montants(sw)[0], sw, ports.get(dist.id)[libreDist++], dist, e ? 'om3' : 'dac', e ? 20 + e * 4 : 2);
        }
      }
      // Pièces : deux rangées de bureaux, des prises reliées aux panneaux, puis brassées sur les commutateurs
      let rang = 0;
      for (let p = 0; p < pieces; p++) {
        const larg = 54 / Math.ceil(pieces / 2), haut = 11, col = Math.floor(p / 2), bas = p % 2;
        const room = { id: nextId(db, 'room'), floorId: floor.id, name: `Bureau ${z}-${deux(p + 1)}`, type: p % 5 === 0 ? 'meeting' : p % 3 === 0 ? 'open' : 'office', x: 6 + col * larg, y: bas ? 19 : 0, w: larg, h: haut };
        db.rooms.push(room);
        for (let o = 0; o < prisesParPiece; o++, rang++) {
          const prise = { id: nextId(db, 'o'), roomId: room.id, label: `${z}-${String(rang + 1).padStart(3, '0')}`, x: +(room.x + 0.5 + o * (larg - 1) / prisesParPiece).toFixed(2), y: +(room.y + (bas ? haut - 0.25 : 0.25)).toFixed(2), usage: o === 0 ? 'ap' : o % 4 === 1 ? 'voice' : 'data' };
          db.outlets.push(prise);
          const tiroir = tiroirs[Math.floor(rang / 24)], sw = commutateurs[Math.floor(rang / 24)];
          if (!tiroir) continue;
          const pp = ports.get(tiroir.id)[rang % 24], acces = ports.get(sw.id)[rang % 24];
          cable(prise, pp, 'cat6a', ri(15, 70), `Lien ${prise.label}`);
          cable(pp, acces, 'patch', 1);
          const vlan = prise.usage === 'voice' ? 20 : prise.usage === 'ap' ? 30 : 10;
          Object.assign(acces, { vlan: db.vlans.some(v => v.id === vlan) ? vlan : 1 });
          // Un poste sur cinq est un équipement inventorié : borne ou téléphone
          if (o === 0 || o === 1) {
            const borne = o === 0, d = poser(borne ? 'cat-u6-pro' : 'cat-8851', { roomId: room.id, x: +(room.x + larg / 2 + o).toFixed(2), y: +(room.y + haut / 2).toFixed(2), hostname: `${borne ? 'AP' : 'TEL'}-${z}-${deux(p + 1)}` });
            const pd = ports.get(d.id)[0];
            cable(pd, prise, 'patch', 2);
            Object.assign(pd, { status: 'up', vlan: acces.vlan }); Object.assign(acces, { status: 'up', description: d.hostname }); acces.poe.watts = borne ? 13 : 6;
          }
        }
      }
    }
    const c = coeurs[b % 2] ? b % 2 : 0, coeur = coeurs[c];
    if (libreCoeur[c] < 14) lien(ports.get(dist.id)[27], dist, ports.get(coeur.id)[libreCoeur[c]++], coeur, 'om3', 150);
  }
  if (coeurs[1]) lien(ports.get(coeurs[0].id)[15], coeurs[0], ports.get(coeurs[1].id)[15], coeurs[1], 'dac', 3);
  db.history.unshift({ id: nextId(db, 'h'), ts: Date.UTC(2026, 0, 1), type: 'import', text: 'Base de charge générée', ref: null });
  return db;
}
