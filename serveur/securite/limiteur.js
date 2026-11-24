/* Limite les tentatives d'authentification par adresse : au-delà du seuil dans la fenêtre, l'adresse attend la fin de la fenêtre.
   Complète le verrouillage par compte, qui ne protège pas contre une attaque étalée sur beaucoup de comptes.
   Une tentative est comptée dès qu'elle commence, et décomptée seulement si elle réussit : des tentatives lancées
   toutes en même temps ne peuvent donc pas passer avant que la première ait échoué. */
'use strict';

const net = require('net');
/* Clé de comptage d'une adresse. Une adresse IPv4 écrite en IPv6 (« ::ffff:192.0.2.7 ») revient à sa forme simple ;
   une adresse IPv6 est ramenée à son réseau /64, car un même poste dispose de toute cette plage et en changerait à chaque essai. */
function cleAdresse(ip) {
  const a = String(ip || '').trim().toLowerCase(), v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (v4) return v4[1];
  if (!net.isIPv6(a)) return a;
  const [tete, queue = ''] = a.split('::'), g = tete ? tete.split(':') : [], d = a.includes('::') ? (queue ? queue.split(':') : []) : [];
  const groupes = a.includes('::') ? [...g, ...Array(Math.max(0, 8 - g.length - d.length)).fill('0'), ...d] : g;
  return groupes.slice(0, 4).map(x => parseInt(x, 16).toString(16)).join(':') + '::/64';
}
function creerLimiteur({ max, fenetreMs, horloge = () => Date.now(), surBlocage = () => {} }) {
  const adresses = new Map();   // adresse → { n, debut, signale }
  const etat = brute => { const ip = cleAdresse(brute), t = horloge(), e = adresses.get(ip); if (e && t - e.debut >= fenetreMs) { adresses.delete(ip); return null; } return e || null; };
  const compter = brute => {
    const ip = cleAdresse(brute);
    let e = etat(ip);
    if (!e) {
      if (adresses.size >= 20000) { const t = horloge(); for (const [k, v] of adresses) if (t - v.debut >= fenetreMs) adresses.delete(k); if (adresses.size >= 20000) adresses.clear(); }
      e = { n: 0, debut: horloge(), signale: false }; adresses.set(ip, e);
    }
    e.n++;
    if (e.n >= max && !e.signale) { e.signale = true; surBlocage(ip); }
    return e;
  };
  return {
    /* Secondes d'attente restantes pour cette adresse, ou 0 si elle peut essayer */
    attente(ip) { const e = etat(ip); return e && e.n >= max ? Math.max(1, Math.ceil((e.debut + fenetreMs - horloge()) / 1000)) : 0; },
    /* Début d'une tentative : renvoie 0 et la compte, ou le nombre de secondes à attendre si l'adresse a épuisé son quota */
    entrer(ip) { const a = this.attente(ip); if (a) return a; compter(ip); return 0; },
    /* La tentative a réussi : elle ne compte plus */
    reussir(ip) { const e = etat(ip); if (e && e.n > 0) e.n--; },
    /* Compte une tentative ratée de plus (essai fait sous une session déjà ouverte, par exemple) */
    echec(ip) { compter(ip); },
  };
}
module.exports = { creerLimiteur, cleAdresse };
