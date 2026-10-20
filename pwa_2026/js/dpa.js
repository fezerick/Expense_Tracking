// ════════════════════════════════════════════════════════════════════════════
// dpa.js — REGISTRE DES BIENS AMORTISSABLES ET REPORT DE LA FNACC
//
// C'était la seule donnée fiscale que l'app PERDAIT d'une année à l'autre :
// chaque année vit dans sa propre clé `depenses_<année>`, et la fraction non
// amortie du coût en capital devait être retapée. Une erreur de saisie se
// propageait ensuite sur toutes les années suivantes sans jamais être détectée.
//
// Ce module tient le registre, calcule la DPA maximale par catégorie et reporte
// la FNACC de clôture en ouverture de l'année suivante — automatiquement, en
// relisant l'année précédente.
//
// Règles implémentées, avec leur source :
//
// • Mise en commun par catégorie, et CLASSE DISTINCTE pour chaque immeuble
//   locatif dont le coût du bâtiment atteint 50 000 $ (Règl. de l'impôt sur le
//   revenu, art. 1101(1ac) ; guide T4036). Le terrain est exclu du test.
// • La DPA ne peut ni créer ni augmenter une PERTE LOCATIVE, en tenant compte
//   de l'ensemble des immeubles (art. 1100(11)). Le solde non réclamé reste
//   dans la FNACC et n'est pas perdu.
// • Règle du demi-taux l'année d'acquisition (art. 1100(2)) — SUSPENDUE pour
//   les biens admissibles à l'incitatif à l'investissement accéléré, acquis
//   après le 20 novembre 2018 et prêts à être mis en service avant 2028. Pour
//   2026, la déduction de première année se calcule donc au taux plein.
//   Exclusions : catégories 54, 55, 56, 43.1, 43.2, 53, et acquisition auprès
//   d'une personne liée — dans ces cas le demi-taux s'applique.
// • Le TERRAIN n'est jamais amortissable : seule la portion bâtiment entre dans
//   la catégorie 1/3/6.
// • Catégorie 10.1 : coût plafonné (39 000 $ + taxes en 2026), demi-taux
//   maintenu, ni récupération ni perte finale à la disposition.
// ════════════════════════════════════════════════════════════════════════════

const VEH_PSEUDO_PROP = '__veh'          // les biens du véhicule / de l'entreprise
const SEUIL_CLASSE_DISTINCTE = 50000     // art. 1101(1ac)
const CAT_BATIMENT = ['1', '3', '6', '13']
const CAT_SANS_AII = ['43.1', '43.2', '53', '54', '55', '56']

function biens() {
  if (!Array.isArray(state.biens)) state.biens = []
  return state.biens
}

function bienParId(id) { return biens().find(b => b.id === id) || null }

function nouveauBien() {
  if (guardClosed()) return
  const b = {
    id: uid(),
    propId: (activeProps()[0] || {}).id || VEH_PSEUDO_PROP,
    description: '',
    categorie: '1',
    dateAcquisition: activeYear + '-01-01',
    cout: '',
    coutTerrain: '',
    lie: false,                 // acquis d'une personne liée → pas d'IIA
    fnaccOuverture: '',         // surcharge manuelle, sinon reporté de l'an passé
    dpa: {},
    dispositionDate: '',
    dispositionProduit: ''
  }
  biens().push(b)
  save()
  ouvrirBien(b.id)
}

function ouvrirBien(id) {
  const b = bienParId(id); if (!b) return
  openSheet('🏗 Bien amortissable', htmlBien(b), () => { renderDPA(); refreshAll() })
}

function htmlBien(b) {
  const props = activeProps()
  const cat = dpaCategorie(b.categorie) || {}
  const cout = num(b.cout)
  const terrain = num(b.coutTerrain)
  const amortissable = Math.max(0, cout - terrain)
  const calc = calculDPA(activeYear)
  const pool = calc.pools.find(p => p.biens.some(x => x.id === b.id))

  return `
    <div class="field">
      <label>Description</label>
      <input type="text" class="inp" value="${escH(b.description)}" placeholder="ex: Bâtiment — 1090 Oscar Benoît"
        oninput="majBien('${b.id}','description',this.value)">
    </div>
    <div class="cat-row" style="gap:8px">
      <div class="field" style="flex:1">
        <label>Rattaché à</label>
        <select class="inp" onchange="majBien('${b.id}','propId',this.value)">
          ${props.map(p => `<option value="${escH(p.id)}"${p.id === b.propId ? ' selected' : ''}>${escH(shortLabel(p.label))}</option>`).join('')}
          <option value="${VEH_PSEUDO_PROP}"${b.propId === VEH_PSEUDO_PROP ? ' selected' : ''}>🚗 Véhicule / entreprise</option>
        </select>
      </div>
      <div class="field" style="flex:1">
        <label>Catégorie</label>
        <select class="inp" onchange="majBien('${b.id}','categorie',this.value)">
          ${DPA_CATEGORIES.map(c => `<option value="${escH(c.code)}"${String(c.code) === String(b.categorie) ? ' selected' : ''}>${escH(c.code)} — ${fmt(c.taux * 100, 0)} %</option>`).join('')}
        </select>
      </div>
    </div>
    ${cat.aide ? sourceNote('<strong>Catégorie ' + escH(cat.code) + '</strong> — ' + escH(cat.label) + '. ' + escH(cat.aide)) : ''}
    <div class="cat-row" style="gap:8px">
      <div class="field" style="flex:1">
        <label>Coût total payé</label>
        <input type="number" class="inp" step="0.01" value="${escH(b.cout)}" placeholder="0,00"
          oninput="majBien('${b.id}','cout',this.value)">
      </div>
      <div class="field" style="flex:1">
        <label>Dont terrain</label>
        <input type="number" class="inp" step="0.01" value="${escH(b.coutTerrain)}" placeholder="0,00"
          oninput="majBien('${b.id}','coutTerrain',this.value)">
      </div>
    </div>
    ${cat.batiment
      ? infoBox(`Coût amortissable (bâtiment seul) : <strong>${money(amortissable)}</strong>.
          Le terrain ne s'amortit jamais. À défaut d'une répartition au contrat, le rôle
          d'évaluation municipale est la référence admise par l'ARC.`)
      : ''}
    <div class="field">
      <label>Date d'acquisition</label>
      <input type="date" class="inp" value="${escH(b.dateAcquisition)}"
        oninput="majBien('${b.id}','dateAcquisition',this.value)">
    </div>
    <div class="toggle-row" onclick="majBien('${b.id}','lie',${!b.lie})">
      <div><div style="font-weight:600;font-size:14px">Acquis d’une personne liée</div>
      <div style="font-size:11px;color:var(--text2)">Conjoint, société contrôlée, roulement — l’IIA ne s’applique pas</div></div>
      <div class="toggle ${b.lie ? 'active' : ''}"><div class="toggle-slider"></div></div>
    </div>
    <div class="divider"></div>
    <div class="section-title">Disposition (vente)</div>
    <div class="cat-row" style="gap:8px">
      <div class="field" style="flex:1">
        <label>Date</label>
        <input type="date" class="inp" value="${escH(b.dispositionDate)}"
          oninput="majBien('${b.id}','dispositionDate',this.value)">
      </div>
      <div class="field" style="flex:1">
        <label>Produit de disposition</label>
        <input type="number" class="inp" step="0.01" value="${escH(b.dispositionProduit)}"
          oninput="majBien('${b.id}','dispositionProduit',this.value)">
      </div>
    </div>
    ${sourceNote(`À la disposition, le produit entre dans la catégorie à hauteur du <strong>moindre
      du produit et du coût en capital</strong>. L'excédent sur le coût est un gain en capital
      distinct ; la DPA déjà réclamée devient une <strong>récupération</strong> imposable
      à 100 %.`)}
    <div class="divider"></div>
    <div class="field">
      <label>FNACC d’ouverture ${activeYear} — surcharge manuelle</label>
      <input type="number" class="inp" step="0.01" value="${escH(b.fnaccOuverture)}"
        placeholder="${pool ? fmt(pool.ouverture) : 'reporté automatiquement'}"
        oninput="majBien('${b.id}','fnaccOuverture',this.value)">
      ${sourceNote(`Laissez vide : la FNACC est reportée automatiquement depuis
        ${activeYear - 1}. Ne remplissez ce champ que pour amorcer le registre sur un bien
        déjà amorti avant l'utilisation de l'app.`)}
    </div>
    ${pool ? sourceNote(`Ce bien est dans la catégorie <strong>${escH(pool.libelle)}</strong>
      — FNACC d'ouverture ${money(pool.ouverture)}, DPA maximale ${money(pool.dpaMax)}.`) : ''}
    <button class="btn btn-ghost btn-sm btn-full" style="margin-top:10px" onclick="supprimerBien('${b.id}')">🗑️ Supprimer ce bien</button>`
}

function majBien(id, champ, val) {
  if (guardClosed()) return
  const b = bienParId(id); if (!b) return
  b[champ] = val
  autoSave()
  refreshSheet(htmlBien(b))
}

function supprimerBien(id) {
  if (guardClosed()) return
  if (!confirm('Supprimer ce bien du registre ? Le report de FNACC des années suivantes en sera affecté.')) return
  const i = biens().findIndex(b => b.id === id)
  if (i >= 0) biens().splice(i, 1)
  save()
  closeSheet()
  toast('🗑️ Bien supprimé')
}

// ── CALCUL ─────────────────────────────────────────────────────────────────
// Clé de mise en commun : un immeuble locatif dont le bâtiment atteint
// 50 000 $ constitue sa propre catégorie (art. 1101(1ac)) ; sinon les biens de
// même catégorie et de même immeuble sont mis en commun.
function clePool(b) {
  const cat = dpaCategorie(b.categorie)
  const amortissable = Math.max(0, num(b.cout) - num(b.coutTerrain))
  const distincte = cat && cat.batiment && b.propId !== VEH_PSEUDO_PROP && amortissable >= SEUIL_CLASSE_DISTINCTE
  return distincte ? `${b.propId}|${b.categorie}|${b.id}` : `${b.propId}|${b.categorie}`
}

const _dpaMemo = {}
function invalidateDPA() { Object.keys(_dpaMemo).forEach(k => delete _dpaMemo[k]) }

// FNACC de clôture de l'année précédente, calculée récursivement. S'arrête dès
// qu'une année n'existe pas en stockage : la plus ancienne année saisie sert
// d'amorce (via la surcharge manuelle du bien).
function fnaccReportee(year, cle) {
  const prec = calculDPA(year - 1, true)
  if (!prec) return null
  const p = prec.pools.find(x => x.cle === cle)
  return p ? p.fermeture : null
}

function calculDPA(year, silencieux) {
  year = year || activeYear
  if (_dpaMemo[year]) return _dpaMemo[year]
  const st = year === activeYear ? state : readYear(year)
  if (!st) return silencieux ? null : { pools: [], total: 0, plafondLocatif: 0, year }
  const liste = Array.isArray(st.biens) ? st.biens : []

  // Mise en commun.
  const map = {}
  liste.forEach(b => {
    const cle = clePool(b)
    if (!map[cle]) map[cle] = { cle, propId: b.propId, categorie: b.categorie, biens: [] }
    map[cle].biens.push(b)
  })

  const pools = Object.values(map).map(pool => {
    const cat = dpaCategorie(pool.categorie) || { taux: 0, code: pool.categorie, label: '?' }
    const prop = pool.propId === VEH_PSEUDO_PROP ? null : propById(pool.propId)
    const nomProp = pool.propId === VEH_PSEUDO_PROP ? 'Véhicule / entreprise' : shortLabel((prop || {}).label || pool.propId)

    // Ouverture : surcharge manuelle d'un des biens, sinon report automatique.
    const surcharge = pool.biens.map(b => b.fnaccOuverture).find(v => v !== '' && v != null)
    let ouverture = surcharge != null && surcharge !== '' ? num(surcharge) : null
    let reportee = false
    if (ouverture == null) {
      const r = fnaccReportee(year, pool.cle)
      if (r != null) { ouverture = r; reportee = true } else { ouverture = 0 }
    }

    // Ajouts et dispositions de l'année.
    let ajouts = 0, ajoutsAII = 0, ajoutsDemi = 0, dispositions = 0
    pool.biens.forEach(b => {
      const amortissable = Math.max(0, num(b.cout) - num(b.coutTerrain))
      if (yearOf(b.dateAcquisition) === year && amortissable > 0) {
        // Catégorie 10.1 : coût plafonné par la limite de l'année d'acquisition.
        let base = amortissable
        if (String(b.categorie) === '10.1') {
          const plafond = fiscal(year).auto.plafondCat101
          const avecTaxes = plafond * (1 + fiscal(year).taxes.tps + fiscal(year).taxes.tvq)
          base = Math.min(base, avecTaxes)
        }
        ajouts += base
        if (admissibleAII(b, year)) ajoutsAII += base; else ajoutsDemi += base
      }
      if (b.dispositionDate && yearOf(b.dispositionDate) === year) {
        // Le moindre du produit et du coût en capital réduit la catégorie.
        dispositions += Math.min(num(b.dispositionProduit), Math.max(0, num(b.cout) - num(b.coutTerrain)))
      }
    })

    // Base de calcul. Le demi-taux ne frappe que les ajouts NETS des
    // dispositions (art. 1100(2)) : des dispositions supérieures aux ajouts
    // annulent la réduction, elles ne la rendent pas négative.
    const ajoutsNetsDemi = Math.max(0, ajoutsDemi - Math.max(0, dispositions - ajoutsAII))
    const reduction = ajoutsNetsDemi * 0.5
    const base = Math.max(0, ouverture + ajouts - dispositions - reduction)
    const dpaMax = base * cat.taux

    const reclamee = num((pool.biens[0] || {}).dpa && pool.biens[0].dpa[year])
    return {
      ...pool, cat, libelle: `${nomProp} — cat. ${cat.code} (${fmt(cat.taux * 100, 0)} %)`,
      nomProp, locatif: pool.propId !== VEH_PSEUDO_PROP,
      ouverture, reportee, ajouts, ajoutsAII, ajoutsDemi, dispositions, reduction,
      base, taux: cat.taux, dpaMax,
      reclamee, fermeture: Math.max(0, ouverture + ajouts - dispositions - reclamee),
      distincte: pool.cle.split('|').length === 3
    }
  })

  // ── Plafond de l'art. 1100(11) ──
  // La DPA de l'ENSEMBLE des immeubles locatifs ne peut excéder le revenu net
  // de location avant DPA. Calculé sur l'année active seulement : les totaux
  // d'une autre année ne sont pas accessibles aux fonctions de l'app.
  let plafondLocatif = null
  if (year === activeYear) {
    const revLoc = activeProps().reduce((s, p) => s + propTotals(p.id).rev, 0)
    const depLoc = activeProps().reduce((s, p) => s + propTotals(p.id).dep, 0)
    plafondLocatif = Math.max(0, revLoc - depLoc)
  }

  const res = {
    year, pools,
    total: pools.reduce((s, p) => s + p.reclamee, 0),
    totalLocatif: pools.filter(p => p.locatif).reduce((s, p) => s + p.reclamee, 0),
    maxLocatif: pools.filter(p => p.locatif).reduce((s, p) => s + p.dpaMax, 0),
    plafondLocatif
  }
  _dpaMemo[year] = res
  return res
}

// Admissibilité à l'incitatif à l'investissement accéléré : acquis après le
// 20 novembre 2018, prêt à être mis en service avant 2028, hors catégories
// exclues et hors acquisition auprès d'une personne liée.
function admissibleAII(b, year) {
  if (b.lie) return false
  if (CAT_SANS_AII.includes(String(b.categorie))) return false
  if (String(b.categorie) === '10.1') return false   // demi-taux maintenu
  const d = b.dateAcquisition || ''
  if (d < '2018-11-21') return false
  return year < 2028
}

function reclamerDPA(cle, montant) {
  if (guardClosed()) return
  const calc = calculDPA(activeYear)
  const pool = calc.pools.find(p => p.cle === cle)
  if (!pool) return
  const b = pool.biens[0]
  b.dpa = b.dpa || {}
  b.dpa[activeYear] = num(montant)
  invalidateDPA()
  autoSave()
}

function reclamerMaxDPA() {
  if (guardClosed()) return
  const calc = calculDPA(activeYear)
  // On sert d'abord les catégories au taux le plus élevé : à plafond égal,
  // c'est ce qui laisse le moins de FNACC dormante.
  const locatifs = calc.pools.filter(p => p.locatif).sort((a, b) => b.taux - a.taux)
  let reste = calc.plafondLocatif != null ? calc.plafondLocatif : Infinity
  locatifs.forEach(p => {
    const m = Math.min(p.dpaMax, Math.max(0, reste))
    reste -= m
    const b = p.biens[0]; b.dpa = b.dpa || {}; b.dpa[activeYear] = Math.round(m * 100) / 100
  })
  calc.pools.filter(p => !p.locatif).forEach(p => {
    const b = p.biens[0]; b.dpa = b.dpa || {}; b.dpa[activeYear] = Math.round(p.dpaMax * 100) / 100
  })
  invalidateDPA()
  save()
  toast('✅ DPA maximale réclamée')
  renderDPA(); refreshAll()
}

function renoncerDPA() {
  if (guardClosed()) return
  biens().forEach(b => { if (b.dpa) delete b.dpa[activeYear] })
  invalidateDPA()
  save()
  toast('↩️ Aucune DPA réclamée pour ' + activeYear)
  renderDPA(); refreshAll()
}

// ── AFFICHAGE ──────────────────────────────────────────────────────────────
function renderDPA() {
  const el = document.getElementById('dpa-body')
  if (!el) return
  invalidateDPA()
  const calc = calculDPA(activeYear)

  if (calc.pools.length === 0) {
    el.innerHTML = card('🏗 Déduction pour amortissement — ' + activeYear, `
      ${infoBox(`Aucun bien amortissable au registre. Inscrivez-y le <strong>bâtiment</strong> de
        chaque immeuble (catégorie 1, 4 %), les électroménagers et le mobilier (catégorie 8, 20 %),
        et le véhicule s'il sert à l'entreprise (catégorie 10 ou 10.1, 30 %).`)}
      ${warnBox(`Réclamer la DPA sur un bâtiment réduit l'impôt aujourd'hui mais crée une
        <strong>récupération imposable à 100 %</strong> à la revente, en plus du gain en capital.
        Sur un immeuble qui prend de la valeur, c'est souvent un report d'impôt, pas une économie.
        Ce registre sert aussi à décider de <strong>ne pas</strong> la réclamer en connaissance de cause.`)}
      <button class="btn btn-primary btn-full" onclick="nouveauBien()">➕ Ajouter un bien</button>
    `, 'brown')
    return
  }

  const rows = calc.pools.map(p => tr([
    `${escH(p.nomProp)}<br><span style="font-size:10px;color:var(--text2)">cat. ${escH(String(p.cat.code))} · ${fmt(p.taux * 100, 0)} %${p.distincte ? ' · classe distincte' : ''}</span>`,
    [money(p.ouverture) + (p.reportee ? '<br><span style="font-size:9px;color:var(--green)">reporté</span>' : ''), 'right'],
    [p.ajouts ? money(p.ajouts) : '—', 'right'],
    [money(p.dpaMax), 'right'],
    [`<input type="number" class="inp" style="width:84px;text-align:right;padding:5px;font-size:12px"
        step="0.01" min="0" max="${p.dpaMax.toFixed(2)}" value="${p.reclamee || ''}" placeholder="0,00"
        oninput="reclamerDPA('${escJS(p.cle)}',this.value)" onblur="renderDPA();refreshAll()">`, 'right'],
    [money(p.fermeture), 'right']
  ])).join('')

  const foot = tr(['TOTAL', [money(calc.pools.reduce((s, p) => s + p.ouverture, 0)), 'right'],
    [money(calc.pools.reduce((s, p) => s + p.ajouts, 0)), 'right'],
    [money(calc.pools.reduce((s, p) => s + p.dpaMax, 0)), 'right'],
    [money(calc.total), 'right'],
    [money(calc.pools.reduce((s, p) => s + p.fermeture, 0)), 'right']], 'total-tr')

  const depasse = calc.plafondLocatif != null && calc.totalLocatif > calc.plafondLocatif + 0.005
  const bride = calc.plafondLocatif != null && calc.maxLocatif > calc.plafondLocatif + 0.005

  const listeBiens = biens().map(b => {
    const cat = dpaCategorie(b.categorie) || {}
    const amort = Math.max(0, num(b.cout) - num(b.coutTerrain))
    const cumul = Object.values(b.dpa || {}).reduce((s, v) => s + num(v), 0)
    return `<div class="trip-item" onclick="ouvrirBien('${b.id}')">
      <div class="trip-dot" style="background:${b.propId === VEH_PSEUDO_PROP ? 'var(--brown)' : propColor(b.propId)}"></div>
      <div class="trip-info">
        <div class="trip-label">${escH(b.description || '(sans description)')}</div>
        <div class="trip-date">cat. ${escH(String(b.categorie))} · acquis ${escH(b.dateAcquisition || '?')}${b.dispositionDate ? ' · vendu ' + escH(b.dispositionDate) : ''}</div>
      </div>
      <div class="trip-amounts">
        <div class="trip-money">${money(amort)}</div>
        <div class="trip-km" style="font-size:10px">${cumul ? 'amorti ' + money(cumul) : 'jamais amorti'}</div>
      </div>
    </div>`
  }).join('')

  el.innerHTML = `
    ${card('🏗 Déduction pour amortissement — ' + activeYear, `
      ${bandeauRepli(activeYear)}
      <div class="summary-row">
        ${sumCard('DPA réclamée', money(calc.total), calc.total ? 'green' : 'gray',
                  'maximum ' + money(calc.pools.reduce((s, p) => s + p.dpaMax, 0)))}
        ${sumCard('Plafond locatif (1100(11))',
                  calc.plafondLocatif != null ? money(calc.plafondLocatif) : '—',
                  depasse ? 'red' : 'blue', 'revenu net avant DPA')}
      </div>
      ${depasse ? warnBox(`La DPA locative réclamée (${money(calc.totalLocatif)}) <strong>dépasse</strong>
          le revenu net de location avant DPA (${money(calc.plafondLocatif)}). L'art. 1100(11) l'interdit :
          la DPA ne peut ni créer ni augmenter une perte locative. Réduisez la réclamation —
          le solde reste dans la FNACC et servira plus tard.`) : ''}
      ${!depasse && bride ? infoBox(`Vous pourriez amortir jusqu'à ${money(calc.maxLocatif)} au total,
          mais l'art. 1100(11) limite la DPA locative à ${money(calc.plafondLocatif)} cette année.
          Le reste n'est pas perdu : il demeure dans la FNACC.`) : ''}
      ${table(['Catégorie', ['FNACC ouv.', 'right'], ['Ajouts', 'right'],
               ['DPA max.', 'right'], ['Réclamée', 'right'], ['FNACC clôt.', 'right']], [rows], foot)}
      <div class="cat-row" style="gap:6px;margin-top:10px">
        <button class="btn btn-primary btn-sm" style="flex:1" onclick="reclamerMaxDPA()">⬆️ Réclamer le maximum</button>
        <button class="btn btn-ghost btn-sm" style="flex:1" onclick="renoncerDPA()">↩️ Ne rien réclamer</button>
      </div>
      ${sourceNote(`Demi-taux l'année d'acquisition (art. 1100(2)) <strong>suspendu</strong> pour les biens
        admissibles à l'incitatif à l'investissement accéléré, prêts à être mis en service avant 2028 :
        ${money(calc.pools.reduce((s, p) => s + p.ajoutsAII, 0))} d'ajouts au taux plein,
        ${money(calc.pools.reduce((s, p) => s + p.ajoutsDemi, 0))} au demi-taux.`)}
    `, 'brown')}

    ${card('📋 Biens au registre — ' + biens().length, `
      ${listeBiens}
      <button class="btn btn-primary btn-full" style="margin-top:10px" onclick="nouveauBien()">➕ Ajouter un bien</button>
      <button class="btn btn-ghost btn-sm btn-full" style="margin-top:6px" onclick="ouvrirArbitrageDPA()">⚖️ Faut-il réclamer la DPA cette année ?</button>
      ${activeYear > 2000 && !biens().length ? '' : `<button class="btn btn-ghost btn-sm btn-full" style="margin-top:6px"
        onclick="importerBiensAnneePrecedente()">📥 Importer le registre de ${activeYear - 1}</button>`}
    `, 'dark')}`
}

// Chiffre l'arbitrage « déduire maintenant contre récupérer à la vente ».
function ouvrirArbitrageDPA() {
  const calc = calculDPA(activeYear)
  const dispo = Math.min(calc.maxLocatif, calc.plafondLocatif != null ? calc.plafondLocatif : calc.maxLocatif)
  const marginal = tauxMarginalEstime()
  const economie = dispo * marginal
  const cumulBatiments = biens()
    .filter(b => (dpaCategorie(b.categorie) || {}).batiment)
    .reduce((s, b) => s + Object.values(b.dpa || {}).reduce((t, v) => t + num(v), 0), 0)

  openSheet('⚖️ Réclamer la DPA cette année ?', `
    <div class="summary-row">
      ${sumCard('DPA disponible', money(dispo), 'blue')}
      ${sumCard('Économie d’impôt immédiate', money(economie), 'green', 'au taux marginal ' + fmt(marginal * 100, 1) + ' %')}
    </div>
    ${infoBox(`<strong>Ce que la DPA est vraiment</strong> : un report d'impôt, pas une exemption.
      Chaque dollar déduit aujourd'hui revient comme <strong>récupération d'amortissement imposable
      à 100 %</strong> l'année de la vente — au taux marginal d'alors, qui sera celui d'une année où
      vous encaissez aussi un gain en capital.`)}
    ${cumulBatiments > 0 ? warnBox(`DPA déjà réclamée sur les bâtiments, toutes années confondues :
      <strong>${money(cumulBatiments)}</strong>. C'est le montant qui sera récupéré à la vente.`) : ''}
    <div class="divider"></div>
    <div class="section-title">Quand la réclamer</div>
    ${table(['Situation', 'Réponse'], [
      tr(['Revenu élevé cette année, revenu plus faible prévu à la vente', '<strong>Oui</strong> — l’écart de taux marginal est un gain réel']),
      tr(['Immeuble conservé très longtemps', '<strong>Plutôt oui</strong> — le report a une valeur de trésorerie']),
      tr(['Vente prévue à court terme', '<strong>Non</strong> — récupération quasi immédiate, sans gain de taux']),
      tr(['Revenu locatif déjà en perte', '<strong>Impossible</strong> — art. 1100(11)']),
      tr(['Résidence devenue locative', '<strong>Prudence</strong> — la DPA peut faire perdre l’exemption pour résidence principale sur la période'])
    ])}
    ${sourceNote(`Le taux marginal retenu (${fmt(marginal * 100, 1)} %) est estimé par le module
      d'impôt à partir du revenu de l'année. Sur un immeuble locatif, beaucoup de propriétaires
      choisissent délibérément de ne pas réclamer la DPA sur le bâtiment et de la réclamer sur le
      mobilier (cat. 8) et les équipements, qui se déprécient réellement.`)}`)
}

// `anneeSource` est parametrable parce que la creation d'une nouvelle annee
// peut sauter une annee (2026 -> 2028) : prendre activeYear - 1 en dur ferait
// repartir la FNACC de zero sans le dire.
function importerBiensAnneePrecedente(anneeSource) {
  if (guardClosed()) return 0
  const an = anneeSource == null ? activeYear - 1 : parseInt(anneeSource, 10)
  const src = readYear(an)
  if (!src || !Array.isArray(src.biens) || !src.biens.length) {
    toast('⚠️ Aucun registre en ' + an); return 0
  }
  const existants = new Set(biens().map(b => b.id))
  let n = 0
  src.biens.forEach(b => {
    if (existants.has(b.id)) return
    // L'identifiant est CONSERVÉ : c'est lui qui relie le bien d'une année à
    // l'autre et permet le report automatique de la FNACC.
    biens().push({ ...b, fnaccOuverture: '', dpa: { ...(b.dpa || {}) } })
    n++
  })
  invalidateDPA()
  save()
  toast('📥 ' + n + ' bien(s) importé(s) de ' + an)
  renderDPA(); refreshAll()
  return n
}

registerModule({
  id: 'dpa',
  label: 'Déduction pour amortissement',
  render: renderDPA,
  onYearChange: invalidateDPA
})
