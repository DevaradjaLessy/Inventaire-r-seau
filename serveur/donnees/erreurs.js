/* Erreurs attendues de la couche de données. Le code indique la nature du refus :
   invalide (demande mal formée, 400), conflit (la base a changé entre-temps, 409),
   regle (contrainte ou règle métier non respectée, 422), acces (connexion requise ou refusée, 401),
   interdit (rôle insuffisant, 403), introuvable (404), verrouille (compte verrouillé, 429). */
'use strict';

const STATUT = { invalide: 400, acces: 401, interdit: 403, introuvable: 404, conflit: 409, regle: 422, verrouille: 429 };
class ErreurMetier extends Error {
  constructor(code, message) { super(message); this.name = 'ErreurMetier'; this.code = code; this.statut = STATUT[code] || 400; }
}
/* Contraintes de la base → message en clair */
const UNICITE = [
  [/ux_equipements_ip|equipements\.ip/, 'Adresse IP déjà utilisée par un autre équipement'],
  [/ux_equipements_mac|equipements\.mac/, 'Adresse MAC déjà utilisée par un autre équipement'],
  [/ux_equipements_nom|equipements\.nom_hote/, 'Nom d\'hôte déjà utilisé par un autre équipement'],
  [/ux_prises_repere|prises\.repere/, 'Repère de prise déjà utilisé'],
  [/ux_baies_nom|baies\.nom/, 'Nom de baie déjà utilisé'],
  [/ux_batiments_code|batiments\.code/, 'Code de bâtiment déjà utilisé sur ce site'],
  [/ux_etages_niveau|etages\.niveau/, 'Ce niveau existe déjà dans le bâtiment'],
  [/ux_utilisateurs_identifiant|utilisateurs\.identifiant/, 'Identifiant déjà utilisé par un autre compte'],
  [/ux_ports_rang|ux_ports_nom|ports\.(idx|nom)/, 'Deux ports du même équipement ont le même nom ou le même rang'],
];
const CONTROLE = {
  ck_utilisateur_role: 'Rôle inconnu (attendu : lecture, technicien ou administrateur)', ck_utilisateur_identifiant: 'Identifiant trop court',
  ck_stock_disponible: 'Le stock disponible ne peut pas être négatif', ck_stock_seuil: 'Le seuil d\'alerte du stock ne peut pas être négatif',
  ck_statut: 'Statut inconnu (attendu : active, maintenance, fault ou retired)', ck_vlan_numero: 'Numéro de VLAN attendu entre 1 et 4094',
  ck_port_etat: 'État de port inconnu (attendu : up, down, disabled ou error)', ck_port_type: 'Type de port inconnu (attendu : rj45, sfp, sfp+ ou lc)', ck_port_role: 'Rôle de port inconnu (attendu : access, uplink ou pp)',
  ck_port_poe: 'La puissance PoE ne peut pas être négative', ck_prise_usage: 'Usage de prise inconnu', ck_cable_type: 'Type de câble inconnu', ck_cable_longueur: 'La longueur d\'un câble ne peut pas être négative',
  ck_cable_extremites: 'Chaque extrémité d\'un câble doit être un port ou une prise', ck_catalogue_categorie: 'Catégorie de matériel inconnue', ck_catalogue_hauteur: 'La hauteur en U ne peut pas être négative',
  ck_equipement_emplacement: 'Un équipement est soit en baie, soit dans une pièce, pas les deux', ck_equipement_u: 'Un équipement en baie doit avoir une position en U, et seulement dans ce cas',
  ck_etage_dimensions: 'Les dimensions d\'un étage doivent être positives', ck_piece_dimensions: 'Les dimensions d\'une pièce doivent être positives', ck_baie_hauteur: 'La hauteur d\'une baie doit être positive', ck_groupe_nombre: 'Un groupe de ports doit compter au moins un port',
};
/* Convertit une erreur du moteur SQL en ErreurMetier ; renvoie null si ce n'est pas une contrainte */
function traduire(e, contexte = '') {
  const m = String(e && e.message || ''), suffixe = contexte ? ` (${contexte})` : '';
  if (/UNIQUE constraint failed/.test(m)) {
    if (/^UNIQUE constraint failed: \w+\.(id|catalogue_id|cle)$/.test(m)) return new ErreurMetier('conflit', `Cet élément existe déjà${suffixe}.`);
    const u = UNICITE.find(([re]) => re.test(m));
    return new ErreurMetier('regle', `${u ? u[1] : 'Valeur déjà utilisée'}${suffixe}.`);
  }
  if (/CHECK constraint failed/.test(m)) { const nom = /CHECK constraint failed: (\w+)/.exec(m)?.[1]; return new ErreurMetier('regle', `${CONTROLE[nom] || 'Valeur refusée par la base'}${suffixe}.`); }
  if (/NOT NULL constraint failed/.test(m)) return new ErreurMetier('regle', `Valeur obligatoire manquante${suffixe}.`);
  if (/FOREIGN KEY constraint failed/.test(m)) return new ErreurMetier('regle', `Référence introuvable, ou élément encore référencé${suffixe}.`);
  if (/cannot store|datatype mismatch/.test(m)) return new ErreurMetier('invalide', `Type de valeur inattendu${suffixe}.`);
  return null;
}
module.exports = { ErreurMetier, traduire };
