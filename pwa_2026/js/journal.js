// ════════════════════════════════════════════════════════════════════════════
// journal.js — HISTORIQUE DES MODIFICATIONS
//
// Question à laquelle ce fichier répond : « le total que je viens de voir n'est
// plus celui que j'ai envoyé au comptable — qu'est-ce qui a changé ? »
//
// Jusqu'ici, seule la clôture d'année laissait une trace, et elle ne disait que
// « les chiffres ne correspondent plus » : vrai, mais inutilisable. Il manquait
// la liste des cellules touchées, l'ancienne valeur, et d'où venait le
// changement.
//
// ── D'où vient la matière ─────────────────────────────────────────────────
// De la synchronisation, qui calculait déjà tout sans le garder :
//   • `syncDater()` compare l'état d'avant et l'état d'après à chaque
//     sauvegarde et nomme les feuilles touchées → les SAISIES ;
//   • `syncFusionner()` sait exactement quelles valeurs il a prises à l'autre
//     appareil → les ARRIVÉES.
// Les deux rendent désormais une liste `changements`, et ce fichier ne fait que
// l'habiller et la conserver. Aucune des ~60 fonctions de saisie de
// l'application n'a eu à être modifiée, et aucune ne peut oublier de journaliser.
//
// ── Pourquoi le journal ne se synchronise PAS ─────────────────────────────
// Tentant, et c'est un piège. Un journal est un tableau en ajout seul ; la
// fusion traite un tableau sans `id` comme une seule feuille — dernier
// écrivain gagne — donc le synchroniser tel quel PERDRAIT des lignes. Lui
// donner des `id` le ferait grossir dans le document Firestore, qui est limité
// à un mégaoctet et porte déjà toutes les données de l'année.
//
// Et surtout : c'est inutile. Ce qui arrive d'un autre appareil est journalisé
// À L'ARRIVÉE, avec la mention « reçu de l'autre appareil ». Le journal local
// explique donc la totalité des changements de l'état local — ce qui est
// exactement la question posée. Ce qu'il ne prétend pas être : un registre
// central et inviolable de qui a fait quoi. Pour cela, il faudrait un serveur
// qui refuse les écritures non journalisées, pas une app hors ligne.
//
// ── Ce qui n'entre pas au journal ─────────────────────────────────────────
//   • les valeurs écartées par un arbitrage (la pastille de synchronisation les
//     signale déjà) : le journal ne liste que ce qui a VRAIMENT changé l'état ;
//   • une case qui passe de vide à vide ('' → null, un écran ouvert crée des
//     structures vides) : aucune information ;
//   • les photos de reçus, qui ne sont pas des feuilles de synchronisation.
// ════════════════════════════════════════════════════════════════════════════

const JOURNAL_PREFIX = 'depenses_journal_'

// Un journal par année, comme les données et comme la méta. 800 lignes tiennent
// dans ~120 Ko et couvrent plusieurs saisons de saisie ; au-delà, les plus
// vieilles tombent. Le journal est la donnée la MOINS précieuse de l'app : il
// doit céder la place, jamais la prendre.
const JOURNAL_MAX = 800

// Deux écritures dans la même cellule à moins de deux minutes d'intervalle sont
// la même correction : on garde l'ancienne valeur d'origine et la nouvelle
// valeur finale, sur une seule ligne. Sans cela, hésiter sur un montant
// (« 142 », « 1420 », « 142,30 ») laissait trois lignes pour une seule décision,
// et le journal devenait illisible là où il doit être consulté.
const JOURNAL_FUSION_MS = 120000

// Une valeur affichée au journal est un repère, pas une pièce jointe : une note
// de deux mille caractères est coupée.
const JOURNAL_VAL_MAX = 60

// Au-delà de ce nombre de valeurs dans une seule fusion, on inscrit UNE ligne
// de synthèse au lieu de la liste. Le premier raccordement d'un appareil reçoit
// des centaines de valeurs d'un coup : les détailler chasserait du journal tout
// l'historique utile pour y mettre du bruit.
const JOURNAL_SEUIL_LOT = 40

// Noms de mois propres au fichier, pour qu'il reste autonome : c'est ce qui
// permet de le porter sur iOS sans emporter index.html (voir PORTAGE_IOS.md).
const JOURNAL_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin',
                      'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

// ── Nom de l'appareil ──────────────────────────────────────────────────────
// « Qui » a fait la modification, à l'échelle d'une app personnelle : quel
// appareil. Pas de nom d'utilisateur à inventer, pas d'identifiant à stocker —
// l'agent utilisateur suffit à distinguer le téléphone de l'ordinateur, et
// c'est la seule distinction qui compte ici.
function journalAppareil(ua) {
  const s = String(ua || '')
  if (/iPhone/i.test(s)) return 'iPhone'
  if (/iPad/i.test(s)) return 'iPad'
  if (/Android/i.test(s)) return 'Android'
  if (/Macintosh|Mac OS X/i.test(s)) return 'Mac'
  if (/Windows/i.test(s)) return 'Windows'
  if (/Linux/i.test(s)) return 'Linux'
  return 'cet appareil'
}

// ── Valeurs ────────────────────────────────────────────────────────────────
// Ce qu'on inscrit à la place d'une valeur. `null`, `''` et l'absence décrivent
// tous la même chose au journal : une case vide.
function journalValeur(v) {
  if (v === undefined || v === null || v === '') return ''
  if (typeof v === 'boolean') return v ? 'oui' : 'non'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') {
    const t = v.trim()
    return t.length > JOURNAL_VAL_MAX ? t.slice(0, JOURNAL_VAL_MAX) + '…' : t
  }
  const txt = JSON.stringify(v)
  return txt.length > JOURNAL_VAL_MAX ? txt.slice(0, JOURNAL_VAL_MAX) + '…' : txt
}

// ── Libellé d'un emplacement ───────────────────────────────────────────────
// Un chemin de fusion (`p1090␟deductibles␟Électricité␟2`) ne veut rien dire
// pour qui consulte le journal. On le traduit en « 1090 › Dépenses ›
// Électricité › mars ». Le lexique vient de l'appelant — libellés d'immeubles,
// de champs Uber/Lyft, dates de trajets — pour que ce fichier reste une
// fonction pure, testable, et portable.
const JOURNAL_SECTIONS = { revenus: 'Revenus', deductibles: 'Dépenses', capital: 'Capital' }

function journalMois(seg) {
  const i = Number(seg)
  return Number.isInteger(i) && i >= 0 && i <= 11 ? JOURNAL_MOIS[i] : null
}

function journalLabel(chemin, lexique) {
  const lex = lexique || {}
  const props = lex.props || {}
  const champs = lex.champs || {}
  const trajets = lex.trajets || {}
  const segs = typeof syncSegments === 'function' ? syncSegments(chemin) : String(chemin).split('\u001f')
  const bouts = []

  const pousser = s => { if (s != null && s !== '') bouts.push(String(s)) }

  switch (segs[0]) {
    case 'config':
      pousser('Configuration')
      segs.slice(1).forEach(s => pousser(champs[s] || s))
      break
    case 'uber':
      pousser('Uber')
      pousser(champs[segs[1]] || segs[1])
      break
    case 'lyft':
      // Lyft est saisi mois par mois : `lyft␟<mois>␟<champ>`.
      pousser('Lyft')
      pousser(journalMois(segs[1]) || segs[1])
      pousser(champs[segs[2]] || segs[2])
      break
    case 'trips':
      pousser('Trajet')
      pousser(trajets[segs[1]] || segs[1])
      if (segs[2]) pousser(champs[segs[2]] || segs[2])
      break
    case 'vehicule':
      pousser('Véhicule')
      segs.slice(2).forEach(s => pousser(s))
      break
    case 'settings':
      pousser('Réglages')
      pousser(champs[segs[1]] || segs[1])
      break
    case 'recurring':
      pousser('Montant récurrent')
      pousser(props[segs[1]] || segs[1])
      segs.slice(2).forEach(s => pousser(journalMois(s) || s))
      break
    case 'recusIndex':
      pousser('Reçu')
      pousser(segs.slice(1).join(' '))
      break
    case 'notes':
      pousser('Note')
      segs.slice(1).forEach(s => pousser(s))
      break
    case 'closed':
    case 'closedHistory':
      pousser('Clôture de l\'année')
      break
    default:
      if (props[segs[0]]) {
        // Un immeuble : `p1090␟deductibles␟Électricité␟2`.
        pousser(props[segs[0]])
        pousser(JOURNAL_SECTIONS[segs[1]] || segs[1])
        pousser(segs[2])
        if (segs[3] != null) pousser(journalMois(segs[3]) || segs[3])
      } else {
        segs.forEach(s => pousser(journalMois(s) || s))
      }
  }
  return bouts.join(' › ')
}

// ── Construction des lignes ────────────────────────────────────────────────
// `changements` est ce que rendent syncDater() et syncFusionner() :
//   { chemin, avant, apres, genre: 'ajout' | 'maj' | 'suppression', feuilles? }
// `origine` dit d'où vient le changement : 'saisie' (ici) ou 'distant' (reçu).
function journalEntrees(changements, ts, origine, appareil, prefixe) {
  const out = []
  ;(changements || []).forEach(c => {
    const chemin = prefixe ? prefixe + '\u001f' + c.chemin : c.chemin
    if (c.genre === 'suppression') {
      // Ce qui a disparu est inscrit MAINTENANT : après coup, un trajet
      // supprimé n'a plus de libellé, et son `id` seul ne dit rien.
      const apercu = Array.isArray(c.apercu)
        ? c.apercu.map(journalValeur).filter(Boolean).join(', ')
        : journalValeur(c.avant)
      out.push({ ts, chemin, genre: 'suppression', origine, appareil,
                 avant: journalValeur(apercu), apres: '',
                 feuilles: c.feuilles || 1 })
      return
    }
    const avant = journalValeur(c.avant)
    const apres = journalValeur(c.apres)
    // Vide → vide : ouvrir un écran crée des structures vides, et une case qui
    // n'a jamais rien contenu n'a rien à raconter.
    if (avant === apres) return
    out.push({ ts, chemin, genre: avant === '' ? 'ajout' : 'maj', origine, appareil, avant, apres })
  })
  return out
}

// Une fusion qui apporte des centaines de valeurs — le premier raccordement
// d'un appareil — tient en une ligne.
function journalEntreeLot(changements, ts, appareil, seuil) {
  const n = (changements || []).length
  if (n <= (seuil == null ? JOURNAL_SEUIL_LOT : seuil)) return null
  const sup = changements.filter(c => c.genre === 'suppression').length
  return { ts, chemin: '', genre: 'lot', origine: 'distant', appareil,
           avant: '', apres: '', nb: n - sup, supprimes: sup }
}

// ── Ajout au journal ───────────────────────────────────────────────────────
// Rend un NOUVEAU tableau : le journal est en ajout seul, mais deux écritures
// rapprochées dans la même cellule se replient l'une sur l'autre, et une
// correction annulée (142 → 150 → 142) disparaît au lieu de laisser deux
// lignes qui, mises bout à bout, ne disent rien.
function journalAjouter(journal, entrees, max, fenetre) {
  const j = (journal || []).slice()
  const plafond = max == null ? JOURNAL_MAX : max
  const f = fenetre == null ? JOURNAL_FUSION_MS : fenetre
  ;(entrees || []).forEach(e => {
    let fusionnee = false
    if (e.genre === 'suppression') {
      // La même suppression peut être décrite deux fois : une fusion arrive en
      // deux temps (transaction puis refusion par-dessus la saisie en cours).
      // Deux lignes identiques ne diraient pas deux suppressions.
      for (let i = j.length - 1; i >= 0; i--) {
        const p = j[i]
        if (p.chemin !== e.chemin) continue
        if (p.genre === 'suppression' && e.ts - p.ts <= f) fusionnee = true
        break
      }
    }
    if (e.genre === 'maj' || e.genre === 'ajout') {
      for (let i = j.length - 1; i >= 0; i--) {
        const p = j[i]
        if (p.chemin !== e.chemin) continue
        if (p.genre !== 'maj' && p.genre !== 'ajout') break
        if (p.origine !== e.origine || p.appareil !== e.appareil) break
        if (e.ts - p.ts > f) break
        // Sans copie, on modifierait l'objet que l'appelant détient encore —
        // et le journal n'est pas le propriétaire de ce qu'on lui remet.
        if (e.apres === p.avant) j.splice(i, 1)        // revenu au point de départ
        else j[i] = Object.assign({}, p, { apres: e.apres, ts: e.ts })
        fusionnee = true
        break
      }
    }
    if (!fusionnee) j.push(Object.assign({}, e))
  })
  j.sort((a, b) => a.ts - b.ts)
  return j.length > plafond ? j.slice(j.length - plafond) : j
}

// ── Consultation ───────────────────────────────────────────────────────────
// `filtre` = { depuis, jusqua, origine, texte, lexique }. Le plus récent
// d'abord : c'est l'ordre dans lequel on consulte un historique.
function journalFiltrer(journal, filtre) {
  const f = filtre || {}
  const texte = (f.texte || '').trim().toLowerCase()
  return (journal || []).filter(e => {
    if (f.depuis != null && e.ts < f.depuis) return false
    if (f.jusqua != null && e.ts > f.jusqua) return false
    if (f.origine && f.origine !== 'tout' && e.origine !== f.origine) return false
    if (texte) {
      const foin = (journalLabel(e.chemin, f.lexique) + ' ' + e.avant + ' ' + e.apres + ' ' + e.appareil).toLowerCase()
      if (foin.indexOf(texte) === -1) return false
    }
    return true
  }).slice().sort((a, b) => b.ts - a.ts)
}

// Regroupement par jour, pour que l'écran n'affiche pas 300 dates identiques.
function journalGrouper(entrees) {
  const groupes = []
  ;(entrees || []).forEach(e => {
    const jour = new Date(e.ts).toLocaleDateString('fr-CA')   // AAAA-MM-JJ
    const dernier = groupes[groupes.length - 1]
    if (dernier && dernier.jour === jour) dernier.entrees.push(e)
    else groupes.push({ jour, entrees: [e] })
  })
  return groupes
}

function journalJourLibelle(jour, aujourdhui) {
  const ref = aujourdhui ? new Date(aujourdhui) : new Date()
  const aujd = ref.toLocaleDateString('fr-CA')
  const hier = new Date(ref.getTime() - 86400000).toLocaleDateString('fr-CA')
  if (jour === aujd) return "Aujourd'hui"
  if (jour === hier) return 'Hier'
  const [a, m, d] = jour.split('-').map(Number)
  return d + ' ' + JOURNAL_MOIS[m - 1] + ' ' + a
}

// Une ligne en une phrase : « Électricité › mars : 142,30 $ → 150,00 $ ».
function journalPhrase(e, lexique) {
  if (e.genre === 'lot') {
    return e.nb + ' valeur' + (e.nb > 1 ? 's' : '') + ' reçue' + (e.nb > 1 ? 's' : '') + ' de ' + e.appareil
         + (e.supprimes ? ' · ' + e.supprimes + ' suppression' + (e.supprimes > 1 ? 's' : '') : '')
  }
  const ou = journalLabel(e.chemin, lexique)
  if (e.genre === 'suppression') {
    const quoi = e.feuilles > 1 ? e.feuilles + ' cases' : ''
    const valeur = e.avant ? (quoi ? ' : ' : ' ') + e.avant : ''
    return ou + ' — retiré' + (quoi || valeur ? ' (' + quoi + valeur + ')' : '')
  }
  if (e.genre === 'ajout') return ou + ' : ' + e.apres
  return ou + ' : ' + (e.avant === '' ? '(vide)' : e.avant) + ' → ' + (e.apres === '' ? '(vide)' : e.apres)
}

// ── Stockage ───────────────────────────────────────────────────────────────
function journalKey(year) { return JOURNAL_PREFIX + (year == null ? activeYear : year) }

function journalLire(year) {
  try {
    const s = localStorage.getItem(journalKey(year))
    const j = s ? JSON.parse(s) : []
    return Array.isArray(j) ? j : []
  } catch (e) { return [] }
}

// Le journal ne doit JAMAIS être la raison pour laquelle une sauvegarde
// échoue : si le stockage est plein, il se réduit de moitié et réessaie une
// fois, puis renonce en silence. Les données fiscales, elles, sont déjà
// écrites à ce stade.
function journalEcrire(year, j) {
  try { localStorage.setItem(journalKey(year), JSON.stringify(j)); return true }
  catch (e) {
    try {
      localStorage.setItem(journalKey(year), JSON.stringify(j.slice(Math.floor(j.length / 2))))
      return true
    } catch (e2) { return false }
  }
}

function journalVider(year) {
  try { localStorage.removeItem(journalKey(year)) } catch (e) {}
}

// Point d'entrée unique, appelé par save(), saveSetup() et la fusion.
// Volontairement incapable de lever : une erreur de journalisation ne doit pas
// empêcher une saisie.
function journalConsigner(changements, origine, opts) {
  try {
    const o = opts || {}
    if (!changements || !changements.length) return 0
    const ts = o.ts || Date.now()
    const appareil = o.appareil || journalAppareil(typeof navigator !== 'undefined' ? navigator.userAgent : '')
    const year = o.year == null ? activeYear : o.year
    const lot = origine === 'distant' ? journalEntreeLot(changements, ts, appareil, o.seuil) : null
    const entrees = lot ? [lot] : journalEntrees(changements, ts, origine, appareil, o.prefixe)
    if (!entrees.length) return 0
    const j = journalAjouter(journalLire(year), entrees, o.max, o.fenetre)
    journalEcrire(year, j)
    return entrees.length
  } catch (e) { console.error('journalConsigner', e); return 0 }
}

// ── Lexique ────────────────────────────────────────────────────────────────
// Traduit les segments de chemin en mots de l'application. Reconstruit à chaque
// affichage : un immeuble renommé doit changer de nom dans tout l'historique,
// y compris dans les lignes écrites avant le changement de nom — ce qu'on
// désigne, c'est la cellule, pas le mot qui la nommait ce jour-là.
function journalLexique() {
  const props = {}
  if (typeof propsList === 'function') {
    propsList().forEach(p => { props[p.id] = typeof shortLabel === 'function' ? shortLabel(p.label) : p.label })
  }
  const champs = {}
  if (typeof UBER_FIELDS !== 'undefined') UBER_FIELDS.forEach(f => { if (!f.sep) champs[f.key] = f.label })
  if (typeof LYFT_FIELDS !== 'undefined') LYFT_FIELDS.forEach(f => { if (!f.sep) champs[f.key] = f.label })
  Object.assign(champs, {
    mileageRate: 'Taux du kilométrage', kmTotalAnnuel: 'Kilométrage annuel du véhicule',
    vehicleModel: 'Modèle du véhicule', googleMapsApiKey: 'Clé Google Maps',
    syncAuto: 'Synchronisation automatique',
    date: 'date', km: 'km', property: 'immeuble', purpose: 'motif', destination: 'destination',
    modules: 'Modules', propsList: 'Immeubles', done: 'Assistant terminé'
  })
  const trajets = {}
  if (typeof state !== 'undefined' && Array.isArray(state.trips)) {
    state.trips.forEach(t => { trajets[t.id] = [t.date, t.destination || t.purpose || ''].filter(Boolean).join(' ') })
  }
  return { props, champs, trajets }
}

// ── Écran ──────────────────────────────────────────────────────────────────
let journalFiltreOrigine = 'tout'
let journalFiltreTexte = ''
let journalLimite = 60

function journalOrigineLabel(o) {
  return o === 'distant' ? 'reçu d\'un autre appareil' : 'saisi ici'
}

function journalLigneHtml(e, lexique) {
  const heure = new Date(e.ts).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })
  const icone = e.genre === 'suppression' ? '🗑️' : e.genre === 'lot' ? '🔄' : e.origine === 'distant' ? '📥' : '✏️'
  return `<div style="display:flex;gap:8px;padding:7px 0;border-bottom:1px solid var(--border);align-items:baseline">
    <span style="font-size:13px">${icone}</span>
    <span style="font-size:11px;color:var(--text2);font-variant-numeric:tabular-nums;min-width:38px">${heure}</span>
    <span style="flex:1;font-size:12px;line-height:1.4">${escH(journalPhrase(e, lexique))}
      <span style="color:var(--text2);font-size:10.5px"> · ${escH(e.appareil)}</span></span>
  </div>`
}

function renderJournal() {
  const el = document.getElementById('journal-body')
  if (!el) return
  const lexique = journalLexique()
  const tout = journalLire(activeYear)
  const filtrees = journalFiltrer(tout, { origine: journalFiltreOrigine, texte: journalFiltreTexte, lexique })
  const montrees = filtrees.slice(0, journalLimite)

  const bouton = (id, label) => `<button class="sub-tab${journalFiltreOrigine === id ? ' active' : ''}"
    onclick="journalSetOrigine('${id}')">${label}</button>`

  let corps = ''
  if (!tout.length) {
    corps = infoBox(`Rien encore. À partir de maintenant, chaque montant modifié — ici ou sur un autre
      appareil — s'inscrit ici avec sa date, son ancienne valeur et sa nouvelle valeur.
      L'historique commence à cette version ; ce qui a été saisi avant n'a pas pu être reconstitué.`)
  } else if (!filtrees.length) {
    corps = infoBox('Aucune modification ne correspond à ce filtre.')
  } else {
    corps = journalGrouper(montrees).map(g => `
      <div style="font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;
                  margin:10px 0 2px">${escH(journalJourLibelle(g.jour))}</div>
      ${g.entrees.map(e => journalLigneHtml(e, lexique)).join('')}
    `).join('')
    if (filtrees.length > montrees.length) {
      corps += `<button class="btn btn-ghost btn-sm btn-full" style="margin-top:10px"
        onclick="journalPlus()">Voir les ${filtrees.length - montrees.length} modifications plus anciennes</button>`
    }
  }

  el.innerHTML = card('🕘 Historique des modifications', `
    <div class="sub-tabs scroll" style="margin:-4px 0 8px">
      ${bouton('tout', 'Tout')}${bouton('saisie', '✏️ Saisi ici')}${bouton('distant', '📥 Reçu')}
    </div>
    <div class="field" style="margin-bottom:6px">
      <input type="text" class="inp" placeholder="Chercher un immeuble, une catégorie, un montant…"
        value="${escH(journalFiltreTexte)}" oninput="journalSetTexte(this.value)">
    </div>
    ${corps}
    ${tout.length ? sourceNote(`${tout.length} modification${tout.length > 1 ? 's' : ''} conservée${tout.length > 1 ? 's' : ''}
      pour ${activeYear} (les ${JOURNAL_MAX} dernières). Le journal est propre à cet appareil : ce qui a été
      modifié ailleurs y figure au moment où la synchronisation l'a apporté.`) : ''}
    ${tout.length ? `<div style="display:flex;gap:8px;margin-top:10px">
      <button class="btn btn-ghost btn-sm" style="flex:1" onclick="journalExportCSV()">📊 Exporter en CSV</button>
      <button class="btn btn-ghost btn-sm" style="flex:1" onclick="journalEffacer()">🗑️ Effacer l'historique</button>
    </div>` : ''}
  `, 'dark')
}

function journalSetOrigine(o) { journalFiltreOrigine = o; journalLimite = 60; renderJournal() }
function journalSetTexte(t) { journalFiltreTexte = t; journalLimite = 60; renderJournal() }
function journalPlus() { journalLimite += 120; renderJournal() }

function journalEffacer() {
  if (!confirm(`Effacer l'historique des modifications de ${activeYear} ?\n\nLes données elles-mêmes ne sont pas touchées — seule la trace de qui a changé quoi, et quand, est perdue. Elle ne peut pas être reconstituée.`)) return
  journalVider(activeYear)
  toast('🗑️ Historique effacé')
  renderJournal()
}

function journalExportCSV() {
  const lexique = journalLexique()
  const lignes = [csvLigne(['Date', 'Heure', 'Appareil', 'Origine', 'Emplacement', 'Avant', 'Après', 'Nature'])]
  journalFiltrer(journalLire(activeYear), { lexique }).forEach(e => {
    const d = new Date(e.ts)
    lignes.push(csvLigne([
      d.toLocaleDateString('fr-CA'), d.toLocaleTimeString('fr-CA'),
      e.appareil, journalOrigineLabel(e.origine),
      e.genre === 'lot' ? journalPhrase(e, lexique) : journalLabel(e.chemin, lexique),
      e.avant, e.apres, e.genre
    ]))
  })
  dl('historique-' + activeYear + '.csv', '﻿' + lignes.join('\r\n'), 'text/csv;charset=utf-8')
}

// ── Depuis la clôture ──────────────────────────────────────────────────────
// Le cas qui justifie tout le fichier : l'année est clôturée, l'empreinte ne
// correspond plus, et il faut savoir ce qui a bougé depuis — au montant près,
// avant de dire quoi que ce soit au comptable.
function journalDepuisCloture(year) {
  const c = typeof yearClosedInfo === 'function' ? yearClosedInfo(year) : null
  if (!c || !c.at) return []
  const t = Date.parse(c.at)
  if (!isFinite(t)) return []
  return journalFiltrer(journalLire(year == null ? activeYear : year), { depuis: t })
}

function journalVoirDepuisCloture() {
  const lexique = journalLexique()
  const liste = journalDepuisCloture(activeYear)
  const c = yearClosedInfo()
  const quand = c && c.at ? new Date(c.at).toLocaleString('fr-CA') : ''
  const corps = liste.length
    ? journalGrouper(liste).map(g => `
        <div style="font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;
                    margin:10px 0 2px">${escH(journalJourLibelle(g.jour))}</div>
        ${g.entrees.map(e => journalLigneHtml(e, lexique)).join('')}`).join('')
    : infoBox(`Aucune modification n'est inscrite au journal depuis la clôture du ${escH(quand)}.
        Si les chiffres ont pourtant changé, c'est qu'ils ont été modifiés sur un appareil dont
        l'historique n'est pas ici, ou avant la version qui tient ce journal.`)

  openSheet('🕘 Depuis la clôture', `
    ${sourceNote('Clôturée le ' + escH(quand))}
    ${corps}
    <div class="divider"></div>
    <button class="btn btn-ghost btn-sm btn-full" onclick="closeSheet()">Fermer</button>`)
}

registerModule({
  id: 'journal',
  label: 'Historique des modifications',
  render: renderJournal
})
