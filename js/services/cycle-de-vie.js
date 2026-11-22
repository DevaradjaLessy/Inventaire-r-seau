/* Services — âge du parc : répartition par tranche d'âge et équipements à renouveler.
   L'âge se compte depuis la date d'installation. Les éléments passifs (panneaux, tiroirs optiques) ne sont pas comptés. */
import { RENOUVELLEMENT_ANS } from '../config.js';
import { Cache, Store } from '../store.js';
import { catOf, isPassive } from './requetes.js';

const AN = 365.25 * 86400000;
const TRANCHES = [[3, 'Moins de 3 ans'], [5, '3 à 5 ans'], [RENOUVELLEMENT_ANS, `5 à ${RENOUVELLEMENT_ANS} ans`], [Infinity, `Plus de ${RENOUVELLEMENT_ANS} ans`]];
/* { total, inconnu, moyen (années), aRenouveler, tranches: [{ label, n, vieux }], anciens: [{ dev, ans }] du plus ancien au plus récent } */
function ageDuParc(maintenant = Date.now()) {
  return Cache.get('age|' + Math.floor(maintenant / 86400000), () => {
    const devs = Store.db.devices.filter(x => x.status !== 'retired' && catOf(x) && !isPassive(x));
    const dates = devs.map(dev => ({ dev, t: /^\d{4}-\d{2}-\d{2}$/.test(dev.installDate || '') ? Date.parse(dev.installDate) : NaN })).filter(x => !Number.isNaN(x.t)).map(x => ({ dev: x.dev, ans: Math.max(0, (maintenant - x.t) / AN) }));
    const tranches = TRANCHES.map(([max, label], i) => ({ label, vieux: max === Infinity, n: dates.filter(x => x.ans < max && x.ans >= (i ? TRANCHES[i - 1][0] : 0)).length }));
    const anciens = [...dates].sort((a, b) => b.ans - a.ans);
    return { total: devs.length, inconnu: devs.length - dates.length, moyen: dates.length ? dates.reduce((s, x) => s + x.ans, 0) / dates.length : 0, aRenouveler: tranches.at(-1).n, tranches, anciens };
  });
}

export { ageDuParc };
