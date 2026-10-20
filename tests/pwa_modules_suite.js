// Suite de tests — modules fiscaux de la PWA (pwa_2026/js/*.js)
//
// Les modules sont chargés comme scripts classiques : ils partagent la portée globale
// de la page avec `state`, `setup` et `activeYear`. La suite s'exécute donc DANS la
// page, comme `pwa_suite.js`, et vérifie en priorité les règles fiscales codées —
// celles qu'une erreur rendrait indétectable à l'œil.
//
// Usage :
//   1. servir l'app : cd pwa_2026 && python3 -m http.server 8099
//   2. ouvrir http://localhost:8099/index.html
//   3. coller ce fichier dans la console (ou l'injecter via Playwright)
//
// L'état réel est sauvegardé puis restauré à la fin.

(function runModulesSuite() {
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
  function sansErreur(id, titre, fn) {
    let err = null
    try { fn() } catch (e) { err = e.message }
    check(id, titre, 'aucune erreur', err || 'aucune erreur', !err)
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
  // Déclarées hors du try : le bloc finally s'en sert pour nettoyer les années
  // de test, et un const du try n'y serait pas visible.
  const FIX_YEAR = 2026
  const ANNEE_TEST_VOISINE = 2098          // hors des années réelles de l'utilisateur
  const RATE = 0.72
  const ANNEES_TEST = [ANNEE_TEST_VOISINE, ANNEE_TEST_VOISINE + 1, 2028]

  let erreurFatale = null
  try {
    // ── Fixture ────────────────────────────────────────────────────────────────
    // pA : détenu à 100 %. pB : détenu à 50 % avec un copropriétaire nommé.
    function seed() {
      activeYear = FIX_YEAR
      setup.done = true
      setup.modules = { trips: true, props: true, rideshare: true }
      setup.reglesImport = []
      setup.importOrdreUS = false
      setup.propsList = [
        { id: 'pA', label: 'Duplex A (test)', kind: 'plex', subtype: 'duplex',
          revenus: ['Logement 1', 'Logement 2'],
          deductibles: ['Taxes municipales', 'Électricité', 'Assurances', 'Intérêts hypothécaires', 'Frais de déplacement'],
          capital: ['Rénovation majeure'],
          address: '1 rue A', distanceKm: 50, pct: 100, coOwners: '' },
        { id: 'pB', label: 'Triplex B (test)', kind: 'plex', subtype: 'triplex',
          revenus: ['Logement 1'],
          deductibles: ['Taxes municipales', 'Frais de déplacement'],
          capital: ['Rénovation majeure'],
          address: '2 rue B', distanceKm: 25, pct: 50, coOwners: 'Copropriétaire Test' }
      ]

      state = defaultState()
      state.settings.mileageRate = RATE
      state.settings.kmTotalAnnuel = 20000

      state.pA = {
        revenus: { 'Logement 1': Array(12).fill('1000'), 'Logement 2': Array(12).fill('500') },
        deductibles: {
          'Taxes municipales': ['3000', '', '', '', '', '', '', '', '', '', '', ''],
          'Électricité': Array(12).fill('100'),
          'Assurances': ['1200', '', '', '', '', '', '', '', '', '', '', ''],
          'Intérêts hypothécaires': Array(12).fill('500')
        },
        capital: { 'Rénovation majeure': ['', '', '', '', '', '8000', '', '', '', '', '', ''] }
      }
      state.pB = {
        revenus: { 'Logement 1': Array(12).fill('900') },
        deductibles: { 'Taxes municipales': ['2400', '', '', '', '', '', '', '', '', '', '', ''] },
        capital: {}
      }

      VEH_CATS.forEach(c => { state.vehicule.depenses[c] = '' })
      // Le carburant, et non VEH_CATS[0] (l'immatriculation) : les droits de la SAAQ
      // ne portent pas de TPS/TVQ, donc une fixture qui y logerait les 10 000 $ ferait
      // attendre un CTI là où l'app a raison de n'en accorder aucun.
      state.vehicule.depenses['Frais de carburant (total annuel)'] = '10000'
      state.uber = { km_online: '4000', rides_gross: '30000',
                     gst_riders: '1500', qst_riders: '2992.50',
                     gst_remitted: '1500', qst_remitted: '2992.50',
                     gst_paid_uber: '125', qst_paid_uber: '249.38' }
      state.lyft = {}
      state.lyft[0] = { km: '1000', taxable: '5000', bonuses: '200', tips: '300', fees: '500',
                        gst_riders: '250', qst_riders: '498.75', gst_bonuses: '10', qst_bonuses: '19.95',
                        gst_fees: '25', qst_fees: '49.88',
                        gst_remitted: '260', qst_remitted: '518.70' }
      state.lyft[1] = { gst_riders: '100', qst_riders: '199.50', gst_fees: '5', qst_fees: '9.98',
                        gst_remitted: '100', qst_remitted: '199.50' }

      state.trips = [
        { id: 't1', date: `${FIX_YEAR}-01-15`, property: 'pA', km: '100.0', reason: 'Visite', roundTrip: true },
        { id: 't2', date: `${FIX_YEAR}-03-10`, property: 'pB', km: '50.0', reason: '', roundTrip: true }
      ]

      state.receipts = {}
      state.notes = {}
      state.biens = []
      state.baux = []
      state.ventilations = []
      state.impot = { revenuT4: '60000', impotRetenuFed: '6000', impotRetenuQc: '7000' }
      state.taxes = {}
      // kilometrage.js lit state.kmJournal (donneesKm()), pas state.km.
      state.kmJournal = { odoDebut: '100000', odoFin: '120000' }
      delete state.closed
      if (typeof invalidateDPA === 'function') invalidateDPA()
      save()
      saveSetup()
    }
    seed()

    // ══ A. SOCLE PARTAGÉ (app-modules.js) ═════════════════════════════════════
    // num() lit des montants copiés d'un relevé bancaire ou d'un PDF : espaces
    // insécables, virgule décimale, parenthèses comptables.
    eq('M01', 'num() lit « 1 234,56 $ » (virgule décimale, espace insécable)',
       1234.56, num('1 234,56 $'))
    eq('M02', 'num() lit « (123,45) » comme un montant négatif (notation comptable)',
       -123.45, num('(123,45)'))
    eq('M03', 'num() lit « 1,234.56 » (format anglais)', 1234.56, num('1,234.56'))
    eq('M04', 'num() lit « 2,500 » comme deux mille cinq cents, pas 2,5',
       2500, num('2,500'))
    eq('M05', 'num() sur une saisie vide ou absurde retourne 0',
       0, num('') + num(null) + num('abc'))
    eq('M06', 'escH() échappe l\'apostrophe et les chevrons (noms de locataires)',
       'O&#39;Brien &lt;b&gt;', escH("O'Brien <b>"))
    eq('M07', 'csvLigne() entoure de guillemets une cellule contenant une virgule',
       '"Tremblay, Marie",100', csvLigne(['Tremblay, Marie', '100']))

    // readYear/writeYear : indispensable au report de la FNACC et au pluriannuel.
    const etatVoisin = JSON.parse(JSON.stringify(state))
    etatVoisin.pA.revenus['Logement 1'] = Array(12).fill('777')
    writeYear(ANNEE_TEST_VOISINE, etatVoisin)
    const relu = readYear(ANNEE_TEST_VOISINE)
    eq('M08', 'writeYear()/readYear() : aller-retour sur une autre année',
       '777', relu ? relu.pA.revenus['Logement 1'][0] : null)
    eq('M09', 'readYear() sur une année inexistante retourne null',
       null, readYear(2097))

    // ══ B. VERROU DE CLÔTURE (cloture.js) ═════════════════════════════════════
    const empA = empreinteFiscale(state)
    eq('M10', 'empreinteFiscale() est stable sur un état inchangé', empA, empreinteFiscale(state))

    state.receipts['pA_deductibles_Électricité_0'] = 'data:image/jpeg;base64,AAAA'
    eq('M11', 'empreinteFiscale() ignore les reçus (une photo ne change pas un chiffre)',
       empA, empreinteFiscale(state))
    delete state.receipts['pA_deductibles_Électricité_0']

    const avantElec = getMonthlyVal('pA', 'deductibles', 'Électricité', 0)
    setMonthlyVal('pA', 'deductibles', 'Électricité', 0, '101')
    check('M12', 'empreinteFiscale() change dès qu\'un montant déclaré change',
          'empreinte différente', empreinteFiscale(state) === empA ? 'identique' : 'différente',
          empreinteFiscale(state) !== empA)
    setMonthlyVal('pA', 'deductibles', 'Électricité', 0, String(avantElec))
    eq('M13', 'empreinteFiscale() revient à sa valeur après annulation de la modification',
       empA, empreinteFiscale(state))

    // Le verrou doit bloquer la saisie, pas seulement la masquer.
    state.closed = { at: new Date().toISOString(), par: 'test',
                     totaux: totauxCloture(state), empreinte: empreinteFiscale(state) }
    const avantVerrou = getMonthlyVal('pA', 'revenus', 'Logement 1', 0)
    setMonthlyVal('pA', 'revenus', 'Logement 1', 0, '9999')
    eq('M14', 'Année clôturée : setMonthlyVal() refuse la modification',
       avantVerrou, getMonthlyVal('pA', 'revenus', 'Logement 1', 0))
    check('M15', 'guardClosed() signale une année clôturée', true, guardClosed(), guardClosed() === true)
    delete state.closed
    check('M16', 'guardClosed() laisse passer une année ouverte', false, guardClosed(), guardClosed() === false)

    // totauxCloture doit séparer locatif et entreprise (le « bénéfice net » de
    // l'accueil mélangeait les deux).
    const tc = totauxCloture(state)
    const aCl = assiettes()
    eq('M17', 'totauxCloture().net = net locatif + net d\'entreprise du module d\'impôt',
       aCl.netLoc + aCl.netEnt, tc.net)
    check('M18', 'totauxCloture() expose le détail locatif / entreprise',
          'netLoc et netEnt présents',
          [typeof tc.netLoc, typeof tc.netEnt].join('/'),
          typeof tc.netLoc === 'number' && typeof tc.netEnt === 'number')

    // ══ C. DÉDUCTION POUR AMORTISSEMENT (dpa.js) ══════════════════════════════
    eq('M19', 'Catégorie 1 : taux de 4 %', 0.04, dpaCategorie('1').taux, 0.0001)
    eq('M20', 'Catégorie 8 : taux de 20 %', 0.20, dpaCategorie('8').taux, 0.0001)

    // Bâtiment de 400 000 $ dont 100 000 $ de terrain, acquis dans l'année.
    state.biens = [{
      id: 'b1', propId: 'pA', description: 'Bâtiment Duplex A', categorie: '1',
      dateAcquisition: FIX_YEAR + '-02-01', cout: '400000', coutTerrain: '100000',
      lie: false, fnaccOuverture: '', dpa: {}, dispositionDate: '', dispositionProduit: ''
    }]
    invalidateDPA()
    let dpa = calculDPA(FIX_YEAR)
    let poolBat = dpa.pools.find(p => p.categorie === '1')
    eq('M21', 'Le terrain n\'est pas amortissable : base = 400 000 − 100 000',
       300000, poolBat.ajouts)
    eq('M22', 'IIA ' + FIX_YEAR + ' : la règle du demi-taux est suspendue (réduction = 0)',
       0, poolBat.reduction)
    eq('M23', 'DPA maximale = 300 000 $ × 4 % (plein taux grâce à l\'IIA)',
       12000, poolBat.dpaMax)
    check('M24', 'Classe distincte pour un bâtiment locatif ≥ 50 000 $ (art. 1101(1ac))',
          true, poolBat.distincte, poolBat.distincte === true)

    // Plafond de l'art. 1100(11) : la DPA ne peut créer ni augmenter une perte.
    const revLocFix = activeProps().reduce((s, p) => s + propTotals(p.id).rev, 0)
    const depLocFix = activeProps().reduce((s, p) => s + propTotals(p.id).dep, 0)
    eq('M25', 'Plafond 1100(11) = revenu locatif net avant DPA, tous immeubles confondus',
       Math.max(0, revLocFix - depLocFix), dpa.plafondLocatif)

    // Acquisition après la fin de l'IIA : le demi-taux revient.
    state.biens[0].dateAcquisition = '2028-03-01'
    const anneeApresAII = 2028
    writeYear(anneeApresAII, (() => {
      const st = JSON.parse(JSON.stringify(state))
      return st
    })())
    invalidateDPA()
    const dpa2028 = calculDPA(anneeApresAII)
    const pool2028 = dpa2028.pools.find(p => p.categorie === '1')
    eq('M26', 'Hors IIA (2028) : demi-taux rétabli → réduction = 50 % des ajouts',
       150000, pool2028.reduction)
    eq('M27', 'Hors IIA (2028) : DPA max = (300 000 − 150 000) × 4 %',
       6000, pool2028.dpaMax)
    try { localStorage.removeItem(STORE_PREFIX + anneeApresAII) } catch (e) {}
    state.biens[0].dateAcquisition = FIX_YEAR + '-02-01'

    // Catégorie 10.1 : coût plafonné (39 000 $ + taxes en 2026).
    state.biens.push({
      id: 'b2', propId: '__veh', description: 'Automobile', categorie: '10.1',
      dateAcquisition: FIX_YEAR + '-05-01', cout: '70000', coutTerrain: '',
      lie: false, fnaccOuverture: '', dpa: {}, dispositionDate: '', dispositionProduit: ''
    })
    invalidateDPA()
    dpa = calculDPA(FIX_YEAR)
    const pool101 = dpa.pools.find(p => p.categorie === '10.1')
    const fAuto = fiscal(FIX_YEAR)
    const plafond101 = fAuto.auto.plafondCat101 * (1 + fAuto.taxes.tps + fAuto.taxes.tvq)
    eq('M28', 'Catégorie 10.1 : le coût est plafonné par la limite de l\'année (taxes incluses)',
       plafond101, pool101.ajouts, 0.5)
    eq('M29', 'Catégorie 10.1 : le demi-taux demeure (exclue de l\'IIA)',
       plafond101 * 0.5, pool101.reduction, 0.5)

    // FNACC de clôture : ouverture + ajouts − dispositions − réclamée.
    state.biens[0].dpa = {}
    state.biens[0].dpa[FIX_YEAR] = 5000
    invalidateDPA()
    dpa = calculDPA(FIX_YEAR)
    poolBat = dpa.pools.find(p => p.categorie === '1')
    eq('M30', 'FNACC de clôture = ouverture + ajouts − dispositions − DPA réclamée',
       0 + 300000 - 0 - 5000, poolBat.fermeture)
    eq('M31', 'La DPA réclamée est reprise dans le total locatif', 5000, dpa.totalLocatif)

    // Report automatique de la FNACC d'une année à l'autre. L'année source doit
    // décrire SON année : acquisition en ANNEE_TEST_VOISINE et DPA réclamée pour
    // cette même année, sinon calculDPA() n'y voit ni ajout ni réclamation et la
    // FNACC de clôture à reporter vaut zéro.
    const stPrec = JSON.parse(JSON.stringify(state))
    stPrec.biens = stPrec.biens.map(b => b.id === 'b1'
      ? { ...b, dateAcquisition: ANNEE_TEST_VOISINE + '-02-01', fnaccOuverture: '',
          dpa: { [ANNEE_TEST_VOISINE]: 5000 } }
      : b)
    writeYear(ANNEE_TEST_VOISINE, stPrec)
    const stSuiv = JSON.parse(JSON.stringify(stPrec))
    stSuiv.biens = stSuiv.biens.map(b => ({ ...b, dateAcquisition: '2000-01-01', fnaccOuverture: '', dpa: {} }))
    writeYear(ANNEE_TEST_VOISINE + 1, stSuiv)
    invalidateDPA()
    const dpaSuiv = calculDPA(ANNEE_TEST_VOISINE + 1)
    const poolSuiv = dpaSuiv.pools.find(p => p.categorie === '1')
    eq('M32', 'FNACC d\'ouverture reportée automatiquement de l\'année précédente',
       295000, poolSuiv ? poolSuiv.ouverture : -1)
    check('M33', 'Le report de FNACC est signalé comme tel (et non saisi à la main)',
          true, poolSuiv ? poolSuiv.reportee : null, !!(poolSuiv && poolSuiv.reportee))
    try {
      localStorage.removeItem(STORE_PREFIX + (ANNEE_TEST_VOISINE + 1))
    } catch (e) {}
    invalidateDPA()

    // ══ D. KILOMÉTRAGE ET MÉTHODES DU VÉHICULE ════════════════════════════════
    const paliersKm = fiscal(FIX_YEAR).km.paliers
    const ind = kmIndemnite(6000, FIX_YEAR)
    const attenduInd = (() => {
      let reste = 6000, bas = 0, m = 0
      for (const [plafond, taux] of paliersKm) {
        const t = Math.min(reste, plafond - bas); if (t <= 0) break
        m += t * taux; reste -= t; bas = plafond
      }
      return m
    })()
    eq('M34', 'kmIndemnite() applique les paliers de l\'ARC, pas un taux unique',
       attenduInd, ind.montant)
    check('M35', 'kmIndemnite() : le taux moyen est inférieur au taux du 1ᵉʳ palier au-delà du seuil',
          'taux moyen < ' + paliersKm[0][1], ind.tauxMoyen, ind.tauxMoyen < paliersKm[0][1])

    const cmp = comparerMethodesVehicule()
    eq('M36', 'Méthode 1 = frais réels × (km d\'affaires ÷ km total)',
       10000 * cmp.kmAff / 20000, cmp.m1.total)
    eq('M37', 'Méthode 2 = indemnité par paliers sur le TOTAL des km d\'affaires',
       kmIndemnite(cmp.kmAff, FIX_YEAR).montant, cmp.m2.total)
    eq('M38', 'Les parts par activité de la méthode 2 somment au total',
       cmp.m2.total, cmp.m2.uber + cmp.m2.lyft + cmp.m2.loc)
    eq('M39', 'L\'écart annoncé est bien méthode 1 − méthode 2',
       cmp.m1.total - cmp.m2.total, cmp.ecart)

    const coh = coherenceKm()
    eq('M40', 'coherenceKm() : km d\'affaires = trajets locatifs + Uber + Lyft',
       150 + 4000 + 1000, coh.kmAffaires)
    eq('M41', 'coherenceKm() : prorata = km d\'affaires ÷ km total déclaré',
       5150 / 20000, coh.prorata, 0.0001)
    eq('M42', 'coherenceKm() : l\'écart d\'odomètre (20 000) est cohérent avec le total déclaré',
       20000, coh.kmOdo)
    check('M43', 'coherenceKm() signale un déplacement sans motif',
          '1 déplacement', coh.sansMotif.length, coh.sansMotif.length === 1)

    const kmSauve = state.settings.kmTotalAnnuel
    state.settings.kmTotalAnnuel = 3000
    check('M44', 'coherenceKm() signale des km d\'affaires supérieurs au total du véhicule',
          'anomalie présente', coherenceKm().anomalies.length,
          coherenceKm().anomalies.some(a => a.includes('dépassent')))
    state.settings.kmTotalAnnuel = kmSauve

    // ══ E. TPS / TVQ (tps-tvq.js) ═════════════════════════════════════════════
    const ct = contenuTaxes(114.975, FIX_YEAR)
    eq('M45', 'Montant TTC de 114,975 $ → 100 $ hors taxes', 100, ct.ht, 0.001)
    eq('M46', 'TPS extraite = 5 % du prix hors taxes', 5, ct.tps, 0.001)
    eq('M47', 'TVQ extraite = 9,975 % du prix HORS TPS (et non du prix avec TPS)',
       9.975, ct.tvq, 0.001)
    eq('M48', 'La TVQ ne s\'applique pas sur la TPS : tvq ÷ ht = 0,09975',
       0.09975, ct.tvq / ct.ht, 0.00001)

    const tx = calculTaxes()
    eq('M49', 'CTI véhicule = TPS contenue dans les dépenses × prorata commercial',
       contenuTaxes(10000, FIX_YEAR).tps * (5000 / 20000), tx.ctiVeh, 0.05)
    eq('M50', 'TPS nette = TPS perçue − CTI', tx.tpsPercue - tx.cti, tx.tpsNette)
    eq('M51', 'Solde de TPS = TPS nette − TPS déjà versée par les plateformes',
       tx.tpsNette - tx.tpsVerseePlateforme, tx.tpsSolde)
    eq('M52', 'La TPS payée sur les frais de service d\'Uber est un CTI du chauffeur',
       125, tx.tpsFraisUber)

    // ── Les lignes de taxes de Lyft entrent dans la déclaration ──────────────
    // Elles sont saisies MOIS PAR MOIS, la déclaration est annuelle : tant
    // qu'elles étaient ignorées, la ligne 101 comptait les fournitures taxables
    // de Lyft sans la taxe perçue dessus, et le chauffeur ne réclamait jamais
    // ses CTI/RTI sur les frais Lyft.
    eq('M52a', 'lyftTaxTotals() cumule les douze mois',
       '350|698.25|30|59.86|360|718.2',
       ['gst_riders','qst_riders','gst_fees','qst_fees','gst_remitted','qst_remitted']
         .map(k => Math.round(lyftTaxTotals()[k] * 100) / 100).join('|'))
    eq('M52b', 'TPS perçue = part Uber + Lyft (passagers et primes)',
       1500 + 350 + 10, tx.tpsPercue, 0.005)
    eq('M52c', 'TVQ perçue = part Uber + Lyft (passagers et primes)',
       2992.50 + 698.25 + 19.95, tx.tvqPercue, 0.005)
    eq('M52d', 'Le CTI comprend la TPS payée sur les frais Lyft',
       30, tx.tpsFraisLyft, 0.005)
    eq('M52e', 'Le déjà-versé comprend la part de Lyft',
       1500 + 360, tx.tpsVerseePlateforme, 0.005)
    eq('M52f', 'Le détail par plateforme liste Uber et Lyft',
       'Uber|Lyft', tx.parPlateforme.map(p => p.nom).join('|'))

    // ── Les péages encaissés : revenu, mais pas une fourniture taxable de plus
    // Lyft calcule lui-même la TPS/TVQ perçue sur sa ligne « Base taxable » ;
    // ajouter le péage aux fournitures de la ligne 101 compterait la même
    // fourniture deux fois et gonflerait la taxe nette.
    eq('M52g', 'Le net d\'un mois Lyft comprend les péages encaissés',
       95, lyftMonthNet({ taxable:'100', bonuses:'10', tips:'5', tolls:'8', fees:'28' }), 0.005)
    const baseAvant = lyftTaxableBase(), netAvant = lyftNetIncome()
    state.lyft[11] = { tolls: '40' }
    const baseApres = lyftTaxableBase(), netApres = lyftNetIncome()
    delete state.lyft[11]
    eq('M52h', 'Un péage encaissé n\'entre pas dans les fournitures taxables du FPZ-500',
       baseAvant, baseApres, 0.005)
    eq('M52i', 'Un péage encaissé entre en entier dans le revenu net Lyft',
       40, netApres - netAvant, 0.005)

    // ══ F. IMPÔT ET ACOMPTES (impot.js) ═══════════════════════════════════════
    const a = assiettes()
    eq('M53', 'Net locatif = revenus − dépenses − DPA locative réclamée',
       a.revLoc - a.depLoc - a.dpaLoc, a.netLoc)
    eq('M54', 'Net d\'entreprise = net Uber + net Lyft − part véhicule − DPA entreprise',
       a.revEnt - a.depEnt, a.netEnt)
    eq('M55', 'Revenu total = T4 + net locatif + net d\'entreprise + autres',
       a.t4 + a.netLoc + a.netEnt + a.autres, a.revenuTotal)
    check('M56', 'Les cotisations RRQ/RQAP/FSS sont calculées sans NaN',
          'nombres finis',
          [a.rrq.total, a.rqap.montant, a.fss.montant].join('/'),
          [a.rrq.total, a.rqap.montant, a.fss.montant].every(Number.isFinite))

    const ci = calculImpot()
    const champsImpot = ['fedNet', 'qcNet', 'cotisations', 'totalAvantRetenues', 'solde', 'marginal', 'provision']
    check('M57', 'calculImpot() ne produit aucun NaN',
          'tous finis',
          champsImpot.filter(k => !Number.isFinite(ci[k])).join(',') || 'tous finis',
          champsImpot.every(k => Number.isFinite(ci[k])))
    check('M58', 'Le taux marginal combiné est plausible (entre 10 % et 55 %)',
          '0,10 — 0,55', ci.marginal, ci.marginal > 0.10 && ci.marginal < 0.55)
    eq('M59', 'L\'abattement du Québec s\'applique à l\'impôt fédéral après crédits',
       ci.fedApresCredits * fiscal(FIX_YEAR).fed.abattementQc, ci.abattement, 0.5)
    eq('M60', 'Total avant retenues = fédéral + Québec + cotisations',
       ci.fedNet + ci.qcNet + ci.cotisations, ci.totalAvantRetenues, 0.5)

    const ac = calculAcomptes()
    eq('M61', 'Quatre versements d\'acomptes sont proposés', 4, ac.versements.length)
    eq('M62', 'Chaque versement fédéral vaut le quart de l\'impôt net fédéral',
       ac.requisFed ? ac.netFed / 4 : 0, ac.versements[0].fed, 0.5)
    check('M63', 'L\'obligation d\'acomptes suit le seuil de l\'année (et non un seuil codé en dur)',
          'requis ssi net > seuil',
          [ac.requisFed, ac.netFed > fiscal(FIX_YEAR).acomptes.seuilFed].join('/'),
          ac.requisFed === (ac.netFed > fiscal(FIX_YEAR).acomptes.seuilFed))

    // ══ G. ÉTAT PAR COPROPRIÉTAIRE ════════════════════════════════════════════
    const etat = etatParCoproprietaire()
    const moi = etat.liste.find(p => p.moi)
    const autre = etat.liste.find(p => !p.moi)
    const tBfix = propTotals('pB')
    eq('M64', 'La part du copropriétaire à 50 % est la moitié des revenus de pB',
       tBfix.rev * 0.5, autre ? autre.rev : -1)
    eq('M65', 'Ma part = 100 % de pA + 50 % de pB',
       propTotals('pA').rev + tBfix.rev * 0.5, moi ? moi.rev : -1)
    eq('M66', 'La somme des parts de tous les copropriétaires = total des immeubles',
       propTotals('pA').rev + tBfix.rev,
       etat.liste.reduce((s, p) => s + p.rev, 0))
    check('M67', 'La propriété partagée est détectée', true, etat.partagee, etat.partagee === true)

    // ══ H. AUDIT DES PIÈCES (recus.js) ════════════════════════════════════════
    state.receipts = {}
    let audit = auditRecus()
    check('M68', 'Un ajout en capital sans pièce est signalé (les lignes capital portent désormais un reçu)',
          'ligne capital présente',
          audit.manquants.filter(m => m.section === 'capital').length,
          audit.manquants.some(m => m.section === 'capital' && m.montant === 8000))
    check('M69', '« Frais de déplacement » est exclu de l\'audit (sa pièce est le registre km)',
          'absent', audit.manquants.filter(m => m.cat === 'Frais de déplacement').length,
          !audit.manquants.some(m => m.cat === 'Frais de déplacement'))

    const cleCap = cleRecu('pA', 'capital', 'Rénovation majeure', 5)
    state.receipts[cleCap] = 'data:image/jpeg;base64,AAAA'
    audit = auditRecus()
    check('M70', 'Joindre le reçu de l\'ajout en capital le fait passer en « pièce présente »',
          'présent', audit.presents.filter(m => m.key === cleCap).length,
          audit.presents.some(m => m.key === cleCap))
    eq('M71', 'La couverture = montants avec pièce ÷ total des montants',
       audit.montantPresent / audit.total, audit.couverture, 0.0001)
    const auditSeuil = auditRecus({ seuil: 100000 })
    eq('M72', 'Un seuil élevé ne laisse aucun manquant', 0, auditSeuil.manquants.length)
    state.receipts = {}

    // ══ I. VENTILATION D'UNE DÉPENSE ══════════════════════════════════════════
    const avantPA = getMonthlyVal('pA', 'deductibles', 'Électricité', 3)
    const avantPB = getMonthlyVal('pB', 'deductibles', 'Taxes municipales', 3)
    state.ventilations = [{
      id: 'v1', date: `${FIX_YEAR}-04-10`, libelle: 'Facture mixte',
      montant: '1000', applique: false, applied: [],
      parts: [
        { key: 'prop|pA|Électricité', pct: '60' },
        { key: 'prop|pB|Taxes municipales', pct: '40' }
      ]
    }]
    appliquerVentilation('v1')
    eq('M73', 'Ventilation 60 % : la part s\'AJOUTE au montant déjà présent dans la cellule',
       avantPA + 600, getMonthlyVal('pA', 'deductibles', 'Électricité', 3))
    eq('M74', 'Ventilation 40 % : part portée au second immeuble',
       avantPB + 400, getMonthlyVal('pB', 'deductibles', 'Taxes municipales', 3))
    eq('M75', 'La somme des parts appliquées égale le montant ventilé',
       1000, (ventilations()[0].applied || []).reduce((s, x) => s + x.montant, 0))
    retirerVentilation('v1')
    eq('M76', 'Retirer la ventilation restitue exactement la cellule d\'origine (pA)',
       avantPA, getMonthlyVal('pA', 'deductibles', 'Électricité', 3))
    eq('M77', 'Retirer la ventilation restitue exactement la cellule d\'origine (pB)',
       avantPB, getMonthlyVal('pB', 'deductibles', 'Taxes municipales', 3))

    state.ventilations = [{
      id: 'v2', date: `${FIX_YEAR}-04-10`, libelle: 'Trop réparti', montant: '1000',
      applique: false, applied: [],
      parts: [{ key: 'prop|pA|Électricité', pct: '70' }, { key: 'prop|pB|Taxes municipales', pct: '50' }]
    }]
    const avantRefus = getMonthlyVal('pA', 'deductibles', 'Électricité', 3)
    appliquerVentilation('v2')
    eq('M78', 'Une répartition supérieure à 100 % est refusée, sans effet sur les cellules',
       avantRefus, getMonthlyVal('pA', 'deductibles', 'Électricité', 3))
    check('M79', 'La ventilation refusée reste marquée « non appliquée »',
          false, ventilations()[0].applique, ventilations()[0].applique === false)
    state.ventilations = []

    // ══ J. IMPORT BANCAIRE ════════════════════════════════════════════════════
    eq('M80', 'csvDecouper() respecte les guillemets (virgule interne au libellé)',
       ['2026-01-05', 'EPICERIE, RUE A', '-123,45'],
       csvDecouper('2026-01-05,"EPICERIE, RUE A","-123,45"', ','))
    eq('M81', 'csvDecouper() lit un guillemet échappé ("")',
       ['Le "Plex"'], csvDecouper('"Le ""Plex"""', ','))
    eq('M82', 'parseDateBancaire() lit AAAA-MM-JJ', '2026-03-07', parseDateBancaire('2026-03-07'))
    eq('M83', 'parseDateBancaire() lit AAAAMMJJ (OFX)', '2026-03-07', parseDateBancaire('20260307'))
    eq('M84', 'parseDateBancaire() : 25/03/2026 est le 25 mars (le jour dépasse 12)',
       '2026-03-25', parseDateBancaire('25/03/2026'))
    eq('M85', 'parseDateBancaire() : 03/07/2026 suit le réglage JJ/MM par défaut',
       '2026-07-03', parseDateBancaire('03/07/2026', false))
    eq('M86', 'parseDateBancaire() : le même texte en ordre US donne le 7 mars',
       '2026-03-07', parseDateBancaire('03/07/2026', true))
    eq('M87', 'parseDateBancaire() rejette une date impossible', null, parseDateBancaire('2026-13-45'))

    const csvBanque = [
      'Date,Description,Retrait,Dépôt',
      '2026-01-05,"HYDRO QUEBEC, PAIEMENT",150.25,',
      '2026-01-07,DEPOT LOYER LOG 1,,1000.00',
      'ligne sans date,BRUIT,,'
    ].join('\n')
    const txs = parseCSVBancaire(csvBanque)
    eq('M88', 'parseCSVBancaire() ignore l\'en-tête et la ligne sans date', 2, txs.length)
    eq('M89', 'parseCSVBancaire() : un retrait devient un montant négatif', -150.25, txs[0].montant)
    eq('M90', 'parseCSVBancaire() : un dépôt reste positif', 1000, txs[1].montant)
    eq('M91', 'parseCSVBancaire() lit le libellé malgré la virgule interne',
       'HYDRO QUEBEC, PAIEMENT', txs[0].libelle)

    const csvSansEntete = '07/01/2026;VIREMENT ASSURANCE;-85,50'
    const txs2 = parseCSVBancaire(csvSansEntete)
    eq('M92', 'parseCSVBancaire() fonctionne sans en-tête et avec le point-virgule',
       1, txs2.length)
    eq('M93', 'parseCSVBancaire() sans en-tête : montant négatif conservé',
       -85.5, txs2.length ? txs2[0].montant : 0)

    eq('M94', 'empreinteTx() est identique pour la même transaction',
       empreinteTx({ date: '2026-01-05', montant: '-150.25', libelle: 'HYDRO QUEBEC  #1234' }),
       empreinteTx({ date: '2026-01-05', montant: -150.25, libelle: 'hydro quebec #1234' }))
    check('M95', 'empreinteTx() diffère si le montant diffère',
          'empreintes différentes', 'ok',
          empreinteTx({ date: '2026-01-05', montant: -150.25, libelle: 'X' })
          !== empreinteTx({ date: '2026-01-05', montant: -150.26, libelle: 'X' }))

    setup.reglesImport = [
      { id: 'r1', motif: 'hydro', key: 'prop|pA|Électricité' },
      { id: 'r2', motif: 'hydro quebec', key: 'prop|pB|Taxes municipales' }
    ]
    const regle = regleCorrespondante('HYDRO QUEBEC PAIEMENT')
    eq('M96', 'Entre deux règles, le motif le plus long gagne (le plus spécifique)',
       'r2', regle ? regle.id : null)
    eq('M97', 'Aucune règle ne correspond à un libellé inconnu',
       null, regleCorrespondante('LIBELLE INCONNU XYZ'))
    setup.reglesImport = []

    // ══ K. BAUX ET RL-31 ══════════════════════════════════════════════════════
    state.baux = [{
      id: 'bail1', propId: 'pA', unite: 'Logement 1', loyerMensuel: '1000',
      dateDebut: `${FIX_YEAR}-07-01`, dateFin: `${FIX_YEAR + 1}-06-30`,
      locataires: [{ nom: 'Marie Tremblay' }], chauffeEau: false, electriciteIncluse: false
    }]
    save()
    writeYear(ANNEE_TEST_VOISINE, JSON.parse(JSON.stringify(state)))
    const stCible = defaultState()
    writeYear(ANNEE_TEST_VOISINE + 1, stCible)
    const nbReportes = reporterBaux(ANNEE_TEST_VOISINE, ANNEE_TEST_VOISINE + 1, 2)
    const cible = readYear(ANNEE_TEST_VOISINE + 1)
    eq('M98', 'reporterBaux() reporte le bail dans l\'année cible', 1, nbReportes)
    eq('M99', 'reporterBaux() indexe le loyer de 2 % (1 000 $ → 1 020 $)',
       '1020', cible ? cible.baux[0].loyerMensuel : null)
    eq('M100', 'reporterBaux() décale les dates du bail d\'une année',
       `${FIX_YEAR + 1}-07-01`, cible ? cible.baux[0].dateDebut : null)
    check('M101', 'Un bail reporté garde la trace de son année d\'origine',
          ANNEE_TEST_VOISINE, cible ? cible.baux[0].reportDe : null,
          !!cible && cible.baux[0].reportDe === ANNEE_TEST_VOISINE)
    check('M102', 'Un bail reporté reçoit un nouvel identifiant',
          'identifiant différent', 'ok', !!cible && cible.baux[0].id !== 'bail1')
    try {
      localStorage.removeItem(STORE_PREFIX + (ANNEE_TEST_VOISINE + 1))
      localStorage.removeItem(STORE_PREFIX + ANNEE_TEST_VOISINE)
    } catch (e) {}

    const rl31 = bauxRL31()
    check('M103', 'bauxRL31() retient le bail en vigueur au 31 décembre',
          '1 relevé', rl31.length, rl31.length === 1)

    // ══ L. SIMULATEUR D'ACHAT ═════════════════════════════════════════════════
    // Loi sur l'intérêt, art. 6 : taux nominal composé SEMESTRIELLEMENT.
    eq('M104', 'Taux mensuel effectif canadien à 6 % nominal = (1,03)^(1/6) − 1',
       Math.pow(1.03, 1 / 6) - 1, tauxMensuelCanadien(0.06), 1e-12)
    check('M105', 'Le taux mensuel canadien est inférieur au taux nominal ÷ 12',
          '< 0,005', tauxMensuelCanadien(0.06), tauxMensuelCanadien(0.06) < 0.06 / 12)

    const pmt = paiementHypothecaire(300000, 0.06, 25)
    // Invariant : 300 paiements au taux mensuel effectif doivent solder le prêt.
    const soldeFinal = (() => {
      const i = tauxMensuelCanadien(0.06)
      let s = 300000
      for (let m = 0; m < 300; m++) s = s + s * i - pmt
      return s
    })()
    eq('M106', 'Le paiement calculé solde exactement le prêt en 25 ans', 0, soldeFinal, 0.5)
    const an1 = premiereAnnee(300000, 0.06, 25)
    eq('M107', 'Première année : intérêt + capital = 12 paiements',
       pmt * 12, an1.interet + an1.principal, 0.5)
    check('M108', 'Première année : l\'intérêt dépasse le capital remboursé (début d\'amortissement)',
          'intérêt > capital', [an1.interet, an1.principal].join('/'), an1.interet > an1.principal)

    const mut = droitsMutationEstimes(400000)
    const pal = fiscal(FIX_YEAR).mutation.paliers
    const mutAttendu = 62900 * 0.005 + (315000 - 62900) * 0.01 + (400000 - 315000) * 0.015
    eq('M109', 'Droits de mutation sur 400 000 $ = paliers 0,5 % / 1 % / 1,5 %',
       mutAttendu, mut.montant, 0.01)
    eq('M110', 'Les paliers de mutation viennent de fiscal-data.js (62 900 $ et 315 000 $ en 2026)',
       [62900, 315000], [pal[0][0], pal[1][0]])
    check('M111', 'Mise de fonds de 20 % exigée pour un immeuble non occupé par le propriétaire',
          'false à 15 %, true à 20 %',
          [miseDeFondsSuffisante(400000, 60000), miseDeFondsSuffisante(400000, 80000)].join('/'),
          miseDeFondsSuffisante(400000, 60000) === false && miseDeFondsSuffisante(400000, 80000) === true)

    state.simu = { prix: '400000', miseDeFonds: '80000', taux: '6', amortissement: 25,
                   loyerMensuel: '3000', vacancePct: 4, taxesMun: '5000', taxeScolaire: '600',
                   assurance: '2000', energie: '1200', entretienPct: 5, gestionPct: 0,
                   autresDep: '', partTerrainPct: 20, pctPropriete: 100, mutation: '',
                   inspection: 800, notaire: 1800, kmUberSupp: '' }
    const sim = simuler()
    eq('M112', 'Revenu effectif = loyers bruts − vacance de 4 %',
       36000 - 36000 * 0.04, sim.revenuEffectif)
    eq('M113', 'Résultat net d\'exploitation = revenu effectif − dépenses d\'exploitation',
       sim.revenuEffectif - sim.exploitation, sim.rno)
    eq('M114', 'Flux de trésorerie = RNO − service de la dette (capital inclus)',
       sim.rno - sim.serviceDette, sim.flux)
    eq('M115', 'Résultat fiscal avant DPA : seul l\'INTÉRÊT est déductible, pas le capital',
       sim.rno - sim.hyp.interet, sim.resultatAvantDPA)
    check('M116', 'Art. 1100(11) : la DPA retenue ne peut créer de perte locative',
          'dpaUtile ≤ résultat avant DPA',
          [sim.dpaUtile, sim.resultatAvantDPA].join('/'),
          sim.dpaUtile <= Math.max(0, sim.resultatAvantDPA) + 0.01)
    eq('M117', 'DPA maximale = part bâtiment (80 %) × 4 %, plein taux grâce à l\'IIA',
       400000 * 0.8 * 0.04, sim.dpaMax)
    eq('M118', 'Comptant requis = mise de fonds + mutation + inspection + notaire',
       80000 + sim.mutantion + 800 + 1800, sim.comptant)
    check('M119', 'Test de résistance : +2 points réduit le flux de trésorerie',
          'flux stressé < flux', [sim.fluxStress, sim.flux].join('/'), sim.fluxStress < sim.flux)
    check('M120', 'Aucun indicateur du simulateur n\'est NaN',
          'tous finis',
          ['capRate', 'rendementMise', 'rcd', 'flux', 'impot', 'fluxApresImpot']
            .filter(k => !Number.isFinite(sim[k])).join(',') || 'tous finis',
          ['capRate', 'rendementMise', 'rcd', 'flux', 'impot', 'fluxApresImpot']
            .every(k => Number.isFinite(sim[k])))

    // Sans km supplémentaires saisis, le scénario n'a pas d'objet : simulerUber()
    // retourne null, et c'est le comportement attendu.
    check('M121a', 'Aucun km supplémentaire saisi : le scénario Uber ne s\'affiche pas',
          'null', String(simulerUber()), simulerUber() === null)
    state.simu.kmUberSupp = '5000'
    const simU = simulerUber()
    check('M121', 'Le scénario « rouler plus en Uber » ne produit pas de NaN',
          'objet exploitable',
          simU && Object.values(simU).every(v => typeof v !== 'number' || Number.isFinite(v))
            ? 'ok' : 'NaN détecté',
          !!simU && Object.values(simU).every(v => typeof v !== 'number' || Number.isFinite(v)))
    eq('M121b', 'Scénario Uber : le net en poche = revenus − coûts − impôt + CTI',
       simU ? simU.revSupp - simU.coutSupp - simU.impotSupp + simU.ctiSupp : 0,
       simU ? simU.netEnPoche : -1, 0.01)
    state.simu.kmUberSupp = ''

    // ══ M. TABLEAU DE BORD PLURIANNUEL ════════════════════════════════════════
    writeYear(ANNEE_TEST_VOISINE, JSON.parse(JSON.stringify(state)))
    const tAnnee = totauxAnnee(ANNEE_TEST_VOISINE)
    eq('M122', 'totauxAnnee() lit une autre année que l\'année active',
       propTotals('pA').rev + propTotals('pB').rev, tAnnee ? tAnnee.rev : -1, 1)
    check('M123', 'totauxAnnee() sur une année absente retourne null',
          null, totauxAnnee(2097), totauxAnnee(2097) === null)
    const series = seriesPluriannuelles()
    check('M124', 'seriesPluriannuelles() retourne au moins l\'année active',
          '≥ 1 année', series.length, Array.isArray(series) && series.length >= 1)
    sansErreur('M125', 'anomaliesPluriannuelles() ne lève pas sur une seule année',
               () => anomaliesPluriannuelles(series))
    try { localStorage.removeItem(STORE_PREFIX + ANNEE_TEST_VOISINE) } catch (e) {}

    // ══ N. RECOMMANDATIONS ════════════════════════════════════════════════════
    const recos = recommandations()
    check('M126', 'recommandations() produit au moins une piste sur la fixture',
          '≥ 1', recos.length, recos.length >= 1)
    const champsReco = ['id', 'titre', 'montant', 'horizon', 'quoi', 'pourquoi', 'action', 'source']
    const incompletes = recos.filter(r => champsReco.some(c => r[c] == null || r[c] === ''))
    eq('M127', 'Chaque recommandation dit quoi, pourquoi, quoi faire et d\'où vient la règle',
       [], incompletes.map(r => r.id))
    const horizonsConnus = ['annee', 'report', 'projet', 'risque']
    eq('M128', 'Chaque recommandation porte un horizon connu',
       [], recos.filter(r => !horizonsConnus.includes(r.horizon)).map(r => r.id))
    const triDecroissant = recos.every((r, i) => i === 0 || recos[i - 1].montant >= r.montant)
    check('M129', 'Les recommandations sont triées par montant décroissant',
          'tri décroissant', triDecroissant ? 'ok' : 'désordonné', triDecroissant)
    check('M130', 'Aucun montant de recommandation n\'est NaN',
          'tous finis', recos.filter(r => !Number.isFinite(r.montant)).map(r => r.id).join(',') || 'tous finis',
          recos.every(r => Number.isFinite(r.montant)))

    // ══ O. DOSSIER COMPTABLE : ANNEXES CSV ════════════════════════════════════
    const annexes = [
      ['registreKmCSV', registreKmCSV], ['rl31CSV', rl31CSV], ['dpaCSV', dpaCSV],
      ['coproCSV', coproCSV], ['impotCSV', impotCSV], ['taxesCSV', taxesCSV]
    ]
    annexes.forEach(([nom, fn], i) => {
      let err = null, txt = ''
      try { txt = fn() } catch (e) { err = e.message }
      check('M' + (131 + i), `Annexe « ${nom} » produite sans exception et non vide`,
            'CSV non vide', err || (txt ? txt.split('\n').length + ' lignes' : 'vide'),
            !err && !!txt && txt.split('\n').length > 1)
    })

    // ══ P. RÉUTILISATION DES EXPORTS (opts.retourner) ═════════════════════════
    let csvRetourne = null, errCsv = null
    try { csvRetourne = exportCSV({ retourner: true }) } catch (e) { errCsv = e.message }
    check('M137', 'exportCSV({retourner:true}) rend le CSV sans déclencher de téléchargement',
          'texte CSV', errCsv || (typeof csvRetourne === 'string' ? 'chaîne de ' + csvRetourne.length : typeof csvRetourne),
          !errCsv && typeof csvRetourne === 'string' && csvRetourne.length > 50)

    // ══ Q1. EXPORT CSV : UBER ET VÉHICULE (§ E.1) ═════════════════════════════
    // L'export omettait entièrement le revenu Uber et les dépenses du véhicule :
    // un comptable travaillant sur le CSV seul perdait la totalité du revenu de
    // transport et la plus grosse déduction du dossier.
    const csvE1 = exportCSV({ retourner: true })
    const lignesCSV = csvE1.trim().split('\n')

    // Compte les champs d'une ligne CSV en ignorant les virgules entre guillemets.
    const champsCSV = (ligne) => {
      let n = 1, dansGuillemets = false
      for (const ch of ligne) {
        if (ch === '"') dansGuillemets = !dansGuillemets
        else if (ch === ',' && !dansGuillemets) n++
      }
      return n
    }
    const nbColonnes = champsCSV(lignesCSV[0])
    const malFormees = lignesCSV.filter(l => champsCSV(l) !== nbColonnes)
    check('M158', 'Toutes les lignes du CSV ont le même nombre de colonnes que l\'en-tête',
          nbColonnes + ' colonnes partout',
          malFormees.length ? malFormees.length + ' ligne(s) décalée(s) : ' + malFormees[0].slice(0, 60)
                            : nbColonnes + ' colonnes partout',
          malFormees.length === 0)

    const ligneUber = lignesCSV.filter(l => l.startsWith('"Uber - '))
    check('M159', 'Le CSV contient une section Uber', 'au moins une ligne',
          ligneUber.length + ' ligne(s)', ligneUber.length > 0)
    const ligneNetUber = lignesCSV.find(l => l.startsWith('"Uber - Revenu net'))
    eq('M160', 'Le revenu net Uber du CSV égale uberNetIncome()',
       uberNetIncome().toFixed(2), ligneNetUber ? ligneNetUber.split(',').pop() : null)

    const lignesVeh = lignesCSV.filter(l => l.startsWith('"Véhicule - Dépenses'))
    const totalVehCSV = lignesVeh.find(l => l.includes('TOTAL engagé'))
    eq('M161', 'Le CSV porte le TOTAL des dépenses du véhicule (10 000 $ de carburant)',
       '10000.00', totalVehCSV ? totalVehCSV.split(',').pop() : null)

    // Une donnée annuelle ne doit pas atterrir dans la colonne de janvier : la
    // somme de la colonne serait fausse.
    const cellulesMois = (ligne) => {
      const parts = []
      let courant = '', dansGuillemets = false
      for (const ch of ligne) {
        if (ch === '"') { dansGuillemets = !dansGuillemets; continue }
        if (ch === ',' && !dansGuillemets) { parts.push(courant); courant = '' } else courant += ch
      }
      parts.push(courant)
      return parts.slice(2, 14)   // les 12 mois, après Section et Catégorie
    }
    check('M162', 'Les lignes annuelles (Uber, véhicule) laissent les 12 colonnes de mois vides',
          '12 cellules vides',
          ligneUber.concat(lignesVeh).every(l => cellulesMois(l).every(c => c === ''))
            ? '12 cellules vides' : 'un montant est tombé dans un mois',
          ligneUber.concat(lignesVeh).every(l => cellulesMois(l).every(c => c === '')))

    // Les déplacements : le montant doit tomber dans le mois du trajet. t2 est
    // daté du 10 mars → 3ᵉ colonne de mois.
    const ligneT2 = lignesCSV.find(l => l.includes(FIX_YEAR + '-03-10'))
    const moisT2 = ligneT2 ? cellulesMois(ligneT2) : []
    eq('M163', 'Un déplacement de mars porte son montant dans la colonne de mars',
       (50 * RATE).toFixed(2), moisT2[2])
    check('M164', 'Les autres mois du déplacement restent vides', '11 cellules vides',
          moisT2.filter((c, i) => i !== 2 && c !== '').length,
          moisT2.filter((c, i) => i !== 2 && c !== '').length === 0)
    check('M165', 'La section Déplacements est signalée comme un détail déjà compté',
          'libellé explicite', ligneT2 ? ligneT2.slice(0, 50) : null,
          !!ligneT2 && ligneT2.includes('déjà inclus'))

    // ══ Q2. RAPPEL D'ACOMPTES (§ E.5) ═════════════════════════════════════════
    const acR = calculAcomptes()
    check('M166', 'Chaque versement porte un nombre de jours fini',
          'nombres finis', acR.versements.map(v => v.jours).join('/'),
          acR.versements.every(v => Number.isFinite(v.jours)))
    check('M167', 'Un versement échu a un nombre de jours négatif ou nul, un futur positif',
          'cohérent', 'cohérent',
          acR.versements.every(v => v.echue ? v.jours < 0 : v.jours >= 0))
    const premierNonEchu = acR.versements.find(v => !v.echue) || null
    eq('M168', 'prochain = le premier versement non échu',
       premierNonEchu ? premierNonEchu.date : null, acR.prochain ? acR.prochain.date : null)

    // Un acompte exigé, échu, non versé : il doit être signalé en retard.
    const dImp = donneesImpot()
    const acomptesSauves = JSON.parse(JSON.stringify([dImp.acomptesFed, dImp.acomptesQc]))
    dImp.acomptesFed = ['', '', '', '']
    dImp.acomptesQc = ['', '', '', '']
    const acVide = calculAcomptes()
    const echusExiges = acVide.versements.filter(v => v.echue && (v.fed + v.qc) > 0)
    check('M169', 'Un acompte exigé, échu et non versé est marqué en retard',
          echusExiges.length + ' en retard', acVide.retards.length,
          echusExiges.length === acVide.retards.length && acVide.retards.length > 0)
    eq('M170', 'manqueTotal = somme des manques fédéral et Québec des versements en retard',
       acVide.retards.reduce((s, v) => s + v.manqueFed + v.manqueQc, 0), acVide.manqueTotal, 0.01)

    // Versé en entier : plus aucun retard sur ce versement.
    if (echusExiges.length) {
      dImp.acomptesFed = acVide.versements.map(v => String(v.fed))
      dImp.acomptesQc = acVide.versements.map(v => String(v.qc))
      const acPayes = calculAcomptes()
      eq('M171', 'Acomptes versés en entier : aucun retard, aucun manque', 0,
         acPayes.retards.length + acPayes.manqueTotal, 0.01)
    } else {
      check('M171', 'Acomptes versés en entier : aucun retard, aucun manque',
            'sans objet', 'aucun acompte échu exigé sur la fixture', true)
    }
    dImp.acomptesFed = acomptesSauves[0]
    dImp.acomptesQc = acomptesSauves[1]

    // ══ Q3. SIMULATEUR DE VENTE (§ E.6) ═══════════════════════════════════════
    // b1 : bâtiment de 400 000 $ dont 100 000 $ de terrain, 5 000 $ de DPA
    // réclamée en FIX_YEAR → FNACC de clôture 295 000 $.
    invalidateDPA()
    state.vente = {
      propId: 'pA', prixVente: '500000', commissionPct: 5,
      notaire: 1500, certificat: 1200, penaliteHypo: '', autresFrais: '',
      soldeHypo: '300000', partTerrainPct: '', ameliorations: '', pctPropriete: ''
    }
    const vn = calculVente()
    eq('M172', 'La DPA réclamée ne réduit PAS le prix de base rajusté', 400000, vn.pbr)
    eq('M173', 'Frais de vente = 5 % du prix + notaire + certificat', 25000 + 1500 + 1200, vn.fraisVente)
    eq('M174', 'Gain en capital = prix − PBR − frais de vente', 500000 - 400000 - 27700, vn.gainBrut)
    eq('M175', 'Taux d\'inclusion du gain en capital : la moitié', 0.5, vn.tauxInclusion, 0.0001)
    eq('M176', 'Gain imposable = la moitié du gain', (500000 - 400000 - 27700) / 2, vn.gainImposable)
    eq('M177', 'À défaut de saisie, la part du terrain reprend celle de l\'acquisition (25 %)',
       0.25, vn.partTerrain, 0.0001)
    eq('M178', 'Récupération de DPA = le moindre du produit et du coût, moins la FNACC (= la DPA réclamée)',
       5000, vn.recuperation)
    eq('M179', 'Aucune perte finale quand le produit du bâtiment dépasse la FNACC', 0, vn.perteFinale)
    eq('M180', 'Revenu ajouté à l\'année de vente = récupération (100 %) + gain imposable (50 %)',
       5000 + (500000 - 400000 - 27700) / 2, vn.ajout)
    check('M181', 'L\'impôt de la vente est positif et son taux réel reste plausible',
          '0 % < taux < 55 %', fmt(vn.tauxReelVente * 100, 1) + ' %',
          vn.impotVente > 0 && vn.tauxReelVente > 0 && vn.tauxReelVente < 0.55)
    check('M182', 'L\'impôt de la vente dépasse le taux marginal courant appliqué au revenu ajouté '
          + '(saut de palier) ou l\'égale', 'impôt ≥ marginal × ajout',
          money(vn.impotVente) + ' vs ' + money(vn.ajout * vn.marginalCourant),
          vn.impotVente >= vn.ajout * vn.marginalCourant - 1)
    eq('M183', 'Produit net = (prix − frais − hypothèque) × ma part − impôt',
       (500000 - 27700 - 300000) - vn.impotVente, vn.net, 0.5)

    // Vente à perte : perte finale au lieu d'une récupération.
    state.vente.prixVente = '250000'
    const vnBas = calculVente()
    eq('M184', 'Vente sous la FNACC : aucune récupération', 0, vnBas.recuperation)
    eq('M185', 'Vente sous la FNACC : perte finale = FNACC − produit attribué au bâtiment',
       295000 - 250000 * 0.75, vnBas.perteFinale)
    check('M186', 'Vente sous le PBR : une perte en capital, pas un gain',
          'perte', money(vnBas.perteCapital), vnBas.perteCapital > 0 && vnBas.gain === 0)
    eq('M187', 'Aucun impôt de vente quand le revenu ajouté est négatif', 0, vnBas.impotVente)

    // Part de propriété : pB est détenu à 50 %.
    state.vente = { ...state.vente, propId: 'pB', prixVente: '400000' }
    const vnB = calculVente()
    eq('M188', 'Un immeuble détenu à 50 % n\'impose que la moitié du gain dans MA déclaration',
       vnB.gainImposable * 0.5, vnB.monGainImposable)
    check('M189', 'Sans bien au registre, le simulateur le signale au lieu de calculer un faux gain',
          true, vnB.sansRegistre, vnB.sansRegistre === true)
    delete state.vente
    invalidateDPA()

    // ══ Q4. IMPORT OFX : DÉDOUBLONNAGE PAR FITID (§ E.7) ══════════════════════
    const OFX_TEST = `OFXHEADER:100
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${FIX_YEAR}0412120000<TRNAMT>-45.00
<FITID>TXN-A-001<NAME>QUINCAILLERIE TEST</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${FIX_YEAR}0412120000<TRNAMT>-45.00
<FITID>TXN-A-002<NAME>QUINCAILLERIE TEST</STMTTRN>`
    const txOFX = parseOFX(OFX_TEST)
    eq('M190', 'parseOFX() lit les deux transactions du relevé', 2, txOFX.length)
    eq('M191', 'parseOFX() retient le FITID, identifiant unique de l\'institution',
       ['TXN-A-001', 'TXN-A-002'], txOFX.map(t => t.fitid))
    check('M192', 'Deux achats identiques le même jour ont la même empreinte heuristique '
          + '(d\'où la nécessité du FITID)', 'empreintes identiques',
          empreinteTx(txOFX[0]) === empreinteTx(txOFX[1]) ? 'identiques' : 'différentes',
          empreinteTx(txOFX[0]) === empreinteTx(txOFX[1]))
    check('M193', 'La clé de comparaison, elle, diffère grâce au FITID',
          'clés distinctes', cleMatch(txOFX[0]) + ' ≠ ' + cleMatch(txOFX[1]),
          cleMatch(txOFX[0]) !== cleMatch(txOFX[1]))
    check('M193b', 'Sans FITID (cas du CSV), la clé de comparaison retombe sur l\'empreinte',
          'empreinte heuristique', cleMatch({ date: '2026-04-12', montant: -45, libelle: 'X' }),
          cleMatch({ date: '2026-04-12', montant: -45, libelle: 'X' })
            === empreinteTx({ date: '2026-04-12', montant: -45, libelle: 'X' }))

    state.importQueue = []
    state.importHashes = []
    traiterContenuBancaire(OFX_TEST, 'releve-test.ofx')
    eq('M194', 'Deux transactions du même jour, même montant, même commerçant sont TOUTES importées',
       2, fileImport().length)
    traiterContenuBancaire(OFX_TEST, 'releve-test.ofx')
    eq('M195', 'Réimporter le même relevé n\'ajoute aucun doublon', 2, fileImport().length)
    check('M196', 'Le FITID voyage avec la transaction dans la file d\'attente',
          'FITID présent', fileImport().map(t => t.fitid).join('/'),
          fileImport().every(t => !!t.fitid))

    // Après classement, le même relevé ne doit pas revenir.
    const idPremier = fileImport()[0].id
    ignorerTx(idPremier, false)
    traiterContenuBancaire(OFX_TEST, 'releve-test.ofx')
    eq('M197', 'Une transaction déjà classée ne réapparaît pas à la réimportation',
       1, fileImport().length)

    // Protection entre formats : le même relevé retéléchargé en CSV, sans
    // FITID, ne doit pas revenir. C'est à cela que sert l'enregistrement de
    // l'empreinte heuristique EN PLUS du FITID.
    state.importQueue = []
    state.importHashes = []
    traiterContenuBancaire(OFX_TEST, 'releve-test.ofx')
    fileImport().slice().forEach(t => ignorerTx(t.id, false))
    const CSV_MEME_RELEVE = `Date,Description,Montant
${FIX_YEAR}-04-12,QUINCAILLERIE TEST,-45.00`
    traiterContenuBancaire(CSV_MEME_RELEVE, 'releve-test.csv')
    eq('M197b', 'Le même relevé retéléchargé en CSV (sans FITID) ne réintroduit pas de doublon',
       0, fileImport().length)

    state.importQueue = []
    state.importHashes = []

    // ══ Q5. SAUVEGARDE DES RÈGLES D'IMPORT (§ E.8) ════════════════════════════
    // Les règles vivent dans `setup`, jamais synchronisé vers Firestore : la
    // sauvegarde JSON est donc le SEUL moyen de ne pas les perdre.
    setup.reglesImport = [{ motif: 'HYDRO QUEBEC', key: 'pA|deductibles|Électricité', usages: 7 }]
    const enveloppe = JSON.parse(JSON.stringify(backupPayload()))
    eq('M198', 'Les règles d\'import figurent dans l\'enveloppe de sauvegarde',
       'HYDRO QUEBEC', ((enveloppe.setup || {}).reglesImport || [{}])[0].motif)
    setup.reglesImport = []
    restoreFromBackup(enveloppe)
    eq('M199', 'Les règles d\'import survivent à un aller-retour export → restauration',
       'HYDRO QUEBEC', (setup.reglesImport[0] || {}).motif)
    eq('M200', 'Le compteur d\'usages de la règle est restauré lui aussi',
       7, (setup.reglesImport[0] || {}).usages)
    eq('M201', 'L\'enveloppe de sauvegarde est bien en version 3', 3, enveloppe.version)

    // ══ Q6. VERSION DE L'APPLICATION ══════════════════════════════════════════
    check('M202', 'APP_VERSION suit le format MAJEUR.MINEUR.CORRECTIF',
          'X.Y.Z', APP_VERSION, /^\d+\.\d+\.\d+$/.test(APP_VERSION))
    // `data-module-src` : le lanceur hors navigateur (tests/run-headless.js)
    // inline le code des modules et reporte le src d'origine dans cet attribut.
    // Le test vaut donc dans les deux environnements.
    const balises = Array.from(document.querySelectorAll('script[src^="js/"], script[data-module-src^="js/"]'))
    const srcDe = b => b.getAttribute('src') || b.getAttribute('data-module-src')
    const mauvaises = balises.filter(b => !srcDe(b).endsWith('?v=' + APP_VERSION))
    check('M203', 'Chaque module porte ?v=APP_VERSION (sans quoi le cache sert l\'ancien code)',
          balises.length + ' balises à jour',
          mauvaises.length ? mauvaises.map(srcDe).join(', ')
                           : balises.length + ' balises à jour',
          balises.length > 0 && mauvaises.length === 0)
    sansErreur('M204', 'renderVersion() remplit le bloc de version des réglages', () => {
      renderVersion()
      const el = document.getElementById('settings-version')
      if (!el || !el.textContent.includes(APP_VERSION)) throw new Error('version absente du bloc')
    })

    // ══ Q. RENDU DES PANNEAUX FISCAUX ═════════════════════════════════════════
    const panneaux = [
      ['Recommandations', renderRecommandations], ['Impôt', renderImpot],
      ['TPS/TVQ', renderTaxes], ['DPA', renderDPA], ['Baux', renderBaux],
      ['Reçus', renderAuditRecus], ['Import bancaire', renderImportBancaire],
      ['Simulateur', renderSimulateur], ['Simulateur de vente', renderVente],
      ['Évolution', renderTableauBord],
      ['Clôture', renderCloture], ['Dossier ZIP', renderDossier],
      ['Kilométrage', renderKilometrage], ['Ventilations', renderVentilations],
      ['Méthodes véhicule', renderComparaisonMethodes],
      ['Copropriétaires', renderCoproprietaires],
      ['Bandeau provision', renderBandeauProvision],
      ['Reco accueil', renderRecoAccueil], ['Rappel km', renderRappelKm]
    ]
    panneaux.forEach(([nom, fn], i) => {
      sansErreur('M' + (210 + i), `Rendu du panneau « ${nom} » sans exception`, fn)
    })

    // ══ R. ROBUSTESSE : ÉTAT VIERGE ═══════════════════════════════════════════
    const stateSauve = state
    state = defaultState()
    invalidateDPA()
    sansErreur('M250', 'État vierge : les modules fiscaux calculent sans lever', () => {
      assiettes(); calculImpot(); calculAcomptes(); calculTaxes()
      calculDPA(activeYear); coherenceKm(); comparerMethodesVehicule()
      etatParCoproprietaire(); auditRecus(); recommandations(); simuler(); calculVente()
    })
    sansErreur('M251', 'État vierge : les panneaux se rendent sans lever',
               () => panneaux.forEach(([, fn]) => fn()))
    state = stateSauve

  } catch (e) {
    erreurFatale = (e && e.message) ? e.message : String(e)
  } finally {
    // ── Restauration de l'état réel ───────────────────────────────────────────
    state = backup.state
    setup = backup.setup
    activeYear = backup.activeYear
    if (typeof invalidateDPA === 'function') invalidateDPA()
    // Toutes les années écrites par la suite, y compris quand elle s'interrompt.
    ANNEES_TEST.forEach(an => {
      try { localStorage.removeItem(STORE_PREFIX + an) } catch (e) {}
    })
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
