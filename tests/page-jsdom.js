// ════════════════════════════════════════════════════════════════════════════
// page-jsdom.js — MONTER LA PWA DANS UNE PAGE JSDOM
//
// Extrait de run-headless.js quand un second outil a eu besoin de la même
// page : `export-parite.js`, qui exécute la suite de modules pour en recueillir
// les valeurs de référence du portage iOS. Dupliquer le montage aurait fait
// dériver deux copies des prothèses de navigateur — et donc deux pages
// subtilement différentes, ce qui est exactement ce qu'une suite de tests ne
// doit pas tolérer.
//
// Ce fichier ne contient AUCUNE assertion : il monte la page, exécute un script
// dedans, et rend ce que ce script a retourné.
// ════════════════════════════════════════════════════════════════════════════
'use strict'

const fs = require('fs')
const path = require('path')

const RACINE = path.resolve(__dirname, '..')
const PWA = path.join(RACINE, 'pwa_2026')

let JSDOM, VirtualConsole
try { ({ JSDOM, VirtualConsole } = require('jsdom')) }
catch (e) {
  console.error('✖ jsdom est absent. Installez-le :  npm install')
  console.error('  (devDependency : rien n\'est ajouté à l\'application elle-même.)')
  process.exit(2)
}

// ── Prothèses du navigateur ────────────────────────────────────────────────
// jsdom n'implémente ni matchMedia (lu par applyTheme), ni le contexte canvas,
// ni createObjectURL. Les stubs Firebase évitent trois requêtes réseau et un
// `firebase is not defined` : la synchronisation n'est pas l'objet des suites.
const PROTHESES = `<script>
window.matchMedia = window.matchMedia || function (q) {
  return { matches: false, media: q, addEventListener(){}, removeEventListener(){},
           addListener(){}, removeListener(){} }
}
if (!window.URL.createObjectURL) window.URL.createObjectURL = () => 'blob:stub'
if (!window.URL.revokeObjectURL) window.URL.revokeObjectURL = () => {}
HTMLCanvasElement.prototype.getContext = HTMLCanvasElement.prototype.getContext || function () { return null }
window.firebase = {
  initializeApp: () => ({}),
  auth: Object.assign(
    () => ({ onAuthStateChanged() {}, signInWithPopup() { return Promise.reject(new Error('stub')) },
             signOut() { return Promise.resolve() } }),
    { GoogleAuthProvider: function () {} }),
  firestore: Object.assign(
    () => ({ collection: () => ({ doc: () => ({ set() { return Promise.resolve() },
                                                get() { return Promise.resolve({ exists: false }) } }) }) }),
    { FieldValue: { serverTimestamp: () => 'ts' } })
}
</script>`

// Les modules sont des scripts CLASSIQUES qui partagent la portée globale de la
// page. Plutôt que de dépendre du chargeur de ressources de jsdom — dont l'API
// a changé de version en version — on remplace chaque balise par son code,
// inliné à la MÊME position : l'ordre d'exécution est donc identique à celui du
// navigateur, ce qui compte puisque l'inline script final appelle init().
// L'attribut data-module-src conserve la trace du ?v=, que la suite vérifie.
function pagePreparee() {
  let html = fs.readFileSync(path.join(PWA, 'index.html'), 'utf8')
  html = html.replace(/<script src="https:\/\/www\.gstatic\.com\/firebasejs[^"]*"><\/script>\s*/g, '')
  html = html.replace('</head>', PROTHESES + '\n</head>')
  let n = 0
  html = html.replace(/<script src="(js\/[^"]+)"><\/script>/g, (m, src) => {
    const code = fs.readFileSync(path.join(PWA, src.split('?')[0]), 'utf8')
    n++
    return `<script data-module-src="${src}">\n${code}\n</script>`
  })
  if (!n) { console.error('✖ Aucune balise <script src="js/…"> trouvée dans index.html'); process.exit(2) }
  return { html, modules: n }
}

// Asynchrone pour une seule raison : la suite de synchronisation fait des
// allers-retours `await` vers son Firestore de pacotille, et la fenêtre jsdom ne
// doit pas se fermer avant qu'ils soient finis. Une suite synchrone passe par le
// même chemin sans rien changer — `await` sur une valeur n'attend personne.
async function executer(fichierSuite) {
  const { html, modules } = pagePreparee()
  const erreurs = []
  const vc = new VirtualConsole()
  vc.on('jsdomError', e => erreurs.push('jsdomError: ' + e.message))
  vc.on('error', (...a) => erreurs.push('console.error: ' + a.map(String).join(' ').slice(0, 300)))

  const dom = new JSDOM(html, {
    url: 'http://localhost/index.html',   // une origine non opaque : localStorage disponible
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc
  })

  const w = dom.window
  const suite = fs.readFileSync(path.join(RACINE, 'tests', fichierSuite), 'utf8')
  let res
  try { res = await w.eval(suite) } catch (e) { res = null; erreurs.push('exception: ' + e.message) }
  dom.window.close()
  return { res, erreurs, modules }
}

module.exports = { RACINE, PWA, pagePreparee, executer }
