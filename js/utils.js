/* Utilitaires : DOM, formatage, générateur pseudo-aléatoire, téléchargement, couleurs. */
import { PREFIX_TYPE } from './config.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const pad2 = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const fmtDate = s => s ? s.split('-').reverse().join('/') : '—';
const fmtDateTime = ts => { const d = new Date(ts); return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const fmtSpeed = m => !m ? '—' : m >= 1000 ? `${+(m / 1000).toFixed(1)} Gb/s` : `${m} Mb/s`;
const pct = (a, b) => b ? Math.round(a * 100 / b) : 0;
const plural = (n, one, many) => `${n} ${n > 1 ? (many || one + 's') : one}`;
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const sum = (arr, f) => arr.reduce((t, x) => t + (f ? f(x) : x), 0);
const groupBy = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); (m.get(k) || m.set(k, []).get(k)).push(x); } return m; };

/* Générateur pseudo-aléatoire déterministe (graine fixe → mêmes données à chaque fois) */
function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/* Téléchargement d'un fichier généré dans le navigateur */
function download(name, content, mime = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type: mime + ';charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
/* Identifiant unique dans toute la base : préfixe + compteur global */
let idsAleatoires = false;
/* En mode serveur, plusieurs postes créent des objets en même temps : les identifiants sont tirés au hasard */
const setRandomIds = v => { idsAleatoires = !!v; };
const hasard = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');
const nextId = (db, prefix) => (idsAleatoires ? `${prefix}-${hasard()}` : `${prefix}-${(++db.meta.seq).toString(36)}`);
const typeOf = id => PREFIX_TYPE[String(id).slice(0, String(id).indexOf('-'))];
/* Couleur plus claire ou plus sombre (f > 0 éclaircit, f < 0 assombrit) */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255;
  const t = f < 0 ? 0 : 255, k = Math.abs(f);
  r = Math.round(r + (t - r) * k); g = Math.round(g + (t - g) * k); b = Math.round(b + (t - b) * k);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
const luminance = hex => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255; };

export { $, $$, clamp, download, esc, fmtDate, fmtDateTime, fmtSpeed, groupBy, luminance, mulberry32, nextId, norm, pad2, pct, plural, setRandomIds, shade, sum, today, typeOf };
