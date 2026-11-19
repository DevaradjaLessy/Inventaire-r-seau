/* Tests de la configuration : fichier TOML, valeurs par défaut, chemins fournis par la configuration. */
'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const { chargerConfig, DEFAUTS } = require('../config');
const { dossierTemporaire } = require('./aide');

test('valeurs par défaut : écoute locale, aucun chemin propre à un système', () => {
  const c = chargerConfig({ env: {}, args: [] });
  assert.deepStrictEqual([c.serveur.hote, c.serveur.port], ['127.0.0.1', 8080]);
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
test('erreurs de configuration expliquées', t => {
  const dossier = dossierTemporaire(t), f = path.join(dossier, 'netcarto.toml');
  assert.throws(() => chargerConfig({ env: {}, args: ['--config', path.join(dossier, 'absent.toml')] }), /introuvable/);
  fs.writeFileSync(f, '[serveur]\nport = "abc"\n');
  assert.throws(() => chargerConfig({ env: {}, args: ['--config', f] }), /port/);
  fs.writeFileSync(f, '[serveur\nport = 1');
  assert.throws(() => chargerConfig({ env: {}, args: ['--config', f] }), /illisible|TOML/i);
});
