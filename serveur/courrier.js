/* Envoi de courriels par un serveur SMTP, sans bibliothèque : juste ce qu'il faut pour un message texte.
   Sécurité de la liaison : « starttls » (par défaut, port 587), « tls » (port 465) ou « aucune » (essais, réseau de confiance).
   Sans hôte réglé, l'envoi est inactif et NetCarto fonctionne sans courriel. */
'use strict';
const net = require('net'), tls = require('tls'), os = require('os'), fs = require('fs');

const b64 = s => Buffer.from(String(s), 'utf8').toString('base64');
/* Valeur d'un en-tête. Sans accent, elle part telle quelle. Sinon elle est encodée (RFC 2047) en mots de 75 caractères au plus,
   un par ligne (assez courts pour que la ligne « Subject: … » reste sous 78 caractères), coupés entre deux caractères et jamais au milieu d'un seul. Un retour à la ligne venu de la valeur est retiré. */
function enTete(valeur) {
  const s = String(valeur).replace(/[\r\n]+/g, ' ');
  if (/^[\x20-\x7e]*$/.test(s)) return s;
  const mots = []; let morceau = '';
  for (const c of s) { if (Buffer.byteLength(morceau + c, 'utf8') > 39) { mots.push(morceau); morceau = ''; } morceau += c; }
  if (morceau) mots.push(morceau);
  return mots.map(m => `=?UTF-8?B?${b64(m)}?=`).join('\r\n ');
}
const adresseDe = s => (/<([^>]+)>/.exec(s) || [null, s])[1].trim();

function creerCourrier(cfg = {}, journal = () => {}) {
  const actif = !!cfg.hote;
  /* Liaison chiffrée : le certificat du serveur d'envoi est toujours vérifié, contre les autorités du système ou contre
     l'autorité interne indiquée (courriel.autorite). Il n'existe pas de réglage pour s'en passer. */
  const chiffrer = socket => tls.connect({ socket, servername: cfg.hote, minVersion: 'TLSv1.2', ...(cfg.autorite ? { ca: fs.readFileSync(cfg.autorite) } : {}) });
  const certificat = e => (/certificate|self.signed|CERT_|altnames/i.test(`${e.code} ${e.message}`) ? new Error(`certificat du serveur d'envoi refusé (${e.message}) : indiquez son autorité dans courriel.autorite`) : e);
  /* Envoie un message texte. Rejette si le serveur d'envoi refuse ou ne répond pas. */
  function envoyer({ a, sujet, texte }) {
    if (!actif) return Promise.reject(new Error('Aucun serveur d\'envoi n\'est réglé.'));
    return new Promise((ok, ko) => {
      let sock = net.connect({ host: cfg.hote, port: cfg.port }), tampon = '', attente = null, fini = false;
      if (cfg.securite === 'tls') sock = chiffrer(sock);
      const finir = e => { if (fini) return; fini = true; clearTimeout(minuterie); sock.destroy(); e ? ko(certificat(e)) : ok(); };
      const minuterie = setTimeout(() => finir(new Error('le serveur d\'envoi ne répond pas')), 15000);
      const brancher = s => { s.setEncoding('utf8'); s.on('data', d => { tampon += d; lire(); }); s.on('error', finir); s.on('close', () => finir(new Error('liaison coupée par le serveur d\'envoi'))); };
      /* Une réponse SMTP peut tenir sur plusieurs lignes : « 250-… » puis « 250 … » */
      function lire() {
        for (;;) {
          const lignes = tampon.split('\r\n'); let n = -1;
          for (let i = 0; i < lignes.length - 1; i++) if (/^\d{3} /.test(lignes[i])) { n = i; break; }
          if (n < 0 || !attente) return;
          const reponse = lignes.slice(0, n + 1); tampon = lignes.slice(n + 1).join('\r\n');
          const suite = attente; attente = null; suite(+reponse[n].slice(0, 3), reponse.join(' | '));
        }
      }
      const dire = (ligne, attendu) => new Promise((oui, non) => { attente = (code, t) => (attendu.includes(code) ? oui(t) : non(new Error(`refus du serveur d'envoi : ${t.slice(0, 160)}`))); if (ligne !== null) sock.write(ligne + '\r\n'); lire(); });
      brancher(sock);
      (async () => {
        const moi = os.hostname() || 'netcarto';
        await dire(null, [220]);
        let capacites = await dire(`EHLO ${moi}`, [250]);
        if (cfg.securite === 'starttls') {
          if (!/STARTTLS/i.test(capacites)) throw new Error('le serveur d\'envoi ne propose pas STARTTLS (réglage courriel.securite)');
          await dire('STARTTLS', [220]);
          sock.removeAllListeners('data'); sock.removeAllListeners('close'); sock.removeAllListeners('error');
          sock = chiffrer(sock); tampon = '';
          await new Promise((oui, non) => { sock.once('secureConnect', oui); sock.once('error', non); });
          brancher(sock);
          capacites = await dire(`EHLO ${moi}`, [250]);
        }
        if (cfg.utilisateur) await dire(`AUTH PLAIN ${b64(`\0${cfg.utilisateur}\0${cfg.motDePasse || ''}`)}`, [235]);
        await dire(`MAIL FROM:<${adresseDe(cfg.expediteur)}>`, [250]);
        await dire(`RCPT TO:<${a}>`, [250, 251]);
        await dire('DATA', [354]);
        const message = [`From: ${cfg.expediteur}`, `To: ${a}`, `Subject: ${enTete(sujet)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${moi}>`,
          'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', ...b64(texte).match(/.{1,76}/g)].join('\r\n');
        await dire(message + '\r\n.', [250]);
        sock.write('QUIT\r\n');
        finir();
      })().catch(finir);
    }).catch(e => { journal(`Courriel non envoyé à ${a} : ${e.message}`); throw e; });
  }
  return { actif, adresse: cfg.adresse || '', envoyer };
}
module.exports = { creerCourrier, enTete };
