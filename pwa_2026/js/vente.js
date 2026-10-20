// ════════════════════════════════════════════════════════════════════════════
// vente.js — SIMULATEUR DE VENTE D'UN IMMEUBLE (§ E.6)
//
// Le simulateur d'ACHAT répondait à « est-ce que ça s'autofinance ? ». Celui-ci
// répond à la question qui coûte le plus cher quand on y répond de travers :
// « combien me reste-t-il vraiment si je vends ? »
//
// Trois montants que les vendeurs découvrent trop tard :
//
// 1. La RÉCUPÉRATION DE DPA. Chaque dollar de DPA réclamé pendant la détention
//    revient dans le revenu de l'année de la vente, imposé à 100 % — pas à
//    50 % comme le gain en capital. La DPA n'est donc pas une économie : c'est
//    un REPORT. L'app le dit déjà dans le module DPA ; ici elle le chiffre.
// 2. Le GAIN EN CAPITAL, imposable à 50 %. La DPA réclamée ne réduit PAS le
//    prix de base rajusté d'un immeuble : gain et récupération se calculent
//    séparément, et s'additionnent dans la même déclaration.
// 3. Le SAUT DE PALIER. Récupération et gain imposable tombent dans une seule
//    année. Appliquer le taux marginal courant sous-estime l'impôt : ce module
//    recalcule l'impôt par paliers sur le revenu de l'année de vente.
//
// Règles implémentées, avec leur source :
//
// • Taux d'inclusion du gain en capital : LA MOITIÉ (`fiscal().gainCapital`).
//   La hausse aux deux tiers du budget fédéral de 2024 a été reportée puis
//   annulée le 21 mars 2025 ; l'ARC applique de nouveau la moitié.
// • Récupération de l'amortissement : le moindre du produit de disposition et
//   du coût en capital réduit la FNACC de la catégorie ; ce qui passe sous
//   zéro est inclus au revenu (art. 13(1), guide T4036).
// • Le TERRAIN n'est pas amortissable : seule la part attribuée au bâtiment
//   déclenche la récupération. La ventilation du prix de vente entre terrain
//   et bâtiment doit être raisonnable — c'est le point le plus souvent
//   contesté lors d'une vérification.
// • Perte finale : si la FNACC excède le produit après disposition de TOUT le
//   contenu de la catégorie, le solde se déduit en entier (art. 20(16)). Mais
//   l'art. 13(21.1) réattribue le produit au bâtiment quand le terrain est
//   vendu en gain et le bâtiment en perte, ce qui annule souvent la perte
//   finale : le module avertit au lieu de la promettre.
// • Catégorie 10.1 : ni récupération ni perte finale — exclue du calcul.
// ════════════════════════════════════════════════════════════════════════════

const VENTE_COMMISSION_DEFAUT = 5      // % du prix, courtier immobilier
const CAT_SANS_RECUPERATION = ['10.1'] // art. 13(2) : la cat. 10.1 en est exclue

function donneesVente() {
  if (!state.vente) {
    state.vente = {
      propId: '', prixVente: '', commissionPct: VENTE_COMMISSION_DEFAUT,
      notaire: 1500, certificat: 1200, penaliteHypo: '', autresFrais: '',
      soldeHypo: '', partTerrainPct: '', ameliorations: '', pctPropriete: ''
    }
  }
  return state.vente
}

function majVente(champ, val) {
  if (guardClosed()) return
  donneesVente()[champ] = val
  autoSave()
  renderVente()
}

// Immeuble visé : celui choisi, sinon le premier actif.
function venteProp() {
  const d = donneesVente()
  return propById(d.propId) || activeProps()[0] || null
}

// ── IMPÔT PAR PALIERS SUR UN REVENU DONNÉ ──────────────────────────────────
// Reproduit la mécanique de calculImpot() pour un revenu imposable arbitraire,
// afin de mesurer l'impôt ADDITIONNEL d'une vente. Un taux marginal unique ne
// suffit pas : une vente fait souvent traverser deux ou trois paliers.
function impotCombineSur(revenu, year) {
  const f = fiscal(year)
  const fb = impotParPaliers(revenu, f.fed.paliers)
  const qb = impotParPaliers(revenu, f.qc.paliers)
  const credFed = Math.max(0, fb.impot - bpaFederal(revenu, year) * f.fed.tauxCreditBase)
  const credQc = Math.max(0, qb.impot - f.qc.bpa * f.qc.tauxCreditBase)
  return {
    impot: credFed * (1 - f.fed.abattementQc) + credQc,
    marginal: fb.marginal * (1 - f.fed.abattementQc) + qb.marginal
  }
}

function calculVente() {
  const d = donneesVente()
  const f = fiscal()
  const prop = venteProp()
  const prix = num(d.prixVente)

  // ── Coût d'acquisition, lu dans le registre des biens amortissables ──
  // C'est la même source que la DPA : aucune ressaisie, donc aucun risque que
  // les deux écrans se contredisent.
  const calc = calculDPA(activeYear)
  const pools = prop ? calc.pools.filter(p => p.propId === prop.id) : []
  const biensProp = prop ? biens().filter(b => b.propId === prop.id) : []

  const coutTotal = biensProp.reduce((s, b) => s + num(b.cout), 0)
  const coutTerrain = biensProp.reduce((s, b) => s + num(b.coutTerrain), 0)
  const coutBatiment = Math.max(0, coutTotal - coutTerrain)
  const ameliorations = num(d.ameliorations)

  // Prix de base rajusté. La DPA réclamée ne le réduit PAS : c'est l'erreur la
  // plus répandue sur un immeuble locatif.
  const pbr = coutTotal + ameliorations

  // ── Ventilation du prix de vente ──
  // À défaut de saisie, on reprend la proportion de l'acquisition, ce qui est
  // la position la plus défendable en l'absence d'évaluation.
  const partTerrainAcq = coutTotal > 0 ? coutTerrain / coutTotal : 0
  const partTerrain = d.partTerrainPct !== '' && d.partTerrainPct != null
    ? Math.min(1, Math.max(0, num(d.partTerrainPct) / 100))
    : partTerrainAcq
  const produitTerrain = prix * partTerrain
  const produitBatiment = prix - produitTerrain

  // ── Frais de vente (« dépenses engagées » au sens du calcul du gain) ──
  const commission = prix * num(d.commissionPct) / 100
  const fraisVente = commission + num(d.notaire) + num(d.certificat)
                   + num(d.autresFrais) + num(d.penaliteHypo)

  // ── Récupération de DPA, catégorie par catégorie ──
  // Le produit attribué au bâtiment se répartit entre les catégories au
  // prorata de leur coût amortissable.
  const poolsRecup = pools.filter(p => !CAT_SANS_RECUPERATION.includes(String(p.categorie)))
  const coutPools = poolsRecup.reduce((s, p) =>
    s + Math.max(0, p.biens.reduce((t, b) => t + num(b.cout) - num(b.coutTerrain), 0)), 0)

  const detailPools = poolsRecup.map(p => {
    const coutP = Math.max(0, p.biens.reduce((t, b) => t + num(b.cout) - num(b.coutTerrain), 0))
    const part = coutPools > 0 ? coutP / coutPools : 0
    const produitP = produitBatiment * part
    // Le moindre du produit et du coût en capital : au-delà du coût, c'est du
    // gain en capital, pas de la récupération.
    const reduction = Math.min(produitP, coutP)
    const fnacc = p.fermeture
    return {
      libelle: p.libelle, coutP, produitP, fnacc,
      recuperation: Math.max(0, reduction - fnacc),
      perteFinale: Math.max(0, fnacc - reduction)
    }
  })

  const recuperation = detailPools.reduce((s, p) => s + p.recuperation, 0)
  const perteFinale = detailPools.reduce((s, p) => s + p.perteFinale, 0)

  // ── Gain en capital ──
  const gainBrut = prix - pbr - fraisVente
  const tauxInclusion = (f.gainCapital || { tauxInclusion: 0.5 }).tauxInclusion
  const gain = Math.max(0, gainBrut)
  const perteCapital = Math.max(0, -gainBrut)
  const gainImposable = gain * tauxInclusion

  // ── Part de l'utilisateur ──
  // Un immeuble en indivision ne s'impose pas en entier dans SA déclaration.
  const pct = d.pctPropriete !== '' && d.pctPropriete != null
    ? Math.min(100, Math.max(0, num(d.pctPropriete)))
    : (prop && prop.pct !== '' && prop.pct != null ? num(prop.pct) : 100)
  const part = pct / 100

  const maRecuperation = recuperation * part
  const maPerteFinale = perteFinale * part
  const monGainImposable = gainImposable * part

  // ── Impôt de l'année de vente ──
  // Base : le revenu net de l'année courante tel que le module d'impôt le
  // calcule. L'ajout traverse les paliers, d'où le calcul différentiel.
  let revenuBase = 0
  try { revenuBase = calculImpot().revenuNet } catch (e) { revenuBase = 0 }
  const ajout = maRecuperation + monGainImposable - maPerteFinale
  const avant = impotCombineSur(revenuBase, activeYear)
  const apres = impotCombineSur(Math.max(0, revenuBase + ajout), activeYear)
  const impotVente = Math.max(0, apres.impot - avant.impot)
  const tauxReelVente = ajout > 0 ? impotVente / ajout : 0

  // ── Ce qui reste en poche ──
  const soldeHypo = num(d.soldeHypo)
  const netAvantImpot = prix - fraisVente - soldeHypo
  const net = netAvantImpot * part - impotVente

  // ── Arbitrage : réclamer la DPA maintenant, ou pas ? ──
  // Un dollar de DPA réclamé aujourd'hui économise le taux marginal courant et
  // revient à 100 % au taux de l'année de vente. L'arbitrage est favorable si
  // le taux courant dépasse le taux de l'année de vente — l'inverse de ce que
  // l'intuition suggère quand on ne pense qu'à l'économie immédiate.
  const marginalCourant = avant.marginal
  const marginalVente = apres.marginal
  const dpaMaxRestante = pools.reduce((s, p) => s + Math.max(0, p.dpaMax - p.reclamee), 0)
  const arbitrage = {
    marginalCourant, marginalVente, dpaMaxRestante,
    economieImmediate: dpaMaxRestante * marginalCourant,
    coutALaVente: dpaMaxRestante * part * marginalVente,
    favorable: marginalCourant >= marginalVente
  }

  return {
    prop, prix, coutTotal, coutTerrain, coutBatiment, ameliorations, pbr,
    partTerrain, partTerrainAcq, produitTerrain, produitBatiment,
    commission, fraisVente, detailPools, recuperation, perteFinale,
    gainBrut, gain, perteCapital, gainImposable, tauxInclusion,
    pct, part, maRecuperation, maPerteFinale, monGainImposable,
    revenuBase, ajout, impotVente, tauxReelVente, marginalCourant, marginalVente,
    soldeHypo, netAvantImpot, net, arbitrage,
    sansRegistre: biensProp.length === 0
  }
}

// ── RENDU ──────────────────────────────────────────────────────────────────

function champVente(label, champ, suffixe, aide, placeholder) {
  return `<div class="field">
    <label>${label}${suffixe ? ' <span style="opacity:.6">(' + suffixe + ')</span>' : ''}</label>
    <input type="number" class="inp" step="any" value="${escH(donneesVente()[champ])}"
      placeholder="${escH(placeholder || '')}"
      oninput="majVente('${champ}',this.value)">
    ${aide ? sourceNote(aide) : ''}
  </div>`
}

function renderVente() {
  const el = document.getElementById('vente-body')
  if (!el) return
  if (!setup.modules.props) { el.innerHTML = ''; return }

  const props = activeProps()
  if (!props.length) {
    el.innerHTML = card('💰 Simulateur de vente',
      infoBox(`Aucun immeuble configuré : ce simulateur chiffre la vente d'un immeuble
        existant, avec sa récupération de DPA et son gain en capital.`), 'brown')
    return
  }

  const d = donneesVente()
  const v = calculVente()
  const choix = props.map(p =>
    `<option value="${escH(p.id)}"${(v.prop && p.id === v.prop.id) ? ' selected' : ''}>
       ${escH(shortLabel(p.label))}</option>`).join('')

  el.innerHTML = card('💰 Si je vends — impôt et produit net', `
    ${infoBox(`La DPA réclamée pendant la détention <strong>revient au revenu l'année de la
      vente, imposée à 100 %</strong>, alors que le gain en capital ne l'est qu'à
      ${fmt(v.tauxInclusion * 100, 0)} %. Ce simulateur additionne les deux et recalcule
      l'impôt par paliers, parce qu'une vente fait presque toujours changer de tranche.`)}

    <div class="field">
      <label>Immeuble</label>
      <select class="inp" onchange="majVente('propId',this.value)">${choix}</select>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:140px">${champVente('Prix de vente', 'prixVente', '$')}</div>
      <div style="flex:1;min-width:120px">${champVente('Commission', 'commissionPct', '% du prix',
        'Courtier immobilier : 4 à 6 % selon le mandat. Mettre 0 pour une vente sans courtier.')}</div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:120px">${champVente('Notaire', 'notaire', '$')}</div>
      <div style="flex:1;min-width:120px">${champVente('Certificat de localisation', 'certificat', '$')}</div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:120px">${champVente('Pénalité hypothécaire', 'penaliteHypo', '$',
        'Remboursement anticipé. Son traitement dépend de l’art. 18(9.1) : porté ici en frais de ' +
        'vente, à confirmer avec votre comptable.')}</div>
      <div style="flex:1;min-width:120px">${champVente('Autres frais', 'autresFrais', '$',
        'Arpenteur, quittance, mise en valeur, frais juridiques.')}</div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:120px">${champVente('Solde hypothécaire', 'soldeHypo', '$',
        'Ne change pas l’impôt — seulement ce qui reste en poche.')}</div>
      <div style="flex:1;min-width:120px">${champVente('Améliorations capitalisées', 'ameliorations', '$',
        'Dépenses de nature capitale non inscrites au registre des biens. Elles augmentent le ' +
        'prix de base rajusté et réduisent le gain.')}</div>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <div style="flex:1;min-width:120px">${champVente('Part du terrain', 'partTerrainPct', '% du prix',
        `Vide = la proportion de l’acquisition (${fmt(v.partTerrainAcq * 100, 1)} %). ` +
        'Le terrain n’est pas amortissable : lui attribuer plus réduit la récupération, mais la ' +
        'ventilation doit rester raisonnable — c’est le point le plus vérifié.',
        fmt(v.partTerrainAcq * 100, 1))}</div>
      <div style="flex:1;min-width:120px">${champVente('Ma part', 'pctPropriete', '%',
        'Vide = la part saisie pour l’immeuble.', String(v.pct))}</div>
    </div>

    ${v.sansRegistre
      ? warnBox(`Aucun bien n'est inscrit au registre (sous-onglet <strong>DPA</strong>) pour cet
          immeuble : sans coût d'acquisition, le gain en capital et la récupération ne peuvent pas
          être calculés. Inscrivez-y l'immeuble — c'est la même donnée qui sert à la DPA.`)
      : ''}

    <div class="summary-row">
      ${sumCard('Produit net en poche', money(v.net), v.net >= 0 ? 'green' : 'red',
                `votre part (${fmt(v.pct, 0)} %), impôt et hypothèque déduits`)}
      ${sumCard('Impôt de la vente', money(v.impotVente), v.impotVente > 0 ? 'red' : 'green',
                v.ajout > 0 ? fmt(v.tauxReelVente * 100, 1) + ' % du revenu ajouté' : 'aucun revenu ajouté')}
    </div>
    <div class="summary-row">
      ${sumCard('Récupération de DPA', money(v.maRecuperation), v.maRecuperation > 0 ? 'orange' : 'green',
                'imposée à 100 %')}
      ${sumCard('Gain en capital imposable', money(v.monGainImposable), 'brown',
                `${fmt(v.tauxInclusion * 100, 0)} % de ${money(v.gain * v.part)}`)}
    </div>

    ${table(['Calcul du gain en capital', ['Montant', 'right']], [[
      tr(['Prix de vente', [money(v.prix), 'right']]),
      tr(['Prix de base rajusté (coût d’acquisition + améliorations)',
          [`<span style="color:#C00000">− ${fmt(v.pbr)} $</span>`, 'right']]),
      tr([`Frais de vente (dont commission ${money(v.commission)})`,
          [`<span style="color:#C00000">− ${fmt(v.fraisVente)} $</span>`, 'right']]),
      tr([v.gainBrut >= 0 ? '<strong>Gain en capital</strong>' : '<strong>Perte en capital</strong>',
          [`<strong>${money(Math.abs(v.gainBrut))}</strong>`, 'right']]),
      tr([`Portion imposable (${fmt(v.tauxInclusion * 100, 0)} %) — 100 %  de l’immeuble`,
          [money(v.gainImposable), 'right']]),
      tr([`<strong>Votre part (${fmt(v.pct, 0)} %)</strong>`,
          [`<strong>${money(v.monGainImposable)}</strong>`, 'right']])
    ].join('')])}

    ${v.detailPools.length ? table(
      ['Récupération par catégorie', ['Produit attribué', 'right'], ['FNACC', 'right'], ['Récupération', 'right']],
      [v.detailPools.map(p => tr([
        p.libelle,
        [money(p.produitP), 'right'],
        [money(p.fnacc), 'right'],
        [p.recuperation > 0 ? `<span style="color:#C00000">${money(p.recuperation)}</span>`
          : (p.perteFinale > 0 ? `<span style="color:#0A7A0A">perte finale ${money(p.perteFinale)}</span>` : '—'),
         'right']
      ])).join('')],
      tr(['TOTAL — 100 % de l’immeuble',
          [money(v.produitBatiment), 'right'],
          [money(v.detailPools.reduce((s, p) => s + p.fnacc, 0)), 'right'],
          [money(v.recuperation), 'right']], 'total-tr')) : ''}

    ${v.perteFinale > 0 ? warnBox(`Une <strong>perte finale</strong> de ${money(v.perteFinale)}
      apparaît : la FNACC dépasse le produit attribué au bâtiment. Elle ne se déduit que si TOUT
      le contenu de la catégorie est vendu, et l'art. 13(21.1) réattribue le produit au bâtiment
      quand le terrain se vend en gain — ce qui l'annule souvent. À faire valider avant de compter
      dessus.`) : ''}

    ${sourceNote(`Ventilation du prix : ${fmt(v.partTerrain * 100, 1)} % au terrain
      (${money(v.produitTerrain)}) et ${money(v.produitBatiment)} au bâtiment. Seule la part du
      bâtiment déclenche la récupération.`)}

    ${table(['Impôt de l’année de vente', ['Montant', 'right']], [[
      tr(['Revenu net estimé de l’année, avant la vente', [money(v.revenuBase), 'right']]),
      tr(['Récupération de DPA — votre part', [money(v.maRecuperation), 'right']]),
      tr(['Gain en capital imposable — votre part', [money(v.monGainImposable), 'right']]),
      v.maPerteFinale ? tr(['Perte finale déduite',
        [`<span style="color:#0A7A0A">− ${fmt(v.maPerteFinale)} $</span>`, 'right']]) : '',
      tr(['<strong>Revenu imposable de l’année de vente</strong>',
          [`<strong>${money(Math.max(0, v.revenuBase + v.ajout))}</strong>`, 'right']]),
      tr([`<strong>Impôt additionnel dû à la vente</strong>`,
          [`<strong style="color:#C00000">${money(v.impotVente)}</strong>`, 'right']]),
      tr([`Taux marginal — avant la vente ${fmt(v.marginalCourant * 100, 1)} %,
           après ${fmt(v.marginalVente * 100, 1)} %`, ['', 'right']])
    ].filter(Boolean).join('')])}

    ${table(['Ce qui reste en poche', ['Montant', 'right']], [[
      tr(['Prix de vente', [money(v.prix), 'right']]),
      tr(['Frais de vente', [`<span style="color:#C00000">− ${fmt(v.fraisVente)} $</span>`, 'right']]),
      tr(['Solde hypothécaire remboursé', [`<span style="color:#C00000">− ${fmt(v.soldeHypo)} $</span>`, 'right']]),
      tr([`Sous-total — 100 % de l’immeuble`, [money(v.netAvantImpot), 'right']]),
      tr([`Votre part (${fmt(v.pct, 0)} %)`, [money(v.netAvantImpot * v.part), 'right']]),
      tr(['Impôt de la vente', [`<span style="color:#C00000">− ${fmt(v.impotVente)} $</span>`, 'right']]),
      tr(['<strong>Produit net</strong>', [`<strong>${money(v.net)}</strong>`, 'right']])
    ].join('')])}

    ${v.arbitrage.dpaMaxRestante > 0 ? infoBox(`
      <strong>Réclamer la DPA restante cette année ?</strong>
      Il reste ${money(v.arbitrage.dpaMaxRestante)} de DPA réclamable sur cet immeuble.
      La réclamer économise ${money(v.arbitrage.economieImmediate)} aujourd'hui
      (taux marginal ${fmt(v.arbitrage.marginalCourant * 100, 1)} %) et coûtera
      ${money(v.arbitrage.coutALaVente)} à la vente
      (taux ${fmt(v.arbitrage.marginalVente * 100, 1)} % sur votre part).
      ${v.arbitrage.favorable
        ? `À ce scénario de vente, la réclamer reste <strong>avantageux</strong> : le taux
           d'aujourd'hui est au moins aussi élevé que celui de l'année de vente, et l'impôt
           reporté est de l'argent gardé entre-temps.`
        : `À ce scénario de vente, la réclamer serait <strong>désavantageux</strong> : la vente
           vous place dans une tranche plus élevée qu'aujourd'hui, et chaque dollar de DPA
           reviendrait plus cher qu'il n'a rapporté. Reste à soupeser l'avantage de garder
           l'argent d'ici là.`}`) : ''}

    ${sourceNote(`Estimation. Elle ne tient pas compte de la cotisation au FSS sur la
      récupération (revenu de biens), d'une réserve pour gain en capital si le prix est encaissé
      sur plusieurs années, ni d'un changement d'usage. Aucune exemption pour résidence
      principale n'est appliquée : un immeuble locatif n'y a pas droit.`)}
  `, 'brown')
}

registerModule({
  id: 'vente',
  label: 'Simulateur de vente',
  render: renderVente
})
