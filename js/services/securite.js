/* Services — état de sécurité du serveur (mode serveur, administrateur) et alertes qui en découlent.
   L'état vient de la route /securite ; il ne contient aucun secret. */
import { plural } from '../utils.js';
import { Cache } from '../store.js';

/* Alertes tirées d'un état : pures, pour être testées et comparées */
function alertesDe(e) {
  if (!e) return [];
  const out = [], a = (level, text, sub) => out.push({ level, kind: 'securite', icon: 'alert', text, sub, act: 'compte-securite', ref: '' });
  if (!e.https.actif) a('crit', 'HTTPS désactivé sur le serveur', 'Les mots de passe circulent en clair sur le réseau');
  else if (e.https.joursRestants < 30) a('serious', `Certificat HTTPS : expire dans ${plural(Math.max(0, e.https.joursRestants), 'jour')}`, 'À renouveler avant l\'échéance');
  const s = e.sauvegarde;
  if (s.derniere == null) a('crit', 'Aucune sauvegarde de la base', 'Lancez une sauvegarde depuis la page d\'administration');
  else if (s.ageHeures > 26) a(s.ageHeures > 48 ? 'crit' : 'serious', `Dernière sauvegarde : il y a ${Math.round(s.ageHeures)} h`, s.automatique ? 'La sauvegarde automatique n\'a pas tourné' : 'La sauvegarde automatique est désactivée');
  if (e.verrouilles.length) a('serious', `${e.verrouilles.length > 1 ? 'Comptes verrouillés' : 'Compte verrouillé'} : ${e.verrouilles.join(', ')}`, 'Trop d\'échecs de connexion');
  if (e.echecs24h >= 10) a('serious', `${e.echecs24h} échecs de connexion en 24 h`, 'Voir le journal d\'audit');
  if (e.comptes.administrateurs < 2) a('warn', 'Un seul administrateur', 'Prévoyez un second administrateur de secours');
  return out;
}
const Securite = {
  etat: null, subs: [],
  on(fn) { this.subs.push(fn); },
  /* Pose un nouvel état ; les abonnés ne sont prévenus que si les alertes changent */
  poser(e) {
    const avant = JSON.stringify(alertesDe(this.etat));
    this.etat = e;
    if (JSON.stringify(alertesDe(e)) !== avant) { Cache.clear(); for (const fn of this.subs) fn(); }
  },
};
const alertesSecurite = () => alertesDe(Securite.etat);

export { alertesDe, alertesSecurite, Securite };
