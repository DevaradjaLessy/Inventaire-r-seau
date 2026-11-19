/* Synchronisation avec le serveur NetCarto (mode serveur uniquement).
   L'interface modifie d'abord ses données en mémoire, puis envoie au serveur la liste exacte
   des lignes créées, modifiées ou supprimées. Le serveur applique ce lot en une transaction :
   tout ou rien. Les lots partent un par un, dans l'ordre. */

/* Erreur renvoyée par le serveur : code = conflit | regle | invalide | http | reseau */
class ErreurServeur extends Error { constructor(code, message, statut = 0) { super(message); this.code = code; this.statut = statut; } }

const Sync = {
  api: null,            // préfixe de l'API (« /api/v1 »), ou null en mode démonstration
  etat: 'local',        // local | ok | envoi | horsligne
  enAttente: 0,         // lots pas encore confirmés par le serveur
  revision: 0,          // dernière révision de la base connue de cette page
  intervalle: 20000,    // délai entre deux vérifications de changements faits ailleurs (ms)
  file: Promise.resolve(), generation: 0, minuterie: 0,
  utilisateur: null,    // compte connecté : { id, identifiant, nom, role }
  surDeconnexion: null, // appelé quand le serveur signale que la session n'est plus valable
  surEtat: null,        // appelé à chaque changement d'état (branché par l'interface)
  surChangementExterne: null,   // appelé quand un autre poste a modifié la base

  poser(etat) { if (this.etat !== etat) { this.etat = etat; this.surEtat?.(etat); } },
  async appel(methode, chemin, corps) {
    let r;
    try { r = await fetch(this.api + chemin, { method: methode, headers: corps === undefined ? {} : { 'Content-Type': 'application/json' }, body: corps === undefined ? undefined : typeof corps === 'string' ? corps : JSON.stringify(corps) }); }
    catch { throw new ErreurServeur('reseau', 'Serveur injoignable : la modification n\'a pas été enregistrée.'); }
    let json = null;
    try { json = await r.json(); } catch { /* réponse sans JSON */ }
    // Session expirée ou fermée : l'interface demande une nouvelle connexion
    if (r.status === 401 && !chemin.startsWith('/session') && chemin !== '/initialisation') this.surDeconnexion?.();
    if (!r.ok) throw new ErreurServeur(json?.code || 'http', json?.erreur || `Le serveur a répondu ${r.status}.`, r.status);
    return json;
  },
  /* Charge toute la base */
  async charger() {
    const base = await this.appel('GET', '/base');
    this.revision = (await this.appel('GET', '/revision')).revision;
    this.poser('ok');
    return base;
  },
  /* Met une écriture dans la file. Si elle échoue, les écritures suivantes, bâties sur elle, sont abandonnées.
     Renvoie une promesse : résolue quand le serveur a confirmé, rejetée avec une ErreurServeur sinon. */
  enfiler(envoi) {
    const gen = this.generation;
    this.enAttente++; this.poser('envoi');
    const p = this.file.then(async () => {
      if (gen !== this.generation) throw new ErreurServeur('abandon', 'Modification abandonnée : une modification précédente a été refusée.');
      const r = await envoi();
      if (r && r.revision) this.revision = r.revision;
      return r;
    });
    this.file = p.then(() => {}, e => { if (e.code !== 'abandon') this.generation++; });
    return p.finally(() => { this.enAttente--; if (!this.enAttente && this.etat === 'envoi') this.poser('ok'); });
  },
  /* Le lot est mis en texte tout de suite : il décrit la base à cet instant, même s'il part plus tard (file d'attente) */
  envoyerLot(lot) { const texte = JSON.stringify(lot); return this.enfiler(() => this.appel('POST', '/lots', texte)); },
  remplacer(base) { return this.enfiler(() => this.appel('PUT', '/base', base)); },
  /* Vérifie régulièrement si un autre poste a modifié la base */
  surveiller() {
    clearInterval(this.minuterie);
    this.minuterie = setInterval(async () => {
      if (!this.api || this.enAttente || document.hidden) return;
      try {
        const { revision } = await this.appel('GET', '/revision');
        if (this.etat === 'horsligne') this.poser('ok');
        if (revision !== this.revision && !this.enAttente) this.surChangementExterne?.();
      } catch { this.poser('horsligne'); }
    }, this.intervalle);
  },
};

export { ErreurServeur, Sync };
