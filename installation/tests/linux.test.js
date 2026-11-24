/* Essai réel de l'installation Linux, dans un conteneur Debian 12 où tourne un vrai systemd :
   installation, service, droits, mise à jour, retour arrière, désinstallation et garde-fou de suppression.
   Ignoré si Docker n'est pas disponible ou ne permet pas les conteneurs privilégiés.
   L'installation se fait hors ligne (options --node et --hors-ligne) ; l'archive Node.js est téléchargée et
   vérifiée par la fonction du script d'installation elle-même.    Un autre système s'essaie en donnant son image : NETCARTO_TEST_IMAGE=jrei/systemd-ubuntu:24.04 (image avec systemd). */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const RACINE = path.join(__dirname, '..', '..'), IMAGE = process.env.NETCARTO_TEST_IMAGE || 'jrei/systemd-debian:12', NOM = 'netcarto-essai-linux-' + process.pid, MDP = 'Mot-de-passe-de-test-1';   // mot de passe fictif
const disponible = process.platform === 'linux' && spawnSync('docker', ['info'], { stdio: 'ignore', timeout: 15000 }).status === 0;
/* Commande dans le conteneur : renvoie { code, sortie (stdout + stderr) } */
const dans = (cmd, entree) => { const r = spawnSync('docker', ['exec', ...(entree !== undefined ? ['-i'] : []), NOM, 'bash', '-c', cmd], { encoding: 'utf8', input: entree }); return { code: r.status, sortie: (r.stdout || '') + (r.stderr || '') }; };
const ok = (cmd, entree) => { const r = dans(cmd, entree); assert.strictEqual(r.code, 0, `${cmd}\n${r.sortie}`); return r.sortie.trim(); };

test('Garde-fou : la fonction de suppression refuse tout ce qui n\'est pas un dossier de NetCarto', { skip: process.platform === 'win32' && 'bash nécessaire' }, () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'netcarto-garde-')), temoin = path.join(d, 'a-garder.txt');
  fs.writeFileSync(temoin, 'x');
  for (const cible of ['', '/', '/home', '/etc', '/var/lib', '/opt', d, d + '/', '/opt/netcarto/../..', '/var/lib/netcarto/..', '/opt/netcarto/', '/opt/netcarto/serveur', '*', '.']) {
    const r = spawnSync('bash', ['-c', `. "${RACINE}/installation/linux/commun.sh"; supprimer_dossier "$1" a-garder.txt`, 'bash', cible], { encoding: 'utf8' });
    assert.strictEqual(r.status, 1, `« ${cible} » aurait dû être refusé`); assert.match(r.stderr, /Refus/);
  }
  // Sans fichier témoin indiqué, même un chemin de la liste est refusé
  assert.strictEqual(spawnSync('bash', ['-c', `. "${RACINE}/installation/linux/commun.sh"; supprimer_dossier /opt/netcarto ""`], { encoding: 'utf8' }).status, 1);
  assert.ok(fs.existsSync(temoin)); fs.rmSync(d, { recursive: true });
});

test('Installation Linux : service systemd, compte sans privilège, mise à jour, retour arrière, désinstallation', { skip: !disponible && 'Docker indisponible', timeout: 900000 }, async t => {
  // --- Préparation, sur la machine de test : copie du dépôt avec ses dépendances, archive Node.js vérifiée ---
  const prep = fs.mkdtempSync(path.join(os.tmpdir(), 'netcarto-linux-')), depot = path.join(prep, 'depot');
  t.after(() => { spawnSync('docker', ['rm', '-f', NOM]); fs.rmSync(prep, { recursive: true, force: true }); });
  fs.mkdirSync(depot);
  execFileSync('bash', ['-c', `cd "${RACINE}" && tar -cf - --exclude=node_modules --exclude=tests --exclude=donnees-locales index.html css js serveur connecteurs installation | tar -xf - -C "${depot}"`]);
  for (const partie of ['serveur', 'connecteurs']) execFileSync('npm', ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: path.join(depot, partie), stdio: 'ignore' });
  const archive = execFileSync('bash', ['-c', `. "${RACINE}/installation/linux/commun.sh"; telecharger_node "${prep}" x64`], { encoding: 'utf8' }).trim();
  assert.match(archive, /^node-v22\.\d+\.\d+-linux-x64\.tar\.gz$/, 'archive Node.js téléchargée et vérifiée par le script');
  execFileSync('chmod', ['-R', 'a+rX', prep]);
  if (spawnSync('docker', ['run', '-d', '--name', NOM, '--privileged', '--cgroupns=host', '-v', '/sys/fs/cgroup:/sys/fs/cgroup:rw', '--tmpfs', '/run', '--tmpfs', '/run/lock', '--tmpfs', '/tmp:exec', '-v', `${prep}:/src:ro`, IMAGE], { stdio: 'ignore' }).status !== 0) return t.skip('conteneur privilégié refusé');
  for (let i = 0; i < 30 && !/running|degraded/.test(dans('systemctl is-system-running').sortie); i++) await new Promise(r => setTimeout(r, 1000));
  const installer = `bash /src/depot/installation/linux/installer.sh --hors-ligne --node /src/${archive}`;

  await t.test('première installation', () => {
    const s = ok(installer);
    assert.match(s, /NetCarto \d+\.\d+\.\d+ est en service/); assert.match(s, /créez le compte administrateur avec ce code[\s\S]*[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/);
    assert.strictEqual(ok('systemctl is-active netcarto'), 'active'); assert.strictEqual(ok('systemctl is-enabled netcarto'), 'enabled');
    assert.strictEqual(ok('for p in /proc/[0-9]*; do if [ "$(cat $p/comm 2>/dev/null)" = node ]; then stat -c %U $p; fi; done | sort -u'), 'netcarto', 'le serveur tourne sous le compte du service');
    assert.strictEqual(ok('stat -c "%U:%G %a" /etc/netcarto/netcarto.toml'), 'root:netcarto 640');
    assert.strictEqual(ok('stat -c "%U:%G %a" /etc/netcarto/netcarto.env'), 'root:root 600');
    assert.strictEqual(ok('stat -c "%U:%G %a" /var/lib/netcarto'), 'netcarto:netcarto 750');
    assert.strictEqual(ok('find /var/lib/netcarto ! -user netcarto | wc -l'), '0');
    assert.strictEqual(ok('find /opt/netcarto \\( ! -user root -o -perm -o+w \\) ! -type l | wc -l'), '0', 'le programme n\'est modifiable que par root');
    assert.strictEqual(ok('getent passwd netcarto | cut -d: -f7'), '/usr/sbin/nologin');
    assert.match(ok('netcarto sante'), /en marche/);
    assert.ok(!fs.existsSync('/opt/netcarto.nouveau'));
  });
  await t.test('fichier du service : accepté par systemd, bien cloisonné', () => {
    const v = dans('systemd-analyze verify /etc/systemd/system/netcarto.service 2>&1 | grep -i "netcarto.service" || true').sortie.trim();
    assert.strictEqual(v, '', 'systemd ne doit rien reprocher au fichier du service');
    const niveau = parseFloat(/Overall exposure level for netcarto\.service: ([\d.]+)/.exec(ok('systemd-analyze security netcarto --no-pager | tail -n 2'))[1]);
    assert.ok(niveau < 3.5, `niveau d'exposition ${niveau} (0 = cloisonné, 10 = ouvert)`);
    // Le service ne peut écrire que dans son dossier de données
    assert.match(ok('systemctl show netcarto -p ProtectSystem -p ReadWritePaths -p NoNewPrivileges -p User'), /ProtectSystem=strict[\s\S]*ReadWritePaths=\/var\/lib\/netcarto[\s\S]*NoNewPrivileges=yes|User=netcarto/);
  });
  await t.test('exploitation : compte, sauvegarde, réglages modifiés', () => {
    assert.match(ok(`NETCARTO_MOT_DE_PASSE=${MDP} netcarto compte admin`), /Compte « admin » créé/);
    assert.match(ok('netcarto sauvegarde'), /Sauvegarde faite/);
    assert.strictEqual(ok('find /var/lib/netcarto ! -user netcarto | wc -l'), '0', 'les commandes lancées en root n\'écrivent jamais en root');
    ok('sed -i "s/^port = 8443/port = 8444/" /etc/netcarto/netcarto.toml && systemctl restart netcarto');
    ok('for i in $(seq 1 20); do netcarto sante >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1');
    assert.match(ok('netcarto sante'), /:8444/);
  });
  await t.test('mise à jour : réglages et données gardés, sauvegarde faite avant', () => {
    const avant = ok('netcarto sauvegardes | grep -c manuelle');
    const s = ok(`bash /src/depot/installation/linux/mettre-a-jour.sh --hors-ligne --node /src/${archive}`);
    assert.match(s, /Mise à jour de l'installation existante/); assert.match(s, /Réglages existants gardés/); assert.doesNotMatch(s, /créez le compte administrateur/);
    assert.match(ok('grep "^port" /etc/netcarto/netcarto.toml'), /8444/);
    assert.strictEqual(+ok('netcarto sauvegardes | grep -c manuelle'), +avant + 1);
    assert.match(ok(`NETCARTO_MOT_DE_PASSE=${MDP} netcarto compte admin`), /Mot de passe de « admin » changé/, 'le compte existe toujours');
    assert.strictEqual(ok('ls -d /opt/netcarto.* 2>/dev/null | wc -l'), '0', 'aucun dossier provisoire ne reste');
    assert.strictEqual(dans('bash /src/depot/installation/linux/installer.sh --option-inconnue').code, 1);
  });
  await t.test('mise à jour vers une version qui ne démarre pas : retour automatique à la précédente', () => {
    ok('rm -rf /tmp/casse && cp -a /src/depot /tmp/casse && sed -i "1i throw new Error(\\"version cassée pour l\'essai\\");" /tmp/casse/serveur/app.js');
    const r = dans(`bash /tmp/casse/installation/linux/mettre-a-jour.sh --hors-ligne --node /src/${archive}`);
    assert.strictEqual(r.code, 1); assert.match(r.sortie, /version précédente a été remise en service/);
    assert.match(ok('netcarto sante'), /en marche/); assert.strictEqual(ok('grep -c "version cassée" /opt/netcarto/serveur/app.js || true'), '0');
    assert.strictEqual(ok('ls -d /opt/netcarto.* 2>/dev/null | wc -l'), '0');
  });
  await t.test('désinstallation simple : programme et service retirés, données et réglages gardés', () => {
    const s = ok('bash /src/depot/installation/linux/desinstaller.sh');
    assert.match(s, /Les données et les réglages sont gardés/);
    assert.strictEqual(ok('ls -d /opt/netcarto /etc/systemd/system/netcarto.service /usr/local/bin/netcarto 2>/dev/null | wc -l'), '0');
    assert.strictEqual(dans('systemctl is-active netcarto').sortie.trim(), 'inactive');
    assert.strictEqual(ok('ls /var/lib/netcarto/netcarto.sqlite /etc/netcarto/netcarto.toml | wc -l'), '2'); ok('id netcarto');
  });
  await t.test('garde-fou : un dossier qui n\'est pas celui de NetCarto n\'est jamais supprimé', () => {
    // Un /opt/netcarto étranger (sans fichier témoin) : ni l'installation ni la désinstallation n'y touchent
    ok('mkdir -p /opt/netcarto && echo precieux > /opt/netcarto/document.txt');
    const i = dans(installer); assert.strictEqual(i.code, 1); assert.match(i.sortie, /existe déjà et n'a pas été créé par ce script/);
    const d = dans('bash /src/depot/installation/linux/desinstaller.sh'); assert.strictEqual(d.code, 1); assert.match(d.sortie, /Refus de supprimer « \/opt\/netcarto »/);
    assert.strictEqual(ok('cat /opt/netcarto/document.txt'), 'precieux'); ok('rm -r /opt/netcarto');
    // Un lien vers un autre dossier, même s'il contient un fichier témoin : refusé, la cible reste intacte
    ok('mkdir -p /srv/ailleurs && touch /srv/ailleurs/.installation-netcarto /srv/ailleurs/important && ln -s /srv/ailleurs /opt/netcarto');
    const l = dans('bash /src/depot/installation/linux/desinstaller.sh'); assert.strictEqual(l.code, 1); assert.match(l.sortie, /lien vers un autre emplacement/);
    ok('test -f /srv/ailleurs/important && rm /opt/netcarto');
    // Dossier de données remplacé par un lien : --tout refuse aussi
    ok('mv /var/lib/netcarto /var/lib/netcarto.vrai && ln -s /srv/ailleurs /var/lib/netcarto && touch /srv/ailleurs/netcarto.sqlite');
    const t2 = dans('bash /src/depot/installation/linux/desinstaller.sh --tout --oui'); assert.strictEqual(t2.code, 1); assert.match(t2.sortie, /Refus de supprimer « \/var\/lib\/netcarto »/);
    ok('test -f /srv/ailleurs/important && rm /var/lib/netcarto && mv /var/lib/netcarto.vrai /var/lib/netcarto');
    // Les réglages ont été supprimés par --tout (dossier légitime) : on les remet pour la suite
    assert.strictEqual(dans('test -e /etc/netcarto').code, 1);
  });
  await t.test('réinstallation sur des données existantes, puis désinstallation complète après confirmation', () => {
    const s = ok(installer);
    assert.doesNotMatch(s, /créez le compte administrateur/, 'les comptes existants sont retrouvés'); assert.match(s, /Réglages par défaut posés/);
    assert.match(ok('netcarto sante'), /:8443/);
    const non = dans('bash /src/depot/installation/linux/desinstaller.sh --tout', 'non\n'); assert.strictEqual(non.code, 1); assert.match(non.sortie, /annulée : rien n'a été modifié/);
    assert.strictEqual(ok('systemctl is-active netcarto'), 'active');
    const oui = ok('bash /src/depot/installation/linux/desinstaller.sh --tout', 'SUPPRIMER\n'); assert.match(oui, /NetCarto est désinstallé/);
    assert.strictEqual(ok('ls -d /opt/netcarto /var/lib/netcarto /etc/netcarto /etc/systemd/system/netcarto.service /usr/local/bin/netcarto 2>/dev/null | wc -l'), '0');
    assert.strictEqual(dans('id netcarto').code, 1, 'le compte système est retiré');
  });
});
