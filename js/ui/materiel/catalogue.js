/* Onglet Matériel disponible : catalogue, fiche technique, aperçu 3D, stock. */
import { CATEGORIES, COL, PORT_KIND } from '../../config.js';
import { $, esc, fmtSpeed, norm, plural } from '../../utils.js';
import { ico } from '../../icones.js';
import { Store } from '../../store.js';
import { locLabel } from '../../services/requetes.js';
import { installedCount, stockMove, stockOf } from '../../services/installation.js';
import { Viewer3D } from '../../3d/viewer.js';
import { Actions, Changes, Inputs, Modal, toast, undoAction, Views } from '../socle.js';
import { Views3D } from '../carto/carto.js';
import { dHead, kv, li, sec } from '../carto/fiches.js';

const Mat = { cat: '', sel: null, q: '', built: false, shown: '' };
const stockChip = c => { const s = stockOf(c.id), low = s.threshold > 0 && s.available <= s.threshold; return `<span class="chip" style="${low ? `border-color:${s.available ? COL.warn : COL.serious};color:${s.available ? COL.warn : COL.serious}` : ''}" data-tip="Stock disponible|Seuil d'alerte : ${s.threshold}">${low ? ico('alert') : ''}${s.available} en stock</span>`; };
Views.mat = {
  render() {
    const host = $('#tab-mat'), d = Store.db;
    if (!Mat.built) {
      host.innerHTML = `<div class="mat"><aside class="mat-cats" id="mat-cats"></aside>
        <div class="mat-main"><div class="inv-bar"><div class="gsearch" style="margin:0;max-width:320px">${ico('search')}<input type="search" data-inp="mat-q" placeholder="Filtrer les modèles…" style="width:100%;padding-left:30px"></div><span class="grow"></span><span class="muted" id="mat-count"></span><button class="btn pri" data-act="model-new">${ico('plus')}Nouveau modèle</button></div><div class="mat-grid" id="mat-grid"></div></div>
        <aside class="mat-side"><div class="mat-prev"><div id="mat-3d"></div></div><div id="mat-info"></div></aside></div>`;
      Mat.built = true;
      Views3D.preview = new Viewer3D($('#mat-3d'));
    }
    if (!Mat.sel || !Store.idx.cat.has(Mat.sel)) Mat.sel = d.catalog[0]?.id || null;
    const n = k => d.catalog.filter(c => c.category === k).length;
    $('#mat-cats').innerHTML = `<div class="sec-t" style="padding:12px 12px 6px">Catégories</div>
      <div class="li ${Mat.cat === '' ? 'on' : ''}" data-act="mat-cat" data-c="">${ico('box')}<span>Tout le catalogue</span><small>${d.catalog.length}</small></div>
      ${Object.entries(CATEGORIES).map(([k, v]) => `<div class="li ${Mat.cat === k ? 'on' : ''}" data-act="mat-cat" data-c="${k}">${ico(v.icon)}<span>${v.label}</span><small>${n(k)}</small></div>`).join('')}`;
    renderMatGrid(); renderMatInfo();
  },
};
function renderMatGrid() {
  const q = norm(Mat.q), list = Store.db.catalog.filter(c => (!Mat.cat || c.category === Mat.cat) && (!q || norm(`${c.brand} ${c.model} ${c.ref} ${CATEGORIES[c.category].label}`).includes(q)));
  $('#mat-count').textContent = plural(list.length, 'modèle');
  $('#mat-grid').innerHTML = list.map(c => { const cc = CATEGORIES[c.category], inst = installedCount(c.id);
    return `<div class="mcard ${Mat.sel === c.id ? 'on' : ''}" data-act="mat-sel" data-id="${c.id}">
      <div class="row"><div class="dico" style="color:${cc.color}">${ico(cc.icon)}</div><div style="min-width:0"><div class="muted" style="font-size:11.5px">${esc(c.brand)} · ${cc.one}</div><b>${esc(c.model)}</b></div></div>
      <div class="muted" style="font-size:12px;min-height:34px">${esc(c.description)}</div>
      <div class="row wrap" style="gap:5px">${stockChip(c)}${c.mount !== 'none' ? `<span class="chip">${inst} installé${inst > 1 ? 's' : ''}</span>` : ''}${c.heightU && c.mount === 'rack' ? `<span class="chip">${c.heightU} U</span>` : ''}</div></div>`; }).join('') || '<div class="empty">Aucun modèle</div>';
}
const portSummary = c => (c.ports || []).map(g => `${g.names ? g.names.length : g.count} × ${PORT_KIND[g.kind]} ${fmtSpeed(g.speed)}${g.poe ? ' PoE' : ''}`).join(', ');
function renderMatInfo() {
  const c = Store.idx.cat.get(Mat.sel), host = $('#mat-info');
  if (!c) { host.innerHTML = '<div class="empty">Sélectionnez un modèle.</div>'; return; }
  const key = JSON.stringify([c.id, c.template, c.heightU, c.ports, c.visual]);
  if (Mat.shown !== key) { Mat.shown = key; Views3D.preview.showObject(c); }
  const s = stockOf(c.id), cc = CATEGORIES[c.category], inst = Store.idx.devByCat.get(c.id) || [], consumable = c.mount === 'none';
  host.innerHTML = dHead(cc.icon, c.model, `${esc(c.brand)} · ${cc.one} · réf. ${esc(c.ref)}`) +
    sec('', `<div class="btns">${consumable ? `<button class="btn sm pri" data-act="stock-out" data-id="${c.id}" ${s.available ? '' : 'disabled'}>${ico('out')}Sortie de stock</button>` : `<button class="btn sm pri" data-act="install" data-cat="${c.id}" ${s.available ? '' : 'disabled'} data-tip="Installer|${s.available ? 'Choisir l\'emplacement dans la Cartographie' : 'Stock épuisé'}">${ico('plus')}Installer</button>`}
      <button class="btn sm" data-act="model-edit" data-id="${c.id}">${ico('edit')}Modifier</button><button class="btn sm danger" data-act="model-del" data-id="${c.id}">${ico('trash')}Supprimer</button></div>`) +
    sec('Stock', `<div class="fld"><label>Disponible</label><div class="row"><button class="btn sm icon" data-act="stock-adj" data-id="${c.id}" data-d="-1" ${s.available ? '' : 'disabled'}>${ico('minus')}</button><b style="min-width:34px;text-align:center;font-size:15px">${s.available}</b><button class="btn sm icon" data-act="stock-adj" data-id="${c.id}" data-d="1">${ico('plus')}</button>${s.threshold > 0 && s.available <= s.threshold ? `<span class="st" style="color:${COL.warn}">${ico('alert')}Stock bas</span>` : ''}</div>
      <label>Installé</label><div class="ro"><b>${installedCount(c.id)}</b></div>
      <label>Seuil d'alerte</label><input type="number" min="0" data-chg="stock-f" data-id="${c.id}" data-f="threshold" value="${s.threshold}">
      <label>Lieu de stockage</label><input type="text" data-chg="stock-f" data-id="${c.id}" data-f="location" value="${esc(s.location)}"></div>`) +
    sec('Fiche technique', kv([c.ports?.length ? ['Ports', esc(portSummary(c))] : null, c.poeBudgetW ? ['Budget PoE', `${c.poeBudgetW} W`] : null, c.poeDrawW ? ['Consommation PoE', `${c.poeDrawW} W`] : null,
      c.heightU ? ['Hauteur', `${c.heightU} U`] : null, c.powerW ? ['Puissance', `${c.powerW} W`] : null, c.firmware ? ['Firmware', esc(c.firmware)] : null, ['Montage', { rack: 'Baie 19"', ceiling: 'Plafond', desk: 'Bureau', wall: 'Mural', floor: 'Au sol', none: 'Consommable' }[c.mount]],
      ...Object.entries(c.specs || {}).map(([k, v]) => [esc(k), esc(v)])]) + (c.description ? `<p class="muted" style="margin:10px 0 0">${esc(c.description)}</p>` : '')) +
    (inst.length ? sec(`Installés (${inst.length})`, inst.slice(0, 12).map(x => li(x.id, x.hostname || x.name, esc(locLabel(x.id, { short: true })))).join('') + (inst.length > 12 ? `<div class="dim" style="padding:4px 7px">… et ${inst.length - 12} autres (voir l'Inventaire)</div>` : '')) : '');
}
Inputs['mat-q'] = el => { Mat.q = el.value; renderMatGrid(); };
Actions['mat-cat'] = el => { Mat.cat = el.dataset.c; Views.mat.render(); };
Actions['mat-sel'] = el => { Mat.sel = el.dataset.id; renderMatGrid(); renderMatInfo(); };
Actions['stock-adj'] = el => stockMove(el.dataset.id, +el.dataset.d, 'ajustement manuel');
Changes['stock-f'] = el => {
  const c = Store.idx.cat.get(el.dataset.id), f = el.dataset.f, v = f === 'threshold' ? Math.max(0, +el.value || 0) : el.value.trim();
  Store.commit('stock', `Stock de ${c.model} : ${f === 'threshold' ? 'seuil d\'alerte' : 'lieu'} → ${v}`, db => { let s = db.stock.find(x => x.catalogId === c.id); if (!s) { s = { catalogId: c.id, available: 0, threshold: 0, location: '' }; db.stock.push(s); } s[f] = v; }, c.id);
};
Actions['stock-out'] = el => {
  const c = Store.idx.cat.get(el.dataset.id), s = stockOf(c.id);
  Modal.open({ title: `Sortie de stock — ${esc(c.model)}`, ok: 'Sortir du stock',
    body: `<div class="form-grid"><label class="f"><span>Quantité (disponible : ${s.available})</span><input type="number" name="qty" min="1" max="${s.available}" value="1" autofocus></label><label class="f"><span>Motif</span><input type="text" name="reason" placeholder="Ex. : brassage baie A1"></label></div>`,
    onOk(v) { if (!(v.qty >= 1)) throw new Error('Quantité invalide.'); stockMove(c.id, -Math.floor(v.qty), v.reason); toast('Sortie de stock enregistrée', 'ok', undoAction); return true; } });
};

export { Mat, portSummary };
