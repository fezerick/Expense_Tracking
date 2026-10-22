// Suite de tests — verrou d'ouverture de la PWA (pwa_2026/js/verrou.js)
//
// Quatrième suite, et la première à être ASYNCHRONE : PBKDF2 ne rend sa réponse
// que dans une promesse. Le lanceur `await` ce que la suite retourne, donc une
// fonction async se comporte comme les trois autres.
//
// Ce qu'elle vérifie en priorité, dans l'ordre de ce qui ferait le plus de mal
// si c'était faux :
//   1. CONFIDENTIALITÉ — le sel et l'empreinte du code ne doivent sortir ni
//      vers Firestore, ni dans un fichier de sauvegarde, et une configuration
//      venue d'un autre appareil ne doit pas écraser le verrou local.
//   2. La normalisation : une configuration corrompue ne doit jamais passer
//      pour un verrou actif — l'écran de déverrouillage serait alors
//      impossible à lever.
//   3. La décision de reverrouiller, et l'attente imposée après des échecs.
//   4. L'empreinte elle-même : déterminisme, dépendance au sel et au code.
//
// Usage : node tests/run-headless.js verrou
// L'état réel est sauvegardé puis restauré à la fin.

(async function runVerrouSuite() {
  const results = []

  function check(id, titre, attendu, obtenu, ok) {
    results.push({ id, titre, attendu, obtenu, statut: ok ? 'PASS' : 'FAIL' })
  }
  function eq(id, titre, attendu, obtenu) {
    check(id, titre, attendu, obtenu, JSON.stringify(attendu) === JSON.stringify(obtenu))
  }
  function vrai(id, titre, obtenu) { check(id, titre, true, obtenu, obtenu === true) }
  function faux(id, titre, obtenu) { check(id, titre, false, obtenu, obtenu === false) }

  // ── Sauvegarde de l'état réel ──────────────────────────────────────────────
  const backup = {
    setup: JSON.parse(JSON.stringify(setup)),
    meta: JSON.parse(JSON.stringify(setupMeta))
  }

  let erreurFatale = null
  try {

    // ════════════════════════════════════════════════════════════════════════
    // 1. CONFIDENTIALITÉ — le code ne quitte pas l'appareil
    // ════════════════════════════════════════════════════════════════════════

    // Une configuration de verrou crédible, posée dans `setup` comme le ferait
    // une vraie activation.
    setup.verrou = {
      actif: true, sel: 'AAAAAAAAAAAAAAAAAAAAAA==', hash: 'Qk9OSk9VUg==',
      iterations: 310000, delaiMinutes: 5, compte: 'quelquun@example.com'
    }

    const pourSync = setupPourSync(setup)
    faux('S1', 'setupPourSync ne laisse pas passer le verrou vers Firestore',
         Object.prototype.hasOwnProperty.call(pourSync, 'verrou'))
    faux('S2', 'setupPourSync ne laisse toujours pas passer le thème',
         Object.prototype.hasOwnProperty.call(pourSync, 'theme'))
    vrai('S3', 'setupPourSync garde bien le reste (les modules)',
         Object.prototype.hasOwnProperty.call(pourSync, 'modules'))

    const sansVerrou = setupSansVerrou(setup)
    faux('S4', 'setupSansVerrou retire le verrou',
         Object.prototype.hasOwnProperty.call(sansVerrou, 'verrou'))
    vrai('S5', 'setupSansVerrou garde le thème (il voyage dans une sauvegarde)',
         Object.prototype.hasOwnProperty.call(sansVerrou, 'theme'))

    const sauvegarde = backupPayload()
    faux('S6', 'Un fichier de sauvegarde ne contient pas le verrou',
         Object.prototype.hasOwnProperty.call(sauvegarde.setup || {}, 'verrou'))
    // Vérification par le texte, et pas seulement par la clé : c'est le JSON
    // qui part en pièce jointe, et une empreinte recopiée ailleurs dans
    // l'objet passerait le test de la clé.
    faux('S7', 'Le sel n\'apparaît nulle part dans le JSON de sauvegarde',
         JSON.stringify(sauvegarde).includes('AAAAAAAAAAAAAAAAAAAAAA=='))
    faux('S8', 'L\'empreinte n\'apparaît nulle part dans le JSON de sauvegarde',
         JSON.stringify(sauvegarde).includes('Qk9OSk9VUg=='))

    // Une configuration arrivant d'un AUTRE appareil : elle ne doit ni apporter
    // un verrou, ni retirer celui d'ici.
    const avant = JSON.stringify(setup.verrou)
    syncAppliquerSetup({
      state: { done: true, modules: { trips: true, props: true, rideshare: true },
               propsList: [], verrou: { actif: true, sel: 'WlpaWlpaWlpaWlpaWlpa', hash: 'SU5UUlVT' } },
      meta: syncMetaVide()
    })
    eq('S9', 'Une config distante ne remplace pas le verrou local',
       avant, JSON.stringify(setup.verrou))

    // ════════════════════════════════════════════════════════════════════════
    // 2. NORMALISATION — une config douteuse n'est jamais un verrou actif
    // ════════════════════════════════════════════════════════════════════════

    faux('N1', 'null : verrou inactif', verrouNormalise(null).actif)
    faux('N2', 'une chaîne : verrou inactif', verrouNormalise('oui').actif)
    vrai('N3', 'une config complète : verrou actif', verrouNormalise({
      actif: true, sel: 'c2Vs', hash: 'aGFzaA==', iterations: 310000, delaiMinutes: 5
    }).actif)
    faux('N4', 'actif mais sans sel : refusé (écran impossible à lever)',
         verrouNormalise({ actif: true, sel: '', hash: 'aGFzaA==' }).actif)
    faux('N5', 'actif mais sans empreinte : refusé',
         verrouNormalise({ actif: true, sel: 'c2Vs', hash: '' }).actif)
    eq('N6', 'Un nombre d\'itérations trop bas retombe sur la valeur de référence',
       VERROU_ITERATIONS, verrouNormalise({ sel: 'c2Vs', hash: 'aA==', iterations: 10 }).iterations)
    eq('N7', 'Un délai hors de la liste offerte retombe sur 0 (immédiat)',
       0, verrouNormalise({ sel: 'c2Vs', hash: 'aA==', delaiMinutes: 7 }).delaiMinutes)
    eq('N8', 'Un délai offert est conservé',
       15, verrouNormalise({ sel: 'c2Vs', hash: 'aA==', delaiMinutes: 15 }).delaiMinutes)
    eq('N9', 'Un compte de secours qui n\'est pas une chaîne devient null',
       null, verrouNormalise({ sel: 'c2Vs', hash: 'aA==', compte: 42 }).compte)

    // ── Format du code ──
    vrai('C1', '« 1234 » : quatre chiffres acceptés', verrouCodeValide('1234'))
    vrai('C2', '« 12345678 » : huit chiffres acceptés', verrouCodeValide('12345678'))
    faux('C3', '« 123 » : trop court', verrouCodeValide('123'))
    faux('C4', '« 123456789 » : trop long', verrouCodeValide('123456789'))
    faux('C5', '« 12a4 » : une lettre, refusée', verrouCodeValide('12a4'))
    faux('C6', 'Un nombre et non une chaîne : refusé', verrouCodeValide(1234))
    faux('C7', 'Vide : refusé', verrouCodeValide(''))

    // ════════════════════════════════════════════════════════════════════════
    // 3. QUAND REVERROUILLER, ET COMBIEN DE TEMPS ATTENDRE
    // ════════════════════════════════════════════════════════════════════════

    const T0 = 1700000000000
    faux('D1', 'Jamais passé en arrière-plan : on ne verrouille pas',
         verrouDoitVerrouiller(null, T0, 0))
    faux('D2', 'Une date d\'arrière-plan illisible : on ne verrouille pas',
         verrouDoitVerrouiller('hier', T0, 0))
    vrai('D3', 'Délai immédiat : on verrouille dès le retour',
         verrouDoitVerrouiller(T0, T0 + 1, 0))
    faux('D4', 'Délai de 5 min, 4 min écoulées : on ne verrouille pas',
         verrouDoitVerrouiller(T0, T0 + 4 * 60000, 5))
    vrai('D5', 'Délai de 5 min, 5 min pile : on verrouille',
         verrouDoitVerrouiller(T0, T0 + 5 * 60000, 5))
    vrai('D6', 'Délai de 15 min, 20 min écoulées : on verrouille',
         verrouDoitVerrouiller(T0, T0 + 20 * 60000, 15))
    vrai('D7', 'Une horloge qui recule n\'empêche pas le verrou immédiat',
         verrouDoitVerrouiller(T0, T0 - 60000, 0))

    eq('T1', 'Aucun échec : aucune attente', 0, verrouAttenteMs(0))
    eq('T2', 'Deux échecs : aucune attente (un code se tape d\'une main)', 0, verrouAttenteMs(2))
    eq('T3', 'Trois échecs : 5 s', 5000, verrouAttenteMs(3))
    eq('T4', 'Quatre échecs : 15 s', 15000, verrouAttenteMs(4))
    eq('T5', 'Six échecs : 5 min', 300000, verrouAttenteMs(6))
    eq('T6', 'Cinquante échecs : plafonné à 5 min', 300000, verrouAttenteMs(50))
    eq('T7', 'Un nombre d\'échecs absurde ne produit pas NaN', 0, verrouAttenteMs('bonjour'))

    // ── Comparaison à temps constant ──
    vrai('E1', 'Deux empreintes identiques', verrouEgalConstant('abcdef', 'abcdef'))
    faux('E2', 'Deux empreintes de même longueur qui diffèrent', verrouEgalConstant('abcdef', 'abcdeg'))
    faux('E3', 'Un préfixe n\'est pas une égalité', verrouEgalConstant('abc', 'abcdef'))
    faux('E4', 'Une chaîne plus longue n\'est pas une égalité', verrouEgalConstant('abcdef', 'abc'))
    vrai('E5', 'Deux vides sont égaux', verrouEgalConstant('', ''))
    faux('E6', 'null face à une empreinte', verrouEgalConstant(null, 'abc'))

    // ════════════════════════════════════════════════════════════════════════
    // 4. L'EMPREINTE PBKDF2
    // ════════════════════════════════════════════════════════════════════════

    vrai('P1', 'crypto.subtle est disponible dans cette page', verrouDisponible())

    // Itérations réduites pour les tests : ce qui est vérifié ici, c'est le
    // comportement de la dérivation, pas son coût.
    const IT = 1000
    const sel1 = 'AQIDBAUGBwgJCgsMDQ4PEA=='
    const sel2 = 'EBAPDg0MCwoJCAcGBQQDAg=='

    const h1 = await verrouHacher('1234', sel1, IT)
    const h1bis = await verrouHacher('1234', sel1, IT)
    const hAutreSel = await verrouHacher('1234', sel2, IT)
    const hAutreCode = await verrouHacher('1235', sel1, IT)
    const hAutreIt = await verrouHacher('1234', sel1, IT * 2)

    eq('P2', 'Même code, même sel, mêmes itérations : même empreinte', h1, h1bis)
    faux('P3', 'Un sel différent donne une empreinte différente', h1 === hAutreSel)
    faux('P4', 'Un chiffre de plus dans le code change l\'empreinte', h1 === hAutreCode)
    faux('P5', 'Un autre nombre d\'itérations change l\'empreinte', h1 === hAutreIt)
    eq('P6', 'L\'empreinte fait 256 bits (44 caractères en base64)', 44, h1.length)

    const selA = verrouNouveauSel(), selB = verrouNouveauSel()
    eq('P7', 'Un sel neuf fait 16 octets', 16, verrouDeB64(selA).length)
    faux('P8', 'Deux sels neufs diffèrent (ils sont tirés au hasard)', selA === selB)

    // Aller-retour complet, tel que le vit `verrouEssayer` : on pose un code,
    // puis on vérifie qu'il ouvre et qu'un autre n'ouvre pas.
    const selReel = verrouNouveauSel()
    const hashReel = await verrouHacher('482913', selReel, VERROU_ITERATIONS)
    verrouEnregistrer({ actif: true, sel: selReel, hash: hashReel,
                        iterations: VERROU_ITERATIONS, delaiMinutes: 0, compte: null })
    const conf = verrouConf()
    vrai('P9', 'Le verrou enregistré se relit comme actif', conf.actif)
    vrai('P10', 'Le bon code ouvre',
         verrouEgalConstant(await verrouHacher('482913', conf.sel, conf.iterations), conf.hash))
    faux('P11', 'Un code voisin n\'ouvre pas',
         verrouEgalConstant(await verrouHacher('482914', conf.sel, conf.iterations), conf.hash))

    // ════════════════════════════════════════════════════════════════════════
    // 5. L'ÉCRAN ET L'INSTALLATION DU MODULE
    // ════════════════════════════════════════════════════════════════════════

    verrouPoser()
    const ecran = document.getElementById('verrou-ecran')
    vrai('U1', 'Poser le verrou affiche l\'écran', !!ecran && ecran.classList.contains('open'))
    // L'écran opaque suffit à l'œil ; `inert` est ce qui empêche d'atteindre
    // les montants au clavier ou au lecteur d'écran.
    const corps = Array.prototype.filter.call(document.body.children, el => el.id !== 'verrou-ecran')
    vrai('U2', 'Le reste de la page devient inerte',
         corps.length > 0 && corps.every(el => el.hasAttribute('inert')))
    vrai('U3', 'La page derrière ne peut plus défiler (molette comprise)',
         document.documentElement.classList.contains('verrou-pose'))
    verrouLever()
    faux('U4', 'Lever le verrou masque l\'écran', ecran.classList.contains('open'))
    faux('U5', 'Le défilement de la page est rendu',
         document.documentElement.classList.contains('verrou-pose'))
    vrai('U6', 'Le reste de la page redevient actif',
         corps.every(el => !el.hasAttribute('inert')))

    const mod = moduleById('verrou')
    vrai('M1', 'Le module verrou est bien enregistré', !!mod)
    faux('M2', 'Il ne porte pas de libellé : il n\'a pas d\'écran à lui, et ne '
       + 'compte donc pas parmi les modules fiscaux', !!(mod && mod.label))

  } catch (e) {
    erreurFatale = (e && e.message) || String(e)
  } finally {
    // L'état réel revient en place même si la suite s'interrompt : `saveSetup`
    // écrit dans localStorage dès la première activation de test.
    setup = backup.setup
    setupMeta = backup.meta
    try { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)) } catch (e) {}
    try { localStorage.setItem(SETUP_META_KEY, JSON.stringify(setupMeta)) } catch (e) {}
    try { verrouLever() } catch (e) {}
    try { applyModules(); refreshAll() } catch (e) {}
  }

  if (erreurFatale) {
    results.push({ id: 'FATAL', titre: 'La suite s\'est interrompue avant la fin',
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
