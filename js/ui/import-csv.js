/* Inventaire — import CSV d'équipements ou de prises : choix du fichier, aperçu ligne par ligne, puis import. */
import { $, download, esc, plural } from '../utils.js';
import { ico } from '../icones.js';
import { Store } from '../store.js';
import { analyserCsv, importerCsv, MODELES } from '../services/import-csv.js';
import { Actions, Changes, Modal, run, toast, undoAction } from './socle.js';

const VISIBLES = 200;   // lignes affichées au plus par groupe dans l'aperçu
const Csv = { texte: null, nom: '', analyse: null };
const NOMS = { equipements: ['équipement', 'Équipements'], prises: ['prise', 'Prises murales'] };

/* Décode le fichier : UTF-8, sinon Windows-1252 (enregistrement « CSV » d'Excel) */
function decoder(tampon) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(tampon); } catch (e) { return new TextDecoder('windows-1252').decode(tampon); }
}
function rapport() {
  const a = Csv.analyse, ok = $('#modal-root [data-act=modal-ok]'), type = $('#csv-type').value;
  const bons = a ? a.lignes.filter(l => l.ok) : [], refus = a ? a.lignes.filter(l => !l.ok) : [];
  ok.disabled = !bons.length;
  ok.textContent = bons.length ? `Importer ${plural(bons.length, NOMS[type][0])}` : 'Importer';
  if (!a) { $('#csv-rapport').innerHTML = ''; return; }
  if (a.erreur) { $('#csv-rapport').innerHTML = `<div class="avert">${esc(a.erreur)}</div>`; return; }
  const ligne = l => `<div class="csv-l ${l.ok ? 'ok' : 'ko'}"><span class="n">Ligne ${l.n}</span><b>${esc(l.libelle)}</b><span class="m">${l.ok ? 'Prête' : l.erreurs.map(esc).join(' · ')}</span></div>`;
  const groupe = (titre, lignes) => lignes.length ? `<div class="sec-t">${titre}</div>${lignes.slice(0, VISIBLES).map(ligne).join('')}${lignes.length > VISIBLES ? `<div class="muted">… et ${lignes.length - VISIBLES} autres</div>` : ''}` : '';
  $('#csv-rapport').innerHTML = `<div class="csv-bilan"><span class="chip"><span class="dot" style="background:var(--up)"></span>${plural(bons.length, 'ligne')} prête${bons.length > 1 ? 's' : ''}</span>
      <span class="chip"><span class="dot" style="background:var(--crit)"></span>${plural(refus.length, 'ligne')} refusée${refus.length > 1 ? 's' : ''}</span>
      <span class="muted">${esc(Csv.nom)}${a.ignorees.length ? ` — colonnes ignorées : ${esc(a.ignorees.join(', '))}` : ''}</span></div>
    ${groupe('Lignes refusées (elles ne seront pas importées)', refus)}${groupe('Lignes prêtes', bons)}`;
}
const analyser = () => { Csv.analyse = Csv.texte === null ? null : analyserCsv(Csv.texte, $('#csv-type').value); rapport(); };

Actions['csv-import'] = () => {
  Store.autoriser();
  Object.assign(Csv, { texte: null, nom: '', analyse: null });
  Modal.open({
    title: 'Importer un fichier CSV', wide: true, ok: 'Importer',
    body: `<div class="form-grid">
        <label class="f"><span>Contenu du fichier</span><select id="csv-type" data-chg="csv-type">${Object.entries(NOMS).map(([k, v]) => `<option value="${k}">${v[1]}</option>`).join('')}</select></label>
        <label class="f"><span>Fichier CSV (séparateur ; ou ,)</span><input type="file" id="csv-file" data-chg="csv-file" accept=".csv,text/csv,text/plain"></label></div>
      <p class="muted" style="margin:10px 0">Chaque ligne est vérifiée avant l'import : modèle du catalogue, emplacement, doublons de nom, d'adresse IP, d'adresse MAC et de repère.
        Les lignes refusées sont expliquées et laissées de côté ; les autres sont importées en une seule opération, annulable. Le stock n'est pas modifié.
        <button class="btn sm" data-act="csv-modele">${ico('download')}Modèle de fichier</button></p>
      <div id="csv-rapport"></div>`,
    onOpen: () => rapport(),
    onOk() {
      const n = importerCsv(Csv.analyse), refus = Csv.analyse.lignes.length - n, type = Csv.analyse.type;
      toast(`${plural(n, NOMS[type][0])} importé${type === 'prises' ? 'e' : ''}${n > 1 ? 's' : ''}${refus ? `, ${plural(refus, 'ligne')} laissée${refus > 1 ? 's' : ''} de côté` : ''}`, 'ok', undoAction);
      return true;
    },
  });
};
Changes['csv-type'] = () => analyser();
Changes['csv-file'] = el => {
  const f = el.files[0];
  if (!f) return;
  if (f.size > 5e6) throw new Error('Fichier trop volumineux (5 Mo au plus).');
  f.arrayBuffer().then(t => run(() => { Csv.texte = decoder(t); Csv.nom = f.name; analyser(); }));
};
Actions['csv-modele'] = () => { const type = $('#csv-type').value; download(`netcarto-modele-${type}.csv`, '﻿' + MODELES[type], 'text/csv'); };
