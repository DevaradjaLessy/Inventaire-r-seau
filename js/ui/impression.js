/* Impression : fiche d'une baie (élévation) et plan de brassage de ses équipements.
   Le document est écrit dans #print-root, invisible à l'écran ; la feuille de style d'impression ne montre que lui. */
import { CABLE_TYPES, CATEGORIES, DEVICE_STATUS } from '../config.js';
import { $, esc, fmtDateTime, plural } from '../utils.js';
import { byId, cablesOf, catOf, labelOf, locLabel, portsOf, rackUsage, vlanOf } from '../services/requetes.js';
import { connectedLabel, effStatus, segment, STATE_LABEL } from '../services/cablage.js';
import { Actions, toast } from './socle.js';

const cellule = v => (v === '' || v == null ? '—' : esc(v));
/* Élévation : une ligne par équipement, de haut en bas */
function ficheBaie(rack) {
  const u = rackUsage(rack.id), c = catOf(rack);
  const lignes = [...u.devices].sort((a, b) => b.u - a.u).map(d => {
    const m = catOf(d), hU = m.heightU || 1;
    return `<tr><td>U${d.u}${hU > 1 ? `–${d.u + hU - 1}` : ''}</td><td><b>${esc(d.hostname)}</b></td><td>${esc(CATEGORIES[m.category].one)}</td><td>${esc(`${m.brand} ${m.model}`)}</td><td>${cellule(d.serial)}</td><td>${cellule(d.ip)}</td><td>${esc(DEVICE_STATUS[d.status].label)}</td></tr>`;
  }).join('');
  return `<section class="pr-elev"><h1>${esc(rack.name)}</h1>
    <p class="pr-sous">${esc(locLabel(rack.roomId))} — ${esc(`${c.brand} ${c.model}`)}, ${rack.heightU} U — ${u.used} U occupées sur ${u.total} (${u.pct} %) — ${plural(u.devices.length, 'équipement')}</p>
    <table><thead><tr><th>Position</th><th>Nom</th><th>Type</th><th>Modèle</th><th>N° de série</th><th>Adresse IP</th><th>Statut</th></tr></thead><tbody>${lignes || '<tr><td colspan="7">Baie vide</td></tr>'}</tbody></table></section>`;
}
/* Plan de brassage : pour chaque port actif câblé, le chemin jusqu'à l'autre bout */
function planBrassage(rack) {
  const blocs = [...rackUsage(rack.id).devices].sort((a, b) => b.u - a.u).map(d => {
    const lignes = portsOf(d.id).filter(p => p.role !== 'pp' && cablesOf(p.id).length).map(p => {
      const s = segment(p.id), passe = s.nodes.slice(1, -1).map(labelOf), bout = s.nodes.length > 1 ? s.nodes.at(-1) : null;
      const cordon = s.cables[0], v = p.vlan == null ? 'Trunk' : `${p.vlan} ${vlanOf(p.vlan).name}`;
      return `<tr><td><b>${esc(p.name)}</b></td><td>${esc(v)}</td><td>${esc(STATE_LABEL[effStatus(p)] || '')}</td><td>${cellule(passe.join(' → '))}</td><td>${cellule(bout && bout !== p.id ? labelOf(bout) : connectedLabel(p))}</td>
        <td>${cordon ? esc(`${CABLE_TYPES[cordon.type]?.label || cordon.type}, ${cordon.length} m${cordon.label ? ` — ${cordon.label}` : ''}`) : '—'}</td></tr>`;
    });
    return lignes.length ? `<h2>${esc(d.hostname)} <small>U${d.u} — ${esc(catOf(d).model)}</small></h2>
      <table><thead><tr><th>Port</th><th>VLAN</th><th>État</th><th>Passe par</th><th>Relié à</th><th>Cordon</th></tr></thead><tbody>${lignes.join('')}</tbody></table>` : '';
  }).join('');
  return `<section class="pr-brassage"><h1>Plan de brassage — ${esc(rack.name)}</h1>${blocs || '<p>Aucun port câblé dans cette baie.</p>'}</section>`;
}
/* Imprime en thème clair, quel que soit le thème de l'écran, puis remet l'écran comme avant */
function imprimer(html) {
  const racine = document.documentElement, theme = racine.dataset.theme;
  $('#print-root').innerHTML = html + `<p class="pr-pied">NetCarto — imprimé le ${fmtDateTime(Date.now())}</p>`;
  racine.dataset.theme = 'light';
  const retablir = () => { racine.dataset.theme = theme; removeEventListener('afterprint', retablir); };
  addEventListener('afterprint', retablir);
  try { window.print(); } catch { toast('Impression impossible depuis ce navigateur.', 'err'); }
  // Sans événement « afterprint » (certains navigateurs mobiles), l'écran est rétabli au prochain passage de la boucle
  setTimeout(retablir, 500);
}
Actions['rack-print'] = el => { const rack = byId(el.dataset.id); imprimer(ficheBaie(rack) + planBrassage(rack)); };

export { ficheBaie, imprimer, planBrassage };
