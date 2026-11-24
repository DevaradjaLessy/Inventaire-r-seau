/* Matériel — palette « Stock » et glisser-déposer vers le plan ou la baie. */
import { CATEGORIES } from '../../config.js';
import { $, $$, esc } from '../../utils.js';
import { ico } from '../../icones.js';
import { Store } from '../../store.js';
import { byId, labelOf } from '../../services/requetes.js';
import { roomAt } from '../../services/cablage.js';
import { freeSlots, installFromStock, stockMove, stockOf } from '../../services/installation.js';
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
  if (!Carto.palette) { host.innerHTML = ''; Carto.arme = null; return; }
  const list = Store.db.catalog.filter(c => stockOf(c.id).available > 0 && (kind === 'rack' ? c.mount === 'rack' : !['rack', 'none'].includes(c.mount)));
  if (!list.some(c => c.id === Carto.arme)) Carto.arme = null;
  host.innerHTML = `<div class="palette ${Carto.arme ? 'arme-on' : ''}"><h4>${ico('box')}Stock disponible<button class="btn sm icon" style="margin-left:auto" data-act="palette">${ico('x')}</button></h4>
    <div class="muted" style="padding:7px 11px 0;font-size:11.5px">${kind === 'rack' ? 'Glissez un modèle sur une U libre de l\'élévation, ou touchez-le puis touchez la U.' : 'Glissez un modèle sur une pièce du plan, ou touchez-le puis touchez la pièce.'}</div>
    <div class="list">${list.map(c => `<div class="pal-it ${Carto.arme === c.id ? 'arme' : ''}" draggable="true" data-act="pal-arme" data-cat="${c.id}" data-tip="${esc(c.brand)} ${esc(c.model)}|${c.mount === 'rack' ? (c.heightU || 1) + ' U' : CATEGORIES[c.category].one}">${ico(CATEGORIES[c.category].icon)}<div><b>${esc(c.model)}</b><small>${esc(c.brand)}${c.mount === 'rack' ? ` · ${c.heightU || 1} U` : ''}</small></div><span class="q">${stockOf(c.id).available}</span><span class="pal-grip" aria-hidden="true">${ico('move')}</span></div>`).join('') || '<div class="empty">Rien en stock pour cette vue.<br>Enregistrez d\'abord le matériel reçu.</div>'}</div>
    <div class="pal-pied"><button class="btn sm" data-act="stock-rapide" data-kind="${kind}" data-tip="Entrée en stock|Enregistrer du matériel reçu, sans quitter cette vue">${ico('plus')}Entrée en stock</button></div></div>`;
};
/* Entrée en stock sans quitter la vue : le modèle choisi est armé, prêt à être posé.
   suite(cat) : action à enchaîner à la place (clic sur une U libre alors que rien n'est en stock). */
function entreeRapide(kind, suite = null) {
  const liste = Store.db.catalog.filter(c => (kind === 'rack' ? c.mount === 'rack' : !['rack', 'none'].includes(c.mount))).sort((a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`));
  Modal.open({ title: 'Entrée en stock', ok: 'Ajouter au stock',
    body: `<p class="muted" style="margin:0 0 12px">${suite ? 'Aucun modèle en stock ne tient à cet emplacement. ' : ''}Un équipement s'installe depuis le stock : enregistrez d'abord le matériel reçu.</p>
      <div class="form-grid"><label class="f"><span>Modèle</span><select name="cat" autofocus>${liste.map(c => `<option value="${c.id}">${esc(c.brand)} ${esc(c.model)}${c.mount === 'rack' ? ` — ${c.heightU || 1} U` : ''} — ${stockOf(c.id).available} en stock</option>`).join('')}</select></label>
      <label class="f"><span>Quantité reçue</span><input type="number" name="qty" min="1" max="999" value="1"></label></div>`,
    onOk(v) {
      const c = Store.idx.cat.get(v.cat), n = Math.floor(+v.qty);
      if (!c) throw new Error('Choisissez un modèle.');
      if (!(n >= 1 && n <= 999)) throw new Error('Quantité invalide (1 à 999).');
      stockMove(c.id, n, 'entrée rapide');
      Carto.palette = true; Carto.arme = c.id; renderCarto();
      toast(`${n} × ${c.model} en stock`, 'ok', undoAction);
      if (suite) setTimeout(() => run(() => suite(c)), 0);
      return true;
    } });
}
Actions['stock-rapide'] = el => entreeRapide(el.dataset.kind === 'rack' ? 'rack' : 'plan');
/* Pose un modèle du stock à l'endroit visé : une U libre de l'élévation, ou un point du plan.
   Renvoie false si l'endroit n'est ni l'un ni l'autre. Commun à la souris (glisser-déposer), au doigt et au « toucher puis poser ». */
function poser(cat, cible, clientX, clientY) {
  const slot = cible?.closest?.('.eu.free'), svg = cible?.closest?.('svg.plan');
  if (slot) {
    if (cat.mount !== 'rack') throw new Error('Ce modèle ne se monte pas en baie : posez-le sur une pièce du plan.');
    const hU = cat.heightU || 1, u = +slot.dataset.u - hU + 1, rackId = slot.parentElement.dataset.rack;
    if (!freeSlots(rackId, hU).includes(u)) throw new Error(`Pas assez de place à partir de U${slot.dataset.u} : ${hU} U nécessaires.`);
    const id = installFromStock(cat.id, { rackId, u });
    toast(`${byId(id).hostname} installé en U${u}`, 'ok', undoAction); select(id, { keep: true });
    return true;
  }
  if (svg) {
    if (cat.mount === 'rack') throw new Error('Ce modèle se monte en baie : déposez-le sur l\'élévation, dans la vue « Baie 3D ».');
    const p = svgPoint(svg, { clientX, clientY }), x = +(p.x / K).toFixed(2), y = +(p.y / K).toFixed(2), room = roomAt(Carto.floorId, x, y);
    if (!room) throw new Error('Déposez le modèle à l\'intérieur d\'une pièce.');
    const id = installFromStock(cat.id, { roomId: room.id, x, y });
    toast(`${labelOf(id)} installé (${room.name})`, 'ok', undoAction); select(id, { keep: true });
    return true;
  }
  return false;
}
const nettoyer = () => $$('.eu.over,.eu.bad').forEach(x => x.classList.remove('over', 'bad'));
/* Montre sur l'élévation les U que le modèle occuperait à partir de la U visée */
function survoler(cat, cible) {
  nettoyer();
  const slot = cible?.closest?.('.eu.free');
  if (!slot || !cat || cat.mount !== 'rack') return false;
  const hU = cat.heightU || 1, u = +slot.dataset.u - hU + 1, grille = slot.parentElement, ok = freeSlots(grille.dataset.rack, hU).includes(u);
  for (let k = u; k < u + hU; k++) $(`.eu.free[data-u="${k}"]`, grille)?.classList.add(ok ? 'over' : 'bad');
  if (!ok) slot.classList.add('bad');
  return true;
}

/* --- Souris : glisser-déposer du navigateur --- */
let dragCat = null;
document.addEventListener('dragstart', e => { const it = e.target.closest?.('.pal-it'); if (!it) return; dragCat = it.dataset.cat; e.dataTransfer.setData('text/plain', dragCat); e.dataTransfer.effectAllowed = 'copy'; Tip.hide(); });
document.addEventListener('dragend', () => { dragCat = null; nettoyer(); });
function initElevEvents(elev) {
  elev.addEventListener('dragover', e => { if (survoler(Store.idx.cat.get(dragCat), e.target)) e.preventDefault(); });
  elev.addEventListener('dragleave', e => { if (!elev.contains(e.relatedTarget)) nettoyer(); });
}
(() => {
  const host = $('#tab-carto');
  host.addEventListener('dragover', e => { if (dragCat && e.target.closest('svg.plan')) e.preventDefault(); });
  host.addEventListener('drop', e => {
    const cat = Store.idx.cat.get(dragCat);
    if (!cat || !(e.target.closest('svg.plan') || e.target.closest('.eu.free'))) return;
    e.preventDefault(); nettoyer();
    run(() => poser(cat, e.target, e.clientX, e.clientY));
  });
  /* --- Toucher puis poser : un modèle touché dans la palette est posé au prochain appui sur le plan ou sur une U libre --- */
  host.addEventListener('click', e => {
    const cat = Store.idx.cat.get(Carto.arme);
    if (!cat || !(e.target.closest('svg.plan') || e.target.closest('.eu.free'))) return;
    e.stopPropagation(); e.preventDefault();
    Carto.arme = null;
    try { run(() => poser(cat, e.target, e.clientX, e.clientY)); } finally { renderCarto(); }
  }, true);
})();
Actions['pal-arme'] = el => {
  Carto.arme = Carto.arme === el.dataset.cat ? null : el.dataset.cat;
  renderCarto();
  if (Carto.arme) toast('Touchez l\'endroit où l\'installer : une pièce du plan, ou une U libre de l\'élévation.', 'ok');
};

/* --- Doigt ou stylet : la poignée d'un modèle se glisse jusqu'au plan ou à l'élévation --- */
document.addEventListener('pointerdown', e => {
  const poignee = e.target.closest?.('.pal-grip');
  if (!poignee || e.pointerType === 'mouse') return;
  const it = poignee.closest('.pal-it'), cat = Store.idx.cat.get(it.dataset.cat), palette = it.closest('.palette');
  let fantome = null;
  const sous = ev => document.elementFromPoint(ev.clientX, ev.clientY);
  const move = ev => {
    if (ev.pointerId !== e.pointerId) return;
    if (!fantome) {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) < 6) return;
      fantome = it.cloneNode(true); fantome.className = 'pal-it pal-fantome'; fantome.removeAttribute('data-act'); document.body.appendChild(fantome);
      palette.classList.add('glisse'); Tip.hide();
    }
    fantome.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY - 44}px)`;
    survoler(cat, sous(ev));
  };
  const fin = ev => {
    if (ev.pointerId !== e.pointerId) return;
    removeEventListener('pointermove', move); removeEventListener('pointerup', fin); removeEventListener('pointercancel', fin);
    nettoyer();
    if (!fantome) return;
    fantome.remove();
    const cible = ev.type === 'pointerup' ? sous(ev) : null;
    palette.classList.remove('glisse');
    if (cible) run(() => { if (!poser(cat, cible, ev.clientX, ev.clientY)) toast('Déposez le modèle sur une pièce du plan ou sur une U libre de l\'élévation.', 'warn'); });
  };
  addEventListener('pointermove', move); addEventListener('pointerup', fin); addEventListener('pointercancel', fin);
});
/* Clic sur une U libre : choisir un modèle du stock à installer ici */
Actions['elev-free'] = el => {
  const u = +el.dataset.u, rackId = el.parentElement.dataset.rack;
  const list = Store.db.catalog.filter(c => c.mount === 'rack' && stockOf(c.id).available > 0 && freeSlots(rackId, c.heightU || 1).includes(u - (c.heightU || 1) + 1));
  // Rien en stock pour cette U : proposer l'entrée en stock, puis reprendre l'installation au même endroit si le modèle y tient
  if (!list.length) return entreeRapide('rack', c => { if (freeSlots(rackId, c.heightU || 1).includes(u - (c.heightU || 1) + 1)) openInstall({ catId: c.id, rackId, u: u - (c.heightU || 1) + 1 }); else toast(`${c.model} (${c.heightU || 1} U) ne tient pas en U${u} : choisissez une autre U.`, 'warn'); });
  Modal.open({ title: `Installer en U${u} — ${esc(byId(rackId).name)}`, ok: 'Continuer',
    body: `<label class="f"><span>Modèle du stock (la U${u} sera la plus haute occupée)</span><select name="cat" autofocus>${list.map(c => opt(c.id, `${c.brand} ${c.model} — ${c.heightU || 1} U — ${stockOf(c.id).available} en stock`, '')).join('')}</select></label>`,
    onOk(v) { const c = Store.idx.cat.get(v.cat); setTimeout(() => run(() => openInstall({ catId: c.id, rackId, u: u - (c.heightU || 1) + 1 })), 0); return true; } });
};

export { initElevEvents, renderPalette };
