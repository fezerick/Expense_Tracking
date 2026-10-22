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
    // Les dates d'écriture par feuille (js/sync.js). Sans cette ligne, le
    // save() du bloc finally daterait le retour aux vraies données comme une
    // saisie faite à l'instant : cet appareil gagnerait ensuite toutes les
    // fusions, pour la seule raison qu'on a lancé les tests dessus.
    meta: JSON.parse(JSON.stringify(stateMeta)),
    // Même raison pour l'historique des modifications (js/journal.js) : les
    // save() de la fixture y inscrivent « Duplex A (test) », et le save() du
    // bloc finally y inscrirait le retour aux vraies données. L'historique de
    // l'utilisateur est donc remis tel quel à la fin.
    journal: typeof journalLire === 'function' ? journalLire(activeYear) : [],
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

  // ── Référence de parité pour le portage iOS (docs/PORTAGE_IOS.md § 7) ─────
  // Les valeurs sont relevées sur la fixture AU MOMENT où les assertions
  // ci-dessous les vérifient, puis écrites dans
  // ios_2026/Tests/Parity/parite-vague1.json par `npm run parite:export`.
  // La suite Swift les rejoue : elle ne compare donc pas le portage à des
  // nombres retapés à la main, mais à ce que la PWA produit vraiment.
  const PARITE = { annee: FIX_YEAR, aujourdhui: new Date().toISOString().slice(0, 10) }

  // JSON ne connaît pas Infinity : le dernier plafond d'un barème sort à `null`,
  // et le côté Swift le relit en `.infinity`.
  const sansInfini = p => p.map(([plafond, taux]) => [isFinite(plafond) ? plafond : null, taux])
  const paramsJSON = y => {
    const f = fiscal(y)
    return {
      verifie: f.verifie,
      km: { paliers: sansInfini(f.km.paliers), territoires: f.km.territoires },
      fed: { paliers: sansInfini(f.fed.paliers), bpa: f.fed.bpa, bpaMin: f.fed.bpaMin,
             bpaSeuilReduction: f.fed.bpaSeuilReduction, abattementQc: f.fed.abattementQc,
             tauxCreditBase: f.fed.tauxCreditBase },
      qc: { paliers: sansInfini(f.qc.paliers), bpa: f.qc.bpa, tauxCreditBase: f.qc.tauxCreditBase },
      rrq: f.rrq, rqap: f.rqap, fss: f.fss, auto: f.auto, taxes: f.taxes,
      acomptes: f.acomptes, tauxInclusionGainCapital: f.gainCapital.tauxInclusion,
      mutation: { paliers: sansInfini(f.mutation.paliers), seuilMunicipal: f.mutation.seuilMunicipal,
                  tauxMaxMunicipal: f.mutation.tauxMaxMunicipal,
                  creditPremierAcheteur: f.mutation.creditPremierAcheteur }
    }
  }
  // Les biens sortent avec des montants déjà convertis : `state` les garde en
  // chaînes, Swift les attend en Double. C'est `num()` qui fait la conversion
  // des deux côtés, donc la frontière est au même endroit.
  const bienJSON = b => ({
    id: b.id, propId: b.propId, categorie: String(b.categorie),
    dateAcquisition: b.dateAcquisition || '', cout: num(b.cout), coutTerrain: num(b.coutTerrain),
    lie: !!b.lie,
    fnaccOuverture: (b.fnaccOuverture === '' || b.fnaccOuverture == null) ? null : num(b.fnaccOuverture),
    dpa: Object.keys(b.dpa || {}).reduce((o, k) => { o[k] = num(b.dpa[k]); return o }, {}),
    dispositionDate: b.dispositionDate || '', dispositionProduit: num(b.dispositionProduit)
  })
  const poolJSON = p => ({
    cle: p.cle, categorie: p.categorie, locatif: p.locatif, libelle: p.libelle, nomProp: p.nomProp,
    ouverture: p.ouverture, reportee: p.reportee, ajouts: p.ajouts, ajoutsAII: p.ajoutsAII,
    ajoutsDemi: p.ajoutsDemi, dispositions: p.dispositions, reduction: p.reduction,
    base: p.base, taux: p.taux, dpaMax: p.dpaMax, reclamee: p.reclamee,
    fermeture: p.fermeture, distincte: p.distincte
  })
  const dpaJSON = (year, biensListe, calc) => ({
    year, biens: biensListe.map(bienJSON), plafondLocatif: calc.plafondLocatif,
    pools: calc.pools.map(poolJSON),
    total: calc.total, totalLocatif: calc.totalLocatif, maxLocatif: calc.maxLocatif
  })

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

    // Relevé de parité : barèmes, catégories, et les fonctions pures du socle.
    PARITE.params = { 2026: paramsJSON(2026), 2025: paramsJSON(2025) }
    PARITE.categoriesDPA = DPA_CATEGORIES.map(c => ({ code: c.code, taux: c.taux, batiment: !!c.batiment }))
    PARITE.num = ['1 234,56 $', '(123,45)', '1,234.56', '2,500', '', 'abc', '-42',
                  '12.3.4', '1 000', '0,5', '  48 ', '-1 234,50 $']
      .map(e => ({ entree: e, attendu: num(e) }))
    PARITE.csv = [['Tremblay, Marie', '100'], ['sans virgule', '2'], ['a"b', 'c;d'], ['x\ny', '']]
      .map(c => ({ cellules: c, attendu: csvLigne(c) }))
    PARITE.immeubles = setup.propsList.reduce((o, p) => { o[p.id] = p.label; return o }, {})

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
    PARITE.dpaHorsAII = dpaJSON(anneeApresAII, state.biens, dpa2028)
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
    PARITE.dpaCourant = dpaJSON(FIX_YEAR, state.biens, dpa)

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
    // Deux années : la source porte l'acquisition et la DPA réclamée, la suivante
    // n'a que le report. C'est le seul endroit du calcul où une année en lit une autre.
    PARITE.dpaReport = {
      annee: ANNEE_TEST_VOISINE + 1,
      biensAnneePrecedente: stPrec.biens.map(bienJSON),
      ...dpaJSON(ANNEE_TEST_VOISINE + 1, stSuiv.biens, dpaSuiv)
    }
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

    // Relevé de parité : les fonctions à barème de fiscal-data.js, sur des
    // valeurs choisies de part et d'autre de chaque seuil.
    PARITE.km = [0, 1000, 5000, 6000, 30000].map(k => {
      const i = kmIndemnite(k, FIX_YEAR)
      return { km: k, montant: i.montant, tauxMoyen: i.tauxMoyen, tranches: i.detail.length }
    })
    PARITE.paliers = [0, 30000, 58523, 60000, 120000, 300000].map(r => ({
      revenu: r,
      fed: impotParPaliers(r, fiscal(FIX_YEAR).fed.paliers),
      qc: impotParPaliers(r, fiscal(FIX_YEAR).qc.paliers)
    }))
    PARITE.fss = [0, 18500, 20000, 33500, 50000, 70000, 200000]
      .map(r => { const c = cotisationFSS(r, FIX_YEAR); return { revenu: r, montant: c.montant, palier: c.palier } })
    PARITE.rrq = [[0, 0], [10000, 0], [40000, 0], [40000, 60000], [90000, 0], [120000, 0]]
      .map(([ent, emploi]) => {
        const c = cotisationRRQ(ent, emploi, FIX_YEAR)
        return { entreprise: ent, emploi, base: c.base, supp: c.supp, total: c.total,
                 deductible: c.deductible, credit: c.credit }
      })
    PARITE.rqap = [0, 10000, 120000].map(r => {
      const c = cotisationRQAP(r, FIX_YEAR)
      return { revenu: r, montant: c.montant, assiette: c.assiette }
    })
    PARITE.bpaFed = [0, 100000, 181440, 220000, 258482, 400000]
      .map(r => ({ revenuNet: r, bpa: bpaFederal(r, FIX_YEAR) }))

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

    // Relevé de parité : les entrées agrégées que TaxService.swift reçoit, et
    // tout ce que le calcul en tire. Les acomptes sortent avec la date du jour,
    // que le côté Swift réinjecte — sans quoi la référence changerait de sens
    // chaque fois que le 15 mars passe.
    const usageDPA = dpaReclameeParUsage()
    const saisieImpot = donneesImpot()
    PARITE.impot = {
      entrees: {
        moduleProps: !!setup.modules.props, moduleRideshare: !!setup.modules.rideshare,
        revenuLocatif: activeProps().reduce((s, p) => s + propTotals(p.id).rev, 0),
        depensesLocatives: activeProps().reduce((s, p) => s + propTotals(p.id).dep, 0),
        uberNet: uberNetIncome(), lyftNet: lyftNetIncome(),
        depensesVehicule: VEH_CATS.reduce((s, c) => s + num(state.vehicule.depenses[c]), 0),
        kmTotalAnnuel: num(state.settings.kmTotalAnnuel),
        kmUber: num(state.uber.km_online), kmLyft: getLyftKmTotal(),
        dpaLocative: usageDPA.locatif, dpaEntreprise: usageDPA.entreprise,
        revenuT4: num(saisieImpot.revenuT4), autresRevenus: num(saisieImpot.autresRevenus),
        autresDeductions: num(saisieImpot.autresDeductions), gainsRRQCotises: num(saisieImpot.gainsRRQCotises),
        impotRetenuFed: num(saisieImpot.impotRetenuFed), impotRetenuQc: num(saisieImpot.impotRetenuQc),
        acomptesFed: saisieImpot.acomptesFed.map(num), acomptesQc: saisieImpot.acomptesQc.map(num)
      },
      assiettes: {
        revLoc: a.revLoc, depLoc: a.depLoc, netLocAvantDPA: a.netLocAvantDPA, netLoc: a.netLoc,
        dpaLoc: a.dpaLoc, revEnt: a.revEnt, depEnt: a.depEnt, netEnt: a.netEnt, dpaEnt: a.dpaEnt,
        vehUber: a.veh.uber, vehLyft: a.veh.lyft, vehTotal: a.veh.total,
        t4: a.t4, autres: a.autres, rrqTotal: a.rrq.total, rrqDeductible: a.rrq.deductible,
        rrqCredit: a.rrq.credit, rqap: a.rqap.montant, fss: a.fss.montant,
        deductionsCotisations: a.deductionsCotisations, revenuTotal: a.revenuTotal,
        revenuNet: a.revenuNet
      },
      calcul: {
        fedBrut: ci.fedBrut.impot, fedMarginal: ci.fedBrut.marginal, bpaFed: ci.bpaFed,
        creditsFed: ci.creditsFed, fedApresCredits: ci.fedApresCredits,
        abattement: ci.abattement, fedNet: ci.fedNet,
        qcBrut: ci.qcBrut.impot, qcMarginal: ci.qcBrut.marginal, creditsQc: ci.creditsQc,
        qcNet: ci.qcNet, cotisations: ci.cotisations, retenues: ci.retenues,
        acomptesVerses: ci.acomptesVerses, totalAvantRetenues: ci.totalAvantRetenues,
        solde: ci.solde, marginal: ci.marginal, provision: ci.provision,
        tauxEffectif: ci.tauxEffectif
      },
      acomptes: {
        requisFed: ac.requisFed, requisQc: ac.requisQc, netFed: ac.netFed, netQc: ac.netQc,
        seuil: ac.seuil, manqueTotal: ac.manqueTotal, joursAvantProchain: ac.joursAvantProchain,
        versements: ac.versements.map(v => ({
          date: v.date, echue: v.echue, fed: v.fed, qc: v.qc,
          manqueFed: v.manqueFed, manqueQc: v.manqueQc, jours: v.jours, enRetard: v.enRetard
        }))
      },
      tauxMarginalEstime: tauxMarginalEstime()
    }

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

    // ══ S. FUSION ENTRE APPAREILS (sync.js) ═══════════════════════════════════
    // Ce que ces tests protègent : une soirée de saisie sur le téléphone ne doit
    // pas disparaître parce qu'un autre appareil, resté ouvert sur des données
    // plus vieilles, a renvoyé sa version. Chaque cas ci-dessous correspond à
    // une façon d'effacer du travail par mégarde.
    const P = (...s) => s.join('\u001f')
    const meta0 = (st, ts) => syncDater(null, {}, st, ts).meta
    const copie = o => JSON.parse(JSON.stringify(o))

    // Aplatissement : la forme des tableaux décide de tout le reste.
    eq('M260', 'Les 12 mois d\'une catégorie sont indexés par position',
       { [P('p1090','revenus','Coloc','0')]: '100', [P('p1090','revenus','Coloc','1')]: '' },
       syncAplatir({ p1090: { revenus: { Coloc: ['100',''] } } }))
    eq('M261', 'Les trajets sont indexés par id, pas par position',
       { [P('trips','a1','id')]: 'a1', [P('trips','a1','km')]: 12 },
       syncAplatir({ trips: [{ id: 'a1', km: 12 }] }))
    eq('M262', 'Les empreintes d\'import sont un ensemble',
       { [P('importHashes','h1')]: true, [P('importHashes','h2')]: true },
       syncAplatir({ importHashes: ['h1','h2'] }))
    eq('M263', 'Les photos de reçus ne passent pas par la fusion',
       {}, syncAplatir({ receipts: { r1: 'data:image/jpeg;base64,AAA' } }))
    eq('M264', 'Un tableau sans clé stable reste une seule feuille',
       { closedHistory: [{ at: 'x' }] }, syncAplatir({ closedHistory: [{ at: 'x' }] }))

    // Deux appareils, deux champs différents du même mois Lyft.
    const sBase = { lyft: { 6: { taxable: '500' } } }
    const sA = copie(sBase); sA.lyft[6].tips = '13'
    const mA = syncDater(meta0(sBase, 1000), sBase, sA, 2000).meta
    const sB = copie(sBase); sB.lyft[6].fees = '88'
    const mB = syncDater(meta0(sBase, 1000), sBase, sB, 2500).meta
    const fAB = syncFusionner({ state: sA, meta: mA }, { state: sB, meta: mB })
    eq('M265', 'Deux champs saisis sur deux appareils cohabitent',
       { taxable: '500', tips: '13', fees: '88' }, fAB.state.lyft[6])
    eq('M266', 'Champs différents : aucun conflit', 0, fAB.conflits.length)
    eq('M267', 'Refusionner ne change plus rien (idempotence)', fAB.state,
       syncFusionner({ state: fAB.state, meta: fAB.meta }, { state: sB, meta: mB }).state)

    // Même champ des deux côtés : la date tranche, dans les deux sens.
    const sC = { uber: { rides_gross: '100' } }, sD = { uber: { rides_gross: '200' } }
    const mC = meta0(sC, 1000), mD = meta0(sD, 3000)
    eq('M268', 'La valeur la plus récente gagne (reçue du distant)',
       '200', syncFusionner({ state: sC, meta: mC }, { state: sD, meta: mD }).state.uber.rides_gross)
    eq('M269', 'La valeur la plus récente gagne (gardée en local)',
       '200', syncFusionner({ state: sD, meta: mD }, { state: sC, meta: mC }).state.uber.rides_gross)
    eq('M270', 'Une valeur écartée est signalée comme conflit',
       1, syncFusionner({ state: sC, meta: mC }, { state: sD, meta: mD }).conflits.length)

    // Données écrites avant la 2.5.0 : aucune date, donc union — et pour la case
    // que les deux côtés portent avec des valeurs différentes, un départage qui
    // ne regarde que les valeurs. « Garder le local » tomberait pourtant sous le
    // sens : c'est ce que faisait la première version, et à deux appareils elle
    // ne convergeait jamais — chacun gardait le sien et le renvoyait à l'autre
    // toutes les deux secondes et demie, indéfiniment.
    const sE = { uber: { rides_gross: '100', tolls: '5' } }
    const sG = { uber: { rides_gross: '200', tips_rides: '9' } }
    const fUnion = syncFusionner({ state: sE, meta: null }, { state: sG, meta: null })
    eq('M271', 'Sans dates, la fusion est une union : rien ne disparaît',
       { rides_gross: '200', tolls: '5', tips_rides: '9' }, fUnion.state.uber)
    eq('M272', 'Sans dates, le désaccord est signalé', 1, fUnion.conflits.length)
    // LE point : le même résultat vu des deux appareils.
    const fUnionInverse = syncFusionner({ state: sG, meta: null }, { state: sE, meta: null })
    eq('M272a', 'Un départage d\'égalité donne le même état sur les deux appareils',
       syncEmpreinteEtat(fUnion.state), syncEmpreinteEtat(fUnionInverse.state))
    eq('M272b', 'Et chacun signale le désaccord de son côté', 1, fUnionInverse.conflits.length)
    // Le va-et-vient sans fin se jouait ici : chaque appareil comparait le
    // résultat de sa fusion au document reçu, le trouvait différent et
    // renvoyait le sien. Une fois l'union publiée, plus personne n'a de raison
    // de renvoyer quoi que ce soit — c'est le point fixe.
    const docUnion = { state: fUnion.state, meta: fUnion.meta }
    const revuA = syncFusionner({ state: fUnion.state, meta: fUnion.meta }, docUnion)
    const revuB = syncFusionner({ state: fUnionInverse.state, meta: fUnionInverse.meta }, docUnion)
    check('M272c', 'Une fois l\'union publiée, aucun appareil ne la renvoie',
          'les deux renvois à false',
          [syncDoitRenvoyer(revuA, docUnion), syncDoitRenvoyer(revuB, docUnion)].join(','),
          !syncDoitRenvoyer(revuA, docUnion) && !syncDoitRenvoyer(revuB, docUnion))
    eq('M272d', 'À égalité, une vraie valeur bat une case vide, dans les deux sens',
       ['450', '450'],
       [syncFusionner({ state: { uber: { rides_gross: '' } }, meta: meta0({ uber: { rides_gross: 'x' } }, 7000) },
                      { state: { uber: { rides_gross: '450' } }, meta: meta0({ uber: { rides_gross: '450' } }, 7000) }).state.uber.rides_gross,
        syncFusionner({ state: { uber: { rides_gross: '450' } }, meta: meta0({ uber: { rides_gross: '450' } }, 7000) },
                      { state: { uber: { rides_gross: '' } }, meta: meta0({ uber: { rides_gross: 'x' } }, 7000) }).state.uber.rides_gross])

    // Règle d'effacement : une case vide jamais remplie ne vaut pas une valeur.
    const sVide = { uber: { rides_gross: '' } }, sPlein = { uber: { rides_gross: '450' } }
    eq('M273', 'Une case vide non datée n\'écrase pas une vraie valeur',
       '450', syncFusionner({ state: sVide, meta: null }, { state: sPlein, meta: null }).state.uber.rides_gross)
    const dVideCase = syncDater(meta0(sPlein, 1000), sPlein, sVide, 5000)
    const mVide = dVideCase.meta
    eq('M274', 'Une case vidée volontairement, elle, se défend',
       '', syncFusionner({ state: sVide, meta: mVide },
                         { state: sPlein, meta: meta0(sPlein, 1000) }).state.uber.rides_gross)

    // Suppressions : ni résurrection, ni coquille vide.
    const sT1 = { trips: [{ id: 't1', km: 10 }, { id: 't2', km: 20 }] }
    const mT1 = meta0(sT1, 1000)
    const sT2 = { trips: [{ id: 't1', km: 10 }] }
    const dT2 = syncDater(copie(mT1), sT1, sT2, 4000)
    const mT2 = dT2.meta
    eq('M275', 'Un trajet supprimé n\'est pas ressuscité par l\'autre appareil',
       ['t1'], syncFusionner({ state: sT2, meta: mT2 }, { state: sT1, meta: mT1 }).state.trips.map(t => t.id))
    eq('M276', 'La suppression se propage à l\'appareil qui l\'ignorait',
       ['t1'], syncFusionner({ state: sT1, meta: mT1 }, { state: sT2, meta: mT2 }).state.trips.map(t => t.id))
    const sT3 = copie(sT2); sT3.trips.push({ id: 't9', km: 90 })
    const mT3 = syncDater(copie(mT2), sT2, sT3, 6000).meta
    eq('M277', 'Un trajet ajouté ailleurs arrive',
       ['t1','t9'], syncFusionner({ state: sT2, meta: mT2 }, { state: sT3, meta: mT3 }).state.trips.map(t => t.id))

    // Ensembles, mois, catégorie entière.
    const sS1 = { importHashes: ['a','b'] }, sS2 = { importHashes: ['b','c'] }
    eq('M278', 'Deux imports bancaires cumulent leurs empreintes', ['a','b','c'],
       syncFusionner({ state: sS1, meta: meta0(sS1, 1000) },
                     { state: sS2, meta: meta0(sS2, 2000) }).state.importHashes.slice().sort())
    const sM1 = { p1090: { revenus: { Coloc: ['100','','',''] } } }
    const mM1 = meta0(sM1, 1000)
    const sM2 = copie(sM1); sM2.p1090.revenus.Coloc[1] = '250'
    const mM2 = syncDater(copie(mM1), sM1, sM2, 3000).meta
    const sM3 = copie(sM1); sM3.p1090.revenus.Coloc[3] = '400'
    const mM3 = syncDater(copie(mM1), sM1, sM3, 3500).meta
    eq('M279', 'Deux mois saisis sur deux appareils cohabitent', ['100','250','','400'],
       syncFusionner({ state: sM3, meta: mM3 }, { state: sM2, meta: mM2 }).state.p1090.revenus.Coloc)
    const sN1 = { p470: { revenus: {} } }
    const sN2 = { p470: { revenus: { 'Loyer 470': ['900','900'] } } }
    eq('M280', 'Une catégorie entière créée ailleurs arrive', { 'Loyer 470': ['900','900'] },
       syncFusionner({ state: sN1, meta: meta0(sN1, 1000) },
                     { state: sN2, meta: meta0(sN2, 2000) }).state.p470.revenus)

    // L'empreinte : c'est elle qui empêche l'aller-retour sans fin.
    eq('M281', 'Deux états identiques écrits dans un ordre différent ont la même empreinte',
       syncEmpreinteEtat({ uber: { a: '1', b: '2' } }), syncEmpreinteEtat({ uber: { b: '2', a: '1' } }))
    eq('M282', 'Rien à renvoyer quand le cloud porte déjà le résultat', false,
       syncDoitRenvoyer({ state: { uber: { b: '2', a: '1' } }, meta: meta0({ uber: { a: '1' } }, 10) },
                        { state: { uber: { a: '1', b: '2' } }, meta: meta0({ uber: { a: '1' } }, 10) }))
    eq('M283', 'À renvoyer quand on détient une valeur que le cloud ignore', true,
       syncDoitRenvoyer({ state: { uber: { a: '1', b: '2' } }, meta: null },
                        { state: { uber: { a: '1' } }, meta: null }))

    // Le branchement dans l'application : save() date, et seulement ce qui change.
    const cheminTest = P('uber', 'rides_gross')
    state.uber.rides_gross = '777'
    save()
    check('M284', 'save() date la valeur qui vient de changer', '> 0',
          stateMeta.feuilles[cheminTest] || 0, (stateMeta.feuilles[cheminTest] || 0) > 0)
    const dateAvant = stateMeta.feuilles[cheminTest]
    save()
    eq('M285', 'Une sauvegarde sans changement ne redate rien', dateAvant, stateMeta.feuilles[cheminTest])
    delete state.uber.rides_gross
    save()
    check('M286', 'Une valeur effacée laisse une pierre tombale datée', '> 0',
          syncDateSuppression(stateMeta, cheminTest), syncDateSuppression(stateMeta, cheminTest) > 0)
    eq('M287', 'Les reçus sont retirés de ce qui part vers le cloud',
       undefined, stateForSync(state).receipts)
    eq('M288', 'Le thème reste local : il ne part pas vers le cloud',
       undefined, setupPourSync({ theme: 'dark', done: true }).theme)
    eq('M289', 'Le reste de la configuration, lui, est synchronisé',
       true, setupPourSync({ theme: 'dark', done: true }).done)

    // Les photos de reçus : l'index voyage, l'image non.
    eq('M290', 'L\'index des reçus, lui, fait partie de ce qui se synchronise',
       { [P('recusIndex','p1090:deductibles:Taxes:3')]: 1700000000000 },
       syncAplatir({ recusIndex: { 'p1090:deductibles:Taxes:3': 1700000000000 } }))
    const sIdx = { recusIndex: { r1: 111, r2: 222 } }
    const mIdx = syncDater(null, {}, sIdx, 1000).meta
    const sIdx2 = { recusIndex: { r1: 111 } }
    const dIdx2 = syncDater(copie(mIdx), sIdx, sIdx2, 4000)
    const mIdx2 = dIdx2.meta
    check('M291', 'Supprimer un reçu laisse une tombale sur sa ligne d\'index', '> 0',
          syncDateSuppression(mIdx2, P('recusIndex','r2')),
          syncDateSuppression(mIdx2, P('recusIndex','r2')) > 0)
    eq('M292', 'La suppression d\'un reçu se propage sans ressusciter', { r1: 111 },
       syncFusionner({ state: sIdx2, meta: mIdx2 }, { state: sIdx, meta: mIdx }).state.recusIndex)
    eq('M293', 'Une clé de reçu avec une barre oblique reste un identifiant valide',
       -1, recusDocId(2026, 'p1090:deductibles:Eau / Égouts:3').indexOf('/'))

    // Le piège attrapé par l'essai en navigateur : une catégorie vide (`uber:
    // {}`) est une feuille, et sa première valeur saisie la transforme en
    // conteneur. Traiter cette transformation comme une suppression posait une
    // tombale sur « uber » et vidait la catégorie sur l'autre appareil.
    const sVide0 = { uber: {} }
    const sPremier = { uber: { rides_gross: '100' } }
    const sPremier2 = { uber: { rides_gross: '5000' } }
    const dPremier = syncDater(meta0(sVide0, 1000), sVide0, sPremier, 2000)
    eq('M294', 'La première valeur d\'une catégorie est datée', 2000,
       dPremier.meta.feuilles[P('uber','rides_gross')])
    eq('M295', 'Remplir une catégorie vide ne pose aucune tombale', 0,
       syncDateSuppression(dPremier.meta, P('uber','rides_gross')))
    eq('M296', 'Et la valeur arrive bien sur l\'appareil resté sur la catégorie vide',
       { rides_gross: '100' },
       syncFusionner({ state: sVide0, meta: meta0(sVide0, 1000) },
                     { state: sPremier, meta: dPremier.meta }).state.uber)
    // Le symétrique, attrapé lui aussi en navigateur : l'appareil qui n'a jamais
    // touché la catégorie envoie `uber: {}`. Cette coquille ne doit pas écraser
    // la catégorie remplie d'en face — c'était la perte d'une soirée de saisie.
    eq('M298', 'Une catégorie vide reçue n\'écrase pas la catégorie remplie d\'ici',
       { rides_gross: '5000' },
       syncFusionner({ state: sPremier2, meta: meta0(sPremier2, 2000) },
                     { state: sVide0, meta: null }).state.uber)
    eq('M299', 'Et après l\'échange, les deux appareils portent la même empreinte',
       syncEmpreinteEtat(syncFusionner({ state: sPremier2, meta: meta0(sPremier2, 2000) },
                                       { state: sVide0, meta: null }).state),
       syncEmpreinteEtat(syncFusionner({ state: sVide0, meta: null },
                                       { state: sPremier2, meta: meta0(sPremier2, 2000) }).state))

    // Le cas inverse reste une vraie suppression.
    const dRetire = syncDater(copie(dPremier.meta), sPremier, sVide0, 3000)
    check('M297', 'Vider une catégorie, en revanche, pose bien une tombale', '> 0',
          syncDateSuppression(dRetire.meta, P('uber','rides_gross')),
          syncDateSuppression(dRetire.meta, P('uber','rides_gross')) > 0)

    // Le piège le plus coûteux des douze cases : saisir avril dans une nouvelle
    // catégorie crée les onze autres cases vides d'un coup. Si ces vides se
    // datent, ils sont plus récents que les loyers de janvier à mars déjà saisis
    // sur le téléphone, et la fusion les efface. Ils restent donc sans date.
    const an = (...v) => { const t = ['','','','','','','','','','','','']; v.forEach(([i, x]) => t[i] = x); return t }
    const sTel = { p1090: { revenus: { 'Coloc 1': an([0,'700'],[1,'700'],[2,'700']) } } }
    const sPort = { p1090: { revenus: { 'Coloc 1': an([3,'850']) } } }
    const dPort = syncDater(syncMetaVide(), {}, sPort, 2000)
    const cell = i => P('p1090','revenus','Coloc 1', String(i))
    eq('M300', 'Une case créée vide n\'est pas datée', undefined,
       dPort.meta.feuilles[cell(0)])
    eq('M301', 'La case réellement saisie, elle, est datée', 2000,
       dPort.meta.feuilles[cell(3)])
    const vuTel = syncFusionner({ state: sTel, meta: meta0(sTel, 1000) },
                                { state: sPort, meta: dPort.meta })
    eq('M302', 'Les trois premiers loyers survivent à la saisie faite ailleurs',
       ['700','700','700','850'], vuTel.state.p1090.revenus['Coloc 1'].slice(0, 4))
    const vuPort = syncFusionner({ state: sPort, meta: dPort.meta },
                                 { state: sTel, meta: meta0(sTel, 1000) })
    eq('M303', 'Et les deux appareils convergent sur les douze mêmes cases',
       syncEmpreinteEtat(vuTel.state), syncEmpreinteEtat(vuPort.state))
    // Vider une case qui PORTAIT un montant reste une écriture qui se défend.
    const sTelEfface = { p1090: { revenus: { 'Coloc 1': an([1,'700'],[2,'700']) } } }
    const dVide = syncDater(copie(meta0(sTel, 1000)), sTel, sTelEfface, 4000)
    eq('M304', 'Effacer un loyer saisi se date, et gagne contre l\'ancienne valeur', '',
       syncFusionner({ state: sTel, meta: meta0(sTel, 1000) },
                     { state: sTelEfface, meta: dVide.meta })
         .state.p1090.revenus['Coloc 1'][0])

    // ── Référence de parité, vague 1 bis : sync.js → SyncService.swift ───────
    // Les valeurs attendues côté Swift ne sont PAS retapées : on relève ici ce
    // que la PWA vient de produire sur les mêmes entrées que les assertions
    // ci-dessus, et `npm run parite` rejoue le tout en Swift. Chaque scénario
    // porte donc à la fois ses entrées et son résultat mesuré.
    // Voir docs/PORTAGE_IOS.md § 7.
    const docJSON = (st, meta) => ({ state: copie(st), meta: meta ? copie(meta) : null })
    // La fusion est une fonction pure : la rejouer sur les mêmes entrées rend
    // exactement ce que les assertions ci-dessus ont vérifié.
    const fusionJSON = (nom, local, distant) => {
      const f = syncFusionner(local, distant)
      return {
        nom,
        local: docJSON(local.state, local.meta),
        distant: docJSON(distant.state, distant.meta),
        attendu: {
          empreinte: syncEmpreinteEtat(f.state),
          etat: copie(f.state),
          meta: copie(f.meta),
          conflits: copie(f.conflits),
          stats: copie(f.stats),
          changements: copie(f.changements),
          resume: syncResume(f.stats),
          doitRenvoyer: syncDoitRenvoyer(f, distant)
        }
      }
    }
    const datageJSON = (nom, meta, avant, apres, ts, d) => ({
      nom, meta: meta ? copie(meta) : null, avant: copie(avant), apres: copie(apres), ts,
      attendu: { meta: copie(d.meta), modifiees: d.modifiees, supprimees: d.supprimees,
                 changements: copie(d.changements) }
    })
    const mT1p = meta0(sT1, 1000), mS1p = meta0(sS1, 1000), mS2p = meta0(sS2, 2000)
    const mN1p = meta0(sN1, 1000), mN2p = meta0(sN2, 2000), mPlein = meta0(sPlein, 1000)
    const mVide0 = meta0(sVide0, 1000), mPremier2 = meta0(sPremier2, 2000)
    const mTel = meta0(sTel, 1000)
    const sAcc = { pA: { deductibles: { 'Électricité': an([2,'142.30']) } } }
    const mEgalVide = meta0({ uber: { rides_gross: 'x' } }, 7000)
    const mEgalPlein = meta0({ uber: { rides_gross: '450' } }, 7000)

    PARITE.sync = {
      separateur: SYNC_SEP,
      ensembles: SYNC_SETS.slice(),
      ignores: SYNC_SKIP.slice(),

      // M260 à M264, M290 : la forme des tableaux décide de tout le reste.
      aplatir: [
        { nom: 'mois indexés par position', entree: copie({ p1090: { revenus: { Coloc: ['100',''] } } }),
          attendu: syncAplatir({ p1090: { revenus: { Coloc: ['100',''] } } }) },
        { nom: 'trajets indexés par id', entree: copie({ trips: [{ id: 'a1', km: 12 }] }),
          attendu: syncAplatir({ trips: [{ id: 'a1', km: 12 }] }) },
        { nom: 'empreintes d\'import en ensemble', entree: copie({ importHashes: ['h1','h2'] }),
          attendu: syncAplatir({ importHashes: ['h1','h2'] }) },
        { nom: 'photos de reçus hors fusion', entree: copie({ receipts: { r1: 'data:image/jpeg;base64,AAA' } }),
          attendu: syncAplatir({ receipts: { r1: 'data:image/jpeg;base64,AAA' } }) },
        { nom: 'tableau sans clé stable : une feuille', entree: copie({ closedHistory: [{ at: 'x' }] }),
          attendu: syncAplatir({ closedHistory: [{ at: 'x' }] }) },
        { nom: 'index des reçus', entree: copie({ recusIndex: { 'p1090:deductibles:Taxes:3': 1700000000000 } }),
          attendu: syncAplatir({ recusIndex: { 'p1090:deductibles:Taxes:3': 1700000000000 } }) },
        { nom: 'catégorie vide : une feuille', entree: copie(sVide0), attendu: syncAplatir(sVide0) },
        { nom: 'les douze cases du téléphone', entree: copie(sTel), attendu: syncAplatir(sTel) }
      ],

      // Le datage : c'est lui qui donne sa date à chaque feuille.
      datages: [
        datageJSON('première valeur d\'une catégorie', mVide0, sVide0, sPremier, 2000, dPremier),
        datageJSON('vider une catégorie', copie(dPremier.meta), sPremier, sVide0, 3000, dRetire),
        datageJSON('onze cases créées vides ne sont pas datées', syncMetaVide(), {}, sPort, 2000, dPort),
        datageJSON('effacer un loyer saisi', copie(mTel), sTel, sTelEfface, 4000, dVide),
        datageJSON('vider une case qui portait un montant', mPlein, sPlein, sVide, 5000, dVideCase),
        datageJSON('supprimer un trajet', copie(mT1p), sT1, sT2, 4000, dT2),
        datageJSON('supprimer une ligne d\'index de reçus', copie(mIdx), sIdx, sIdx2, 4000, dIdx2)
      ],

      // Les fusions, dans les deux sens quand le sens compte.
      fusions: [
        fusionJSON('deux champs du même mois Lyft', { state: sA, meta: mA }, { state: sB, meta: mB }),
        fusionJSON('refusionner ne change plus rien', { state: fAB.state, meta: fAB.meta }, { state: sB, meta: mB }),
        fusionJSON('la plus récente gagne, reçue', { state: sC, meta: mC }, { state: sD, meta: mD }),
        fusionJSON('la plus récente gagne, gardée', { state: sD, meta: mD }, { state: sC, meta: mC }),
        fusionJSON('sans dates, union', { state: sE, meta: null }, { state: sG, meta: null }),
        fusionJSON('sans dates, union, vue de l\'autre appareil', { state: sG, meta: null }, { state: sE, meta: null }),
        fusionJSON('point fixe après publication de l\'union', { state: fUnion.state, meta: fUnion.meta }, docUnion),
        fusionJSON('point fixe, vu de l\'autre appareil', { state: fUnionInverse.state, meta: fUnionInverse.meta }, docUnion),
        fusionJSON('à égalité, une valeur bat une case vide',
                   { state: { uber: { rides_gross: '' } }, meta: mEgalVide },
                   { state: { uber: { rides_gross: '450' } }, meta: mEgalPlein }),
        fusionJSON('à égalité, et dans l\'autre sens',
                   { state: { uber: { rides_gross: '450' } }, meta: mEgalPlein },
                   { state: { uber: { rides_gross: '' } }, meta: mEgalVide }),
        fusionJSON('une case vide non datée n\'écrase pas', { state: sVide, meta: null }, { state: sPlein, meta: null }),
        fusionJSON('une case vidée volontairement se défend', { state: sVide, meta: mVide }, { state: sPlein, meta: mPlein }),
        fusionJSON('un trajet supprimé n\'est pas ressuscité', { state: sT2, meta: mT2 }, { state: sT1, meta: mT1 }),
        fusionJSON('la suppression se propage', { state: sT1, meta: mT1 }, { state: sT2, meta: mT2 }),
        fusionJSON('un trajet ajouté ailleurs arrive', { state: sT2, meta: mT2 }, { state: sT3, meta: mT3 }),
        fusionJSON('deux imports cumulent leurs empreintes', { state: sS1, meta: mS1p }, { state: sS2, meta: mS2p }),
        fusionJSON('deux mois saisis sur deux appareils', { state: sM3, meta: mM3 }, { state: sM2, meta: mM2 }),
        fusionJSON('une catégorie entière créée ailleurs', { state: sN1, meta: mN1p }, { state: sN2, meta: mN2p }),
        fusionJSON('un reçu supprimé ne revient pas', { state: sIdx2, meta: mIdx2 }, { state: sIdx, meta: mIdx }),
        fusionJSON('la première valeur arrive sur la catégorie vide', { state: sVide0, meta: mVide0 },
                   { state: sPremier, meta: dPremier.meta }),
        fusionJSON('une coquille vide reçue n\'écrase pas', { state: sPremier2, meta: mPremier2 }, { state: sVide0, meta: null }),
        fusionJSON('et dans l\'autre sens', { state: sVide0, meta: null }, { state: sPremier2, meta: mPremier2 }),
        fusionJSON('douze cases, vu du téléphone', { state: sTel, meta: mTel }, { state: sPort, meta: dPort.meta }),
        fusionJSON('douze cases, vu du portable', { state: sPort, meta: dPort.meta }, { state: sTel, meta: mTel }),
        fusionJSON('effacer un loyer gagne contre l\'ancienne valeur', { state: sTel, meta: mTel },
                   { state: sTelEfface, meta: dVide.meta })
        // Trois autres fusions s'ajoutent à cette liste à la fin de la section J :
        // leurs états servent d'abord à vérifier ce que la fusion journalise.
      ],

      // M281 à M283 : l'empreinte, qui empêche l'aller-retour sans fin.
      empreintes: [
        { nom: 'ordre des clés indifférent', entree: copie({ uber: { a: '1', b: '2' } }),
          attendu: syncEmpreinteEtat({ uber: { a: '1', b: '2' } }) },
        { nom: 'ordre inverse, même empreinte', entree: copie({ uber: { b: '2', a: '1' } }),
          attendu: syncEmpreinteEtat({ uber: { b: '2', a: '1' } }) },
        { nom: 'douze cases', entree: copie(sTel), attendu: syncEmpreinteEtat(sTel) },
        { nom: 'catégorie accentuée', entree: copie(sAcc), attendu: syncEmpreinteEtat(sAcc) }
      ],
      renvois: [
        { nom: 'le cloud porte déjà le résultat',
          fusion: docJSON({ uber: { b: '2', a: '1' } }, meta0({ uber: { a: '1' } }, 10)),
          distant: docJSON({ uber: { a: '1', b: '2' } }, meta0({ uber: { a: '1' } }, 10)),
          attendu: syncDoitRenvoyer({ state: { uber: { b: '2', a: '1' } }, meta: meta0({ uber: { a: '1' } }, 10) },
                                    { state: { uber: { a: '1', b: '2' } }, meta: meta0({ uber: { a: '1' } }, 10) }) },
        { nom: 'on détient une valeur que le cloud ignore',
          fusion: docJSON({ uber: { a: '1', b: '2' } }, null),
          distant: docJSON({ uber: { a: '1' } }, null),
          attendu: syncDoitRenvoyer({ state: { uber: { a: '1', b: '2' } }, meta: null },
                                    { state: { uber: { a: '1' } }, meta: null }) }
      ],

      // M286, M291, M295, M297 : lire une date, et la tombale qui la couvre.
      dates: [
        { nom: 'tombale sur une ligne d\'index', meta: copie(mIdx2), chemin: P('recusIndex','r2'),
          attenduEcriture: syncDateDe(mIdx2, P('recusIndex','r2')),
          attenduSuppression: syncDateSuppression(mIdx2, P('recusIndex','r2')) },
        { nom: 'remplir une catégorie vide ne pose rien', meta: copie(dPremier.meta), chemin: P('uber','rides_gross'),
          attenduEcriture: syncDateDe(dPremier.meta, P('uber','rides_gross')),
          attenduSuppression: syncDateSuppression(dPremier.meta, P('uber','rides_gross')) },
        { nom: 'vider une catégorie, en revanche, oui', meta: copie(dRetire.meta), chemin: P('uber','rides_gross'),
          attenduEcriture: syncDateDe(dRetire.meta, P('uber','rides_gross')),
          attenduSuppression: syncDateSuppression(dRetire.meta, P('uber','rides_gross')) },
        { nom: 'une tombale de trajet couvre ses champs', meta: copie(mT2), chemin: P('trips','t2','km'),
          attenduEcriture: syncDateDe(mT2, P('trips','t2','km')),
          attenduSuppression: syncDateSuppression(mT2, P('trips','t2','km')) }
      ],

      // Le départage d'une égalité : la règle qui doit trancher PAREIL des deux
      // côtés, sinon les deux appareils ne convergent pas.
      egalites: [['', '450'], ['450', ''], ['100', '200'], ['200', '100'],
                 ['Électricité', 'Eau'], ['Eau', 'Électricité'], ['', '']]
        .map(([a, b]) => ({ local: a, distant: b, attendu: syncTrancherEgalite(a, b) })),

      cheminsTexte: [P('p1090','revenus','Coloc 1','3'), P('uber','rides_gross')]
        .map(ch => ({ chemin: ch, attendu: syncPathTexte(ch) })),

      // L'empreinte trie les chemins avec `Array.prototype.sort()`, c'est-à-dire
      // par unités de code UTF-16. Les deux dernières listes sont volontairement
      // tordues : c'est le seul cas où ce tri diffère d'un tri par caractères
      // (Swift), et c'est précisément ce qu'il faut figer — deux appareils qui
      // trient différemment calculent deux empreintes différentes du MÊME état,
      // et se renvoient leurs documents sans fin.
      tris: [['Électricité', 'Eau', 'Zinc', 'école', 'assurance', 'Taxes', 'à payer'],
             ['10', '9', '2', '100', '1'],
             [P('uber','tolls'), P('uber','rides_gross'), P('p1090','revenus','Coloc 1','10'),
              P('p1090','revenus','Coloc 1','2')],
             ['\u{1F3E0} Toiture', '\uf8ff Logiciel', 'Loyer'],
             ['\u{1F600}', '\ufffd', 'a']]
        .map(l => ({ entree: l.slice(), attendu: l.slice().sort() }))
    }

    // ══ J. HISTORIQUE DES MODIFICATIONS (js/journal.js) ══════════════════════
    // Le journal ne recalcule rien : il habille ce que syncDater() et
    // syncFusionner() savaient déjà. Ce qui se vérifie ici, c'est donc la
    // fidélité (ce qui est inscrit a vraiment eu lieu) et la lisibilité (une
    // hésitation sur un montant ne laisse pas trois lignes).
    const AN_J = ANNEE_TEST_VOISINE
    const chemElec = P('pA','deductibles','Électricité','2')

    // 1. La matière vient de la synchronisation, avec l'ANCIENNE valeur.
    const sAvant = { pA: { deductibles: { 'Électricité': an([2,'142.30']) } } }
    const sApres = { pA: { deductibles: { 'Électricité': an([2,'150.00']) } } }
    const dJ = syncDater(meta0(sAvant, 1000), sAvant, sApres, 5000)
    eq('J01', 'Une modification est rendue avec son chemin, son avant et son après',
       { chemin: chemElec, avant: '142.30', apres: '150.00', genre: 'maj' },
       dJ.changements.find(c => c.chemin === chemElec))
    const dJ2 = syncDater(syncMetaVide(), {}, sApres, 5000)
    eq('J02', 'Une case remplie pour la première fois est un ajout, pas une correction',
       'ajout', dJ2.changements.find(c => c.chemin === chemElec).genre)
    const dJ3 = syncDater(copie(meta0(sAvant, 1000)), sAvant, { pA: { deductibles: {} } }, 6000)
    eq('J03', 'Retirer une catégorie est une suppression, et dit combien de cases elle emporte',
       { genre: 'suppression', feuilles: 12 },
       (c => ({ genre: c.genre, feuilles: c.feuilles }))(dJ3.changements.find(c => c.genre === 'suppression')))

    // 2. Ce qui n'a rien à raconter n'est pas inscrit.
    eq('J04', 'Une case qui passe de vide à vide ne laisse aucune ligne', 0,
       journalEntrees([{ chemin: 'x', avant: '', apres: null, genre: 'maj' }], 1, 'saisie', 'Mac').length)
    eq('J05', 'Une valeur très longue est coupée, pas recopiée au journal', JOURNAL_VAL_MAX + 1,
       journalEntrees([{ chemin: 'x', avant: '', apres: 'z'.repeat(400), genre: 'ajout' }], 1, 'saisie', 'Mac')[0].apres.length)
    eq('J06', 'L\'appareil est nommé à partir de son agent utilisateur', ['iPhone', 'Mac'],
       [journalAppareil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'),
        journalAppareil('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')])

    // 3. Repli des écritures rapprochées : hésiter sur un montant est UNE
    //    décision, pas trois.
    const e1 = journalEntrees([{ chemin: chemElec, avant: '', apres: '142', genre: 'maj' }], 1000, 'saisie', 'Mac')
    const e2 = journalEntrees([{ chemin: chemElec, avant: '142', apres: '1420', genre: 'maj' }], 2000, 'saisie', 'Mac')
    const e3 = journalEntrees([{ chemin: chemElec, avant: '1420', apres: '142.30', genre: 'maj' }], 3000, 'saisie', 'Mac')
    const jReplie = journalAjouter(journalAjouter(journalAjouter([], e1), e2), e3)
    eq('J07', 'Trois corrections rapprochées tiennent sur une seule ligne', 1, jReplie.length)
    eq('J08', 'Et cette ligne porte la valeur de départ et la valeur finale',
       { avant: '', apres: '142.30' }, { avant: jReplie[0].avant, apres: jReplie[0].apres })
    const retour = journalEntrees([{ chemin: chemElec, avant: '142.30', apres: '', genre: 'maj' }], 4000, 'saisie', 'Mac')
    eq('J09', 'Une correction annulée ne laisse rien du tout', 0,
       journalAjouter(jReplie, retour).length)
    eq('J10', 'Au-delà de la fenêtre de repli, la deuxième écriture est une ligne à part', 2,
       journalAjouter(journalAjouter([], e1), journalEntrees(
         [{ chemin: chemElec, avant: '142', apres: '900', genre: 'maj' }],
         1000 + JOURNAL_FUSION_MS + 1, 'saisie', 'Mac')).length)
    eq('J11', 'Le journal est plafonné : les plus vieilles lignes tombent',
       ['c8', 'c9'],
       journalAjouter([], Array.from({ length: 10 }, (_, i) =>
         ({ ts: 1000 + i, chemin: 'c' + i, genre: 'ajout', origine: 'saisie', appareil: 'Mac', avant: '', apres: 'v' })), 2)
         .map(e => e.chemin))

    // 4. Un chemin de fusion devient une phrase lisible.
    eq('J12', 'Une case de mois se lit « immeuble › section › catégorie › mois »',
       'Duplex A › Dépenses › Électricité › mars',
       journalLabel(chemElec, journalLexique()))
    eq('J13', 'Un champ Lyft dit son mois et son libellé de formulaire',
       'Lyft › mars › ' + LYFT_FIELDS.find(f => f.key === 'taxable').label,
       journalLabel(P('lyft','2','taxable'), journalLexique()))
    eq('J14', 'Un réglage de configuration se lit comme tel',
       'Configuration › Modules › trips', journalLabel(P('config','modules','trips'), journalLexique()))
    eq('J15', 'Une ligne de modification se lit d\'une phrase',
       'Duplex A › Dépenses › Électricité › mars : 142.30 → 150.00',
       journalPhrase(journalEntrees(dJ.changements, 5000, 'saisie', 'Mac')
         .find(e => e.chemin === chemElec), journalLexique()))

    // 5. Consultation : le plus récent d'abord, filtré, groupé par jour.
    const jConsult = [
      { ts: Date.parse('2026-03-01T10:00:00'), chemin: chemElec, genre: 'maj', origine: 'saisie',  appareil: 'Mac',    avant: '1', apres: '2' },
      { ts: Date.parse('2026-03-01T15:00:00'), chemin: P('uber','tolls'), genre: 'ajout', origine: 'distant', appareil: 'iPhone', avant: '', apres: '9' },
      { ts: Date.parse('2026-03-02T09:00:00'), chemin: chemElec, genre: 'maj', origine: 'saisie',  appareil: 'Mac',    avant: '2', apres: '3' }
    ]
    eq('J16', 'La consultation montre le plus récent d\'abord',
       [jConsult[2].ts, jConsult[1].ts, jConsult[0].ts],
       journalFiltrer(jConsult, {}).map(e => e.ts))
    eq('J17', 'Le filtre d\'origine isole ce qui vient d\'un autre appareil', 1,
       journalFiltrer(jConsult, { origine: 'distant' }).length)
    eq('J18', 'La recherche porte sur le libellé lisible, pas sur le chemin brut', 2,
       journalFiltrer(jConsult, { texte: 'électricité', lexique: journalLexique() }).length)
    eq('J19', 'Les lignes sont groupées par jour', [1, 2],
       journalGrouper(journalFiltrer(jConsult, {})).map(g => g.entrees.length))

    // 6. Ce qui arrive d'un autre appareil est inscrit à l'arrivée — c'est ce
    //    qui permet au journal local d'expliquer TOUS les changements.
    const fJ = syncFusionner({ state: sAvant, meta: meta0(sAvant, 1000) },
                             { state: sApres, meta: dJ.meta })
    eq('J20', 'La fusion dit quelle valeur elle a prise à l\'autre appareil, et à la place de quoi',
       { chemin: chemElec, avant: '142.30', apres: '150.00' },
       (c => ({ chemin: c.chemin, avant: c.avant, apres: c.apres }))(fJ.changements.find(c => c.chemin === chemElec)))
    // La propriété qui fait la valeur du journal : il ne raconte que ce qui a
    // vraiment changé ici. Une valeur ÉCARTÉE par un arbitrage n'y figure pas.
    const fGarde = syncFusionner({ state: sApres, meta: meta0(sApres, 9000) },
                                 { state: sAvant, meta: meta0(sAvant, 1000) })
    eq('J21', 'Une valeur reçue mais écartée ne laisse aucune ligne', 0,
       fGarde.changements.filter(c => c.chemin === chemElec).length)
    eq('J22', 'Une fusion qui n\'apporte rien n\'invente pas d\'historique', 0,
       journalEntrees(syncFusionner({ state: sAvant, meta: meta0(sAvant, 1000) },
                                    { state: sAvant, meta: meta0(sAvant, 1000) }).changements,
                      1, 'distant', 'iPhone').length)
    // Le premier raccordement d'un appareil reçoit des centaines de valeurs :
    // une ligne de synthèse, sinon le bruit chasse l'historique utile.
    const beaucoup = Array.from({ length: 120 }, (_, i) =>
      ({ chemin: 'c' + i, avant: undefined, apres: 'v', genre: 'ajout' }))
    eq('J23', 'Une fusion massive tient en une ligne de synthèse',
       { genre: 'lot', nb: 120 },
       (e => ({ genre: e.genre, nb: e.nb }))(journalEntreeLot(beaucoup, 1, 'iPhone')))
    eq('J24', 'Une fusion ordinaire, elle, reste détaillée', null,
       journalEntreeLot([{ chemin: 'c', avant: '', apres: 'v', genre: 'ajout' }], 1, 'iPhone'))
    // Une fusion arrive en deux temps (transaction puis refusion par-dessus la
    // saisie en cours) : la même suppression ne doit pas s'inscrire deux fois.
    const supEntree = ts => journalEntrees([{ chemin: P('trips','t9'), genre: 'suppression', feuilles: 3 }], ts, 'distant', 'iPhone')
    eq('J25', 'La même suppression décrite deux fois ne fait qu\'une ligne', 1,
       journalAjouter(journalAjouter([], supEntree(1000)), supEntree(1200)).length)
    // Un trajet supprimé n'a plus de libellé à retrouver : ce qu'il contenait
    // est donc inscrit au moment de la suppression, pas reconstitué après.
    const sTraj = { trips: [{ id: 't8', date: '2026-01-04', destination: 'Quincaillerie', km: 5 },
                            { id: 't9', date: '2026-03-02', destination: 'Rona', km: 18 }] }
    const dTraj = syncDater(meta0(sTraj, 1000), sTraj, { trips: [sTraj.trips[0]] }, 9000)
    const eTraj = journalEntrees(dTraj.changements, 9000, 'saisie', 'Mac')[0]
    eq('J26', 'Un trajet supprimé garde la trace de ce qu\'il contenait',
       'Trajet › t9 — retiré (4 cases : 2026-03-02, Rona, 18)',
       journalPhrase(eTraj, journalLexique()))

    // 7. Le stockage : une année, une clé, et un aller-retour fidèle.
    journalVider(AN_J)
    const nbJ = journalConsigner(dJ.changements, 'saisie', { year: AN_J, ts: 7000, appareil: 'Mac' })
    const reluJ = journalLire(AN_J)
    eq('J27', 'Consigner écrit dans le journal de SON année, et la relecture est fidèle',
       { nb: 1, lignes: 1, chemin: chemElec, apres: '150.00', appareil: 'Mac' },
       { nb: nbJ, lignes: reluJ.length, chemin: reluJ[0] && reluJ[0].chemin,
         apres: reluJ[0] && reluJ[0].apres, appareil: reluJ[0] && reluJ[0].appareil })
    sansErreur('J28', 'Consigner n\'importe quoi ne lève jamais : une saisie ne doit pas échouer à cause du journal',
               () => { journalConsigner(null, 'saisie', { year: AN_J }); journalConsigner([{}], 'saisie', { year: AN_J }) })
    // Le cas qui justifie le fichier : ce qui a bougé depuis la clôture.
    const closedSauve = state.closed
    state.closed = { at: new Date(8000).toISOString(), totaux: {}, empreinte: 'x' }
    journalEcrire(activeYear, [
      { ts: 5000, chemin: chemElec, genre: 'maj', origine: 'saisie', appareil: 'Mac', avant: '1', apres: '2' },
      { ts: 9000, chemin: chemElec, genre: 'maj', origine: 'saisie', appareil: 'Mac', avant: '2', apres: '3' }
    ])
    eq('J29', 'Seules les modifications POSTÉRIEURES à la clôture sont montrées', [9000],
       journalDepuisCloture(activeYear).map(e => e.ts))
    if (closedSauve) state.closed = closedSauve; else delete state.closed
    journalVider(AN_J)
    sansErreur('J30', 'L\'écran d\'historique se rend sans lever', () => renderJournal())

    // ── Référence de parité, vague 1 bis : journal.js → JournalService.swift ──
    // Même principe que pour la fusion : rien n'est retapé. Les entrées sont
    // celles des assertions ci-dessus, et les valeurs attendues sont ce que la
    // PWA vient d'en faire. Les clés absentes (`undefined`) disparaissent au
    // passage par copie() exactement comme JSON.stringify les laisse tomber,
    // donc le JSON lu par Swift décrit la même chose que l'objet JS.
    const lexJ = journalLexique()
    const entreesJSON = (nom, changements, ts, origine, appareil, prefixe) => ({
      nom, changements: copie(changements), ts, origine, appareil, prefixe: prefixe || null,
      attendu: copie(journalEntrees(changements, ts, origine, appareil, prefixe))
    })
    const ajoutJSON = (nom, journal, nouvelles, max, fenetre) => ({
      nom, journal: copie(journal), nouvelles: copie(nouvelles),
      max: max == null ? null : max, fenetre: fenetre == null ? null : fenetre,
      attendu: copie(journalAjouter(journal, nouvelles, max, fenetre))
    })
    const jr1 = journalAjouter([], e1)
    const jr2 = journalAjouter(jr1, e2)
    const eTard = journalEntrees([{ chemin: chemElec, avant: '142', apres: '900', genre: 'maj' }],
                                 1000 + JOURNAL_FUSION_MS + 1, 'saisie', 'Mac')
    const dixLignes = Array.from({ length: 10 }, (_, i) =>
      ({ ts: 1000 + i, chemin: 'c' + i, genre: 'ajout', origine: 'saisie', appareil: 'Mac', avant: '', apres: 'v' }))
    const eLot = journalEntreeLot(beaucoup, 1, 'iPhone')

    PARITE.journal = {
      constantes: { max: JOURNAL_MAX, fenetre: JOURNAL_FUSION_MS, valMax: JOURNAL_VAL_MAX, seuilLot: JOURNAL_SEUIL_LOT },
      mois: JOURNAL_MOIS.slice(),
      sections: copie(JOURNAL_SECTIONS),
      lexique: copie(lexJ),

      // J06 : nommer l'appareil, pour qu'une ligne dise d'où elle vient.
      appareils: ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
                  'Mozilla/5.0 (iPad; CPU OS 17_0)',
                  'Mozilla/5.0 (Linux; Android 14)',
                  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
                  'Mozilla/5.0 (Windows NT 10.0)',
                  'Mozilla/5.0 (X11; Linux x86_64)',
                  'curl/8.0', '']
        .map(ua => ({ ua, attendu: journalAppareil(ua) })),

      // J05 : ce qu'on inscrit à la place d'une valeur. L'absence, `null` et la
      // chaîne vide décrivent la même chose : une case vide.
      valeurs: [{ absente: true }, { v: null }, { v: '' }, { v: '  142.30  ' }, { v: true }, { v: false },
                { v: 42 }, { v: 0 }, { v: 'z'.repeat(400) }, { v: { a: 1, b: 'deux' } }, { v: ['x', 'y'] },
                { v: 'z'.repeat(JOURNAL_VAL_MAX - 1) }, { v: 'z'.repeat(JOURNAL_VAL_MAX) },
                { v: 'z'.repeat(JOURNAL_VAL_MAX + 1) }, { v: 'é'.repeat(JOURNAL_VAL_MAX + 1) }]
        .map(c => ({ absente: !!c.absente, entree: c.absente ? null : copie(c.v),
                     attendu: journalValeur(c.absente ? undefined : c.v) })),
      moisDe: ['0', '2', '11', '12', '-1', '', 'x', '1.5'].map(seg => ({ segment: seg, attendu: journalMois(seg) })),

      // J12 à J14, J26 : un chemin de fusion devient un libellé lisible. Une
      // branche par forme de chemin — c'est là que le portage dérape le plus
      // facilement, puisque chaque branche a sa propre règle.
      labels: [chemElec,
               P('pA','revenus','Coloc 1','0'),
               P('pA','capital','Toiture'),
               P('lyft','2','taxable'),
               P('uber','rides_gross'),
               P('config','modules','trips'),
               P('trips','t9'),
               P('trips','t9','km'),
               P('trips','inconnu','destination'),
               P('vehicule','2026','kmTotalAnnuel'),
               P('settings','mileageRate'),
               P('recurring','pA','3'),
               P('recusIndex','pA:deductibles:Taxes:3'),
               P('notes','pA','5'),
               P('closed'),
               P('closedHistory','0'),
               P('inconnu','2','x'),
               'sansSeparateur']
        .map(ch => ({ chemin: ch, avecLexique: journalLabel(ch, lexJ), sansLexique: journalLabel(ch, null) })),

      // J01 à J05, J20 à J22 : les lignes construites à partir de ce que la
      // synchronisation a mesuré.
      entrees: [
        entreesJSON('une correction de montant', dJ.changements, 5000, 'saisie', 'Mac'),
        entreesJSON('une première saisie est un ajout', dJ2.changements, 5000, 'saisie', 'Mac'),
        entreesJSON('une catégorie retirée', dJ3.changements, 6000, 'saisie', 'Mac'),
        entreesJSON('un trajet supprimé garde son aperçu', dTraj.changements, 9000, 'saisie', 'Mac'),
        entreesJSON('ce qui arrive par fusion', fJ.changements, 6000, 'distant', 'iPhone'),
        entreesJSON('une valeur écartée ne laisse rien', fGarde.changements, 6000, 'distant', 'iPhone'),
        entreesJSON('de vide à vide : aucune ligne',
                    [{ chemin: 'x', avant: '', apres: null, genre: 'maj' }], 1, 'saisie', 'Mac'),
        entreesJSON('une valeur très longue est coupée',
                    [{ chemin: 'x', avant: '', apres: 'z'.repeat(400), genre: 'ajout' }], 1, 'saisie', 'Mac'),
        entreesJSON('un préfixe est posé devant le chemin', dJ.changements, 5000, 'distant', 'iPhone', 'p1090'),
        entreesJSON('rien du tout', [], 1, 'saisie', 'Mac')
      ],

      // J23, J24 : la ligne de synthèse d'un premier raccordement.
      lots: [
        { nom: '120 valeurs reçues', changements: copie(beaucoup), ts: 1, appareil: 'iPhone', seuil: null,
          attendu: eLot ? copie(eLot) : null },
        { nom: 'une seule valeur reste détaillée',
          changements: copie([{ chemin: 'c', avant: '', apres: 'v', genre: 'ajout' }]), ts: 1, appareil: 'iPhone',
          seuil: null, attendu: journalEntreeLot([{ chemin: 'c', avant: '', apres: 'v', genre: 'ajout' }], 1, 'iPhone') },
        { nom: 'avec des suppressions, et un seuil abaissé',
          changements: copie([{ chemin: 'a', apres: 'v', genre: 'ajout' },
                              { chemin: 'b', genre: 'suppression', feuilles: 2 }]),
          ts: 7000, appareil: 'Mac', seuil: 2,
          attendu: copie(journalEntreeLot([{ chemin: 'a', apres: 'v', genre: 'ajout' },
                                           { chemin: 'b', genre: 'suppression', feuilles: 2 }], 7000, 'Mac', 2)) }
      ],

      // J07 à J11, J25 : le repli, qui fait qu'une hésitation sur un montant
      // n'occupe qu'une ligne — et le plafond.
      ajouts: [
        ajoutJSON('première correction', [], e1),
        ajoutJSON('deuxième correction rapprochée', jr1, e2),
        ajoutJSON('troisième correction rapprochée', jr2, e3),
        ajoutJSON('retour à la valeur de départ : la ligne disparaît', jReplie, retour),
        ajoutJSON('hors de la fenêtre de repli : deux lignes', jr1, eTard),
        ajoutJSON('plafond atteint : les plus vieilles tombent', [], dixLignes, 2),
        ajoutJSON('la même suppression décrite deux fois', journalAjouter([], supEntree(1000)), supEntree(1200)),
        ajoutJSON('fenêtre resserrée : plus de repli', jr1, e2, null, 1),
        ajoutJSON('à la seconde près, le repli joue encore', jr1,
                  journalEntrees([{ chemin: chemElec, avant: '142', apres: '777', genre: 'maj' }],
                                 1000 + JOURNAL_FUSION_MS, 'saisie', 'Mac')),
        ajoutJSON('une milliseconde plus tard, non', jr1,
                  journalEntrees([{ chemin: chemElec, avant: '142', apres: '777', genre: 'maj' }],
                                 1000 + JOURNAL_FUSION_MS + 1, 'saisie', 'Mac')),
        ajoutJSON('rien à ajouter', jReplie, [])
      ],

      // J16 à J19 : consultation — le plus récent d'abord, filtré, groupé.
      consultation: copie(jConsult),
      filtres: [
        { nom: 'tout', filtre: {}, attendu: copie(journalFiltrer(jConsult, {})) },
        { nom: 'ce qui vient d\'un autre appareil', filtre: { origine: 'distant' },
          attendu: copie(journalFiltrer(jConsult, { origine: 'distant' })) },
        { nom: '« tout » n\'est pas une origine', filtre: { origine: 'tout' },
          attendu: copie(journalFiltrer(jConsult, { origine: 'tout' })) },
        { nom: 'recherche sur le libellé lisible', filtre: { texte: 'électricité', avecLexique: true },
          attendu: copie(journalFiltrer(jConsult, { texte: 'électricité', lexique: lexJ })) },
        { nom: 'recherche sans lexique ne trouve pas le libellé', filtre: { texte: 'électricité' },
          attendu: copie(journalFiltrer(jConsult, { texte: 'électricité' })) },
        { nom: 'bornes de dates', filtre: { depuis: jConsult[1].ts, jusqua: jConsult[2].ts },
          attendu: copie(journalFiltrer(jConsult, { depuis: jConsult[1].ts, jusqua: jConsult[2].ts })) }
      ],
      groupes: journalGrouper(journalFiltrer(jConsult, {}))
        .map(g => ({ jour: g.jour, ts: g.entrees.map(e => e.ts) })),
      jours: [{ jour: '2026-03-01', aujourdhui: Date.parse('2026-03-01T12:00:00') },
              { jour: '2026-03-01', aujourdhui: Date.parse('2026-03-02T12:00:00') },
              { jour: '2026-03-01', aujourdhui: Date.parse('2026-03-05T12:00:00') },
              { jour: '2026-12-31', aujourdhui: Date.parse('2026-03-05T12:00:00') }]
        .map(c => ({ jour: c.jour, aujourdhui: c.aujourdhui, attendu: journalJourLibelle(c.jour, c.aujourdhui) })),

      // J15, J26 : une ligne se lit d'une phrase.
      phrases: [
        journalEntrees(dJ.changements, 5000, 'saisie', 'Mac').find(e => e.chemin === chemElec),
        journalEntrees(dJ2.changements, 5000, 'saisie', 'Mac').find(e => e.chemin === chemElec),
        eTraj,
        journalEntrees([{ chemin: chemElec, avant: '142.30', apres: '', genre: 'maj' }], 1, 'saisie', 'Mac')[0],
        journalEntrees([{ chemin: P('trips','t8'), genre: 'suppression', feuilles: 1, avant: 'Rona' }], 1, 'saisie', 'Mac')[0],
        eLot
      ].filter(Boolean).map(e => ({ entree: copie(e), avecLexique: journalPhrase(e, lexJ),
                                    sansLexique: journalPhrase(e, null) }))
    }

    // Deux datages de plus, pour les APERÇUS de suppression : ce qu'un trajet
    // emportait (ses trois premières valeurs, sans son id) et ce qu'une
    // catégorie entière emporte (douze cases).
    PARITE.sync.datages.push(
      datageJSON('supprimer un trajet et dire ce qu\'il contenait', meta0(sTraj, 1000),
                 sTraj, { trips: [sTraj.trips[0]] }, 9000, dTraj),
      datageJSON('retirer une catégorie de douze cases', meta0(sAvant, 1000),
                 sAvant, { pA: { deductibles: {} } }, 6000, dJ3))

    // Les trois fusions annoncées plus haut : leurs états servent d'abord aux
    // assertions J20 à J22, c'est pourquoi elles rejoignent la liste ici.
    PARITE.sync.fusions.push(
      fusionJSON('la fusion dit ce qu\'elle a pris', { state: sAvant, meta: meta0(sAvant, 1000) },
                 { state: sApres, meta: dJ.meta }),
      fusionJSON('une valeur écartée ne laisse rien', { state: sApres, meta: meta0(sApres, 9000) },
                 { state: sAvant, meta: meta0(sAvant, 1000) }),
      fusionJSON('une fusion qui n\'apporte rien', { state: sAvant, meta: meta0(sAvant, 1000) },
                 { state: sAvant, meta: meta0(sAvant, 1000) }))

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
      try { localStorage.removeItem(META_PREFIX + an) } catch (e) {}
      try { localStorage.removeItem(JOURNAL_PREFIX + an) } catch (e) {}
    })
    save()
    sauverMeta(activeYear, backup.meta)
    if (typeof journalEcrire === 'function') journalEcrire(activeYear, backup.journal)
    rechargerMeta()
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
    tous: results,
    // Lue par tests/export-parite.js seulement ; run-headless.js l'ignore.
    parite: PARITE
  }
})()
