/* Tests de l'API HTTP et du service des fichiers de l'interface. */
'use strict';
const test = require('node:test'), assert = require('node:assert'), path = require('path');
const { MDP, cookieDe, dossierTemporaire, demo, requete, serveurDeTest } = require('./aide');

/* Serveur de test, avec une fonction « appel » qui envoie les requêtes au nom de l'administrateur */
async function serveur(t, extra = {}) {
  const s = await serveurDeTest(t, { dossier: extra.dossier, config: extra.config });
  return { ...s, appel: (methode, url, corps, entetes = {}) => requete(methode, url, corps, { ...s.admin, ...entetes }) };
}

test('informations, santé et base de départ', async t => {
  const { api, appel } = await serveur(t);
  const info = await appel('GET', api + '/info');
  assert.strictEqual(info.code, 200); assert.deepStrictEqual([info.json.app, info.json.mode, info.json.schema], ['NetCarto', 'serveur', 5]);
  assert.match(info.entetes['content-type'], /application\/json/); assert.strictEqual(info.entetes['cache-control'], 'no-store');
  assert.deepStrictEqual((await requete('GET', api + '/sante')).json, { ok: true, base: 'ok' });
  const b = (await appel('GET', api + '/base')).json;
  assert.deepStrictEqual([b.sites.length, b.catalog.length, b.vlans.length, b.meta.demo], [0, 38, 8, false]);
});

test('remplacer la base, puis appliquer un lot ; refus sans effet en cas de doublon', async t => {
  const { api, appel } = await serveur(t), d = await demo();
  const r = await appel('PUT', api + '/base', d);
  assert.strictEqual(r.code, 200, r.texte); assert.ok(r.json.revision > 0);
  assert.strictEqual((await appel('GET', api + '/revision')).json.revision, r.json.revision);
  const [a, b] = d.devices.filter(x => x.ip);
  const ok = await appel('POST', api + '/lots', { type: 'edit', changements: [{ collection: 'devices', op: 'modifier', cle: a.id, avant: a, apres: { ...a, notes: 'via API' } }] });
  assert.strictEqual(ok.code, 200, ok.texte); assert.strictEqual(ok.json.revision, r.json.revision + 1);
  const lu = await appel('GET', `${api}/equipements/${a.id}`);
  assert.strictEqual(lu.json.notes, 'via API');
  const doublon = await appel('POST', api + '/lots', { changements: [{ collection: 'devices', op: 'modifier', cle: a.id, avant: lu.json, apres: { ...lu.json, ip: b.ip } }] });
  assert.strictEqual(doublon.code, 422); assert.match(doublon.json.erreur, /adresse IP/i); assert.strictEqual(doublon.json.code, 'regle');
  const conflit = await appel('POST', api + '/lots', { changements: [{ collection: 'devices', op: 'modifier', cle: a.id, avant: a, apres: { ...a, notes: 'écrase ?' } }] });
  assert.strictEqual(conflit.code, 409); assert.strictEqual(conflit.json.code, 'conflit');
  assert.strictEqual((await appel('GET', `${api}/equipements/${a.id}`)).json.notes, 'via API');
});

test('lecture des ressources : listes, filtres, élément, erreurs', async t => {
  const { api, appel } = await serveur(t), d = await demo();
  await appel('PUT', api + '/base', d);
  for (const [res, col] of [['sites', 'sites'], ['batiments', 'buildings'], ['etages', 'floors'], ['pieces', 'rooms'], ['baies', 'racks'], ['equipements', 'devices'], ['ports', 'ports'], ['prises', 'outlets'], ['cables', 'cables'], ['catalogue', 'catalog'], ['stock', 'stock'], ['vlans', 'vlans'], ['journal', 'history']]) {
    const r = await appel('GET', `${api}/${res}`);
    assert.strictEqual(r.code, 200, res); assert.strictEqual(r.json.length, d[col].length, res);
  }
  const sw = d.devices.find(x => x.hostname === 'SW-A1-ACC-01');
  assert.strictEqual((await appel('GET', `${api}/ports?deviceId=${sw.id}`)).json.length, 52);
  assert.strictEqual((await appel('GET', `${api}/equipements?hostname=SW-A1-ACC-01`)).json[0].id, sw.id);
  assert.strictEqual((await appel('GET', `${api}/vlans/20`)).json.name, 'VOIX');
  assert.strictEqual((await appel('GET', `${api}/stock/cat-pp24`)).json.available, 0);
  assert.strictEqual((await appel('GET', `${api}/equipements/dev-absent`)).code, 404);
  assert.strictEqual((await appel('GET', `${api}/equipements?champInconnu=1`)).code, 400);
  assert.strictEqual((await appel('GET', `${api}/inexistant`)).code, 404);
});

test('requêtes refusées : méthode, type de contenu, JSON invalide, corps trop gros', async t => {
  const { api, appel } = await serveur(t, { config: { limites: { corpsMaxMo: 1 } } });
  assert.strictEqual((await appel('DELETE', api + '/base')).code, 405);
  // Écriture venue d'une page d'un autre site : refusée ; depuis la page de NetCarto elle-même : acceptée
  assert.strictEqual((await appel('POST', api + '/lots', { changements: [] }, { Origin: 'http://site-malveillant.test' })).code, 403);
  assert.strictEqual((await appel('POST', api + '/lots', { changements: [] }, { Origin: api.replace('/api/v1', '') })).code, 200);
  assert.strictEqual((await appel('POST', api + '/lots', '{"changements":[]}', { 'Content-Type': 'text/plain' })).code, 415);
  const mauvais = await appel('POST', api + '/lots', '{pas du json');
  assert.strictEqual(mauvais.code, 400); assert.match(mauvais.json.erreur, /JSON/);
  assert.strictEqual((await appel('POST', api + '/lots', { changements: 'non' })).code, 400);
  assert.strictEqual((await appel('PUT', api + '/base', { meta: { app: 'Autre' } })).code, 400);
  const gros = await appel('POST', api + '/lots', { changements: [], bourrage: 'x'.repeat(1.5 * 1024 * 1024) }).catch(e => ({ code: e.code === 'ECONNRESET' || e.code === 'EPIPE' ? 413 : 0 }));
  assert.strictEqual(gros.code, 413);
});

test('fichiers de l\'interface : servis avec l\'adresse de l\'API, sans exposer le reste du dépôt', async t => {
  const { base } = await serveur(t);
  const page = await requete('GET', base + '/');
  assert.strictEqual(page.code, 200); assert.match(page.texte, /<meta name="netcarto-api" content="\/api\/v1">/);
  assert.match(page.entetes['content-type'], /text\/html/); assert.ok(page.entetes['x-content-type-options'] === 'nosniff');
  assert.strictEqual((await requete('GET', base + '/js/main.js')).code, 200);
  assert.strictEqual((await requete('GET', base + '/css/style.css')).code, 200);
  for (const interdit of ['/serveur/netcarto.js', '/serveur/package.json', '/connecteurs/serveur.js', '/.git/config', '/SUIVI.md', '/tests/netcarto.test.js', '/js/%2e%2e/serveur/app.js', '/js/..%2f..%2fserveur/app.js'])
    assert.notStrictEqual((await requete('GET', base + interdit)).code, 200, interdit);
});

test('supervision : l\'ancien relais est un module du serveur', async t => {
  const { api, appel } = await serveur(t, { config: { supervision: { intervalle: 30, sources: [{ type: 'simulation', devices: [{ ip: '10.10.99.18', hostname: 'SW-A1-ACC-01', ports: ['Gi1/0/1', 'Gi1/0/2'] }] }] } } });
  const e = await appel('GET', api + '/supervision/etat');
  assert.strictEqual(e.code, 200); assert.deepStrictEqual([e.json.version, e.json.devices.length, e.json.devices[0].ports.length], [1, 1, 2]);
  assert.strictEqual((await appel('GET', api + '/supervision/sante')).json.sources[0].ok, true);
});

test('les données persistent d\'un démarrage à l\'autre', async t => {
  const dossier = dossierTemporaire(t), d = await demo();
  const un = await serveurDeTest({ after() {} }, { dossier });
  await requete('PUT', un.api + '/base', d, un.admin); await un.app.arreter();
  const { api, appel } = await serveur(t, { dossier });
  assert.strictEqual((await appel('GET', api + '/equipements')).json.length, 102);
  assert.ok(require('fs').existsSync(path.join(dossier, 'netcarto.sqlite')));
});

/* Un script ou un agent (un autre Claude, par exemple) remplit l'inventaire sans navigateur : il se connecte avec un compte
   de technicien qui lui est réservé, lit le catalogue, puis crée les lieux et le matériel par lots. C'est le chemin décrit
   dans README.md, « Remplir NetCarto depuis un script ou un agent ». */
test('client automatisé : connexion par un compte dédié, création d\'un site complet par lots, relecture, traces', async t => {
  const s = await serveurDeTest(t);
  await s.app.securite.creerUtilisateur({ identifiant: 'agent-saisie', nom: 'Agent de saisie', role: 'technicien', motDePasse: MDP });
  // 1. Connexion : le cookie de session rendu sert aux requêtes suivantes. Aucun en-tête de navigateur n'est nécessaire.
  const session = await requete('POST', s.api + '/session', { identifiant: 'agent-saisie', motDePasse: MDP });
  assert.strictEqual(session.code, 200); const moi = cookieDe(session);
  // 2. Lecture du catalogue pour choisir les modèles
  const catalogue = (await requete('GET', s.api + '/catalogue', undefined, moi)).json;
  const baie = catalogue.find(c => c.category === 'rack'), sw = catalogue.find(c => c.model === 'EX4000-48P');
  assert.ok(baie && sw, 'le catalogue de départ contient une baie et le switch EX4000-48P');
  // 3. Un site entier en un seul lot : tout passe, ou rien
  const creer = (collection, apres) => ({ collection, op: 'creer', cle: apres.id, apres });
  const port = i => ({ id: 'p-agent-' + i, deviceId: 'dev-agent-1', idx: i, name: 'ge-0/0/' + i, kind: 'rj45', role: 'access', speed: 1000, status: 'down', vlan: 1, poe: { capable: true, watts: 0 }, mac: '', connected: '', description: '' });
  const lot = { type: 'add', changements: [
    creer('sites', { id: 'site-agent', name: 'Site pilote', code: 'PIL', address: '1 rue de l\'Exemple, 00000 Villefictive' }),
    creer('buildings', { id: 'bld-agent', siteId: 'site-agent', code: 'P', name: 'Bâtiment pilote' }),
    creer('floors', { id: 'flr-agent', buildingId: 'bld-agent', level: 0, name: 'RDC', width: 30, height: 20, planImage: '' }),
    creer('rooms', { id: 'room-agent', floorId: 'flr-agent', name: 'Local technique', type: 'tech', x: 2, y: 2, w: 6, h: 5 }),
    creer('racks', { id: 'rack-agent', roomId: 'room-agent', catalogId: baie.id, name: 'BAIE-PIL-01', heightU: baie.heightU || 42, x: 3, y: 3, serial: '', installDate: '2026-11-25', status: 'active' }),
    creer('devices', { id: 'dev-agent-1', catalogId: sw.id, hostname: 'SW-PIL-01', rackId: 'rack-agent', u: 40, roomId: null, x: null, y: null, serial: '', ip: '10.20.0.10', mac: '', firmware: '', installDate: '2026-11-25', status: 'active', notes: 'Créé par l\'API' }),
    ...[0, 1, 2].map(i => creer('ports', port(i))),
    // Une entrée d'historique donne son libellé à l'opération : elle s'affiche dans « Dernières actions » et titre le lot au journal d'audit
    creer('history', { id: 'h-agent-1', ts: Date.now(), type: 'add', text: 'Site pilote créé par l\'agent de saisie', ref: 'site-agent' }),
  ] };
  const pose = await requete('POST', s.api + '/lots', lot, moi);
  assert.strictEqual(pose.code, 200, pose.texte); assert.ok(pose.json.revision > 0);
  // 4. Relecture par les routes de consultation, avec un filtre
  const lu = (await requete('GET', s.api + '/equipements?hostname=SW-PIL-01', undefined, moi)).json;
  assert.deepStrictEqual(lu.map(d => [d.id, d.rackId, d.ip]), [['dev-agent-1', 'rack-agent', '10.20.0.10']]);
  assert.strictEqual((await requete('GET', s.api + '/ports?deviceId=dev-agent-1', undefined, moi)).json.length, 3);
  // 5. Une erreur est expliquée, et le lot fautif n'écrit rien : même adresse IP qu'un équipement existant
  const refus = await requete('POST', s.api + '/lots', { type: 'add', changements: [creer('sites', { id: 'site-agent-2', name: 'Autre site', code: 'X', address: '' }), creer('devices', { id: 'dev-agent-2', catalogId: sw.id, hostname: 'SW-PIL-02', rackId: 'rack-agent', u: 38, roomId: null, x: null, y: null, serial: '', ip: '10.20.0.10', mac: '', firmware: '', installDate: '2026-11-25', status: 'active', notes: '' })] }, moi);
  assert.strictEqual(refus.code, 422); assert.match(refus.json.erreur, /adresse IP/i);
  assert.strictEqual((await requete('GET', s.api + '/sites/site-agent-2', undefined, moi)).code, 404, 'le site du lot refusé n\'a pas été créé');
  // 6. Tout est tracé au nom du compte de l'agent
  const audit = (await requete('GET', s.api + '/audit?identifiant=agent-saisie&limite=50', undefined, s.admin)).json;
  assert.ok(audit.some(a => a.action === 'operation' && /Site pilote créé/.test(a.libelle)), 'le lot a sa ligne au journal');
  assert.ok(audit.some(a => a.collection === 'devices' && a.cle === 'dev-agent-1'));
  // 7. Le compte de l'agent ne peut pas gérer les comptes ni remplacer la base
  assert.strictEqual((await requete('GET', s.api + '/utilisateurs', undefined, moi)).code, 403);
});
