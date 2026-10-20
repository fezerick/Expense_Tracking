// Suite de tests — le raccordement à Firestore (pwa_2026/index.html, § 2.4)
//
// `pwa_modules_suite.js` couvre le MOTEUR de fusion (`js/sync.js`, 45 assertions
// M260–M304) : du calcul pur sur un arbre et des dates. Elle ne couvre pas le
// RACCORDEMENT — transactions, écoute temps réel, enveloppe du document,
// configuration sans le thème, photos de reçus — et c'est précisément là que
// vivent les erreurs qui coûtent des données : un envoi qui écrase au lieu de
// fusionner ne se voit nulle part dans les tests du moteur.
//
// D'où ce fichier, et son Firestore de pacotille : un magasin en mémoire qui
// respecte ce qui compte du vrai — `runTransaction`, `onSnapshot` avec
// `docChanges()`, et surtout `metadata.hasPendingWrites`, le drapeau qui
// distingue notre propre écriture qui revient de l'écriture d'un autre appareil.
//
// Rien ne part sur le réseau, aucun compte n'est nécessaire.
//
// Usage :
//   1. servir l'app : cd pwa_2026 && python3 -m http.server 8099
//   2. ouvrir http://localhost:8099/index.html
//   3. res = await eval(await (await fetch('/tests/pwa_sync_suite.js')).text())
//
// `npm test` l'exécute comme les deux autres. Elle est ASYNCHRONE : elle retourne
// une promesse, parce que chaque envoi est un aller-retour `await`.
//
// L'état réel est sauvegardé puis restauré à la fin.

(async function runSyncSuite() {
  const results = []
  function check(id, titre, attendu, obtenu, ok) {
    results.push({ id, titre, attendu, obtenu, statut: ok ? 'PASS' : 'FAIL' })
  }
  function eq(id, titre, attendu, obtenu) {
    check(id, titre, attendu, obtenu, JSON.stringify(attendu) === JSON.stringify(obtenu))
  }
  const vrai = (id, titre, obtenu) => check(id, titre, true, obtenu, obtenu === true)

  // ── Firestore de pacotille ─────────────────────────────────────────────────
  const store = new Map()
  const abos = { col: [], doc: new Map() }
  const clone = o => JSON.parse(JSON.stringify(o))
  const snap = (chemin, pending) => ({
    id: chemin.split('/').pop(),
    exists: store.has(chemin),
    data: () => clone(store.get(chemin)),
    metadata: { hasPendingWrites: !!pending }
  })
  // Une écriture dans la collection prévient les abonnés de la COLLECTION
  // parente, comme le vrai : c'est ce qui fait arriver l'année 2025 alors que
  // l'écran affiche 2026.
  function emettreCol(chemin, type, pending) {
    const parent = chemin.split('/').slice(0, -1).join('/')
    abos.col.filter(a => a.chemin === parent)
            .forEach(a => a.cb({ docChanges: () => [{ type, doc: snap(chemin, pending) }] }))
  }
  function emettreDoc(chemin, pending) {
    (abos.doc.get(chemin) || []).forEach(cb => cb(snap(chemin, pending)))
  }
  const refDoc = chemin => ({
    _chemin: chemin,
    get: async () => snap(chemin),
    set: async v => {
      store.set(chemin, clone(v))
      emettreCol(chemin, 'modified', true)
      emettreDoc(chemin, true)
    },
    delete: async () => { store.delete(chemin) },
    collection: nom => refCol(chemin + '/' + nom),
    onSnapshot: cb => {
      if (!abos.doc.has(chemin)) abos.doc.set(chemin, [])
      abos.doc.get(chemin).push(cb)
      cb(snap(chemin, false))
      return () => {}
    }
  })
  const refCol = chemin => ({
    _chemin: chemin,
    doc: id => refDoc(chemin + '/' + id),
    onSnapshot: cb => { abos.col.push({ chemin, cb }); return () => {} }
  })
  const faux = {
    collection: nom => refCol(nom),
    runTransaction: async fn => fn({
      get: ref => Promise.resolve(snap(ref._chemin)),
      set: (ref, v) => { store.set(ref._chemin, clone(v)); emettreCol(ref._chemin, 'modified', true) }
    })
  }

  // ── Sauvegarde de l'état réel ──────────────────────────────────────────────
  // Comme dans la suite des modules : `meta` en fait partie, sinon le save() du
  // bloc finally daterait le retour aux vraies données comme une saisie faite à
  // l'instant, et cet appareil gagnerait ensuite toutes les fusions.
  const backup = {
    state: clone(state), setup: clone(setup), activeYear,
    meta: clone(stateMeta), db: _fbDb, auth: window._fbAuth,
    fv: (window.firebase && firebase.firestore && firebase.firestore.FieldValue) || null
  }

  let erreurFatale = null
  const an = activeYear
  const chAn = 'users/u1/years/' + an
  const lu = ch => {
    const d = store.get(ch)
    return d ? { data: JSON.parse(d.data), meta: JSON.parse(d.meta), year: d.year } : null
  }

  try {
    _fbDb = faux
    _fbAuth = window._fbAuth = { currentUser: { uid: 'u1' }, signOut: async () => {} }
    if (!window.firebase) window.firebase = {}
    if (typeof firebase.firestore !== 'function') firebase.firestore = {}
    firebase.firestore.FieldValue = { serverTimestamp: () => 'TS' }

    // ── F01–F04 · Un appareil qui porte déjà des données se connecte ──────────
    // Le premier envoi est le moment dangereux : si le document distant existe
    // et qu'on écrase, les données de l'autre appareil sont perdues.
    state.uber = { rides_gross: '1234' }
    save()
    await syncPushAnnee(an)
    const doc1 = lu(chAn)
    vrai('F01', 'Le premier envoi écrit bien le document de l\'année', !!doc1 && doc1.year === an)
    eq('F02', 'La saisie locale est dans le document', '1234', doc1 && doc1.data.uber.rides_gross)
    vrai('F03', 'Les dates par feuille voyagent avec les données',
         !!doc1 && Object.keys(doc1.meta.feuilles || {}).length > 0)
    // Une photo pèse des centaines de kilo-octets et le document plafonne à 1 Mio.
    vrai('F04', 'Les photos de reçus ne sont PAS dans le document', !!doc1 && !('receipts' in doc1.data))

    // ── F05–F07 · Un autre appareil ajoute un trajet ──────────────────────────
    const brut = clone(store.get(chAn))
    const dDist = JSON.parse(brut.data), mDist = JSON.parse(brut.meta)
    dDist.trips = [{ id: 'tX', date: an + '-05-01', km: '42', motif: 'autre appareil' }]
    ;['id', 'date', 'km', 'motif'].forEach(f => {
      mDist.feuilles[syncPath(['trips', 'tX', f])] = Date.now() + 1000
    })
    brut.data = JSON.stringify(dDist); brut.meta = JSON.stringify(mDist)
    store.set(chAn, brut)
    syncDemarrer()
    emettreCol(chAn, 'modified', false)
    vrai('F05', 'Le trajet saisi sur l\'autre appareil arrive ici',
         (state.trips || []).some(t => t.id === 'tX'))
    eq('F06', 'Et la saisie locale n\'est pas écrasée au passage', '1234', state.uber.rides_gross)

    // Notre propre écriture qui revient : la refusionner relancerait un envoi,
    // qui reviendrait, indéfiniment.
    state.uber.rides_gross = '9999'
    save()
    emettreCol(chAn, 'modified', true)
    eq('F07', 'Notre propre écriture qui revient ne défait pas la saisie en cours',
       '9999', state.uber.rides_gross)

    // ── F08–F09 · La configuration, sans le thème ─────────────────────────────
    setup.theme = 'dark'
    setup.identite = { ...(setup.identite || {}), nom: 'Essai Fusion' }
    saveSetup()
    await syncPushSetup()
    const cfg = lu('users/u1/config/setup')
    eq('F08', 'La configuration part dans son propre document',
       'Essai Fusion', cfg && cfg.data.identite && cfg.data.identite.nom)
    // Le mode sombre du téléphone le soir n'a rien à imposer à l'ordinateur.
    vrai('F09', 'Le thème reste propre à l\'appareil', !!cfg && !('theme' in cfg.data))

    // ── F10–F14 · Les photos de reçus ─────────────────────────────────────────
    // La clé contient une barre oblique, qu'un identifiant de document refuse.
    const cle = 'p1090:deductibles:Eau / Égouts:3'
    const photo = 'data:image/png;base64,AAAA'
    state.receipts = { [cle]: photo }
    state.recusIndex = {}
    await recusReconcilier()
    const chRecu = 'users/u1/recus/' + recusDocId(an, cle)
    vrai('F10', 'L\'identifiant du document de reçu ne contient pas de « / »',
         recusDocId(an, cle).indexOf('/') === -1)
    eq('F11', 'La photo locale monte dans son propre document', photo,
       store.has(chRecu) ? store.get(chRecu).data : null)
    vrai('F12', 'Et elle entre dans l\'index synchronisé', !!state.recusIndex[cle])

    // L'appareil qui reçoit l'index sans la photo doit aller la chercher.
    delete state.receipts[cle]
    await recusReconcilier()
    eq('F13', 'Une photo annoncée par l\'index et absente d\'ici se télécharge',
       photo, state.receipts[cle])

    // Supprimée ailleurs : la ligne d'index disparaît, la fusion pose une
    // tombale, et la copie locale s'en va — sinon elle remonterait au prochain
    // passage et le reçu supprimé reviendrait d'entre les morts.
    delete state.recusIndex[cle]
    save()
    vrai('F14', 'Retirer un reçu pose une tombale sur sa ligne d\'index',
         syncDateSuppression(stateMeta, syncPath(['recusIndex', cle])) > 0)
    await recusReconcilier()
    vrai('F15', 'Et la copie locale de la photo s\'en va aussi', !state.receipts[cle])
  } catch (e) {
    erreurFatale = (e && e.message) || String(e)
  } finally {
    // ── Remise en place ──────────────────────────────────────────────────────
    syncArreter()
    _fbDb = backup.db
    _fbAuth = window._fbAuth = backup.auth
    if (backup.fv) firebase.firestore.FieldValue = backup.fv
    state = backup.state
    setup = backup.setup
    activeYear = backup.activeYear
    if (typeof invalidateDPA === 'function') invalidateDPA()
    save()
    sauverMeta(activeYear, backup.meta)
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
    tous: results
  }
})()
