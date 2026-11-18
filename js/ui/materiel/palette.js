/* Matériel — palette « Stock » et glisser-déposer vers le plan ou la baie. */
import { CATEGORIES } from '../../config.js';
import { $, $$, esc } from '../../utils.js';
import { ico } from '../../icones.js';
import { Store } from '../../store.js';
import { byId, labelOf } from '../../services/requetes.js';
import { roomAt } from '../../services/cablage.js';
import { freeSlots, installFromStock, stockOf } from '../../services/installation.js';
import { Actions, Modal, run, Tip, toast, undoAction } from '../socle.js';
import { Carto, K, renderCarto, select } from '../carto/carto.js';
import { svgPoint } from '../carto/plan.js';
import { opt } from '../carto/fiches.js';
import { openInstall } from './installation.js';

/* ---------- Palette « Stock » et glisser-déposer ---------- */
Actions.palette = () => { Carto.palette = !Carto.palette; renderCarto(); };
function renderPalette(kind) {
  const host = $(kind === 'plan' ? '#palette-host' : '#palette-host-r');
  if (!host) return;
  if (!Carto.palette) { host.innerHTML = ''; return; }
  const list = Store.db.catalog.filter(c => stockOf(c.id).available > 0 && (kind === 'rack' ? c.mount === 'rack' : !['rack', 'none'].includes(c.mount)));
  host.innerHTML = `<div class="palette"><h4>${ico('box')}Stock disponible<button class="btn sm icon" style="margin-left:auto" data-act="palette">${ico('x')}</button></h4>
    <div class="muted" style="padding:7px 11px 0;font-size:11.5px">${kind === 'rack' ? 'Glissez un modèle sur une U libre de l\'élévation.' : 'Glissez un modèle sur une pièce du plan.'}</div>
    <div class="list">${list.map(c => `<div class="pal-it" draggable="true" data-cat="${c.id}" data-tip="${esc(c.brand)} ${esc(c.model)}|${c.mount === 'rack' ? (c.heightU || 1) + ' U' : CATEGORIES[c.category].one}">${ico(CATEGORIES[c.category].icon)}<div><b>${esc(c.model)}</b><small>${esc(c.brand)}${c.mount === 'rack' ? ` · ${c.heightU || 1} U` : ''}</small></div><span class="q">${stockOf(c.id).available}</span></div>`).join('') || '<div class="empty">Rien en stock pour cette vue</div>'}</div></div>`;
};
let dragCat = null;
document.addEventListener('dragstart', e => { const it = e.target.closest?.('.pal-it'); if (!it) return; dragCat = it.dataset.cat; e.dataTransfer.setData('text/plain', dragCat); e.dataTransfer.effectAllowed = 'copy'; Tip.hide(); });
document.addEventListener('dragend', () => { dragCat = null; $$('.eu.over,.eu.bad').forEach(x => x.classList.remove('over', 'bad')); });
/* Dépôt sur l'élévation : la U visée devient la U la plus haute de l'équipement */
function initElevEvents(elev) {
  const target = e => { const slot = e.target.closest('.eu.free'), cat = Store.idx.cat.get(dragCat); if (!slot || !cat || cat.mount !== 'rack') return null; const hU = cat.heightU || 1, u = +slot.dataset.u - hU + 1, rackId = slot.parentElement.dataset.rack; return { slot, cat, u, rackId, ok: freeSlots(rackId, hU).includes(u) }; };
  elev.addEventListener('dragover', e => { const t = target(e); if (!t) return; e.preventDefault(); $$('.eu.over,.eu.bad', elev).forEach(x => x.classList.remove('over', 'bad')); for (let k = t.u; k < t.u + (t.cat.heightU || 1); k++) $(`.eu.free[data-u="${k}"]`, elev)?.classList.add(t.ok ? 'over' : 'bad'); if (!t.ok) t.slot.classList.add('bad'); });
  elev.addEventListener('dragleave', e => { if (!elev.contains(e.relatedTarget)) $$('.eu.over,.eu.bad', elev).forEach(x => x.classList.remove('over', 'bad')); });
  elev.addEventListener('drop', e => { const t = target(e); if (!t) return; e.preventDefault(); run(() => { const id = installFromStock(t.cat.id, { rackId: t.rackId, u: t.u }); toast(`${byId(id).hostname} installé en U${t.u}`, 'ok', undoAction); select(id, { keep: true }); }); });
};
/* Dépôt sur le plan : l'équipement est posé à l'endroit visé */
(() => {
  const host = $('#tab-carto');
  host.addEventListener('dragover', e => { if (dragCat && e.target.closest('svg.plan')) e.preventDefault(); });
  host.addEventListener('drop', e => {
    const svg = e.target.closest('svg.plan'), cat = Store.idx.cat.get(dragCat);
    if (!svg || !cat) return;
    e.preventDefault();
    run(() => {
      if (cat.mount === 'rack') throw new Error('Ce modèle se monte en baie : déposez-le sur l\'élévation, dans la vue « Baie 3D ».');
      const p = svgPoint(svg, e), x = +(p.x / K).toFixed(2), y = +(p.y / K).toFixed(2), room = roomAt(Carto.floorId, x, y);
      if (!room) throw new Error('Déposez le modèle à l\'intérieur d\'une pièce.');
      const id = installFromStock(cat.id, { roomId: room.id, x, y });
      toast(`${labelOf(id)} installé (${room.name})`, 'ok', undoAction); select(id, { keep: true });
    });
  });
})();
/* Clic sur une U libre : choisir un modèle du stock à installer ici */
Actions['elev-free'] = el => {
  const u = +el.dataset.u, rackId = el.parentElement.dataset.rack;
  const list = Store.db.catalog.filter(c => c.mount === 'rack' && stockOf(c.id).available > 0 && freeSlots(rackId, c.heightU || 1).includes(u - (c.heightU || 1) + 1));
  if (!list.length) throw new Error('Aucun modèle en stock ne tient à cet emplacement.');
  Modal.open({ title: `Installer en U${u} — ${esc(byId(rackId).name)}`, ok: 'Continuer',
    body: `<label class="f"><span>Modèle du stock (la U${u} sera la plus haute occupée)</span><select name="cat" autofocus>${list.map(c => opt(c.id, `${c.brand} ${c.model} — ${c.heightU || 1} U — ${stockOf(c.id).available} en stock`, '')).join('')}</select></label>`,
    onOk(v) { const c = Store.idx.cat.get(v.cat); setTimeout(() => run(() => openInstall({ catId: c.id, rackId, u: u - (c.heightU || 1) + 1 })), 0); return true; } });
};

export { initElevEvents, renderPalette };
