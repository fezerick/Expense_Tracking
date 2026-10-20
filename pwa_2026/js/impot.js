// ════════════════════════════════════════════════════════════════════════════
// impot.js — IMPÔT ESTIMÉ, COTISATIONS ET ACOMPTES PROVISIONNELS
//
// L'app s'arrêtait au bénéfice. Or la seule question qui compte en cours
// d'année est : COMBIEN METTRE DE CÔTÉ. Un revenu locatif et un revenu Uber ne
// font l'objet d'aucune retenue à la source ; la facture arrive en avril, et
// Revenu Québec comme l'ARC exigent des acomptes dès 1 800 $ d'impôt net.
//
// Ce module assemble les assiettes d'imposition et produit une estimation. Tous
// les taux viennent de fiscal-data.js, aucun n'est codé ici.
//
// Distinctions qui changent le résultat et que l'app ignorait :
//
// • Le loyer net est un REVENU DE BIENS : aucune cotisation au RRQ, aucune
//   cotisation au FSS, aucun RQAP. Uber et Lyft sont un REVENU D'ENTREPRISE :
//   les trois s'appliquent.
// • Le RRQ d'un travailleur autonome se paie en entier (part employé + part
//   employeur) : la moitié de la cotisation de base est déductible et l'autre
//   moitié donne un crédit, la cotisation supplémentaire est entièrement
//   déductible.
// • Un résident du Québec bénéficie de l'abattement fédéral de 16,5 %.
// ════════════════════════════════════════════════════════════════════════════

function donneesImpot() {
  if (!state.impot) state.impot = {}
  const d = state.impot
  if (!Array.isArray(d.acomptesFed)) d.acomptesFed = ['', '', '', '']
  if (!Array.isArray(d.acomptesQc)) d.acomptesQc = ['', '', '', '']
  return d
}

function lyftNetIncome() {
  return Array.from({ length: 12 }, (_, mi) => state.lyft[mi] || {})
    .reduce((s, m) => s + num(m.taxable) + num(m.bonuses) + num(m.tips) - num(m.fees), 0)
}

// Part des dépenses du véhicule imputable à l'activité commerciale.
function vehiculeProrataAffaires() {
  const kmTotal = num(state.settings.kmTotalAnnuel)
  if (kmTotal <= 0) return { uber: 0, lyft: 0, total: 0 }
  const dep = VEH_CATS.reduce((s, c) => s + num(state.vehicule.depenses[c]), 0)
  const uber = dep * num(state.uber.km_online) / kmTotal
  const lyft = dep * getLyftKmTotal() / kmTotal
  return { uber, lyft, total: uber + lyft }
}

// DPA réclamée, séparée entre le locatif et l'entreprise : les deux ne jouent
// pas sur les mêmes assiettes.
function dpaReclameeParUsage() {
  if (typeof calculDPA !== 'function') return { locatif: 0, entreprise: 0 }
  const c = calculDPA(activeYear)
  return {
    locatif: c.pools.filter(p => p.locatif).reduce((s, p) => s + p.reclamee, 0),
    entreprise: c.pools.filter(p => !p.locatif).reduce((s, p) => s + p.reclamee, 0)
  }
}

// ── ASSIETTES ──────────────────────────────────────────────────────────────
function assiettes() {
  const d = donneesImpot()
  const mProps = setup.modules.props
  const mRide = setup.modules.rideshare

  const revLoc = mProps ? activeProps().reduce((s, p) => s + propTotals(p.id).rev, 0) : 0
  const depLoc = mProps ? activeProps().reduce((s, p) => s + propTotals(p.id).dep, 0) : 0
  const dpa = dpaReclameeParUsage()
  const netLocAvantDPA = revLoc - depLoc
  const netLoc = netLocAvantDPA - dpa.locatif

  const veh = vehiculeProrataAffaires()
  const revEnt = mRide ? uberNetIncome() + lyftNetIncome() : 0
  const depEnt = mRide ? veh.total + dpa.entreprise : 0
  // Un revenu d'entreprise négatif ne cotise pas au RRQ ; il réduit en revanche
  // le revenu total imposable.
  const netEnt = revEnt - depEnt

  const t4 = num(d.revenuT4)
  const autres = num(d.autresRevenus)
  const gainsDejaCotises = num(d.gainsRRQCotises)

  const rrq  = cotisationRRQ(Math.max(0, netEnt), gainsDejaCotises, activeYear)
  const rqap = cotisationRQAP(Math.max(0, netEnt), activeYear)
  // Le FSS porte sur le revenu d'entreprise ET le revenu de placement (dont le
  // revenu de location) d'un particulier résidant au Québec.
  const fss  = cotisationFSS(Math.max(0, netEnt) + Math.max(0, netLoc), activeYear)

  // Déductions dans le calcul du revenu : part déductible du RRQ et prime RQAP.
  const deductionsCotisations = rrq.deductible + rqap.montant
  const revenuTotal = t4 + netLoc + netEnt + autres
  const revenuNet = Math.max(0, revenuTotal - deductionsCotisations - num(d.autresDeductions))

  return {
    revLoc, depLoc, netLocAvantDPA, netLoc, dpaLoc: dpa.locatif,
    revEnt, depEnt, netEnt, dpaEnt: dpa.entreprise, veh,
    t4, autres, gainsDejaCotises,
    rrq, rqap, fss,
    deductionsCotisations, revenuTotal, revenuNet
  }
}

// ── IMPÔT ──────────────────────────────────────────────────────────────────
function calculImpot() {
  const a = assiettes()
  const f = fiscal()
  const d = donneesImpot()

  // ── Fédéral ──
  const fedBrut = impotParPaliers(a.revenuNet, f.fed.paliers)
  const bpaFed = bpaFederal(a.revenuNet, activeYear)
  // Crédits non remboursables au taux de la première tranche : montant
  // personnel de base + moitié de la cotisation de base au RRQ.
  const creditsFed = (bpaFed + a.rrq.credit) * f.fed.tauxCreditBase
  const fedApresCredits = Math.max(0, fedBrut.impot - creditsFed)
  const abattement = fedApresCredits * f.fed.abattementQc
  const fedNet = fedApresCredits - abattement

  // ── Québec ──
  const qcBrut = impotParPaliers(a.revenuNet, f.qc.paliers)
  const creditsQc = (f.qc.bpa + a.rrq.credit) * f.qc.tauxCreditBase
  const qcNet = Math.max(0, qcBrut.impot - creditsQc)

  // ── Total à payer ──
  const cotisations = a.rrq.total + a.rqap.montant + a.fss.montant
  const retenues = num(d.impotRetenuFed) + num(d.impotRetenuQc)
  const totalAvantRetenues = fedNet + qcNet + cotisations
  const acomptesVerses = d.acomptesFed.reduce((s, v) => s + num(v), 0)
                       + d.acomptesQc.reduce((s, v) => s + num(v), 0)
  const solde = totalAvantRetenues - retenues - acomptesVerses

  // Taux marginal combiné : fédéral après abattement + Québec.
  const marginal = fedBrut.marginal * (1 - f.fed.abattementQc) + qcBrut.marginal

  // ── Impôt attribuable aux seuls revenus non retenus à la source ──
  // C'est la provision à constituer : ce que l'app peut dire d'utile en juin.
  const sansRevenusApp = (() => {
    const base = Math.max(0, a.t4 + a.autres - num(d.autresDeductions))
    const fb = impotParPaliers(base, f.fed.paliers)
    const qb = impotParPaliers(base, f.qc.paliers)
    const cf = Math.max(0, fb.impot - bpaFederal(base, activeYear) * f.fed.tauxCreditBase)
    const cq = Math.max(0, qb.impot - f.qc.bpa * f.qc.tauxCreditBase)
    return cf * (1 - f.fed.abattementQc) + cq
  })()
  const provision = Math.max(0, totalAvantRetenues - sansRevenusApp)

  return {
    ...a, f, fedBrut, bpaFed, creditsFed, fedApresCredits, abattement, fedNet,
    qcBrut, creditsQc, qcNet, cotisations, retenues, acomptesVerses,
    totalAvantRetenues, solde, marginal, provision,
    tauxEffectif: a.revenuNet > 0 ? totalAvantRetenues / a.revenuNet : 0
  }
}

// Utilisé par le module DPA pour chiffrer l'arbitrage, et par le simulateur.
function tauxMarginalEstime() {
  try { return calculImpot().marginal } catch (e) { return 0.40 }
}

// ── ACOMPTES PROVISIONNELS ─────────────────────────────────────────────────
// Deux méthodes admises : sans calcul (montants envoyés par l'administration,
// fondés sur l'année précédente) ou méthode du « montant estimé » de l'année
// courante. L'app propose la seconde, qui est la seule qu'elle puisse calculer.
function calculAcomptes() {
  const c = calculImpot()
  const f = fiscal()
  const d = donneesImpot()

  // Impôt net de l'année, hors retenues à la source.
  const netFed = Math.max(0, c.fedNet - num(d.impotRetenuFed))
  const netQc = Math.max(0, c.qcNet + c.cotisations - num(d.impotRetenuQc))

  const requisFed = netFed > f.acomptes.seuilFed
  const requisQc = netQc > f.acomptes.seuilQc

  const dates = f.acomptes.dates.map(md => activeYear + '-' + md)
  const auj = new Date().toISOString().slice(0, 10)

  const versements = dates.map((date, i) => ({
    date,
    echue: date < auj,
    fed: requisFed ? netFed / 4 : 0,
    qc: requisQc ? netQc / 4 : 0,
    verseFed: num(d.acomptesFed[i]),
    verseQc: num(d.acomptesQc[i])
  }))

  return { requisFed, requisQc, netFed, netQc, versements, seuil: f.acomptes.seuilFed }
}

function majImpot(champ, val) {
  if (guardClosed()) return
  donneesImpot()[champ] = val
  autoSave()
  renderImpot()
}

function majAcompte(palier, i, val) {
  if (guardClosed()) return
  const d = donneesImpot()
  d[palier][i] = val
  autoSave()
  renderImpot()
}

// ── AFFICHAGE ──────────────────────────────────────────────────────────────
function renderImpot() {
  const el = document.getElementById('impot-body')
  if (!el) return
  const c = calculImpot()
  const ac = calculAcomptes()
  const d = donneesImpot()

  const lignesRevenus = [
    c.t4 ? tr(['Salaire (T4 / relevé 1)', [money(c.t4), 'right'], ['retenu à la source', 'right']]) : '',
    setup.modules.props ? tr(['Revenu net de location', [money(c.netLoc), 'right'],
      [c.dpaLoc ? 'après DPA de ' + money(c.dpaLoc) : 'aucune DPA', 'right']]) : '',
    setup.modules.rideshare ? tr(['Revenu net d’entreprise (Uber, Lyft)', [money(c.netEnt), 'right'],
      [money(c.depEnt) + ' de dépenses', 'right']]) : '',
    c.autres ? tr(['Autres revenus', [money(c.autres), 'right'], ['', 'right']]) : '',
    tr(['Déduction — cotisations RRQ et RQAP', [`<span style="color:#C00000">− ${fmt(c.deductionsCotisations)} $</span>`, 'right'], ['', 'right']]),
    num(d.autresDeductions) ? tr(['Autres déductions', [`<span style="color:#C00000">− ${fmt(num(d.autresDeductions))} $</span>`, 'right'], ['', 'right']]) : ''
  ].filter(Boolean)

  const lignesImpot = [
    tr(['Impôt fédéral avant crédits', [money(c.fedBrut.impot), 'right']]),
    tr([`Crédits (montant personnel ${money(c.bpaFed)} + RRQ)`, [`<span style="color:#C00000">− ${fmt(c.creditsFed)} $</span>`, 'right']]),
    tr([`Abattement du Québec (${fmt(c.f.fed.abattementQc * 100, 1)} %)`, [`<span style="color:#C00000">− ${fmt(c.abattement)} $</span>`, 'right']]),
    tr(['<strong>Impôt fédéral net</strong>', [`<strong>${money(c.fedNet)}</strong>`, 'right']]),
    tr(['Impôt du Québec avant crédits', [money(c.qcBrut.impot), 'right']]),
    tr([`Crédits (montant personnel ${money(c.f.qc.bpa)} + RRQ)`, [`<span style="color:#C00000">− ${fmt(c.creditsQc)} $</span>`, 'right']]),
    tr(['<strong>Impôt du Québec net</strong>', [`<strong>${money(c.qcNet)}</strong>`, 'right']]),
    c.rrq.total ? tr([`Cotisation au RRQ — travailleur autonome`, [money(c.rrq.total), 'right']]) : '',
    c.rqap.montant ? tr(['Cotisation au RQAP', [money(c.rqap.montant), 'right']]) : '',
    c.fss.montant ? tr(['Cotisation au FSS (annexe F)', [money(c.fss.montant), 'right']]) : ''
  ].filter(Boolean)

  const lignesAcomptes = ac.versements.map((v, i) => tr([
    fmtDateLongue(v.date) + (v.echue ? ' <span style="font-size:10px;color:#C00000">échu</span>' : ''),
    [v.fed ? money(v.fed) : '—', 'right'],
    [v.qc ? money(v.qc) : '—', 'right'],
    [`<input type="number" class="inp" style="width:72px;text-align:right;padding:4px;font-size:11px"
        step="0.01" value="${escH(d.acomptesFed[i])}" placeholder="0"
        oninput="majAcompte('acomptesFed',${i},this.value)">`, 'right'],
    [`<input type="number" class="inp" style="width:72px;text-align:right;padding:4px;font-size:11px"
        step="0.01" value="${escH(d.acomptesQc[i])}" placeholder="0"
        oninput="majAcompte('acomptesQc',${i},this.value)">`, 'right']
  ])).join('')

  el.innerHTML = `
    ${card('🧾 Impôt estimé ' + activeYear, `
      ${bandeauRepli(activeYear)}
      <div class="summary-row">
        ${sumCard('À provisionner', money(c.provision), c.provision > 0 ? 'orange' : 'green',
                  'impôt des revenus sans retenue')}
        ${sumCard('Taux marginal', fmt(c.marginal * 100, 1) + ' %', 'blue',
                  'prochain dollar gagné')}
      </div>
      <div class="summary-row">
        ${sumCard('Impôt et cotisations', money(c.totalAvantRetenues), 'brown',
                  fmt(c.tauxEffectif * 100, 1) + ' % du revenu net')}
        ${sumCard(c.solde >= 0 ? 'Solde à payer' : 'Remboursement attendu',
                  money(Math.abs(c.solde)), c.solde > 0 ? 'red' : 'green',
                  'retenues et acomptes déduits')}
      </div>
      ${warnBox(`<strong>Estimation</strong>. Elle ne tient compte que du montant personnel de base
        et des crédits liés au RRQ : ni personnes à charge, ni frais de garde, ni REER, ni crédits
        de solidarité ou de TPS. Elle sert à provisionner, pas à produire une déclaration.`)}
    `, 'dark')}

    ${card('📥 Vos autres revenus', `
      ${infoBox(`Sans votre salaire, l'estimation est fausse : c'est lui qui détermine la tranche
        d'imposition dans laquelle tombe le revenu locatif et le revenu Uber.`)}
      <div class="field">
        <label>Salaire brut imposable (case A du relevé 1)</label>
        <input type="number" class="inp" step="0.01" value="${escH(d.revenuT4)}" placeholder="0,00"
          oninput="majImpot('revenuT4',this.value)">
      </div>
      <div class="cat-row" style="gap:8px">
        <div class="field" style="flex:1">
          <label>Impôt fédéral retenu</label>
          <input type="number" class="inp" step="0.01" value="${escH(d.impotRetenuFed)}"
            oninput="majImpot('impotRetenuFed',this.value)">
        </div>
        <div class="field" style="flex:1">
          <label>Impôt du Québec retenu</label>
          <input type="number" class="inp" step="0.01" value="${escH(d.impotRetenuQc)}"
            oninput="majImpot('impotRetenuQc',this.value)">
        </div>
      </div>
      <div class="field">
        <label>Gains ouvrant droit à pension déjà cotisés (case 26 du T4)</label>
        <input type="number" class="inp" step="0.01" value="${escH(d.gainsRRQCotises)}" placeholder="0,00"
          oninput="majImpot('gainsRRQCotises',this.value)">
        ${sourceNote(`Indispensable : sans ce montant, l'app recotiserait au RRQ sur une tranche de
          revenu déjà cotisée par votre employeur, et surestimerait la facture de plusieurs
          milliers de dollars.`)}
      </div>
      <div class="cat-row" style="gap:8px">
        <div class="field" style="flex:1">
          <label>Autres revenus</label>
          <input type="number" class="inp" step="0.01" value="${escH(d.autresRevenus)}"
            oninput="majImpot('autresRevenus',this.value)">
        </div>
        <div class="field" style="flex:1">
          <label>Autres déductions (REER…)</label>
          <input type="number" class="inp" step="0.01" value="${escH(d.autresDeductions)}"
            oninput="majImpot('autresDeductions',this.value)">
        </div>
      </div>
    `, 'blue')}

    ${card('📊 Détail du calcul', `
      <div class="section-title">Revenu net</div>
      ${table(['Source', ['Montant', 'right'], ['Note', 'right']], lignesRevenus,
              tr(['<strong>Revenu net</strong>', [`<strong>${money(c.revenuNet)}</strong>`, 'right'], ['', 'right']], 'total-tr'))}
      <div class="section-title" style="margin-top:14px">Impôt et cotisations</div>
      ${table(['Poste', ['Montant', 'right']], lignesImpot,
              tr(['<strong>TOTAL</strong>', [`<strong>${money(c.totalAvantRetenues)}</strong>`, 'right']], 'total-tr'))}
      ${c.rrq.total ? sourceNote(`RRQ : ${money(c.rrq.base)} de cotisation de base et
        ${money(c.rrq.supp)} de cotisation supplémentaire. ${money(c.rrq.deductible)} sont déductibles
        du revenu, ${money(c.rrq.credit)} donnent un crédit d'impôt. Le RRQ ne porte que sur le revenu
        d'entreprise — jamais sur le loyer net, qui est un revenu de biens.`) : ''}
      ${c.fss.montant ? sourceNote(`FSS : calculé sur ${money(Math.max(0, c.netEnt) + Math.max(0, c.netLoc))}
        de revenu assujetti (revenu d'entreprise et revenu de placement), selon la grille de
        l'annexe F.`) : ''}
    `, 'green')}

    ${card('📅 Acomptes provisionnels ' + activeYear, `
      ${!ac.requisFed && !ac.requisQc
        ? infoBox(`Aucun acompte exigé : l'impôt net estimé reste sous le seuil de
            ${money(ac.seuil)} au fédéral comme au Québec. Le seuil est de ${money(ac.seuil)} —
            et non 3 000 $ — parce que vous résidez au Québec.`)
        : `${warnBox(`Des acomptes sont exigés : impôt net estimé de ${money(ac.netFed)} au fédéral
             et ${money(ac.netQc)} au Québec, au-delà du seuil de ${money(ac.seuil)}.
             Les intérêts sur acompte insuffisant ne sont pas déductibles.`)}
           ${table(['Échéance', ['Fédéral', 'right'], ['Québec', 'right'], ['Versé féd.', 'right'], ['Versé Qc', 'right']],
                   [lignesAcomptes],
                   tr(['TOTAL', [money(ac.versements.reduce((s, v) => s + v.fed, 0)), 'right'],
                       [money(ac.versements.reduce((s, v) => s + v.qc, 0)), 'right'],
                       [money(ac.versements.reduce((s, v) => s + v.verseFed, 0)), 'right'],
                       [money(ac.versements.reduce((s, v) => s + v.verseQc, 0)), 'right']], 'total-tr'))}`}
      ${sourceNote(`Méthode du montant estimé de l'année courante : le total estimé divisé en quatre.
        L'administration envoie aussi des montants « sans calcul » fondés sur vos deux années
        précédentes — les verser met à l'abri des intérêts même si l'estimation change.`)}
    `, 'brown')}`
}

function fmtDateLongue(iso) {
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('fr-CA', { day: 'numeric', month: 'long' })
}

// Bandeau d'accueil : la provision à constituer, visible sans chercher.
function renderBandeauProvision() {
  const el = document.getElementById('home-provision')
  if (!el) return
  let c
  try { c = calculImpot() } catch (e) { el.innerHTML = ''; return }
  if (c.provision <= 0) { el.innerHTML = ''; return }
  const ac = calculAcomptes()
  const prochain = ac.versements.find(v => !v.echue)
  el.innerHTML = `<div class="sum-card orange" style="margin-bottom:10px;cursor:pointer" onclick="showTab('fiscal')">
    <div class="s-lbl">💰 Provision d’impôt à constituer</div>
    <div class="s-val sm">${money(c.provision)}</div>
    <div style="font-size:10px;opacity:.8;margin-top:2px">
      ${prochain ? 'prochain acompte le ' + fmtDateLongue(prochain.date) : 'au titre de ' + activeYear}
      · taux marginal ${fmt(c.marginal * 100, 1)} %
    </div>
  </div>`
}

registerModule({
  id: 'impot',
  label: 'Impôt et acomptes',
  render: renderImpot
})
