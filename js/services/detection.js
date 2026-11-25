/* Services — détection : ce que la supervision sait de l'appareil branché au bout d'un port de switch.
   Deux indices viennent du switch : les adresses MAC qu'il a apprises sur le port, et le voisin qui s'y annonce (LLDP : nom, port,
   description, famille). NetCarto les rapproche de l'inventaire, et déduit la famille du nom quand l'appareil ne la dit pas.
   Rien n'est écrit dans la base : c'est une lecture, présentée à côté de ce qui est saisi. */
import { CATEGORIES, FAMILLES_VUES, NOMENCLATURE } from '../config.js';
import { Cache, Store } from '../store.js';
import { measuredPort } from './mesures.js';
import { normMac } from './doublons.js';

const court = nom => String(nom || '').trim().toLowerCase().split('.')[0];
/* Famille d'un appareil d'après son nom, selon la nomenclature ; '' si aucune règle ne convient */
const familleDapresNom = nom => NOMENCLATURE.find(([, motif]) => motif.test(String(nom || '').trim()))?.[0] || '';
const nomFamille = f => (CATEGORIES[f]?.one || FAMILLES_VUES[f] || '');
const parMac = () => Cache.get('det:mac', () => new Map(Store.db.devices.filter(d => d.mac && d.status !== 'retired').map(d => [normMac(d.mac) || d.mac, d])));
const parNom = () => Cache.get('det:nom', () => new Map(Store.db.devices.filter(d => d.hostname && d.status !== 'retired').map(d => [court(d.hostname), d])));

/* Ce que le switch voit sur ce port, ou null sans mesure.
   { mesure, adresses: [{ mac, equipement }], plusieurs (le port mène à un autre switch),
     voisin: { nom, port, description, famille, origine: 'annonce' | 'nom' | '', equipement } | null,
     equipement : l'équipement de l'inventaire reconnu (par le nom annoncé, sinon par une adresse), ou null } */
function vuSurLePort(portId) {
  const m = measuredPort(portId); if (!m) return null;
  const plusieurs = m.macCount > m.macs.length, adresses = plusieurs ? [] : m.macs.map(mac => ({ mac, equipement: parMac().get(normMac(mac) || mac) || null }));
  let voisin = null;
  if (m.voisin) {
    const famille = m.voisin.famille || familleDapresNom(m.voisin.nom);
    voisin = { ...m.voisin, famille, origine: m.voisin.famille ? 'annonce' : famille ? 'nom' : '', equipement: parNom().get(court(m.voisin.nom)) || null };
  }
  return { mesure: m, adresses, plusieurs, voisin, equipement: voisin?.equipement || adresses.find(a => a.equipement)?.equipement || null };
}

export { familleDapresNom, nomFamille, vuSurLePort };
