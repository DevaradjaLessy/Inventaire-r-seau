/* Essai réel de l'image Docker : construction, démarrage, compte du service, persistance, commandes d'exploitation.
   Ignoré si Docker n'est pas disponible sur la machine.
   Derrière un proxy qui inspecte le HTTPS, indiquer son certificat : NETCARTO_TEST_CA=/chemin/ca.crt (et HTTPS_PROXY). */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), https = require('https');
const { execFileSync, spawnSync } = require('child_process');

const RACINE = path.join(__dirname, '..', '..'), IMAGE = 'netcarto:essai', NOM = 'netcarto-essai-' + process.pid, MDP = 'Mot-de-passe-de-test-1';   // mot de passe fictif
const docker = (args, opts = {}) => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
const disponible = spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 15000 }).status === 0;
const attendre = async (cond, ms = 60000) => { const fin = Date.now() + ms; for (;;) { try { const r = await cond(); if (r) return r; } catch { /* pas encore prêt */ } if (Date.now() > fin) throw new Error('délai dépassé'); await new Promise(r => setTimeout(r, 1000)); } };
const get = (port, chemin) => new Promise((ok, ko) => https.get({ host: '127.0.0.1', port, path: chemin, rejectUnauthorized: false }, res => { let b = ''; res.on('data', c => { b += c; }); res.on('end', () => ok({ code: res.statusCode, texte: b })); }).on('error', ko));

test('docker-compose.yml : fichier valide, dossiers convenus, conteneur durci', { skip: !disponible && 'Docker indisponible' }, () => {
  const c = JSON.parse(docker(['compose', '-f', path.join(RACINE, 'docker-compose.yml'), 'config', '--format', 'json'])), s = c.services.netcarto;
  assert.deepStrictEqual(s.volumes.map(v => `${v.source}:${v.target}`).sort(), ['/etc/netcarto:/etc/netcarto', '/var/lib/netcarto:/var/lib/netcarto']);
  assert.deepStrictEqual(s.ports.map(p => `${p.published}:${p.target}`), ['8443:8443']);
  assert.strictEqual(s.read_only, true); assert.deepStrictEqual(s.cap_drop, ['ALL']); assert.ok(s.security_opt.includes('no-new-privileges:true'));
  assert.strictEqual(s.restart, 'unless-stopped');
  assert.doesNotMatch(JSON.stringify(s.environment || {}), /token|secret|mot.?de.?passe|password/i, 'aucun secret dans le fichier');
});

test('Image Docker : démarre sans réglage, tourne sous un compte sans privilège, garde ses données', { skip: !disponible && 'Docker indisponible', timeout: 600000 }, async t => {
  const ca = process.env.NETCARTO_TEST_CA, vol = [NOM + '-donnees', NOM + '-reglages'];
  docker(['build', '-t', IMAGE, '-f', path.join(RACINE, 'installation', 'docker', 'Dockerfile'), ...(ca ? ['--network', 'host', '--secret', `id=ca,src=${ca}`, '--build-arg', `HTTPS_PROXY=${process.env.HTTPS_PROXY || ''}`] : []), RACINE], { stdio: 'ignore', timeout: 540000 });
  t.after(() => { spawnSync('docker', ['rm', '-f', NOM]); for (const v of vol) spawnSync('docker', ['volume', 'rm', '-f', v]); });
  // Mêmes protections que dans docker-compose.yml : système de fichiers en lecture seule, privilèges réduits au strict nécessaire
  const lancer = () => docker(['run', '-d', '--name', NOM, '--read-only', '--tmpfs', '/tmp', '--cap-drop', 'ALL', '--cap-add', 'CHOWN', '--cap-add', 'SETUID', '--cap-add', 'SETGID', '--cap-add', 'DAC_OVERRIDE',
    '--security-opt', 'no-new-privileges:true', '-p', '127.0.0.1::8443', '-v', `${vol[0]}:/var/lib/netcarto`, '-v', `${vol[1]}:/etc/netcarto`, IMAGE]);
  const port = () => +docker(['port', NOM, '8443']).trim().split(':').pop();
  lancer();
  const sante = await attendre(async () => { const r = await get(port(), '/api/v1/sante'); return r.code === 200 && r; });
  assert.match(sante.texte, /"ok":true/);
  assert.match((await get(port(), '/')).texte, /netcarto-api/, 'la page est servie en mode serveur');
  // Le code d'initialisation est dans le journal du conteneur
  assert.match(docker(['logs', NOM]), /Aucun compte n'existe encore[\s\S]*[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  // Le serveur tourne sous le compte « netcarto », pas sous root, et ses fichiers lui appartiennent
  assert.strictEqual(docker(['exec', NOM, 'sh', '-c', 'for p in /proc/[0-9]*; do if [ "$(cat $p/comm 2>/dev/null)" = node ]; then stat -c %u $p; fi; done | sort -u']).trim(), '10001');
  assert.strictEqual(docker(['exec', NOM, 'stat', '-c', '%u', '/var/lib/netcarto/netcarto.sqlite']).trim(), '10001');
  assert.match(docker(['exec', NOM, 'cat', '/etc/netcarto/netcarto.toml']), /dossier = "\/var\/lib\/netcarto"/);
  // Commandes d'exploitation : compte, sauvegarde, contrôle de santé ; elles n'écrivent jamais en root
  assert.match(docker(['exec', '-e', `NETCARTO_MOT_DE_PASSE=${MDP}`, NOM, 'netcarto', 'compte', 'admin']), /Compte « admin » créé/);
  assert.match(docker(['exec', NOM, 'netcarto', 'sauvegarde']), /Sauvegarde faite/);
  assert.match(docker(['exec', NOM, 'netcarto', 'sante']), /en marche/i);
  assert.strictEqual(docker(['exec', NOM, 'sh', '-c', 'find /var/lib/netcarto ! -user netcarto | wc -l']).trim(), '0', 'aucun fichier de données ne doit appartenir à root');
  await attendre(() => /healthy/.test(docker(['inspect', '-f', '{{.State.Health.Status}}', NOM])) && !/unhealthy/.test(docker(['inspect', '-f', '{{.State.Health.Status}}', NOM])), 90000);
  // Arrêt propre, puis nouveau conteneur sur les mêmes volumes : le compte est toujours là
  docker(['stop', '-t', '20', NOM]);
  assert.strictEqual(docker(['inspect', '-f', '{{.State.ExitCode}}', NOM]).trim(), '0', 'arrêt propre');
  docker(['rm', NOM]); lancer();
  await attendre(async () => (await get(port(), '/api/v1/sante')).code === 200);
  assert.doesNotMatch(docker(['logs', NOM]), /Aucun compte n'existe encore/);
  // Restauration complète refusée tant que le serveur tourne
  const refus = spawnSync('docker', ['exec', NOM, 'netcarto', 'restaurer', 'absente.sqlite'], { encoding: 'utf8' });
  assert.strictEqual(refus.status, 1); assert.match(refus.stderr, /serveur NetCarto est en marche|introuvable/);
});
