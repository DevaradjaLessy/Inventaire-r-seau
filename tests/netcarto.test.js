/* Tests de bout en bout de NetCarto. Lancer avec : npm test (dans le dossier tests/).
   - L'application est servie par un petit serveur HTTP local (les modules ne se chargent pas en file://).
   - Three.js est servi depuis node_modules s'il est installé (utile quand le CDN est bloqué) ;
     le dossier peut aussi être indiqué par la variable NETCARTO_THREE.
   - Chaque scénario repart d'une page neuve, donc du jeu de démonstration d'origine. */
'use strict';
const assert = require('assert'), http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const RACINE = path.join(__dirname, '..');
const THREE = [process.env.NETCARTO_THREE, path.join(__dirname, 'node_modules', 'three')].find(d => d && fs.existsSync(d));
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
test('Sans CDN : l\'application reste utilisable, la 3D prévient', async page => {
  await choisir(page, 'BAIE-A0-01'); await page.waitForTimeout(600);
  assert.match(await page.$eval('#r3d-canvas', e => e.innerText), /Vue 3D indisponible/);
  assert.ok(await page.$$eval('.eu.dev', a => a.length) > 5);
}, { sansCdn: true });
test('Téléphone : pas de débordement, arbre et fiche en volets', async page => {
  await page.evaluate(() => NetCarto.select(NetCarto.Store.db.floors[1].id));
  assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.tap('[data-p=tree]'); assert.ok(await page.isVisible('#tree'));
  for (const t of ['inv', 'mat', 'dash']) { await page.tap(`[data-tab=${t}]`); assert.strictEqual(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, t); }
}, { mobile: true });

(async () => {
  const srv = await serveur(), base = `http://127.0.0.1:${srv.address().port}/`;
  const nav = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const filtre = process.argv[2];
  let echecs = 0, faits = 0;
  for (const { nom, fn, opts } of tests) {
    if (filtre && !nom.toLowerCase().includes(filtre.toLowerCase())) continue;
    const ctx = await nav.newContext({ viewport: opts.mobile ? { width: 390, height: 800 } : { width: 1600, height: 900 }, hasTouch: !!opts.mobile, isMobile: !!opts.mobile, acceptDownloads: true });
    const page = await ctx.newPage(), erreurs = [];
    page.on('console', m => { if (m.type() === 'error' && !(opts.sansCdn && /ERR_FAILED|Failed to load/.test(m.text()))) erreurs.push(m.text()); });
    page.on('pageerror', e => erreurs.push(e.message));
    if (opts.sansCdn) await page.route('https://cdn.jsdelivr.net/**', r => r.abort());
    else if (THREE) await page.route('https://cdn.jsdelivr.net/npm/three@0.160.0/**', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(THREE, r.request().url().split('three@0.160.0/')[1])) }));
    faits++;
    try {
      await page.goto(base); await page.waitForFunction(() => window.NetCarto, null, { timeout: 15000 });
      await fn(page);
      assert.deepStrictEqual(erreurs, [], 'erreurs dans la console du navigateur');
      console.log('  ok    ' + nom);
    } catch (e) { echecs++; console.log('  ÉCHEC ' + nom + '\n        ' + String(e.message).split('\n').slice(0, 3).join('\n        ')); }
    await ctx.close();
  }
  await nav.close(); srv.close();
  console.log(echecs ? `\n${echecs} test(s) en échec sur ${faits}` : `\n${faits} tests réussis`);
  process.exit(echecs ? 1 : 0);
})();
