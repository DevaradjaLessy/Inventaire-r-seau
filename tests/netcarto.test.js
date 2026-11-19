/* Tests de bout en bout de NetCarto. Lancer avec : npm test (dans le dossier tests/).
   - L'application est servie par un petit serveur HTTP local (les modules ne se chargent pas en file://).
   - Toute requête vers une adresse extérieure est coupée : la page doit se suffire à elle-même (Three.js est dans js/vendor/).
   - Chaque scénario repart d'une page neuve, donc du jeu de démonstration d'origine. */
'use strict';
const assert = require('assert'), http = require('http'), fs = require('fs'), path = require('path');
const os = require('os');
const { chromium } = require('playwright');
const { demarrer } = require('../serveur/app');

const RACINE = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const tests = [];
const test = (nom, fn, opts = {}) => tests.push({ nom, fn, opts });

function serveur() {
  const s = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'), f = path.join(RACINE, rel);
    if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
  });
  return new Promise(ok => s.listen(0, '127.0.0.1', () => ok(s)));
}
/* Raccourcis exécutés dans la page */
const idDe = (page, nom) => page.evaluate(n => { const d = NetCarto.Store.db; return (d.racks.find(r => r.name === n) || d.devices.find(x => x.hostname === n) || d.outlets.find(o => o.label === n) || {}).id; }, nom);
const choisir = async (page, nom, o) => page.evaluate(([i, o2]) => NetCarto.select(i, o2), [await idDe(page, nom), o]);
const pret3D = page => page.waitForFunction(() => NetCarto.Views3D.main?.ok && NetCarto.Views3D.main.ports.length, null, { timeout: 20000 });

test('Jeu de démonstration cohérent', async page => {
  const r = await page.evaluate(() => {
    const { Store } = NetCarto, d = Store.db, ids = new Set(); let doublons = 0;
    for (const k of ['sites', 'buildings', 'floors', 'rooms', 'racks', 'devices', 'ports', 'outlets', 'cables']) for (const e of d[k]) { if (ids.has(e.id)) doublons++; ids.add(e.id); }
    const orphelins = d.cables.filter(c => !ids.has(c.a) || !ids.has(c.b)).length;
    const parBout = {}; for (const c of d.cables) for (const x of [c.a, c.b]) parBout[x] = (parBout[x] || 0) + 1;
    const surcharge = Object.entries(parBout).filter(([id, n]) => n > (id.startsWith('o-') || Store.idx.id.get(id).role === 'pp' ? 2 : 1)).length;
    let chevauchements = 0;
    for (const rk of d.racks) { const m = {}; for (const x of d.devices.filter(x => x.rackId === rk.id)) { const h = Store.idx.cat.get(x.catalogId).heightU; for (let u = x.u; u < x.u + h; u++) { if (m[u] || u < 1 || u > rk.heightU) chevauchements++; m[u] = 1; } } }
    const reels = d.devices.filter(x => x.ip && !/^10\.10\.|^203\.0\.113\./.test(x.ip)).length + d.devices.filter(x => x.mac && !x.mac.startsWith('02:')).length + d.devices.filter(x => x.serial && !x.serial.startsWith('DMO-')).length;
    return { doublons, orphelins, surcharge, chevauchements, reels, n: [d.buildings.length, d.floors.length, d.racks.length, d.devices.length, d.outlets.length, d.catalog.length] };
  });
  assert.deepStrictEqual([r.doublons, r.orphelins, r.surcharge, r.chevauchements], [0, 0, 0, 0]);
  assert.strictEqual(r.reels, 0, 'les données doivent rester fictives (IP privées, MAC 02:…, séries DMO-)');
  assert.deepStrictEqual(r.n, [2, 5, 6, 102, 121, 34]);
});
test('Onglets, sauvegarde locale, annulation, réinitialisation', async page => {
  await page.click('[data-tab=dash]'); assert.strictEqual(await page.$eval('.tab.on', e => e.id), 'tab-dash');
  await page.evaluate(() => NetCarto.Store.commit('edit', 'Test', db => { db.devices[0].hostname = 'TEST-XX'; }));
  await page.waitForTimeout(500); await page.reload(); await page.waitForFunction(() => window.NetCarto);
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.db.devices[0].hostname), 'TEST-XX');
  await page.click('[data-act=reset]'); await page.click('[data-act=modal-ok]');
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.db.devices[0].hostname), 'FO-A0-01');
  await page.keyboard.press('Control+z');
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.db.devices[0].hostname), 'TEST-XX');
});
test('Export puis import JSON ; refus d\'un fichier invalide ou dangereux', async page => {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export]')]);
  const fichier = await dl.path(), base = JSON.parse(fs.readFileSync(fichier, 'utf8'));
  assert.strictEqual(base.devices.length, 102);
  await page.evaluate(() => NetCarto.Store.commit('edit', 'Test', db => { db.devices[0].hostname = 'AVANT-IMPORT'; }));
  await page.setInputFiles('#file-import', fichier); await page.waitForSelector('.modal'); await page.click('[data-act=modal-ok]');
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.db.devices[0].hostname), 'FO-A0-01');
  const refuse = d => page.evaluate(x => NetCarto.Store.validate(x), d);
  assert.ok(await refuse({ meta: { app: 'Autre' } }));
  const piege = JSON.parse(JSON.stringify(base)); piege.devices[0].id = 'dev-1" onmouseover="alert(1)';
  assert.ok(await refuse(piege), 'un identifiant contenant des guillemets doit être refusé');
  const piege2 = JSON.parse(JSON.stringify(base)); piege2.vlans[0].color = 'red"><img src=x onerror=alert(1)>';
  assert.ok(await refuse(piege2), 'une couleur invalide doit être refusée');
  assert.strictEqual(await refuse(base), null);
});
test('Cartographie : plan, fiche d\'une prise, modification d\'un port', async page => {
  await choisir(page, 'A1-001'); await page.waitForSelector('svg.plan');
  assert.ok(await page.$$eval('svg.plan .pobj', a => a.length) > 30);
  const fiche = await page.locator('#detail').innerText();
  assert.match(fiche, /PP-A1-01/); assert.match(fiche, /SW-A1-ACC-01/); assert.match(fiche, /TEL-A1-01/);
  const pid = await page.evaluate(() => { const d = NetCarto.Store.db, sw = d.devices.find(x => x.hostname === 'SW-A1-ACC-01'), p = d.ports.find(p => p.deviceId === sw.id && p.idx === 2); NetCarto.select(p.id); return p.id; });
  await page.selectOption('#detail select[data-f=vlan]', '200');
  assert.strictEqual(await page.evaluate(i => NetCarto.Store.idx.id.get(i).vlan, pid), 200);
  assert.match(await page.evaluate(() => NetCarto.Store.db.history[0].text), /VLAN → 200/);
});
test('Vue 3D : baie, ports, survol et mode objet', async page => {
  await choisir(page, 'BAIE-A1-01'); await pret3D(page); await page.waitForTimeout(800);
  const v = await page.evaluate(() => { const m = NetCarto.Views3D.main; return { ports: m.ports.length, cordons: m.cableMeshes.size, leds: m.ledPorts.length, halo: !!m.glow, ombres: m.renderer.shadowMap.enabled }; });
  assert.deepStrictEqual(v, { ports: 177, cordons: 37, leds: 81, halo: true, ombres: true });
  await page.click('[data-m=vlan]'); assert.ok(await page.evaluate(() => NetCarto.Views3D.main.overlay.material.opacity > 0.5));
  await choisir(page, 'TEL-A1-01', { view: 'rack' }); await page.waitForTimeout(500);
  assert.strictEqual(await page.evaluate(() => NetCarto.Views3D.main.kind), 'object');
});
test('Traçage jusqu\'au cœur, topologie, connexion et débranchement', async page => {
  const r = await page.evaluate(() => {
    const d = NetCarto.Store.db, tp = NetCarto.topology(), couches = {};
    for (const n of tp.nodes) (couches[tp.layer.get(n.id)] ||= []).push(n.hostname);
    const tr = NetCarto.trace(d.outlets.find(o => o.label === 'B1-003').id);
    return { coeur: couches.core, dist: couches.distribution, points: tr.nodes.length, complet: tr.complete, complets: d.outlets.filter(o => NetCarto.trace(o.id).complete).length };
  });
  assert.deepStrictEqual([r.coeur, r.dist, r.points, r.complet, r.complets], [['SW-A0-CORE-01'], ['SW-B0-DIST-01'], 12, true, 112]);
  await choisir(page, 'B1-003'); await page.click('#detail [data-act=trace]'); await page.click('[data-v=topo]');
  assert.strictEqual(await page.$$eval('.tlink.hl', a => a.length), 2);
  const pid = await page.evaluate(() => { const d = NetCarto.Store.db, sw = d.devices.find(x => x.hostname === 'SW-A1-ACC-01'), p = d.ports.find(p => p.deviceId === sw.id && p.idx === 0); NetCarto.select(p.id); return p.id; });
  await page.click('#detail [data-act=disconnect]');
  assert.deepStrictEqual(await page.evaluate(i => [NetCarto.Store.db.cables.length, NetCarto.Store.idx.id.get(i).status], pid), [343, 'down']);
  await page.click('#detail [data-act=connect]'); await page.waitForSelector('#conn-port'); await page.click('[data-act=modal-ok]');
  assert.deepStrictEqual(await page.evaluate(i => [NetCarto.Store.db.cables.length, NetCarto.Store.idx.id.get(i).status], pid), [344, 'up']);
  assert.match(await page.evaluate(i => { try { NetCarto.connect(i, NetCarto.Store.db.outlets[0].id, 'patch', 1); return ''; } catch (e) { return e.message; } }, pid), /déjà câblé/);
});
test('Inventaire : compteurs, filtres, tri, export CSV, navigation', async page => {
  await page.click('[data-tab=inv]');
  assert.match(await page.$eval('#inv-count', e => e.textContent), /1 – 100 sur 108/);
  await page.click('.ikpi:nth-child(3)'); assert.match(await page.$eval('#inv-count', e => e.textContent), /sur 10/);
  await page.click('th[data-k=ip]');
  assert.strictEqual(await page.$eval('table.it tbody tr td:nth-child(7)', e => e.textContent), '10.10.99.11');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=inv-csv]')]);
  assert.strictEqual(fs.readFileSync(await dl.path(), 'utf8').split('\r\n').length, 11);
  await page.click('table.it tbody tr td:nth-child(2)'); await page.waitForTimeout(200);
  assert.strictEqual(await page.$eval('.tab.on', e => e.id), 'tab-carto');
  assert.match(await page.locator('#crumb').innerText(), /SW-A0-CORE-01/);
});
test('Matériel : installation, retrait hors service, glisser-déposer, nouveau modèle', async page => {
  await page.click('[data-tab=mat]'); await page.click('.mcard[data-id=cat-c9200l-24p-4g]'); await page.click('#mat-info [data-act=install]'); await page.waitForSelector('#inst-body');
  await page.selectOption('#inst-body [name=floor]', { label: 'R+2' }); await page.click('[data-act=modal-ok]'); await page.waitForTimeout(200);
  assert.deepStrictEqual(await page.evaluate(() => { const d = NetCarto.Store.db, x = d.devices.at(-1); return [x.hostname, x.u, NetCarto.Store.idx.stock.get('cat-c9200l-24p-4g').available, d.ports.filter(p => p.deviceId === x.id).length]; }), ['SW-A2-01', 41, 2, 28]);
  await page.click('#detail [data-act=dev-remove]'); await page.check('input[value=retire]'); await page.click('[data-act=modal-ok]');
  assert.deepStrictEqual(await page.evaluate(() => { const x = NetCarto.Store.db.devices.at(-1); return [x.status, x.rackId]; }), ['retired', null]);
  await choisir(page, 'BAIE-A2-01'); await page.click('#r3d-tools [data-act=palette]'); await page.waitForSelector('.pal-it');
  await page.dragAndDrop('.pal-it[data-cat=cat-pp48]', '.eu.free[data-u="30"]'); await page.waitForTimeout(200);
  assert.deepStrictEqual(await page.evaluate(() => { const x = NetCarto.Store.db.devices.at(-1); return [x.hostname, x.u]; }), ['PP-A2-03', 29]);
  await page.click('[data-tab=mat]'); await page.click('[data-act=model-new]'); await page.waitForSelector('#model-groups');
  await page.fill('.modal [name=brand]', 'Netgear'); await page.fill('.modal [name=model]', 'M4300-28G'); await page.click('[data-act=model-grp-add]'); await page.click('[data-act=modal-ok]');
  assert.deepStrictEqual(await page.evaluate(() => { const c = NetCarto.Store.db.catalog.at(-1); return [c.id, c.mount, c.ports.length]; }), ['cat-netgear-m4300-28g', 'rack', 2]);
});
test('Tableau de bord et alertes cliquables', async page => {
  await page.click('[data-tab=dash]');
  assert.strictEqual(await page.$$eval('.kpi', a => a.length), 6); assert.strictEqual(await page.$$eval('.al', a => a.length), 10); assert.strictEqual(await page.$$eval('.rg', a => a.length), 6);
  await page.click('.al'); await page.waitForTimeout(200);
  assert.strictEqual(await page.$eval('.tab.on', e => e.id), 'tab-carto');
});
test('Base vide : site, bâtiment, étage, pièces (formulaire et tracé), baie, VLAN', async page => {
  await page.click('[data-act=reset]'); await page.check('input[value=vide]'); await page.click('[data-act=modal-ok]');
  assert.deepStrictEqual(await page.evaluate(() => { const d = NetCarto.Store.db; return [d.sites.length, d.devices.length, d.catalog.length, d.meta.demo, d.stock.every(s => s.available === 0)]; }), [0, 0, 34, false, true]);
  assert.ok(await page.isVisible('.empty-state')); assert.ok(await page.isHidden('.demo-tag'));
  // Les quatre onglets s'affichent sans erreur sur une base vide
  for (const t of ['inv', 'mat', 'dash', 'carto']) await page.click(`[data-tab=${t}]`);
  const creer = async (bouton, champs) => { await page.click(bouton); await page.waitForSelector('.modal'); for (const [k, v] of Object.entries(champs)) await page.fill(`.modal [name=${k}]`, String(v)); await page.click('[data-act=modal-ok]'); await page.waitForTimeout(120); };
  await creer('.empty-state [data-kind=site]', { name: 'Siège', code: 'sge', address: '1 rue du Test' });
  await creer('#detail [data-kind=building]', { name: 'Bâtiment Principal', code: 'p' });
  await creer('#detail [data-kind=floor]', { name: 'RDC', level: 0, width: 30, height: 20 });
  await creer('#detail [data-kind=room]', { name: 'Local technique', x: 0, y: 0, w: 6, h: 5 });
  assert.deepStrictEqual(await page.evaluate(() => { const d = NetCarto.Store.db; return [d.sites[0].code, d.buildings[0].code, d.floors[0].width, d.rooms[0].name, d.history[0].type]; }), ['SGE', 'P', 30, 'Local technique', 'add']);
  // Refus : pièce qui chevauche, pièce hors de l'étage
  const refus = v => page.evaluate(x => { try { NetCarto.addRoom(NetCarto.Store.db.floors[0].id, x); return ''; } catch (e) { return e.message; } }, v);
  assert.match(await refus({ name: 'X', x: 3, y: 2, w: 6, h: 5 }), /chevauche/); assert.match(await refus({ name: 'X', x: 28, y: 0, w: 6, h: 5 }), /dépasse/);
  // Tracé d'une pièce à la souris
  await page.evaluate(() => NetCarto.select(NetCarto.Store.db.floors[0].id)); await page.click('.overlay [data-act=plan-draw]');
  const pos = await page.evaluate(() => { const svg = document.querySelector('svg.plan'), m = svg.getScreenCTM(), pt = (x, y) => { const p = new DOMPoint(x * 20, y * 20).matrixTransform(m); return [p.x, p.y]; }; return [pt(10, 8), pt(18, 14)]; });
  await page.mouse.move(...pos[0]); await page.mouse.down(); await page.mouse.move(...pos[1], { steps: 6 }); await page.mouse.up();
  await page.waitForSelector('.modal'); await page.fill('.modal [name=name]', 'Open space'); await page.click('[data-act=modal-ok]');
  assert.deepStrictEqual(await page.evaluate(() => { const r = NetCarto.Store.db.rooms.at(-1); return [r.name, r.x, r.y, r.w, r.h]; }), ['Open space', 10, 8, 8, 6]);
  // Une baie puis un switch s'installent dans la nouvelle structure
  const r = await page.evaluate(() => { const S = NetCarto.Store, d = S.db; S.commit('stock', '', db => { for (const s of db.stock) s.available = 2; });
    const room = d.rooms[0], rk = NetCarto.installFromStock('cat-rack42', { roomId: room.id, x: 2, y: 2 }), sw = NetCarto.installFromStock('cat-c9200l-24p-4g', { rackId: rk, u: 40 });
    return [S.idx.id.get(rk).name, S.idx.id.get(sw).hostname]; });
  assert.deepStrictEqual(r, ['BAIE-P0-01', 'SW-P0-01']);
  // Suppression refusée tant que l'élément n'est pas vide
  assert.match(await page.evaluate(() => { try { NetCarto.deleteStructure(NetCarto.Store.db.rooms[0].id); return ''; } catch (e) { return e.message; } }), /contient encore/);
  // VLAN : ajout, puis suppression refusée s'il est utilisé
  await page.click('[data-tab=dash]'); await page.click('[data-act=vlans]'); await page.fill('#vlan-new [data-f=id]', '300'); await page.fill('#vlan-new [data-f=name]', 'labo'); await page.click('[data-act=vlan-add]');
  assert.deepStrictEqual(await page.evaluate(() => { const v = NetCarto.Store.db.vlans.find(x => x.id === 300); return [v.name, NetCarto.Store.db.vlans.length]; }), ['LABO', 9]);
  assert.strictEqual(await page.evaluate(() => { NetCarto.Store.db.ports[0].vlan = 300; try { NetCarto.deleteVlan(300); return ''; } catch (e) { return e.message.includes('encore affecté'); } }), true);
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.validate(JSON.parse(JSON.stringify(NetCarto.Store.db)))), null);
});
test('Thème clair et sombre, mémorisé', async page => {
  await page.click('[data-act=theme]');
  assert.strictEqual(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(243, 246, 244)');
  await page.reload(); await page.waitForFunction(() => window.NetCarto);
  assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
});
test('Supervision : simulation, écart saisi / mesuré, alerte, arrêt', async page => {
  await page.click('[data-act=sources]'); await page.selectOption('.modal [name=type]', 'simulation'); await page.click('[data-act=modal-ok]'); await page.waitForFunction(() => NetCarto.Live.state === 'ok');
  assert.deepStrictEqual(await page.evaluate(() => [NetCarto.Live.matched, NetCarto.Live.port.size, NetCarto.Live.unmatched.length]), [70, 540, 0]);
  await page.evaluate(() => { const d = NetCarto.Store.db, sw = d.devices.find(x => x.hostname === 'SW-A1-ACC-01'), p = d.ports.find(p => p.deviceId === sw.id && p.idx === 0); NetCarto.Live.port.get(p.id).status = 'down'; NetCarto.select(p.id); });
  assert.match(await page.locator('#detail').innerText(), /Saisi : Actif/);
  await page.click('[data-act=sources]'); await page.selectOption('.modal [name=type]', 'none'); await page.click('[data-act=modal-ok]'); await page.waitForFunction(() => NetCarto.Live.state === 'off');
  assert.strictEqual(await page.evaluate(() => NetCarto.Live.port.size), 0);
});
test('Sans Internet : la vue 3D fonctionne avec la copie locale de Three.js, rien n\'est demandé à l\'extérieur', async (page, { requetes }) => {
  await choisir(page, 'BAIE-A0-01'); await page.waitForSelector('#r3d-canvas canvas', { timeout: 20000 });
  assert.strictEqual(await page.evaluate(() => import('/js/3d/three.js').then(m => m.threeReady)), true);
  assert.strictEqual(await page.evaluate(() => import('three').then(m => m.REVISION)), '160');
  assert.ok(requetes.some(u => /\/js\/vendor\/three\/build\/three\.module\.min\.js$/.test(u)) && requetes.some(u => /\/js\/vendor\/three\/examples\/jsm\/controls\/OrbitControls\.js$/.test(u)));
  assert.deepStrictEqual(requetes.filter(u => !/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(u)), [], 'aucune adresse extérieure dans la page');
  assert.doesNotMatch(await page.content(), /cdn\.jsdelivr|unpkg|googleapis/);
});
test('Three.js illisible : l\'application reste utilisable, la 3D prévient', async page => {
  await choisir(page, 'BAIE-A0-01'); await page.waitForTimeout(600);
  assert.match(await page.$eval('#r3d-canvas', e => e.innerText), /Vue 3D indisponible/);
  assert.ok(await page.$$eval('.eu.dev', a => a.length) > 5);
}, { sansThree: true });
test('Téléphone : pas de débordement, arbre et fiche en volets', async page => {
  await page.evaluate(() => NetCarto.select(NetCarto.Store.db.floors[1].id));
  assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.tap('[data-p=tree]'); assert.ok(await page.isVisible('#tree'));
  for (const t of ['inv', 'mat', 'dash']) { await page.tap(`[data-tab=${t}]`); assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, t); }
}, { mobile: true });

/* Gestes au doigt, envoyés comme de vrais contacts d'écran. points : [[x, y], …] par doigt */
async function doigts(page, depart, arrivee, pas = 8) {
  const cdp = await page.context().newCDPSession(page), pts = l => l.map(([x, y], i) => ({ x, y, id: i }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(depart) });
  for (let k = 1; k <= pas; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(depart.map(([x, y], i) => [x + (arrivee[i][0] - x) * k / pas, y + (arrivee[i][1] - y) * k / pas])) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
const centre = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
test('Téléphone : zoom du plan en écartant deux doigts, déplacement à un doigt', async page => {
  await page.evaluate(() => NetCarto.select(NetCarto.Store.db.floors[1].id));
  const vb = () => page.evaluate(() => ({ ...NetCarto.Carto.vbs[NetCarto.Carto.floorId] }));
  const [cx, cy] = await centre(page, 'svg.plan'), v0 = await vb();
  await doigts(page, [[cx - 30, cy], [cx + 30, cy]], [[cx - 120, cy], [cx + 120, cy]]);
  const v1 = await vb();
  assert.ok(v1.w < v0.w * 0.4, `écarter les doigts doit zoomer (largeur ${Math.round(v0.w)} → ${Math.round(v1.w)})`);
  assert.ok(Math.abs((v1.x + v1.w / 2) - (v0.x + v0.w / 2)) < v0.w * 0.05, 'le point entre les doigts reste en place');
  await doigts(page, [[cx - 120, cy], [cx + 120, cy]], [[cx - 40, cy], [cx + 40, cy]]);
  const v2 = await vb(); assert.ok(v2.w > v1.w * 2.5, 'rapprocher les doigts doit dézoomer');
  await doigts(page, [[cx, cy]], [[cx + 60, cy + 40]]);
  const v3 = await vb(); assert.ok(v3.x < v2.x && v3.y < v2.y && Math.abs(v3.w - v2.w) < 0.01, 'un doigt déplace le plan sans changer le zoom');
  assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}, { mobile: true });
test('Téléphone : l\'élévation de la baie est accessible, on y choisit un équipement ou une U libre', async page => {
  await page.evaluate(() => NetCarto.select(NetCarto.Store.db.racks.find(r => r.name === 'BAIE-A2-01').id));
  await page.waitForSelector('.rv-switch'); assert.ok(!(await page.isVisible('#elev')), 'par défaut : la 3D');
  await page.tap('[data-act=rv-vue][data-v=elev]');
  assert.ok(await page.isVisible('#elev .elev-grid')); assert.ok(!(await page.isVisible('.r3d')));
  assert.ok(await page.locator('#elev .eu.dev').count() > 5);
  assert.ok((await page.locator('#elev .eu.dev').first().boundingBox()).height >= 30, 'lignes assez hautes pour le doigt');
  await page.tap('#elev .eu.dev >> text=SW-A2-ACC-01');
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.idx.id.get(NetCarto.Carto.sel).hostname), 'SW-A2-ACC-01');
  await page.tap('#elev .eu.free[data-u="30"]'); await page.waitForSelector('.modal'); assert.match(await page.locator('.modal h2').innerText(), /Installer en U30/);
  await page.tap('[data-act=modal-close]'); await page.tap('[data-act=rv-vue][data-v=r3d]'); assert.ok(await page.isVisible('.r3d'));
  assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
}, { mobile: true });
test('Téléphone : installer depuis le stock en touchant le modèle puis l\'emplacement (plan et baie)', async page => {
  await page.evaluate(() => NetCarto.select(NetCarto.Store.db.floors[2].id));
  const n0 = await page.evaluate(() => NetCarto.Store.db.devices.length);
  await page.tap('[data-act=palette]'); await page.tap('.pal-it[data-cat=cat-u6-pro]');
  assert.ok(await page.locator('.pal-it[data-cat=cat-u6-pro].arme').count() === 1); assert.match(await page.locator('.toast').last().innerText(), /Touchez l'endroit/);
  // La palette se replie pour laisser voir le plan ; on touche une pièce
  const cible = await page.evaluate(() => { const r = NetCarto.Store.db.rooms.find(x => x.name === 'Bureaux DSI'), svg = document.querySelector('svg.plan'), p = new DOMPoint((r.x + r.w / 2) * 20, (r.y + r.h / 2) * 20).matrixTransform(svg.getScreenCTM()); return [p.x, p.y]; });
  await page.touchscreen.tap(cible[0], cible[1]);
  await page.waitForFunction(n => NetCarto.Store.db.devices.length === n + 1, n0);
  assert.strictEqual(await page.evaluate(() => { const d = NetCarto.Store.db.devices.at(-1); return NetCarto.Store.idx.id.get(d.roomId).name + ' ' + d.catalogId; }), 'Bureaux DSI cat-u6-pro');
  assert.strictEqual(await page.locator('.pal-it.arme').count(), 0, 'un seul équipement par choix');
  // En baie : modèle touché, puis U libre touchée dans l'élévation
  await page.evaluate(() => NetCarto.select(NetCarto.Store.db.racks.find(r => r.name === 'BAIE-A2-01').id));
  await page.tap('[data-act=rv-vue][data-v=elev]'); await page.tap('.pal-it[data-cat=cat-c9200l-24p-4g]'); await page.tap('#elev .eu.free[data-u="25"]');
  await page.waitForFunction(n => NetCarto.Store.db.devices.length === n + 2, n0);
  assert.deepStrictEqual(await page.evaluate(() => { const d = NetCarto.Store.db.devices.at(-1); return [d.u, NetCarto.Store.idx.id.get(d.rackId).name]; }), [25, 'BAIE-A2-01']);
}, { mobile: true });
test('Téléphone : glisser au doigt un modèle du stock vers le plan, et déplacer une prise en mode Édition', async page => {
  await page.evaluate(() => NetCarto.select(NetCarto.Store.db.floors[2].id));
  const n0 = await page.evaluate(() => NetCarto.Store.db.devices.length);
  await page.tap('[data-act=palette]');
  const poignee = await centre(page, '.pal-it[data-cat=cat-u6-pro] .pal-grip');
  const cible = await page.evaluate(() => { const r = NetCarto.Store.db.rooms.find(x => x.name === 'Bureaux DSI'), svg = document.querySelector('svg.plan'), p = new DOMPoint((r.x + 3) * 20, (r.y + 2) * 20).matrixTransform(svg.getScreenCTM()); return [p.x, p.y]; });
  await doigts(page, [poignee], [cible], 12);
  await page.waitForFunction(n => NetCarto.Store.db.devices.length === n + 1, n0);
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.idx.id.get(NetCarto.Store.db.devices.at(-1).roomId).name), 'Bureaux DSI');
  assert.strictEqual(await page.locator('.pal-fantome').count(), 0, 'l\'image qui suit le doigt disparaît');
  // Mode Édition : une prise suit le doigt
  await page.tap('.palette [data-act=palette]'); await page.tap('[data-act=plan-edit]');
  // Comme sur un vrai téléphone, on zoome d'abord sur la zone : à l'échelle de l'étage entier, une prise est trop petite pour le doigt
  const prise = await page.evaluate(() => { const C = NetCarto.Carto, o = NetCarto.Store.db.outlets.find(x => NetCarto.Store.idx.id.get(x.roomId).name === 'Bureaux DSI'), vb = C.vbs[C.floorId], w = 200, h = w * vb.h / vb.w;
    Object.assign(vb, { x: o.x * 20 - w / 2, y: o.y * 20 - h / 2, w, h }); return { id: o.id, x: o.x, y: o.y }; });
  await page.tap('[data-act=plan-zoom][data-k="0.7"]');
  prise.p = await page.evaluate(i => { const el = document.querySelector(`svg.plan [data-drag="${i}"] rect`).getBoundingClientRect(); return [el.x + el.width / 2, el.y + el.height / 2]; }, prise.id);
  assert.strictEqual(await page.evaluate(([i, p]) => document.elementFromPoint(p[0], p[1])?.closest('[data-drag]')?.dataset.drag === i, [prise.id, prise.p]), true, 'la prise doit être sous le doigt');
  await doigts(page, [prise.p], [[prise.p[0] + 14, prise.p[1] + 10]], 10);
  const apres = await page.evaluate(i => { const o = NetCarto.Store.idx.id.get(i); return [o.x, o.y]; }, prise.id);
  assert.ok(apres[0] > prise.x + 0.1 && apres[1] > prise.y + 0.1, `la prise doit avoir bougé (${prise.x},${prise.y} → ${apres})`);
}, { mobile: true });

/* ---------- Qualité des données : import CSV, doublons, déplacement ---------- */
const fichierCsv = (nom, texte) => ({ name: nom, mimeType: 'text/csv', buffer: Buffer.from('\ufeff' + texte, 'utf8') });
test('Import CSV d\'équipements : aperçu, lignes refusées expliquées, import d\'un bloc, annulable', async page => {
  await page.click('[data-tab=inv]'); await page.click('[data-act=csv-import]'); await page.waitForSelector('#csv-file');
  await page.setInputFiles('#csv-file', fichierCsv('equipements.csv', [
    'Nom;Modèle;Bâtiment;Étage;Pièce;Baie;U;IP;MAC;N° de série;Statut',
    'SW-IMP-01;Catalyst 9200L-24P-4G;;;;BAIE-A2-01;30;10.10.99.210;02:AA:BB:CC:DD:01;DMO-IMP00001;En service',
    'AP-IMP-01;U6-Pro;A;R+2;Bureaux DSI;;;10.10.30.210;;DMO-IMP00002;',
    'SW-IMP-02;Catalyst 9200L-24P-4G;;;;BAIE-A2-01;;10.10.99.11;;;',
    'SW-IMP-03;Modèle Inconnu 9000;;;;BAIE-A2-01;;;;;',
    'SW-A1-ACC-01;Catalyst 9200L-24P-4G;;;;BAIE-A2-01;;;;;',
    'SW-IMP-04;Catalyst 9200L-24P-4G;;;;BAIE-A2-01;38;;;;',
    'SW-IMP-01;Catalyst 9200L-24P-4G;;;;BAIE-A2-01;;;;;'].join('\r\n')));
  await page.waitForSelector('#csv-rapport .csv-l');
  assert.deepStrictEqual([await page.locator('#csv-rapport .csv-l.ok').count(), await page.locator('#csv-rapport .csv-l.ko').count()], [2, 5]);
  const refus = await page.locator('#csv-rapport').innerText();
  for (const motif of [/Adresse IP déjà utilisée/, /Modèle introuvable/, /Nom d'hôte déjà utilisé/, /U38/, /en double dans le fichier/]) assert.match(refus, motif);
  assert.match(await page.locator('[data-act=modal-ok]').innerText(), /Importer 2/);
  const avant = await page.evaluate(() => [NetCarto.Store.db.devices.length, NetCarto.Store.undoStack.length]);
  await page.click('[data-act=modal-ok]'); await page.waitForTimeout(200);
  const r = await page.evaluate(() => { const d = NetCarto.Store.db, sw = d.devices.find(x => x.hostname === 'SW-IMP-01'), ap = d.devices.find(x => x.hostname === 'AP-IMP-01');
    return { n: d.devices.length, sw: [sw.u, sw.ip, sw.mac, sw.serial, sw.status, d.ports.filter(p => p.deviceId === sw.id).length, NetCarto.Store.idx.id.get(sw.rackId).name], ap: [NetCarto.Store.idx.id.get(ap.roomId).name, ap.rackId, d.ports.filter(p => p.deviceId === ap.id).length], h: d.history[0].text, undo: NetCarto.Store.undoStack.length }; });
  assert.strictEqual(r.n, avant[0] + 2); assert.deepStrictEqual(r.sw, [30, '10.10.99.210', '02:aa:bb:cc:dd:01', 'DMO-IMP00001', 'active', 28, 'BAIE-A2-01']);
  assert.deepStrictEqual(r.ap, ['Bureaux DSI', null, 1]); assert.match(r.h, /Import CSV : 2 équipements/); assert.strictEqual(r.undo, avant[1] + 1, 'un seul pas d\'annulation');
  await page.keyboard.press('Control+z');
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.db.devices.length), avant[0]);
});
test('Import CSV de prises murales, séparateur virgule, et modèle de fichier téléchargeable', async page => {
  await page.click('[data-tab=inv]'); await page.click('[data-act=csv-import]'); await page.selectOption('#csv-type', 'prises');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=csv-modele]')]);
  assert.match(fs.readFileSync(await dl.path(), 'utf8'), /repere;batiment;etage;piece;x;y;usage/);
  await page.setInputFiles('#csv-file', fichierCsv('prises.csv', ['repere,batiment,etage,piece,x,y,usage', 'A2-900,A,R+2,Bureaux DSI,25,15,données', 'A2-001,A,R+2,Bureaux DSI,,,voix', 'A2-901,A,R+2,Salle absente,,,data', 'A2-902,A,R+2,"Bureaux DSI",999,1,data'].join('\n')));
  await page.waitForSelector('#csv-rapport .csv-l');
  assert.deepStrictEqual([await page.locator('#csv-rapport .csv-l.ok').count(), await page.locator('#csv-rapport .csv-l.ko').count()], [1, 3]);
  const refus = await page.locator('#csv-rapport').innerText();
  for (const motif of [/Repère de prise déjà utilisé/, /Pièce introuvable/, /hors de la pièce/]) assert.match(refus, motif);
  await page.click('[data-act=modal-ok]'); await page.waitForTimeout(150);
  assert.deepStrictEqual(await page.evaluate(() => { const o = NetCarto.Store.db.outlets.find(x => x.label === 'A2-900'); return [o.x, o.y, o.usage, NetCarto.Store.idx.id.get(o.roomId).name]; }), [25, 15, 'data', 'Bureaux DSI']);
});
test('Doublons refusés dès la saisie : adresse IP, nom d\'hôte, adresse MAC, nom de baie', async page => {
  const [a, b] = await page.evaluate(() => { const d = NetCarto.Store.db.devices.filter(x => x.ip && x.mac); NetCarto.select(d[0].id); return [d[0], d[1]]; });
  const essai = async (champ, valeur, motif) => { await page.click('#detail [data-act=dev-edit]'); await page.fill(`.modal [name=${champ}]`, valeur); await page.click('[data-act=modal-ok]'); await page.waitForSelector('.toast.err'); assert.match(await page.locator('.toast.err').last().innerText(), motif); await page.click('[data-act=modal-close]'); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); };
  await essai('ip', b.ip, /Adresse IP déjà utilisée.*/); await essai('hostname', b.hostname.toLowerCase(), /Nom d'hôte déjà utilisé/); await essai('mac', b.mac.toUpperCase(), /Adresse MAC déjà utilisée/);
  assert.deepStrictEqual(await page.evaluate(i => { const x = NetCarto.Store.idx.id.get(i); return [x.ip, x.hostname, x.mac]; }, a.id), [a.ip, a.hostname, a.mac]);
  assert.match(await page.evaluate(() => { try { NetCarto.installFromStock('cat-c9200l-24p-4g', { rackId: NetCarto.Store.db.racks.find(r => r.name === 'BAIE-A2-01').id, u: 20, name: 'sw-a1-acc-01' }); return ''; } catch (e) { return e.message; } }), /Nom d'hôte déjà utilisé/);
  const racks = await page.evaluate(() => { const r = NetCarto.Store.db.racks; NetCarto.select(r[0].id); return r.map(x => x.name); });
  await page.click('#detail [data-act=rack-edit]'); await page.fill('.modal [name=name]', racks[1]); await page.click('[data-act=modal-ok]'); await page.waitForSelector('.toast.err');
  assert.match(await page.locator('.toast.err').last().innerText(), /Nom de baie déjà utilisé/);
});
test('Déplacer un équipement câblé : le brassage est signalé, et peut être débranché d\'un coup', async page => {
  const etat = () => page.evaluate(() => { const d = NetCarto.Store.db, sw = d.devices.find(x => x.hostname === 'SW-A1-ACC-02'), ids = new Set(d.ports.filter(p => p.deviceId === sw.id).map(p => p.id)); return { rack: NetCarto.Store.idx.id.get(sw.rackId).name, cables: d.cables.filter(c => ids.has(c.a) || ids.has(c.b)).length }; });
  const deplacer = async (decocher) => { await page.evaluate(() => NetCarto.select(NetCarto.Store.db.devices.find(x => x.hostname === 'SW-A1-ACC-02').id)); await page.click('#detail [data-act=dev-move]'); await page.waitForSelector('#inst-body'); await page.selectOption('#inst-body [name=floor]', { label: 'R+2' }); if (decocher) await page.uncheck('#inst-body [name=debrancher]'); };
  const avant = await etat(); assert.ok(avant.cables > 5 && avant.rack === 'BAIE-A1-01');
  await deplacer(false);
  assert.match(await page.locator('#inst-body').innerText(), new RegExp(`${avant.cables} câbles`)); assert.ok(await page.isChecked('#inst-body [name=debrancher]'), 'changement de baie : débranchement proposé d\'office');
  await page.click('[data-act=modal-ok]'); await page.waitForTimeout(150);
  assert.deepStrictEqual(await etat(), { rack: 'BAIE-A2-01', cables: 0 });
  await page.keyboard.press('Control+z'); assert.deepStrictEqual(await etat(), avant);
  await deplacer(true); await page.click('[data-act=modal-ok]'); await page.waitForTimeout(150);
  assert.deepStrictEqual(await etat(), { rack: 'BAIE-A2-01', cables: avant.cables }, 'câbles gardés si l\'on décoche');
});

/* ---------- Sauvegarde locale du mode démonstration ---------- */
const recharger = async page => { await page.waitForTimeout(600); await page.reload(); await page.waitForFunction(() => window.NetCarto?.Store.db); };
test('Sauvegarde locale : base gardée dans IndexedDB, anciennes données reprises, grand fond de plan accepté', async page => {
  // Données laissées par une ancienne version dans localStorage : elles sont reprises puis déplacées
  await page.evaluate(() => { const d = JSON.parse(JSON.stringify(NetCarto.Store.db)); d.devices[0].hostname = 'ANCIEN-STOCKAGE'; localStorage.setItem('netcarto:db:v1', JSON.stringify(d)); return indexedDB.deleteDatabase('netcarto'); });
  await page.reload(); await page.waitForFunction(() => window.NetCarto?.Store.db);
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.db.devices[0].hostname), 'ANCIEN-STOCKAGE');
  await page.waitForFunction(() => localStorage.getItem('netcarto:db:v1') === null, null, { timeout: 5000 });
  // Un fond de plan de 7 Mo dépasse ce que localStorage accepte : IndexedDB le garde
  await page.evaluate(() => NetCarto.Store.commit('edit', 'Grand plan', db => { db.floors[0].planImage = 'data:image/png;base64,' + 'A'.repeat(7e6); }));
  await recharger(page);
  assert.deepStrictEqual(await page.evaluate(() => [NetCarto.Store.db.devices[0].hostname, NetCarto.Store.db.floors[0].planImage.length > 7e6]), ['ANCIEN-STOCKAGE', true]);
  assert.strictEqual(await page.locator('.toast.warn, .toast.err').count(), 0);
});
test('Copies de secours locales : une copie à chaque ouverture, restauration annulable, téléchargement', async page => {
  const nommer = nom => page.evaluate(n => NetCarto.Store.commit('edit', 'Nom ' + n, db => { db.devices[0].hostname = n; }), nom);
  await nommer('ETAT-UN'); await recharger(page);
  await nommer('ETAT-DEUX'); await recharger(page);
  await nommer('ETAT-TROIS');
  await page.click('[data-act=copies]'); await page.waitForSelector('#copies-list .cp-row');
  assert.strictEqual(await page.locator('#copies-list .cp-row').count(), 2, 'une copie par ouverture de la page');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#copies-list .cp-row').first().locator('[data-act=copie-telecharger]').click()]);
  assert.strictEqual(JSON.parse(fs.readFileSync(await dl.path(), 'utf8')).devices[0].hostname, 'ETAT-DEUX', 'la plus récente en premier');
  await page.locator('#copies-list .cp-row').last().locator('[data-act=copie-restaurer]').click(); await page.click('[data-act=modal-ok]');
  await page.waitForFunction(() => NetCarto.Store.db.devices[0].hostname === 'ETAT-UN');
  await page.keyboard.press('Control+z');
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.db.devices[0].hostname), 'ETAT-TROIS', 'la restauration s\'annule');
  // Six ouvertures de plus : seules les cinq copies les plus récentes sont gardées
  for (let i = 0; i < 6; i++) { await nommer('TOUR-' + i); await recharger(page); }
  await page.click('[data-act=copies]'); await page.waitForSelector('#copies-list .cp-row');
  assert.strictEqual(await page.locator('#copies-list .cp-row').count(), 5);
});
test('Stockage du navigateur bloqué : l\'application fonctionne et prévient qu\'elle ne garde rien', async page => {
  assert.ok(await page.evaluate(() => NetCarto.Store.db.devices.length > 50));
  await page.evaluate(() => NetCarto.Store.commit('edit', 'Essai', db => { db.devices[0].hostname = 'SANS-STOCKAGE'; }));
  await page.waitForSelector('.toast.warn'); assert.match(await page.locator('.toast.warn').first().innerText(), /Sauvegarde locale impossible/);
}, { sansStockage: true });

/* ---------- Montée en charge et annulation légère ---------- */
test('Annulation par écarts : chaque opération se défait à l\'identique, sans copie complète de la base', async page => {
  const etat = () => page.evaluate(() => JSON.stringify(NetCarto.Store.db));
  const etats = [await etat()];
  const ops = [
    () => page.evaluate(() => { NetCarto.installFromStock('cat-c9200l-24p-4g', { rackId: NetCarto.Store.db.racks.find(r => r.name === 'BAIE-A2-01').id, u: 20, name: 'SW-ECART-01', ip: '10.10.99.240' }); }),
    () => page.evaluate(() => { const d = NetCarto.Store.db; NetCarto.disconnect(d.cables.find(c => c.type === 'patch').id); }),
    () => page.evaluate(() => { const d = NetCarto.Store.db; NetCarto.Store.commit('edit', 'Renommage', () => { d.devices[3].hostname = 'RENOMME'; d.devices[3].notes = 'é → ü'; }); }),
    () => page.evaluate(() => { const d = NetCarto.Store.db; NetCarto.removeDevice(d.devices.find(x => x.hostname === 'SW-A1-ACC-02').id, 'stock'); }),
    () => page.evaluate(() => { const d = NetCarto.Store.db; NetCarto.Store.commit('edit', 'Ordre et suppression', () => { d.outlets.reverse(); d.cables.splice(5, 3); d.vlans.push({ ...d.vlans[0], id: 999, name: 'Essai' }); }); }),
    () => page.evaluate(() => { const d = NetCarto.Store.db; NetCarto.removeDevice(d.devices.find(x => x.hostname === 'AP-A1-01' || x.hostname.startsWith('AP-')).id, 'retire'); }),
  ];
  for (const op of ops) { await op(); etats.push(await etat()); }
  const pile = await page.evaluate(() => ({ n: NetCarto.Store.undoStack.length, copies: NetCarto.Store.undoStack.filter(u => u.snap).length, poids: JSON.stringify(NetCarto.Store.undoStack).length, base: JSON.stringify(NetCarto.Store.db).length }));
  assert.strictEqual(pile.n, ops.length); assert.strictEqual(pile.copies, 0, 'aucune copie complète gardée');
  assert.ok(pile.poids < pile.base / 2, `pile d'annulation trop lourde : ${pile.poids} octets pour une base de ${pile.base}`);
  for (let i = ops.length - 1; i >= 0; i--) {
    await page.evaluate(() => NetCarto.Store.undo());
    assert.ok(await etat() === etats[i], `après annulation de l'opération ${i + 1}, la base doit être identique à l'état d'avant`);
  }
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.undoStack.length), 0);
  // Les index suivent : l'équipement installé puis annulé n'existe plus, celui retiré est revenu
  assert.deepStrictEqual(await page.evaluate(() => [NetCarto.Store.db.devices.some(x => x.hostname === 'SW-ECART-01'), !!NetCarto.Store.idx.id.get(NetCarto.Store.db.devices.find(x => x.hostname === 'SW-A1-ACC-02').id)]), [false, true]);
});
test('Grande base (3 000 équipements, 34 000 ports) : chaque action reste rapide et l\'annulation légère', async page => {
  const { grandeBase } = await import('./grande-base.mjs'), doc = await grandeBase();
  assert.ok(doc.devices.length > 3000 && doc.ports.length > 30000 && doc.cables.length > 15000);
  await page.route('**/charge.json', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify(doc) }));
  assert.strictEqual(await page.evaluate(async () => { const d = await (await fetch('/charge.json')).json(), S = NetCarto.Store, err = S.validate(d); if (err) return err; S.save = () => {}; S.db = d; S.undoStack = []; S.reindex(); S.emit(); return null; }), null, 'la grande base doit être valide');
  // Durée d'une action, rendu compris (une image affichée)
  const duree = code => page.evaluate(`(async () => { const d = performance.now(); ${code}; await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); return performance.now() - d; })()`);
  const mesures = {
    plan: await duree(`document.querySelector('[data-tab=carto]').click(); NetCarto.select(NetCarto.Store.db.floors[40].id)`),
    inventaire: await duree(`document.querySelector('[data-tab=inv]').click()`),
    tableau: await duree(`document.querySelector('[data-tab=dash]').click()`),
    recherche: await duree(`const i = document.querySelector('#gsearch'); i.value = 'ACC-03'; i.dispatchEvent(new Event('input'))`),
    modification: await duree(`document.querySelector('[data-tab=carto]').click(); const x = NetCarto.Store.db.devices[50]; NetCarto.Store.commit('edit', 'Essai', () => { x.notes = 'charge'; })`),
    tracage: await duree(`NetCarto.trace(NetCarto.Store.db.outlets[4000].id)`),
    annulation: await duree(`NetCarto.Store.undo()`),
  };
  // Seuils larges (machine de test lente) : ils signalent une régression nette, pas un écart de quelques millisecondes
  for (const [nom, ms] of Object.entries(mesures)) assert.ok(ms < 1500, `${nom} : ${Math.round(ms)} ms (${JSON.stringify(Object.fromEntries(Object.entries(mesures).map(([k, v]) => [k, Math.round(v)])))})`);
  await page.evaluate(() => { for (let i = 0; i < 25; i++) { const x = NetCarto.Store.db.devices[100 + i]; NetCarto.Store.commit('edit', 'Essai ' + i, () => { x.notes = 'n' + i; }); } });
  const poids = await page.evaluate(() => JSON.stringify(NetCarto.Store.undoStack).length);
  assert.ok(poids < 200000, `25 annulations doivent tenir en moins de 200 Ko (mesuré : ${Math.round(poids / 1024)} Ko)`);
  assert.strictEqual(await page.locator('#gsearch-res .it').count() > 0, true);
});

/* ---------- Mode serveur : l'interface lit et écrit par l'API, la base est sur le serveur ---------- */
const api = (page, chemin, methode = 'GET', corps) => page.evaluate(async ([c, m, b]) => { const r = await fetch('/api/v1' + c, { method: m, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined }); return { code: r.status, json: await r.json() }; }, [chemin, methode, corps]);
const synchro = page => page.waitForFunction(() => NetCarto.Sync.enAttente === 0 && NetCarto.Sync.etat !== 'envoi', null, { timeout: 8000 });
const S = { serveur: true };
const MDP = 'Mot-de-passe-de-test-1';   // mot de passe fictif des comptes de test

test('Serveur : l\'interface charge la base par l\'API, rien dans le stockage du navigateur', async page => {
  assert.deepStrictEqual(await page.evaluate(() => [NetCarto.Store.mode, NetCarto.Store.db.devices.length, localStorage.getItem('netcarto:db:v1'), document.querySelector('meta[name=netcarto-api]').content]), ['serveur', 102, null, '/api/v1']);
  assert.ok(await page.isVisible('#srv-tag')); assert.match(await page.locator('#srv-tag').innerText(), /Serveur/);
  assert.strictEqual((await api(page, '/info')).json.mode, 'serveur');
}, S);
test('Serveur : une modification est enregistrée dans la base et survit au rechargement', async page => {
  const pid = await page.evaluate(() => { const d = NetCarto.Store.db, sw = d.devices.find(x => x.hostname === 'SW-A1-ACC-01'), p = d.ports.find(p => p.deviceId === sw.id && p.idx === 2); NetCarto.select(p.id); return p.id; });
  await page.selectOption('#detail select[data-f=vlan]', '200'); await synchro(page);
  assert.strictEqual((await api(page, '/ports/' + pid)).json.vlan, 200);
  assert.match((await api(page, '/journal')).json[0].text, /VLAN → 200/);
  await page.reload(); await page.waitForFunction(() => window.NetCarto?.Store.db);
  assert.strictEqual(await page.evaluate(i => NetCarto.Store.idx.id.get(i).vlan, pid), 200);
}, S);
test('Serveur : installer un équipement crée l\'équipement, ses ports et décrémente le stock, d\'un bloc', async page => {
  const rev = (await api(page, '/revision')).json.revision;
  await page.click('[data-tab=mat]'); await page.click('.mcard[data-id=cat-c9200l-24p-4g]'); await page.click('#mat-info [data-act=install]'); await page.waitForSelector('#inst-body');
  await page.selectOption('#inst-body [name=floor]', { label: 'R+2' }); await page.click('[data-act=modal-ok]'); await synchro(page);
  const dev = (await api(page, '/equipements?hostname=SW-A2-01')).json[0];
  assert.ok(dev && dev.u === 41, 'équipement absent de la base');
  assert.doesNotMatch(dev.id, /^dev-[0-9a-z]{1,4}$/, 'en mode serveur, les identifiants sont tirés au hasard');
  assert.strictEqual((await api(page, '/ports?deviceId=' + dev.id)).json.length, 28);
  assert.strictEqual((await api(page, '/stock/cat-c9200l-24p-4g')).json.available, 2);
  assert.strictEqual((await api(page, '/revision')).json.revision, rev + 1, 'une seule transaction');
  // Annuler défait aussi sur le serveur
  await page.keyboard.press('Control+z'); await synchro(page);
  assert.strictEqual((await api(page, '/equipements?hostname=SW-A2-01')).json.length, 0);
  assert.strictEqual((await api(page, '/stock/cat-c9200l-24p-4g')).json.available, 3);
}, S);
test('Serveur : import CSV et déplacement avec débranchement, chacun en une seule transaction', async page => {
  const rev = (await api(page, '/revision')).json.revision;
  await page.click('[data-tab=inv]'); await page.click('[data-act=csv-import]');
  await page.setInputFiles('#csv-file', fichierCsv('equipements.csv', ['nom;modele;baie;ip;mac', 'SW-IMP-01;Catalyst 9200L-24P-4G;BAIE-A2-01;10.10.99.210;02-AA-BB-CC-DD-01', 'SW-IMP-02;Catalyst 9200L-24P-4G;BAIE-A2-01;10.10.99.211;', 'SW-IMP-03;Catalyst 9200L-24P-4G;BAIE-A2-01;10.10.99.11;'].join('\n')));
  await page.waitForSelector('#csv-rapport .csv-l'); await page.click('[data-act=modal-ok]'); await synchro(page);
  const lus = (await api(page, '/equipements')).json.filter(d => /^SW-IMP/.test(d.hostname));
  assert.deepStrictEqual(lus.map(d => [d.hostname, d.mac]).sort(), [['SW-IMP-01', '02:aa:bb:cc:dd:01'], ['SW-IMP-02', '']]);
  assert.strictEqual((await api(page, '/ports?deviceId=' + lus[0].id)).json.length, 28);
  assert.strictEqual((await api(page, '/revision')).json.revision, rev + 1, 'l\'import est une seule transaction');
  const sw = (await api(page, '/equipements?hostname=SW-A1-ACC-02')).json[0];
  const nb = async () => { const ids = new Set((await api(page, '/ports?deviceId=' + sw.id)).json.map(p => p.id)); return (await api(page, '/cables')).json.filter(c => ids.has(c.a) || ids.has(c.b)).length; };
  assert.ok(await nb() > 5);
  await page.evaluate(i => NetCarto.select(i), sw.id); await page.click('#detail [data-act=dev-move]'); await page.waitForSelector('#inst-body');
  await page.selectOption('#inst-body [name=floor]', { label: 'R+2' }); await page.click('[data-act=modal-ok]'); await synchro(page);
  assert.strictEqual(await nb(), 0); assert.strictEqual((await api(page, '/revision')).json.revision, rev + 2);
  assert.notStrictEqual((await api(page, '/equipements/' + sw.id)).json.rackId, sw.rackId);
}, S);
test('Serveur : un doublon d\'adresse IP qui échappe à l\'interface est refusé par la base, l\'écran revient en arrière', async page => {
  const [a, b] = await page.evaluate(() => { const d = NetCarto.Store.db.devices.filter(x => x.ip); NetCarto.select(d[0].id); return [d[0], d[1]]; });
  // Écriture directe dans le store, sans passer par les contrôles de l'interface (comme le ferait un autre outil)
  await page.evaluate(([i, ip]) => NetCarto.Store.commit('edit', 'Test', () => { NetCarto.Store.idx.id.get(i).ip = ip; }), [a.id, b.ip]);
  const refus = await (await page.waitForSelector('.toast.err')).innerText();   // lu tout de suite : la notification s'efface seule
  await synchro(page);
  assert.match(refus, /Adresse IP déjà utilisée/);
  assert.strictEqual(await page.evaluate(i => NetCarto.Store.idx.id.get(i).ip, a.id), a.ip, 'l\'interface doit revenir à l\'ancienne adresse');
  assert.strictEqual((await api(page, '/equipements/' + a.id)).json.ip, a.ip);
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.undoStack.length), 0);
}, { serveur: true, erreursAttendues: /422/ });
test('Serveur : deux modifications coup sur coup du même élément sont enregistrées toutes les deux, sans faux conflit', async page => {
  const id = await page.evaluate(() => { const x = NetCarto.Store.db.devices.find(d => d.hostname === 'SW-A1-ACC-01'), S = NetCarto.Store;
    S.commit('edit', 'Première', () => { x.notes = 'première'; }); S.commit('edit', 'Seconde', () => { x.notes = 'seconde'; x.firmware = '1.2.3'; }); return x.id; });
  await synchro(page);
  const lu = (await api(page, '/equipements/' + id)).json;
  assert.deepStrictEqual([lu.notes, lu.firmware], ['seconde', '1.2.3']); assert.strictEqual(await page.locator('.toast.err').count(), 0);
  const audit = (await api(page, '/audit?cle=' + id)).json.filter(a => a.action === 'modifier');
  assert.deepStrictEqual(audit.map(a => a.apres.notes), ['seconde', 'première'], 'le journal d\'audit garde les deux étapes');
  // Annuler deux fois : le serveur revient à l'état de départ, étape par étape
  await page.evaluate(() => { NetCarto.Store.undo(); NetCarto.Store.undo(); }); await synchro(page);
  assert.strictEqual((await api(page, '/equipements/' + id)).json.notes, ''); assert.strictEqual(await page.locator('.toast.err').count(), 0);
}, S);
test('Serveur : politique de sécurité du contenu — la page et la 3D fonctionnent, un script injecté ne s\'exécute pas', async (page, { reponse }) => {
  const csp = reponse.headers()['content-security-policy'];
  assert.match(csp, /default-src 'self'/); assert.doesNotMatch(/script-src[^;]*/.exec(csp)[0], /unsafe-inline|unsafe-eval|\*/);
  // La 3D (modules, carte d'import) fonctionne sous cette politique
  await choisir(page, 'BAIE-A0-01'); await page.waitForSelector('#r3d-canvas canvas', { timeout: 20000 });
  assert.strictEqual(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'le script du thème, autorisé par son empreinte, s\'est exécuté');
  // Un script ajouté à la page (ce que ferait une injection) est bloqué, tout comme un appel vers un autre site
  assert.strictEqual(await page.evaluate(() => { const s = document.createElement('script'); s.textContent = 'window.__injecte = 1'; document.head.appendChild(s); return window.__injecte; }), undefined);
  assert.strictEqual(await page.evaluate(() => fetch('https://exemple.invalid/vol?d=1').then(() => 'parti', () => 'bloqué')), 'bloqué');
}, { serveur: true, erreursAttendues: /Content Security Policy/ });
test('Serveur : modification faite ailleurs entre-temps → prévenu, données rechargées, rien n\'est écrasé', async page => {
  const dev = await page.evaluate(() => { const x = NetCarto.Store.db.devices.find(d => d.hostname === 'SW-A1-ACC-01'); NetCarto.select(x.id); return x; });
  const autre = await api(page, '/lots', 'POST', { changements: [{ collection: 'devices', op: 'modifier', cle: dev.id, avant: dev, apres: { ...dev, notes: 'changé par un collègue' } }] });
  assert.strictEqual(autre.code, 200);
  await page.click('#detail [data-act=dev-edit]'); await page.fill('.modal [name=firmware]', 'IOS-XE 99'); await page.click('[data-act=modal-ok]');
  await page.waitForSelector('.toast.warn'); await synchro(page);
  assert.match(await page.locator('.toast.warn').first().innerText(), /modifié entre-temps/);
  assert.deepStrictEqual(await page.evaluate(i => { const x = NetCarto.Store.idx.id.get(i); return [x.notes, x.firmware]; }, dev.id), ['changé par un collègue', dev.firmware]);
  assert.strictEqual((await api(page, '/equipements/' + dev.id)).json.notes, 'changé par un collègue');
}, { serveur: true, erreursAttendues: /409/ });
test('Serveur : un changement fait par un autre poste apparaît sans recharger la page', async page => {
  const site = await page.evaluate(() => { NetCarto.Sync.intervalle = 300; NetCarto.Sync.surveiller(); return NetCarto.Store.db.sites[0]; });
  await api(page, '/lots', 'POST', { changements: [{ collection: 'sites', op: 'modifier', cle: site.id, avant: site, apres: { ...site, name: 'Campus Renommé' } }] });
  await page.waitForFunction(() => NetCarto.Store.db.sites[0].name === 'Campus Renommé', null, { timeout: 5000 });
  assert.match(await page.locator('#tree').innerText(), /Campus Renommé/);
}, S);
test('Serveur : base vide, puis création d\'un site, enregistrés sur le serveur', async page => {
  await page.click('[data-act=reset]'); await page.check('input[value=vide]'); await page.click('[data-act=modal-ok]'); await synchro(page);
  let b = (await api(page, '/base')).json;
  assert.deepStrictEqual([b.sites.length, b.devices.length, b.catalog.length, b.meta.demo], [0, 0, 34, false]);
  await page.click('.empty-state [data-kind=site]'); await page.waitForSelector('.modal'); await page.fill('.modal [name=name]', 'Siège'); await page.click('[data-act=modal-ok]'); await synchro(page);
  b = (await api(page, '/base')).json;
  assert.deepStrictEqual(b.sites.map(s => s.name), ['Siège']);
  await page.reload(); await page.waitForFunction(() => window.NetCarto?.Store.db);
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.db.sites[0].name), 'Siège');
}, S);
test('Serveur : supervision par le module intégré, sans adresse à saisir', async page => {
  await page.click('[data-act=sources]'); await page.selectOption('.modal [name=type]', 'relais'); await page.click('[data-act=modal-ok]'); await page.waitForFunction(() => NetCarto.Live.state === 'ok', null, { timeout: 5000 });
  assert.deepStrictEqual(await page.evaluate(() => [NetCarto.Live.matched, NetCarto.Live.port.size]), [1, 2]);
}, { serveur: true, supervision: [{ type: 'simulation', devices: [{ ip: '10.10.99.18', hostname: 'SW-A1-ACC-01', ports: ['Gi1/0/1', 'Gi1/0/2'] }] }] });
test('Serveur injoignable : la modification est annulée à l\'écran et l\'utilisateur est prévenu', async (page, ctx) => {
  const dev = await page.evaluate(() => { const x = NetCarto.Store.db.devices.find(d => d.hostname === 'SW-A1-ACC-01'); NetCarto.select(x.id); return x; });
  await ctx.app.arreter();
  await page.click('#detail [data-act=dev-edit]'); await page.fill('.modal [name=notes]', 'perdu ?'); await page.click('[data-act=modal-ok]');
  await page.waitForSelector('.toast.err');
  assert.match(await page.locator('.toast.err').first().innerText(), /Serveur injoignable/);
  await synchro(page);
  assert.strictEqual(await page.evaluate(i => NetCarto.Store.idx.id.get(i).notes, dev.id), dev.notes);
  assert.match(await page.locator('#srv-tag').innerText(), /Hors ligne/);
}, { serveur: true, erreursAttendues: /ERR_CONNECTION_REFUSED|Failed to fetch|Failed to load/ });

/* ---------- Comptes, rôles et journal d'audit ---------- */
test('Comptes : première ouverture, création de l\'administrateur avec le code du serveur', async (page, ctx) => {
  await page.waitForSelector('#auth form[data-mode=initialisation]');
  assert.strictEqual(await page.evaluate(() => !!window.NetCarto?.Store.db), false, 'aucune donnée n\'est chargée avant la connexion');
  await page.fill('#auth [name=code]', 'AAAA-BBBB-CCCC'); await page.fill('#auth [name=identifiant]', 'chef'); await page.fill('#auth [name=nom]', 'Chef de projet');
  await page.fill('#auth [name=motDePasse]', MDP); await page.fill('#auth [name=confirmation]', MDP); await page.click('#auth button[type=submit]');
  await page.waitForSelector('#auth .auth-err:not(:empty)'); assert.match(await page.locator('#auth .auth-err').innerText(), /Code d'initialisation incorrect/);
  await page.fill('#auth [name=code]', ctx.app.codeInitialisation); await page.fill('#auth [name=confirmation]', 'autre chose'); await page.click('#auth button[type=submit]');
  assert.match(await page.locator('#auth .auth-err').innerText(), /ne sont pas identiques/);
  await page.fill('#auth [name=confirmation]', MDP); await page.click('#auth button[type=submit]');
  await page.waitForFunction(() => window.NetCarto?.Store.db && !document.querySelector('#auth'));
  assert.match(await page.locator('#user-chip').innerText(), /chef/);
  assert.strictEqual(await page.evaluate(() => NetCarto.Store.utilisateur.role), 'administrateur');
}, { serveur: true, sansComptes: true, erreursAttendues: /403|401/ });
test('Comptes : connexion, erreur de mot de passe, déconnexion', async page => {
  await page.waitForSelector('#auth form[data-mode=connexion]');
  await page.fill('#auth [name=identifiant]', 'tech'); await page.fill('#auth [name=motDePasse]', 'Mauvais-mot-de-passe'); await page.click('#auth button[type=submit]');
  await page.waitForSelector('#auth .auth-err:not(:empty)'); assert.match(await page.locator('#auth .auth-err').innerText(), /Identifiant ou mot de passe incorrect/);
  await page.fill('#auth [name=motDePasse]', MDP); await page.click('#auth button[type=submit]');
  await page.waitForFunction(() => window.NetCarto?.Store.db && !document.querySelector('#auth'));
  assert.deepStrictEqual(await page.evaluate(() => [NetCarto.Store.utilisateur.identifiant, NetCarto.Store.db.devices.length]), ['tech', 102]);
  await page.click('#user-chip'); await page.click('[data-act=compte-deconnexion]');
  await page.waitForSelector('#auth form[data-mode=connexion]');
  assert.strictEqual((await api(page, '/base')).code, 401);
}, { serveur: true, compte: null, erreursAttendues: /401/ });
test('Comptes : un compte en lecture seule consulte tout mais ne modifie rien', async page => {
  assert.match(await page.locator('#user-chip').innerText(), /lecteur/);
  const pid = await page.evaluate(() => { const d = NetCarto.Store.db, sw = d.devices.find(x => x.hostname === 'SW-A1-ACC-01'), p = d.ports.find(p => p.deviceId === sw.id && p.idx === 2); NetCarto.select(p.id); return p.id; });
  const avant = (await api(page, '/ports/' + pid)).json.vlan;
  await page.selectOption('#detail select[data-f=vlan]', '200'); await page.waitForSelector('.toast.err');
  assert.match(await page.locator('.toast.err').first().innerText(), /lecture seule/);
  assert.strictEqual(await page.evaluate(i => NetCarto.Store.idx.id.get(i).vlan, pid), avant);
  assert.strictEqual((await api(page, '/ports/' + pid)).json.vlan, avant);
  await page.click('#user-chip'); assert.strictEqual(await page.locator('[data-act=compte-utilisateurs]').count(), 0, 'la gestion des comptes est réservée aux administrateurs');
}, { serveur: true, compte: 'lecteur' });
test('Comptes : un technicien modifie, mais ne remplace pas la base', async page => {
  await page.click('[data-act=reset]'); await page.check('input[value=vide]'); await page.click('[data-act=modal-ok]'); await page.waitForSelector('.toast.err');
  assert.match(await page.locator('.toast.err').first().innerText(), /administrateurs/);
  assert.strictEqual((await api(page, '/equipements')).json.length, 102);
}, { serveur: true, compte: 'tech' });
test('Comptes : l\'administrateur crée un utilisateur, le verrou et le rôle se gèrent depuis la fenêtre', async page => {
  await page.click('#user-chip'); await page.click('[data-act=compte-utilisateurs]'); await page.waitForSelector('#users-list .u-row');
  assert.strictEqual(await page.locator('#users-list .u-row').count(), 3);
  await page.fill('#user-new [name=u-identifiant]', 'alice'); await page.fill('#user-new [name=u-nom]', 'Alice Martin'); await page.selectOption('#user-new [name=u-role]', 'technicien'); await page.fill('#user-new [name=u-mdp]', 'court');
  await page.click('[data-act=user-add]'); await page.waitForSelector('.toast.err'); assert.match(await page.locator('.toast.err').first().innerText(), /12 caractères/);
  await page.fill('#user-new [name=u-mdp]', MDP); await page.click('[data-act=user-add]');
  await page.waitForFunction(() => document.querySelectorAll('#users-list .u-row').length === 4);
  const alice = (await api(page, '/utilisateurs')).json.find(u => u.identifiant === 'alice');
  assert.deepStrictEqual([alice.nom, alice.role, alice.actif], ['Alice Martin', 'technicien', true]);
  await page.selectOption(`#users-list .u-row[data-id="${alice.id}"] select`, 'lecture');
  await page.waitForFunction(async id => (await (await fetch('/api/v1/utilisateurs')).json()).find(u => u.id === id).role === 'lecture', alice.id);
}, { serveur: true, erreursAttendues: /422/ });
test('Comptes : le journal d\'audit montre qui a fait quoi, avec la valeur avant et après', async page => {
  const dev = await page.evaluate(() => { const x = NetCarto.Store.db.devices.find(d => d.hostname === 'SW-A1-ACC-01'); NetCarto.select(x.id); return x; });
  await page.click('#detail [data-act=dev-edit]'); await page.fill('.modal [name=notes]', 'baie réorganisée'); await page.click('[data-act=modal-ok]'); await synchro(page);
  await page.click('#user-chip'); await page.click('[data-act=compte-audit]'); await page.waitForSelector('#audit-list .a-row');
  const ligne = page.locator('#audit-list .a-row', { hasText: 'SW-A1-ACC-01' }).first();
  const texte = await ligne.innerText();
  assert.match(texte, /admin/); assert.match(texte, /Modification/); assert.match(texte, /notes/); assert.match(texte, /baie réorganisée/);
  await page.fill('#audit-filtre', 'tech'); await page.waitForFunction(() => !document.querySelector('#audit-list .a-row') || [...document.querySelectorAll('#audit-list .a-row')].every(r => /tech/.test(r.textContent)), null, { timeout: 4000 });
  assert.strictEqual(await page.locator('#audit-list .a-row', { hasText: 'SW-A1-ACC-01' }).count(), 0, 'le filtre par personne s\'applique');
}, S);
test('Sauvegardes : l\'administrateur sauvegarde, puis restaure l\'inventaire après une erreur', async page => {
  const ouvrir = async () => { await page.click('#user-chip'); await page.click('[data-act=compte-sauvegardes]'); await page.waitForSelector('#sv-reglages b'); };
  await ouvrir();
  assert.match(await page.locator('#sv-reglages').innerText(), /chaque jour à 02:30/);
  await page.click('[data-act=sv-creer]'); await page.waitForSelector('#sv-list .sv-row:has-text("Manuelle")');
  assert.match(await page.locator('#sv-list .sv-row:has-text("Manuelle") a[download]').getAttribute('href'), /^\/api\/v1\/sauvegardes\/netcarto-[\w-]+-manuelle\.sqlite$/);
  await page.click('[data-act=modal-close]');
  const dev = await page.evaluate(() => { const x = NetCarto.Store.db.devices.find(d => d.hostname === 'SW-A1-ACC-01'); NetCarto.select(x.id); return x; });
  await page.click('#detail [data-act=dev-edit]'); await page.fill('.modal [name=hostname]', 'NOM-FAUX'); await page.click('[data-act=modal-ok]'); await synchro(page);
  assert.strictEqual((await api(page, '/equipements/' + dev.id)).json.hostname, 'NOM-FAUX');
  await ouvrir(); await page.click('#sv-list .sv-row:has-text("Manuelle") [data-act=sv-restaurer]');
  assert.match(await page.locator('.modal .body').innerText(), /comptes et le journal d'audit sont conservés/);
  await page.click('[data-act=modal-ok]'); await page.waitForSelector('.toast.ok:has-text("restauré")');
  assert.strictEqual(await page.evaluate(i => NetCarto.Store.idx.id.get(i).hostname, dev.id), 'SW-A1-ACC-01', 'l\'écran montre les données restaurées');
  assert.strictEqual((await api(page, '/equipements/' + dev.id)).json.hostname, 'SW-A1-ACC-01');
  await page.waitForSelector('#sv-list .sv-row:has-text("Avant restauration")');
}, S);
test('Comptes : session expirée en cours de travail → on se reconnecte sans perdre la page', async page => {
  const dev = await page.evaluate(() => { const x = NetCarto.Store.db.devices.find(d => d.hostname === 'SW-A1-ACC-01'); NetCarto.select(x.id); return x; });
  await api(page, '/session', 'DELETE');
  await page.click('#detail [data-act=dev-edit]'); await page.fill('.modal [name=notes]', 'après expiration'); await page.click('[data-act=modal-ok]');
  await page.waitForSelector('#auth form[data-mode=connexion]');
  assert.match(await page.locator('#auth').innerText(), /session a expiré/i);
  await page.fill('#auth [name=identifiant]', 'admin'); await page.fill('#auth [name=motDePasse]', MDP); await page.click('#auth button[type=submit]');
  await page.waitForFunction(() => !document.querySelector('#auth'));
  assert.strictEqual(await page.evaluate(i => NetCarto.Store.idx.id.get(i).notes, dev.id), dev.notes, 'la modification refusée n\'est pas restée à l\'écran');
  assert.strictEqual((await api(page, '/equipements/' + dev.id)).json.notes, dev.notes);
}, { serveur: true, erreursAttendues: /401/ });

(async () => {
  const srv = await serveur(), base = `http://127.0.0.1:${srv.address().port}/`;
  const nav = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const filtre = process.argv[2];
  let echecs = 0, faits = 0;
  for (const { nom, fn, opts } of tests) {
    if (filtre && !nom.toLowerCase().includes(filtre.toLowerCase())) continue;
    const ctx = await nav.newContext({ viewport: opts.mobile ? { width: 390, height: 800 } : { width: 1600, height: 900 }, hasTouch: !!opts.mobile, isMobile: !!opts.mobile, acceptDownloads: true });
    const page = await ctx.newPage(), erreurs = [];
    // En mode serveur : un vrai serveur NetCarto, sur un dossier de données jetable, avec le jeu de démonstration
    let app = null, dossier = null, adresse = base;
    if (opts.serveur) {
      dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'netcarto-e2e-'));
      app = await demarrer({ serveur: { hote: '127.0.0.1', port: 0 }, donnees: { dossier }, web: { dossier: RACINE }, https: { actif: false }, supervision: { intervalle: 30, sources: opts.supervision || [] }, demo: true }, { journal: () => {} });
      adresse = `http://127.0.0.1:${app.port}/`;
      // Trois comptes de test ; la page s'ouvre déjà connectée (administrateur par défaut), sauf demande contraire
      if (!opts.sansComptes) {
        for (const [identifiant, role] of [['admin', 'administrateur'], ['tech', 'technicien'], ['lecteur', 'lecture']]) await app.securite.creerUtilisateur({ identifiant, nom: 'Compte ' + identifiant, role, motDePasse: MDP });
        if (opts.compte !== null) {
          const r = await fetch(adresse + 'api/v1/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiant: opts.compte || 'admin', motDePasse: MDP }) });
          await ctx.addCookies([{ name: 'netcarto_session', value: r.headers.getSetCookie()[0].split(';')[0].split('=')[1], url: adresse }]);
        }
      }
    }
    if (opts.sansStockage) await page.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('bloqué'); } }); Storage.prototype.setItem = () => { throw new Error('bloqué'); }; });
    page.on('console', m => { if (m.type() === 'error' && !(opts.sansThree && /ERR_FAILED|Failed to load/.test(m.text())) && !(opts.erreursAttendues && opts.erreursAttendues.test(m.text()))) erreurs.push(m.text()); });
    page.on('pageerror', e => erreurs.push(e.message));
    // Aucune sortie vers Internet : toute adresse extérieure est notée, puis coupée (le test « Sans Internet » vérifie qu'il n'y en a pas)
    const requetes = [];
    page.on('request', r => requetes.push(r.url()));
    await ctx.route(u => !['127.0.0.1', 'localhost'].includes(u.hostname) && /^https?:$/.test(u.protocol), r => r.abort());
    if (opts.sansThree) await page.route('**/js/vendor/three/**', r => r.abort());
    faits++;
    try {
      const reponse = await page.goto(adresse); await page.waitForFunction(() => window.NetCarto?.Store.db || document.querySelector('#auth form'), null, { timeout: 15000 });
      await fn(page, { app, requetes, reponse });
      assert.deepStrictEqual(erreurs, [], 'erreurs dans la console du navigateur');
      console.log('  ok    ' + nom);
    } catch (e) { echecs++; console.log('  ÉCHEC ' + nom + '\n        ' + String(e.message).split('\n').slice(0, 3).join('\n        ')); }
    await ctx.close();
    if (app) { await app.arreter(); fs.rmSync(dossier, { recursive: true, force: true }); }
  }
  await nav.close(); srv.close();
  console.log(echecs ? `\n${echecs} test(s) en échec sur ${faits}` : `\n${faits} tests réussis`);
  process.exit(echecs ? 1 : 0);
})();
