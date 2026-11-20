/* Administration : adresse de courriel des comptes, connexion par courriel, récupération d'un mot de passe
   (lien remis par un administrateur, ou envoyé par courriel si un serveur d'envoi est réglé), page /admin. */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const net = require('net');
const { requete, serveurDeTest, cookieDe, MDP } = require('./aide');
const { chargerConfig } = require('../config');

const NOUVEAU = 'Nouveau-mot-de-passe-2';   // mot de passe fictif
/* Faux serveur d'envoi : parle juste assez de SMTP pour recevoir un message, et le garde */
function fauxSmtp(t) {
  const recus = [], srv = net.createServer(sock => {
    let tampon = '', corps = null, msg = { de: '', a: [], auth: '' };
    sock.write('220 simulateur ESMTP\r\n');
    sock.on('data', d => {
      tampon += d.toString('utf8');
      for (;;) {
        if (corps !== null) { const fin = tampon.indexOf('\r\n.\r\n'); if (fin < 0) return; msg.texte = corps + tampon.slice(0, fin); tampon = tampon.slice(fin + 5); corps = null; recus.push(msg); msg = { de: '', a: [], auth: msg.auth }; sock.write('250 message accepte\r\n'); continue; }
        const i = tampon.indexOf('\r\n'); if (i < 0) return;
        const ligne = tampon.slice(0, i); tampon = tampon.slice(i + 2);
        if (/^EHLO/i.test(ligne)) sock.write('250-simulateur\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (/^AUTH PLAIN/i.test(ligne)) { msg.auth = Buffer.from(ligne.split(' ')[2] || '', 'base64').toString('utf8'); sock.write('235 ok\r\n'); }
        else if (/^MAIL FROM:/i.test(ligne)) { msg.de = ligne.slice(10); sock.write('250 ok\r\n'); }
        else if (/^RCPT TO:/i.test(ligne)) { msg.a.push(ligne.slice(8)); sock.write('250 ok\r\n'); }
        else if (/^DATA/i.test(ligne)) { corps = ''; sock.write('354 allez-y\r\n'); }
        else if (/^QUIT/i.test(ligne)) { sock.write('221 au revoir\r\n'); sock.end(); }
        else sock.write('250 ok\r\n');
      }
    });
    sock.on('error', () => {});
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => { t.after(() => srv.close()); ok({ port: srv.address().port, recus }); }));
}
const attendre = async (cond, ms = 4000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (cond()) return true; await new Promise(r => setTimeout(r, 30)); } return false; };
const connexion = (s, identifiant, motDePasse) => requete('POST', s.api + '/session', { identifiant, motDePasse });

test('Comptes : adresse de courriel unique, connexion par identifiant ou par courriel', async t => {
  const s = await serveurDeTest(t);
  const cree = await requete('POST', s.api + '/utilisateurs', { identifiant: 'alice', nom: 'Alice', courriel: 'Alice@exemple.test', role: 'technicien', motDePasse: MDP }, s.admin);
  assert.strictEqual(cree.code, 200, cree.texte); assert.strictEqual(cree.json.courriel, 'alice@exemple.test', 'le courriel est gardé en minuscules');
  assert.strictEqual((await connexion(s, 'alice', MDP)).code, 200);
  assert.strictEqual((await connexion(s, 'ALICE@EXEMPLE.TEST', MDP)).json.utilisateur.identifiant, 'alice', 'connexion par courriel, sans tenir compte de la casse');
  assert.strictEqual((await connexion(s, 'alice@exemple.test', 'mauvais-mot-de-passe')).code, 401);
  const doublon = await requete('POST', s.api + '/utilisateurs', { identifiant: 'alice2', courriel: 'ALICE@exemple.test', role: 'lecture', motDePasse: MDP }, s.admin);
  assert.strictEqual(doublon.code, 422); assert.match(doublon.json.erreur, /courriel déjà utilisée/i);
  for (const mauvais of ['alice', 'a@b', 'deux@@exemple.test', 'avec espace@exemple.test']) assert.strictEqual((await requete('POST', s.api + '/utilisateurs', { identifiant: 'x' + mauvais.length, courriel: mauvais, role: 'lecture', motDePasse: MDP }, s.admin)).code, 422, mauvais);
  // Le courriel se modifie et s'efface ; il figure dans la liste des comptes
  const liste = (await requete('GET', s.api + '/utilisateurs', undefined, s.admin)).json, alice = liste.find(u => u.identifiant === 'alice'), tech = liste.find(u => u.identifiant === 'tech');
  assert.strictEqual(alice.courriel, 'alice@exemple.test'); assert.strictEqual(tech.courriel, '');
  assert.strictEqual((await requete('PUT', s.api + '/utilisateurs/' + tech.id, { courriel: 'alice@exemple.test' }, s.admin)).code, 422);
  assert.strictEqual((await requete('PUT', s.api + '/utilisateurs/' + tech.id, { courriel: 'tech@exemple.test' }, s.admin)).json.courriel, 'tech@exemple.test');
  assert.strictEqual((await requete('PUT', s.api + '/utilisateurs/' + tech.id, { courriel: '' }, s.admin)).json.courriel, '');
});

test('Mot de passe perdu, sans serveur d\'envoi : l\'administrateur remet un lien à usage unique, valable 30 minutes', async t => {
  let maintenant = Date.now();
  const s = await serveurDeTest(t, { options: { horloge: () => maintenant } });
  assert.strictEqual((await requete('GET', s.api + '/session')).json.recuperationParCourriel, false);
  assert.strictEqual((await requete('POST', s.api + '/recuperation', { compte: 'tech' })).code, 200, 'la demande ne révèle rien et n\'échoue pas');
  const tech = (await requete('GET', s.api + '/utilisateurs', undefined, s.admin)).json.find(u => u.identifiant === 'tech');
  assert.strictEqual((await requete('POST', s.api + '/recuperation/lien', { id: tech.id }, s.tech)).code, 403);
  const lien = await requete('POST', s.api + '/recuperation/lien', { id: tech.id }, s.admin);
  assert.strictEqual(lien.code, 200); assert.match(lien.json.lien, /^\/\?reinitialisation=[A-Za-z0-9_-]{40,}$/); assert.ok(lien.json.expire > maintenant);
  const jeton = lien.json.lien.split('=')[1];
  // Mot de passe trop faible : refusé, le lien reste valable
  const faible = await requete('POST', s.api + '/recuperation/mot-de-passe', { jeton, motDePasse: 'court' });
  assert.strictEqual(faible.code, 422); assert.match(faible.json.erreur, /12 caractères/);
  const ok = await requete('POST', s.api + '/recuperation/mot-de-passe', { jeton, motDePasse: NOUVEAU });
  assert.strictEqual(ok.code, 200, ok.texte); assert.strictEqual(ok.json.identifiant, 'tech');
  assert.strictEqual((await connexion(s, 'tech', MDP)).code, 401, 'l\'ancien mot de passe ne marche plus');
  assert.strictEqual((await connexion(s, 'tech', NOUVEAU)).code, 200);
  assert.strictEqual((await requete('GET', s.api + '/revision', undefined, s.tech)).code, 401, 'les sessions ouvertes avec l\'ancien mot de passe sont fermées');
  const rejoue = await requete('POST', s.api + '/recuperation/mot-de-passe', { jeton, motDePasse: 'Encore-un-autre-mot-3' });
  assert.strictEqual(rejoue.code, 422); assert.match(rejoue.json.erreur, /invalide ou expiré/);
  // Lien expiré, et lien d'un compte verrouillé : le second déverrouille
  const vieux = (await requete('POST', s.api + '/recuperation/lien', { id: tech.id }, s.admin)).json.lien.split('=')[1];
  maintenant += 31 * 60000;
  const admin2 = cookieDe(await connexion(s, 'admin', MDP));
  assert.strictEqual((await requete('POST', s.api + '/recuperation/mot-de-passe', { jeton: vieux, motDePasse: NOUVEAU }, {})).code, 422);
  const audit = (await requete('GET', s.api + '/audit?limite=200', undefined, admin2)).json.map(a => a.action);
  assert.ok(audit.includes('lien_reinitialisation') && audit.includes('mot_de_passe_reinitialise'), audit.join(','));
  assert.doesNotMatch(JSON.stringify((await requete('GET', s.api + '/audit?limite=200', undefined, admin2)).json), new RegExp(jeton), 'le lien ne figure jamais dans le journal');
});

test('Mot de passe perdu, avec serveur d\'envoi : le lien part par courriel, sans rien révéler sur les comptes', async t => {
  const smtp = await fauxSmtp(t);
  const s = await serveurDeTest(t, { config: { courriel: { hote: '127.0.0.1', port: smtp.port, securite: 'aucune', utilisateur: 'netcarto', motDePasse: 'secret-fictif', expediteur: 'NetCarto <netcarto@exemple.test>', adresse: 'https://netcarto.exemple.test:8443' } } });
  assert.strictEqual((await requete('GET', s.api + '/session')).json.recuperationParCourriel, true);
  const tech = (await requete('GET', s.api + '/utilisateurs', undefined, s.admin)).json.find(u => u.identifiant === 'tech');
  await requete('PUT', s.api + '/utilisateurs/' + tech.id, { courriel: 'tech@exemple.test' }, s.admin);
  // Compte inconnu, compte sans courriel : même réponse, aucun message envoyé
  for (const compte of ['inconnu@exemple.test', 'lecteur', '']) { const r = await requete('POST', s.api + '/recuperation', { compte }); assert.strictEqual(r.code, 200); assert.deepStrictEqual(r.json, { ok: true }); }
  const r = await requete('POST', s.api + '/recuperation', { compte: 'TECH@exemple.test' });
  assert.deepStrictEqual(r.json, { ok: true });
  assert.ok(await attendre(() => smtp.recus.length === 1), 'un message attendu');
  const m = smtp.recus[0];
  assert.match(m.a[0], /tech@exemple\.test/); assert.match(m.de, /netcarto@exemple\.test/); assert.match(m.auth, /netcarto\0secret-fictif$/);
  assert.match(m.texte, /^Subject: =\?UTF-8\?B\?/m); assert.match(m.texte, /^To: tech@exemple\.test/m);
  const corps = Buffer.from(m.texte.split('\r\n\r\n').slice(1).join('').replace(/\r\n/g, ''), 'base64').toString('utf8');
  const lien = /https:\/\/netcarto\.exemple\.test:8443\/\?reinitialisation=([A-Za-z0-9_-]{40,})/.exec(corps);
  assert.ok(lien, corps); assert.match(corps, /30 minutes/); assert.match(corps, /tech/);
  assert.strictEqual((await requete('POST', s.api + '/recuperation/mot-de-passe', { jeton: lien[1], motDePasse: NOUVEAU })).code, 200);
  assert.strictEqual((await connexion(s, 'tech@exemple.test', NOUVEAU)).code, 200);
  // Au plus trois demandes par heure et par compte
  for (let i = 0; i < 5; i++) await requete('POST', s.api + '/recuperation', { compte: 'tech' });
  await new Promise(x => setTimeout(x, 400));
  assert.strictEqual(smtp.recus.length, 3, 'trois messages au plus dans l\'heure : le premier, puis deux');
});

test('Serveur d\'envoi en panne : la demande répond quand même, le serveur continue', async t => {
  const s = await serveurDeTest(t, { config: { courriel: { hote: '127.0.0.1', port: 1, securite: 'aucune', expediteur: 'netcarto@exemple.test', adresse: 'https://netcarto.exemple.test' } } });
  const tech = (await requete('GET', s.api + '/utilisateurs', undefined, s.admin)).json.find(u => u.identifiant === 'tech');
  await requete('PUT', s.api + '/utilisateurs/' + tech.id, { courriel: 'tech@exemple.test' }, s.admin);
  assert.deepStrictEqual((await requete('POST', s.api + '/recuperation', { compte: 'tech' })).json, { ok: true });
  await new Promise(x => setTimeout(x, 300));
  assert.strictEqual((await requete('GET', s.api + '/sante')).code, 200);
});

test('Page d\'administration servie à /admin ; réglages du courriel contrôlés', async t => {
  const s = await serveurDeTest(t, { comptes: false });
  for (const chemin of ['/admin', '/admin/']) { const p = await requete('GET', s.base + chemin); assert.strictEqual(p.code, 200, chemin); assert.match(p.texte, /netcarto-api/); assert.ok(p.entetes['content-security-policy']); }
  assert.strictEqual((await requete('GET', s.base + '/admin/autre')).code, 403);
  const fs = require('fs'), path = require('path'), { dossierTemporaire } = require('./aide');
  const f = path.join(dossierTemporaire(t), 'n.toml');
  const lire = texte => { fs.writeFileSync(f, texte); return chargerConfig({ env: { SMTP_MDP: 'valeur-fictive' }, args: ['--config', f] }); };
  assert.strictEqual(lire('').courriel.hote, '');
  const c = lire('[courriel]\nhote = "smtp.exemple.test"\nutilisateur = "netcarto"\nmotDePasse = "env:SMTP_MDP"\nexpediteur = "netcarto@exemple.test"\nadresse = "https://netcarto.exemple.test:8443/"\n').courriel;
  assert.deepStrictEqual([c.port, c.securite, c.motDePasse, c.adresse], [587, 'starttls', 'valeur-fictive', 'https://netcarto.exemple.test:8443']);
  for (const mauvais of ['hote = "smtp.exemple.test"', 'hote = "smtp.exemple.test"\nexpediteur = "netcarto@exemple.test"', 'hote = "smtp.exemple.test"\nexpediteur = "netcarto@exemple.test"\nadresse = "netcarto.exemple.test"', 'hote = "s"\nexpediteur = "a@b.test"\nadresse = "https://x.test"\nsecurite = "ssl3"'])
    assert.throws(() => lire('[courriel]\n' + mauvais + '\n'), /courriel\./, mauvais);
});
