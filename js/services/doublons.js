/* Services — unicité des identifiants réseau : nom d'hôte, adresse IP, adresse MAC, nom de baie, repère de prise.
   Les mêmes règles existent dans la base du serveur ; les vérifier ici évite un aller-retour et protège le mode démonstration. */
import { norm } from '../utils.js';
import { Store } from '../store.js';

const cle = v => norm(String(v ?? '').trim());
/* Adresse MAC ramenée à la forme aa:bb:cc:dd:ee:ff ; null si elle n'est pas valide */
function normMac(v) {
  const h = String(v ?? '').toLowerCase().replace(/[\s:.\-]/g, '');
  return /^[0-9a-f]{12}$/.test(h) ? h.match(/../g).join(':') : null;
}
const ipValide = v => /^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split('.').every(n => +n <= 255);

/* Règles : champ → [collection, propriété, message, comparaison] */
const REGLES = {
  hostname: ['devices', 'hostname', 'Nom d\'hôte déjà utilisé', cle],
  ip: ['devices', 'ip', 'Adresse IP déjà utilisée', v => String(v ?? '').trim()],
  mac: ['devices', 'mac', 'Adresse MAC déjà utilisée', v => normMac(v) || cle(v)],
  rackName: ['racks', 'name', 'Nom de baie déjà utilisé', cle],
  label: ['outlets', 'label', 'Repère de prise déjà utilisé', cle],
};
/* Objet qui porte déjà cette valeur, ou null */
function conflit(champ, valeur, ignoreId = null) {
  const [coll, prop, , f] = REGLES[champ], v = f(valeur);
  if (!v) return null;
  return Store.db[coll].find(x => x.id !== ignoreId && f(x[prop]) === v) || null;
}
/* Lève une erreur claire au premier doublon. valeurs : { hostname, ip, mac, rackName, label } */
function verifierUnicite(valeurs, ignoreId = null) {
  for (const champ of Object.keys(REGLES)) {
    if (!valeurs[champ]) continue;
    const x = conflit(champ, valeurs[champ], ignoreId);
    if (!x) continue;
    const qui = x.hostname || x.name;
    throw new Error(`${REGLES[champ][2]}${qui && champ !== 'hostname' && champ !== 'rackName' ? ` par ${qui}` : ''} : ${String(valeurs[champ]).trim()}.`);
  }
}
/* Ensembles des valeurs déjà prises, pour contrôler un fichier entier sans reparcourir la base à chaque ligne */
function valeursPrises() {
  const d = Store.db, ens = (coll, prop, f) => new Set(d[coll].map(x => f(x[prop])).filter(Boolean));
  return Object.fromEntries(Object.entries(REGLES).map(([champ, [coll, prop, , f]]) => [champ, ens(coll, prop, f)]));
}

export { cle, conflit, ipValide, normMac, REGLES, valeursPrises, verifierUnicite };
