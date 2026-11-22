/* Tests des comptes : mots de passe, connexion, verrouillage, sessions, rôles, gestion des utilisateurs, journal d'audit. */
'use strict';
const test = require('node:test'), assert = require('node:assert'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { hacher, verifier, controlerMotDePasse } = require('../securite/mots-de-passe');
const { MDP, dossierTemporaire, demo, requete, cookieDe, serveurDeTest } = require('./aide');

test('mot de passe : 12 caractères au moins, hachage fort et salé', async () => {
  assert.match(controlerMotDePasse('trop-court', 'alice'), /12 caractères/);
  assert.match(controlerMotDePasse('alice-alice-alice', 'alice'), /identifiant/);
  assert.match(controlerMotDePasse('aaaaaaaaaaaaaaaa', 'alice'), /trop simple/);
  assert.strictEqual(controlerMotDePasse('Un-vrai-mot-de-passe', 'alice'), null);
  const h1 = await hacher(MDP), h2 = await hacher(MDP);
  assert.match(h1, /^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/); assert.notStrictEqual(h1, h2);
  assert.ok(!h1.includes(MDP));
  assert.strictEqual(await verifier(MDP, h1), true); assert.strictEqual(await verifier(MDP + 'x', h1), false); assert.strictEqual(await verifier(MDP, 'n-importe-quoi'), false);
});

test('première ouverture : le compte administrateur se crée avec le code affiché au démarrage', async t => {
  const { api, app } = await serveurDeTest(t, { comptes: false });
  assert.deepStrictEqual((await requete('GET', api + '/session')).json, { connecte: false, initialisation: true, recuperationParCourriel: false });
  assert.match(app.codeInitialisation, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.strictEqual((await requete('GET', api + '/base')).code, 401);
  const corps = { identifiant: 'chef', nom: 'Chef de projet', motDePasse: MDP };
  assert.strictEqual((await requete('POST', api + '/initialisation', { ...corps, code: 'AAAA-AAAA-AAAA' })).code, 403);
  assert.strictEqual((await requete('POST', api + '/initialisation', { ...corps, code: app.codeInitialisation, motDePasse: 'court' })).code, 422);
  const ok = await requete('POST', api + '/initialisation', { ...corps, code: app.codeInitialisation });
  assert.strictEqual(ok.code, 200, ok.texte);
  const s = await requete('GET', api + '/session', undefined, cookieDe(ok));
  assert.deepStrictEqual([s.json.connecte, s.json.utilisateur.identifiant, s.json.utilisateur.role, s.json.initialisation], [true, 'chef', 'administrateur', false]);
  // Une fois le premier compte créé, la porte est fermée
  assert.strictEqual((await requete('POST', api + '/initialisation', { ...corps, identifiant: 'intrus', code: app.codeInitialisation })).code, 403);
  assert.strictEqual(app.codeInitialisation, null);
});

test('connexion, session et déconnexion', async t => {
  const { api } = await serveurDeTest(t);
  assert.strictEqual((await requete('GET', api + '/base')).code, 401);
  const ko = await requete('POST', api + '/session', { identifiant: 'admin', motDePasse: 'Mauvais-mot-de-passe' });
  const inconnu = await requete('POST', api + '/session', { identifiant: 'personne', motDePasse: MDP });
  assert.deepStrictEqual([ko.code, inconnu.code], [401, 401]); assert.strictEqual(ko.json.erreur, inconnu.json.erreur, 'le message ne doit pas dire si le compte existe');
  const ok = await requete('POST', api + '/session', { identifiant: 'ADMIN', motDePasse: MDP });
  assert.strictEqual(ok.code, 200); assert.ok(!JSON.stringify(ok.json).includes('scrypt'));
  const c = ok.entetes['set-cookie'][0];
  assert.match(c, /^netcarto_session=[A-Za-z0-9_-]{40,}/); assert.match(c, /HttpOnly/); assert.match(c, /SameSite=Strict/); assert.match(c, /Path=\//); assert.doesNotMatch(c, /Secure/);
  const cookie = cookieDe(ok);
  assert.strictEqual((await requete('GET', api + '/base', undefined, cookie)).code, 200);
  assert.strictEqual((await requete('DELETE', api + '/session', undefined, cookie)).code, 200);
  assert.strictEqual((await requete('GET', api + '/base', undefined, cookie)).code, 401);
  // /info et /sante restent publics (surveillance), sans rien révéler de la base
  assert.strictEqual((await requete('GET', api + '/sante')).code, 200);
  assert.deepStrictEqual(Object.keys((await requete('GET', api + '/info')).json).sort(), ['app', 'mode'], 'sans session, la version du serveur n\'est pas divulguée');
});

test('verrouillage après cinq échecs, levé avec le temps ou par un administrateur', async t => {
  let maintenant = Date.now();
  const { api, admin } = await serveurDeTest(t, { options: { horloge: () => maintenant } });
  const essai = mdp => requete('POST', api + '/session', { identifiant: 'tech', motDePasse: mdp });
  for (let i = 0; i < 5; i++) assert.strictEqual((await essai('Mauvais-mot-de-passe')).code, 401);
  const bloque = await essai(MDP);
  assert.strictEqual(bloque.code, 401, 'même réponse qu\'un mauvais mot de passe : rien ne dit que le compte existe'); assert.match(bloque.json.erreur, /verrouillé/);
  maintenant += 16 * 60000;
  assert.strictEqual((await essai(MDP)).code, 200, 'le verrou tombe après 15 minutes');
  for (let i = 0; i < 5; i++) await essai('Mauvais-mot-de-passe');
  const u = (await requete('GET', api + '/utilisateurs', undefined, admin)).json.find(x => x.identifiant === 'tech');
  assert.strictEqual(u.verrouille, true);
  assert.strictEqual((await requete('PUT', `${api}/utilisateurs/${u.id}`, { deverrouiller: true }, admin)).code, 200);
  assert.strictEqual((await essai(MDP)).code, 200);
});

test('une session expire par inactivité, et au bout de sa durée maximale', async t => {
  let maintenant = Date.now();
  const { api } = await serveurDeTest(t, { options: { horloge: () => maintenant }, config: { securite: { sessionHeures: 12, inactiviteMinutes: 60 } } });
  const c = cookieDe(await requete('POST', api + '/session', { identifiant: 'admin', motDePasse: MDP }));
  maintenant += 50 * 60000; assert.strictEqual((await requete('GET', api + '/revision', undefined, c)).code, 200);
  maintenant += 50 * 60000; assert.strictEqual((await requete('GET', api + '/revision', undefined, c)).code, 200, 'l\'activité prolonge la session');
  maintenant += 61 * 60000; assert.strictEqual((await requete('GET', api + '/revision', undefined, c)).code, 401, 'inactivité');
  const c2 = cookieDe(await requete('POST', api + '/session', { identifiant: 'admin', motDePasse: MDP }));
  for (let i = 0; i < 13; i++) { maintenant += 59 * 60000; await requete('GET', api + '/revision', undefined, c2); }
  assert.strictEqual((await requete('GET', api + '/revision', undefined, c2)).code, 401, 'durée maximale');
});

test('rôles : lecture, technicien, administrateur', async t => {
  const { api, admin, tech, lecteur } = await serveurDeTest(t), d = await demo();
  assert.strictEqual((await requete('PUT', api + '/base', d, tech)).code, 403);
  assert.strictEqual((await requete('PUT', api + '/base', d, admin)).code, 200);
  const dev = d.devices[0], lot = { changements: [{ collection: 'devices', op: 'modifier', cle: dev.id, avant: dev, apres: { ...dev, notes: 'note' } }] };
  assert.strictEqual((await requete('GET', api + '/equipements', undefined, lecteur)).code, 200);
  const refus = await requete('POST', api + '/lots', lot, lecteur);
  assert.strictEqual(refus.code, 403); assert.match(refus.json.erreur, /lecture seule/);
  assert.strictEqual((await requete('POST', api + '/lots', lot, tech)).code, 200);
  for (const chemin of ['/utilisateurs', '/audit']) { assert.strictEqual((await requete('GET', api + chemin, undefined, tech)).code, 403, chemin); assert.strictEqual((await requete('GET', api + chemin, undefined, admin)).code, 200, chemin); }
  assert.strictEqual((await requete('POST', api + '/utilisateurs', { identifiant: 'x', nom: 'X', role: 'lecture', motDePasse: MDP }, tech)).code, 403);
});

test('gestion des utilisateurs par un administrateur', async t => {
  const { api, admin } = await serveurDeTest(t);
  const cree = await requete('POST', api + '/utilisateurs', { identifiant: 'Alice', nom: 'Alice Martin', role: 'technicien', motDePasse: MDP }, admin);
  assert.strictEqual(cree.code, 200, cree.texte); assert.ok(!('motDePasse' in cree.json) && !JSON.stringify(cree.json).includes('scrypt'));
  const id = cree.json.id;
  assert.strictEqual((await requete('POST', api + '/utilisateurs', { identifiant: 'alice', nom: 'Autre', role: 'lecture', motDePasse: MDP }, admin)).code, 422, 'identifiant déjà pris, sans tenir compte de la casse');
  assert.strictEqual((await requete('POST', api + '/utilisateurs', { identifiant: 'bob', nom: 'Bob', role: 'chef', motDePasse: MDP }, admin)).code, 422);
  assert.strictEqual((await requete('POST', api + '/utilisateurs', { identifiant: 'bob', nom: 'Bob', role: 'lecture', motDePasse: 'court' }, admin)).code, 422);
  const alice = cookieDe(await requete('POST', api + '/session', { identifiant: 'alice', motDePasse: MDP }));
  assert.strictEqual((await requete('PUT', `${api}/utilisateurs/${id}`, { role: 'lecture', nom: 'Alice M.' }, admin)).json.role, 'lecture');
  assert.strictEqual((await requete('GET', api + '/session', undefined, alice)).json.utilisateur.role, 'lecture', 'le changement de rôle s\'applique tout de suite');
  // Désactiver un compte coupe ses sessions et empêche la connexion
  assert.strictEqual((await requete('PUT', `${api}/utilisateurs/${id}`, { actif: false }, admin)).code, 200);
  assert.strictEqual((await requete('GET', api + '/base', undefined, alice)).code, 401);
  assert.strictEqual((await requete('POST', api + '/session', { identifiant: 'alice', motDePasse: MDP })).code, 401);
  // Nouveau mot de passe posé par l'administrateur
  await requete('PUT', `${api}/utilisateurs/${id}`, { actif: true, motDePasse: 'Nouveau-mot-de-passe-2' }, admin);
  assert.strictEqual((await requete('POST', api + '/session', { identifiant: 'alice', motDePasse: 'Nouveau-mot-de-passe-2' })).code, 200);
  // Garde-fous : on ne supprime ni son propre compte ni le dernier administrateur
  const moi = (await requete('GET', api + '/session', undefined, admin)).json.utilisateur.id;
  assert.strictEqual((await requete('DELETE', `${api}/utilisateurs/${moi}`, undefined, admin)).code, 422);
  assert.strictEqual((await requete('PUT', `${api}/utilisateurs/${moi}`, { role: 'lecture' }, admin)).code, 422);
  assert.strictEqual((await requete('DELETE', `${api}/utilisateurs/${id}`, undefined, admin)).code, 200);
  assert.ok(!(await requete('GET', api + '/utilisateurs', undefined, admin)).json.some(u => u.identifiant === 'Alice'));
});

test('changer son propre mot de passe coupe les autres sessions', async t => {
  const { api, tech } = await serveurDeTest(t);
  const autre = cookieDe(await requete('POST', api + '/session', { identifiant: 'tech', motDePasse: MDP }));
  assert.strictEqual((await requete('PUT', api + '/session/mot-de-passe', { actuel: 'Faux-mot-de-passe-0', nouveau: 'Encore-un-autre-mdp-3' }, tech)).code, 403);
  assert.strictEqual((await requete('PUT', api + '/session/mot-de-passe', { actuel: MDP, nouveau: 'court' }, tech)).code, 422);
  assert.strictEqual((await requete('PUT', api + '/session/mot-de-passe', { actuel: MDP, nouveau: 'Encore-un-autre-mdp-3' }, tech)).code, 200);
  assert.strictEqual((await requete('GET', api + '/revision', undefined, tech)).code, 200);
  assert.strictEqual((await requete('GET', api + '/revision', undefined, autre)).code, 401);
  assert.strictEqual((await requete('POST', api + '/session', { identifiant: 'tech', motDePasse: 'Encore-un-autre-mdp-3' })).code, 200);
});

test('journal d\'audit : qui, quand, quoi, valeur avant et après ; il ne se modifie pas', async t => {
  const { api, admin, tech, dossier } = await serveurDeTest(t), d = await demo(), debut = Date.now();
  await requete('PUT', api + '/base', d, admin);
  const dev = d.devices.find(x => x.hostname === 'SW-A1-ACC-01'), site = { id: 'site-audit', name: 'Annexe', code: 'ANX', address: '' };
  await requete('POST', api + '/lots', { type: 'edit', changements: [{ collection: 'devices', op: 'modifier', cle: dev.id, avant: dev, apres: { ...dev, notes: 'baie réorganisée' } }, { collection: 'sites', op: 'creer', cle: site.id, apres: site }] }, tech);
  await requete('POST', api + '/lots', { changements: [{ collection: 'sites', op: 'supprimer', cle: site.id, avant: site }] }, tech);
  await requete('POST', api + '/session', { identifiant: 'tech', motDePasse: 'Mauvais-mot-de-passe' });
  const tout = (await requete('GET', api + '/audit?limite=200', undefined, admin)).json;
  const modif = tout.find(a => a.action === 'modifier' && a.cle === dev.id);
  assert.deepStrictEqual([modif.identifiant, modif.collection, modif.avant.notes, modif.apres.notes], ['tech', 'devices', dev.notes, 'baie réorganisée']);
  assert.ok(modif.date >= debut && modif.date <= Date.now() && modif.ip);
  const crea = tout.find(a => a.action === 'creer' && a.cle === site.id), supp = tout.find(a => a.action === 'supprimer' && a.cle === site.id);
  assert.deepStrictEqual([crea.avant, crea.apres.name, supp.avant.name, supp.apres], [null, 'Annexe', 'Annexe', null]);
  assert.strictEqual(crea.lot, modif.lot, 'les changements d\'un même lot portent le même numéro');
  assert.ok(tout.some(a => a.action === 'remplacement' && a.identifiant === 'admin'));
  assert.ok(tout.some(a => a.action === 'connexion' && a.identifiant === 'tech') && tout.some(a => a.action === 'echec_connexion' && a.identifiant === 'tech'));
  assert.ok(tout.every((a, i) => i === 0 || tout[i - 1].id > a.id), 'du plus récent au plus ancien');
  assert.ok(!JSON.stringify(tout).includes('scrypt') && !JSON.stringify(tout).includes(MDP));
  // Filtres et pagination
  assert.ok((await requete('GET', `${api}/audit?cle=${dev.id}`, undefined, admin)).json.every(a => a.cle === dev.id));
  assert.ok((await requete('GET', api + '/audit?identifiant=tech&action=creer', undefined, admin)).json.every(a => a.identifiant === 'tech' && a.action === 'creer'));
  const page1 = (await requete('GET', api + '/audit?limite=2', undefined, admin)).json, page2 = (await requete('GET', `${api}/audit?limite=2&avant=${page1[1].id}`, undefined, admin)).json;
  assert.strictEqual(page1.length, 2); assert.ok(page2[0].id < page1[1].id);
  // Le journal ne se réécrit pas, même en accédant directement au fichier de la base
  const brut = new DatabaseSync(path.join(dossier, 'netcarto.sqlite'));
  assert.throws(() => brut.exec('UPDATE audit SET identifiant = \'personne\''), /audit/);
  assert.throws(() => brut.exec('DELETE FROM audit'), /audit/);
  brut.close();
});

test('conflit : le message nomme la personne qui a modifié l\'élément', async t => {
  const { api, admin, tech } = await serveurDeTest(t), d = await demo();
  await requete('PUT', api + '/base', d, admin);
  const dev = d.devices.find(x => x.hostname === 'SW-A1-ACC-01');
  await requete('POST', api + '/lots', { changements: [{ collection: 'devices', op: 'modifier', cle: dev.id, avant: dev, apres: { ...dev, notes: 'par tech' } }] }, tech);
  const r = await requete('POST', api + '/lots', { changements: [{ collection: 'devices', op: 'modifier', cle: dev.id, avant: dev, apres: { ...dev, notes: 'par admin' } }] }, admin);
  assert.strictEqual(r.code, 409); assert.match(r.json.erreur, /SW-A1-ACC-01/); assert.match(r.json.erreur, /par tech/);
});

test('une base du lot 16 (version 1) reçoit les nouvelles tables sans perdre ses données', async t => {
  const dossier = dossierTemporaire(t), fichier = path.join(dossier, 'netcarto.sqlite');
  const { ouvrir } = require('../donnees/pilote-sqlite'), { migrer } = require('../donnees/migrations');
  // Base telle que le lot 16 la laissait : schéma en version 1, avec quelques données
  const p = ouvrir(fichier);
  assert.deepStrictEqual(migrer(p, { jusqua: 1 }), { version: 1, appliquees: [1] });
  p.lancer('INSERT INTO sites (id, nom, code, adresse) VALUES (?, ?, ?, ?)', ['site-1', 'Ancien site', 'ANC', '']);
  p.lancer('INSERT INTO batiments (id, site_id, code, nom) VALUES (?, ?, ?, ?)', ['bld-1', 'site-1', 'A', 'Bâtiment A']);
  p.lancer('INSERT INTO meta (cle, valeur) VALUES (\'initialisee\', \'1\'), (\'revision\', \'7\')');
  p.fermer();
  const { app, api, admin } = await serveurDeTest(t, { dossier });
  assert.strictEqual(app.depot.versionSchema(), 3);
  assert.deepStrictEqual((await requete('GET', api + '/sites', undefined, admin)).json.map(x => x.name), ['Ancien site']);
  assert.strictEqual((await requete('GET', api + '/batiments', undefined, admin)).json.length, 1);
  assert.strictEqual((await requete('GET', api + '/revision', undefined, admin)).json.revision, 7);
});
