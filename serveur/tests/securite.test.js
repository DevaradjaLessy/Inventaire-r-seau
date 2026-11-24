/* Sécurité du serveur : contrôle du contenu reçu, limitation des tentatives, absence d'indice sur les comptes,
   taille des requêtes, en-têtes, coût des empreintes, mots de passe courants, adresse réelle derrière un proxy,
   événements de sécurité au journal, droits des fichiers. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), tls = require('tls');
const { requete, serveurDeTest, dossierTemporaire, cookieDe, demo, RACINE, MDP } = require('./aide');
const { demarrer } = require('../app');
const { hacher, verifier, controlerMotDePasse, reglerCout } = require('../securite/mots-de-passe');
const { DEFAUTS } = require('../config');

const connexion = (s, identifiant, motDePasse, entetes = {}) => requete('POST', s.api + '/session', { identifiant, motDePasse }, entetes);
const lot = (s, changements) => requete('POST', s.api + '/lots', { type: 'edit', texte: 'Essai', changements }, s.tech);

test('Contenu contrôlé par le serveur : couleur, image et date invalides refusées, même envoyées directement à l\'API', async t => {
  const s = await serveurDeTest(t, { config: { demo: true } });
  const vlan = (await requete('GET', s.api + '/vlans', undefined, s.tech)).json[0], etage = (await requete('GET', s.api + '/etages', undefined, s.tech)).json[0];
  const eq = (await requete('GET', s.api + '/equipements', undefined, s.tech)).json[0], cable = (await requete('GET', s.api + '/cables', undefined, s.tech)).json[0];
  const modif = (collection, cle, avant, apres) => lot(s, [{ collection, op: 'modifier', cle, avant, apres }]);
  const refuses = [
    ['vlans', vlan.id, vlan, { ...vlan, color: 'red;background:url(//exemple.invalid)' }],
    ['vlans', vlan.id, vlan, { ...vlan, color: '"><img src=x onerror=alert(1)>' }],
    ['cables', cable.id, cable, { ...cable, color: 'javascript:alert(1)' }],
    ['floors', etage.id, etage, { ...etage, planImage: 'javascript:alert(1)' }],
    ['floors', etage.id, etage, { ...etage, planImage: 'https://exemple.invalid/suivi.png' }],
    ['floors', etage.id, etage, { ...etage, planImage: 'data:text/html;base64,PHNjcmlwdD4=' }],
    ['devices', eq.id, eq, { ...eq, installDate: '"><svg onload=alert(1)>' }],
    ['devices', eq.id, eq, { ...eq, installDate: '2026-13-45' }],
    ['devices', eq.id, eq, { ...eq, notes: 'x'.repeat(20001) }],
  ];
  for (const [c, cle, avant, apres] of refuses) { const r = await modif(c, cle, avant, apres); assert.ok([400, 422].includes(r.code), `${c} ${JSON.stringify(apres).slice(0, 90)} → ${r.code}`); }
  // Les valeurs légitimes passent toujours
  assert.strictEqual((await modif('vlans', vlan.id, vlan, { ...vlan, color: '#1a2b3c' })).code, 200);
  assert.strictEqual((await modif('floors', etage.id, etage, { ...etage, planImage: 'data:image/png;base64,iVBORw0KGgo=' })).code, 200);
  assert.strictEqual((await modif('devices', eq.id, eq, { ...eq, installDate: '2025-02-28', notes: 'Texte libre avec <balises> & "guillemets" : gardé tel quel, affiché sans être interprété' })).code, 200);
  // La base relue reste valide pour l'interface
  assert.strictEqual((await requete('GET', s.api + '/base', undefined, s.tech)).code, 200);
});

test('Tentatives limitées par adresse : après trop d\'échecs, l\'adresse attend, même avec le bon mot de passe', async t => {
  let maintenant = Date.now();
  const s = await serveurDeTest(t, { config: { securite: { tentativesParAdresse: 6, fenetreMinutes: 10, echecsMax: 50 } }, options: { horloge: () => maintenant } });
  for (let i = 0; i < 6; i++) assert.strictEqual((await connexion(s, 'compte' + i, 'mauvais-mot-de-passe')).code, 401);
  const bloque = await connexion(s, 'tech', MDP);
  assert.strictEqual(bloque.code, 429); assert.match(bloque.json.erreur, /Trop de tentatives/); assert.ok(+bloque.entetes['retry-after'] > 0 && +bloque.entetes['retry-after'] <= 600);
  for (const [chemin, corps] of [['/recuperation', { compte: 'tech' }], ['/recuperation/mot-de-passe', { jeton: 'x', motDePasse: MDP }], ['/initialisation', { code: 'AAAA-AAAA-AAAA', identifiant: 'x', motDePasse: MDP }]])
    assert.strictEqual((await requete('POST', s.api + chemin, corps)).code, 429, chemin);
  // Une session déjà ouverte n'est pas touchée, et l'attente a une fin
  assert.strictEqual((await requete('GET', s.api + '/revision', undefined, s.admin)).code, 200);
  maintenant += 11 * 60000;
  assert.strictEqual((await connexion(s, 'tech', MDP)).code, 200);
});

test('Aucun indice sur les comptes : compte inconnu, mauvais mot de passe et compte verrouillé répondent pareil', async t => {
  const s = await serveurDeTest(t, { config: { securite: { tentativesParAdresse: 1000 } } });
  for (let i = 0; i < 5; i++) await connexion(s, 'lecteur', 'mauvais-mot-de-passe');
  const reponses = [await connexion(s, 'inconnu', 'mauvais-mot-de-passe'), await connexion(s, 'tech', 'mauvais-mot-de-passe'), await connexion(s, 'lecteur', 'mauvais-mot-de-passe'), await connexion(s, 'lecteur', MDP)];
  for (const r of reponses) assert.deepStrictEqual([r.code, r.json], [reponses[0].code, reponses[0].json]);
  assert.strictEqual(reponses[0].code, 401);
  // Le verrou tient bien, et l'administrateur le voit
  const liste = (await requete('GET', s.api + '/utilisateurs', undefined, s.admin)).json;
  assert.strictEqual(liste.find(u => u.identifiant === 'lecteur').verrouille, true);
});

test('Requêtes sans session : corps limité à 64 Ko ; version du serveur non divulguée', async t => {
  const s = await serveurDeTest(t);
  const gros = await requete('POST', s.api + '/session', { identifiant: 'tech', motDePasse: 'x'.repeat(100000) });
  assert.strictEqual(gros.code, 413);
  assert.strictEqual((await requete('POST', s.api + '/recuperation', { compte: 'y'.repeat(100000) })).code, 413);
  const info = (await requete('GET', s.api + '/info')).json;
  assert.strictEqual(info.version, undefined); assert.strictEqual(info.app, 'NetCarto');
  assert.match((await requete('GET', s.api + '/info', undefined, s.lecteur)).json.version, /^\d+\.\d+\.\d+$/);
});

test('En-têtes de sécurité sur la page et sur l\'API', async t => {
  const s = await serveurDeTest(t, { comptes: false });
  const page = (await requete('GET', s.base + '/')).entetes, api = (await requete('GET', s.api + '/sante')).entetes, js = (await requete('GET', s.base + '/js/main.js')).entetes;
  for (const e of [page, api, js]) { assert.strictEqual(e['x-content-type-options'], 'nosniff'); assert.strictEqual(e['referrer-policy'], 'no-referrer'); assert.strictEqual(e['x-frame-options'], 'DENY'); assert.strictEqual(e['cross-origin-resource-policy'], 'same-origin'); }
  assert.strictEqual(page['cross-origin-opener-policy'], 'same-origin'); assert.match(page['permissions-policy'], /camera=\(\)/);
  assert.strictEqual(api['cache-control'], 'no-store');
  assert.strictEqual(page['x-powered-by'], undefined); assert.strictEqual(api.server, undefined);
  // Aucun gestionnaire d'événement écrit dans le HTML : la politique de sécurité du contenu les bloquerait, et ils n'ont rien à faire là
  const sources = ['index.html', ...fs.readdirSync(path.join(RACINE, 'js'), { recursive: true }).filter(f => f.endsWith('.js') && !f.startsWith('vendor')).map(f => path.join('js', f))];
  for (const f of sources) assert.doesNotMatch(fs.readFileSync(path.join(RACINE, f), 'utf8'), /\son(click|load|error|mouseover|submit)\s*=\s*["'`]/, f);
});

test('Délais du serveur : une connexion lente ou muette est coupée', async t => {
  const s = await serveurDeTest(t, { comptes: false });
  assert.ok(s.app.delais.enTetes <= 15000 && s.app.delais.requete <= 60000 && s.app.delais.repos <= 10000, JSON.stringify(s.app.delais));
});

test('Empreintes des mots de passe : coût recommandé, anciennes empreintes relevées à la connexion', async t => {
  assert.strictEqual(DEFAUTS.securite.coutMotDePasse, 17, 'coût par défaut');
  reglerCout(DEFAUTS.securite.coutMotDePasse);
  const forte = await hacher(MDP);
  assert.match(forte, /^scrypt\$131072\$8\$1\$/, 'coût par défaut : N = 2^17');
  assert.ok(await verifier(MDP, forte)); assert.ok(!(await verifier(MDP + 'x', forte)));
  // Un compte dont l'empreinte date d'un réglage plus faible est remis au niveau courant à sa prochaine connexion
  const s = await serveurDeTest(t, { config: { securite: { coutMotDePasse: 14 } } });
  const avant = s.app.depot.comptes.parIdentifiant('tech').mot_de_passe; assert.match(avant, /^scrypt\$16384\$/);
  const dossier = s.dossier; await s.app.arreter();
  const app2 = await demarrer({ serveur: { hote: '127.0.0.1', port: 0 }, donnees: { dossier }, web: { dossier: RACINE }, https: { actif: false }, securite: { coutMotDePasse: 15 } }, { journal: () => {} });
  t.after(() => app2.arreter());
  assert.strictEqual((await requete('POST', `http://127.0.0.1:${app2.port}/api/v1/session`, { identifiant: 'tech', motDePasse: MDP })).code, 200);
  const apres = app2.depot.comptes.parIdentifiant('tech').mot_de_passe; assert.match(apres, /^scrypt\$32768\$/);
  assert.strictEqual((await requete('POST', `http://127.0.0.1:${app2.port}/api/v1/session`, { identifiant: 'tech', motDePasse: MDP })).code, 200);
});

test('Mots de passe courants refusés', () => {
  for (const faible of ['Motdepasse123!', 'Password12345', 'Azertyuiop123', 'Qwertyuiop!23', 'Netcarto2026!!', 'Administrateur1', 'Bienvenue2026!', '123456789012', 'aaaaaaaaaaaaB1']) assert.ok(controlerMotDePasse(faible), `${faible} aurait dû être refusé`);
  for (const bon of [MDP, 'Nouveau-mot-de-passe-2', 'cheval agrafe batterie correct', 'T9#kLm2$vQ8wZx']) assert.strictEqual(controlerMotDePasse(bon), null, bon);
  assert.match(controlerMotDePasse('alice-Alice-ALICE-1', 'alice'), /identifiant/);
});

test('Derrière un proxy de confiance, l\'adresse réelle du poste est retenue ; sinon l\'en-tête est ignoré', async t => {
  const direct = await serveurDeTest(t, { config: { securite: { tentativesParAdresse: 3 } } });
  for (let i = 0; i < 3; i++) await connexion(direct, 'x', 'mauvais-mot-de-passe', { 'X-Forwarded-For': '198.51.100.' + i });
  assert.strictEqual((await connexion(direct, 'tech', MDP, { 'X-Forwarded-For': '198.51.100.99' })).code, 429, 'sans proxy déclaré, changer l\'en-tête ne permet pas de contourner la limite');
  const proxy = await serveurDeTest(t, { config: { serveur: { hote: '127.0.0.1', port: 0, proxyDeConfiance: true }, securite: { tentativesParAdresse: 3 } } });
  for (let i = 0; i < 3; i++) await connexion(proxy, 'x', 'mauvais-mot-de-passe', { 'X-Forwarded-For': '203.0.113.7, 198.51.100.1' });
  assert.strictEqual((await connexion(proxy, 'tech', MDP, { 'X-Forwarded-For': '198.51.100.1' })).code, 429);
  assert.strictEqual((await connexion(proxy, 'tech', MDP, { 'X-Forwarded-For': '198.51.100.2' })).code, 200, 'un autre poste n\'est pas pénalisé');
  const audit = (await requete('GET', proxy.api + '/audit?action=connexion&limite=5', undefined, proxy.admin)).json;
  assert.ok(audit.some(a => a.ip === '198.51.100.2'), JSON.stringify(audit.map(a => a.ip)));
});

test('Événements de sécurité écrits au journal du service, sans retour à la ligne injecté', async t => {
  const lignes = [];
  const s = await serveurDeTest(t, { config: { securite: { tentativesParAdresse: 4 } }, options: { journal: l => lignes.push(l) } });
  await connexion(s, 'tech\nSECURITE faux_evenement', 'mauvais-mot-de-passe');
  for (let i = 0; i < 4; i++) await connexion(s, 'tech', 'mauvais-mot-de-passe');
  const secu = lignes.filter(l => l.startsWith('SECURITE '));
  assert.ok(secu.some(l => /^SECURITE echec_connexion compte=tech adresse=\S+$/.test(l)), secu.join(' | '));
  assert.ok(secu.some(l => /^SECURITE adresse_bloquee adresse=\S+/.test(l)), secu.join(' | '));
  assert.ok(secu.every(l => !/[\r\n]/.test(l)) && !secu.some(l => /^SECURITE faux_evenement/.test(l)));
  assert.ok(!lignes.join('\n').includes('mauvais-mot-de-passe'), 'aucun mot de passe dans le journal');
});

test('Fichiers du serveur lisibles par le seul compte du service ; TLS 1.2 au minimum ; cookie lié à l\'hôte en HTTPS', { skip: process.platform === 'win32' && 'droits POSIX' }, async t => {
  const dossier = dossierTemporaire(t);
  const app = await demarrer({ serveur: { hote: '127.0.0.1', port: 0 }, donnees: { dossier }, web: { dossier: RACINE }, securite: { coutMotDePasse: 14 } }, { journal: () => {} });
  t.after(() => app.arreter());
  await app.securite.creerUtilisateur({ identifiant: 'admin', nom: 'A', role: 'administrateur', motDePasse: MDP });
  app.sauvegardes.creer('manuelle');
  const mode = f => fs.statSync(f).mode & 0o077;
  assert.strictEqual(mode(path.join(dossier, 'netcarto.sqlite')), 0, 'la base'); assert.strictEqual(mode(path.join(dossier, 'certificats', 'netcarto.key')), 0, 'la clé privée');
  for (const f of fs.readdirSync(path.join(dossier, 'sauvegardes'))) assert.strictEqual(mode(path.join(dossier, 'sauvegardes', f)), 0, f);
  const ca = fs.readFileSync(path.join(dossier, 'certificats', 'netcarto.crt'));
  const r = await requete('POST', `https://127.0.0.1:${app.port}/api/v1/session`, { identifiant: 'admin', motDePasse: MDP }, {}, { ca });
  const cookie = r.entetes['set-cookie'][0];
  assert.match(cookie, /^__Host-netcarto_session=/); assert.match(cookie, /HttpOnly/); assert.match(cookie, /Secure/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /Path=\//); assert.doesNotMatch(cookie, /Domain=/);
  assert.strictEqual((await requete('GET', `https://127.0.0.1:${app.port}/api/v1/revision`, undefined, cookieDe(r), { ca })).code, 200);
  await assert.rejects(new Promise((ok, ko) => { const c = tls.connect({ host: '127.0.0.1', port: app.port, ca, maxVersion: 'TLSv1.1', minVersion: 'TLSv1' }, ok); c.on('error', ko); }), /protocol|version|alert/i);
});

/* ---------- Attaques rejouées (campagne du 22 novembre 2026) ---------- */
test('Attaque par rafale : des connexions lancées en même temps ne dépassent pas la limite par adresse', async t => {
  const s = await serveurDeTest(t, { config: { securite: { tentativesParAdresse: 20, echecsMax: 1000 } } });
  const rafale = await Promise.all(Array.from({ length: 80 }, (_, i) => connexion(s, 'inconnu' + i, 'mauvais-mot-de-passe')));
  const evalues = rafale.filter(r => r.code === 401).length;
  assert.ok(evalues <= 20, `${evalues} tentatives évaluées pour une limite de 20`);
  assert.strictEqual(rafale.filter(r => r.code === 429).length, 80 - evalues);
});

test('Attaque par rafale sur un compte : le verrou tient, le bon mot de passe glissé dans la rafale est refusé', async t => {
  const s = await serveurDeTest(t, { config: { securite: { tentativesParAdresse: 100000, echecsMax: 5 } } });
  const mots = Array.from({ length: 60 }, (_, i) => (i === 45 ? MDP : 'mauvais-mot-de-passe-' + i));
  const rafale = await Promise.all(mots.map(m => connexion(s, 'lecteur', m)));
  assert.strictEqual(rafale.filter(r => r.code === 200).length, 0, 'aucune connexion ne doit aboutir');
  assert.strictEqual(s.app.securite.trouver('lecteur').verrouille, true);
  // Une connexion légitime isolée, sur un autre compte, n'est pas gênée par la rafale
  assert.strictEqual((await connexion(s, 'tech', MDP)).code, 200);
});

test('Session volée : après cinq mauvais « mot de passe actuel », le compte est verrouillé et ses sessions fermées', async t => {
  const s = await serveurDeTest(t, { config: { securite: { tentativesParAdresse: 100000, echecsMax: 5 } } });
  const codes = [];
  for (let i = 0; i < 8; i++) codes.push((await requete('PUT', s.api + '/session/mot-de-passe', { actuel: 'mauvais-' + i, nouveau: 'Nouveau-mot-de-passe-2' }, s.tech)).code);
  assert.deepStrictEqual(codes.slice(0, 5), [403, 403, 403, 403, 403]); assert.deepStrictEqual(codes.slice(5), [401, 401, 401], 'la session est fermée : plus aucun essai possible');
  assert.strictEqual(s.app.securite.trouver('tech').verrouille, true);
  assert.strictEqual((await connexion(s, 'tech', MDP)).code, 401, 'le mot de passe n\'a pas changé, et le compte attend la fin du verrou');
  // Les essais comptent aussi dans la limite par adresse
  const s2 = await serveurDeTest(t, { config: { securite: { tentativesParAdresse: 3, echecsMax: 50 } } });
  for (let i = 0; i < 3; i++) await requete('PUT', s2.api + '/session/mot-de-passe', { actuel: 'mauvais-' + i, nouveau: 'Nouveau-mot-de-passe-2' }, s2.tech);
  assert.strictEqual((await requete('PUT', s2.api + '/session/mot-de-passe', { actuel: MDP, nouveau: 'Nouveau-mot-de-passe-2' }, s2.tech)).code, 429);
});

test('Adresse de courriel : ni balise, ni retour à la ligne, ni commande pour le serveur d\'envoi', async t => {
  const s = await serveurDeTest(t);
  for (const mauvais of ['"><img/src=x/onerror=alert(1)>@exemple.test', 'a@exemple.test\r\nBcc:victime@exemple.test', 'a@exemple.test>\r\nRCPT TO:<b@exemple.test', 'a<b@exemple.test', 'a@exemple.test;b@exemple.test', "a'@exemple.test", 'a@exemple..test'])
    assert.strictEqual((await requete('POST', s.api + '/utilisateurs', { identifiant: 'c' + mauvais.length, courriel: mauvais, role: 'lecture', motDePasse: MDP }, s.admin)).code, 422, JSON.stringify(mauvais));
  for (const bon of ['prenom.nom+netcarto@exemple-entreprise.test', 'a_b-c@sous.domaine.exemple.test'])
    assert.strictEqual((await requete('POST', s.api + '/utilisateurs', { identifiant: 'ok' + bon.length, courriel: bon, role: 'lecture', motDePasse: MDP }, s.admin)).code, 200, bon);
});

/* ---------- Seconde passe : un attaquant plus patient ---------- */
test('Limite par adresse : une plage IPv6 entière compte pour une seule adresse, et une adresse IPv4 n\'a qu\'une écriture', () => {
  const { creerLimiteur, cleAdresse } = require('../securite/limiteur');
  assert.strictEqual(cleAdresse('::ffff:192.0.2.7'), '192.0.2.7'); assert.strictEqual(cleAdresse('192.0.2.7'), '192.0.2.7');
  assert.strictEqual(cleAdresse('2001:db8:1:2:aaaa:bbbb:cccc:dddd'), cleAdresse('2001:db8:1:2::1'), 'même réseau /64');
  assert.notStrictEqual(cleAdresse('2001:db8:1:2::1'), cleAdresse('2001:db8:1:3::1'));
  assert.strictEqual(cleAdresse('::1'), cleAdresse('0:0:0:0:0:0:0:1'));
  const l = creerLimiteur({ max: 3, fenetreMs: 60000 });
  for (let i = 0; i < 3; i++) assert.strictEqual(l.entrer(`2001:db8:1:2::${i + 1}`), 0);
  assert.ok(l.entrer('2001:db8:1:2:ffff::9') > 0, 'changer d\'adresse dans la même plage ne remet pas le compteur à zéro');
});

test('Téléchargement d\'une sauvegarde : inscrit au journal d\'audit (la base entière sort du serveur)', async t => {
  const s = await serveurDeTest(t, { config: { demo: true } });
  const { nom } = (await requete('POST', s.api + '/sauvegardes', {}, s.admin)).json;
  assert.strictEqual((await requete('GET', s.api + '/sauvegardes/' + nom, undefined, s.admin)).code, 200);
  const a = (await requete('GET', s.api + '/audit?action=sauvegarde_telecharger', undefined, s.admin)).json;
  assert.strictEqual(a.length, 1); assert.strictEqual(a[0].identifiant, 'admin'); assert.match(a[0].libelle, new RegExp(nom.replace(/\./g, '\\.')));
});

test('Corps de requête : 25 Mo seulement pour un lot ou une base ; 64 Ko pour tout le reste, même connecté', async t => {
  const s = await serveurDeTest(t);
  const gros = 'x'.repeat(200000);
  assert.strictEqual((await requete('PUT', s.api + '/session/mot-de-passe', { actuel: gros, nouveau: gros }, s.lecteur)).code, 413);
  assert.strictEqual((await requete('POST', s.api + '/utilisateurs', { identifiant: 'x', nom: gros, role: 'lecture', motDePasse: MDP }, s.admin)).code, 413);
  assert.strictEqual((await requete('POST', s.api + '/lots', { type: 'edit', texte: gros, changements: [] }, s.lecteur)).code, 403, 'le rôle est contrôlé avant de lire le corps');
  assert.notStrictEqual((await requete('POST', s.api + '/lots', { type: 'edit', texte: gros.slice(0, 1000), changements: [], bourrage: gros }, s.tech)).code, 413);
});

test('Historique : le type d\'une entrée est pris dans une liste fermée, jamais un texte libre', async t => {
  // Ce champ s'affiche dans le tableau de bord de tous les comptes : un texte libre permettait d'y glisser du balisage
  const s = await serveurDeTest(t);
  await requete('PUT', s.api + '/base', await demo(), s.admin);
  const entree = type => ({ changements: [{ collection: 'history', op: 'creer', cle: 'h-essai-' + type.length, apres: { id: 'h-essai-' + type.length, ts: Date.now() + 86400000, type, text: 'Essai', ref: null } }] });
  for (const mauvais of ['<div id="user-new"><input name="u-role" value="administrateur"></div>', 'Edit', 'x', '']) {
    const r = await requete('POST', s.api + '/lots', entree(mauvais), s.tech);
    assert.strictEqual(r.code, 400, `type « ${mauvais.slice(0, 20)} » : ${r.texte}`); assert.match(r.json.erreur, /type/);
  }
  assert.strictEqual((await requete('POST', s.api + '/lots', entree('edit'), s.tech)).code, 200);
  const base = (await requete('GET', s.api + '/base', undefined, s.admin)).json;
  assert.ok(base.history.every(h => ['add', 'move', 'remove', 'edit', 'stock', 'import', 'catalog'].includes(h.type)));
  // Même contrôle quand toute la base est remplacée (import d'un fichier piégé)
  const piege = await demo(); piege.history[0].type = '<img src=x onerror=alert(1)>';
  assert.strictEqual((await requete('PUT', s.api + '/base', piege, s.admin)).code, 400);
});
test('Sessions par compte : vingt au plus, les plus anciennes sont fermées', async t => {
  const s = await serveurDeTest(t, { config: { securite: { tentativesParAdresse: 100000 } } });
  const premiere = cookieDe(await connexion(s, 'tech', MDP));
  for (let i = 0; i < 21; i++) assert.strictEqual((await connexion(s, 'tech', MDP)).code, 200);
  assert.strictEqual((await requete('GET', s.api + '/revision', undefined, premiere)).code, 401, 'la plus ancienne session a été fermée');
  assert.ok(s.app.depot.comptes.nombreSessionsDe(s.app.securite.trouver('tech').id) <= 20);
});

test('Connexion muette : coupée par le serveur en moins de vingt secondes ; nombre de connexions plafonné', async t => {
  const s = await serveurDeTest(t, { comptes: false });
  assert.ok(s.app.delais.connexions > 0 && s.app.delais.connexions <= 2000);
  const net = require('net'), debut = Date.now();
  const duree = await new Promise(ok => { const c = net.connect(s.app.port, '127.0.0.1', () => c.write('GET /api/v1/sante HTTP/1.1\r\nHost: x\r\nX-Lent: ')); c.resume(); c.on('close', () => ok(Date.now() - debut)); c.on('error', () => {}); setTimeout(() => { c.destroy(); ok(Infinity); }, 25000); });
  assert.ok(duree < 20000, `connexion muette gardée ${duree} ms`);
});
