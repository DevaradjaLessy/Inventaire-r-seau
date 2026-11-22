/* Accès aux tables des comptes : utilisateurs, sessions et journal d'audit.
   Les règles (mots de passe, verrouillage, rôles) sont dans securite/ ; ici, seulement la lecture et l'écriture. */
'use strict';
const { ErreurMetier, traduire } = require('./erreurs');

const json = v => (v === null || v === undefined ? null : JSON.stringify(v));
const objet = t => (t === null ? null : JSON.parse(t));

function creerComptes(p) {
  const ecrire = fn => { try { return fn(); } catch (e) { if (e instanceof ErreurMetier) throw e; throw traduire(e) || e; } };
  return {
    nombre: () => p.un('SELECT COUNT(*) AS n FROM utilisateurs').n,
    nombreAdministrateurs: () => p.un('SELECT COUNT(*) AS n FROM utilisateurs WHERE role = \'administrateur\' AND actif = 1').n,
    parIdentifiant: identifiant => p.un('SELECT * FROM utilisateurs WHERE identifiant = ? COLLATE NOCASE', [String(identifiant)]),
    parCourriel: courriel => (courriel ? p.un('SELECT * FROM utilisateurs WHERE courriel = ? COLLATE NOCASE', [String(courriel)]) : null),
    parId: id => p.un('SELECT * FROM utilisateurs WHERE id = ?', [String(id)]),
    lister: () => p.tous('SELECT * FROM utilisateurs ORDER BY identifiant COLLATE NOCASE'),
    creer: u => ecrire(() => p.lancer('INSERT INTO utilisateurs (id, identifiant, nom, courriel, role, mot_de_passe, actif, cree_le) VALUES (?, ?, ?, ?, ?, ?, 1, ?)', [u.id, u.identifiant, u.nom, u.courriel || '', u.role, u.mot_de_passe, u.cree_le])),
    /* champs : objet { colonne: valeur } parmi les colonnes modifiables */
    modifier(id, champs) {
      const permis = ['nom', 'courriel', 'role', 'mot_de_passe', 'actif', 'echecs', 'verrouille_jusqu_a', 'derniere_connexion'], cols = Object.keys(champs).filter(k => permis.includes(k));
      if (cols.length) ecrire(() => p.lancer(`UPDATE utilisateurs SET ${cols.map(c => c + ' = ?').join(', ')} WHERE id = ?`, [...cols.map(c => champs[c]), id]));
    },
    supprimer: id => p.lancer('DELETE FROM utilisateurs WHERE id = ?', [id]),
    // Sessions
    creerSession: (jeton, utilisateurId, date, ip) => p.lancer('INSERT INTO sessions (jeton, utilisateur_id, creee_le, vue_le, ip) VALUES (?, ?, ?, ?, ?)', [jeton, utilisateurId, date, date, ip || '']),
    session: jeton => p.un('SELECT s.creee_le, s.vue_le, u.* FROM sessions s JOIN utilisateurs u ON u.id = s.utilisateur_id WHERE s.jeton = ?', [jeton]),
    toucherSession: (jeton, date) => p.lancer('UPDATE sessions SET vue_le = ? WHERE jeton = ?', [date, jeton]),
    supprimerSession: jeton => p.lancer('DELETE FROM sessions WHERE jeton = ?', [jeton]),
    supprimerSessionsDe: (utilisateurId, sauf = '') => p.lancer('DELETE FROM sessions WHERE utilisateur_id = ? AND jeton <> ?', [utilisateurId, sauf]),
    nombreSessionsDe: utilisateurId => p.un('SELECT COUNT(*) AS n FROM sessions WHERE utilisateur_id = ?', [utilisateurId]).n,
    /* Ne garde que les sessions les plus récentes d'un compte */
    plafonnerSessions: (utilisateurId, garder) => p.lancer('DELETE FROM sessions WHERE utilisateur_id = ? AND jeton NOT IN (SELECT jeton FROM sessions WHERE utilisateur_id = ? ORDER BY creee_le DESC, rowid DESC LIMIT ?)', [utilisateurId, utilisateurId, garder]),
    purgerSessions: avant => p.lancer('DELETE FROM sessions WHERE vue_le < ?', [avant]),
    // Liens de réinitialisation du mot de passe (empreinte du jeton, jamais le jeton)
    creerReinitialisation: (jeton, utilisateurId, date, expire, origine) => p.lancer('INSERT INTO reinitialisations (jeton, utilisateur_id, cree_le, expire_le, origine) VALUES (?, ?, ?, ?, ?)', [jeton, utilisateurId, date, expire, origine]),
    reinitialisation: jeton => p.un('SELECT * FROM reinitialisations WHERE jeton = ?', [jeton]),
    supprimerReinitialisationsDe: utilisateurId => p.lancer('DELETE FROM reinitialisations WHERE utilisateur_id = ?', [utilisateurId]),
    purgerReinitialisations: avant => p.lancer('DELETE FROM reinitialisations WHERE expire_le < ?', [avant]),
    // Journal d'audit
    ajouterAudit: a => p.lancer('INSERT INTO audit (date, utilisateur_id, identifiant, action, collection, cle, libelle, avant, apres, lot, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [a.date, a.utilisateur_id || null, a.identifiant || '', a.action, a.collection || '', a.cle || '', a.libelle || '', json(a.avant), json(a.apres), a.lot ?? null, a.ip || '']),
    /* filtres : { cle, collection, identifiant, action, avant (identifiant de ligne), limite } ; du plus récent au plus ancien */
    listerAudit(f = {}) {
      const ou = [], params = [];
      for (const k of ['cle', 'collection', 'identifiant', 'action']) if (f[k] !== undefined && f[k] !== '') { ou.push(`${k} = ?${k === 'identifiant' ? ' COLLATE NOCASE' : ''}`); params.push(String(f[k])); }
      if (f.avant) { ou.push('id < ?'); params.push(+f.avant); }
      const limite = Math.min(500, Math.max(1, +f.limite || 100));
      return p.tous(`SELECT * FROM audit${ou.length ? ' WHERE ' + ou.join(' AND ') : ''} ORDER BY id DESC LIMIT ${limite}`, params)
        .map(l => ({ id: l.id, date: l.date, identifiant: l.identifiant, action: l.action, collection: l.collection, cle: l.cle, libelle: l.libelle, avant: objet(l.avant), apres: objet(l.apres), lot: l.lot, ip: l.ip }));
    },
    /* Nombre d'entrées d'une action donnée depuis une date, et nombre de sessions vues depuis une date */
    compterAudit: (action, depuis) => p.un('SELECT COUNT(*) AS n FROM audit WHERE action = ? AND date >= ?', [action, depuis]).n,
    compterAuditDe: (action, cle, depuis) => p.un('SELECT COUNT(*) AS n FROM audit WHERE action = ? AND cle = ? AND date >= ?', [action, String(cle), depuis]).n,
    nombreSessions: depuis => p.un('SELECT COUNT(*) AS n FROM sessions WHERE vue_le >= ?', [depuis]).n,
    /* Identifiant de la dernière personne à avoir modifié un élément (pour expliquer un conflit) */
    dernierAuteur: (collection, cle) => p.un('SELECT identifiant FROM audit WHERE collection = ? AND cle = ? AND identifiant <> \'\' ORDER BY id DESC LIMIT 1', [collection, String(cle)])?.identifiant || null,
  };
}
module.exports = { creerComptes };
