/* Tests du HTTPS : certificat auto-signé généré par NetCarto, certificat fourni, en-têtes de sécurité. */
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const { genererCertificat, preparerHttps } = require('../securite/certificat');
const { demarrer } = require('../app');
const { RACINE, MDP, dossierTemporaire, requete } = require('./aide');

test('certificat auto-signé : valable, pour ce poste, avec sa clé', () => {
  const { certificat, cle } = genererCertificat({ noms: ['localhost', 'netcarto.exemple.interne'], adresses: ['127.0.0.1', '::1'], jours: 400 });
  const x = new crypto.X509Certificate(certificat);
  assert.match(x.subject, /CN=NetCarto/); assert.strictEqual(x.subject, x.issuer);
  assert.match(x.subjectAltName, /DNS:localhost/); assert.match(x.subjectAltName, /DNS:netcarto\.exemple\.interne/); assert.match(x.subjectAltName, /IP Address:127\.0\.0\.1/);
  assert.ok(x.checkPrivateKey(crypto.createPrivateKey(cle)));
  assert.ok(x.verify(x.publicKey), 'signature valide');
  const debut = new Date(x.validFrom), fin = new Date(x.validTo);
  assert.ok(debut <= new Date() && fin - debut > 399 * 86400000 && fin - debut < 401 * 86400000);
  assert.ok(x.checkHost('localhost') && x.checkIP('127.0.0.1'));
  assert.notStrictEqual(genererCertificat({}).certificat, certificat, 'chaque génération produit une clé nouvelle');
});

test('HTTPS par défaut : certificat créé dans le dossier de données, réutilisé ensuite', async t => {
  const dossier = dossierTemporaire(t);
  const lancer = () => demarrer({ serveur: { hote: '127.0.0.1', port: 0 }, donnees: { dossier }, web: { dossier: RACINE } }, { journal: () => {} });
  const app = await lancer();
  assert.strictEqual(app.protocole, 'https');
  const crt = path.join(dossier, 'certificats', 'netcarto.crt'), key = path.join(dossier, 'certificats', 'netcarto.key');
  assert.ok(fs.existsSync(crt) && fs.existsSync(key));
  if (process.platform !== 'win32') assert.strictEqual(fs.statSync(key).mode & 0o077, 0, 'la clé privée n\'est lisible que par le compte du service');
  const ca = fs.readFileSync(crt), base = `https://127.0.0.1:${app.port}`;
  const page = await requete('GET', base + '/', undefined, {}, { ca });
  assert.strictEqual(page.code, 200); assert.match(page.entetes['strict-transport-security'], /max-age=\d+/);
  await app.securite.creerUtilisateur({ identifiant: 'admin', nom: 'Admin', role: 'administrateur', motDePasse: MDP });
  const c = (await requete('POST', base + '/api/v1/session', { identifiant: 'admin', motDePasse: MDP }, {}, { ca })).entetes['set-cookie'][0];
  assert.match(c, /Secure/, 'en HTTPS, le cookie de session ne voyage jamais en clair');
  await assert.rejects(requete('GET', base + '/', undefined, {}, {}), /self.signed|certificate/i, 'sans le certificat, un client refuse la connexion');
  const empreinte = new crypto.X509Certificate(ca).fingerprint256;
  await app.arreter();
  const app2 = await lancer(); t.after(() => app2.arreter());
  assert.strictEqual(new crypto.X509Certificate(fs.readFileSync(crt)).fingerprint256, empreinte);
});

test('certificat fourni par l\'administrateur, et erreurs expliquées', async t => {
  const dossier = dossierTemporaire(t), { certificat, cle } = genererCertificat({ noms: ['localhost'], adresses: ['127.0.0.1'] });
  const crt = path.join(dossier, 'mon.crt'), key = path.join(dossier, 'ma.key');
  fs.writeFileSync(crt, certificat); fs.writeFileSync(key, cle);
  const app = await demarrer({ serveur: { hote: '127.0.0.1', port: 0 }, donnees: { dossier: path.join(dossier, 'data') }, web: { dossier: RACINE }, https: { actif: true, certificat: crt, cle: key } }, { journal: () => {} });
  t.after(() => app.arreter());
  assert.strictEqual((await requete('GET', `https://127.0.0.1:${app.port}/api/v1/sante`, undefined, {}, { ca: certificat })).code, 200);
  assert.ok(!fs.existsSync(path.join(dossier, 'data', 'certificats')), 'aucun certificat auto-signé n\'est créé quand on fournit le sien');
  assert.throws(() => preparerHttps({ actif: true, certificat: path.join(dossier, 'absent.crt'), cle: key }, dossier), /introuvable/);
  assert.throws(() => preparerHttps({ actif: true, certificat: crt, cle: '' }, dossier), /les deux/);
  fs.writeFileSync(key, genererCertificat({}).cle);
  assert.throws(() => preparerHttps({ actif: true, certificat: crt, cle: key }, dossier), /ne correspond pas/);
});

test('certificat auto-signé : noms et adresses supplémentaires réglables (https.noms), certificat refait s\'ils changent', t => {
  const dossier = dossierTemporaire(t), crt = path.join(dossier, 'certificats', 'netcarto.crt');
  const san = () => new crypto.X509Certificate(fs.readFileSync(crt)).subjectAltName;
  const un = preparerHttps({ noms: ['netcarto.exemple.interne', '192.0.2.10'] }, dossier);
  assert.ok(un.autoSigne); assert.match(san(), /DNS:netcarto\.exemple\.interne/); assert.match(san(), /IP Address:192\.0\.2\.10/); assert.match(san(), /DNS:localhost/);
  const empreinte = new crypto.X509Certificate(un.cert).fingerprint256;
  // Mêmes noms : le certificat est gardé (les navigateurs l'ont déjà accepté)
  assert.strictEqual(new crypto.X509Certificate(preparerHttps({ noms: ['192.0.2.10', 'netcarto.exemple.interne'] }, dossier).cert).fingerprint256, empreinte);
  // Un nom de plus : le certificat est refait
  const deux = preparerHttps({ noms: ['netcarto.exemple.interne', '192.0.2.10', 'carto.exemple.interne'] }, dossier);
  assert.notStrictEqual(new crypto.X509Certificate(deux.cert).fingerprint256, empreinte); assert.match(san(), /DNS:carto\.exemple\.interne/);
  assert.throws(() => preparerHttps({ noms: 'netcarto.exemple.interne' }, dossier), /https\.noms/);
  assert.throws(() => preparerHttps({ noms: ['nom avec espace'] }, dossier), /https\.noms/);
});
