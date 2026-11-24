/* Cartographie — fenêtres de connexion et de débranchement. */
import { CABLE_TYPES, PORT_KIND } from '../../config.js';
import { $, esc, typeOf } from '../../utils.js';
import { Store } from '../../store.js';
import { byId, cablesOf, labelOf, locLabel, locOf, portsOf } from '../../services/requetes.js';
import { isPassiveNode, otherEnd } from '../../services/cablage.js';
import { connect, connectCheck, disconnect, mediaOf } from '../../services/connexion.js';
import { Actions, Changes, Modal, toast, undoAction } from '../socle.js';
import { select } from './carto.js';
import { opt } from './fiches.js';

/* ---------- Connexion et débranchement ---------- */
/* Cibles possibles pour relier l'élément a : prises et ports compatibles et libres */
function connectTargets(a) {
  const d = Store.db, here = locOf(a), ok = id => !connectCheck(a, id);
  const outlets = typeOf(a) === 'outlet' ? [] : d.outlets.filter(o => ok(o.id));
  const devs = d.devices.filter(x => x.status !== 'retired' && portsOf(x.id).some(p => ok(p.id)));
  // Les équipements de la même baie, puis de la même pièce, passent en premier
  const score = x => { const l = locOf(x.id); return (here.rack && l.rack?.id === here.rack.id ? 0 : here.room && l.room?.id === here.room.id ? 1 : here.floor && l.floor?.id === here.floor.id ? 2 : 3); };
  devs.sort((x, y) => score(x) - score(y) || x.hostname.localeCompare(y.hostname));
  outlets.sort((x, y) => (locOf(x.id).floor?.id === here.floor?.id ? 0 : 1) - (locOf(y.id).floor?.id === here.floor?.id ? 0 : 1) || x.label.localeCompare(y.label));
  return { outlets, devs };
}
Actions.connect = el => {
  const a = el.dataset.id, { outlets, devs } = connectTargets(a), fiber = mediaOf(a) === 'fibre';
  if (!outlets.length && !devs.length) throw new Error('Aucune cible libre et compatible.');
  const types = Object.entries(CABLE_TYPES).filter(([k, v]) => v.fiber === fiber);
  Modal.open({
    title: `Connecter ${esc(labelOf(a))}`,
    body: `<div class="form-grid">
      <label class="f full"><span>Équipement ou prise de destination (${fiber ? 'fibre' : 'cuivre'})</span><select name="target" data-chg="conn-target" data-a="${a}" autofocus>
        ${devs.length ? `<optgroup label="Équipements">${devs.map(x => opt(x.id, `${x.hostname} — ${locLabel(x.id, { short: true })}`, '')).join('')}</optgroup>` : ''}
        ${outlets.length ? `<optgroup label="Prises murales">${outlets.map(o => opt(o.id, `Prise ${o.label} — ${locLabel(o.roomId)}`, '')).join('')}</optgroup>` : ''}</select></label>
      <label class="f full"><span>Port</span><select name="port" id="conn-port"></select></label>
      <label class="f"><span>Type de câble</span><select name="type" id="conn-type">${types.map(([k, v]) => opt(k, v.label, '')).join('')}</select></label>
      <label class="f"><span>Longueur (m)</span><input type="number" name="length" min="0.5" step="0.5" value="2"></label></div>`,
    ok: 'Connecter',
    onOpen: root => Changes['conn-target'](root.querySelector('[name=target]')),
    onOk(v) {
      const b = typeOf(v.target) === 'outlet' ? v.target : v.port;
      if (!b) throw new Error('Choisissez un port.');
      connect(a, b, v.type, v.length || 1);
      toast('Connexion créée', 'ok', undoAction);
      return true;
    },
  });
};
Changes['conn-target'] = el => {
  const a = el.dataset.a, t = el.value, sel = $('#conn-port'), ty = $('#conn-type');
  const ports = typeOf(t) === 'device' ? portsOf(t).filter(p => !connectCheck(a, p.id)) : [];
  sel.innerHTML = ports.map(p => opt(p.id, `${p.name} — ${PORT_KIND[p.kind]}${p.role === 'pp' ? ' (panneau)' : ''}`, '')).join('');
  sel.disabled = !ports.length;
  // Type proposé : lien permanent entre deux éléments passifs, cordon sinon
  const b = typeOf(t) === 'outlet' ? t : ports[0]?.id;
  if (b && mediaOf(a) === 'cuivre') ty.value = isPassiveNode(a) && isPassiveNode(b) ? 'cat6a' : 'patch';
};
Actions.disconnect = el => {
  const id = el.dataset.id, cabs = cablesOf(id);
  if (!cabs.length) return;
  if (cabs.length === 1) { disconnect(cabs[0].id); toast('Câble débranché', 'ok', undoAction); return; }
  Modal.open({
    title: `Débrancher ${esc(labelOf(id))}`,
    body: `<label class="f"><span>Câble à retirer</span><select name="cab">${cabs.map(c => opt(c.id, `${isPassiveNode(otherEnd(c, id)) ? 'Arrière' : 'Avant'} : vers ${labelOf(otherEnd(c, id))} (${c.type.toUpperCase()}, ${c.length} m)`, '')).join('')}</select></label>`,
    ok: 'Débrancher', okClass: 'danger',
    onOk(v) { disconnect(v.cab); toast('Câble débranché', 'ok', undoAction); return true; },
  });
};
Actions['outlet-del'] = el => {
  const o = byId(el.dataset.id);
  Modal.confirm('Supprimer la prise', `Supprimer la prise <b>${esc(o.label)}</b> et ses câbles ?`, () => {
    Store.commit('remove', `Suppression de la prise ${o.label}`, db => { db.cables = db.cables.filter(c => c.a !== o.id && c.b !== o.id); db.outlets.splice(db.outlets.indexOf(o), 1); });
    select(o.roomId, { keep: true }); toast('Prise supprimée', 'ok', undoAction); return true;
  }, 'Supprimer', 'danger');
};
