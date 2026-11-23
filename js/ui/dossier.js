/* Dossier technique d'un étage, d'un bâtiment ou d'un site : un seul document à imprimer ou à enregistrer en PDF,
   à remettre à un prestataire. Il réunit le plan, les prises murales, les équipements hors baie, et chaque baie avec son brassage.
   Les adresses IP, les adresses MAC et les numéros de série n'y figurent que si on le demande. */
import { CATEGORIES, DEVICE_STATUS, OUTLET_USAGE } from '../config.js';
import { esc, fmtDateTime, plural, typeOf } from '../utils.js';
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { byId, catOf, labelOf, locLabel, vlanOf } from '../services/requetes.js';
import { outletInfo, STATE_COL, STATE_LABEL } from '../services/cablage.js';
import { Actions, Modal } from './socle.js';
import { Carto } from './carto/carto.js';
import { fitVb, planSvg } from './carto/plan.js';
import { ficheBaie, imprimer, planBrassage } from './impression.js';

const RUBRIQUES = [['plan', 'Plan de chaque étage, avec le repère des prises'], ['prises', 'Liste des prises murales et de leur liaison'], ['equipements', 'Équipements hors baie (bornes, caméras, téléphones)'], ['baies', 'Baies : élévation et plan de brassage']];
const cellule = v => (v === '' || v == null ? '—' : esc(v));
const table = (tetes, lignes, vide) => `<table><thead><tr>${tetes.map(t => `<th>${t}</th>`).join('')}</tr></thead><tbody>${lignes.map(l => `<tr>${l.map(c => `<td>${c}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${tetes.length}">${vide}</td></tr>`}</tbody></table>`;
/* Étages couverts par l'objet choisi (site, bâtiment ou étage), dans l'ordre de l'arbre */
function etagesDe(id) {
  const t = typeOf(id), d = Store.db;
  if (t === 'floor') return [byId(id)];
  const bats = t === 'building' ? [byId(id)] : d.buildings.filter(b => b.siteId === id);
  return bats.flatMap(b => Store.idx.floorsByBld.get(b.id) || []);
}
const contenu = f => { const I = Store.idx, pieces = I.roomsByFloor.get(f.id) || []; return { pieces, baies: pieces.flatMap(r => I.racksByRoom.get(r.id) || []), prises: pieces.flatMap(r => I.outByRoom.get(r.id) || []), equipements: pieces.flatMap(r => I.devByRoom.get(r.id) || []) }; };
/* Plan de l'étage entier, sans sélection ni couverture Wi-Fi, avec les repères affichés */
function planEtage(f) {
  const garde = { sel: Carto.sel, wifi: Carto.wifi, rackId: Carto.rackId };
  Object.assign(Carto, { sel: null, wifi: false, rackId: null });
  try { const vb = fitVb(f); return `<svg class="plan zoomed" xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}">${planSvg(f, false)}</svg>`; }
  finally { Object.assign(Carto, garde); }
}
const legende = () => `<p class="pr-legende"><b>Prises :</b> ${['up', 'down', 'disabled', 'error'].map(s => `<span><i style="background:${STATE_COL[s]}"></i>${STATE_LABEL[s]}</span>`).join('')}<span><i class="vide"></i>Non brassée</span>
  <b>Équipements :</b> ${['ap', 'camera', 'phone'].map(c => `<span><i class="rond" style="background:${CATEGORIES[c].color}"></i>${CATEGORIES[c].one}</span>`).join('')}</p>`;
function sectionEtage(f, o) {
  const c = contenu(f), nom = locLabel(f.id), out = [];
  if (o.plan) out.push(`<section class="pr-plan"><h1>Plan — ${esc(nom)}</h1><p class="pr-sous">${f.width} × ${f.height} m — ${plural(c.pieces.length, 'pièce')}, ${plural(c.prises.length, 'prise')}, ${plural(c.baies.length, 'baie')}</p>${planEtage(f)}${legende()}</section>`);
  if (o.prises) {
    const lignes = [...c.prises].sort((a, b) => a.label.localeCompare(b.label, 'fr', { numeric: true })).map(p => { const i = outletInfo(p.id);
      return [`<b>${esc(p.label)}</b>`, esc(byId(p.roomId)?.name || ''), esc(OUTLET_USAGE[p.usage] || p.usage), i.pp ? esc(labelOf(i.pp.id)) : '—', i.net ? esc(labelOf(i.net.id)) : '—', i.net ? (i.net.vlan == null ? 'Trunk' : esc(`${i.net.vlan} ${vlanOf(i.net.vlan).name}`)) : '—', esc(STATE_LABEL[i.status] || '')]; });
    out.push(`<section><h2>Prises murales — ${esc(nom)} <small>${plural(c.prises.length, 'prise')}</small></h2>${table(['Repère', 'Pièce', 'Usage', 'Panneau · port', 'Switch · port', 'VLAN', 'État'], lignes, 'Aucune prise sur cet étage')}</section>`);
  }
  if (o.equipements) {
    const lignes = [...c.equipements].sort((a, b) => a.hostname.localeCompare(b.hostname, 'fr', { numeric: true })).map(d => { const m = catOf(d);
      return [`<b>${esc(d.hostname)}</b>`, esc(CATEGORIES[m?.category]?.one || ''), esc(m ? `${m.brand} ${m.model}` : ''), esc(byId(d.roomId)?.name || ''), ...(o.sensibles ? [cellule(d.ip), cellule(d.mac), cellule(d.serial)] : []), esc(DEVICE_STATUS[d.status]?.label || '')]; });
    out.push(`<section><h2>Équipements hors baie — ${esc(nom)} <small>${plural(c.equipements.length, 'équipement')}</small></h2>${table(['Nom', 'Type', 'Modèle', 'Pièce', ...(o.sensibles ? ['Adresse IP', 'Adresse MAC', 'N° de série'] : []), 'Statut'], lignes, 'Aucun équipement hors baie sur cet étage')}</section>`);
  }
  if (o.baies) for (const r of c.baies) out.push(`<div class="pr-baie">${ficheBaie(r, { sensibles: o.sensibles })}${planBrassage(r)}</div>`);
  return out.join('');
}
/* Document complet. o : { plan, prises, equipements, baies, sensibles } */
function dossier(id, o) {
  const e = byId(id), t = typeOf(id), etages = etagesDe(id), tout = etages.map(contenu), n = k => tout.reduce((s, c) => s + c[k].length, 0);
  const site = t === 'site' ? e : byId(t === 'building' ? e.siteId : byId(e.buildingId).siteId);
  const perimetre = t === 'floor' ? locLabel(id) : e.name, qui = Sync.utilisateur?.nom || Sync.utilisateur?.identifiant || '';
  return `<section class="pr-couv"><h1>Dossier technique — ${esc(perimetre)}</h1>
    <p class="pr-sous">${esc(site?.name || '')}${site?.address ? ` — ${esc(site.address)}` : ''}</p>
    ${table(['Périmètre', 'Contenu', 'Établi le'], [[esc(perimetre), `${t === 'floor' ? '' : `${plural(etages.length, 'étage')}, `}${plural(n('pieces'), 'pièce')}, ${plural(n('prises'), 'prise')}, ${plural(n('baies'), 'baie')}, ${plural(n('equipements'), 'équipement')} hors baie`, `${fmtDateTime(Date.now())}${qui ? ` par ${esc(qui)}` : ''}`]], '')}
    <p class="pr-note">Ce document reflète l'inventaire à la date ci-dessus. Vérifier sur place avant toute intervention.${o.sensibles ? '' : ' Adresses IP, adresses MAC et numéros de série retirés de ce document.'}</p>
    <h2>Sommaire</h2>
    ${table(['Étage', 'Pièces', 'Prises murales', 'Équipements hors baie', 'Baies'], etages.map((f, i) => [`<b>${esc(locLabel(f.id))}</b>`, tout[i].pieces.length, tout[i].prises.length, tout[i].equipements.length, tout[i].baies.map(r => esc(r.name)).join(', ') || '—']), 'Aucun étage')}
    <p class="pr-note">Pour chaque étage : ${[o.plan && 'le plan avec le repère de chaque prise', o.prises && 'la liste des prises et leur liaison jusqu\'au switch', o.equipements && 'les équipements hors baie', o.baies && 'chaque baie avec son élévation et son plan de brassage'].filter(Boolean).join(', ')}.</p></section>
    ${etages.map(f => sectionEtage(f, o)).join('')}`;
}
Actions.dossier = el => {
  const id = el.dataset.id, e = byId(id), t = typeOf(id);
  Modal.open({ title: `Dossier technique — ${esc(t === 'floor' ? locLabel(id) : e.name)}`, ok: 'Imprimer ou enregistrer en PDF',
    body: `<p class="muted" style="margin:0 0 12px">Un seul document à remettre à un prestataire${t === 'floor' ? '' : ` : ${plural(etagesDe(id).length, 'étage')}`}. Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF » pour l'envoyer par courriel.</p>
      ${RUBRIQUES.map(([k, lb]) => `<label class="row" style="margin-bottom:8px"><input type="checkbox" name="${k}" checked> <span>${lb}</span></label>`).join('')}
      <div class="sec-t" style="margin:14px 0 8px">Informations sensibles</div>
      <label class="row"><input type="checkbox" name="sensibles"> <span><b>Inclure les adresses IP, les adresses MAC et les numéros de série</b> — à cocher seulement si le prestataire en a besoin</span></label>`,
    onOk(v) {
      if (!RUBRIQUES.some(([k]) => v[k])) throw new Error('Cochez au moins une rubrique.');
      imprimer(dossier(id, v));
      return true;
    } });
};

export { dossier };
