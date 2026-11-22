/* Onglet Inventaire : tableau, filtres, tri, pagination, exports. */
import { CATEGORIES, COL, DEVICE_STATUS } from '../config.js';
import { $, clamp, csvCell, download, esc, fmtDate, norm, plural, today, typeOf } from '../utils.js';
import { ico } from '../icones.js';
import { Cache, Store } from '../store.js';
import { catOf, locLabel, locOf } from '../services/requetes.js';
import { NET_CATS } from '../services/cablage.js';
import { search } from '../services/recherche.js';
import { Actions, Changes, Inputs, showTab, toast, UI, Views } from './socle.js';
import { goto } from './carto/carto.js';
import { opt } from './carto/fiches.js';
import { Mat } from './materiel/catalogue.js';

const Inv = { q: '', group: '', type: '', bld: '', status: '', brand: '', sort: 'hostname', dir: 1, page: 0, built: false, PAGE: 100 };
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
/* Groupes des compteurs du haut : plusieurs catégories ou plusieurs statuts à la fois */
const INV_GROUPS = {
  net: { label: 'Équipements réseau', test: r => NET_CATS.includes(r.cat) },
  watch: { label: 'À surveiller', test: r => r.status === 'fault' || r.status === 'maintenance' },
};
function invFiltered() {
  const q = norm(Inv.q.trim()), grp = INV_GROUPS[Inv.group];
  const rows = invRows().filter(r => (!grp || grp.test(r)) && (!Inv.type || r.cat === Inv.type) && (!Inv.bld || r.bld === Inv.bld) && (!Inv.status || r.status === Inv.status) && (!Inv.brand || r.brand === Inv.brand) && (!q || r.text.includes(q)));
  const k = Inv.sort, val = r => k === 'ip' ? ipKey(r.ip) : k === 'status' ? DEVICE_STATUS[r.status].label : String(r[k] || '~');
  return rows.sort((a, b) => val(a).localeCompare(val(b), 'fr', { numeric: true }) * Inv.dir || a.hostname.localeCompare(b.hostname));
}
/* Compteurs de la vue d'ensemble. Un clic applique le filtre correspondant. */
function renderInvKpi() {
  const all = invRows(), n = f => all.filter(f).length;
  const noFilter = !Inv.group && !Inv.type && !Inv.status;
  const cards = [
    { label: 'Équipements', v: all.length, tip: 'Tous les équipements et baies de l\'inventaire', set: {}, on: noFilter },
    { label: 'Équipements réseau', v: n(INV_GROUPS.net.test), tip: 'Switchs, routeurs et pare-feu', set: { group: 'net' }, on: Inv.group === 'net' },
    { label: 'Switchs', v: n(r => r.cat === 'switch'), set: { type: 'switch' }, on: Inv.type === 'switch' },
    { label: 'Bornes Wi-Fi', v: n(r => r.cat === 'ap'), set: { type: 'ap' }, on: Inv.type === 'ap' },
    { label: 'Serveurs', v: n(r => r.cat === 'server'), set: { type: 'server' }, on: Inv.type === 'server' },
    { label: 'En service', v: n(r => r.status === 'active'), set: { status: 'active' }, on: Inv.status === 'active', color: COL.up },
    { label: 'À surveiller', v: n(INV_GROUPS.watch.test), tip: 'Équipements en panne ou en maintenance', set: { group: 'watch' }, on: Inv.group === 'watch', color: n(INV_GROUPS.watch.test) ? COL.serious : null },
  ];
  $('#inv-kpi').innerHTML = cards.map(c => `<button class="ikpi ${c.on ? 'on' : ''}" data-act="inv-kpi" data-set='${JSON.stringify(c.set)}' data-tip="${esc(c.label)}|${esc(c.tip || 'Clic : filtrer la liste')}">
    <span class="l">${c.label}${c.color ? `<i style="background:${c.color}"></i>` : ''}</span><span class="v">${c.v}</span></button>`).join('');
}
Views.inv = {
  render() {
    const host = $('#tab-inv'), d = Store.db;
    const brands = [...new Set(invRows().map(r => r.brand))].sort(), cats = [...new Set(invRows().map(r => r.cat))];
    const sel = (name, label, opts) => `<select data-chg="inv-f" data-f="${name}" data-tip="Filtrer par ${label}"><option value="">${label} : tous</option>${opts}</select>`;
    if (!Inv.built) {
      host.innerHTML = `<div class="inv"><div class="inv-over"><div class="inv-h">Vue d'ensemble</div><div class="inv-kpi" id="inv-kpi"></div></div>
        <div class="inv-card"><div class="inv-tools" id="inv-bar"></div><div id="inv-other"></div><div class="inv-table" id="inv-table"></div></div></div>`;
      Inv.built = true;
    }
    $('#inv-bar').innerHTML = `<div class="inv-h" style="margin:0">Liste des équipements</div>
      <div class="gsearch" style="margin:0;max-width:300px">${ico('search')}<input type="search" id="inv-q" data-inp="inv-q" placeholder="Rechercher : nom, IP, MAC, série, pièce…" value="${esc(Inv.q)}" style="width:100%;padding-left:30px"></div>
      ${sel('type', 'Type', Object.keys(CATEGORIES).filter(k => cats.includes(k)).map(k => opt(k, CATEGORIES[k].one, Inv.type)).join(''))}
      ${sel('bld', 'Bâtiment', d.buildings.map(b => opt(b.id, `Bât. ${b.code}`, Inv.bld)).join(''))}
      ${sel('status', 'Statut', Object.entries(DEVICE_STATUS).map(([k, v]) => opt(k, v.label, Inv.status)).join(''))}
      ${sel('brand', 'Marque', brands.map(b => opt(b, b, Inv.brand)).join(''))}
      <button class="btn ghost" data-act="inv-reset" data-tip="Effacer tous les filtres">${ico('x')}Effacer</button>
      <span class="grow"></span><span id="inv-pager" class="row"></span>
      <button class="btn" data-act="csv-import" data-tip="Import CSV|Ajouter des équipements ou des prises murales depuis un fichier, avec contrôle ligne par ligne">${ico('upload')}Importer</button>
      <button class="btn" data-act="inv-csv" data-tip="Export CSV|Télécharger la vue filtrée (séparateur point-virgule, compatible Excel)">${ico('download')}CSV</button>
      <button class="btn" data-act="inv-json" data-tip="Export JSON|Télécharger la vue filtrée">${ico('download')}JSON</button>`;
    renderInvTable();
  },
};
function renderInvTable() {
  const rows = invFiltered(), pages = Math.max(1, Math.ceil(rows.length / Inv.PAGE));
  Inv.page = clamp(Inv.page, 0, pages - 1);
  const from = Inv.page * Inv.PAGE, page = rows.slice(from, from + Inv.PAGE);
  renderInvKpi();
  $('#inv-pager').innerHTML = `<span class="muted" id="inv-count">${rows.length ? `${from + 1} – ${from + page.length} sur ${rows.length}` : '0 élément'}${INV_GROUPS[Inv.group] ? ` · ${INV_GROUPS[Inv.group].label}` : ''}</span>
    <button class="btn icon" data-act="inv-page" data-d="-1" ${Inv.page ? '' : 'disabled'} data-tip="Page précédente">${ico('chevr', 'flip')}</button><button class="btn icon" data-act="inv-page" data-d="1" ${Inv.page < pages - 1 ? '' : 'disabled'} data-tip="Page suivante">${ico('chevr')}</button>`;
  $('#inv-table').innerHTML = rows.length ? `<table class="it"><thead><tr>${INV_COLS.map(([k, l]) => `<th data-act="inv-sort" data-k="${k}" class="${Inv.sort === k ? 'on' : ''}">${l}<span class="so">${Inv.sort === k ? (Inv.dir > 0 ? '▲' : '▼') : '↕'}</span></th>`).join('')}<th></th></tr></thead><tbody>
    ${page.map(r => `<tr tabindex="0" data-act="inv-go" data-id="${r.id}" data-tip="${esc(r.hostname)}|Clic : ouvrir dans la Cartographie">
      <td class="muted">${r.type}</td>
      <td><div class="nm"><span class="tile" style="color:${CATEGORIES[r.cat].color}">${ico(CATEGORIES[r.cat].icon)}</span><b>${esc(r.hostname)}</b></div></td>
      <td>${esc(r.brand)}</td><td>${esc(r.model)}</td><td class="muted">${esc(r.loc)}</td>
      <td class="mono">${esc(r.serial) || '—'}</td><td class="mono">${esc(r.ip) || '—'}</td><td>${esc(r.firmware) || '—'}</td><td>${fmtDate(r.installDate)}</td><td><span class="st2"><i style="background:${DEVICE_STATUS[r.status].color}"></i>${DEVICE_STATUS[r.status].label}</span></td>
      <td><div class="acts"><button class="btn sm icon ghost" data-act="${r.kind === 'rack' ? 'rack-edit' : 'dev-edit'}" data-id="${r.id}" data-tip="Modifier">${ico('edit')}</button><button class="btn sm icon ghost" data-act="${r.kind === 'rack' ? 'rack-del' : r.status === 'retired' ? 'dev-restock' : 'dev-remove'}" data-id="${r.id}" data-tip="${r.status === 'retired' ? 'Remettre en stock' : 'Retirer'}">${ico(r.status === 'retired' ? 'box' : 'out')}</button></div></td></tr>`).join('')}</tbody></table>` : '<div class="empty">Aucun équipement ne correspond aux filtres.</div>';
  // Autres résultats de la recherche : prises, ports, pièces
  const other = Inv.q.trim().length >= 2 ? search(Inv.q, 8).filter(g => !['Équipements', 'Baies', 'Catalogue'].includes(g.name)) : [];
  $('#inv-other').innerHTML = other.length ? `<div class="inv-other"><span class="sec-t">Autres résultats</span>${other.map(g => `<span class="muted">${g.name} (${g.total}) :</span>${g.items.map(i => `<span class="chip" style="cursor:pointer" data-act="go" data-id="${i.id}" data-tip="${esc(i.label)}|${esc(i.sub)}">${ico(i.icon)}${esc(i.label)}</span>`).join('')}`).join('')}</div>` : '';
}
Actions['inv-kpi'] = el => { Object.assign(Inv, { group: '', type: '', status: '', page: 0 }, JSON.parse(el.dataset.set)); Views.inv.render(); };
Inputs['inv-q'] = el => { Inv.q = el.value; Inv.page = 0; renderInvTable(); };
Changes['inv-f'] = el => { Inv[el.dataset.f] = el.value; if (el.dataset.f !== 'bld' && el.dataset.f !== 'brand') Inv.group = ''; Inv.page = 0; renderInvTable(); };
Actions['inv-reset'] = () => { Object.assign(Inv, { q: '', group: '', type: '', bld: '', status: '', brand: '', page: 0 }); Views.inv.render(); };
Actions['inv-sort'] = el => { const k = el.dataset.k; if (Inv.sort === k) Inv.dir = -Inv.dir; else { Inv.sort = k; Inv.dir = 1; } renderInvTable(); };
Actions['inv-page'] = el => { Inv.page += +el.dataset.d; renderInvTable(); $('#inv-table').scrollTop = 0; };
Actions['inv-go'] = el => goto(el.dataset.id);
/* Ouvre un objet quelconque : Cartographie, ou onglet Matériel pour un modèle du catalogue */
Actions.go = el => { const id = el.dataset.id; if (typeOf(id) === 'catalog') { Mat.sel = id; Mat.cat = ''; UI.dirty.add('mat'); showTab('mat'); } else goto(id); };
const invExportRows = () => invFiltered().map(r => ({ type: r.type, nom: r.hostname, marque: r.brand, modele: r.model, emplacement: r.loc, numero_serie: r.serial, ip: r.ip, mac: r.mac, firmware: r.firmware, date_installation: r.installDate, statut: DEVICE_STATUS[r.status].label }));
Actions['inv-csv'] = () => {
  const rows = invExportRows(), cols = Object.keys(rows[0] || { type: '' }), q = csvCell;
  download(`netcarto-inventaire-${today()}.csv`, '﻿' + [cols.join(';'), ...rows.map(r => cols.map(c => q(r[c])).join(';'))].join('\r\n'), 'text/csv');
  toast(`${plural(rows.length, 'ligne')} exportée(s) en CSV`);
};
Actions['inv-json'] = () => { const rows = invExportRows(); download(`netcarto-inventaire-${today()}.json`, JSON.stringify(rows, null, 1)); toast(`${plural(rows.length, 'ligne')} exportée(s) en JSON`); };

export { Inv };
