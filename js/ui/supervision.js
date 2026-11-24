/* Interface — résumé de la supervision sur le tableau de bord : en un coup d'œil, ce que voient PRTG, Zabbix ou les switchs
   (équipements joignables ou en panne, ports, trafic), ce que l'inventaire contient sans être suivi, et les ports les plus chargés. */
import { COL } from '../config.js';
import { esc, plural } from '../utils.js';
import { ico } from '../icones.js';
import { byId } from '../services/requetes.js';
import { Live, resumeSupervision } from '../services/mesures.js';

const debit = v => (v >= 1000 ? `${(v / 1000).toFixed(2)} Gb/s` : v >= 1 ? `${v.toFixed(1)} Mb/s` : `${Math.round(v * 1000)} kb/s`);
const heure = t => (t ? new Date(t).toLocaleTimeString('fr-FR') : '—');
const ligne = (couleur, n, mot) => `<div><span class="st2"><i style="background:${couleur}"></i>${mot}</span><b>${n}</b></div>`;
const entete = droite => `<div class="dt"><span class="ti">${ico('gauge')}</span><h3>Supervision en direct</h3><span class="grow"></span>${droite}</div>`;

function supervisionCard() {
  const bouton = `<button class="btn sm" data-act="sources" data-tip="Sources de données|Choisir la source, voir l'état de chacune">${ico('gauge')}Sources</button>`;
  if (Live.state === 'error') return `<div class="dcard c12" id="sup-card">${entete(bouton)}<div class="sup-vide"><b>La source de supervision ne répond pas.</b> ${esc(Live.error)}</div></div>`;
  if (Live.state !== 'ok') return `<div class="dcard c12" id="sup-card">${entete(bouton)}<div class="sup-vide"><b>Aucune source de supervision active.</b> Les états affichés sont ceux saisis à la main. Une source (PRTG, Zabbix, SNMP) remonte l'état réel des équipements et des ports, sans rien modifier dans la base.</div></div>`;
  const r = resumeSupervision(), nom = id => byId(id)?.hostname || '?';
  const pannes = r.pannes.slice(0, 4).map(p => `<div class="fw-row" data-act="go" data-id="${p.id}"><b>${esc(nom(p.id))}</b><span>${p.state === 'down' ? 'Injoignable' : 'Dégradé'}${p.message ? ` · ${esc(p.message)}` : ''}</span><span class="chip ${p.state === 'down' ? 'crit' : 'warn'}">${p.state === 'down' ? 'Panne' : 'Alerte'}</span></div>`).join('');
  const charges = r.charges.map(c => { const p = byId(c.id); return `<div class="sup-ch" data-act="go" data-id="${c.id}" data-tip="${esc(nom(p?.deviceId))} · ${esc(p?.name || '')}|${debit(c.debit)}${c.part != null ? ` · ${Math.round(c.part)} % du débit du lien` : ''}|Clic : ouvrir le port"><span>${esc(nom(p?.deviceId))} · ${esc(p?.name || '')}</span><div class="tr"><i style="width:${c.part ?? 0}%"></i></div><b>${debit(c.debit)}</b></div>`; }).join('');
  const couverture = `${r.suivis} sur ${plural(r.aSuivre, 'équipement')} de l'inventaire ${r.suivis > 1 ? 'sont suivis' : 'est suivi'}`;
  return `<div class="dcard c12" id="sup-card">${entete(`<span class="chip">${esc(Live.source)}</span><span class="muted">relevé à ${heure(Live.ts)}</span>${bouton}`)}
    <div class="sup-g">
      <div><div class="sup-t">Équipements</div><div class="dleg">${ligne(COL.up, r.etats.up, r.etats.up > 1 ? 'joignables' : 'joignable')}${ligne(COL.warn, r.etats.warning, r.etats.warning > 1 ? 'dégradés' : 'dégradé')}${ligne(COL.crit, r.etats.down, 'en panne')}</div>
        <div class="dnote">${couverture}${r.inconnus ? `<br>${plural(r.inconnus, 'équipement supervisé absent', 'équipements supervisés absents')} de l'inventaire` : ''}</div></div>
      <div><div class="sup-t">Ports suivis</div><div class="dleg">${ligne(COL.up, r.ports.up, r.ports.up > 1 ? 'actifs' : 'actif')}${ligne(COL.down, r.ports.down + r.ports.disabled, r.ports.down + r.ports.disabled > 1 ? 'inactifs' : 'inactif')}${ligne(COL.crit, r.ports.error, 'en erreur')}</div>
        <div class="dnote">Trafic total : <b>${debit(r.trafic)}</b>${r.poe ? ` · PoE mesuré : <b>${r.poe} W</b>` : ''}${Live.ecarts.length ? `<br>${plural(Live.ecarts.length, 'désaccord')} entre sources` : ''}</div></div>
      <div class="sup-top"><div class="sup-t">Ports les plus chargés</div>${charges || '<div class="muted">Aucun trafic mesuré</div>'}</div>
      <div><div class="sup-t">À regarder</div>${pannes || '<div class="muted">Aucun équipement en panne ni dégradé</div>'}</div>
    </div></div>`;
}

export { supervisionCard };
