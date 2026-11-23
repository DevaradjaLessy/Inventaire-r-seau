/* Interface — sources de données : choix et état de la supervision en direct. */
import { COL } from '../config.js';
import { $, esc, plural } from '../utils.js';
import { Store } from '../store.js';
import { Live, SOURCES } from '../services/mesures.js';
import { Actions, Changes, Modal, renderActive, renderShell, TABS, toast, UI } from './socle.js';
import { Views3D } from './carto/carto.js';

/* À chaque relevé : l'affichage est rafraîchi, sauf si l'utilisateur est en train de saisir */
Live.on(() => {
  Views3D.main?.refreshColors();
  renderShell();
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '');
  if (typing || $('#modal-root').classList.contains('on')) { TABS.forEach(t => UI.dirty.add(t.id)); return; }
  TABS.forEach(t => UI.dirty.add(t.id));
  renderActive();
});
function stateHtml() {
  const t = Live.cfg.type;
  if (Live.state === 'ok') {
    const pannes = Live.sources.filter(x => x.ok === false), heure = t0 => (t0 ? new Date(t0).toLocaleTimeString('fr-FR') : '—');
    // Une ligne par source du relais : laquelle répond, laquelle est en panne et pourquoi
    const sources = Live.sources.length > 1 || pannes.length ? `<div class="src-liste">${Live.sources.map(x => `<div><i style="background:${x.ok ? COL.up : x.ok === false ? COL.crit : COL.down}"></i><b>${esc(x.nom)}</b><span>${x.ok ? `${plural(x.equipements, 'équipement')} · relevé à ${heure(x.ts)}` : x.ok === false ? `en erreur : ${esc(x.erreur)}` : 'en attente du premier relevé'}</span></div>`).join('')}</div>` : '';
    // Ports remontés par la source mais absents du modèle dans NetCarto : le nom d'interface ne correspond pas
    const mal = [...Live.diag].filter(([, d]) => d.inconnus.length).map(([id, d]) => ({ nom: Store.idx.id.get(id)?.hostname || '?', ...d }));
    const ports = mal.length ? `<div class="src-note"><b>Ports non reconnus</b> (le nom d'interface remonté n'existe pas sur le modèle) :${mal.slice(0, 6).map(d => `<br>${esc(d.nom)} : ${plural(d.reconnus, 'port reconnu', 'ports reconnus')}, ${d.inconnus.length} non reconnu${d.inconnus.length > 1 ? 's' : ''} (${esc(d.inconnus.slice(0, 5).join(', '))}${d.inconnus.length > 5 ? '…' : ''})`).join('')}${mal.length > 6 ? `<br>… et ${mal.length - 6} autres équipements` : ''}</div>` : '';
    const ecarts = Live.ecarts.length ? `<div class="src-note"><b>${plural(Live.ecarts.length, 'désaccord')} entre sources</b> (la première de la configuration fait foi) :${Live.ecarts.slice(0, 6).map(e => `<br>${esc(e)}`).join('')}${Live.ecarts.length > 6 ? '<br>…' : ''}</div>` : '';
    return `<div class="src-state"><i style="background:${pannes.length ? COL.warn : COL.up}"></i><div><b>Source active : ${esc(Live.source)}</b><div class="muted">Dernier relevé à ${heure(Live.ts)} · ${plural(Live.matched, 'équipement reconnu', 'équipements reconnus')} · ${plural(Live.port.size, 'port suivi', 'ports suivis')}${Live.unmatched.length ? `<br>Non reconnus dans NetCarto (IP ou nom introuvable) : ${esc(Live.unmatched.slice(0, 8).join(', '))}${Live.unmatched.length > 8 ? '…' : ''}` : ''}</div>${sources}${ports}${ecarts}</div></div>`;
  }
  if (Live.state === 'error') return `<div class="src-state"><i style="background:${COL.crit}"></i><div><b>Source en erreur</b><div class="muted">${esc(Live.error)}</div></div></div>`;
  return `<div class="src-state"><i style="background:${COL.down}"></i><div><b>Aucune source active</b><div class="muted">${t === 'none' ? 'Les états affichés sont ceux saisis à la main.' : 'En attente du premier relevé…'}</div></div></div>`;
}
let draftType = null;   // type choisi dans la fenêtre, pas encore appliqué
function body() {
  const c = { ...Live.cfg, type: draftType ?? Live.cfg.type }, relay = c.type === 'relais';
  return `<p class="muted" style="margin:0 0 14px">Une source de supervision remonte l'état réel des équipements et des ports. Il s'affiche à la place de l'état saisi (LEDs de la vue 3D, ports, plan, alertes), sans modifier la base.</p>
    <div class="form-grid">
      <label class="f full"><span>Source</span><select name="type" data-chg="src-type" autofocus>${Object.entries(SOURCES).map(([k, v]) => `<option value="${k}" ${k === c.type ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
      ${relay ? `<label class="f full"><span>Adresse du relais (laisser vide si NetCarto est ouvert depuis le relais lui-même)</span><input type="text" name="url" class="mono" value="${esc(c.url)}" placeholder="vide = même adresse que cette page"></label>
      <label class="f full"><span>Jeton d'accès au relais (facultatif, mémorisé dans ce navigateur)</span><input type="text" name="token" class="mono" value="${esc(c.token)}" autocomplete="off"></label>` : ''}
      ${c.type !== 'none' ? `<label class="f"><span>Intervalle entre deux relevés (secondes, 5 au minimum)</span><input type="number" name="interval" min="5" max="3600" value="${c.interval}"></label>` : ''}
    </div>
    ${relay ? '<p class="muted" style="margin:12px 0 0">Le relais est un petit service à installer sur votre réseau (dossier <span class="mono">connecteurs/</span>). Les identifiants de PRTG et des switchs y restent : ils ne sont jamais envoyés à cette page.</p>' : ''}
    <div id="src-state">${stateHtml()}</div>`;
}
Actions.sources = () => { draftType = null; openSources(); };
const openSources = () => Modal.open({
  title: 'Sources de données', ok: 'Appliquer', cancel: 'Fermer', body: `<div id="src-body">${body()}</div>`,
  onOk(v) {
    Object.assign(Live.cfg, { type: v.type, interval: Math.max(5, v.interval || Live.cfg.interval || 30) }, v.url != null ? { url: v.url, token: v.token || '' } : {});
    if (v.type === 'relais' && Live.cfg.url && !/^https?:\/\//.test(Live.cfg.url)) throw new Error('L\'adresse du relais doit commencer par http:// ou https://');
    Live.save();
    Promise.resolve(Live.start()).then(() => { toast(Live.state === 'ok' ? `Supervision active : ${plural(Live.matched, 'équipement reconnu', 'équipements reconnus')}` : Live.state === 'error' ? `Source en erreur : ${Live.error}` : 'Supervision arrêtée', Live.state === 'error' ? 'err' : 'ok'); });
    return true;
  },
});
Changes['src-type'] = el => { draftType = el.value; $('#src-body').innerHTML = body(); };
