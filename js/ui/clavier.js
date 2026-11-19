/* Navigation au clavier : onglets (1 à 4), arbre (flèches), résultats de recherche (flèches, Entrée),
   éléments cliquables (Entrée, Espace), fenêtres (Tab reste dedans), aide (?). */
import { $, $$ } from '../utils.js';
import { Actions, Modal, showTab, TABS } from './socle.js';
import { Carto, select } from './carto/carto.js';

const RACCOURCIS = [
  ['1 à 4', 'Changer d\'onglet : Cartographie, Inventaire, Matériel, Tableau de bord'],
  ['/', 'Aller à la recherche'],
  ['↑ ↓', 'Parcourir l\'arbre, ou les résultats de la recherche'],
  ['→ ←', 'Dans l\'arbre : ouvrir ; refermer ou remonter au niveau supérieur'],
  ['Entrée', 'Choisir l\'élément sous le curseur ; valider une fenêtre'],
  ['Tab', 'Passer au bouton ou au champ suivant'],
  ['Ctrl + Z', 'Annuler la dernière modification'],
  ['Échap', 'Fermer la fenêtre ou la liste de résultats'],
  ['?', 'Afficher cette aide'],
];
Actions['aide-clavier'] = () => Modal.open({ title: 'Raccourcis clavier', ok: false, cancel: 'Fermer',
  body: `<div class="kb-list">${RACCOURCIS.map(([t, d]) => `<kbd>${t}</kbd><span>${d}</span>`).join('')}</div>` });

/* --- Arbre --- */
function arbre(e) {
  const noeud = e.target.closest('#tree .tn');
  if (!noeud) return false;
  const liste = $$('#tree .tn'), i = liste.indexOf(noeud), id = noeud.dataset.id, ouvrable = !!noeud.querySelector('.car[data-act]'), ouvert = Carto.open.has(id);
  const viser = el => { if (!el) return; for (const n of liste) n.tabIndex = -1; el.tabIndex = 0; el.focus(); el.scrollIntoView({ block: 'nearest' }); };
  const basculer = () => noeud.querySelector('.car[data-act]').click();   // l'arbre est redessiné : le curseur est remis par renderTree
  if (e.key === 'ArrowDown') viser(liste[i + 1]);
  else if (e.key === 'ArrowUp') viser(liste[i - 1]);
  else if (e.key === 'Home') viser(liste[0]);
  else if (e.key === 'End') viser(liste.at(-1));
  else if (e.key === 'ArrowRight') { if (ouvrable && !ouvert) basculer(); else if (ouvrable) viser(liste[i + 1]); }
  else if (e.key === 'ArrowLeft') {
    if (ouvrable && ouvert) basculer();
    else { const retrait = parseInt(noeud.style.paddingLeft, 10); viser(liste.slice(0, i).reverse().find(n => parseInt(n.style.paddingLeft, 10) < retrait)); }
  }
  else if (e.key === 'Enter' || e.key === ' ') select(id, { reveal: false });
  else return false;
  return true;
}
/* --- Résultats de la recherche globale --- */
function recherche(e) {
  if (e.target.id !== 'gsearch') return false;
  const items = $$('#gsearch-res .it'), actif = items.findIndex(x => x.classList.contains('actif'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    if (!items.length) return true;
    const n = e.key === 'ArrowDown' ? Math.min(items.length - 1, actif + 1) : Math.max(0, actif - 1);
    items.forEach((x, k) => x.classList.toggle('actif', k === n)); items[n].scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (e.key === 'Enter' && actif >= 0) { e.stopImmediatePropagation(); items[actif].click(); e.target.blur(); return true; }
  return false;
}
/* --- Fenêtre ouverte : Tab tourne entre ses champs et ses boutons --- */
function fenetre(e) {
  const m = $('#modal-root .modal');
  if (e.key !== 'Tab' || !m) return false;
  const f = $$('button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]', m).filter(x => x.offsetParent !== null);
  if (!f.length) return true;
  const i = f.indexOf(document.activeElement);
  f[e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i < 0 || i === f.length - 1 ? 0 : i + 1)].focus();
  return true;
}
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const saisie = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  if (fenetre(e) || recherche(e) || (!saisie && arbre(e))) { e.preventDefault(); return; }
  if (saisie || $('#modal-root').classList.contains('on')) return;
  // Élément cliquable qui n'est pas un bouton (ligne de tableau, carte) : Entrée ou Espace
  const el = e.target.closest?.('[data-act][tabindex]');
  if (el && (e.key === 'Enter' || e.key === ' ') && !/^(BUTTON|A)$/.test(el.tagName)) { e.preventDefault(); el.click(); return; }
  if (/^[1-4]$/.test(e.key) && TABS[+e.key - 1]) { e.preventDefault(); showTab(TABS[+e.key - 1].id); }
  else if (e.key === '?') { e.preventDefault(); Actions['aide-clavier'](); }
}, true);
