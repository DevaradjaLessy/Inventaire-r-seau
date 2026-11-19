/* Cartographie — vue « Baie 3D » : élévation 2D et scène 3D. */
import { CATEGORIES, DEVICE_STATUS, POE_STEPS } from '../../config.js';
import { $, esc, typeOf } from '../../utils.js';
import { ico } from '../../icones.js';
import { Store } from '../../store.js';
import { byId, cablesOf, catOf, deviceIcon, labelOf, locLabel, locOf, portsOf, rackMap, rackUsage, vlanOf } from '../../services/requetes.js';
import { connectedLabel, effStatus, STATE_COL, STATE_LABEL } from '../../services/cablage.js';
import { Viewer3D } from '../../3d/viewer.js';
import { Actions, Changes, isMobile } from '../socle.js';
import { Carto, select, Views3D } from './carto.js';
import { opt } from './fiches.js';
import { initElevEvents, renderPalette } from '../materiel/palette.js';

/* ---------- Vue « Baie 3D » : élévation 2D à gauche, scène 3D à droite ---------- */
const View3D = { mode: 'none', cables: true, key: '', focusReq: false, vue: 'r3d' };   // vue : sur téléphone, 3D ou élévation (une seule à la fois)
function renderRackView() {
  const host = $('#v-rack');
  if (!host.dataset.built) {
    host.dataset.built = '1';
    host.innerHTML = `<div class="rackview"><div class="rv-switch seg m-only" id="rv-switch"></div><div class="elev" id="elev"></div>
      <div class="r3d"><div id="r3d-canvas"></div><div class="overlay tl wrap" id="r3d-tools"></div><div id="r3d-etiquette" class="hidden"></div><div class="overlay bl legend" id="r3d-legend"></div></div><div id="palette-host-r"></div></div>`;
    Views3D.main = new Viewer3D($('#r3d-canvas'), { onPort: id => select(id, { keep: true }), onDevice: id => select(id, { keep: true }) });
    initElevEvents?.($('#elev'));
    Views3D.main.setLabel($('#r3d-etiquette'));
  }
  const v = Views3D.main, sel = Carto.sel, t = typeOf(sel || ''), l = locOf(sel || '');
  $('.rackview', host).classList.toggle('m-elev', View3D.vue === 'elev');
  $('#rv-switch').innerHTML = [['r3d', 'cube', 'Vue 3D'], ['elev', 'rack', 'Élévation']].map(([k, i, lb]) => `<button data-act="rv-vue" data-v="${k}" class="${View3D.vue === k ? 'on' : ''}">${ico(i)}${lb}</button>`).join('')
    + `<button data-act="palette" class="${Carto.palette ? 'on' : ''}">${ico('box')}Stock</button>`;
  const racksOpt = cur => Store.db.buildings.map(b => `<optgroup label="${esc(b.name)}">${Store.db.racks.filter(r => locOf(r.id).building?.id === b.id).map(r => opt(r.id, `${r.name} — ${locOf(r.id).floor.name}`, cur)).join('')}</optgroup>`).join('');
  const objDev = l.device && !l.rack && l.device.roomId ? l.device : null;
  const objCat = objDev ? catOf(objDev) : t === 'outlet' ? Store.idx.cat.get('cat-outlet') || Store.db.catalog.find(c => c.template === 'outlet') : null;
  let legend = '';
  if (objCat) {
    // Objet seul : équipement hors baie ou prise murale
    const key = `obj|${objDev?.id || sel}|${Store.rev}`;
    if (View3D.key !== key) { View3D.key = key; v.showObject(objCat, objDev); }
    $('#elev').innerHTML = `<h4>${ico(objDev ? deviceIcon(objDev) : 'outlet')}${esc(labelOf(objDev?.id || sel))}</h4><div class="sub">${esc(objCat.brand)} ${esc(objCat.model)}</div><p class="muted">Aperçu 3D de l'objet seul. Cet élément n'est pas installé dans une baie.</p>
      <label class="f"><span>Ouvrir une baie</span><select data-chg="rack-pick"><option value="">Choisir…</option>${racksOpt('')}</select></label>`;
    $('#r3d-tools').innerHTML = ''; $('#r3d-etiquette').classList.add('hidden'); legend = 'Aperçu 3D · glisser pour tourner, molette pour zoomer';
  } else {
    const rack = byId(Carto.rackId) || Store.db.racks[0];
    if (!rack) { $('#elev').innerHTML = '<div class="empty">Aucune baie</div>'; $('#r3d-etiquette').classList.add('hidden'); $('#r3d-tools').innerHTML = ''; $('#r3d-legend').innerHTML = ''; return; }
    Carto.rackId = rack.id;
    const key = `rack|${rack.id}|${Store.rev}`, same = View3D.key.startsWith(`rack|${rack.id}|`);
    if (View3D.key !== key) { View3D.key = key; v.showRack(rack.id, same); }
    v.setSelected(sel); v.setHighlight(Carto.trace);
    if (View3D.focusReq && v.ok) { View3D.focusReq = false; if (t === 'rack') v.frameAll(); else if (l.rack?.id === rack.id) v.focus(t === 'port' ? sel : l.device?.id); }
    $('#elev').innerHTML = elevHtml(rack);
    // Ce qui ne va pas dans cette baie : un clic y mène
    const pbs = [...rackUsage(rack.id).devices.filter(d => d.status === 'fault').map(d => ({ id: d.id, t: `${d.hostname} en panne` })),
      ...rackUsage(rack.id).devices.flatMap(d => portsOf(d.id).filter(p => p.role !== 'pp' && effStatus(p) === 'error').map(p => ({ id: p.id, t: `${d.hostname} · ${p.name}` })))];
    const alertes = pbs.length ? `<div class="r3d-alertes" id="r3d-alertes"><span class="muted">${ico('alert')}${pbs.length > 1 ? 'Problèmes' : 'Problème'}</span>${pbs.slice(0, 6).map(x => `<button class="chip" data-act="r3d-aller" data-id="${x.id}" data-tip="${esc(x.t)}|Clic : aller au port">${esc(x.t)}</button>`).join('')}${pbs.length > 6 ? `<span class="muted">+ ${pbs.length - 6}</span>` : ''}</div>` : '';
    const modes = [['none', 'Réel'], ['status', 'État'], ['vlan', 'VLAN'], ['poe', 'PoE']];
    $('#r3d-tools').innerHTML = `<select data-chg="rack-pick" data-tip="Changer de baie">${racksOpt(rack.id)}</select>
      <div class="seg" data-tip="Coloration des ports">${modes.map(([m, lb]) => `<button data-act="r3d-mode" data-m="${m}" class="${View3D.mode === m ? 'on' : ''}">${lb}</button>`).join('')}</div>
      <button class="btn ${View3D.cables ? 'on' : ''}" data-act="r3d-cables" data-tip="Cordons|Afficher ou masquer les cordons de brassage">${ico('cable')}Cordons</button>
      <button class="btn ${v.isoler ? 'on' : ''}" data-act="r3d-isoler" data-tip="Isoler la sélection|Quand un port ou un équipement est choisi, les autres cordons s'effacent pour dégager la vue">${ico('trace')}Isoler</button>
      <button class="btn icon" data-act="r3d-face" data-tip="Vue de face|Bien droit devant le port ou l'équipement choisi, sinon devant toute la baie">${ico('rack')}</button>
      <button class="btn icon" data-act="r3d-fit" data-tip="Recentrer|Recadrer la vue sur toute la baie">${ico('fit')}</button>
      <button class="btn ${Carto.palette ? 'on' : ''}" data-act="palette" data-tip="Stock|Glisser un modèle du stock sur une U libre de l'élévation">${ico('box')}Stock</button>
      ${Carto.trace ? `<button class="btn on" data-act="trace-clear">${ico('x')}Effacer le tracé</button>` : ''}${alertes}`;
    // Étiquette accrochée au port choisi
    const et = $('#r3d-etiquette'), port = t === 'port' && l.rack?.id === rack.id ? byId(sel) : null;
    et.classList.toggle('hidden', !port);
    if (port) {
      const st = effStatus(port), bout = connectedLabel(port);
      et.innerHTML = `<b>${esc(byId(port.deviceId).hostname)} · ${esc(port.name)}</b><span><i style="background:${STATE_COL[st]}"></i>${STATE_LABEL[st]}${port.role === 'pp' ? '' : ` · ${port.vlan == null ? 'Trunk' : esc(`${port.vlan} ${vlanOf(port.vlan).name}`)}`}</span>${bout ? `<span>→ ${esc(bout)}</span>` : cablesOf(port.id).length ? '' : '<span class="dim">Aucun cordon</span>'}`;
      v.placeLabel();
    }
    const lg = (c, lb, extra = '') => `<span><i style="background:${c};${extra}"></i>${lb}</span>`;
    if (View3D.mode === 'status') legend = '<b>État</b>' + ['up', 'down', 'disabled', 'error', 'idle', 'free'].map(s => lg(STATE_COL[s], STATE_LABEL[s])).join('');
    else if (View3D.mode === 'vlan') { const used = new Set(rackUsage(rack.id).devices.flatMap(d => portsOf(d.id)).filter(p => p.role !== 'pp' && (p.status === 'up' || cablesOf(p.id).length)).map(p => p.vlan)); legend = '<b>VLAN</b>' + [...used].sort((a, b) => (a ?? 1e9) - (b ?? 1e9)).map(x => x == null ? lg('#e4e9ef', 'Trunk') : lg(vlanOf(x).color, `${x} ${esc(vlanOf(x).name)}`)).join(''); }
    else if (View3D.mode === 'poe') legend = '<b>PoE</b>' + POE_STEPS.map(s => lg(s.color, s.label)).join('') + lg('#2a3646', 'Port PoE sans charge');
    else legend = `<b>Aspect réel</b>${lg('#3dff66', 'LED verte : lien actif', 'border-radius:50%')}${lg('#ff9a1f', 'LED orange : erreur', 'border-radius:50%')}<span>Survol : détails du port · clic : fiche</span>`;
  }
  $('#r3d-legend').innerHTML = legend;
  renderPalette?.('rack');
}
/* Élévation 2D de la baie : une ligne par U, de haut en bas */
function elevHtml(rack) {
  const u = rackUsage(rack.id), map = rackMap(rack.id), H = rack.heightU, rowH = isMobile() ? 32 : H > 30 ? 15 : 22, out = [], selDev = locOf(Carto.sel || '').device?.id;
  for (let n = H; n >= 1; n--) {
    const row = H - n + 1, d = map[n];
    out.push(`<div class="eu-n" style="grid-row:${row}">${n}</div>`);
    if (!d) { out.push(`<div class="eu free" style="grid-row:${row}" data-u="${n}" data-act="elev-free" data-tip="U${n} libre|Clic : installer ici un équipement du stock">+ U${n}</div>`); continue; }
    const c = catOf(d), hU = c.heightU || 1;
    if (n !== d.u + hU - 1) continue;   // l'équipement est dessiné une seule fois, à partir de sa U la plus haute
    out.push(`<div class="eu dev ${selDev === d.id ? 'sel' : ''}" style="grid-row:${row}/span ${hU};--cc:${CATEGORIES[c.category].color}" data-act="psel" data-id="${d.id}" data-tip="${esc(d.hostname)}|${esc(c.brand)} ${esc(c.model)}|U${d.u}${hU > 1 ? '–' + (d.u + hU - 1) : ''}">${ico(deviceIcon(d))}<span>${esc(d.hostname)}</span>${d.status !== 'active' ? `<i class="dotst" style="background:${DEVICE_STATUS[d.status].color};width:7px;height:7px;border-radius:50%;flex:none"></i>` : ''}</div>`);
  }
  return `<h4>${ico('rack')}${esc(rack.name)}</h4><div class="sub">${esc(locLabel(rack.roomId))}<br>${u.used}/${u.total} U occupées (${u.pct} %)</div>
    <div class="elev-grid" style="grid-template-rows:repeat(${H},${rowH}px)" data-rack="${rack.id}">${out.join('')}</div>`;
}
Changes['rack-pick'] = el => { if (el.value) { View3D.focusReq = true; select(el.value, { view: 'rack' }); } };
Actions['r3d-mode'] = el => { View3D.mode = el.dataset.m; Views3D.main.setMode(View3D.mode); renderRackView(); };
Actions['r3d-cables'] = () => { View3D.cables = !View3D.cables; Views3D.main.setCables(View3D.cables); renderRackView(); };
Actions['r3d-fit'] = () => Views3D.main.frameAll();
Actions['r3d-face'] = () => Views3D.main.face();
Actions['r3d-isoler'] = () => { Views3D.main.setIsoler(!Views3D.main.isoler); renderRackView(); };
Actions['r3d-aller'] = el => { View3D.focusReq = true; select(el.dataset.id, { keep: true }); };
Actions['rv-vue'] = el => { View3D.vue = el.dataset.v; renderRackView(); };

export { renderRackView, View3D };
