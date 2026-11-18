/* Onglet Tableau de bord : indicateurs, barres, matrice, alertes, historique. */
import { CATEGORIES, COL, HISTORY_TYPES, POE_WARN_PCT, PORT_STATUS, RACK_FULL_PCT } from '../config.js';
import { $, esc, fmtDateTime, groupBy, pct, plural, sum } from '../utils.js';
import { ico } from '../icones.js';
import { Cache, Store } from '../store.js';
import { cablesOf, catOf, computeAlerts, isPassive, locOf, poeUsage, portsOf, rackUsage } from '../services/requetes.js';
import { isNetDev, outletInfo } from '../services/cablage.js';
import { levelColor, stPort, Views } from './socle.js';

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
      ports: netPorts.length, portsUsed: netPorts.filter(used).length, portStates: groupBy(netPorts, p => p.status),
      uTotal: sum(racks, x => x.total), uUsed: sum(racks, x => x.used), racks,
      poeUsed: sum(poe, x => x.used), poeBudget: sum(poe, x => x.budget), poe,
      outlets: outs.length, patched: outs.filter(s => s !== 'idle' && s !== 'free').length, outletsUp: outs.filter(s => s === 'up').length,
      swPorts: sw.map(x => { const ps = portsOf(x.id); return { dev: x, used: ps.filter(used).length, total: ps.length }; }),
    };
  });
}
const HIST_ICON = { add: 'plus', move: 'move', remove: 'out', edit: 'edit', stock: 'box', import: 'upload', catalog: 'list' };
Views.dash = {
  render() {
    const s = computeStats(), d = Store.db, alerts = computeAlerts();
    const kpi = (label, val, sub, p = null, tip = '') => `<div class="panel kpi" ${tip ? `data-tip="${esc(tip)}"` : ''}><div class="sec-t">${label}</div><div class="v">${val}</div><div class="s">${sub}</div>${p != null ? `<div class="bar"><i style="width:${Math.min(100, p)}%"></i></div>` : ''}</div>`;
    /* Barres horizontales : une seule teinte, la longueur porte la valeur */
    const hbars = (rows, max, fmt) => `<div class="hb">${rows.map(r => `<span class="l" title="${esc(r.label)}">${esc(r.label)}</span><div class="tr" ${r.id ? `data-act="go" data-id="${r.id}"` : ''} data-tip="${esc(r.label)}|${esc(r.tip)}"><i style="width:${max ? r.v * 100 / max : 0}%;${r.warn ? `background:${COL.serious}` : ''}"></i></div><span class="n">${r.warn ? ico('alert') + ' ' : ''}${fmt(r)}</span>`).join('')}</div>`;
    const cats = Object.keys(CATEGORIES).filter(k => s.byCat.has(k));
    const catRows = cats.map(k => ({ label: CATEGORIES[k].label, v: s.byCat.get(k).length, tip: plural(s.byCat.get(k).length, 'équipement') })).sort((a, b) => b.v - a.v);
    const bldRows = d.buildings.map(b => ({ id: b.id, label: b.name, v: (s.byBld.get(b.id) || []).length, tip: plural((s.byBld.get(b.id) || []).length, 'équipement') }));
    const swRows = s.swPorts.map(x => ({ id: x.dev.id, label: x.dev.hostname, v: pct(x.used, x.total), tip: `${x.used} ports utilisés sur ${x.total}`, raw: x })).sort((a, b) => b.v - a.v);
    const rackRows = s.racks.map(x => ({ id: x.r.id, label: x.r.name, v: x.pct, warn: x.pct >= RACK_FULL_PCT, tip: `${x.used} U occupées sur ${x.total}`, raw: x })).sort((a, b) => b.v - a.v);
    const poeRows = s.poe.map(x => ({ id: x.dev.id, label: x.dev.hostname, v: x.pct, warn: x.pct >= POE_WARN_PCT, tip: `${x.used} W consommés sur ${x.budget} W`, raw: x })).sort((a, b) => b.v - a.v);
    // Matrice type × bâtiment : teinte unique, plus dense quand la valeur monte
    const mxMax = Math.max(1, ...cats.flatMap(k => d.buildings.map(b => s.byCat.get(k).filter(x => locOf(x.id).building?.id === b.id).length)));
    const matrix = `<table class="mx"><thead><tr><th></th>${d.buildings.map(b => `<th style="text-align:center">Bât. ${esc(b.code)}</th>`).join('')}<th style="text-align:center">Total</th></tr></thead><tbody>${cats.map(k => { const row = d.buildings.map(b => s.byCat.get(k).filter(x => locOf(x.id).building?.id === b.id).length);
      return `<tr><th>${CATEGORIES[k].label}</th>${row.map((n, i) => `<td style="background:rgba(56,189,248,${n ? (0.1 + 0.5 * n / mxMax).toFixed(2) : 0.03})" data-tip="${CATEGORIES[k].label} — Bât. ${esc(d.buildings[i].code)}|${plural(n, 'équipement')}">${n || '·'}</td>`).join('')}<td><b>${sum(row)}</b></td></tr>`; }).join('')}</tbody></table>`;
    const states = ['up', 'down', 'disabled', 'error'].map(k => ({ k, n: (s.portStates.get(k) || []).length }));
    const crit = alerts.filter(a => a.level === 'crit').length;
    $('#tab-dash').innerHTML = `<div class="dash">
      ${kpi('Équipements', s.devices, `dont ${s.active} actifs · ${d.racks.length} baies`, null, 'Équipements installés|Hors équipements « hors service »')}
      ${kpi('Ports occupés', `${pct(s.portsUsed, s.ports)} <small>%</small>`, `${s.portsUsed} sur ${s.ports} ports réseau`, pct(s.portsUsed, s.ports), 'Ports des switchs, routeurs et pare-feu|Un port est occupé s\'il est actif ou câblé')}
      ${kpi('Baies', `${pct(s.uUsed, s.uTotal)} <small>%</small>`, `${s.uUsed} U occupées sur ${s.uTotal}`, pct(s.uUsed, s.uTotal))}
      ${kpi('PoE consommé', `${s.poeUsed} <small>W</small>`, `budget total ${s.poeBudget} W (${pct(s.poeUsed, s.poeBudget)} %)`, pct(s.poeUsed, s.poeBudget))}
      ${kpi('Prises brassées', `${pct(s.patched, s.outlets)} <small>%</small>`, `${s.patched} sur ${s.outlets} · ${s.outletsUp} actives`, pct(s.patched, s.outlets))}
      ${kpi('Alertes', alerts.length, crit ? `<span class="st"><i style="background:${COL.crit}"></i>${crit} critique${crit > 1 ? 's' : ''}</span>` : 'aucune alerte critique')}
      <div class="panel card c4"><h3>${ico('alert')}Alertes (${alerts.length})</h3><div class="scroll">${alerts.map(a => `<div class="al" data-act="go" data-id="${a.ref}"><span style="color:${levelColor(a.level)}">${ico(a.icon)}</span><div><b>${esc(a.text)}</b><small>${{ crit: 'Critique', serious: 'Sérieux', warn: 'Avertissement' }[a.level]} · ${esc(a.sub)}</small></div></div>`).join('') || '<div class="empty">Aucune alerte</div>'}</div></div>
      <div class="panel card c4"><h3>${ico('box')}Équipements par type</h3>${hbars(catRows, Math.max(...catRows.map(r => r.v), 1), r => r.v)}</div>
      <div class="panel card c4"><h3>${ico('building')}Équipements par bâtiment</h3>${hbars(bldRows, Math.max(...bldRows.map(r => r.v), 1), r => r.v)}
        <h3 style="margin-top:18px">${ico('switch')}États des ports réseau</h3><div class="segbar">${states.filter(x => x.n).map(x => `<i style="flex:${x.n};background:${PORT_STATUS[x.k].color}" data-tip="${PORT_STATUS[x.k].label}|${plural(x.n, 'port')} (${pct(x.n, s.ports)} %)"></i>`).join('')}</div>
        <div class="row wrap" style="margin-top:8px;gap:6px 14px">${states.map(x => `<span>${stPort(x.k)} <span class="muted">${x.n}</span></span>`).join('')}</div></div>
      <div class="panel card c4"><h3>${ico('switch')}Occupation des ports par switch</h3>${hbars(swRows, 100, r => `${r.raw.used}/${r.raw.total}`)}</div>
      <div class="panel card c4"><h3>${ico('rack')}Remplissage des baies</h3>${hbars(rackRows, 100, r => `${r.raw.used}/${r.raw.total} U`)}
        <h3 style="margin-top:18px">${ico('bolt')}Budget PoE par switch</h3>${hbars(poeRows, 100, r => `${r.raw.used}/${r.raw.budget} W`)}</div>
      <div class="panel card c4"><h3>${ico('list')}Type × bâtiment</h3>${matrix}</div>
      <div class="panel card c12"><h3>${ico('history')}Dernières actions</h3><div class="scroll"><div class="hist">${d.history.slice(0, 60).map(h => `<span class="d">${fmtDateTime(h.ts)}</span><span class="chip">${ico(HIST_ICON[h.type] || 'edit')}${HISTORY_TYPES[h.type] || h.type}</span><span>${esc(h.text)}</span>`).join('') || '<span class="dim">Aucune action</span>'}</div></div></div>
    </div>`;
  },
};
