/* Synthèse du parc : document d'une à deux pages à imprimer ou à enregistrer en PDF, pour un comité ou une direction.
   Il reprend les chiffres du tableau de bord : parc, capacité, âge, firmware, adressage, alertes. */
import { CATEGORIES, POE_WARN_PCT, RACK_FULL_PCT, RENOUVELLEMENT_ANS } from '../config.js';
import { esc, fmtDate, pct, plural } from '../utils.js';
import { Store } from '../store.js';
import { planAdressage } from '../services/adressage.js';
import { ageDuParc } from '../services/cycle-de-vie.js';
import { batLabel, catOf, computeAlerts, locLabel } from '../services/requetes.js';
import { Actions } from './socle.js';
import { imprimer } from './impression.js';
import { computeStats, versionsFirmware } from './tableau-de-bord.js';

const SEUIL_PORTS_PCT = 80;   // un switch occupé à 80 % ou plus figure dans la rubrique « Capacité »
const ans = n => n.toFixed(1).replace('.', ',');
const table = (tetes, lignes, vide) => `<table><thead><tr>${tetes.map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>${lignes.map(l => `<tr>${l.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${tetes.length}">${vide}</td></tr>`}</tbody></table>`;
function synthese() {
  const s = computeStats(), d = Store.db, age = ageDuParc(), ip = planAdressage(), alertes = computeAlerts().filter(a => a.kind !== 'securite');
  const niveau = l => alertes.filter(a => a.level === l).length;
  const pleines = s.racks.filter(x => x.pct >= RACK_FULL_PCT), charges = s.swPorts.filter(x => pct(x.used, x.total) >= SEUIL_PORTS_PCT), poe = s.poe.filter(x => x.pct >= POE_WARN_PCT);
  const fw = versionsFirmware().filter(l => l.retard);
  const vieux = age.anciens.filter(x => x.ans >= RENOUVELLEMENT_ANS);
  return `<section class="pr-synthese"><h1>Synthèse du parc réseau</h1>
    <p class="pr-sous">${esc(d.sites.length > 1 ? `${d.sites.length} sites : ${d.sites.map(x => x.name).join(', ')}` : d.sites[0]?.name || 'Aucun site')} — ${plural(d.buildings.length, 'bâtiment')}, ${plural(d.floors.length, 'étage')}, ${plural(d.racks.length, 'baie')}</p>
    <h2>Chiffres clés</h2>
    ${table(['Équipements', 'Ports occupés', 'Baies', 'PoE consommé', 'Prises brassées', 'Alertes'], [[`<b>${s.devices}</b> dont ${s.active} actifs`, `<b>${pct(s.portsUsed, s.ports)} %</b> (${s.portsUsed} sur ${s.ports})`, `<b>${pct(s.uUsed, s.uTotal)} %</b> (${s.uUsed} U sur ${s.uTotal})`, `<b>${s.poeUsed} W</b> sur ${s.poeBudget} W`, `<b>${pct(s.patched, s.outlets)} %</b> (${s.patched} sur ${s.outlets})`, `<b>${alertes.length}</b> dont ${niveau('crit')} critique${niveau('crit') > 1 ? 's' : ''}`]], '')}
    <h2>Parc par type</h2>
    ${table(['Type', 'Nombre', ...d.buildings.map(b => esc(batLabel(b)))], Object.keys(CATEGORIES).filter(k => s.byCat.has(k)).map(k => [esc(CATEGORIES[k].label), s.byCat.get(k).length, ...d.buildings.map(b => s.byCat.get(k).filter(x => s.byBld.get(b.id)?.includes(x)).length)]), 'Aucun équipement')}
    <h2>Âge du parc <small>${age.total - age.inconnu ? `âge moyen : ${ans(age.moyen)} ans` : ''}${age.inconnu ? ` — ${plural(age.inconnu, 'équipement')} sans date d'installation` : ''}</small></h2>
    ${table(['Tranche', 'Équipements', 'Part'], age.tranches.map(t => [t.label, t.n, `${pct(t.n, age.total - age.inconnu)} %`]), '')}
    <h2>À renouveler <small>plus de ${RENOUVELLEMENT_ANS} ans</small></h2>
    ${table(['Nom', 'Modèle', 'Emplacement', 'Installé le', 'Âge'], vieux.slice(0, 30).map(x => [`<b>${esc(x.dev.hostname)}</b>`, esc(`${catOf(x.dev).brand} ${catOf(x.dev).model}`), esc(locLabel(x.dev.id)), fmtDate(x.dev.installDate), `${ans(x.ans)} ans`]), `Aucun équipement de plus de ${RENOUVELLEMENT_ANS} ans`)}
    ${vieux.length > 30 ? `<p class="pr-sous">… et ${vieux.length - 30} autres, à retrouver dans l'Inventaire trié par date d'installation.</p>` : ''}
    <h2>Capacité : ce qui approche de la limite</h2>
    ${table(['Élément', 'Occupation', 'Emplacement'], [
    ...pleines.map(x => [`Baie <b>${esc(x.r.name)}</b>`, `${x.used} U sur ${x.total} (${x.pct} %)`, esc(locLabel(x.r.roomId))]),
    ...charges.map(x => [`Switch <b>${esc(x.dev.hostname)}</b>`, `${x.used} ports sur ${x.total} (${pct(x.used, x.total)} %)`, esc(locLabel(x.dev.id))]),
    ...poe.map(x => [`PoE <b>${esc(x.dev.hostname)}</b>`, `${x.used} W sur ${x.budget} (${x.pct} %)`, esc(locLabel(x.dev.id))])], `Aucune baie à ${RACK_FULL_PCT} %, aucun switch à ${SEUIL_PORTS_PCT} % de ses ports, aucun budget PoE à ${POE_WARN_PCT} %`)}
    <h2>Firmware : équipements à mettre à niveau</h2>
    ${table(['Modèle', 'Version de référence', 'En retard', 'Versions en service'], fw.map(l => [esc(`${l.c.brand} ${l.c.model}`), esc(l.c.firmware), l.retard, [...l.v].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${esc(v)} × ${n}`).join(', ') || '—']), 'Tous les équipements sont à la version de référence de leur modèle')}
    <h2>Plan d'adressage</h2>
    ${table(['VLAN', 'Sous-réseau', 'Adresses attribuées', 'Occupation', 'Prochaine adresse libre'], ip.vlans.map(v => [`${v.vlan.id} ${esc(v.vlan.name)}`, esc(v.vlan.subnet), `${v.utilisees} sur ${v.hotes}`, `${v.pct} %`, v.libre || 'aucune']), 'Aucun sous-réseau saisi')}
    ${ip.hors.length ? `<p class="pr-sous">${plural(ip.hors.length, 'adresse')} hors de tout sous-réseau : ${ip.hors.slice(0, 12).map(x => `${esc(x.hostname)} (${esc(x.ip)})`).join(', ')}${ip.hors.length > 12 ? '…' : ''}</p>` : ''}
    <h2>Alertes critiques</h2>
    ${table(['Alerte', 'Précision'], alertes.filter(a => a.level === 'crit').map(a => [esc(a.text), esc(a.sub)]), 'Aucune alerte critique')}</section>`;
}
Actions.synthese = () => imprimer(synthese());

export { synthese };
