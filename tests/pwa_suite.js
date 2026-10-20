// Suite de tests — PWA « Revenus & Dépenses » (pwa_2026/index.html)
//
// L'app est un fichier HTML unique sans modules : ses fonctions vivent dans la portée
// globale de la page. La suite s'exécute donc DANS le contexte de la page (Playwright
// `browser_evaluate`, ou la console du navigateur), là où `state`, `setup`, `propTotals()`,
// `getTripAmount()`, etc. sont directement accessibles.
//
// Usage :
//   1. servir l'app        : cd pwa_2026 && python3 -m http.server 8099
//   2. ouvrir              : http://localhost:8099/index.html
//   3. coller ce fichier dans la console, ou l'injecter via Playwright
//   4. lire le rapport retourné (JSON)
//
// La suite remplace l'état de la page par une fixture déterministe, puis restaure
// l'état d'origine à la fin — aucune donnée réelle n'est perdue.

(function runPwaSuite() {
  const results = []
  const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol

  function check(id, titre, attendu, obtenu, ok) {
    results.push({ id, titre, attendu, obtenu, statut: ok ? 'PASS' : 'FAIL' })
  }
  function eq(id, titre, attendu, obtenu, tol = 0.01) {
    const ok = typeof attendu === 'number' && typeof obtenu === 'number'
      ? near(attendu, obtenu, tol)
      : JSON.stringify(attendu) === JSON.stringify(obtenu)
    check(id, titre, attendu, obtenu, ok)
  }

  // ── Sauvegarde de l'état réel ──────────────────────────────────────────────
  const backup = {
    state: JSON.parse(JSON.stringify(state)),
    setup: JSON.parse(JSON.stringify(setup)),
    activeYear
  }

  // Si un test lève, l’état réel doit être remis en place QUAND MÊME : la
  // fixture est sauvegardée dans localStorage dès son installation, donc une
  // interruption en plein milieu laisserait les données de test par-dessus les
  // vraies. D’où le try/finally autour de toute la suite.
  let erreurFatale = null
  try {

    // ── Fixture déterministe ───────────────────────────────────────────────────
    // Deux immeubles : un détenu à 100 %, un détenu à 50 % (copropriété).
    // Taux km volontairement non arrondi pour détecter les arrondis prématurés.
    const FIX_YEAR = 2026
    const RATE = 0.72

    function seed() {
      activeYear = FIX_YEAR

      setup.done = true
      setup.modules = { trips: true, props: true, rideshare: true }
      setup.propsList = [
        {
          id: 'pA', label: 'Duplex A (test)', kind: 'plex', subtype: 'duplex',
          revenus: ['Logement 1', 'Logement 2'],
          deductibles: ['Taxes municipales', 'Électricité', 'Frais de déplacement'],
          capital: ['Rénovation majeure'],
          address: '1 rue A', distanceKm: 50, pct: 100, coOwners: ''
        },
        {
          id: 'pB', label: 'Triplex B (test)', kind: 'plex', subtype: 'triplex',
          revenus: ['Logement 1'],
          deductibles: ['Taxes municipales', 'Frais de déplacement'],
          capital: ['Rénovation majeure'],
          address: '2 rue B', distanceKm: 25, pct: 50, coOwners: 'Copropriétaire Test'
        }
      ]

      state = defaultState()
      state.settings.mileageRate = RATE
      state.settings.kmTotalAnnuel = 20000

      // Immeuble A : 1000 $/mois × 12 sur Logement 1 = 12 000 $ ; Logement 2 = 6 000 $
      state.pA = {
        revenus: {
          'Logement 1': Array(12).fill('1000'),
          'Logement 2': Array(12).fill('500')
        },
        deductibles: {
          'Taxes municipales': ['3000', '', '', '', '', '', '', '', '', '', '', ''],
          'Électricité': Array(12).fill('100')
        },
        capital: { 'Rénovation majeure': ['', '', '', '', '', '8000', '', '', '', '', '', ''] }
      }

      // Immeuble B : 900 $/mois = 10 800 $ ; taxes 2 400 $
      state.pB = {
        revenus: { 'Logement 1': Array(12).fill('900') },
        deductibles: { 'Taxes municipales': ['2400', '', '', '', '', '', '', '', '', '', '', ''] },
        capital: {}
      }

      // Véhicule : 10 000 $ de dépenses, 4 000 km Uber + 1 000 km Lyft sur 20 000 km
      VEH_CATS.forEach(c => { state.vehicule.depenses[c] = '' })
      state.vehicule.depenses[VEH_CATS[0]] = '10000'
      state.uber = { km_online: '4000', rides_gross: '30000' }
      state.lyft = {}
      state.lyft[0] = { km: '1000', taxable: '5000', bonuses: '200', tips: '300', fees: '500' }

      // Déplacements : 2 trajets dans l'année de la fixture + 1 trajet HORS année
      state.trips = [
        { id: 't1', date: `${FIX_YEAR}-01-15`, property: 'pA', km: '100.0', reason: 'Visite', roundTrip: true },
        { id: 't2', date: `${FIX_YEAR}-03-10`, property: 'pB', km: '50.0', reason: 'Réparation', roundTrip: true },
        { id: 't3', date: `${FIX_YEAR + 1}-01-20`, property: 'pA', km: '200.0', reason: 'Hors année', roundTrip: true }
      ]

      state.receipts = {}
      state.notes = {}
      save()
      saveSetup()
    }

    seed()

    // ══ 1. Fondations : taux, état, immeubles ═════════════════════════════════
    eq('T01', 'rate() lit le taux configuré', RATE, rate())
    eq('T02', 'propsList() retourne les 2 immeubles de la fixture', 2, propsList().length)
    eq('T03', 'propById() retrouve un immeuble par id', 'Duplex A (test)', propById('pA').label)
    eq('T04', 'propById() retourne null sur un id inconnu', null, propById('inexistant'))

    // ══ 2. Montants mensuels ══════════════════════════════════════════════════
    eq('T05', 'getMonthlyVal() lit une valeur saisie', 1000, getMonthlyVal('pA', 'revenus', 'Logement 1', 0))
    eq('T06', 'getMonthlyVal() retourne 0 sur une catégorie absente', 0, getMonthlyVal('pA', 'revenus', 'Inexistant', 0))
    eq('T07', 'getMonthlyVal() retourne 0 sur un immeuble absent', 0, getMonthlyVal('pZ', 'revenus', 'X', 0))

    // ══ 3. Déplacements ═══════════════════════════════════════════════════════
    // Trajet de janvier sur pA : 100 km × 0,72 = 72 $
    eq('T08', 'getTripAmount() janvier pA = 100 km × taux', 100 * RATE, getTripAmount('pA', 0))
    eq('T09', 'getTripAmount() mars pB = 50 km × taux', 50 * RATE, getTripAmount('pB', 2))
    eq('T10', 'getTripAmount() mois sans trajet = 0', 0, getTripAmount('pA', 5))
    eq('T11', 'monthOf() lit le mois sans décalage de fuseau', 0, monthOf(`${FIX_YEAR}-01-15`))
    eq('T12', 'yearOf() lit l\'année sans décalage de fuseau', FIX_YEAR, yearOf(`${FIX_YEAR}-01-15`))

    // Cohérence km : getRentalKmTotal() filtre par année, getTripAmount() non.
    const kmRentalDeclare = getRentalKmTotal()
    const kmImpliqueParDeduction = propsList()
      .reduce((s, p) => s + Array.from({ length: 12 }, (_, mi) => getTripAmount(p.id, mi))
        .reduce((a, b) => a + b, 0), 0) / RATE
    eq('T13', 'getRentalKmTotal() exclut le trajet hors année (100 + 50)', 150, kmRentalDeclare)
    eq('T14', 'Cohérence : km de la déduction locative == km de la proration véhicule',
       kmRentalDeclare, kmImpliqueParDeduction)

    // ══ 4. Totaux par immeuble ════════════════════════════════════════════════
    // pA : revenus 12×1000 + 12×500 = 18 000 ; dépenses 3000 + 12×100 + déplacements
    const tA = propTotals('pA')
    const depDeplA = Array.from({ length: 12 }, (_, mi) => getTripAmount('pA', mi)).reduce((a, b) => a + b, 0)
    eq('T15', 'propTotals(pA).rev = 18 000 $', 18000, tA.rev)
    eq('T16', 'propTotals(pA).dep = taxes + électricité + déplacements', 3000 + 1200 + depDeplA, tA.dep)
    eq('T17', 'propTotals(pA).cap = 8 000 $ (hors net courant)', 8000, tA.cap)
    eq('T18', 'propTotals(pA).net = rev − dep (capital exclu)', tA.rev - tA.dep, tA.net)

    const tB = propTotals('pB')
    eq('T19', 'propTotals(pB).rev = 10 800 $', 10800, tB.rev)
    eq('T20', 'propTotals(pB) ignore le % de propriété (50 %) à l\'écran',
       10800, tB.rev)

    eq('T21', 'propTotals() sur un id inconnu ne lève pas et retourne des zéros',
       { rev: 0, dep: 0, cap: 0, net: 0 }, propTotals('pZ'))

    // ══ 5. Proration véhicule ═════════════════════════════════════════════════
    const kmTotal = 20000, totalVehDep = 10000
    eq('T22', 'getLyftKmTotal() somme les 12 mois', 1000, getLyftKmTotal())
    eq('T23', 'Déduction Uber = 10 000 $ × 4 000/20 000', totalVehDep * 4000 / kmTotal,
       totalVehDep * (parseFloat(state.uber.km_online) / kmTotal))
    eq('T24', 'Déduction Lyft = 10 000 $ × 1 000/20 000', totalVehDep * 1000 / kmTotal,
       totalVehDep * (getLyftKmTotal() / kmTotal))

    // Division par zéro
    const kmSave = state.settings.kmTotalAnnuel
    state.settings.kmTotalAnnuel = 0
    const depAvecKmZero = totalDepAll()
    check('T25', 'km total = 0 : pas de NaN ni d\'Infinity dans totalDepAll()',
          'nombre fini', depAvecKmZero, Number.isFinite(depAvecKmZero))
    state.settings.kmTotalAnnuel = kmSave

    // ══ 6. Totaux globaux ═════════════════════════════════════════════════════
    eq('T26', 'totalRevAll() = pA + pB', tA.rev + tB.rev, totalRevAll())
    const depAttendu = tA.dep + tB.dep + totalVehDep * (4000 + 1000) / kmTotal
    eq('T27', 'totalDepAll() = dépenses immeubles + proration véhicule', depAttendu, totalDepAll())

    // ══ 7. Export CSV : intégrité des colonnes ════════════════════════════════
    // Le CSV est construit par concaténation de gabarits ; on vérifie que chaque
    // ligne a le même nombre de colonnes que l'entête (2 + 12 mois + total = 15).
    const csvCapture = (() => {
      const origCreate = URL.createObjectURL
      let texte = null
      const origBlob = window.Blob
      window.Blob = function (parts, opts) {
        if (opts && String(opts.type).includes('csv')) texte = parts.join('')
        return new origBlob(parts, opts)
      }
      URL.createObjectURL = () => 'blob:stub'
      const origClick = HTMLAnchorElement.prototype.click
      HTMLAnchorElement.prototype.click = function () {}
      try { exportCSV() } catch (e) { texte = 'ERREUR: ' + e.message }
      window.Blob = origBlob
      URL.createObjectURL = origCreate
      HTMLAnchorElement.prototype.click = origClick
      return texte
    })()

    const csvLignes = (csvCapture || '').replace(/^﻿/, '').trim().split('\n')

    // Compte les champs d'une ligne CSV en IGNORANT les virgules entre
    // guillemets. Un simple split(',') comptait faux dès qu'une cellule
    // contenait une virgule — et il y en a forcément : les libellés des
    // sections, les adresses, et surtout la virgule décimale du français
    // (« 25,8 % »). C'est ce test qui a attrapé le décalage de la ligne Lyft
    // (BUG-2), il doit continuer à le faire sans crier sur du CSV valide.
    const nbChamps = (ligne) => {
      let n = 1, dansGuillemets = false
      for (const ch of ligne) {
        if (ch === '"') dansGuillemets = !dansGuillemets
        else if (ch === ',' && !dansGuillemets) n++
      }
      return n
    }
    const nbColEntete = nbChamps(csvLignes[0])
    eq('T28', 'CSV : entête = 15 colonnes (Section, Catégorie, 12 mois, Total)', 15, nbColEntete)

    const lignesMalFormees = csvLignes.slice(1)
      .map((l, i) => ({ n: i + 2, cols: nbChamps(l), extrait: l.slice(0, 45) }))
      .filter(x => x.cols !== nbColEntete)
    eq('T29', 'CSV : toutes les lignes ont le même nombre de colonnes que l\'entête',
       [], lignesMalFormees)

    const ligneLyft = csvLignes.find(l => l.startsWith('"Lyft'))
    eq('T30', 'CSV : la ligne Lyft a 15 colonnes', 15, ligneLyft ? nbChamps(ligneLyft) : -1)
    // Un guillemet dans un libellé doit être doublé, pas laissé tel quel.
    eq('T30b', 'CSV : aucune ligne ne porte un guillemet non échappé en milieu de cellule',
       [], csvLignes.filter(l => /[^,"]"[^,"]/.test(l)).map(l => l.slice(0, 45)))

    // ══ 8. Export / import JSON ═══════════════════════════════════════════════
    // `mergeState()` est la fonction réelle de l'app : elle fusionne `settings` champ par
    // champ au lieu de remplacer l'objet en bloc.
    const snapshot = JSON.parse(JSON.stringify(state))
    const reimporte = mergeState(JSON.parse(JSON.stringify(snapshot)))
    eq('T31', 'Aller-retour JSON : revenus pA préservés',
       snapshot.pA.revenus['Logement 1'], reimporte.pA.revenus['Logement 1'])
    eq('T32', 'Aller-retour JSON : nombre de trajets préservé', 3, reimporte.trips.length)

    // Un état ancien sans la clé `syncAuto` doit garder la valeur par défaut.
    const ancien = { settings: { mileageRate: 0.68 } }
    const fusionne = mergeState(ancien)
    check('T33', 'Migration : un réglage absent de l\'état sauvegardé garde sa valeur par défaut',
          'syncAuto === true', fusionne.settings.syncAuto, fusionne.settings.syncAuto === true)
    eq('T33b', 'Migration : le réglage présent dans le fichier est bien repris',
       0.68, fusionne.settings.mileageRate)

    // ══ 9. reconcilePropsFromState : récupération après import/cloud ═══════════
    const propsAvant = propsList().length
    const sauveListe = JSON.parse(JSON.stringify(setup.propsList))
    setup.propsList = setup.propsList.filter(p => p.id !== 'pB')   // pB disparaît de la config
    const ajoutes = reconcilePropsFromState()
    eq('T34', 'reconcilePropsFromState() recrée l\'immeuble dont les données existent', 1, ajoutes)
    const pBrecree = propById('pB')
    check('T35', 'reconcilePropsFromState() recrée bien pB', 'objet', pBrecree ? 'trouvé' : 'absent', !!pBrecree)
    // Sans configuration, le % de propriété est inconnaissable : le repli documenté
    // est 100 %. C'est pour cela que la sauvegarde doit emporter la configuration (T36b).
    eq('T36', 'Repli sans configuration : l\'immeuble recréé revient à 100 %',
       100, pBrecree ? pBrecree.pct : -1)
    setup.propsList = sauveListe
    saveSetup()

    // ══ 9b. Enveloppe de sauvegarde v3 : configuration + année ════════════════
    const payload = JSON.parse(JSON.stringify(backupPayload()))
    check('T36a', 'La sauvegarde est une enveloppe v3 (format, year, setup, state)',
          'pwa-depenses + year + setup + state',
          [payload.format, typeof payload.year, !!payload.setup, !!payload.state].join('/'),
          payload.format === 'pwa-depenses' && !!payload.year
            && !!payload.setup && !!payload.state)
    eq('T36b', 'La sauvegarde emporte le % de propriété de pB (50 %)',
       50, (payload.setup.propsList.find(p => p.id === 'pB') || {}).pct)
    eq('T36c', 'La sauvegarde emporte les copropriétaires de pB',
       'Copropriétaire Test', (payload.setup.propsList.find(p => p.id === 'pB') || {}).coOwners)

    // Restauration réelle : la configuration est effacée, l'enveloppe doit la rétablir.
    const anneeAvant = activeYear
    setup.propsList = setup.propsList.filter(p => p.id !== 'pB')
    const restauration = restoreFromBackup(payload)
    const pBrestaure = propById('pB')
    eq('T36d', 'Restauration v3 : pB retrouve son % de propriété (50 %)',
       50, pBrestaure ? pBrestaure.pct : -1)
    eq('T36e', 'Restauration v3 : pB retrouve son libellé configuré',
       'Triplex B (test)', pBrestaure ? pBrestaure.label : '')
    eq('T36f', 'Restauration v3 : l\'année du fichier est rétablie', anneeAvant, restauration.year)
    eq('T36g', 'Restauration v3 : aucun immeuble n\'a besoin d\'être reconstruit',
       0, restauration.rebuilt)

    // ══ 10. Dépenses récurrentes ══════════════════════════════════════════════
    // `_applyRecurring` lit `activePropTab` (pas d'argument d'immeuble) et les clés
    // récurrentes sont préfixées `rev_` / `ded_`. Par conception, il ne remplit que
    // les mois VIDES — il n'écrase jamais un montant déjà saisi.
    activePropTab = 'pA'
    state.recurring = { pA: { 'ded_Électricité': 125, 'rev_Logement 1': 1111 } }

    // Mois 6 contient déjà 100 $ : la récurrence doit le laisser intact.
    const applique1 = _applyRecurring([6])
    eq('T37', '_applyRecurring() n\'écrase pas un montant déjà saisi',
       100, getMonthlyVal('pA', 'deductibles', 'Électricité', 6))
    eq('T38', '_applyRecurring() ne compte aucune application quand tout est déjà rempli',
       0, applique1)

    // On vide un mois : la récurrence doit alors s'y appliquer.
    setMonthlyVal('pA', 'deductibles', 'Électricité', 8, '')
    const applique2 = _applyRecurring([8])
    eq('T39', '_applyRecurring() remplit un mois vide avec la valeur récurrente',
       125, getMonthlyVal('pA', 'deductibles', 'Électricité', 8))
    eq('T40', '_applyRecurring() retourne le nombre de montants appliqués', 1, applique2)

    // ══ 11. Checklist ═════════════════════════════════════════════════════════
    const cl = getChecklist()
    check('T41', 'getChecklist() fournit une liste non vide par défaut',
          '> 0 éléments', cl.length, Array.isArray(cl) && cl.length > 0)
    check('T42', 'Chaque élément de checklist a un id, un libellé et un état `checked`',
          'id + label + checked', 'conforme',
          cl.every(i => typeof i.id === 'string' && typeof i.label === 'string'
                     && typeof i.checked === 'boolean'))
    check('T43', 'La checklist s\'adapte aux immeubles configurés (3 lignes par immeuble)',
          'lignes par immeuble présentes', 'conforme',
          cl.some(i => i.label.includes('Duplex A')) && cl.some(i => i.label.includes('Triplex B')))

    // ══ 12. Rendu : aucune exception sur les écrans ═══════════════════════════
    const ecrans = [
      ['home', renderHome], ['trips', renderTrips], ['property', renderProperty],
      ['rideshare', renderRideshare], ['vehicle', renderVehicle], ['summary', renderSummary]
    ]
    ecrans.forEach(([nom, fn], i) => {
      let err = null
      try { fn() } catch (e) { err = e.message }
      check('T' + (44 + i),
            `Rendu de l'onglet « ${nom} » sans exception`, 'aucune erreur', err || 'aucune erreur', !err)
    })

    // ══ 12b. Sommaire : les revenus rideshare entrent dans le total ═══════════
    // Le sommaire soustrayait les déductions véhicule Uber/Lyft sans ajouter les revenus
    // correspondants : le bénéfice global affiché était fortement négatif alors que le
    // rapport PDF, lui, était correct.
    eq('T51', 'uberNetIncome() = revenus de courses − frais Uber', 30000, uberNetIncome())

    const lyftNetAttendu = 5000 + 200 + 300 - 500
    renderSummary()
    const pieds = document.querySelectorAll('#summary-detail tfoot .total-tr td')
    const nombre = txt => parseFloat((txt || '').replace(/[^\d,.-]/g, '').replace(/\s/g, '').replace(',', '.')) || 0
    const revAffiche = pieds.length >= 2 ? nombre(pieds[1].textContent) : -1
    eq('T52', 'TOTAL des revenus du sommaire = locatif + net Uber + net Lyft',
       totalRevAll() + 30000 + lyftNetAttendu, revAffiche, 1)

    const depAffiche = pieds.length >= 3 ? nombre(pieds[2].textContent) : -1
    eq('T53', 'TOTAL des dépenses du sommaire = totalDepAll() (véhicule inclus)',
       totalDepAll(), depAffiche, 1)

    const benefAffiche = pieds.length >= 4 ? nombre(pieds[3].textContent) : -1
    eq('T54', 'Bénéfice du sommaire = revenus totaux − dépenses totales (et il est positif)',
       totalRevAll() + 30000 + lyftNetAttendu - totalDepAll(), benefAffiche, 1)
    check('T55', 'Le bénéfice global du sommaire n\'est plus négatif (régression BUG-7)',
       '> 0', nombre(pieds[3] ? pieds[3].textContent : ''), benefAffiche > 0)

    // ══ 12b. Lecture des relevés PDF Uber / Lyft ═════════════════════════════
    // Le texte ci-dessous reproduit ce que pdf.js rend : les cellules d'un
    // tableau arrivent à la file, séparées par des espaces, sans retour ligne
    // fiable. Les trois formats couverts sont ceux qui circulent réellement :
    // relevé Lyft français, relevé Lyft anglais (en milles), relevé Uber.
    const LYFT_FR = `Lyft Relevé mensuel Juillet 2026 Conducteur
      Gains de course 2 480,55 $ Primes 125,00 $ Pourboires 318,40 $
      Frais de la plateforme Lyft -612,30 $ Taxes perçues 371,06 $
      Kilomètres parcourus 1 842 Courses complétées 214`
    const lyftFR = parseLyftPDF(LYFT_FR)
    eq('T56', 'PDF Lyft FR : les gains de course sont lus', 2480.55, lyftFR.taxable)
    eq('T57', 'PDF Lyft FR : les primes sont lues', 125, lyftFR.bonuses)
    eq('T58', 'PDF Lyft FR : les pourboires sont lus', 318.40, lyftFR.tips)
    eq('T59', 'PDF Lyft FR : les frais de plateforme sont lus, signe compris', -612.30, lyftFR.fees)
    eq('T60', 'PDF Lyft FR : les kilomètres sont lus', 1842, lyftFR.km)
    eq('T61', 'PDF Lyft FR : le nombre de courses est lu', 214, lyftFR.courses)

    const LYFT_EN = `Lyft Driver Monthly Summary July 2026
      Ride earnings $1,204.18 Bonuses $0.00 Tips $96.25
      Lyft platform fees -$301.05 Online miles 742 Rides given 88`
    const lyftEN = parseLyftPDF(LYFT_EN)
    eq('T62', 'PDF Lyft EN : les gains sont lus malgré le séparateur de milliers', 1204.18, lyftEN.taxable)
    eq('T63', 'PDF Lyft EN : les pourboires sont lus', 96.25, lyftEN.tips)
    // 742 milles = 1 194 km. Sans conversion, la déduction kilométrique était
    // sous-estimée de 38 % sur tout relevé anglophone.
    eq('T64', 'PDF Lyft EN : les milles en ligne sont convertis en kilomètres',
       Math.round(742 * 1.609344), lyftEN.km)
    eq('T65', 'PDF Lyft EN : le nombre de courses est lu', 88, lyftEN.courses)

    const vide = parseLyftPDF('Document sans aucun libellé connu ni montant')
    eq('T66', 'PDF illisible : tous les champs valent null, aucun chiffre inventé',
       6, Object.values(vide).filter(v => v === null).length)

    const UBER = `Uber Relevé fiscal 2026 Tarifs bruts 18 450,22 $
      Frais de service Uber -3 215,66 $ Pourboires 1 402,10 $
      TPS/TVH collectée des passagers 922,51 $ Miles on trip 9 300`
    const uber = parseUberPDF(UBER)
    eq('T67', 'PDF Uber : les tarifs bruts sont lus', 18450.22, uber.rides_gross)
    eq('T68', 'PDF Uber : les frais de service sont lus, signe compris', -3215.66, uber.service_fee)
    eq('T69', 'PDF Uber : les milles en course sont convertis en kilomètres',
       Math.round(9300 * 1.609344), uber.km_on_trip)

    // Un libellé qui apparaît d'abord dans un sommaire sans chiffre, puis dans
    // le tableau : la version précédente ne regardait que la 1re occurrence et
    // rendait null (ou le montant de la ligne suivante, à 500 caractères).
    const DEUX_FOIS = `Sommaire : Pourboires, primes et frais. Détail du mois
      Primes 42,00 $ Pourboires 211,75 $`
    const deuxFois = parseLyftPDF(DEUX_FOIS)
    eq('T70', 'PDF : un libellé présent deux fois est lu à son occurrence chiffrée',
       211.75, deuxFois.tips)

    eq('T71', 'premierMontant() ignore un pourcentage', null, premierMontant(' 15 % '))
    eq('T72', 'premierMontant() lit un négatif comptable entre parenthèses',
       -84.5, premierMontant(' (84,50) $'))
    eq('T73', 'texteUtileLen() ne compte pas les espaces', 6, texteUtileLen('  a b\nc d e f  '))

    // ══ 13. Robustesse : état vide ════════════════════════════════════════════
    const stateSauve = state
    state = defaultState()
    let errVide = null
    try { totalRevAll(); totalDepAll(); renderSummary(); renderHome() } catch (e) { errVide = e.message }
    check('T50', 'État vierge : les totaux et le rendu ne lèvent pas',
          'aucune erreur', errVide || 'aucune erreur', !errVide)
    state = stateSauve

  } catch (e) {
    erreurFatale = (e && e.message) ? e.message : String(e)
  } finally {
    // ── Restauration de l'état réel ───────────────────────────────────────────
    state = backup.state
    setup = backup.setup
    activeYear = backup.activeYear
    save()
    saveSetup()
    try { refreshAll() } catch (e) {}
  }

  if (erreurFatale) {
    results.push({ id: 'FATAL', titre: 'La suite s’est interrompue avant la fin',
                   attendu: 'exécution complète', obtenu: erreurFatale, statut: 'FAIL' })
  }

  const pass = results.filter(r => r.statut === 'PASS').length
  return {
    total: results.length,
    pass,
    fail: results.length - pass,
    echecs: results.filter(r => r.statut === 'FAIL'),
    tous: results
  }
})()
