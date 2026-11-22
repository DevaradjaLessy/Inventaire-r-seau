/* Limite les tentatives d'authentification par adresse : au-delà du seuil dans la fenêtre, l'adresse attend la fin de la fenêtre.
   Complète le verrouillage par compte, qui ne protège pas contre une attaque étalée sur beaucoup de comptes. */
'use strict';

function creerLimiteur({ max, fenetreMs, horloge = () => Date.now(), surBlocage = () => {} }) {
  const adresses = new Map();   // adresse → { n, debut, signale }
  const etat = ip => { const t = horloge(), e = adresses.get(ip); if (e && t - e.debut >= fenetreMs) { adresses.delete(ip); return null; } return e || null; };
  return {
    /* Secondes d'attente restantes pour cette adresse, ou 0 si elle peut essayer */
    attente(ip) { const e = etat(ip); return e && e.n >= max ? Math.max(1, Math.ceil((e.debut + fenetreMs - horloge()) / 1000)) : 0; },
    /* Compte une tentative ratée (ou une demande sensible) */
    echec(ip) {
      let e = etat(ip);
      if (!e) {
        if (adresses.size >= 20000) { const t = horloge(); for (const [k, v] of adresses) if (t - v.debut >= fenetreMs) adresses.delete(k); if (adresses.size >= 20000) adresses.clear(); }
        e = { n: 0, debut: horloge(), signale: false }; adresses.set(ip, e);
      }
      e.n++;
      if (e.n >= max && !e.signale) { e.signale = true; surBlocage(ip); }
    },
  };
}
module.exports = { creerLimiteur };
