// ════════════════════════════════════════════════════════════════════════════
// sync.js — FUSION CHAMP PAR CHAMP ENTRE APPAREILS
//
// Avant ce fichier, la synchronisation était un REMPLACEMENT : `syncPull()`
// écrasait l'état local par celui du cloud, et `syncPush()` écrasait le cloud
// par l'état local. Les deux tournaient automatiquement — la récupération à
// chaque retour sur l'application, l'envoi cinq secondes après chaque saisie.
// Sur deux appareils utilisés le même jour, le dernier à écrire gagnait TOUT :
// une soirée de saisie sur le téléphone disparaissait parce que l'ordinateur,
// resté ouvert sur des données plus vieilles, avait renvoyé sa version.
//
// Ici, on fusionne FEUILLE PAR FEUILLE. Chaque valeur terminale (un montant de
// mois, un champ de relevé, un réglage) porte une date de dernière écriture, et
// la fusion garde la plus récente des deux. Une valeur qu'un seul côté possède
// est conservée — jamais perdue parce que l'autre côté l'ignorait.
//
// ── Ce que « feuille » veut dire ───────────────────────────────────────────
// L'état est un arbre. Les chemins sont des listes de segments, sérialisés avec
// un séparateur que l'utilisateur ne peut pas taper (U+001F), parce qu'un nom
// de catégorie peut contenir n'importe quoi — « Eau / Égouts » inclus.
//
// Les tableaux ne se fusionnent pas tous de la même façon, et c'est la seule
// subtilité du fichier :
//
//   • tableau d'objets qui ont tous un `id` (trajets, baux, biens, règles) →
//     indexé par `id`. Deux appareils qui ajoutent chacun un trajet gardent les
//     deux ; indexer par position les aurait fait s'écraser l'un l'autre.
//   • tableau de scalaires (les 12 mois d'une catégorie) → indexé par POSITION.
//     La position est l'information : janvier reste janvier.
//   • tableau déclaré dans `SYNC_SETS` (les empreintes d'import) → ensemble,
//     fusionné par union. L'ordre n'y veut rien dire et deux appareils peuvent
//     en ajouter chacun de leur côté.
//   • tout autre tableau (journaux d'ajouts, parts d'une ventilation) → UNE
//     seule feuille, c'est-à-dire le dernier écrivain gagne sur le tableau
//     entier. Ces tableaux sont dérivés ou en ajout seul ; les découper
//     n'apporterait rien et demanderait une clé stable qu'ils n'ont pas.
//
// ── Suppressions ──────────────────────────────────────────────────────────
// Sans trace, une suppression est indistinguable d'une absence : l'autre
// appareil, qui possède encore l'élément, le ressuscite à la fusion suivante.
// Chaque suppression laisse donc une PIERRE TOMBALE datée (`meta.sup`), et un
// élément distant n'est ressuscité que si sa dernière écriture est postérieure
// à la tombale.
//
// ── Données écrites avant cette version ───────────────────────────────────
// Elles n'ont aucune date. Elles valent alors zéro — « vieux, origine
// inconnue » — et la fusion devient une UNION : tout ce qui existe d'un côté ou
// de l'autre est gardé, et en cas de valeurs différentes c'est le local qui
// reste, le conflit étant signalé. C'est le comportement voulu pour la toute
// première fusion : les données déjà présentes sur le téléphone ne peuvent pas
// disparaître, même si le cloud contient autre chose.
//
// ── Limite assumée ────────────────────────────────────────────────────────
// Les dates viennent de l'horloge de l'appareil qui écrit. Un appareil dont
// l'horloge est fausse de deux jours gagnera les arbitrages pendant deux jours.
// Il n'y a pas de remède local à cela ; ce qui est garanti, c'est qu'aucune
// valeur ne disparaît (union) et que tout arbitrage serré est listé dans
// `conflits` pour être montré à l'utilisateur.
// ════════════════════════════════════════════════════════════════════════════

const SYNC_SEP = '\u001f'

// Tableaux traités comme des ensembles : union, l'ordre et la position ne
// portent aucun sens. `importHashes` est le registre anti-doublon de l'import
// bancaire — deux appareils qui importent chacun un relevé doivent cumuler.
const SYNC_SETS = ['importHashes']

// Hors fusion. Les photos de reçus sont des `data:` de plusieurs centaines de
// kilo-octets : elles ne passent pas par le document de synchronisation (limite
// d'un mégaoctet par document Firestore) et suivent leur propre chemin.
const SYNC_SKIP = ['receipts']

function syncPath(segments) { return segments.join(SYNC_SEP) }
function syncSegments(chemin) { return chemin.split(SYNC_SEP) }
// Pour l'affichage d'un conflit : « p1090 › revenus › Coloc 1 › 3 ».
function syncPathTexte(chemin) { return syncSegments(chemin).join(' › ') }

function syncEstScalaire(v) {
  return v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
}
function syncEstObjet(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}
function syncTableauIndexe(a) {
  return a.length > 0 && a.every(x => syncEstObjet(x) && x.id != null && x.id !== '')
}
function syncTableauScalaire(a) {
  return a.every(syncEstScalaire)
}
// « Vide » = aucune information. Une cellule vide ne défend pas sa place contre
// une valeur : voir la règle d'effacement dans syncFusionner().
function syncEstVide(v) {
  return v === null || v === undefined || v === '' ||
         (syncEstObjet(v) && !Object.keys(v).length) ||
         (Array.isArray(v) && !v.length)
}

// ── Aplatissement ──────────────────────────────────────────────────────────
// Rend { chemin → valeur } pour les feuilles, et la liste des conteneurs
// rencontrés avec leur nature, dont la fusion a besoin pour reconstruire.
function syncAplatir(valeur, chemin, sortie) {
  chemin = chemin || []
  sortie = sortie || {}
  const nom = chemin[chemin.length - 1]

  if (chemin.length && SYNC_SKIP.includes(chemin[0])) return sortie

  if (Array.isArray(valeur)) {
    if (SYNC_SETS.includes(nom)) {
      // Un membre = une feuille, la valeur étant portée par le chemin lui-même.
      valeur.forEach(v => { if (syncEstScalaire(v)) sortie[syncPath(chemin.concat(String(v)))] = true })
      return sortie
    }
    if (syncTableauIndexe(valeur)) {
      valeur.forEach(item => syncAplatir(item, chemin.concat(String(item.id)), sortie))
      return sortie
    }
    if (syncTableauScalaire(valeur)) {
      valeur.forEach((v, i) => { sortie[syncPath(chemin.concat(String(i)))] = v })
      return sortie
    }
    sortie[syncPath(chemin)] = valeur   // tableau opaque : une seule feuille
    return sortie
  }

  if (syncEstObjet(valeur)) {
    const cles = Object.keys(valeur)
    if (!cles.length && chemin.length) sortie[syncPath(chemin)] = {}  // objet vide : une feuille
    else cles.forEach(k => syncAplatir(valeur[k], chemin.concat(k), sortie))
    return sortie
  }

  if (chemin.length) sortie[syncPath(chemin)] = valeur === undefined ? null : valeur
  return sortie
}

// ── Écriture et suppression par chemin ─────────────────────────────────────
// `modele` sert uniquement à choisir la forme d'un conteneur à créer : si le
// chemin existe chez celui qui gagne, c'est sa forme qui fait foi. Sans lui, un
// segment numérique serait ambigu (index de tableau ou clé d'objet ?).
function syncValeurA(obj, segments) {
  let cur = obj
  for (const seg of segments) {
    if (cur == null) return undefined
    if (Array.isArray(cur)) {
      const parent = cur
      if (/^\d+$/.test(seg) && syncTableauScalaire(parent)) cur = parent[+seg]
      else cur = parent.find(x => syncEstObjet(x) && String(x.id) === seg)
    } else if (syncEstObjet(cur)) {
      cur = cur[seg]
    } else return undefined
  }
  return cur
}

function syncEcrireA(cible, chemin, valeur, modele) {
  const segs = syncSegments(chemin)
  let cur = cible
  for (let i = 0; i < segs.length - 1; i++) {
    const seg = segs[i]
    const prefixe = segs.slice(0, i + 1)
    if (Array.isArray(cur)) {
      if (SYNC_SETS.includes(segs[i - 1])) return   // un membre d'ensemble n'a pas d'enfant
      if (/^\d+$/.test(seg) && syncTableauScalaire(cur)) {
        if (cur[+seg] == null) cur[+seg] = null
        cur = cur[+seg]
      } else {
        let item = cur.find(x => syncEstObjet(x) && String(x.id) === seg)
        if (!item) { item = { id: seg }; cur.push(item) }
        cur = item
      }
    } else if (syncEstObjet(cur)) {
      if (cur[seg] == null || syncEstScalaire(cur[seg])) {
        const ref = modele ? syncValeurA(modele, prefixe) : undefined
        cur[seg] = Array.isArray(ref) ? [] : {}
      }
      cur = cur[seg]
    } else return
  }

  const dernier = segs[segs.length - 1]
  const avantDernier = segs[segs.length - 2]
  if (Array.isArray(cur)) {
    if (SYNC_SETS.includes(avantDernier)) {
      if (!cur.some(v => String(v) === dernier)) cur.push(dernier)
      return
    }
    if (/^\d+$/.test(dernier) && (syncTableauScalaire(cur) || !cur.length)) { cur[+dernier] = valeur; return }
    let item = cur.find(x => syncEstObjet(x) && String(x.id) === dernier)
    if (!item) { item = { id: dernier }; cur.push(item) }
    if (syncEstObjet(valeur)) Object.assign(item, valeur)
    return
  }
  if (syncEstObjet(cur)) cur[dernier] = valeur
}

function syncSupprimerA(cible, chemin) {
  const segs = syncSegments(chemin)
  const parent = syncValeurA(cible, segs.slice(0, -1))
  const dernier = segs[segs.length - 1]
  if (parent == null) return
  if (Array.isArray(parent)) {
    if (SYNC_SETS.includes(segs[segs.length - 2])) {
      const i = parent.findIndex(v => String(v) === dernier)
      if (i >= 0) parent.splice(i, 1)
      return
    }
    const i = parent.findIndex(x => syncEstObjet(x) && String(x.id) === dernier)
    if (i >= 0) parent.splice(i, 1)
    return
  }
  if (syncEstObjet(parent)) delete parent[dernier]
}

// ── Méta : dates d'écriture et pierres tombales ────────────────────────────
function syncMetaVide() { return { v: 1, feuilles: {}, sup: {} } }
function syncMetaNormalisee(meta) {
  const m = meta || {}
  // Une date à 0 n'est pas une date : c'est « aucune information », et c'est ce
  // que portent les données écrites avant la 2.5.0. L'inscrire au journal ferait
  // croire à une feuille datée que l'autre appareil ignore, donc à une version
  // plus récente à renvoyer — un va-et-vient d'envois sur des données que
  // personne n'a touchées. On ne garde que les dates réelles.
  const feuilles = {}
  Object.keys(m.feuilles || {}).forEach(k => { if (m.feuilles[k] > 0) feuilles[k] = m.feuilles[k] })
  const sup = {}
  Object.keys(m.sup || {}).forEach(k => { if (m.sup[k] > 0) sup[k] = m.sup[k] })
  return { v: 1, feuilles, sup }
}

// Aperçu de ce qu'une suppression emporte, pour l'historique des
// modifications : les trois premières valeurs, sans le champ `id` — il répète
// le chemin et ne dit rien à qui relit le journal six mois plus tard.
function syncApercu(chemins, feuilles) {
  return chemins.filter(ch => syncSegments(ch).pop() !== 'id').slice(0, 3).map(ch => feuilles[ch])
}

// Compare deux états et date ce qui a changé. Appelé à chaque sauvegarde avec
// l'état d'avant : c'est ce qui donne à chaque feuille sa date, sans demander
// aux ~60 fonctions de saisie de l'application de s'en occuper.
//
// Rend aussi `changements` — chemin, ancienne valeur, nouvelle valeur — qui est
// la matière de l'historique des modifications (js/journal.js). Le calcul était
// déjà fait ici ; seul le résultat était jeté.
function syncDater(meta, avant, apres, ts) {
  const m = syncMetaNormalisee(meta)
  const fa = syncAplatir(avant)
  const fb = syncAplatir(apres)
  const changements = []
  let modifiees = 0

  Object.keys(fb).forEach(ch => {
    const nouvelle = !(ch in fa)
    // Une cellule qui APPARAÎT vide ne porte aucune information. Saisir un
    // montant dans une nouvelle catégorie crée douze cases d'un coup, dont onze
    // vides : les dater ferait gagner ces vides contre les vrais montants de
    // l'autre appareil, et la création d'une case effacerait onze mois de
    // loyers ailleurs. Elle reste donc SANS date, et la règle d'effacement de
    // la fusion la fait céder devant une vraie valeur.
    // Vider une case qui AVAIT une valeur est une autre histoire : c'est une
    // écriture, elle se date, et elle se défend.
    if (nouvelle && syncEstVide(fb[ch])) return
    if (nouvelle || JSON.stringify(fa[ch]) !== JSON.stringify(fb[ch])) {
      m.feuilles[ch] = ts
      syncOublierTombale(m, ch)   // ressuscité volontairement
      changements.push({ chemin: ch, avant: fa[ch], apres: fb[ch], genre: nouvelle ? 'ajout' : 'maj' })
      modifiees++
    }
  })

  // Supprimer un trajet fait disparaître toutes ses feuilles d'un coup. Dater
  // chacune séparément laisserait l'autre appareil retirer les champs un à un
  // et conserver une coquille `{ id }` dans le tableau. La tombale est donc
  // posée sur le PLUS COURT chemin entièrement disparu — l'élément lui-même.
  const prefixesApres = syncPrefixes(fb)
  const racines = []
  Object.keys(fa).forEach(ch => {
    if (ch in fb) return
    // Une feuille devenue CONTENEUR n'est pas une suppression. `uber: {}` est
    // une feuille tant que l'objet est vide ; dès la première valeur saisie, le
    // chemin « uber » n'est plus une feuille mais un parent. Sans ce garde-fou,
    // la première saisie d'une catégorie posait une tombale sur la catégorie
    // entière — et effaçait chez l'autre appareil tout ce qu'elle contenait.
    if (prefixesApres.has(ch)) return
    const segs = syncSegments(ch)
    let racine = ch
    for (let i = 1; i < segs.length; i++) {
      const pre = syncPath(segs.slice(0, i))
      if (!prefixesApres.has(pre)) { racine = pre; break }
    }
    if (!racines.includes(racine)) racines.push(racine)
  })
  racines.forEach(r => {
    m.sup[r] = ts
    const prefixe = r + SYNC_SEP
    Object.keys(m.feuilles).forEach(ch => {
      if (ch === r || ch.indexOf(prefixe) === 0) delete m.feuilles[ch]
    })
    // Pour le journal : ce qui disparaît est la valeur de la racine si elle
    // était elle-même une feuille (une case), sinon un aperçu de ce qu'elle
    // contenait. Un trajet supprimé n'a plus de libellé à retrouver — son `id`
    // ne dit rien six mois plus tard, sa date et sa destination si.
    const sous = Object.keys(fa).filter(ch => ch === r || ch.indexOf(prefixe) === 0)
    changements.push({ chemin: r, genre: 'suppression',
                       avant: sous.length === 1 ? fa[sous[0]] : undefined,
                       apercu: sous.length > 1 ? syncApercu(sous, fa) : undefined,
                       feuilles: sous.length })
  })

  return { meta: m, modifiees, supprimees: racines.length, changements }
}

// Tous les chemins et sous-chemins présents dans un ensemble de feuilles.
function syncPrefixes(feuilles) {
  const out = new Set()
  Object.keys(feuilles).forEach(ch => {
    const segs = syncSegments(ch)
    for (let i = 1; i <= segs.length; i++) out.add(syncPath(segs.slice(0, i)))
  })
  return out
}

// Retire la tombale qui couvre ce chemin : une valeur réécrite n'est plus une
// valeur supprimée, et la tombale peut porter sur un parent.
function syncOublierTombale(meta, chemin) {
  delete meta.sup[chemin]
  const segs = syncSegments(chemin)
  for (let i = 1; i < segs.length; i++) delete meta.sup[syncPath(segs.slice(0, i))]
}

// Date la plus récente connue pour un chemin ou l'un de ses parents : une
// feuille créée après la suppression de son conteneur doit gagner.
function syncDateDe(meta, chemin) {
  const m = syncMetaNormalisee(meta)
  if (m.feuilles[chemin] != null) return m.feuilles[chemin]
  return 0
}
function syncDateSuppression(meta, chemin) {
  const m = syncMetaNormalisee(meta)
  let max = m.sup[chemin] != null ? m.sup[chemin] : 0
  const segs = syncSegments(chemin)
  // Supprimer un trajet entier laisse une tombale sur son préfixe, pas sur
  // chacun de ses champs : un préfixe tombale couvre tout ce qui est en dessous.
  for (let i = 1; i < segs.length; i++) {
    const prefixe = syncPath(segs.slice(0, i))
    if (m.sup[prefixe] != null && m.sup[prefixe] > max) max = m.sup[prefixe]
  }
  return max
}

// ── La fusion ──────────────────────────────────────────────────────────────
// `local` et `distant` sont deux { state, meta }. Rend l'état fusionné, la méta
// fusionnée, la liste des conflits et de quoi afficher un résumé honnête.
// Départage d'une égalité de dates, sans savoir lequel des deux côtés est
// « ici » : les deux appareils doivent en tirer la même conclusion, sinon la
// fusion ne converge pas. Retourne vrai si c'est la valeur distante qui gagne.
function syncTrancherEgalite(local, distant) {
  const vl = syncEstVide(local), vd = syncEstVide(distant)
  if (vl !== vd) return vl               // une vraie valeur bat une case vide
  return JSON.stringify(distant) > JSON.stringify(local)
}

function syncFusionner(local, distant) {
  const stLocal = local && local.state ? local.state : {}
  const stDist  = distant && distant.state ? distant.state : {}
  const mLocal  = syncMetaNormalisee(local && local.meta)
  const mDist   = syncMetaNormalisee(distant && distant.meta)

  const resultat = JSON.parse(JSON.stringify(stLocal))
  const meta = { v: 1, feuilles: Object.assign({}, mLocal.feuilles), sup: Object.assign({}, mLocal.sup) }
  const conflits = []
  // Ce que la fusion a VRAIMENT changé dans l'état local, pour l'historique des
  // modifications. Une valeur écartée par un arbitrage n'y figure pas : elle
  // n'a rien changé ici, et la pastille de synchronisation la signale déjà.
  const changements = []
  const stats = { prisDistant: 0, gardesLocal: 0, ajoutesDistant: 0, supprimes: 0, conflits: 0 }

  const fLocal = syncAplatir(stLocal)
  const fDist  = syncAplatir(stDist)
  const prefLocal = syncPrefixes(fLocal)
  const prefDist  = syncPrefixes(fDist)
  const memeValeur = (a, b) => JSON.stringify(a) === JSON.stringify(b)

  // 1. Tout ce que le distant possède.
  Object.keys(fDist).forEach(ch => {
    const tsD = syncDateDe(mDist, ch)
    const supLocale = syncDateSuppression(mLocal, ch)

    if (!(ch in fLocal)) {
      // Une catégorie VIDE chez l'autre appareil (`uber: {}`) est une feuille,
      // alors qu'ici le même chemin porte déjà des valeurs : l'écrire écraserait
      // la catégorie entière par un objet vide. Un conteneur vide ne dit rien —
      // on garde ce qu'on a. Une vraie suppression, elle, passe par les
      // tombales de l'étape 2, pas par cette coquille.
      if (prefLocal.has(ch)) return
      // Absent ici : ajout du distant, sauf si on l'a supprimé APRÈS sa dernière
      // écriture là-bas. Sans date d'écriture (données d'avant la fusion), une
      // tombale locale datée l'emporte : la suppression est l'acte le plus
      // récent dont on ait une trace.
      if (supLocale > 0 && supLocale >= tsD) { stats.supprimes++; return }
      syncEcrireA(resultat, ch, fDist[ch], stDist)
      meta.feuilles[ch] = tsD
      changements.push({ chemin: ch, avant: undefined, apres: fDist[ch], genre: 'ajout' })
      stats.ajoutesDistant++
      return
    }

    if (memeValeur(fLocal[ch], fDist[ch])) {
      meta.feuilles[ch] = Math.max(syncDateDe(mLocal, ch), tsD)
      return
    }

    const tsL = syncDateDe(mLocal, ch)
    if (tsD > tsL) {
      syncEcrireA(resultat, ch, fDist[ch], stDist)
      meta.feuilles[ch] = tsD
      changements.push({ chemin: ch, avant: fLocal[ch], apres: fDist[ch], genre: 'maj' })
      stats.prisDistant++
      if (tsL > 0) { conflits.push({ chemin: ch, garde: fDist[ch], ecarte: fLocal[ch], origine: 'distant' }); stats.conflits++ }
    } else if (tsL === 0 && syncEstVide(fLocal[ch]) && !syncEstVide(fDist[ch])) {
      // Règle d'effacement. Une cellule vide SANS date ne porte aucune
      // information : elle n'a jamais été remplie ici, ou elle vient d'un état
      // par défaut. Elle ne doit pas écraser une vraie valeur venue de l'autre
      // appareil — c'est le cas de la toute première fusion, où aucun des deux
      // côtés n'est daté et où le téléphone est seul à contenir les données.
      // Une cellule vidée VOLONTAIREMENT, elle, porte une date (l'effacement
      // est une écriture) et se défend donc normalement.
      syncEcrireA(resultat, ch, fDist[ch], stDist)
      meta.feuilles[ch] = tsD
      changements.push({ chemin: ch, avant: fLocal[ch], apres: fDist[ch], genre: 'maj' })
      stats.prisDistant++
    } else if (tsD === tsL) {
      // Égalité de dates et valeurs différentes : les deux côtés ont écrit dans
      // la même seconde, ou — le cas courant — aucun des deux n'est daté parce
      // que les données précèdent la 2.5.0.
      //
      // « Garder le local » serait stable sur un appareil et ruineux à deux :
      // chacun garderait le sien, chacun verrait le document de l'autre comme
      // différent du résultat de sa fusion, chacun renverrait le sien — les
      // deux appareils se seraient renvoyé la même case toutes les deux
      // secondes et demie, indéfiniment, avec un avertissement à chaque tour.
      // Il faut donc trancher PAREIL des deux côtés, sans savoir qui est
      // « ici ». La règle ne regarde que les deux valeurs : la valeur non vide
      // gagne, et entre deux valeurs non vides, la plus grande des deux
      // écritures canoniques. Arbitraire, mais identique sur les deux appareils
      // — donc les deux convergent, et le désaccord est dit.
      const gagneDistant = syncTrancherEgalite(fLocal[ch], fDist[ch])
      if (gagneDistant) {
        syncEcrireA(resultat, ch, fDist[ch], stDist)
        changements.push({ chemin: ch, avant: fLocal[ch], apres: fDist[ch], genre: 'maj' })
        stats.prisDistant++
      } else stats.gardesLocal++
      conflits.push({
        chemin: ch,
        garde:   gagneDistant ? fDist[ch]  : fLocal[ch],
        ecarte:  gagneDistant ? fLocal[ch] : fDist[ch],
        origine: gagneDistant ? 'distant'  : 'local'
      })
      stats.conflits++
    } else {
      stats.gardesLocal++
    }
  })

  // 2. Les suppressions venues de l'autre appareil. On les applique AU CHEMIN
  //    OÙ ELLES SONT POSÉES — l'élément, pas ses champs — sans quoi un trajet
  //    supprimé laisserait une coquille vide dans le tableau. Une valeur
  //    réécrite ici depuis la suppression là-bas n'est pas retirée, et un
  //    élément que le distant possède encore ne l'est pas non plus : sa
  //    présence prouve qu'il a été recréé.
  Object.keys(mDist.sup).forEach(ch => {
    if (!prefLocal.has(ch) || prefDist.has(ch)) return
    const tsSup = mDist.sup[ch]
    const prefixe = ch + SYNC_SEP
    let tsLocalMax = 0
    Object.keys(fLocal).forEach(l => {
      if (l === ch || l.indexOf(prefixe) === 0) tsLocalMax = Math.max(tsLocalMax, syncDateDe(mLocal, l))
    })
    if (tsSup <= tsLocalMax) return
    syncSupprimerA(resultat, ch)
    Object.keys(meta.feuilles).forEach(l => {
      if (l === ch || l.indexOf(prefixe) === 0) delete meta.feuilles[l]
    })
    meta.sup[ch] = tsSup
    const emportees = Object.keys(fLocal).filter(l => l === ch || l.indexOf(prefixe) === 0)
    changements.push({ chemin: ch, genre: 'suppression',
                       avant: emportees.length === 1 ? fLocal[emportees[0]] : undefined,
                       apercu: emportees.length > 1 ? syncApercu(emportees, fLocal) : undefined,
                       feuilles: emportees.length })
    stats.supprimes++
  })

  // 3. Les tombales des deux côtés survivent : un appareil resté hors ligne ne
  //    doit pas ressusciter ce qu'un autre a supprimé il y a trois jours.
  Object.keys(mDist.sup).forEach(ch => {
    if (!(meta.sup[ch] > mDist.sup[ch])) meta.sup[ch] = mDist.sup[ch]
  })

  return { state: resultat, meta, conflits, stats, changements }
}

// Résumé en une phrase, pour le bandeau de synchronisation.
function syncResume(stats) {
  const bouts = []
  if (stats.ajoutesDistant) bouts.push(stats.ajoutesDistant + ' valeur' + (stats.ajoutesDistant > 1 ? 's' : '') + ' reçue' + (stats.ajoutesDistant > 1 ? 's' : ''))
  if (stats.prisDistant)    bouts.push(stats.prisDistant + ' mise' + (stats.prisDistant > 1 ? 's' : '') + ' à jour')
  if (stats.supprimes)      bouts.push(stats.supprimes + ' supprimée' + (stats.supprimes > 1 ? 's' : ''))
  if (!bouts.length) return 'déjà à jour'
  return bouts.join(', ')
}

// ── Faut-il renvoyer le résultat au cloud ? ────────────────────────────────
// Question piégeuse, et le piège est un aller-retour sans fin. Comparer
// `JSON.stringify(fusion) !== JSON.stringify(distant)` paraît suffisant, mais
// l'ordre des clés d'un objet JSON suit l'ordre d'écriture : deux appareils qui
// possèdent exactement les mêmes données produisent deux textes différents.
// Chacun conclurait que l'autre est en retard et renverrait sa version, pour
// l'éternité. On compare donc une EMPREINTE canonique — les feuilles triées par
// chemin — plus les dates : on ne renvoie que si l'état diffère vraiment, ou si
// l'on détient des dates ou des tombales que le cloud ignore encore.
function syncEmpreinteEtat(st) {
  const f = syncAplatir(st || {})
  return Object.keys(f).sort().map(k => k + '=' + JSON.stringify(f[k])).join('\u001e')
}

function syncDoitRenvoyer(fusion, distant) {
  if (syncEmpreinteEtat(fusion && fusion.state) !== syncEmpreinteEtat(distant && distant.state)) return true
  const a = syncMetaNormalisee(fusion && fusion.meta)
  const b = syncMetaNormalisee(distant && distant.meta)
  // « Absente là-bas » ne veut pas dire « plus récente ici » : une feuille sans
  // date vaut 0 des deux côtés.
  const plusRecent = (x, y) => Object.keys(x).some(k => x[k] > (y[k] || 0))
  return plusRecent(a.feuilles, b.feuilles) || plusRecent(a.sup, b.sup)
}
