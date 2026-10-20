// ════════════════════════════════════════════════════════════════════════════
// tps-tvq.js — DÉCLARATION DE TPS/TVQ SUR LE REVENU DE TRANSPORT
//
// Les champs `gst_*` et `qst_*` existaient déjà dans les relevés Uber importés,
// mais rien n'en faisait une déclaration. Pourtant :
//
// • Un chauffeur de transport rémunéré de personnes doit s'inscrire aux
//   fichiers de la TPS et de la TVQ DÈS LE PREMIER DOLLAR : le seuil de
//   30 000 $ du « petit fournisseur » ne s'applique pas à cette activité.
// • Au Québec, Uber perçoit et verse les taxes au nom du chauffeur, mais le
//   chauffeur reste tenu de PRODUIRE sa déclaration (FPZ-500) et peut y
//   réclamer ses CTI/RTI — crédits que personne ne réclame à sa place.
// • Le loyer résidentiel est une fourniture EXONÉRÉE : aucune taxe à percevoir,
//   et surtout AUCUN CTI/RTI sur les dépenses d'immeuble résidentiel. Mélanger
//   les deux activités est l'erreur classique, et coûteuse en vérification.
// ════════════════════════════════════════════════════════════════════════════

// Toutes les dépenses du véhicule ne portent pas de taxes : les droits de la
// SAAQ (immatriculation, permis) n'en portent pas, et l'assurance est un
// service financier exonéré. Réclamer un CTI dessus est un redressement garanti.
const VEH_TAXABLE = {
  'Frais de plaque / immatriculation': false,
  'Frais de carburant (total annuel)': true,
  'Frais d\'assurance': false,
  'Frais de permis de conduire': false,
  'Changement d\'huile': true,
  'Achat et changement de pneus': true,
  'Frais de réparation': true,
  'Autres réparations / accessoires': true,
  'Forfait annuel téléphone': true,
  'Autres dépenses véhicule': true
}

function donneesTaxes() {
  if (!state.taxes) state.taxes = {}
  return state.taxes
}

// Extrait la part de taxe d'un montant TOUTES TAXES COMPRISES.
// Au Québec la TVQ s'applique sur le prix hors TPS depuis 2013 : un montant
// TTC vaut donc P × (1 + 0,05 + 0,09975).
function contenuTaxes(montantTTC, year) {
  const t = fiscal(year).taxes
  const facteur = 1 + t.tps + t.tvq
  return {
    ht: montantTTC / facteur,
    tps: montantTTC * t.tps / facteur,
    tvq: montantTTC * t.tvq / facteur
  }
}

function calculTaxes() {
  const f = fiscal()
  const d = donneesTaxes()
  const uv = k => num((state.uber || {})[k])
  // Les lignes de taxes de Lyft sont mensuelles : `lyftTaxTotals()` les cumule.
  // Tant qu'elles étaient ignorées, la ligne 101 comptait les fournitures
  // taxables de Lyft (`lyftTaxableBase()`) sans la taxe perçue dessus : la
  // taxe nette sortait trop basse, et les CTI/RTI sur les frais Lyft — que
  // personne ne réclame à la place du chauffeur — étaient perdus.
  const L = lyftTaxTotals()

  // ── Taxes perçues ──
  // Lyft détaille sa taxe par assiette : celle des courses et celle des primes
  // sont toutes deux perçues des passagers pour le compte de Revenu Québec.
  const tpsPercue = uv('gst_riders') + L.gst_riders + L.gst_bonuses
  const tvqPercue = uv('qst_riders') + L.qst_riders + L.qst_bonuses
  // Fournitures taxables : le revenu de courses hors taxes.
  const fournituresTaxables = uberRevenueTotal() + lyftTaxableBase()

  // ── Taxes déjà versées par la plateforme au nom du chauffeur ──
  const tpsVerseePlateforme = uv('gst_remitted') + L.gst_remitted
  const tvqVerseePlateforme = uv('qst_remitted') + L.qst_remitted
  // La TPS/TVQ payée SUR les frais de service de la plateforme est un CTI/RTI
  // du chauffeur.
  const tpsFraisUber = uv('gst_paid_uber')
  const tvqFraisUber = uv('qst_paid_uber')

  // ── CTI / RTI sur les dépenses du véhicule, au prorata commercial ──
  const kmTotal = num(state.settings.kmTotalAnnuel)
  const kmComm = num(state.uber.km_online) + getLyftKmTotal()
  const prorata = kmTotal > 0 ? kmComm / kmTotal : 0

  const detailVeh = VEH_CATS.map(cat => {
    const montant = num(state.vehicule.depenses[cat])
    const taxable = d['veh_' + cat] != null ? !!d['veh_' + cat] : VEH_TAXABLE[cat] !== false
    const c = taxable ? contenuTaxes(montant, activeYear) : { ht: montant, tps: 0, tvq: 0 }
    return { cat, montant, taxable, tps: c.tps * prorata, tvq: c.tvq * prorata }
  })
  const ctiVeh = detailVeh.reduce((s, x) => s + x.tps, 0)
  const rtiVeh = detailVeh.reduce((s, x) => s + x.tvq, 0)

  const cti = ctiVeh + tpsFraisUber + L.gst_fees + num(d.ctiAutres)
  const rti = rtiVeh + tvqFraisUber + L.qst_fees + num(d.rtiAutres)

  const tpsNette = tpsPercue - cti
  const tvqNette = tvqPercue - rti
  const tpsSolde = tpsNette - tpsVerseePlateforme
  const tvqSolde = tvqNette - tvqVerseePlateforme

  // Le détail par plateforme rend la déclaration vérifiable : sans lui, un
  // écart avec le relevé papier ne se localise pas.
  const parPlateforme = [
    { nom: 'Uber', percueTps: uv('gst_riders'), percueTvq: uv('qst_riders'),
      creditTps: tpsFraisUber, creditTvq: tvqFraisUber,
      verseeTps: uv('gst_remitted'), verseeTvq: uv('qst_remitted') },
    { nom: 'Lyft', percueTps: L.gst_riders + L.gst_bonuses, percueTvq: L.qst_riders + L.qst_bonuses,
      creditTps: L.gst_fees, creditTvq: L.qst_fees,
      verseeTps: L.gst_remitted, verseeTvq: L.qst_remitted }
  ].filter(p => p.percueTps || p.percueTvq || p.creditTps || p.creditTvq || p.verseeTps || p.verseeTvq)

  return {
    f, fournituresTaxables, tpsPercue, tvqPercue,
    tpsVerseePlateforme, tvqVerseePlateforme, tpsFraisUber, tvqFraisUber,
    tpsFraisLyft: L.gst_fees, tvqFraisLyft: L.qst_fees, lyftTaxes: L, parPlateforme,
    prorata, kmComm, kmTotal, detailVeh, ctiVeh, rtiVeh, cti, rti,
    tpsNette, tvqNette, tpsSolde, tvqSolde
  }
}

function lyftTaxableBase() {
  return Array.from({ length: 12 }, (_, mi) => state.lyft[mi] || {})
    .reduce((s, m) => s + num(m.taxable) + num(m.bonuses), 0)
}

function majTaxes(champ, val) {
  if (guardClosed()) return
  donneesTaxes()[champ] = val
  autoSave()
  renderTaxes()
}

function basculerTaxableVeh(cat) {
  if (guardClosed()) return
  const d = donneesTaxes()
  const actuel = d['veh_' + cat] != null ? !!d['veh_' + cat] : VEH_TAXABLE[cat] !== false
  d['veh_' + cat] = !actuel
  autoSave()
  renderTaxes()
}

function renderTaxes() {
  const el = document.getElementById('taxes-body')
  if (!el) return
  if (!setup.modules.rideshare) {
    el.innerHTML = card('🧾 TPS / TVQ',
      infoBox(`Le module « transport rémunéré » est désactivé. Le <strong>loyer résidentiel est
        exonéré</strong> de TPS et de TVQ : sans activité de transport, vous n'avez ni taxe à
        percevoir ni déclaration à produire.`), 'blue')
    return
  }
  const c = calculTaxes()
  const d = donneesTaxes()

  const rowsVeh = c.detailVeh.filter(x => x.montant > 0).map(x => tr([
    escH(x.cat),
    [money(x.montant), 'right'],
    [`<span onclick="basculerTaxableVeh('${escJS(x.cat)}')" style="cursor:pointer;font-weight:700;color:${x.taxable ? 'var(--green)' : 'var(--text2)'}">${x.taxable ? 'taxable' : 'sans taxe'}</span>`, 'center'],
    [money(x.tps), 'right'],
    [money(x.tvq), 'right']
  ])).join('')

  el.innerHTML = `
    ${card('🧾 TPS / TVQ — ' + activeYear, `
      ${bandeauRepli(activeYear)}
      <div class="summary-row">
        ${sumCard('TPS nette', money(c.tpsNette), c.tpsNette >= 0 ? 'brown' : 'green',
                  'perçue ' + money(c.tpsPercue) + ' − CTI ' + money(c.cti))}
        ${sumCard('TVQ nette', money(c.tvqNette), c.tvqNette >= 0 ? 'brown' : 'green',
                  'perçue ' + money(c.tvqPercue) + ' − RTI ' + money(c.rti))}
      </div>
      <div class="summary-row">
        ${sumCard('Déjà versé par les plateformes', money(c.tpsVerseePlateforme + c.tvqVerseePlateforme), 'blue', 'en votre nom')}
        ${sumCard(c.tpsSolde + c.tvqSolde >= 0 ? 'Reste à verser' : 'Remboursement attendu',
                  money(Math.abs(c.tpsSolde + c.tvqSolde)),
                  c.tpsSolde + c.tvqSolde > 0 ? 'red' : 'green', 'TPS et TVQ réunies')}
      </div>
      ${c.tpsSolde + c.tvqSolde < -1 ? infoBox(`Vos CTI/RTI dépassent les taxes perçues :
        la déclaration donne droit à un <strong>remboursement</strong> de
        ${money(Math.abs(c.tpsSolde + c.tvqSolde))}. C'est courant chez un chauffeur dont la
        plateforme verse déjà les taxes : ne pas produire la déclaration, c'est y renoncer.`) : ''}
      ${warnBox(`Un chauffeur de transport rémunéré de personnes doit être <strong>inscrit à la TPS
        et à la TVQ dès le premier dollar</strong> : le seuil de 30 000 $ du petit fournisseur ne
        s'applique pas à cette activité. Au Québec, Uber et Lyft perçoivent et versent les taxes
        en votre nom, mais <strong>c'est à vous de produire la déclaration</strong> et de réclamer
        vos crédits.`)}
    `, 'brown')}

    ${card('📄 Lignes du formulaire FPZ-500', `
      ${table(['Ligne', 'Poste', ['TPS', 'right'], ['TVQ', 'right']], [
        tr(['101', 'Fournitures taxables (hors taxes)', [money(c.fournituresTaxables), 'right'], [money(c.fournituresTaxables), 'right']]),
        tr(['105 / 205', 'Taxe perçue et percevable', [money(c.tpsPercue), 'right'], [money(c.tvqPercue), 'right']]),
        tr(['108 / 208', 'CTI / RTI demandés', [money(c.cti), 'right'], [money(c.rti), 'right']]),
        tr(['109 / 209', '<strong>Taxe nette</strong>', [`<strong>${money(c.tpsNette)}</strong>`, 'right'], [`<strong>${money(c.tvqNette)}</strong>`, 'right']]),
        tr(['—', 'Déjà versé par les plateformes', [money(c.tpsVerseePlateforme), 'right'], [money(c.tvqVerseePlateforme), 'right']]),
        tr(['—', '<strong>Solde</strong>', [`<strong>${money(c.tpsSolde)}</strong>`, 'right'], [`<strong>${money(c.tvqSolde)}</strong>`, 'right']])
      ])}
      ${c.parPlateforme.length ? `
        <div class="divider"></div>
        <div style="font-size:11px;color:var(--text2);padding:2px 0 6px;font-weight:600;text-transform:uppercase">Détail par plateforme</div>
        ${table(['Plateforme', ['Taxe perçue', 'right'], ['CTI/RTI sur frais', 'right'], ['Déjà versé', 'right']],
          [c.parPlateforme.map(pl => tr([
            escH(pl.nom),
            [money(pl.percueTps + pl.percueTvq), 'right'],
            [money(pl.creditTps + pl.creditTvq), 'right'],
            [money(pl.verseeTps + pl.verseeTvq), 'right']
          ])).join('')])}` : ''}
      <button class="btn btn-ghost btn-sm btn-full" style="margin-top:10px" onclick="exporterFPZ500()">📊 Exporter (CSV)</button>
      ${sourceNote(`Les numéros de ligne correspondent au formulaire combiné <strong>FPZ-500</strong>
        de Revenu Québec, qui administre la TPS au Québec. Reportez-les dans le service en ligne
        de production des déclarations de taxes.`)}
    `, 'blue')}

    ${card('🚗 CTI / RTI sur les dépenses du véhicule', `
      ${infoBox(`Part commerciale retenue : <strong>${fmt(c.prorata * 100, 1)} %</strong>
        (${fmt(c.kmComm, 0)} km d'affaires sur ${fmt(c.kmTotal, 0)} km). Les montants saisis sont
        présumés <strong>toutes taxes comprises</strong> ; la taxe en est extraite au facteur
        ${fmt((1 + c.f.taxes.tps + c.f.taxes.tvq), 5)}.`)}
      ${rowsVeh
        ? table(['Dépense', ['Montant TTC', 'right'], ['Statut', 'center'], ['CTI', 'right'], ['RTI', 'right']],
            [rowsVeh],
            tr(['TOTAL', ['', 'right'], ['', 'center'], [money(c.ctiVeh), 'right'], [money(c.rtiVeh), 'right']], 'total-tr'))
        : infoBox('Aucune dépense de véhicule saisie.')}
      ${sourceNote(`Touchez « taxable » ou « sans taxe » pour corriger le statut d'une dépense.
        Par défaut : l'immatriculation et le permis (droits de la SAAQ) et l'assurance (service
        financier exonéré) ne portent pas de taxes ; tout le reste en porte.`)}
      <div class="divider"></div>
      <div class="cat-row" style="gap:8px">
        <div class="field" style="flex:1">
          <label>Autres CTI (TPS)</label>
          <input type="number" class="inp" step="0.01" value="${escH(d.ctiAutres)}"
            oninput="majTaxes('ctiAutres',this.value)">
        </div>
        <div class="field" style="flex:1">
          <label>Autres RTI (TVQ)</label>
          <input type="number" class="inp" step="0.01" value="${escH(d.rtiAutres)}"
            oninput="majTaxes('rtiAutres',this.value)">
        </div>
      </div>
      ${warnBox(`<strong>Ce que l'app ne calcule pas :</strong> le CTI/RTI sur l'<em>achat</em> du
        véhicule. Pour une voiture de tourisme utilisée à moins de 90 % commercialement, le crédit
        se réclame année après année sur la DPA réclamée, et non en une fois à l'achat —
        une règle distincte, à voir avec votre comptable l'année de l'acquisition.`)}
    `, 'green')}

    ${card('🏘 Pourquoi aucun crédit sur les immeubles', `
      ${infoBox(`La location d'un logement résidentiel à long terme est une fourniture
        <strong>exonérée</strong>. Conséquence symétrique : vous ne percevez pas de taxes sur les
        loyers, et vous <strong>ne pouvez pas</strong> réclamer de CTI/RTI sur les taxes municipales,
        l'électricité, les réparations ou l'assurance des immeubles. Ces taxes font simplement
        partie de la dépense déductible.`)}
      ${sourceNote(`Deux exceptions valent la peine d'être connues et sont traitées dans les
        recommandations : le <strong>remboursement partiel pour immeuble d'habitation locatif
        neuf</strong> (FP-524 / VD-370.67) et le <strong>remboursement intégral de la TPS pour
        immeubles locatifs construits expressément pour la location</strong>.`)}
    `, 'dark')}`
}

function exporterFPZ500() {
  const c = calculTaxes()
  const lignes = [
    csvLigne(['Ligne', 'Poste', 'TPS', 'TVQ']),
    csvLigne(['101', 'Fournitures taxables (hors taxes)', fmt(c.fournituresTaxables), fmt(c.fournituresTaxables)]),
    csvLigne(['105/205', 'Taxe percue et percevable', fmt(c.tpsPercue), fmt(c.tvqPercue)]),
    csvLigne(['108/208', 'CTI / RTI demandes', fmt(c.cti), fmt(c.rti)]),
    csvLigne(['109/209', 'Taxe nette', fmt(c.tpsNette), fmt(c.tvqNette)]),
    csvLigne(['', 'Deja verse par les plateformes', fmt(c.tpsVerseePlateforme), fmt(c.tvqVerseePlateforme)]),
    csvLigne(['', 'Solde', fmt(c.tpsSolde), fmt(c.tvqSolde)]),
    '',
    csvLigne(['Detail CTI/RTI vehicule', 'Montant TTC', 'Taxable', 'CTI', 'RTI'])
  ]
  c.detailVeh.filter(x => x.montant > 0).forEach(x =>
    lignes.push(csvLigne([x.cat, fmt(x.montant), x.taxable ? 'oui' : 'non', fmt(x.tps), fmt(x.tvq)])))
  if (c.parPlateforme.length) {
    lignes.push('', csvLigne(['Plateforme', 'Taxe percue TPS', 'Taxe percue TVQ', 'CTI frais', 'RTI frais', 'Deja verse TPS', 'Deja verse TVQ']))
    c.parPlateforme.forEach(pl => lignes.push(csvLigne([pl.nom, fmt(pl.percueTps), fmt(pl.percueTvq),
      fmt(pl.creditTps), fmt(pl.creditTvq), fmt(pl.verseeTps), fmt(pl.verseeTvq)])))
  }
  dl(`tps_tvq_${activeYear}.csv`, '﻿' + lignes.join('\n'), 'text/csv;charset=utf-8')
  toast('📊 Déclaration exportée')
}

registerModule({
  id: 'taxes',
  label: 'TPS / TVQ',
  render: renderTaxes
})
