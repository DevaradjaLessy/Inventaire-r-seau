/* Tests de la configuration : fichier TOML, valeurs par défaut, chemins fournis par la configuration. */
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const { chargerConfig, DEFAUTS } = require('../config');
const { dossierTemporaire } = require('./aide');

test('valeurs par défaut : écoute locale, aucun chemin propre à un système', () => {
  const c = chargerConfig({ env: {}, args: [] });
  assert.deepStrictEqual([c.serveur.hote, c.serveur.port, c.https.actif], ['127.0.0.1', 8443, true]);
  assert.ok(path.isAbsolute(c.donnees.dossier) && path.isAbsolute(c.web.dossier));
  assert.ok(!JSON.stringify(DEFAUTS).includes('/var/') && !JSON.stringify(DEFAUTS).includes('/etc/'));
});
test('fichier TOML, chemins relatifs au fichier, puis variables d\'environnement et arguments', t => {
  const dossier = dossierTemporaire(t), f = path.join(dossier, 'netcarto.toml');
  fs.writeFileSync(f, '[serveur]\nhote = "0.0.0.0"\nport = 9000\n\n[donnees]\ndossier = "data"\n\n[[supervision.sources]]\ntype = "simulation"\ndevices = [{ ip = "10.0.0.1", hostname = "SW-1", ports = ["Gi1/0/1"] }]\n');
  const c = chargerConfig({ env: {}, args: ['--config', f] });
  assert.deepStrictEqual([c.serveur.hote, c.serveur.port, c.donnees.dossier], ['0.0.0.0', 9000, path.join(dossier, 'data')]);
  assert.strictEqual(c.supervision.sources[0].devices[0].hostname, 'SW-1');
  const c2 = chargerConfig({ env: { NETCARTO_CONFIG: f, NETCARTO_PORT: '9100', NETCARTO_DONNEES: path.join(dossier, 'autre') }, args: ['--port', '9200'] });
  assert.deepStrictEqual([c2.serveur.port, c2.donnees.dossier], [9200, path.join(dossier, 'autre')]);
});
test('courriel : un sujet accentué est encodé en morceaux qui tiennent sur une ligne, sans couper un caractère', () => {
  const { enTete } = require('../courrier');
  assert.strictEqual(enTete('NetCarto : lien de connexion'), 'NetCarto : lien de connexion', 'un sujet sans accent part tel quel');
  const sujet = 'Réinitialisation du mot de passe demandée pour l\'équipe réseau du bâtiment « Administration » — NetCarto', code = enTete(sujet);
  const lignes = code.split('\r\n ');
  assert.ok(lignes.length > 1 && lignes.every(l => l.length <= 75 && /^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/.test(l)), code);
  assert.strictEqual(lignes.map(l => Buffer.from(l.slice(10, -2), 'base64').toString('utf8')).join(''), sujet, 'chaque morceau se décode seul, et le tout redonne le sujet');
  assert.ok(!/[\r\n]/.test(enTete('Sujet\r\nBcc: intrus@exemple.test')), 'aucun retour à la ligne venu du sujet');
});
test('erreurs de configuration expliquées', t => {
  const dossier = dossierTemporaire(t), f = path.join(dossier, 'netcarto.toml');
  assert.throws(() => chargerConfig({ env: {}, args: ['--config', path.join(dossier, 'absent.toml')] }), /introuvable/);
  fs.writeFileSync(f, '[serveur]\nport = "abc"\n');
  assert.throws(() => chargerConfig({ env: {}, args: ['--config', f] }), /port/);
  fs.writeFileSync(f, '[serveur\nport = 1');
  assert.throws(() => chargerConfig({ env: {}, args: ['--config', f] }), /illisible|TOML/i);
  // Courriel : jamais de mot de passe sur une liaison en clair ; l'autorité de confiance, si elle est donnée, doit exister
  const courriel = lignes => `[courriel]\nhote = "smtp.exemple.interne"\nexpediteur = "netcarto@exemple.interne"\nadresse = "https://netcarto.exemple.interne:8443"\n${lignes}\n`;
  fs.writeFileSync(f, courriel('securite = "aucune"\nutilisateur = "netcarto"\nmotDePasse = "env:SMTP_MDP"'));
  assert.throws(() => chargerConfig({ env: { SMTP_MDP: 'x' }, args: ['--config', f] }), /securite.*"aucune".*mot de passe.*clair/s);
  fs.writeFileSync(f, courriel('securite = "aucune"'));
  assert.strictEqual(chargerConfig({ env: {}, args: ['--config', f] }).courriel.securite, 'aucune', 'sans compte, une liaison en clair reste permise (relais interne)');
  // L'adresse d'expédition part dans un en-tête : ni retour à la ligne, ni texte autour de l'adresse entre chevrons
  for (const mauvais of ['netcarto@exemple.interne\\r\\nBcc: intrus@exemple.test', 'NetCarto <netcarto@exemple.interne> suite', '<a@b> NetCarto <netcarto@exemple.interne>']) {
    fs.writeFileSync(f, `[courriel]\nhote = "smtp.exemple.interne"\nexpediteur = "${mauvais}"\nadresse = "https://netcarto.exemple.interne:8443"\n`);
    assert.throws(() => chargerConfig({ env: {}, args: ['--config', f] }), /courriel\.expediteur/, mauvais);
  }
  fs.writeFileSync(f, courriel('autorite = "ac-interne.pem"'));
  assert.throws(() => chargerConfig({ env: {}, args: ['--config', f] }), /courriel\.autorite.*introuvable/);
  fs.writeFileSync(path.join(dossier, 'ac-interne.pem'), 'x');
  assert.strictEqual(chargerConfig({ env: {}, args: ['--config', f] }).courriel.autorite, path.join(dossier, 'ac-interne.pem'), 'chemin relatif au fichier de réglages');
});
