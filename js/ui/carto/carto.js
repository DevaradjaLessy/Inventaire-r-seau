/* Cartographie — état, sélection, arbre hiérarchique et fil d'Ariane. */
import { DEVICE_STATUS } from '../../config.js';
import { $, esc, norm, typeOf } from '../../utils.js';
import { ico } from '../../icones.js';
import { Store } from '../../store.js';
import { byId, catOf, deviceIcon, labelOf, locOf, rackUsage } from '../../services/requetes.js';
import { trace } from '../../services/tracage.js';
import { Actions, Inputs, showTab, UI, Views } from '../socle.js';
import { initPlanEvents, renderPlan } from './plan.js';
import { renderDetail } from './fiches.js';
import { renderRackView, View3D } from './baie.js';
import { renderTopo } from './topologie.js';

const Carto = {
  sel: null,            // identifiant de l'objet sélectionné
  view: 'plan',         // plan | rack | topo
  floorId: null, rackId: null,
  open: new Set(),      // nœuds ouverts de l'arbre
  filter: '',
  vbs: {},              // cadrage du plan, par étage
  edit: false, wifi: false, palette: false,
  outils: false,        // téléphone : barre d'outils du plan et de la vue 3D dépliée
  draw: false,          // tracé d'une nouvelle pièce à la souris
  arme: null,           // modèle du stock choisi dans la palette, à poser au prochain appui
  trace: null,          // chemin de câblage affiché
  built: false,
};
const K = 20;           // unités SVG par mètre sur le plan
const TYPE_ICON = { site: 'site', building: 'building', floor: 'floor', room: 'room', rack: 'rack', outlet: 'outlet', port: 'switch' };
const iconOf = id => { const t = typeOf(id); return t === 'device' ? deviceIcon(byId(id)) : t === 'port' ? 'passive' : TYPE_ICON[t] || 'box'; };

/* Sélectionne un objet et met à jour l'arbre, la vue centrale et la fiche.
   o.view force une sous-vue ; o.keep garde la sous-vue actuelle. */
function select(id, o = {}) {
  if (!byId(id)) return;
  const l = locOf(id);
  Carto.sel = id;
  if (l.floor) Carto.floorId = l.floor.id;
  if (l.rack) Carto.rackId = l.rack.id;
  for (const k of ['site', 'building', 'floor', 'room', 'rack']) if (l[k] && l[k].id !== id) Carto.open.add(l[k].id);
  if (o.view) Carto.view = o.view;
  else if (!o.keep) Carto.view = l.rack ? 'rack' : 'plan';
  if (!o.keep) View3D.focusReq = true;
  $('.carto')?.classList.remove('m-tree');   // sur téléphone, l'arbre se referme après un choix
  if (UI.tab !== 'carto') { UI.dirty.add('carto'); showTab('carto'); } else renderCarto();
  if (o.reveal !== false) revealInTree();
}
/* Ouvre la Cartographie sur un objet (utilisé par les autres onglets) */
const goto = (id, o) => select(id, o);

Actions.sel = el => select(el.dataset.id);
/* Téléphone : ouvre ou ferme le panneau de l'arbre ou de la fiche */
Actions['m-panel'] = el => { const c = $('.carto'), p = el.dataset.p; c.classList.toggle('m-tree', p === 'tree' && !c.classList.contains('m-tree')); c.classList.toggle('m-detail', p === 'detail' && !c.classList.contains('m-detail')); };
Actions.psel = el => select(el.dataset.id, { keep: true });
Actions['tree-toggle'] = (el, e) => { e.stopPropagation(); const id = el.dataset.id; Carto.open.has(id) ? Carto.open.delete(id) : Carto.open.add(id); renderTree(); };
Actions['c-view'] = el => { Carto.view = el.dataset.v; renderCarto(); };
Actions['tl-plus'] = () => { Carto.outils = !Carto.outils; renderCarto(); };
Inputs['tree-filter'] = el => { Carto.filter = norm(el.value.trim()); renderTree(); };

Views.carto = {
  render() {
    const host = $('#tab-carto');
    if (!Carto.built) {
      host.innerHTML = `<div class="carto">
        <aside class="c-tree"><div class="c-tree-h"><input type="search" data-inp="tree-filter" placeholder="Filtrer l'arborescence…"><button class="btn icon" data-act="st-add" data-kind="site" data-tip="Nouveau site">${ico('plus')}</button><button class="btn icon m-only" data-act="m-panel" data-p="" aria-label="Fermer">${ico('x')}</button></div><div id="tree"></div></aside>
        <div class="c-main">
          <div class="c-bar"><button class="btn m-only" data-act="m-panel" data-p="tree">${ico('list')}Arbre</button><div id="crumb"></div><div class="seg" id="c-views"></div><button class="btn m-only" data-act="m-panel" data-p="detail">${ico('info')}Fiche</button></div>
          <div id="c-view"><div class="cv" id="v-plan"></div><div class="cv" id="v-rack"></div><div class="cv" id="v-topo"></div></div>
        </div>
        <aside class="c-detail" id="detail"></aside></div>`;
      Carto.built = true;
      initPlanEvents($('#v-plan'));
      const d = Store.db;
      if (!Carto.sel || !byId(Carto.sel)) { Carto.sel = d.sites[0]?.id || null; }
      for (const s of d.sites) Carto.open.add(s.id);
      for (const b of d.buildings) Carto.open.add(b.id);
    }
    if (Carto.sel && !byId(Carto.sel)) { Carto.sel = Store.db.sites[0]?.id || null; Carto.view = 'plan'; }
    if (Carto.floorId && !byId(Carto.floorId)) Carto.floorId = null;
    if (Carto.rackId && !byId(Carto.rackId)) Carto.rackId = null;
    renderCarto();
  },
  show() { Views3D.resume?.(); },
};
const Views3D = {};   // complété par la vue 3D

function renderCarto() {
  if (!Carto.built) return;
  // Le chemin tracé est recalculé si la base a changé
  if (Carto.trace && Carto.trace.rev !== Store.rev) { const tr = byId(Carto.trace.start) ? trace(Carto.trace.start) : null; Carto.trace = tr && tr.nodes.length > 1 ? tr : null; }
  renderTree(); renderCrumb();
  $('#c-views').innerHTML = [['plan', 'plan', 'Plan 2D'], ['rack', 'cube', 'Baie 3D'], ['topo', 'topo', 'Topologie']].map(([v, i, l]) => `<button data-act="c-view" data-v="${v}" class="${Carto.view === v ? 'on' : ''}">${ico(i)}${l}</button>`).join('');
  for (const v of ['plan', 'rack', 'topo']) $('#v-' + v).classList.toggle('on', Carto.view === v);
  if (Carto.view === 'plan') renderPlan();
  else if (Carto.view === 'rack') renderRackView();
  else renderTopo();
  renderDetail();
}

/* ---------- Arbre hiérarchique ---------- */
function treeChildren(id) {
  const I = Store.idx, t = typeOf(id), ids = a => (a || []).map(x => x.id);
  if (t === 'site') return ids(I.bldBySite.get(id));
  if (t === 'building') return ids(I.floorsByBld.get(id));
  if (t === 'floor') return ids(I.roomsByFloor.get(id));
  if (t === 'room') return [...ids(I.racksByRoom.get(id)), ...ids([...(I.devByRoom.get(id) || [])].sort((a, b) => a.hostname.localeCompare(b.hostname))), ...ids([...(I.outByRoom.get(id) || [])].sort((a, b) => a.label.localeCompare(b.label)))];
  if (t === 'rack') return ids(I.devByRack.get(id));
  return [];
}
function treeText(id) {
  const e = byId(id), t = typeOf(id);
  if (t === 'device') return `${e.hostname} ${e.ip} ${catOf(e)?.model || ''}`;
  if (t === 'outlet') return `prise ${e.label}`;
  return labelOf(id);
}
function renderTree() {
  const host = $('#tree');
  if (!host) return;
  const f = Carto.filter, memo = new Map();
  const match = id => { if (memo.has(id)) return memo.get(id); const m = norm(treeText(id)).includes(f) || treeChildren(id).some(match); memo.set(id, m); return m; };
  const html = [];
  const node = (id, depth) => {
    if (f && !match(id)) return;
    const e = byId(id), t = typeOf(id), kids = treeChildren(id), open = f ? true : Carto.open.has(id);
    let label = labelOf(id), meta = '', dot = '';
    if (t === 'floor') label = e.name;
    if (t === 'rack') meta = `${rackUsage(id).pct} %`;
    if (t === 'device') { meta = e.rackId ? `U${e.u}` : ''; if (e.status !== 'active') dot = `<i class="dotst" style="background:${DEVICE_STATUS[e.status].color}"></i>`; }
    if (t === 'room' && kids.length) meta = kids.length;
    html.push(`<div class="tn ${Carto.sel === id ? 'sel' : ''}" role="treeitem" tabindex="${Carto.sel === id ? 0 : -1}" style="padding-left:${4 + depth * 14}px" data-act="sel" data-id="${id}">
      <span class="car" ${kids.length ? `data-act="tree-toggle" data-id="${id}"` : ''}>${kids.length ? ico(open ? 'chevd' : 'chevr') : ''}</span>
      <span class="lb">${ico(iconOf(id))}<span>${esc(label)}</span>${dot}</span>${meta !== '' ? `<small>${meta}</small>` : ''}</div>`);
    if (open) for (const k of kids) node(k, depth + 1);
  };
  for (const s of Store.db.sites) node(s.id, 0);
  // Curseur du clavier : il reste sur le même élément quand l'arbre est redessiné
  const curseur = document.activeElement?.closest?.('#tree .tn')?.dataset.id;
  const top = host.scrollTop;
  host.innerHTML = html.join('') || `<div class="empty">${Store.db.sites.length ? 'Aucun résultat' : 'Aucun site pour l\'instant'}</div>`;
  host.scrollTop = top;
  if (curseur) { const n = host.querySelector(`.tn[data-id="${curseur}"]`); if (n) { for (const x of host.querySelectorAll('.tn[tabindex="0"]')) x.tabIndex = -1; n.tabIndex = 0; n.focus({ preventScroll: true }); } }
  if (!host.querySelector('.tn[tabindex="0"]')) host.querySelector('.tn')?.setAttribute('tabindex', '0');
}
function revealInTree() { $('#tree .tn.sel')?.scrollIntoView({ block: 'nearest' }); }

/* ---------- Fil d'Ariane ---------- */
function renderCrumb() {
  const l = locOf(Carto.sel || ''), parts = [];
  for (const k of ['site', 'building', 'floor', 'room', 'rack', 'device', 'outlet', 'port']) if (l[k]) parts.push(l[k].id);
  $('#crumb').innerHTML = parts.map(id => { const t = typeOf(id), e = byId(id); return `<a data-act="sel" data-id="${id}">${ico(iconOf(id))}${esc(t === 'port' ? e.name : t === 'floor' ? e.name : t === 'building' ? `Bât. ${e.code}` : labelOf(id))}</a>`; }).join('<span class="sep">›</span>');
}

export { Carto, goto, iconOf, K, renderCarto, select, Views3D };
