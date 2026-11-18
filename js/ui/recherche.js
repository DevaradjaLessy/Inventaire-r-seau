/* Recherche globale de l'en-tête. */
import { $, esc } from '../utils.js';
import { ico } from '../icones.js';
import { search } from '../services/recherche.js';
import { Actions, showTab, UI } from './socle.js';
import { Inv } from './inventaire.js';

/* --- Recherche globale de l'en-tête --- */
function renderGSearch() {
  const box = $('#gsearch-res'), q = $('#gsearch').value, res = search(q, 5);
  if (q.trim().length < 2) { box.classList.add('hidden'); return; }
  box.innerHTML = res.length ? res.map(g => `<div class="grp">${g.name}${g.total > g.items.length ? ` — ${g.items.length} sur ${g.total}` : ''}</div>${g.items.map(i => `<div class="it" data-act="gs-go" data-id="${i.id}">${ico(i.icon)}<span>${esc(i.label)}</span><small>${esc(i.sub)}</small></div>`).join('')}`).join('') + `<div class="it" data-act="gs-all" style="border-top:1px solid var(--line)">${ico('list')}<span>Voir tous les résultats dans l'Inventaire</span><small>Entrée</small></div>` : '<div class="empty">Aucun résultat</div>';
  box.classList.remove('hidden');
}
$('#gsearch').addEventListener('input', renderGSearch);
$('#gsearch').addEventListener('focus', renderGSearch);
$('#gsearch').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); Actions['gs-all'](); } });
Actions['gs-go'] = el => { $('#gsearch-res').classList.add('hidden'); Actions.go(el); };
Actions['gs-all'] = () => { Object.assign(Inv, { q: $('#gsearch').value, type: '', bld: '', status: '', brand: '', page: 0 }); $('#gsearch-res').classList.add('hidden'); $('#gsearch').blur(); UI.dirty.add('inv'); showTab('inv'); };
