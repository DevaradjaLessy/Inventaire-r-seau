/* Onglet Tableau de bord : indicateurs, barres, matrice, alertes, historique. */
import { CATEGORIES, COL, HISTORY_TYPES, POE_WARN_PCT, PORT_STATUS, RACK_FULL_PCT } from '../config.js';
import { $, clamp, esc, fmtDateTime, groupBy, pct, plural, sum } from '../utils.js';
import { ico } from '../icones.js';
import { Cache, Store } from '../store.js';
import { cablesOf, catOf, computeAlerts, isPassive, locLabel, locOf, poeUsage, portsOf, rackUsage } from '../services/requetes.js';
import { effStatus, isNetDev, outletInfo } from '../services/cablage.js';
import { Sync } from '../sync.js';
import { Actions, levelColor, showTab, UI, Views } from './socle.js';
import { Inv } from './inventaire.js';

/* Statistiques globales (hors équipements hors service) */
function computeStats() {
  return Cache.get('stats', () => {
    const d = Store.db, devs = d.devices.filter(x => x.status !== 'retired' && catOf(x));
    const net = devs.filter(isNetDev), netPorts = net.flatMap(x => portsOf(x.id));
    const used = p => p.status === 'up' || cablesOf(p.id).length > 0;
    const sw = devs.filter(x => catOf(x).category === 'switch');
    const racks = d.racks.map(r => ({ r, ...rackUsage(r.id) }));
    const poe = sw.filter(x => catOf(x).poeBudgetW).map(x => ({ dev: x, ...poeUsage(x) }));
    const outs = d.outlets.map(o => outletInfo(o.id).status);
    const byCat = groupBy(devs, x => catOf(x).category), byBld = groupBy(devs, x => locOf(x.id).building?.id || '');
    return {
      devices: devs.length, active: devs.filter(x => !isPassive(x)).length, byCat, byBld,
      ports: netPorts.length, portsUsed: netPorts.filter(used).length, portStates: groupBy(netPorts, p => effStatus(p)),
      uTotal: sum(racks, x => x.total), uUsed: sum(racks, x => x.used), racks,
      poeUsed: sum(poe, x => x.used), poeBudget: sum(poe, x => x.budget), poe,
      outlets: outs.length, patched: outs.filter(s => s !== 'idle' && s !== 'free').length, outletsUp: outs.filter(s => s === 'up').length,
      swPorts: sw.map(x => { const ps = portsOf(x.id); return { dev: x, used: ps.filter(used).length, total: ps.length }; }),
    };
  });
}
const HIST_ICON = { add: 'plus', move: 'move', remove: 'out', edit: 'edit', stock: 'box', import: 'upload', catalog: 'list' };
const LEVEL_LABEL = { crit: 'Critique', serious: 'Sérieux', warn: 'Avertissement' };
/* Anneau de progression (0 à 100 %), avec une icône au centre */
function ring(p, icon, color = 'var(--accent)') {
  const r = 22, c = 2 * Math.PI * r, v = clamp(p, 0, 100);
  return `<div class="ring"><svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--panel3)" stroke-width="5"/><circle cx="28" cy="28" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round" stroke-dasharray="${(c * v / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 28 28)"/></svg>${ico(icon)}</div>`;
}
/* Anneau à plusieurs segments : parts = [{ n, color, label }] */
function donut(parts, total, center, sub) {
  const r = 52, c = 2 * Math.PI * r, gap = 3;
  let off = 0;
  const segs = parts.filter(x => x.n).map(x => { const len = c * x.n / total, d = Math.max(1, len - gap), seg = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${x.color}" stroke-width="15" stroke-dasharray="${d.toFixed(1)} ${(c - d).toFixed(1)}" stroke-dashoffset="${(-off).toFixed(1)}" transform="rotate(-90 70 70)" data-tip="${esc(x.label)}|${plural(x.n, 'port')} (${pct(x.n, total)} %)"/>`; off += len; return seg; }).join('');
  return `<div class="donut"><svg viewBox="0 0 140 140">${segs}</svg><div class="c"><b>${center}</b><span>${sub}</span></div></div>`;
}
/* En-tête d'une carte : icône, titre, et un élément à droite */
const titre = (icon, t, right = '') => `<div class="dt"><span class="ti">${ico(icon)}</span><h3>${t}</h3><span class="grow"></span>${right}</div>`;
/* Versions de firmware par modèle : plusieurs versions pour un même modèle signalent un parc à mettre à niveau */
function firmwareCard() {
  const parModele = new Map();
  for (const d of Store.db.devices) {
    const c = catOf(d);
    if (!c || d.status === 'retired' || c.category === 'passive' || !d.firmware) continue;
    const m = parModele.get(c.id) || parModele.set(c.id, { c, v: new Map() }).get(c.id);
    m.v.set(d.firmware, (m.v.get(d.firmware) || 0) + 1);
  }
  const lignes = [...parModele.values()].sort((a, b) => b.v.size - a.v.size || `${a.c.brand} ${a.c.model}`.localeCompare(`${b.c.brand} ${b.c.model}`));
  const ecarts = lignes.filter(l => l.v.size > 1).length;
  return `<div class="dcard c5">${titre('gauge', 'Firmware par modèle', `<span class="muted">${ecarts ? `${plural(ecarts, 'modèle')} avec plusieurs versions` : 'parc homogène'}</span>`)}
    <div class="scroll">${lignes.map(l => `<div class="fw-row" data-act="fw-inv" data-q="${esc(l.c.model)}" data-tip="${esc(l.c.brand)} ${esc(l.c.model)}|Clic : voir ces équipements dans l'Inventaire">
      <b>${esc(l.c.model)}</b><span>${[...l.v].sort((a, b) => b[1] - a[1]).map(([v, n]) => `${esc(v)} <small>× ${n}</small>`).join(' · ')}</span>${l.v.size > 1 ? `<span class="chip warn">${l.v.size} versions</span>` : '<span></span>'}</div>`).join('') || '<div class="empty">Aucune version de firmware saisie</div>'}</div></div>`;
}
Actions['fw-inv'] = el => { Object.assign(Inv, { q: el.dataset.q, group: '', type: '', bld: '', status: '', brand: '', page: 0 }); UI.dirty.add('inv'); showTab('inv'); };
/* État de sécurité du serveur (mode serveur, administrateur) : la carte se remplit dès que le serveur a répondu */
function remplirSecurite() {
  Sync.appel('GET', '/securite').then(e => {
    const hote = $('#sec-etat'); if (!hote) return;
    const l = (niveau, texte) => `<div class="sec-row"><i style="background:${{ ok: COL.up, warn: COL.warn, crit: COL.crit }[niveau]}"></i><span>${texte}</span></div>`;
    const liste = a => a.map(esc).join(', '), s = e.sauvegarde;
    hote.innerHTML = [
      l(e.echecs24h >= 10 ? 'crit' : e.echecs24h ? 'warn' : 'ok', `${plural(e.echecs24h, 'échec')} de connexion en 24 h${e.verrouilles.length ? ` — ${plural(e.verrouilles.length, 'compte')} verrouillé${e.verrouilles.length > 1 ? 's' : ''} : ${liste(e.verrouilles)}` : ''}`),
      l(s.derniere == null || s.ageHeures > 48 ? 'crit' : s.ageHeures > 26 ? 'warn' : 'ok', s.derniere == null ? 'Dernière sauvegarde : aucune' : `Dernière sauvegarde : il y a ${s.ageHeures < 1 ? 'moins d\'une heure' : `${Math.round(s.ageHeures)} h`}${s.automatique ? '' : ' — sauvegarde automatique désactivée'}`),
      e.https.actif ? l(e.https.joursRestants < 30 ? 'warn' : 'ok', `HTTPS actif — certificat ${e.https.autoSigne ? 'auto-signé' : 'fourni'}, valable encore ${e.https.joursRestants} jours`) : l('crit', 'HTTPS désactivé : les mots de passe circulent en clair'),
      l(e.comptes.administrateurs < 2 ? 'warn' : 'ok', `${plural(e.comptes.actifs, 'compte')} actif${e.comptes.actifs > 1 ? 's' : ''}, dont ${plural(e.comptes.administrateurs, 'administrateur')}${e.comptes.administrateurs < 2 ? ' — prévoyez un second administrateur de secours' : ''} · ${plural(e.sessions, 'session')} ouverte${e.sessions > 1 ? 's' : ''}`),
      l('ok', e.courriel.actif ? `Envoi de courriels réglé : « Mot de passe oublié » envoie un lien${e.courriel.sansAdresse.length ? ` — comptes sans adresse : ${liste(e.courriel.sansAdresse)}` : ''}` : 'Envoi de courriels non réglé : un mot de passe perdu se traite par un lien remis par un administrateur'),
      e.jamaisConnectes.length ? l('warn', `Comptes jamais connectés : ${liste(e.jamaisConnectes)}`) : '',
      e.inactifs90j.length ? l('warn', `Comptes inactifs depuis 90 jours : ${liste(e.inactifs90j)}`) : '',
    ].join('');
  }).catch(err => { const hote = $('#sec-etat'); if (hote) hote.innerHTML = `<div class="empty">${esc(err.message)}</div>`; });
}
function securiteCard() {
  if (Store.mode !== 'serveur' || Sync.utilisateur?.role !== 'administrateur') return '';
  remplirSecurite();
  return `<div class="dcard c7">${titre('alert', 'Sécurité du serveur', `<button class="btn sm" data-act="compte-audit">${ico('history')}Journal d'audit</button>`)}<div id="sec-etat"><div class="empty">Chargement…</div></div></div>`;
}
Views.dash = {
  render() {
    const s = computeStats(), d = Store.db, alerts = computeAlerts();
    const kpi = (icon, label, val, sub, p = null, color) => `<div class="dcard kpi"><div class="kt"><div class="lbl">${label}</div><div class="v">${val}</div><div class="s">${sub}</div></div>${p != null ? ring(p, icon, color) : `<div class="ring flat" ${color ? `style="color:${color}"` : ''}>${ico(icon)}</div>`}</div>`;
    const title = (icon, t, right = '') => `<div class="dt"><span class="ti">${ico(icon)}</span><h3>${t}</h3><span class="grow"></span>${right}</div>`;
    /* Barres horizontales : une seule teinte, la longueur porte la valeur */
    const hbars = (rows, max, fmt) => `<div class="hb">${rows.map(r => `<span class="l" title="${esc(r.label)}">${r.icon ? ico(r.icon) : ''}${esc(r.label)}</span><div class="tr" ${r.id ? `data-act="go" data-id="${r.id}"` : ''} data-tip="${esc(r.label)}|${esc(r.tip)}"><i style="width:${max ? r.v * 100 / max : 0}%;${r.warn ? `background:${COL.serious}` : ''}"></i></div><span class="n">${r.warn ? `<span style="color:${COL.serious}">${ico('alert')}</span>` : ''}${fmt(r)}</span>`).join('')}</div>`;
    const cats = Object.keys(CATEGORIES).filter(k => s.byCat.has(k));
    const catRows = cats.map(k => ({ label: CATEGORIES[k].label, icon: CATEGORIES[k].icon, v: s.byCat.get(k).length, tip: plural(s.byCat.get(k).length, 'équipement') })).sort((a, b) => b.v - a.v);
    const swRows = s.swPorts.map(x => ({ id: x.dev.id, label: x.dev.hostname, v: pct(x.used, x.total), tip: `${x.used} ports utilisés sur ${x.total} (${pct(x.used, x.total)} %)`, raw: x })).sort((a, b) => b.v - a.v);
    const poeRows = s.poe.map(x => ({ id: x.dev.id, label: x.dev.hostname, v: x.pct, warn: x.pct >= POE_WARN_PCT, tip: `${x.used} W consommés sur ${x.budget} W (${x.pct} %)`, raw: x })).sort((a, b) => b.v - a.v);
    const racks = [...s.racks].sort((a, b) => b.pct - a.pct);
    // Matrice type × bâtiment : teinte unique, plus dense quand la valeur monte
    const mxMax = Math.max(1, ...cats.flatMap(k => d.buildings.map(b => s.byCat.get(k).filter(x => locOf(x.id).building?.id === b.id).length)));
    const matrix = `<table class="mx"><thead><tr><th></th>${d.buildings.map(b => `<th class="c">Bât. ${esc(b.code)}</th>`).join('')}<th class="c">Total</th></tr></thead><tbody>${cats.map(k => { const row = d.buildings.map(b => s.byCat.get(k).filter(x => locOf(x.id).building?.id === b.id).length);
      return `<tr><th>${ico(CATEGORIES[k].icon)}${CATEGORIES[k].label}</th>${row.map((n, i) => `<td style="background:color-mix(in srgb, var(--accent) ${n ? Math.round(10 + 50 * n / mxMax) : 3}%, transparent)" data-tip="${CATEGORIES[k].label} — Bât. ${esc(d.buildings[i].code)}|${plural(n, 'équipement')}">${n || '·'}</td>`).join('')}<td class="tot">${sum(row)}</td></tr>`; }).join('')}</tbody></table>`;
    const states = ['up', 'down', 'disabled', 'error'].map(k => ({ k, n: (s.portStates.get(k) || []).length, color: PORT_STATUS[k].color, label: PORT_STATUS[k].label }));
    const nLevel = l => alerts.filter(a => a.level === l).length, crit = nLevel('crit');
    const pill = l => nLevel(l) ? `<span class="pill" style="--c:${levelColor(l)}"><i></i>${nLevel(l)} ${LEVEL_LABEL[l].toLowerCase()}${nLevel(l) > 1 ? 's' : ''}</span>` : '';
    const site = d.sites[0];
    $('#tab-dash').innerHTML = `<div class="dash">
      <div class="dhead c12"><div><h2>Tableau de bord</h2><div class="muted">${esc(site ? site.name : 'Aucun site')} · ${plural(d.buildings.length, 'bâtiment')} · ${plural(d.floors.length, 'étage')} · mis à jour le ${fmtDateTime(d.meta.updatedAt)}</div></div><span class="grow"></span><button class="btn" data-act="vlans" data-tip="VLAN|Ajouter, renommer, recolorer ou supprimer un VLAN">${ico('floor')}VLAN (${d.vlans.length})</button></div>
      ${kpi('box', 'Équipements', s.devices, `dont ${s.active} actifs · ${plural(d.racks.length, 'baie')}`)}
      ${kpi('switch', 'Ports occupés', `${pct(s.portsUsed, s.ports)}<small> %</small>`, `${s.portsUsed} sur ${s.ports} ports`, pct(s.portsUsed, s.ports))}
      ${kpi('rack', 'Baies', `${pct(s.uUsed, s.uTotal)}<small> %</small>`, `${s.uUsed} U sur ${s.uTotal}`, pct(s.uUsed, s.uTotal))}
      ${kpi('bolt', 'PoE consommé', `${s.poeUsed}<small> W</small>`, `sur ${s.poeBudget} W de budget`, pct(s.poeUsed, s.poeBudget))}
      ${kpi('outlet', 'Prises brassées', `${pct(s.patched, s.outlets)}<small> %</small>`, `${s.patched} sur ${s.outlets} · ${s.outletsUp} actives`, pct(s.patched, s.outlets))}
      ${kpi('alert', 'Alertes', alerts.length, crit ? `dont ${crit} critique${crit > 1 ? 's' : ''}` : 'aucune critique', null, alerts.length ? (crit ? COL.crit : COL.serious) : null)}
      <div class="dcard c5">${title('alert', 'Alertes', `<span class="row" style="gap:6px">${pill('crit')}${pill('serious')}${pill('warn')}</span>`)}
        <div class="scroll alist">${alerts.map(a => `<div class="al" style="--c:${levelColor(a.level)}" data-act="go" data-id="${a.ref}"><span class="ai">${ico(a.icon)}</span><div><b>${esc(a.text)}</b><small>${esc(a.sub)}</small></div><span class="lv">${LEVEL_LABEL[a.level]}</span></div>`).join('') || '<div class="empty">Aucune alerte</div>'}</div></div>
      <div class="dcard c4">${title('box', 'Parc par type', `<span class="muted">${s.devices} équipements</span>`)}${hbars(catRows, Math.max(...catRows.map(r => r.v), 1), r => r.v)}</div>
      <div class="dcard c3">${title('switch', 'États des ports')}
        ${donut(states, s.ports || 1, s.ports, 'ports réseau')}
        <div class="dleg">${states.map(x => `<div><span class="st2"><i style="background:${x.color}"></i>${x.label}</span><b>${x.n}</b><span class="muted">${pct(x.n, s.ports)} %</span></div>`).join('')}</div></div>
      <div class="dcard c4">${title('switch', 'Occupation des ports par switch')}<div class="scroll">${hbars(swRows, 100, r => `${r.raw.used}/${r.raw.total}`)}</div></div>
      <div class="dcard c4">${title('rack', 'Remplissage des baies', `<span class="muted">${s.uUsed}/${s.uTotal} U</span>`)}
        <div class="rgs">${racks.map(x => `<div class="rg ${x.pct >= RACK_FULL_PCT ? 'warn' : ''}" data-act="go" data-id="${x.r.id}" data-tip="${esc(x.r.name)}|${x.used} U occupées sur ${x.total}|${esc(locLabel(x.r.roomId))}"><b>${x.pct} %</b><div class="tube"><i style="height:${x.pct}%"></i></div><span>${esc(x.r.name.replace(/^(BAIE|COFFRET)-/, ''))}</span><small>${x.used}/${x.total} U</small></div>`).join('')}</div>
        <div class="dnote">${racks.some(x => x.pct >= RACK_FULL_PCT) ? `<span style="color:${COL.serious}">${ico('alert')}</span>En orange : baie remplie à ${RACK_FULL_PCT} % ou plus` : 'Aucune baie proche de la saturation'}</div></div>
      <div class="dcard c4">${title('bolt', 'Budget PoE par switch')}<div class="scroll">${hbars(poeRows, 100, r => `${r.raw.used}/${r.raw.budget} W`)}</div></div>
      <div class="dcard c5">${title('building', 'Type × bâtiment')}${matrix}</div>
      ${firmwareCard()}${securiteCard()}
      <div class="dcard c7">${title('history', 'Dernières actions', `<button class="btn sm" data-act="historique" data-tip="Historique|Filtrer toutes les actions, revenir à un état antérieur">${ico('list')}Tout voir (${d.history.length})</button>`)}
        <div class="scroll tline">${d.history.slice(0, 40).map(h => `<div class="tli"><span class="td">${ico(HIST_ICON[h.type] || 'edit')}</span><div><b>${esc(h.text)}</b><small>${HISTORY_TYPES[h.type] || h.type} · ${fmtDateTime(h.ts)}</small></div></div>`).join('') || '<div class="empty">Aucune action</div>'}</div></div>
    </div>`;
  },
};

export { remplirSecurite };
