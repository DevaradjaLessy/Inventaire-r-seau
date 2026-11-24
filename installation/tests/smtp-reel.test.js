/* Essai réel de l'envoi de courriels contre un vrai serveur de messagerie (essayé avec Postfix 3.8 et Dovecot pour l'authentification),
   et non contre le faux serveur des tests : chiffrement STARTTLS et TLS, compte, certificat d'une autorité interne, refus.
   Ignoré sans serveur d'essai. À donner :
     NETCARTO_TEST_SMTP=hôte:port STARTTLS:port TLS:port en clair      (par exemple localhost:2587:2465:2525)
     NETCARTO_TEST_SMTP_COMPTE=utilisateur:mot de passe                (compte fictif du serveur d'essai)
     NETCARTO_TEST_SMTP_AC=chemin du certificat à approuver (PEM)
     NETCARTO_TEST_SMTP_BOITE=dossier où le serveur dépose le courrier reçu (un fichier par message) */
'use strict';
const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { creerCourrier } = require('../../serveur/courrier');

const [HOTE, P_STARTTLS, P_TLS, P_CLAIR] = (process.env.NETCARTO_TEST_SMTP || '').split(':');
const [COMPTE, MDP] = (process.env.NETCARTO_TEST_SMTP_COMPTE || '').split(':'), AC = process.env.NETCARTO_TEST_SMTP_AC, BOITE = process.env.NETCARTO_TEST_SMTP_BOITE;
const sans = !(HOTE && P_STARTTLS && COMPTE && AC && BOITE) && 'aucun serveur de messagerie d\'essai indiqué';
const base = { hote: HOTE, utilisateur: COMPTE, motDePasse: MDP, expediteur: `NetCarto <${COMPTE}>`, adresse: 'https://netcarto.exemple.test:8443', autorite: AC };
const corps = t => Buffer.from(t.split(/\r?\n\r?\n/).slice(1).join('').replace(/\s/g, ''), 'base64').toString('utf8');
/* Attend le message dont le texte (reçu encodé) contient cette marque, et renvoie son contenu brut */
async function recu(marque) {
  for (let i = 0; i < 50; i++) {
    for (const f of fs.readdirSync(BOITE)) { const t = fs.readFileSync(path.join(BOITE, f), 'utf8'); if (corps(t).includes(marque)) return t; }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`message « ${marque} » non reçu`);
}

test('Courriel réel : envoi chiffré et authentifié en STARTTLS puis en TLS, accents conservés', { skip: sans, timeout: 60000 }, async () => {
  for (const [securite, port] of [['starttls', +P_STARTTLS], ['tls', +P_TLS]]) {
    const marque = `essai-${securite}-${Date.now()}`, texte = `Bonjour,\n\nVoici le lien de réinitialisation demandé (${marque}).\nÀ bientôt — l'équipe réseau.`;
    await creerCourrier({ ...base, port, securite }).envoyer({ a: `destinataire@${COMPTE.split('@')[1]}`, sujet: `Réinitialisation du mot de passe ${marque}`, texte });
    const brut = await recu(marque);
    // Le serveur atteste lui-même, dans l'en-tête qu'il ajoute, que la session était chiffrée et authentifiée
    assert.match(brut, /using TLSv1\.[23]/, `${securite} : session chiffrée`);
    assert.match(brut, new RegExp(`Authenticated sender: ${COMPTE.replace(/[.]/g, '\\.')}`), `${securite} : compte reconnu`);
    assert.match(brut, /Content-Type: text\/plain; charset=utf-8/);
    assert.strictEqual(corps(brut), texte, `${securite} : texte reçu identique, accents compris`);
    assert.match(brut, /^Subject: =\?UTF-8\?B\?/m, 'sujet accentué encodé');
    const entetes = brut.split(/\r?\n\r?\n/)[0].split(/\r?\n/), i = entetes.findIndex(l => l.startsWith('Subject:'));
    assert.ok(entetes[i].length <= 78 && /^\s=\?UTF-8\?B\?/.test(entetes[i + 1]), `sujet replié sur plusieurs lignes courtes : ${entetes[i]}`);
  }
});

test('Courriel réel : certificat inconnu, mot de passe faux et serveur sans chiffrement sont refusés avec un message utile', { skip: sans, timeout: 60000 }, async () => {
  const message = { a: `destinataire@${COMPTE.split('@')[1]}`, sujet: 'Ne doit pas partir', texte: 'x' }, journal = [];
  // Sans l'autorité du serveur : la liaison est refusée, et le message dit quel réglage donner
  await assert.rejects(creerCourrier({ ...base, autorite: '', port: +P_STARTTLS, securite: 'starttls' }, m => journal.push(m)).envoyer(message), /certificat du serveur d'envoi refusé.*courriel\.autorite/);
  await assert.rejects(creerCourrier({ ...base, autorite: '', port: +P_TLS, securite: 'tls' }).envoyer(message), /certificat du serveur d'envoi refusé/);
  // Mot de passe faux : refus du serveur, sans que le mot de passe figure dans l'erreur ni dans le journal
  await assert.rejects(creerCourrier({ ...base, motDePasse: 'mot-de-passe-faux', port: +P_STARTTLS, securite: 'starttls' }, m => journal.push(m)).envoyer(message), e => /refus du serveur d'envoi.*535/.test(e.message) && !/mot-de-passe-faux/.test(e.message));
  assert.ok(journal.length >= 2 && journal.every(l => !/mot-de-passe-faux|MotDePasse/.test(l)), journal.join(' | '));
  // Un serveur qui ne propose pas le chiffrement demandé : rien n'est envoyé, surtout pas le mot de passe
  if (P_CLAIR) await assert.rejects(creerCourrier({ ...base, port: +P_CLAIR, securite: 'starttls' }).envoyer(message), /ne propose pas STARTTLS/);
  assert.ok(!fs.readdirSync(BOITE).some(f => fs.readFileSync(path.join(BOITE, f), 'utf8').includes('Ne doit pas partir')), 'aucun de ces messages n\'est arrivé');
});
