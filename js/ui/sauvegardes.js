/* Mode serveur — rubrique « Sauvegardes » de la page d'administration : liste, sauvegarde immédiate, téléchargement, restauration. */
import { $, esc, fmtDateTime, plural } from '../utils.js';
import { ico } from '../icones.js';
import { Store } from '../store.js';
import { Sync } from '../sync.js';
import { Actions, Modal, toast } from './socle.js';

const MOTIFS = { auto: 'Automatique', manuelle: 'Manuelle', 'avant-restauration': 'Avant restauration' };
const motif = m => MOTIFS[m] || (m.startsWith('avant-migration') ? 'Avant mise à jour' : m);
const taille = n => (n > 1048576 ? `${(n / 1048576).toFixed(1)} Mo` : `${Math.ceil(n / 1024)} Ko`);
const erreur = e => toast(e.message, 'err');

async function charger() {
  const { reglages, liste } = await Sync.appel('GET', '/sauvegardes');
  if (!$('#sv-list')) return;
  $('#sv-reglages').innerHTML = reglages.actif
    ? `Sauvegarde automatique <b>chaque jour à ${esc(reglages.heure)}</b> ; les ${plural(reglages.conserver, 'dernière')} sont gardées. Les autres sauvegardes restent jusqu'à ce que vous les supprimiez.`
    : 'La sauvegarde automatique est <b>désactivée</b> dans les réglages du serveur.';
  $('#sv-list').innerHTML = liste.map(s => `<div class="sv-row" data-nom="${esc(s.nom)}">
      <b>${fmtDateTime(s.date)}</b><div><span class="chip">${esc(motif(s.motif))}</span> <span class="nom">${esc(s.nom)}</span></div><span class="muted">${taille(s.taille)}</span>
      <div class="row" style="gap:4px;justify-content:flex-end"><a class="btn sm" href="${esc(Sync.api)}/sauvegardes/${encodeURIComponent(s.nom)}" download="${esc(s.nom)}" data-tip="Télécharger|Pour garder une copie hors du serveur">${ico('download')}</a>
        <button class="btn sm" data-act="sv-restaurer">Restaurer</button><button class="btn sm icon danger" data-act="sv-supprimer" data-tip="Supprimer">${ico('trash')}</button></div></div>`).join('') || '<div class="empty">Aucune sauvegarde pour l\'instant.</div>';
}
const corpsSauvegardes = () => `<p class="muted" id="sv-reglages" style="margin:0 0 12px">Chargement…</p>
      <div class="row" style="margin-bottom:8px;flex-wrap:wrap"><button class="btn pri" data-act="sv-creer">${ico('download')}Sauvegarder maintenant</button>
        <span class="muted" style="flex:1 1 240px">Une sauvegarde contient toute la base : téléchargez-en une de temps en temps pour la garder ailleurs que sur le serveur.</span></div>
      <div id="sv-list"><div class="empty">Chargement…</div></div>`;
const nomDe = el => el.closest('.sv-row').dataset.nom;
Actions['sv-creer'] = () => Sync.appel('POST', '/sauvegardes', {}).then(() => { toast('Sauvegarde faite', 'ok'); return charger(); }).catch(erreur);
Actions['sv-supprimer'] = el => { const nom = nomDe(el); Modal.confirm('Supprimer la sauvegarde', `Supprimer définitivement <b>${esc(nom)}</b> ?`, () => { Sync.appel('DELETE', '/sauvegardes/' + encodeURIComponent(nom)).then(() => { toast('Sauvegarde supprimée', 'ok'); Actions['compte-sauvegardes'](); }, e => { erreur(e); Actions['compte-sauvegardes'](); }); return false; }, 'Supprimer', 'danger'); };
Actions['sv-restaurer'] = el => {
  const nom = nomDe(el);
  Modal.confirm('Restaurer une sauvegarde', `Les données d'inventaire (sites, baies, équipements, câblage, catalogue, stock) reviennent à l'état de <b>${esc(nom)}</b>.
      Tout ce qui a été saisi depuis sera remplacé.<br><br>Les comptes et le journal d'audit sont conservés. L'état actuel est sauvegardé juste avant, sous le nom « Avant restauration ».`,
  () => {
    Sync.appel('POST', '/sauvegardes/restauration', { nom }).then(async () => { await Store.recharger(); toast('Inventaire restauré depuis la sauvegarde', 'ok'); Actions['compte-sauvegardes'](); }, e => { erreur(e); Actions['compte-sauvegardes'](); });
    return false;
  }, 'Restaurer', 'danger');
};

export { charger as chargerSauvegardes, corpsSauvegardes };
