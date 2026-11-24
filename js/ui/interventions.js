/* Interventions d'urgence : impact d'une panne, remplacement d'un équipement, coupure d'un port. */
import { CATEGORIES } from '../config.js';
import { $, csvCell, download, esc, fmtDate, groupBy, plural, today } from '../utils.js';
import { ico } from '../icones.js';
import { Store } from '../store.js';
import { byId, catOf, labelOf } from '../services/requetes.js';
import { impactOf } from '../services/impact.js';
import { planRemplacement, replaceDevice } from '../services/remplacement.js';
import { stockOf } from '../services/installation.js';
import { Actions, Changes, Modal, toast, undoAction } from './socle.js';
import { select } from './carto/carto.js';

/* --- Impact d'une panne --- */
/* Résumé en une ligne, pour la fiche de l'équipement */
function resumeImpact(devId) {
  const I = impactOf(devId);
  return [plural(I.outlets.length, 'prise'), plural(I.terminals.length, 'terminal', 'terminaux'), plural(I.rooms.length, 'pièce'), I.isolated.length ? `${plural(I.isolated.length, 'équipement')} réseau isolé${I.isolated.length > 1 ? 's' : ''}` : null].filter(Boolean).join(' · ');
}
Actions.impact = el => {
  const I = impactOf(el.dataset.id), d = I.device;
  const parPiece = groupBy(I.rows, r => r.room?.id || '');
  const ligne = r => `<div class="imp-row" ${r.outlet || r.terminal ? `data-act="go" data-id="${(r.terminal || r.outlet).id}"` : ''}><span>${r.outlet ? `Prise ${esc(r.outlet.label)}` : '—'}</span><b>${r.terminal ? esc(r.terminal.hostname) : esc(r.poste) || '<span class="dim">prise sans terminal connu</span>'}</b>
    <span class="muted">${r.terminal ? CATEGORIES[catOf(r.terminal).category].one : ''}</span><span class="muted">${esc(r.via.hostname)} · ${esc(r.port.name)}</span><span class="chip">${esc(r.vlan)}</span></div>`;
  Modal.open({ title: `Si ${esc(d.hostname)} tombe en panne`, wide: true, ok: false, cancel: 'Fermer',
    footer: `<button class="btn" data-act="impact-csv" data-id="${d.id}">${ico('download')}Liste (CSV)</button>`,
    body: `<p style="margin:0 0 10px"><b>${resumeImpact(d.id) || 'Rien de raccordé'}</b></p>
      ${I.isolated.length ? `<div class="avert" style="margin:0 0 12px"><b>Équipements réseau coupés du cœur :</b><span>${I.isolated.map(x => `<a data-act="go" data-id="${x.id}" style="cursor:pointer">${esc(x.hostname)}</a>`).join(', ')}. Ce qu'ils desservent est compté ci-dessous.</span></div>` : ''}
      <div id="impact-list">${[...parPiece].map(([id, rows]) => `<div class="sec-t" style="margin:12px 0 4px">${esc(byId(id) ? labelOf(id) : 'Hors pièce')} — ${rows.length}</div>${rows.map(ligne).join('')}`).join('') || '<div class="empty">Aucune prise ni aucun terminal ne dépend de cet équipement.</div>'}</div>` });
};
Actions['impact-csv'] = el => {
  const I = impactOf(el.dataset.id), q = csvCell;
  const lignes = I.rows.map(r => [r.room ? labelOf(r.room.id) : '', r.outlet?.label || '', r.terminal?.hostname || r.poste, `${r.via.hostname} ${r.port.name}`, r.vlan].map(q).join(';'));
  download(`netcarto-impact-${I.device.hostname}-${today()}.csv`, '\ufeff' + ['piece;prise;terminal;port_du_switch;vlan', ...lignes].join('\r\n'), 'text/csv');
};

/* --- Remplacement d'un équipement --- */
function bilanRemplacement(devId, catId) {
  const p = planRemplacement(devId, catId);
  if (p.erreur) return `<div class="avert">${esc(p.erreur)}</div>`;
  return `<div class="avert" style="border-color:${p.perdus.length ? 'var(--warn)' : 'var(--up)'}"><b>${plural(p.repris, 'câble')} repris${p.repris > 1 ? '' : ''} · ${plural(p.sansPort, 'câble')} sans port</b>
    <span>${p.perdus.length ? `Ports sans équivalent sur le nouveau modèle, à rebrancher à la main : ${p.perdus.map(x => esc(x.name)).join(', ')}.` : 'Tous les ports câblés retrouvent un port équivalent ; VLAN, états et descriptions sont recopiés.'}</span></div>`;
}
Actions['dev-replace'] = el => {
  const d = byId(el.dataset.id), c = catOf(d);
  const modeles = Store.db.catalog.filter(m => m.mount === c.mount && m.category === c.category && stockOf(m.id).available > 0).sort((a, b) => (a.id === c.id ? -1 : b.id === c.id ? 1 : `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`)));
  if (!modeles.length) throw new Error(`Aucun ${CATEGORIES[c.category].one.toLowerCase()} en stock pour le remplacement : faites d'abord une entrée en stock.`);
  Modal.open({ title: `Remplacer ${esc(d.hostname)}`, ok: 'Remplacer',
    body: `<label class="f"><span>Nouveau matériel (stock)</span><select name="cat" data-chg="rempl" data-id="${d.id}" autofocus>${modeles.map(m => `<option value="${m.id}">${esc(m.brand)} ${esc(m.model)}${m.id === c.id ? ' — même modèle' : ''} — ${stockOf(m.id).available} en stock</option>`).join('')}</select></label>
      <div id="rempl-bilan">${bilanRemplacement(d.id, modeles[0].id)}</div>
      <p class="muted" style="margin:12px 0 6px">Le nouveau reprend le nom <b>${esc(d.hostname)}</b>, l'adresse ${d.ip ? `<b>${esc(d.ip)}</b>` : 'IP'} et l'emplacement. Son adresse MAC et son numéro de série sont à saisir ensuite.</p>
      <label class="row" style="margin-bottom:6px"><input type="radio" name="sort" value="retire" checked> <span><b>Ancien matériel hors service</b> — il reste à l'inventaire (retour SAV, mise au rebut)</span></label>
      <label class="row"><input type="radio" name="sort" value="stock"> <span><b>Ancien matériel remis en stock</b> — il est sain, simple échange</span></label>`,
    onOk() {
      const id = replaceDevice(d.id, $('#modal-root [name=cat]').value, $('#modal-root [name=sort]:checked').value);
      toast(`${byId(id).hostname} remplacé : pensez à saisir l'adresse MAC et le numéro de série`, 'ok', undoAction); select(id);
      return true;
    } });
};
Changes.rempl = el => { $('#rempl-bilan').innerHTML = bilanRemplacement(el.dataset.id, el.value); };

/* --- Couper ou rétablir un port --- */
Actions['port-couper'] = el => {
  const p = byId(el.dataset.id);
  Modal.open({ title: `Désactiver ${esc(labelOf(p.id))}`, ok: 'Désactiver', okClass: 'danger',
    body: `<label class="f"><span>Motif (facultatif) — il est noté dans la description du port et dans l'historique</span><input type="text" name="motif" placeholder="Poste suspect, ticket n°…" autofocus></label>
      <p class="muted" style="margin:10px 0 0">NetCarto note que le port est désactivé ; la coupure réelle se fait sur le switch.</p>`,
    onOk(v) {
      const motif = (v.motif || '').trim();
      Store.commit('edit', `Port ${labelOf(p.id)} désactivé${motif ? ` — ${motif}` : ''}`, () => {
        p.status = 'disabled'; p.poe.watts = 0;
        if (motif) p.description = `${p.description ? p.description + ' — ' : ''}Désactivé le ${fmtDate(today())} : ${motif}`;
      }, p.id);
      toast('Port désactivé', 'ok', undoAction);
      return true;
    } });
};
Actions['port-retablir'] = el => { const p = byId(el.dataset.id); Store.commit('edit', `Port ${labelOf(p.id)} réactivé`, () => { p.status = 'down'; }, p.id); toast('Port réactivé : il repassera « Actif » quand le lien montera', 'ok', undoAction); };

export { resumeImpact };
