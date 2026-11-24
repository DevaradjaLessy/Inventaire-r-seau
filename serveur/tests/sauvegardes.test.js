/* Sauvegardes : copie à la demande, planification, purge, restauration, sauvegarde avant migration, ligne de commande. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { execFileSync } = require('child_process');
const { dossierTemporaire, demo, requete, serveurDeTest, MDP } = require('./aide');
const { chargerConfig } = require('../config');

const NOM = /^netcarto-\d{4}-\d{2}-\d{2}_\d{6}-[a-z0-9-]+\.sqlite$/;
const fichiers = d => fs.readdirSync(path.join(d, 'sauvegardes')).filter(f => f.endsWith('.sqlite')).sort();
const cli = (args, env = {}) => execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', path.join(__dirname, '..', 'netcarto.js'), ...args], { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });

test('Sauvegarde à la demande : réservée à l\'administrateur, fichier complet et vérifié, tracée', async t => {
  const s = await serveurDeTest(t, { config: { demo: true } });
  assert.strictEqual((await requete('POST', s.api + '/sauvegardes', {}, s.tech)).code, 403);
  assert.strictEqual((await requete('GET', s.api + '/sauvegardes', undefined, s.lecteur)).code, 403);
  const r = await requete('POST', s.api + '/sauvegardes', {}, s.admin);
  assert.strictEqual(r.code, 200); assert.match(r.json.nom, NOM); assert.strictEqual(r.json.motif, 'manuelle'); assert.ok(r.json.taille > 10000);
  assert.ok(fs.existsSync(path.join(s.dossier, 'sauvegardes', r.json.nom)));
  const liste = (await requete('GET', s.api + '/sauvegardes', undefined, s.admin)).json;
  assert.deepStrictEqual(liste.liste.map(x => x.motif).sort(), ['auto', 'manuelle']); assert.strictEqual(liste.liste.find(x => x.motif === 'manuelle').nom, r.json.nom); assert.deepStrictEqual(liste.reglages, { actif: true, heure: '02:30', conserver: 14 });
  // La copie est une vraie base, relisible, avec les mêmes données
  const { ouvrirBase } = require('../donnees'), copie = path.join(dossierTemporaire(t), 'netcarto.sqlite');
  fs.copyFileSync(path.join(s.dossier, 'sauvegardes', r.json.nom), copie);
  const d = ouvrirBase({ fichier: copie }); t.after(() => d.fermer());
  assert.strictEqual(d.lister('devices').length, (await demo()).devices.length);
  const audit = (await requete('GET', s.api + '/audit?action=sauvegarde', undefined, s.admin)).json;
  assert.strictEqual(audit.length, 1); assert.strictEqual(audit[0].identifiant, 'admin');
});

test('Téléchargement d\'une sauvegarde : administrateur seulement, nom contrôlé', async t => {
  const s = await serveurDeTest(t, { config: { demo: true } });
  const { nom } = (await requete('POST', s.api + '/sauvegardes', {}, s.admin)).json;
  const r = await requete('GET', s.api + '/sauvegardes/' + nom, undefined, s.admin);
  assert.strictEqual(r.code, 200); assert.ok(r.texte.startsWith('SQLite format 3')); assert.match(r.entetes['content-disposition'], new RegExp(nom.replace(/\./g, '\\.')));
  assert.strictEqual((await requete('GET', s.api + '/sauvegardes/' + nom, undefined, s.tech)).code, 403);
  assert.strictEqual((await requete('GET', s.api + '/sauvegardes/netcarto-2000-01-01_000000-auto.sqlite', undefined, s.admin)).code, 404);
  // Suppression : administrateur seulement, tracée
  assert.strictEqual((await requete('DELETE', s.api + '/sauvegardes/' + nom, undefined, s.tech)).code, 403);
  assert.strictEqual((await requete('DELETE', s.api + '/sauvegardes/' + nom, undefined, s.admin)).code, 200);
  assert.strictEqual((await requete('GET', s.api + '/sauvegardes/' + nom, undefined, s.admin)).code, 404);
  assert.strictEqual((await requete('GET', s.api + '/audit?action=sauvegarde_supprimer', undefined, s.admin)).json.length, 1);
  for (const mauvais of ['..%2Fnetcarto.sqlite', '%2E%2E%5Cnetcarto.sqlite', 'netcarto.sqlite']) assert.ok([400, 404].includes((await requete('GET', s.api + '/sauvegardes/' + mauvais, undefined, s.admin)).code), mauvais);
});

test('Restauration depuis l\'interface : l\'inventaire revient, comptes et journal d\'audit sont gardés, l\'état d\'avant est sauvegardé', async t => {
  const s = await serveurDeTest(t, { config: { demo: true } });
  const { nom } = (await requete('POST', s.api + '/sauvegardes', {}, s.admin)).json;
  const site = (await requete('GET', s.api + '/sites', undefined, s.admin)).json[0], rev = (await requete('GET', s.api + '/revision', undefined, s.admin)).json.revision;
  const lot = await requete('POST', s.api + '/lots', { type: 'edit', texte: 'Renommage', changements: [{ collection: 'sites', op: 'modifier', cle: site.id, avant: site, apres: { ...site, name: 'Site renommé par erreur' } }] }, s.tech);
  assert.strictEqual(lot.code, 200);
  await s.app.securite.creerUtilisateur({ identifiant: 'nouveau', nom: 'Nouveau', role: 'lecture', motDePasse: MDP });
  assert.strictEqual((await requete('POST', s.api + '/sauvegardes/restauration', { nom }, s.tech)).code, 403);
  assert.strictEqual((await requete('POST', s.api + '/sauvegardes/restauration', { nom: 'netcarto-2000-01-01_000000-auto.sqlite' }, s.admin)).code, 404);
  const r = await requete('POST', s.api + '/sauvegardes/restauration', { nom }, s.admin);
  assert.strictEqual(r.code, 200, r.texte); assert.strictEqual(r.json.revision, rev + 2); assert.match(r.json.avant, /avant-restauration/);
  assert.strictEqual((await requete('GET', s.api + '/sites/' + site.id, undefined, s.admin)).json.name, site.name);
  // Les comptes créés depuis la sauvegarde existent toujours, les sessions restent valables
  assert.ok(s.app.securite.trouver('nouveau')); assert.strictEqual((await requete('GET', s.api + '/revision', undefined, s.tech)).code, 200);
  const audit = (await requete('GET', s.api + '/audit?limite=500', undefined, s.admin)).json;
  assert.ok(audit.some(a => a.action === 'restauration' && a.identifiant === 'admin' && a.libelle.includes(nom)));
  assert.ok(audit.some(a => a.action === 'modifier' && a.cle === site.id), 'le journal d\'audit garde la modification annulée');
  assert.strictEqual(fichiers(s.dossier).filter(f => f.includes('avant-restauration')).length, 1);
});

test('Planification : une sauvegarde par jour à l\'heure dite, rattrapée si le serveur était arrêté ; seules les plus récentes sont gardées', async t => {
  let maintenant = new Date(2026, 0, 10, 1, 0, 0).getTime();
  const s = await serveurDeTest(t, { config: { demo: true, sauvegardes: { heure: '02:30', conserver: 2 } }, options: { horloge: () => maintenant } });
  const autos = () => fichiers(s.dossier).filter(f => f.endsWith('-auto.sqlite'));
  const a = heure => { maintenant = heure.getTime(); return s.app.sauvegardes.echeance(); };
  // Au démarrage, aucune sauvegarde n'existait : la première est faite tout de suite
  assert.strictEqual(autos().length, 1); assert.match(autos()[0], /^netcarto-2026-01-10_010000-auto/);
  assert.strictEqual(a(new Date(2026, 0, 10, 2, 29)), null, 'avant l\'heure : rien');
  assert.match(a(new Date(2026, 0, 10, 2, 31)).nom, /2026-01-10_023100-auto/);
  assert.strictEqual(a(new Date(2026, 0, 10, 23, 0)), null, 'une seule par jour');
  s.app.sauvegardes.creer('manuelle');
  // Deux jours sans passage (serveur arrêté) : une seule sauvegarde de rattrapage
  assert.match(a(new Date(2026, 0, 13, 9, 0)).nom, /2026-01-13_090000-auto/);
  assert.strictEqual(a(new Date(2026, 0, 13, 9, 5)), null);
  assert.deepStrictEqual(autos().map(f => f.slice(9, 19)), ['2026-01-10', '2026-01-13'], 'les 2 plus récentes');
  assert.ok(autos()[0].includes('023100'));
  assert.strictEqual(fichiers(s.dossier).filter(f => f.includes('manuelle')).length, 1, 'la purge automatique ne touche pas aux sauvegardes manuelles');
});

test('Planification désactivée : aucune sauvegarde automatique, la sauvegarde à la demande reste possible', async t => {
  const s = await serveurDeTest(t, { config: { demo: true, sauvegardes: { actif: false } } });
  assert.strictEqual(s.app.sauvegardes.echeance(), null); assert.strictEqual(fs.existsSync(path.join(s.dossier, 'sauvegardes')) ? fichiers(s.dossier).length : 0, 0);
  assert.strictEqual((await requete('POST', s.api + '/sauvegardes', {}, s.admin)).code, 200);
});

test('Dossier de sauvegarde réglable (autre disque) et réglages contrôlés', async t => {
  const ailleurs = dossierTemporaire(t), s = await serveurDeTest(t, { config: { demo: true, sauvegardes: { dossier: ailleurs } } });
  const { nom } = (await requete('POST', s.api + '/sauvegardes', {}, s.admin)).json;
  assert.ok(fs.existsSync(path.join(ailleurs, nom)));
  const d = dossierTemporaire(t), f = path.join(d, 'n.toml');
  fs.writeFileSync(f, '[sauvegardes]\nheure = "23:15"\nconserver = 30\ndossier = "copies"\n');
  const cfg = chargerConfig({ env: {}, args: ['--config', f] });
  assert.deepStrictEqual(cfg.sauvegardes, { actif: true, heure: '23:15', conserver: 30, dossier: path.join(d, 'copies') });
  for (const mauvais of ['heure = "25:00"', 'heure = "midi"', 'conserver = 0', 'conserver = 2.5']) { fs.writeFileSync(f, `[sauvegardes]\n${mauvais}\n`); assert.throws(() => chargerConfig({ env: {}, args: ['--config', f] }), /sauvegardes\./, mauvais); }
});

test('Avant une migration, la base existante est sauvegardée dans son ancien état', async t => {
  const dossier = dossierTemporaire(t), fichier = path.join(dossier, 'netcarto.sqlite');
  const { ouvrir } = require('../donnees/pilote-sqlite'), { migrer } = require('../donnees/migrations');
  const p = ouvrir(fichier); migrer(p, { jusqua: 1 }); p.fermer();
  const s = await serveurDeTest(t, { dossier, comptes: false });
  const avant = fichiers(dossier).filter(f => f.includes('avant-migration'));
  assert.strictEqual(avant.length, 1); assert.match(avant[0], /avant-migration-002\.sqlite$/);
  const { controler } = require('../donnees/pilote-sqlite');
  assert.deepStrictEqual({ ok: controler(path.join(dossier, 'sauvegardes', avant[0])).ok, version: controler(path.join(dossier, 'sauvegardes', avant[0])).version }, { ok: true, version: 1 });
  assert.ok(s.app.depot.versionSchema() >= 2);
  // Une base neuve n'a rien à sauvegarder avant ses migrations
  const neuf = await serveurDeTest(t, { comptes: false, config: { sauvegardes: { actif: false } } });
  assert.ok(!fs.existsSync(path.join(neuf.dossier, 'sauvegardes')) || !fichiers(neuf.dossier).length);
});

test('Un fichier abîmé n\'est jamais restauré', async t => {
  const s = await serveurDeTest(t, { config: { demo: true } });
  const { nom } = (await requete('POST', s.api + '/sauvegardes', {}, s.admin)).json, f = path.join(s.dossier, 'sauvegardes', nom);
  fs.writeFileSync(f, Buffer.concat([fs.readFileSync(f).subarray(0, 2000), Buffer.alloc(3000, 7)]));
  const r = await requete('POST', s.api + '/sauvegardes/restauration', { nom }, s.admin);
  assert.strictEqual(r.code, 422); assert.match(r.json.erreur, /illisible|abîmé/);
  assert.ok((await requete('GET', s.api + '/sites', undefined, s.admin)).json.length > 0, 'la base en service n\'a pas bougé');
});

test('Ligne de commande : sauvegarder, lister, restaurer en entier (comptes compris) ; refus si le serveur tourne', async t => {
  const dossier = dossierTemporaire(t);
  let s = await serveurDeTest(t, { dossier, config: { demo: true, sauvegardes: { actif: false } } });
  const sortie = cli(['sauvegarde', '--donnees', dossier]);
  const nom = /netcarto-[\w-]+\.sqlite/.exec(sortie)[0]; assert.match(nom, /-manuelle\.sqlite$/);
  assert.match(cli(['sauvegardes', '--donnees', dossier]), new RegExp(nom.replace(/\./g, '\\.')));
  await s.app.securite.creerUtilisateur({ identifiant: 'apres', nom: 'Après', role: 'lecture', motDePasse: MDP });
  // Serveur en marche : la restauration complète est refusée
  assert.throws(() => cli(['restaurer', nom, '--donnees', dossier]), e => e.status === 1 && /serveur.*en marche/i.test(e.stderr));
  await s.app.arreter();
  assert.match(cli(['restaurer', nom, '--donnees', dossier]), /restaurée/i);
  assert.throws(() => cli(['restaurer', 'absente.sqlite', '--donnees', dossier]), e => e.status === 1 && /introuvable/i.test(e.stderr));
  s = await serveurDeTest(t, { dossier, comptes: false, config: { sauvegardes: { actif: false } } });
  assert.ok(s.app.securite.trouver('admin')); assert.strictEqual(s.app.securite.trouver('apres'), null, 'restauration complète : les comptes reviennent à l\'état de la sauvegarde');
  assert.strictEqual(fichiers(dossier).filter(f => f.includes('avant-restauration')).length, 1);
});
