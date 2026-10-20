// ════════════════════════════════════════════════════════════════════════════
// simulateur.js — SIMULATEUR D'ACHAT ET DE REVENU
//
// « Si j'achète un quatrième immeuble à 450 000 $ » n'est pas une question de
// rendement théorique : c'est une question de LIQUIDITÉ. Un immeuble peut être
// rentable sur papier et coûter 300 $ par mois de sa poche.
//
// Trois choix qui font la différence entre un simulateur utile et un jouet :
//
// 1. L'hypothèque est calculée à la canadienne — intérêt composé
//    SEMESTRIELLEMENT, pas mensuellement. Un calcul à l'américaine surestime la
//    mensualité d'environ 1 %, ce qui suffit à inverser une décision serrée.
// 2. Le flux de trésorerie est séparé du résultat fiscal. Le capital remboursé
//    sort du compte sans être déductible ; la DPA se déduit sans rien coûter.
//    Confondre les deux est l'erreur classique.
// 3. Un test de résistance au renouvellement : +2 points de taux. C'est ce que
//    les prêteurs appliquent, et c'est le scénario qui met réellement en défaut.
// ════════════════════════════════════════════════════════════════════════════

function donneesSimu() {
  if (!state.simu) {
    state.simu = {
      prix: '', miseDeFonds: '', taux: '', amortissement: 25,
      loyerMensuel: '', vacancePct: 4,
      taxesMun: '', taxeScolaire: '', assurance: '', energie: '',
      entretienPct: 5, gestionPct: 0, autresDep: '',
      partTerrainPct: 20, pctPropriete: 100, mutation: '',
      inspection: 800, notaire: 1800, kmUberSupp: ''
    }
  }
  return state.simu
}

function majSimu(champ, val) {
  donneesSimu()[champ] = val
  autoSave()
  renderSimulateur()
}

// ── HYPOTHÈQUE ─────────────────────────────────────────────────────────────
// Au Canada, le taux affiché est nominal composé semestriellement (Loi sur
// l'intérêt, art. 6, pour les prêts amortis sur un bien-fonds). Le taux mensuel
// effectif est donc (1 + taux/2)^(1/6) − 1.
function tauxMensuelCanadien(tauxAnnuelNominal) {
  return Math.pow(1 + tauxAnnuelNominal / 2, 1 / 6) - 1
}

function paiementHypothecaire(capital, tauxAnnuel, annees) {
  if (capital <= 0 || annees <= 0) return 0
  const i = tauxMensuelCanadien(tauxAnnuel)
  const n = annees * 12
  if (i <= 0) return capital / n
  return capital * i / (1 - Math.pow(1 + i, -n))
}

// Intérêt et capital de la PREMIÈRE année : seul l'intérêt est déductible.
function premiereAnnee(capital, tauxAnnuel, annees) {
  const i = tauxMensuelCanadien(tauxAnnuel)
  const pmt = paiementHypothecaire(capital, tauxAnnuel, annees)
  let solde = capital, interet = 0, principal = 0
  for (let m = 0; m < 12; m++) {
    const int = solde * i
    const cap = Math.min(pmt - int, solde)
    interet += int; principal += cap; solde -= cap
    if (solde <= 0) break
  }
  return { pmt, interet, principal, soldeFin: Math.max(0, solde) }
}

// ── DROITS DE MUTATION ─────────────────────────────────────────────────────
function droitsMutationEstimes(prix) {
  const m = fiscal().mutation
  if (!m) return null
  const base = impotParPaliers(prix, m.paliers).impot
  return { montant: base, note: m.note, seuilMunicipal: m.seuilMunicipal,
           tauxMaxMunicipal: m.tauxMaxMunicipal,
           excedent: Math.max(0, prix - m.seuilMunicipal) }
}

// ── ASSURANCE PRÊT HYPOTHÉCAIRE ────────────────────────────────────────────
// Un immeuble de revenu NON occupé par le propriétaire exige 20 % de mise de
// fonds : aucune assurance SCHL n'est disponible. Le dire évite une simulation
// à 10 % qui n'existe pas sur le marché.
function miseDeFondsSuffisante(prix, mise) {
  return prix > 0 ? mise / prix >= 0.20 : true
}

// ── SIMULATION ─────────────────────────────────────────────────────────────
function simuler() {
  const d = donneesSimu()
  const prix = num(d.prix)
  const mise = num(d.miseDeFonds)
  const capital = Math.max(0, prix - mise)
  const tauxAnn = num(d.taux) / 100
  const annees = num(d.amortissement) || 25
  const part = (num(d.pctPropriete) || 100) / 100

  const hyp = premiereAnnee(capital, tauxAnn, annees)
  const mut = droitsMutationEstimes(prix)
  const mutantion = d.mutation !== '' ? num(d.mutation) : (mut ? mut.montant : 0)

  // Revenus
  const loyerBrut = num(d.loyerMensuel) * 12
  const vacance = loyerBrut * (num(d.vacancePct) / 100)
  const revenuEffectif = loyerBrut - vacance

  // Dépenses d'exploitation (hors hypothèque) : ce sont elles qui définissent
  // le résultat net d'exploitation, référence des comparaisons entre immeubles.
  const entretien = revenuEffectif * (num(d.entretienPct) / 100)
  const gestion = revenuEffectif * (num(d.gestionPct) / 100)
  const exploitation = num(d.taxesMun) + num(d.taxeScolaire) + num(d.assurance)
                     + num(d.energie) + entretien + gestion + num(d.autresDep)
  const rno = revenuEffectif - exploitation   // résultat net d'exploitation

  // Flux de trésorerie : le service de la dette complet sort du compte.
  const serviceDette = hyp.pmt * 12
  const flux = rno - serviceDette

  // Résultat fiscal : l'intérêt est déductible, le capital remboursé ne l'est pas.
  const resultatAvantDPA = rno - hyp.interet
  // DPA possible sur la part bâtiment, catégorie 1 à 4 %. L'AII suspend la règle
  // du demi-taux jusqu'en 2027 inclus pour un bien prêt à être mis en service.
  const partBatiment = prix * (1 - num(d.partTerrainPct) / 100)
  const anneeAII = activeYear <= 2027
  const dpaMax = partBatiment * 0.04 * (anneeAII ? 1 : 0.5)
  // Art. 1100(11) : la DPA ne peut créer ni augmenter une perte locative.
  const dpaUtile = Math.max(0, Math.min(dpaMax, resultatAvantDPA))
  const resultatImposable = resultatAvantDPA - dpaUtile

  const marginal = typeof tauxMarginalEstime === 'function' ? tauxMarginalEstime() : 0.40
  const impot = resultatImposable * marginal * part
  const fluxApresImpot = flux * part - impot

  // Rendements
  const capRate = prix > 0 ? rno / prix : 0
  const rendementMise = mise > 0 ? flux / mise : 0
  const rcd = serviceDette > 0 ? rno / serviceDette : 0  // ratio de couverture de la dette

  // Test de résistance : +2 points au renouvellement.
  const hypStress = premiereAnnee(hyp.soldeFin, tauxAnn + 0.02, annees - 1)
  const fluxStress = rno - hypStress.pmt * 12

  const comptant = mise + mutantion + num(d.inspection) + num(d.notaire)

  return {
    d, prix, mise, capital, tauxAnn, annees, part, hyp, mut, mutantion,
    loyerBrut, vacance, revenuEffectif, entretien, gestion, exploitation, rno,
    serviceDette, flux, resultatAvantDPA, partBatiment, dpaMax, dpaUtile,
    resultatImposable, marginal, impot, fluxApresImpot,
    capRate, rendementMise, rcd, hypStress, fluxStress, comptant, anneeAII,
    miseOK: miseDeFondsSuffisante(prix, mise),
    prixParPorte: null
  }
}

// ── SCÉNARIO « ROULER PLUS EN UBER » ───────────────────────────────────────
// Le km supplémentaire ne rapporte pas le revenu moyen par km : il rapporte le
// revenu brut MOINS le carburant et l'usure, et il déplace le prorata d'affaires
// du véhicule, ce qui augmente aussi la part déductible des frais fixes.
function simulerUber() {
  const km = num(donneesSimu().kmUberSupp)
  if (!km) return null
  const kmUber = num((state.uber || {}).km_online)
  const kmTotal = num(state.settings.kmTotalAnnuel)
  const revUber = typeof uberNetIncome === 'function' ? uberNetIncome() : 0
  if (kmUber <= 0) return { km, impossible: true }

  const revParKm = revUber / kmUber
  const revSupp = revParKm * km

  const vehDep = VEH_CATS.reduce((s, c) => s + num(state.vehicule.depenses[c]), 0)
  // Les frais variables (carburant, huile, pneus, réparations) croissent avec
  // les km ; l'immatriculation et l'assurance, non.
  const VARIABLES = ['Frais de carburant (total annuel)', 'Changement d\'huile',
                     'Achat et changement de pneus', 'Frais de réparation',
                     'Autres réparations / accessoires']
  const depVariables = VARIABLES.reduce((s, c) => s + num(state.vehicule.depenses[c]), 0)
  const coutParKm = kmTotal > 0 ? depVariables / kmTotal : 0
  const coutSupp = coutParKm * km

  // Le prorata d'affaires monte : le total annuel grossit aussi des mêmes km.
  const prorataAvant = kmTotal > 0 ? kmUber / kmTotal : 0
  const prorataApres = (kmTotal + km) > 0 ? (kmUber + km) / (kmTotal + km) : 0
  const deductionAvant = vehDep * prorataAvant
  const deductionApres = (vehDep + coutSupp) * prorataApres

  const marginal = typeof tauxMarginalEstime === 'function' ? tauxMarginalEstime() : 0.40
  const f = fiscal()
  // Cotisations sur le revenu d'entreprise supplémentaire : RRQ (les deux parts)
  // et RQAP. Elles s'ajoutent à l'impôt marginal et sont souvent oubliées.
  const tauxCotis = f.rrq.tauxAutonome + f.rqap.taux
  const beneficeSupp = revSupp - (deductionApres - deductionAvant)
  const impotSupp = beneficeSupp * (marginal + tauxCotis)
  // TPS/TVQ : perçues en sus et remises, elles ne sont pas un revenu. Le CTI/RTI
  // sur les frais variables supplémentaires, lui, revient au chauffeur.
  const ctiSupp = coutSupp * (f.taxes.tps + f.taxes.tvq) / (1 + f.taxes.tps + f.taxes.tvq)

  return {
    km, revParKm, revSupp, coutParKm, coutSupp, depVariables,
    prorataAvant, prorataApres, deductionAvant, deductionApres,
    beneficeSupp, impotSupp, tauxCotis, marginal, ctiSupp,
    netEnPoche: revSupp - coutSupp - impotSupp + ctiSupp,
    netParKm: km > 0 ? (revSupp - coutSupp - impotSupp + ctiSupp) / km : 0
  }
}

// ── APPLIQUER LE SCÉNARIO ──────────────────────────────────────────────────
// Transforme la simulation en immeuble réel : c'est ce qui évite de ressaisir
// douze mois de loyer et six postes de dépenses après la signature.
function creerImmeubleDepuisSimu() {
  const s = simuler()
  if (!s.prix) { toast('⚠️ Indiquez au moins le prix d’achat'); return }
  if (guardClosed()) return
  const nom = prompt('Nom de l’immeuble à créer :', 'Nouvel immeuble')
  if (!nom) return
  const id = newPropId()
  propsList().push({
    id, label: nom, kind: 'plex', subtype: '',
    revenus: ['Logement 1'], deductibles: [...STD_DEDUCTIBLES],
    capital: defaultCapital(['Logement 1']),
    address: '', distanceKm: 0,
    pct: num(s.d.pctPropriete) || 100, coOwners: ''
  })
  saveSetup()
  ensurePropBucket(id)
  // Les montants annuels sont répartis sur douze mois : plus proche de la
  // réalité qu'un montant unique en janvier, et le PDF mensuel reste lisible.
  const mensualiser = (section, cat, annuel) => {
    if (!annuel) return
    const m = annuel / 12
    for (let mi = 0; mi < 12; mi++) setMonthlyVal(id, section, cat, mi, m.toFixed(2))
  }
  mensualiser('revenus', 'Logement 1', num(s.d.loyerMensuel) * 12)
  mensualiser('deductibles', 'Taxes municipales', num(s.d.taxesMun))
  mensualiser('deductibles', 'Taxe scolaire', num(s.d.taxeScolaire))
  mensualiser('deductibles', 'Assurance habitation', num(s.d.assurance))
  mensualiser('deductibles', 'Électricité', num(s.d.energie))
  mensualiser('deductibles', 'Entretien / Réparations courantes', s.entretien)
  mensualiser('deductibles', 'Intérêts sur hypothèque / frais bancaires', s.hyp.interet)
  save()
  renderPropSubtabs()
  refreshAll()
  toast('🏠 « ' + nom + ' » créé avec les hypothèses du simulateur', 4200)
}

// ── AFFICHAGE ──────────────────────────────────────────────────────────────
function champSimu(label, champ, suffixe, aide) {
  return `<div class="field">
    <label>${label}${suffixe ? ' <span style="opacity:.6">(' + suffixe + ')</span>' : ''}</label>
    <input type="number" class="inp" step="any" value="${escH(donneesSimu()[champ])}"
      oninput="majSimu('${champ}',this.value)">
    ${aide ? sourceNote(aide) : ''}
  </div>`
}

function renderSimulateur() {
  const el = document.getElementById('simu-body')
  if (!el) return
  const s = simuler()
  const u = simulerUber()
  const signe = v => v >= 0 ? 'green' : 'orange'

  el.innerHTML = `
    ${bandeauRepli()}

    ${card('🏠 Hypothèses d’achat', `
      <div class="cat-row" style="gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:130px">${champSimu('Prix d’achat', 'prix', '$')}</div>
        <div style="flex:1;min-width:130px">${champSimu('Mise de fonds', 'miseDeFonds', '$')}</div>
      </div>
      <div class="cat-row" style="gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:110px">${champSimu('Taux', 'taux', '% / an')}</div>
        <div style="flex:1;min-width:110px">${champSimu('Amortissement', 'amortissement', 'ans')}</div>
        <div style="flex:1;min-width:110px">${champSimu('Ma part', 'pctPropriete', '%')}</div>
      </div>
      ${!s.miseOK && s.prix ? warnBox(`Mise de fonds de
        <strong>${fmt(s.prix > 0 ? s.mise / s.prix * 100 : 0, 1)} %</strong>. Un immeuble de revenu
        non occupé par le propriétaire exige <strong>20 %</strong> : l’assurance de la SCHL n’est
        pas offerte. La simulation reste affichée, mais ce financement n’existe pas sur le marché.`) : ''}
      <div class="cat-row" style="gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:130px">${champSimu('Loyers', 'loyerMensuel', '$ / mois', 'Total de tous les logements.')}</div>
        <div style="flex:1;min-width:110px">${champSimu('Vacance', 'vacancePct', '%', 'Logement vide + mauvaises créances.')}</div>
      </div>
    `, 'blue')}

    ${card('💸 Dépenses annuelles prévues', `
      <div class="cat-row" style="gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px">${champSimu('Taxes municipales', 'taxesMun', '$')}</div>
        <div style="flex:1;min-width:120px">${champSimu('Taxe scolaire', 'taxeScolaire', '$')}</div>
      </div>
      <div class="cat-row" style="gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px">${champSimu('Assurance', 'assurance', '$')}</div>
        <div style="flex:1;min-width:120px">${champSimu('Énergie payée', 'energie', '$')}</div>
      </div>
      <div class="cat-row" style="gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:110px">${champSimu('Entretien', 'entretienPct', '% des loyers', 'Un plex ancien : 7 à 10 %.')}</div>
        <div style="flex:1;min-width:110px">${champSimu('Gestion', 'gestionPct', '% des loyers')}</div>
        <div style="flex:1;min-width:110px">${champSimu('Autres', 'autresDep', '$')}</div>
      </div>
    `, 'dark')}

    ${card('📊 Résultat', `
      <div class="summary-row">
        ${sumCard('Résultat net d’exploitation', money(s.rno), signe(s.rno), 'avant hypothèque')}
        ${sumCard('Flux de trésorerie', money(s.flux), signe(s.flux), fmt(s.flux / 12) + ' $ / mois')}
        ${sumCard('Après impôt (ma part)', money(s.fluxApresImpot), signe(s.fluxApresImpot))}
      </div>
      ${table(['Poste', ['Annuel', 'right'], ['Mensuel', 'right']], [
        tr(['Loyers bruts', [money(s.loyerBrut), 'right'], [money(s.loyerBrut / 12), 'right']]),
        tr([`Vacance et mauvaises créances (${fmt(num(s.d.vacancePct), 1)} %)`,
            ['−' + money(s.vacance), 'right'], ['−' + money(s.vacance / 12), 'right']]),
        tr(['Revenu effectif', [money(s.revenuEffectif), 'right'], [money(s.revenuEffectif / 12), 'right']], 'total-tr'),
        tr(['Dépenses d’exploitation', ['−' + money(s.exploitation), 'right'], ['−' + money(s.exploitation / 12), 'right']]),
        tr(['<strong>Résultat net d’exploitation</strong>', ['<strong>' + money(s.rno) + '</strong>', 'right'],
            [money(s.rno / 12), 'right']], 'total-tr'),
        tr([`Hypothèque (intérêt ${money(s.hyp.interet)} + capital ${money(s.hyp.principal)})`,
            ['−' + money(s.serviceDette), 'right'], ['−' + money(s.hyp.pmt), 'right']]),
        tr(['<strong>Flux de trésorerie</strong>', ['<strong>' + money(s.flux) + '</strong>', 'right',
            s.flux < 0 ? 'color:#C62828' : 'color:var(--green)'], [money(s.flux / 12), 'right']], 'total-tr')
      ])}
      ${sourceNote(`Mensualité calculée à la canadienne : taux nominal composé
        <strong>semestriellement</strong> (Loi sur l’intérêt, art. 6), soit un taux mensuel effectif
        de ${fmt(tauxMensuelCanadien(s.tauxAnn) * 100, 4)} %.`)}
    `, 'green')}

    ${card('🧾 Résultat fiscal', `
      ${table(['Poste', ['Montant', 'right']], [
        tr(['Résultat net d’exploitation', [money(s.rno), 'right']]),
        tr(['Intérêt hypothécaire (déductible)', ['−' + money(s.hyp.interet), 'right']]),
        tr(['Revenu locatif avant DPA', [money(s.resultatAvantDPA), 'right']], 'total-tr'),
        tr([`DPA catégorie 1 à 4 % sur ${money(s.partBatiment, 0)} de bâtiment${s.anneeAII ? ' (taux plein, IIA)' : ' (demi-taux)'}`,
            ['max. ' + money(s.dpaMax), 'right']]),
        tr(['DPA réellement utilisable', ['−' + money(s.dpaUtile), 'right']]),
        tr(['<strong>Revenu imposable</strong>', ['<strong>' + money(s.resultatImposable) + '</strong>', 'right']], 'total-tr'),
        tr([`Impôt au taux marginal de ${fmt(s.marginal * 100, 1)} % × ma part de ${fmt(s.part * 100, 0)} %`,
            ['−' + money(s.impot), 'right']])
      ])}
      ${infoBox(`Le <strong>capital remboursé (${money(s.hyp.principal)})</strong> sort du compte sans
        être déductible : c'est pourquoi un immeuble peut afficher un revenu imposable positif et un
        flux de trésorerie négatif. À l'inverse, la <strong>DPA</strong> réduit l'impôt sans rien
        coûter — mais sera récupérée à la vente.`)}
      ${s.dpaMax > s.dpaUtile ? warnBox(`La DPA est plafonnée à ${money(s.dpaUtile)} :
        <strong>elle ne peut pas créer de perte locative</strong> (Règl. de l'impôt, art. 1100(11)).`) : ''}
    `, 'brown')}

    ${card('📐 Indicateurs et résistance', `
      <div class="summary-row">
        ${sumCard('Taux de capitalisation', fmt(s.capRate * 100, 2) + ' %',
          s.capRate >= 0.05 ? 'green' : 'orange', 'RNE ÷ prix')}
        ${sumCard('Rendement sur mise de fonds', fmt(s.rendementMise * 100, 2) + ' %', signe(s.rendementMise))}
        ${sumCard('Couverture de la dette', fmt(s.rcd, 2),
          s.rcd >= 1.2 ? 'green' : 'orange', 'les prêteurs exigent 1,10 à 1,25')}
      </div>
      ${table(['Scénario', ['Mensualité', 'right'], ['Flux annuel', 'right']], [
        tr([`Taux actuel ${fmt(s.tauxAnn * 100, 2)} %`, [money(s.hyp.pmt), 'right'], [money(s.flux), 'right']]),
        tr([`<strong>Renouvellement à ${fmt((s.tauxAnn + 0.02) * 100, 2)} %</strong>`,
            [money(s.hypStress.pmt), 'right'],
            [money(s.fluxStress), 'right', s.fluxStress < 0 ? 'color:#C62828' : '']], 'total-tr')
      ])}
      ${s.fluxStress < 0 && s.flux >= 0 ? warnBox(`À +2 points au renouvellement, le flux devient
        <strong>négatif de ${money(Math.abs(s.fluxStress / 12))} par mois</strong>. C'est le test que
        les prêteurs appliquent — et le scénario qui force une vente.`) : ''}
    `, 'dark')}

    ${card('💰 Comptant nécessaire à la clôture', `
      ${table(['Poste', ['Montant', 'right']], [
        tr(['Mise de fonds', [money(s.mise), 'right']]),
        tr(['Droits de mutation (estimation)', [money(s.mutantion), 'right']]),
        tr(['Inspection', [money(num(s.d.inspection)), 'right']]),
        tr(['Notaire', [money(num(s.d.notaire)), 'right']]),
        tr(['<strong>TOTAL</strong>', ['<strong>' + money(s.comptant) + '</strong>', 'right']], 'total-tr')
      ])}
      <div class="cat-row" style="gap:8px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px">${champSimu('Droits de mutation', 'mutation', '$', 'Laisser vide pour l’estimation.')}</div>
        <div style="flex:1;min-width:110px">${champSimu('Inspection', 'inspection', '$')}</div>
        <div style="flex:1;min-width:110px">${champSimu('Notaire', 'notaire', '$')}</div>
      </div>
      ${s.mut ? sourceNote(`${escH(s.mut.note)}
        ${s.mut.excedent > 0 ? `<br><strong>${money(s.mut.excedent, 0)}</strong> de la base dépasse
        ${money(s.mut.seuilMunicipal, 0)} : la municipalité peut y appliquer jusqu’à
        ${fmt(s.mut.tauxMaxMunicipal * 100, 0)} %, soit ${money(s.mut.excedent * s.mut.tauxMaxMunicipal)}
        de plus que l’estimation. Vérifiez le barème de la ville.` : ''}`) : ''}
    `, 'dark')}

    ${card('✅ Appliquer', `
      ${infoBox(`Après la signature : crée l’immeuble avec ces hypothèses réparties sur douze mois,
        au lieu de ressaisir une centaine de cellules.`)}
      <button class="btn btn-primary btn-full" onclick="creerImmeubleDepuisSimu()">
        🏠 Créer cet immeuble dans ${activeYear}</button>
    `, 'green')}

    ${card('🚗 Rouler plus en Uber', `
      <div class="field">
        <label>Kilomètres supplémentaires sur l’année</label>
        <input type="number" class="inp" step="100" value="${escH(donneesSimu().kmUberSupp)}"
          oninput="majSimu('kmUberSupp',this.value)">
      </div>
      ${!u ? sourceNote('Indiquez un nombre de kilomètres pour voir l’effet.')
        : u.impossible ? warnBox('Aucun kilomètre Uber saisi pour ' + activeYear + ' : impossible de calculer un revenu par kilomètre.')
        : `<div class="summary-row">
            ${sumCard('Net en poche', money(u.netEnPoche), signe(u.netEnPoche),
              fmt(u.netParKm, 3) + ' $ / km')}
            ${sumCard('Revenu brut', money(u.revSupp), 'blue', fmt(u.revParKm, 3) + ' $ / km')}
          </div>
          ${table(['Poste', ['Montant', 'right']], [
            tr([`Revenu supplémentaire (${fmt(u.km, 0)} km × ${fmt(u.revParKm, 3)} $)`, [money(u.revSupp), 'right']]),
            tr([`Carburant et usure (${fmt(u.coutParKm, 3)} $ / km)`, ['−' + money(u.coutSupp), 'right']]),
            tr([`Part déductible du véhicule : ${fmt(u.prorataAvant * 100, 1)} % → ${fmt(u.prorataApres * 100, 1)} %`,
                ['+' + money(u.deductionApres - u.deductionAvant), 'right']]),
            tr(['Bénéfice imposable supplémentaire', [money(u.beneficeSupp), 'right']], 'total-tr'),
            tr([`Impôt ${fmt(u.marginal * 100, 1)} % + RRQ/RQAP ${fmt(u.tauxCotis * 100, 1)} %`,
                ['−' + money(u.impotSupp), 'right']]),
            tr(['CTI / RTI récupérés sur les frais', ['+' + money(u.ctiSupp), 'right']]),
            tr(['<strong>Net en poche</strong>', ['<strong>' + money(u.netEnPoche) + '</strong>', 'right']], 'total-tr')
          ])}
          ${sourceNote(`Le kilomètre supplémentaire ne rapporte pas le revenu moyen : il rapporte le
            revenu brut moins le carburant et l’usure, et moins l’impôt <strong>et les cotisations</strong>.
            Les cotisations au RRQ et au RQAP sur un revenu d’entreprise sont souvent oubliées dans
            ce calcul — elles pèsent ici ${fmt(u.tauxCotis * 100, 1)} points.`)}`}
    `, 'brown')}`
}

registerModule({
  id: 'simulateur',
  label: 'Simulateur',
  render: renderSimulateur
})
