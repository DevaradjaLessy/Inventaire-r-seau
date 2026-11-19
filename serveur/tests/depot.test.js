/* Tests de la couche d'accès aux données : schéma, migrations, lecture, lots de modifications, contraintes. */
'use strict';
const test = require('node:test'), assert = require('node:assert'), path = require('path'), fs = require('fs');
const { ouvrirBase, ErreurMetier } = require('../donnees');
const { dossierTemporaire, demo, depart, parCle } = require('./aide');

const COLLECTIONS = ['vlans', 'sites', 'buildings', 'floors', 'rooms', 'racks', 'devices', 'ports', 'outlets', 'cables', 'catalog', 'stock', 'history'];
const cleDe = c => (c === 'stock' ? 'catalogId' : 'id');
async function baseDemo(t) {
  const depot = ouvrirBase({ fichier: path.join(dossierTemporaire(t), 'netcarto.sqlite') });
  t.after(() => depot.fermer());
  const d = await demo();
  depot.remplacerBase(d);
  return { depot, d };
}
/* Attend une ErreurMetier d'un code donné, dont le message correspond */
function refuse(fn, code, motif) {
  assert.throws(fn, e => { assert.ok(e instanceof ErreurMetier, `ErreurMetier attendue, reçu : ${e.message}`); assert.strictEqual(e.code, code, e.message); if (motif) assert.match(e.message, motif); return true; });
}
const changer = (collection, avant, modifs) => ({ collection, op: 'modifier', cle: avant[cleDe(collection)], avant, apres: { ...avant, ...modifs } });

test('une base neuve reçoit le schéma et le modèle de départ, sans aucun site', async t => {
  const fichier = path.join(dossierTemporaire(t), 'netcarto.sqlite');
  const depot = ouvrirBase({ fichier, depart: await depart() });
  const b = depot.lireBase();
  assert.deepStrictEqual([b.meta.app, b.meta.demo, b.sites.length, b.devices.length], ['NetCarto', false, 0, 0]);
  assert.strictEqual(b.catalog.length, 34); assert.strictEqual(b.vlans.length, 8);
  assert.ok(b.stock.length === 34 && b.stock.every(s => s.available === 0));
  assert.strictEqual(depot.versionSchema(), 2);
  depot.fermer();
  // Réouverture : rien n'est recréé ni perdu, les migrations ne sont pas rejouées
  const d2 = ouvrirBase({ fichier, depart: await depart() });
  assert.strictEqual(d2.lireBase().catalog.length, 34); assert.strictEqual(d2.versionSchema(), 2);
  d2.fermer();
});

test('le jeu de démonstration fait un aller-retour exact par les tables', async t => {
  const { depot, d } = await baseDemo(t);
  const b = depot.lireBase();
  for (const c of COLLECTIONS) assert.deepStrictEqual(parCle(b[c], cleDe(c)), parCle(d[c], cleDe(c)), `collection ${c}`);
  assert.strictEqual(b.meta.demo, true);
  // Ordres utiles à l'affichage : ports par rang, journal du plus récent au plus ancien
  const dev = b.devices.find(x => x.hostname === 'SW-A1-ACC-01');
  assert.deepStrictEqual(b.ports.filter(p => p.deviceId === dev.id).map(p => p.idx), [...Array(52).keys()]);
  assert.ok(b.history.every((h, i) => i === 0 || b.history[i - 1].ts >= h.ts));
});

test('installer un équipement : équipement, ports et stock dans une seule transaction', async t => {
  const { depot, d } = await baseDemo(t);
  const rack = d.racks.find(r => r.name === 'BAIE-A2-01'), stock = d.stock.find(s => s.catalogId === 'cat-c9200l-24p-4g');
  const dev = { id: 'dev-test1', catalogId: 'cat-c9200l-24p-4g', hostname: 'SW-TEST-01', rackId: rack.id, u: 20, roomId: null, x: null, y: null, serial: '', ip: '10.10.99.200', mac: '', firmware: '', installDate: '2026-11-19', status: 'active', notes: '' };
  const port = i => ({ id: 'p-test' + i, deviceId: dev.id, idx: i, name: 'Gi1/0/' + (i + 1), kind: 'rj45', role: 'access', speed: 1000, status: 'down', vlan: 1, poe: { capable: true, watts: 0 }, mac: '', connected: '', description: '' });
  const lot = { type: 'add', changements: [{ collection: 'devices', op: 'creer', cle: dev.id, apres: dev }, ...[0, 1, 2].map(i => ({ collection: 'ports', op: 'creer', cle: 'p-test' + i, apres: port(i) })), changer('stock', stock, { available: stock.available - 1 })] };
  const rev = depot.revision();
  const r = depot.appliquerLot(lot);
  assert.strictEqual(r.revision, rev + 1);
  assert.deepStrictEqual(depot.lire('devices', dev.id), dev);
  assert.strictEqual(depot.lister('ports', { deviceId: dev.id }).length, 3);
  assert.strictEqual(depot.lire('stock', stock.catalogId).available, stock.available - 1);
  // Même opération avec une IP déjà prise : tout est refusé, y compris les ports et le stock
  const dev2 = { ...dev, id: 'dev-test2', hostname: 'SW-TEST-02', u: 22 }, s2 = depot.lire('stock', stock.catalogId);
  refuse(() => depot.appliquerLot({ type: 'add', changements: [{ collection: 'ports', op: 'creer', cle: 'p-x', apres: { ...port(0), id: 'p-x', deviceId: dev2.id } }, changer('stock', s2, { available: s2.available - 1 }), { collection: 'devices', op: 'creer', cle: dev2.id, apres: dev2 }] }), 'regle', /adresse IP/i);
  assert.strictEqual(depot.lire('devices', dev2.id), null); assert.strictEqual(depot.lire('ports', 'p-x'), null);
  assert.strictEqual(depot.lire('stock', stock.catalogId).available, s2.available);
  assert.strictEqual(depot.revision(), rev + 1);
});

test('unicité : IP, MAC, nom d\'hôte, repère de prise, nom de baie', async t => {
  const { depot, d } = await baseDemo(t);
  const [a, b] = d.devices.filter(x => x.ip && x.mac);
  refuse(() => depot.appliquerLot({ changements: [changer('devices', a, { ip: b.ip })] }), 'regle', /adresse IP/i);
  refuse(() => depot.appliquerLot({ changements: [changer('devices', a, { mac: b.mac.toUpperCase() })] }), 'regle', /adresse MAC/i);
  refuse(() => depot.appliquerLot({ changements: [changer('devices', a, { hostname: b.hostname.toLowerCase() })] }), 'regle', /nom d'hôte/i);
  refuse(() => depot.appliquerLot({ changements: [changer('outlets', d.outlets[0], { label: d.outlets[1].label })] }), 'regle', /repère/i);
  refuse(() => depot.appliquerLot({ changements: [changer('racks', d.racks[0], { name: d.racks[1].name })] }), 'regle', /baie/i);
  // Un équipement hors service libère son IP et son nom
  depot.appliquerLot({ changements: [changer('devices', b, { status: 'retired', rackId: null, u: null, roomId: null, x: null, y: null })] });
  depot.appliquerLot({ changements: [changer('devices', a, { ip: b.ip })] });
  assert.strictEqual(depot.lire('devices', a.id).ip, b.ip);
});

test('clés étrangères et valeurs contrôlées', async t => {
  const { depot, d } = await baseDemo(t);
  const piece = d.rooms.find(r => d.racks.some(k => k.roomId === r.id));
  refuse(() => depot.appliquerLot({ changements: [{ collection: 'rooms', op: 'supprimer', cle: piece.id, avant: piece }] }), 'regle', /encore référencé|contient encore/i);
  refuse(() => depot.appliquerLot({ changements: [changer('devices', d.devices[0], { status: 'inconnu' })] }), 'regle');
  refuse(() => depot.appliquerLot({ changements: [changer('stock', d.stock[0], { available: -1 })] }), 'regle', /stock/i);
  refuse(() => depot.appliquerLot({ changements: [changer('ports', d.ports[0], { deviceId: 'dev-absent' })] }), 'regle', /référence/i);
  refuse(() => depot.appliquerLot({ changements: [{ collection: 'inconnue', op: 'creer', cle: 'x', apres: {} }] }), 'invalide');
  refuse(() => depot.appliquerLot({ changements: [{ collection: 'sites', op: 'creer', cle: 'site-x', apres: { id: 'site-x' } }] }), 'invalide', /name/);
  refuse(() => depot.appliquerLot({ changements: [{ collection: 'sites', op: 'creer', cle: 'a b"c', apres: { id: 'a b"c', name: 'X', code: '', address: '' } }] }), 'invalide', /identifiant/i);
});

test('modifications concurrentes : la valeur « avant » doit correspondre à la base', async t => {
  const { depot, d } = await baseDemo(t);
  const dev = d.devices.find(x => x.hostname === 'SW-A1-ACC-01');
  depot.appliquerLot({ changements: [changer('devices', dev, { notes: 'modifié par Alice' })] });
  // Bob part de l'ancienne valeur : refus, rien n'est écrasé
  refuse(() => depot.appliquerLot({ changements: [changer('devices', dev, { notes: 'modifié par Bob' })] }), 'conflit', /SW-A1-ACC-01|modifié entre-temps/i);
  assert.strictEqual(depot.lire('devices', dev.id).notes, 'modifié par Alice');
  refuse(() => depot.appliquerLot({ changements: [{ collection: 'devices', op: 'creer', cle: dev.id, apres: dev }] }), 'conflit');
  refuse(() => depot.appliquerLot({ changements: [{ collection: 'sites', op: 'supprimer', cle: 'site-absent', avant: { id: 'site-absent', name: 'X', code: '', address: '' } }] }), 'conflit');
});

test('règles vérifiées par le serveur : chevauchement en baie, câbles en trop, pièce hors de l\'étage', async t => {
  const { depot, d } = await baseDemo(t);
  const sw = d.devices.find(x => x.hostname === 'SW-A1-ACC-01'), pp = d.devices.find(x => x.hostname === 'PP-A1-01');
  refuse(() => depot.appliquerLot({ changements: [changer('devices', pp, { u: sw.u })] }), 'regle', /U38|chevauche/i);
  refuse(() => depot.appliquerLot({ changements: [changer('devices', pp, { u: 60 })] }), 'regle', /dépasse|hauteur/i);
  const cab = d.cables.find(c => c.type === 'patch' && c.b.startsWith('p-')), autre = d.outlets.find(o => !d.cables.some(c => c.a === o.id && c.b.startsWith('p-') === false));
  refuse(() => depot.appliquerLot({ changements: [{ collection: 'cables', op: 'creer', cle: 'cab-x', apres: { id: 'cab-x', a: d.outlets[0].id, b: cab.b, type: 'patch', length: 1, color: '#3987e5', label: '' } }] }), 'regle', /câble/i);
  const piece = d.rooms[0];
  refuse(() => depot.appliquerLot({ changements: [changer('rooms', piece, { x: 500 })] }), 'regle', /étage/i);
  assert.ok(autre);
});

test('remplacement complet : tout ou rien, et lecture filtrée', async t => {
  const { depot, d } = await baseDemo(t);
  const casse = JSON.parse(JSON.stringify(d)); casse.ports[5].deviceId = 'dev-absent';
  refuse(() => depot.remplacerBase(casse), 'regle');
  assert.strictEqual(depot.lireBase().devices.length, d.devices.length);
  const b = d.buildings[0];
  assert.strictEqual(depot.lister('floors', { buildingId: b.id }).length, d.floors.filter(f => f.buildingId === b.id).length);
  assert.strictEqual(depot.lister('devices', { status: 'fault' }).length, d.devices.filter(x => x.status === 'fault').length);
  refuse(() => depot.lister('devices', { colonneInconnue: 'x' }), 'invalide');
  assert.strictEqual(depot.lire('sites', 'site-absent'), null);
});

test('les données survivent à la fermeture, dans le dossier indiqué', async t => {
  const dossier = dossierTemporaire(t), fichier = path.join(dossier, 'sous-dossier', 'netcarto.sqlite');
  const a = ouvrirBase({ fichier }); a.remplacerBase(await demo()); const rev = a.revision(); a.fermer();
  assert.ok(fs.existsSync(fichier));
  const b = ouvrirBase({ fichier });
  assert.strictEqual(b.lireBase().devices.length, 102); assert.strictEqual(b.revision(), rev);
  b.fermer();
});
