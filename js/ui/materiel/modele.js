/* Matériel — formulaire « Nouveau modèle ». */
import { CATEGORIES, PORT_KIND, PORT_ROLE } from '../../config.js';
import { $, $$, clamp, esc, fmtSpeed, norm } from '../../utils.js';
import { ico } from '../../icones.js';
import { Store } from '../../store.js';
import { installedCount, stockOf } from '../../services/installation.js';
import { GABARITS } from '../../3d/facades.js';
import { Actions, Changes, Modal, toast, undoAction } from '../socle.js';
import { opt } from '../carto/fiches.js';
import { Mat, portSummary } from './catalogue.js';

/* ---------- Formulaire « Nouveau modèle » ---------- */
const TPL_BY_CAT = { switch: ['switch'], router: ['router'], firewall: ['firewall'], ap: ['ap'], passive: ['patch', 'fiber', 'cablemgr', 'outlet'], rack: ['rack', 'wallrack'], ups: ['ups'], server: ['server'], phone: ['phone'], camera: ['camera'], consumable: ['sfp', 'cable'] };
const TPL_LABEL = { switch: 'Switch 19"', router: 'Routeur 19"', firewall: 'Pare-feu 19"', ap: 'Borne Wi-Fi', patch: 'Panneau de brassage', fiber: 'Tiroir optique', cablemgr: 'Passe-câbles', outlet: 'Prise murale', rack: 'Baie au sol', wallrack: 'Coffret mural', ups: 'Onduleur 19"', server: 'Serveur 19"', phone: 'Téléphone', camera: 'Caméra dôme', sfp: 'Module SFP', cable: 'Cordon / câble' };
const TPL_MOUNT = { ap: 'ceiling', camera: 'ceiling', phone: 'desk', outlet: 'wall', rack: 'floor', wallrack: 'wall', sfp: 'none', cable: 'none' };
let ModelForm = null;
function modelGroupsHtml() {
  const F = ModelForm;
  if (F.locked) return `<p class="muted" style="margin:0">Des équipements de ce modèle sont installés : les ports ne sont plus modifiables (${esc(portSummary(F) || 'aucun port')}).</p>`;
  return F.ports.map((g2, i) => `<div class="pg-row" data-i="${i}">
      <select data-f="kind">${Object.entries(PORT_KIND).map(([k, v]) => opt(k, v, g2.kind)).join('')}</select>
      <input type="number" data-f="count" min="1" max="96" value="${g2.count}" data-tip="Nombre de ports">
      <select data-f="speed">${[100, 1000, 2500, 10000, 25000].map(s => opt(s, fmtSpeed(s), g2.speed)).join('')}</select>
      <select data-f="role">${Object.entries(PORT_ROLE).map(([k, v]) => opt(k, v, g2.role)).join('')}</select>
      <input type="text" data-f="prefix" value="${esc(g2.prefix)}" placeholder="Préfixe (Gi1/0/)" data-tip="Préfixe du nom des ports">
      <input type="number" data-f="start" value="${g2.start}" data-tip="Premier numéro">
      <label class="row" style="gap:4px"><input type="checkbox" data-f="poe" ${g2.poe ? 'checked' : ''}>PoE</label>
      <button class="btn sm icon danger" data-act="model-grp-del" data-i="${i}">${ico('trash')}</button></div>`).join('') + `<button class="btn sm" data-act="model-grp-add">${ico('plus')}Ajouter un groupe de ports</button>`;
}
/* Relit les groupes de ports saisis dans le formulaire */
function modelReadGroups() {
  if (ModelForm.locked) return;
  ModelForm.ports = $$('#model-groups .pg-row').map(r => { const v = f => r.querySelector(`[data-f=${f}]`); return { kind: v('kind').value, count: clamp(+v('count').value || 1, 1, 96), speed: +v('speed').value, role: v('role').value, prefix: v('prefix').value, start: +v('start').value || 0, poe: v('poe').checked }; });
}
function openModelForm(c) {
  const edit = !!c;
  ModelForm = { edit, id: c?.id, locked: edit && installedCount(c.id) > 0, ports: (c?.ports || [{ kind: 'rj45', count: 24, speed: 1000, role: 'access', prefix: 'Gi1/0/', start: 1, poe: false }]).map(g2 => g2.names ? { ...g2, count: g2.names.length, prefix: g2.prefix || '', names: g2.names } : { ...g2 }) };
  const v = c || { category: 'switch', brand: '', model: '', ref: '', template: 'switch', heightU: 1, powerW: 0, poeBudgetW: 0, poeDrawW: 0, firmware: '', description: '', visual: { color: '#2a3038', accent: '#38bdf8', frontImage: '' } };
  const st = c ? stockOf(c.id) : { available: 1, threshold: 0 };
  Modal.open({
    title: edit ? `Modifier le modèle ${esc(c.model)}` : 'Nouveau modèle', wide: true, ok: edit ? 'Enregistrer' : 'Ajouter au catalogue',
    body: `<div class="form-grid" style="grid-template-columns:repeat(4,1fr)">
      <label class="f"><span>Catégorie</span><select name="category" data-chg="model-cat" ${ModelForm.locked ? 'disabled' : ''}>${Object.entries(CATEGORIES).map(([k, x]) => opt(k, x.one, v.category)).join('')}</select></label>
      <label class="f"><span>Gabarit 3D</span><select name="template" id="model-tpl" ${ModelForm.locked ? 'disabled' : ''}>${TPL_BY_CAT[v.category].map(t => opt(t, TPL_LABEL[t], v.template)).join('')}</select></label>
      <label class="f"><span>Marque</span><input type="text" name="brand" value="${esc(v.brand)}" autofocus></label>
      <label class="f"><span>Référence</span><input type="text" name="ref" value="${esc(v.ref)}"></label>
      <label class="f" style="grid-column:span 2"><span>Modèle</span><input type="text" name="model" value="${esc(v.model)}"></label>
      <label class="f"><span>Hauteur (U)</span><input type="number" name="heightU" min="0" max="48" value="${v.heightU || 0}" ${ModelForm.locked ? 'disabled' : ''}></label>
      <label class="f"><span>Puissance (W)</span><input type="number" name="powerW" min="0" value="${v.powerW || 0}"></label>
      <label class="f"><span>Budget PoE (W)</span><input type="number" name="poeBudgetW" min="0" value="${v.poeBudgetW || 0}"></label>
      <label class="f"><span>Consommation PoE (W)</span><input type="number" name="poeDrawW" min="0" value="${v.poeDrawW || 0}"></label>
      <label class="f"><span>Firmware</span><input type="text" name="firmware" value="${esc(v.firmware)}"></label>
      <label class="f"><span>Couleur de façade</span><input type="color" name="color" value="${esc(v.visual?.color || '#2a3038')}" style="height:30px;width:100%;padding:2px;background:#0c1219;border:1px solid var(--line2);border-radius:6px"></label>
      <label class="f full"><span>Photo de façade (URL ou data URI, facultatif — remplace la façade générée)</span><input type="text" name="frontImage" value="${esc(v.visual?.frontImage || '')}" placeholder="https://… ou data:image/…"></label>
      <label class="f full"><span>Description</span><input type="text" name="description" value="${esc(v.description)}"></label>
      ${edit ? '' : `<label class="f"><span>Stock initial</span><input type="number" name="available" min="0" value="${st.available}"></label><label class="f"><span>Seuil d'alerte</span><input type="number" name="threshold" min="0" value="${st.threshold}"></label>`}
      <div class="full"><div class="sec-t" style="margin:4px 0 8px">Groupes de ports</div><div id="model-groups">${modelGroupsHtml()}</div></div></div>`,
    onOk(f) {
      modelReadGroups();
      if (!f.brand || !f.model) throw new Error('La marque et le modèle sont obligatoires.');
      const tplName = ModelForm.locked ? c.template : f.template, category = ModelForm.locked ? c.category : f.category, facade = GABARITS[tplName]?.type === 'facade', encl = GABARITS[tplName]?.type === 'enclosure';
      const heightU = ModelForm.locked ? c.heightU : (facade || encl) ? Math.max(1, f.heightU || 1) : 0;
      if (facade && heightU > 8) throw new Error('Hauteur maximale d\'un équipement : 8 U.');
      const ports = facade || ['ap', 'phone', 'camera'].includes(tplName) ? ModelForm.ports.map(g2 => g2.names && g2.names.length === g2.count ? g2 : (({ names, ...r }) => r)(g2)) : [];
      const data = { category, brand: f.brand, model: f.model, ref: f.ref, template: tplName, mount: facade ? 'rack' : TPL_MOUNT[tplName] || 'none', heightU, ports, poeBudgetW: f.poeBudgetW || 0, poeDrawW: f.poeDrawW || 0, powerW: f.powerW || 0, firmware: f.firmware, description: f.description };
      if (edit) {
        Store.commit('catalog', `Modification du modèle ${f.brand} ${f.model}`, () => { Object.assign(c, data); c.visual = { ...c.visual, color: f.color, frontImage: f.frontImage }; }, c.id);
      } else {
        const id = Store.commit('catalog', `Nouveau modèle au catalogue : ${f.brand} ${f.model}`, db => {
          let id2 = 'cat-' + norm(`${f.brand}-${f.model}`).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40); while (db.catalog.some(x => x.id === id2)) id2 += '-' + (++db.meta.seq).toString(36);
          db.catalog.push({ id: id2, layer: null, specs: {}, visual: { color: f.color, accent: '#38bdf8', logo: f.brand, frontImage: f.frontImage, ...(encl ? { width: tplName === 'rack' ? 0.75 : 0.6, depth: tplName === 'rack' ? 1.07 : 0.45 } : {}) }, ...data });
          db.stock.push({ catalogId: id2, available: Math.max(0, f.available || 0), threshold: Math.max(0, f.threshold || 0), location: '' });
          return id2;
        });
        Mat.sel = id; Mat.cat = '';
      }
      toast(edit ? 'Modèle modifié' : 'Modèle ajouté au catalogue', 'ok', undoAction);
      return true;
    },
  });
}
Actions['model-new'] = () => openModelForm(null);
Actions['model-edit'] = el => openModelForm(Store.idx.cat.get(el.dataset.id));
Actions['model-grp-add'] = () => { modelReadGroups(); ModelForm.ports.push({ kind: 'sfp+', count: 4, speed: 10000, role: 'uplink', prefix: 'Te1/1/', start: 1, poe: false }); $('#model-groups').innerHTML = modelGroupsHtml(); };
Actions['model-grp-del'] = el => { modelReadGroups(); ModelForm.ports.splice(+el.dataset.i, 1); $('#model-groups').innerHTML = modelGroupsHtml(); };
Changes['model-cat'] = el => { $('#model-tpl').innerHTML = TPL_BY_CAT[el.value].map(t => opt(t, TPL_LABEL[t], '')).join(''); };
Actions['model-del'] = el => {
  const c = Store.idx.cat.get(el.dataset.id);
  if (installedCount(c.id)) throw new Error('Ce modèle est installé : retirez d\'abord les équipements concernés.');
  Modal.confirm('Supprimer le modèle', `Supprimer <b>${esc(c.brand)} ${esc(c.model)}</b> du catalogue, ainsi que son stock ?`, () => {
    Store.commit('catalog', `Suppression du modèle ${c.brand} ${c.model}`, db => { db.catalog.splice(db.catalog.indexOf(c), 1); db.stock = db.stock.filter(s => s.catalogId !== c.id); const gone = new Set(db.devices.filter(x => x.catalogId === c.id).map(x => x.id)); db.devices = db.devices.filter(x => !gone.has(x.id)); db.ports = db.ports.filter(x => !gone.has(x.deviceId)); });
    toast('Modèle supprimé', 'ok', undoAction); return true;
  }, 'Supprimer', 'danger');
};
