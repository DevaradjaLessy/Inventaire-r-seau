/* Matériel — installation, déplacement et retrait (fenêtre en cascade). */
import { OUTLET_USAGE } from '../../config.js';
import { $, esc, plural } from '../../utils.js';
import { Store } from '../../store.js';
import { byId, cablesOf, catOf, locOf, portsOf, rackUsage } from '../../services/requetes.js';
import { isPassiveNode, otherEnd, outletInfo, STATE_LABEL } from '../../services/cablage.js';
import { freeSlots, installFromStock, moveDevice, removeDevice, removeRack, stockOf, suggestName } from '../../services/installation.js';
import { Actions, Changes, Inputs, Modal, toast, UI, undoAction } from '../socle.js';
import { Carto, select } from '../carto/carto.js';
import { opt } from '../carto/fiches.js';

/* ---------- Installation et déplacement (fenêtre en cascade) ---------- */
let Inst = null;
/* Ouvre la fenêtre. o : { catId } pour installer, { moveId } pour déplacer ; préréglages possibles : rackId, u, roomId, x, y */
function openInstall(o) {
  const dev = o.moveId ? byId(o.moveId) : null, cat = dev ? catOf(dev) : Store.idx.cat.get(o.catId);
  if (!cat) return;
  if (!dev && stockOf(cat.id).available < 1) throw new Error(`Stock épuisé pour ${cat.brand} ${cat.model}.`);
  const start = o.rackId ? locOf(o.rackId) : o.roomId ? locOf(o.roomId) : dev ? locOf(dev.id) : locOf(Carto.rackId && cat.mount === 'rack' ? Carto.rackId : Carto.floorId || Store.db.floors[0].id);
  Inst = { cat, dev, bld: start.building?.id || Store.db.buildings[0].id, floor: start.floor?.id || '', room: (cat.mount === 'rack' ? start.rack && start.room?.id : start.room?.id) || '', rack: start.rack?.id || '', u: o.u || '', x: o.x ?? '', y: o.y ?? '', outlet: '', name: dev ? dev.hostname : '', ip: dev ? dev.ip : '', usage: 'data', auto: !dev };
  Modal.open({
    title: dev ? `Déplacer ${esc(dev.hostname)}` : `Installer — ${esc(cat.brand)} ${esc(cat.model)}`, ok: dev ? 'Déplacer' : 'Installer', body: `<div id="inst-body">${instBody()}</div>`,
    onOk() {
      const I = Inst, place = cat.mount === 'rack' ? { rackId: I.rack, u: +I.u } : { roomId: I.room, x: +I.x, y: +I.y };
      if (dev) { moveDevice(dev.id, place); toast('Équipement déplacé', 'ok', undoAction); select(dev.id); return true; }
      const id = installFromStock(cat.id, { ...place, name: I.name, ip: I.ip, outletId: I.outlet || null, usage: I.usage });
      toast('Équipement installé : le stock a été décrémenté', 'ok', undoAction);
      select(id);
      return true;
    },
  });
}
function instBody() {
  const I = Inst, X = Store.idx, rackMount = I.cat.mount === 'rack', isRack = I.cat.category === 'rack', isOutlet = I.cat.template === 'outlet';
  const floors = X.floorsByBld.get(I.bld) || [];
  if (!floors.some(f => f.id === I.floor)) I.floor = floors[0]?.id || '';
  let rooms = X.roomsByFloor.get(I.floor) || [];
  if (rackMount) rooms = rooms.filter(r => (X.racksByRoom.get(r.id) || []).length);
  if (!rooms.some(r => r.id === I.room)) { I.room = rooms[0]?.id || ''; I.x = I.y = ''; }
  const room = byId(I.room), racks = rackMount && room ? X.racksByRoom.get(room.id) || [] : [];
  if (rackMount && !racks.some(r => r.id === I.rack)) I.rack = racks[0]?.id || '';
  const slots = rackMount && I.rack ? freeSlots(I.rack, I.cat.heightU || 1, I.dev?.id) : [];
  if (rackMount && !slots.includes(+I.u)) I.u = slots[0] || '';
  if (!rackMount && room && (I.x === '' || I.y === '')) { I.x = +(room.x + room.w / 2).toFixed(2); I.y = +(room.y + room.h / 2).toFixed(2); }
  if (I.auto && room) I.name = suggestName(I.cat, room.id);
  const outs = !rackMount && !isRack && !isOutlet && room ? (X.outByRoom.get(room.id) || []).filter(o => !cablesOf(o.id).some(c => !isPassiveNode(otherEnd(c, o.id)))) : [];
  const s = (name, label, options, full) => `<label class="f ${full ? 'full' : ''}"><span>${label}</span><select data-chg="inst" name="${name}">${options}</select></label>`;
  const hU = I.cat.heightU || 1;
  return `<div class="form-grid">
    ${s('bld', 'Bâtiment', Store.db.buildings.map(b => opt(b.id, b.name, I.bld)).join(''))}
    ${s('floor', 'Étage', floors.map(f => opt(f.id, f.name, I.floor)).join(''))}
    ${s('room', rackMount ? 'Pièce (avec baie)' : 'Pièce', rooms.map(r => opt(r.id, r.name, I.room)).join('') || '<option value="">Aucune pièce avec baie à cet étage</option>', !rackMount)}
    ${rackMount ? s('rack', 'Baie', racks.map(r => opt(r.id, `${r.name} (${rackUsage(r.id).used}/${r.heightU} U)`, I.rack)).join('')) +
      s('u', `Emplacement (${hU} U nécessaire${hU > 1 ? 's' : ''})`, slots.map(u => opt(u, hU > 1 ? `U${u} à U${u + hU - 1}` : `U${u}`, I.u)).join('') || '<option value="">Aucun emplacement libre</option>', true)
      : `<label class="f"><span>Position X (m)${room ? ` — de ${room.x} à ${room.x + room.w}` : ''}</span><input type="number" step="0.1" data-inp="inst" name="x" value="${I.x}"></label>
         <label class="f"><span>Position Y (m)${room ? ` — de ${room.y} à ${room.y + room.h}` : ''}</span><input type="number" step="0.1" data-inp="inst" name="y" value="${I.y}"></label>`}
    ${I.dev ? '' : `<label class="f"><span>${isOutlet ? 'Repère de la prise' : isRack ? 'Nom de la baie' : 'Nom d\'hôte'}</span><input type="text" data-inp="inst" name="name" value="${esc(I.name)}"></label>
      ${isOutlet ? s('usage', 'Usage', Object.entries(OUTLET_USAGE).map(([k, v]) => opt(k, v, I.usage)).join('')) : isRack ? '<span></span>' : `<label class="f"><span>Adresse IP (facultatif)</span><input type="text" class="mono" data-inp="inst" name="ip" value="${esc(I.ip)}" placeholder="10.10.x.x"></label>`}
      ${outs.length ? s('outlet', 'Brancher sur la prise', `<option value="">Ne pas brancher</option>` + outs.map(o => opt(o.id, `Prise ${o.label} — ${STATE_LABEL[outletInfo(o.id).status]}`, I.outlet)).join(''), true) : ''}`}
    </div><p class="muted" style="margin:12px 0 0">${I.dev ? 'Les câbles restent branchés : pensez à vérifier le brassage après le déplacement.' : `Stock disponible : ${stockOf(I.cat.id).available}. L'installation décrémente le stock et ajoute l'équipement à l'Inventaire.`}</p>`;
}
Changes.inst = el => { Inst[el.name] = el.value; if (el.name === 'room' || el.name === 'floor' || el.name === 'bld') { Inst.x = Inst.y = ''; Inst.outlet = ''; } $('#inst-body').innerHTML = instBody(); };
Inputs.inst = el => { Inst[el.name] = el.value; if (el.name === 'name') Inst.auto = false; };
Actions.install = el => openInstall({ catId: el.dataset.cat });
Actions['dev-move'] = el => openInstall({ moveId: el.dataset.id });
Actions['dev-remove'] = el => {
  const d = byId(el.dataset.id), n = portsOf(d.id).filter(p => cablesOf(p.id).length).length;
  Modal.open({ title: `Retirer ${esc(d.hostname)}`, ok: 'Retirer', okClass: 'danger',
    body: `<p style="margin:0 0 12px">${n ? `${plural(n, 'câble')} branché${n > 1 ? 's' : ''} sur cet équipement ${n > 1 ? 'seront débranchés' : 'sera débranché'}.` : 'Aucun câble n\'est branché sur cet équipement.'}</p>
      <label class="row" style="margin-bottom:8px"><input type="radio" name="mode" value="stock" checked> <span><b>Retour en stock</b> — l'équipement quitte l'inventaire, le stock augmente de 1</span></label>
      <label class="row"><input type="radio" name="mode" value="retire"> <span><b>Hors service</b> — l'équipement reste à l'inventaire avec le statut « Hors service »</span></label>`,
    onOk() { const mode = $('#modal-root input[name=mode]:checked').value, l = locOf(d.id), back = l.rack?.id || l.room?.id; removeDevice(d.id, mode); toast('Équipement retiré', 'ok', undoAction); if (UI.tab === 'carto' && back) select(back, { keep: true }); return true; } });
};
Actions['dev-restock'] = el => {
  const d = byId(el.dataset.id);
  Modal.confirm(`Remettre ${esc(d.hostname)} en stock`, 'L\'équipement hors service quitte l\'inventaire et le stock du modèle augmente de 1.', () => { removeDevice(d.id, 'stock'); toast('Équipement remis en stock', 'ok', undoAction); return true; }, 'Remettre en stock');
};
Actions['rack-del'] = el => { const r = byId(el.dataset.id); Modal.confirm(`Retirer ${esc(r.name)}`, 'La baie doit être vide. Elle retourne en stock.', () => { const room = r.roomId; removeRack(r.id); toast('Baie retirée', 'ok', undoAction); if (UI.tab === 'carto') select(room, { view: 'plan' }); return true; }, 'Retirer', 'danger'); };

export { openInstall };
