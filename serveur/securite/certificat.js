/* HTTPS : certificat fourni par l'administrateur, ou certificat auto-signé créé par NetCarto.
   Le certificat est construit ici (structure X.509 écrite octet par octet), sans programme extérieur :
   cela fonctionne de la même façon sous Linux, Windows et macOS. */
'use strict';
const crypto = require('crypto'), fs = require('fs'), path = require('path'), os = require('os'), net = require('net');

/* --- Encodage DER (ASN.1) --- */
const longueur = n => { if (n < 128) return Buffer.from([n]); const o = []; while (n) { o.unshift(n & 255); n >>>= 8; } return Buffer.from([0x80 | o.length, ...o]); };
const tlv = (etiquette, ...parties) => { const c = Buffer.concat(parties); return Buffer.concat([Buffer.from([etiquette]), longueur(c.length), c]); };
const sequence = (...p) => tlv(0x30, ...p), ensemble = (...p) => tlv(0x31, ...p), octets = b => tlv(0x04, b);
const entier = b => tlv(0x02, b[0] & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b);
function oid(texte) {
  const a = texte.split('.').map(Number), o = [a[0] * 40 + a[1]];
  for (const v of a.slice(2)) { const g = [v & 127]; let r = v >>> 7; while (r) { g.unshift((r & 127) | 128); r >>>= 7; } o.push(...g); }
  return tlv(0x06, Buffer.from(o));
}
const date = d => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));   // UTCTime
const nom = cn => sequence(ensemble(sequence(oid('2.5.4.3'), tlv(0x0c, Buffer.from(cn, 'utf8')))));
function ipEnOctets(ip) {
  if (net.isIPv4(ip)) return Buffer.from(ip.split('.').map(Number));
  const [gauche, droite = ''] = ip.split('::'), g = gauche ? gauche.split(':') : [], d = droite ? droite.split(':') : [];
  const groupes = ip.includes('::') ? [...g, ...Array(8 - g.length - d.length).fill('0'), ...d] : g;
  return Buffer.concat(groupes.map(x => { const b = Buffer.alloc(2); b.writeUInt16BE(parseInt(x, 16)); return b; }));
}
const pem = (type, der) => `-----BEGIN ${type}-----\n${der.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ${type}-----\n`;

/* Crée une clé et un certificat auto-signé. options : { noms, adresses, jours } → { certificat, cle } (PEM) */
function genererCertificat({ noms = ['localhost'], adresses = ['127.0.0.1', '::1'], jours = 825 } = {}) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const algo = sequence(oid('1.2.840.10045.4.3.2'));   // ECDSA avec SHA-256
  const serie = crypto.randomBytes(16); serie[0] &= 0x7f; serie[0] |= 0x01;
  const debut = new Date(Date.now() - 3600000), fin = new Date(debut.getTime() + jours * 86400000);
  const autresNoms = sequence(...[...new Set(noms)].filter(Boolean).map(n => tlv(0x82, Buffer.from(n, 'ascii'))), ...[...new Set(adresses)].filter(a => net.isIP(a)).map(a => tlv(0x87, ipEnOctets(a))));
  const extensions = sequence(
    sequence(oid('2.5.29.17'), octets(autresNoms)),                                                    // noms et adresses couverts
    sequence(oid('2.5.29.19'), tlv(0x01, Buffer.from([0xff])), octets(sequence())),                     // ce n'est pas une autorité
    sequence(oid('2.5.29.15'), tlv(0x01, Buffer.from([0xff])), octets(tlv(0x03, Buffer.from([7, 0x80])))),   // usage : signature
    sequence(oid('2.5.29.37'), octets(sequence(oid('1.3.6.1.5.5.7.3.1')))));                            // usage : serveur web
  const sujet = nom('NetCarto');
  const corps = sequence(tlv(0xa0, entier(Buffer.from([2]))), entier(serie), algo, sujet, sequence(date(debut), date(fin)), sujet, publicKey.export({ type: 'spki', format: 'der' }), tlv(0xa3, extensions));
  const signature = crypto.sign('sha256', corps, privateKey);
  return { certificat: pem('CERTIFICATE', sequence(corps, algo, tlv(0x03, Buffer.from([0]), signature))), cle: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
}
/* Adresses de ce poste, pour que le certificat soit valable quand on l'ouvre depuis le réseau */
function adressesLocales(hote) {
  const a = new Set(['127.0.0.1', '::1']);
  if (net.isIP(hote) && !['0.0.0.0', '::'].includes(hote)) a.add(hote);
  // Sur un système très cloisonné, la liste des interfaces peut être refusée : le certificat vaut alors pour ce poste et les noms réglés
  let interfaces = {};
  try { interfaces = os.networkInterfaces(); } catch { /* liste indisponible */ }
  for (const liste of Object.values(interfaces)) for (const i of liste || []) if (!i.internal) a.add(i.address.split('%')[0]);
  return [...a];
}
/* Prépare le HTTPS. Renvoie null s'il est désactivé, sinon { cert, key, autoSigne, fichier }. */
function preparerHttps(cfg = {}, dossierDonnees, { hote = '127.0.0.1' } = {}) {
  if (cfg.actif === false) return null;
  let crt = cfg.certificat || '', cle = cfg.cle || '', autoSigne = false;
  if (!!crt !== !!cle) throw new Error('HTTPS : indiquez les deux fichiers, « certificat » et « cle », ou aucun des deux.');
  if (crt) { for (const f of [crt, cle]) if (!fs.existsSync(f)) throw new Error(`HTTPS : fichier introuvable : ${f}`); }
  else {
    const dossier = path.join(dossierDonnees, 'certificats');
    crt = path.join(dossier, 'netcarto.crt'); cle = path.join(dossier, 'netcarto.key'); autoSigne = true;
    // Noms et adresses supplémentaires demandés dans les réglages (ceux par lesquels on ouvre NetCarto depuis le réseau)
    const demandes = cfg.noms === undefined ? [] : cfg.noms;
    if (!Array.isArray(demandes) || demandes.some(n => typeof n !== 'string' || !/^[A-Za-z0-9.:_-]+$/.test(n))) throw new Error('Réglage « https.noms » invalide : liste de noms ou d\'adresses attendue, par exemple ["netcarto.exemple.interne", "192.0.2.10"].');
    const nomsEnPlus = demandes.filter(n => !net.isIP(n)), adressesEnPlus = demandes.filter(n => net.isIP(n));
    // Un certificat existant est gardé tant qu'il couvre tout ce qui est demandé (les navigateurs l'ont déjà accepté)
    let aRefaire = !fs.existsSync(crt) || !fs.existsSync(cle);
    if (!aRefaire && demandes.length) {
      try { const x = new crypto.X509Certificate(fs.readFileSync(crt)); aRefaire = !nomsEnPlus.every(n => x.checkHost(n)) || !adressesEnPlus.every(a => x.checkIP(a)); } catch { aRefaire = true; }
    }
    if (aRefaire) {
      const g = genererCertificat({ noms: [...new Set(['localhost', os.hostname(), ...nomsEnPlus])], adresses: [...new Set([...adressesLocales(hote), ...adressesEnPlus])] });
      fs.mkdirSync(dossier, { recursive: true });
      fs.writeFileSync(cle, g.cle, { mode: 0o600 }); fs.writeFileSync(crt, g.certificat);
    }
  }
  const cert = fs.readFileSync(crt), key = fs.readFileSync(cle);
  let x;
  try { x = new crypto.X509Certificate(cert); } catch { throw new Error(`HTTPS : certificat illisible : ${crt}`); }
  let correspond = false;
  try { correspond = x.checkPrivateKey(crypto.createPrivateKey(key)); } catch { /* clé illisible */ }
  if (!correspond) throw new Error('HTTPS : la clé ne correspond pas au certificat.');
  return { cert, key, autoSigne, fichier: crt, expire: new Date(x.validTo) };
}
module.exports = { genererCertificat, preparerHttps };
