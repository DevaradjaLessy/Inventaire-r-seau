/* Onglet Inventaire : tableau, filtres, tri, pagination, exports. */
import { CATEGORIES, DEVICE_STATUS } from '../config.js';
import { $, clamp, download, esc, fmtDate, norm, plural, today, typeOf } from '../utils.js';
import { ico } from '../icones.js';
import { Cache, Store } from '../store.js';
import { catOf, locLabel, locOf } from '../services/requetes.js';
import { search } from '../services/recherche.js';
import { Actions, Changes, Inputs, showTab, stDev, toast, UI, Views } from './socle.js';
import { goto } from './carto/carto.js';
import { opt } from './carto/fiches.js';
import { Mat } from './materiel/catalogue.js';

const Inv = { q: '', type: '', bld: '', status: '', brand: '', sort: 'hostname', dir: 1, page: 0, built: false, PAGE: 100 };
const INV_COLS = [
  ['type', 'Type'], ['hostname', 'Nom'], ['brand', 'Marque'], ['model', 'Modèle'], ['loc', 'Emplacement'], ['serial', 'N° de série'],
  ['ip', 'Adresse IP'], ['firmware', 'Firmware'], ['installDate', 'Installé le'], ['status', 'Statut'],
];
/* Lignes de l'inventaire : équipements et baies */
function invRows() {
  return Cache.get('inv', () => {
    const row = (e, kind) => {
      const c = catOf(e), l = locOf(e.id);
      return { id: e.id, kind, cat: c.category, type: CATEGORIES[c.category].one, hostname: e.hostname || e.name, brand: c.brand, model: c.model, loc: locLabel(e.id), bld: l.building?.id || '',
        serial: e.serial || '', ip: e.ip || '', mac: e.mac || '', firmware: e.firmware || '', installDate: e.installDate || '', status: e.status,
        text: norm([e.hostname || e.name, c.brand, c.model, c.ref, locLabel(e.id), e.serial, e.ip, e.mac, e.firmware, CATEGORIES[c.category].one, DEVICE_STATUS[e.status].label, e.notes].join(' ')) };
    };
    return [...Store.db.devices.filter(catOf).map(d => row(d, 'device')), ...Store.db.racks.filter(catOf).map(r => row(r, 'rack'))];
  });
}
const ipKey = ip => ip ? ip.split('.').map(n => n.padStart(3, '0')).join('.') : '~';
function invFiltered() {
  const q = norm(Inv.q.trim());
  const rows = invRows().filter(r => (!Inv.type || r.cat === Inv.type) && (!Inv.bld || r.bld === Inv.bld) && (!Inv.status || r.status === Inv.status) && (!Inv.brand || r.brand === Inv.brand) && (!q || r.text.includes(q)));
  const k = Inv.sort, val = r => k === 'ip' ? ipKey(r.ip) : k === 'status' ? DEVICE_STATUS[r.status].label : String(r[k] || '~');
  return rows.sort((a, b) => val(a).localeCompare(val(b), 'fr', { numeric: true }) * Inv.dir || a.hostname.localeCompare(b.hostname));
}
Views.inv = {
  render() {
    const host = $('#tab-inv'), d = Store.db;
    const brands = [...new Set(invRows().map(r => r.brand))].sort(), cats = [...new Set(invRows().map(r => r.cat))];
    const sel = (name, label, opts) => `<select data-chg="inv-f" data-f="${name}" data-tip="Filtrer par ${label}"><option value="">${label} : tous</option>${opts}</select>`;
    if (!Inv.built) {
      host.innerHTML = `<div class="inv"><div class="inv-bar" id="inv-bar"></div><div id="inv-other"></div><div class="inv-table" id="inv-table"></div><div class="inv-foot" id="inv-foot"></div></div>`;
      Inv.built = true;
    }
    $('#inv-bar').innerHTML = `<div class="gsearch" style="margin:0;max-width:340px">${ico('search')}<input type="search" id="inv-q" data-inp="inv-q" placeholder="Filtrer : nom, IP, MAC, série, pièce…" value="${esc(Inv.q)}" style="width:100%;padding-left:30px"></div>
      ${sel('type', 'Type', Object.keys(CATEGORIES).filter(k => cats.includes(k)).map(k => opt(k, CATEGORIES[k].one, Inv.type)).join(''))}
      ${sel('bld', 'Bâtiment', d.buildings.map(b => opt(b.id, `Bât. ${b.code}`, Inv.bld)).join(''))}
      ${sel('status', 'Statut', Object.entries(DEVICE_STATUS).map(([k, v]) => opt(k, v.label, Inv.status)).join(''))}
      ${sel('brand', 'Marque', brands.map(b => opt(b, b, Inv.brand)).join(''))}
      <button class="btn" data-act="inv-reset" data-tip="Effacer tous les filtres">${ico('x')}Effacer</button>
      <span class="grow"></span><span class="muted" id="inv-count"></span>
      <button class="btn" data-act="inv-csv" data-tip="Export CSV|Télécharger la vue filtrée (séparateur point-virgule, compatible Excel)">${ico('download')}CSV</button>
      <button class="btn" data-act="inv-json" data-tip="Export JSON|Télécharger la vue filtrée">${ico('download')}JSON</button>`;
    renderInvTable();
  },
};
function renderInvTable() {
  const rows = invFiltered(), pages = Math.max(1, Math.ceil(rows.length / Inv.PAGE));
  Inv.page = clamp(Inv.page, 0, pages - 1);
  const page = rows.slice(Inv.page * Inv.PAGE, (Inv.page + 1) * Inv.PAGE);
  $('#inv-count').textContent = `${plural(rows.length, 'élément')} sur ${invRows().length}`;
  $('#inv-table').innerHTML = rows.length ? `<table class="t"><thead><tr>${INV_COLS.map(([k, l]) => `<th data-act="inv-sort" data-k="${k}" style="cursor:pointer">${l}${Inv.sort === k ? (Inv.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th></th></tr></thead><tbody>
    ${page.map(r => `<tr data-act="inv-go" data-id="${r.id}" style="cursor:pointer" data-tip="${esc(r.hostname)}|Clic : ouvrir dans la Cartographie">
      <td><span class="chip"><span class="dot" style="background:${CATEGORIES[r.cat].color}"></span>${r.type}</span></td><td><b>${esc(r.hostname)}</b></td><td>${esc(r.brand)}</td><td>${esc(r.model)}</td><td class="muted">${esc(r.loc)}</td>
      <td class="mono">${esc(r.serial) || '—'}</td><td class="mono">${esc(r.ip) || '—'}</td><td>${esc(r.firmware) || '—'}</td><td>${fmtDate(r.installDate)}</td><td>${stDev(r.status)}</td>
      <td><div class="row" style="gap:4px;justify-content:flex-end"><button class="btn sm icon" data-act="${r.kind === 'rack' ? 'rack-edit' : 'dev-edit'}" data-id="${r.id}" data-tip="Modifier">${ico('edit')}</button><button class="btn sm icon danger" data-act="${r.kind === 'rack' ? 'rack-del' : r.status === 'retired' ? 'dev-restock' : 'dev-remove'}" data-id="${r.id}" data-tip="${r.status === 'retired' ? 'Remettre en stock ou supprimer' : 'Retirer'}">${ico(r.status === 'retired' ? 'box' : 'out')}</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aucun équipement ne correspond aux filtres.</div>';
  $('#inv-foot').innerHTML = pages > 1 ? `<button class="btn sm" data-act="inv-page" data-d="-1" ${Inv.page ? '' : 'disabled'}>Précédent</button><span class="muted">Page ${Inv.page + 1} / ${pages}</span><button class="btn sm" data-act="inv-page" data-d="1" ${Inv.page < pages - 1 ? '' : 'disabled'}>Suivant</button>` : '';
  // Autres résultats de la recherche : prises, ports, pièces
  const other = Inv.q.trim().length >= 2 ? search(Inv.q, 8).filter(g => !['Équipements', 'Baies', 'Catalogue'].includes(g.name)) : [];
  $('#inv-other').innerHTML = other.length ? `<div class="inv-other"><span class="sec-t">Autres résultats</span>${other.map(g => `<span class="muted">${g.name} (${g.total}) :</span>${g.items.map(i => `<span class="chip" style="cursor:pointer" data-act="go" data-id="${i.id}" data-tip="${esc(i.label)}|${esc(i.sub)}">${ico(i.icon)}${esc(i.label)}</span>`).join('')}`).join('')}</div>` : '';
}
Inputs['inv-q'] = el => { Inv.q = el.value; Inv.page = 0; renderInvTable(); };
Changes['inv-f'] = el => { Inv[el.dataset.f] = el.value; Inv.page = 0; renderInvTable(); };
Actions['inv-reset'] = () => { Object.assign(Inv, { q: '', type: '', bld: '', status: '', brand: '', page: 0 }); Views.inv.render(); };
Actions['inv-sort'] = el => { const k = el.dataset.k; if (Inv.sort === k) Inv.dir = -Inv.dir; else { Inv.sort = k; Inv.dir = 1; } renderInvTable(); };
Actions['inv-page'] = el => { Inv.page += +el.dataset.d; renderInvTable(); $('#inv-table').scrollTop = 0; };
Actions['inv-go'] = el => goto(el.dataset.id);
/* Ouvre un objet quelconque : Cartographie, ou onglet Matériel pour un modèle du catalogue */
Actions.go = el => { const id = el.dataset.id; if (typeOf(id) === 'catalog') { Mat.sel = id; Mat.cat = ''; UI.dirty.add('mat'); showTab('mat'); } else goto(id); };
const invExportRows = () => invFiltered().map(r => ({ type: r.type, nom: r.hostname, marque: r.brand, modele: r.model, emplacement: r.loc, numero_serie: r.serial, ip: r.ip, mac: r.mac, firmware: r.firmware, date_installation: r.installDate, statut: DEVICE_STATUS[r.status].label }));
Actions['inv-csv'] = () => {
  const rows = invExportRows(), cols = Object.keys(rows[0] || { type: '' }), q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  download(`netcarto-inventaire-${today()}.csv`, '﻿' + [cols.join(';'), ...rows.map(r => cols.map(c => q(r[c])).join(';'))].join('\r\n'), 'text/csv');
  toast(`${plural(rows.length, 'ligne')} exportée(s) en CSV`);
};
Actions['inv-json'] = () => { const rows = invExportRows(); download(`netcarto-inventaire-${today()}.json`, JSON.stringify(rows, null, 1)); toast(`${plural(rows.length, 'ligne')} exportée(s) en JSON`); };

export { Inv };
