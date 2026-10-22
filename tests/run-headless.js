#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// run-headless.js — exécute les deux suites de tests SANS navigateur (§ E.3)
//
// Avant, il fallait servir l'app, l'ouvrir, et coller chaque suite dans la
// console. Deux conséquences : les tests n'étaient jamais lancés « en passant »,
// et ils tournaient dans un vrai navigateur, donc sur un localStorage réel —
// une suite interrompue pouvait écrire sa fixture par-dessus de vraies données.
//
// Ici, chaque suite tourne dans sa propre page jsdom, dont le localStorage est
// en mémoire : AUCUN risque pour les données de l'utilisateur, et un code de
// sortie exploitable par un CI.
//
// Usage :
//   node tests/run-headless.js            → les deux suites
//   node tests/run-headless.js socle      → pwa_suite.js seule
//   node tests/run-headless.js modules    → pwa_modules_suite.js seule
//   npm test                              → identique, après `npm install`
//
// Ce que ce lanceur NE remplace PAS : le parcours d'interface réel (gestes,
// impression PDF, service worker, OCR, Firebase). Ces vérifications restent
// manuelles, décrites au § 2 de docs/TESTS.md.
// ════════════════════════════════════════════════════════════════════════════
'use strict'

const fs = require('fs')
const path = require('path')

// Le montage de la page jsdom vit dans page-jsdom.js : `export-parite.js` monte
// la même page pour recueillir les valeurs de référence du portage iOS, et deux
// copies des prothèses de navigateur auraient fini par diverger.
const { PWA, executer } = require('./page-jsdom')

// ── Vérifications que seul un lanceur hors page peut faire ─────────────────
// La version vit à six endroits (voir scripts/version.sh). La suite, exécutée
// DANS la page, ne peut lire ni sw.js ni manifest.json de façon synchrone.
function verifierVersion() {
  const html = fs.readFileSync(path.join(PWA, 'index.html'), 'utf8')
  const m = html.match(/^const APP_VERSION = '([0-9.]+)'/m)
  if (!m) return [{ id: 'V0', titre: 'APP_VERSION trouvée dans index.html', ok: false, obtenu: 'absente' }]
  const v = m[1]
  const sw = fs.readFileSync(path.join(PWA, 'sw.js'), 'utf8')
  const mf = fs.readFileSync(path.join(PWA, 'manifest.json'), 'utf8')
  const pkg = fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')
  const balises = html.match(/^<script src="js\/[^"]+"><\/script>/gm) || []
  const aJour = balises.filter(b => b.includes('?v=' + v))
  return [
    { id: 'V1', titre: `Le cache du service worker porte la version (depenses-${v})`,
      ok: sw.includes(`const CACHE = 'depenses-${v}'`), obtenu: (sw.match(/const CACHE = '[^']*'/) || [])[0] },
    { id: 'V2', titre: `manifest.json porte la version ${v}`,
      ok: mf.includes(`"version": "${v}"`), obtenu: (mf.match(/"version": "[^"]*"/) || [])[0] },
    { id: 'V3', titre: `Les ${balises.length} balises de module portent ?v=${v}`,
      ok: balises.length > 0 && aJour.length === balises.length,
      obtenu: aJour.length + '/' + balises.length },
    { id: 'V4', titre: `package.json porte la version ${v}`,
      ok: pkg.includes(`"version": "${v}"`), obtenu: (pkg.match(/"version": "[^"]*"/) || [])[0] }
  ]
}

const quoi = (process.argv[2] || '').toLowerCase()
const suites = []
if (!quoi || quoi === 'socle') suites.push(['socle (index.html)', 'pwa_suite.js'])
if (!quoi || quoi === 'modules') suites.push(['modules (pwa_2026/js/)', 'pwa_modules_suite.js'])
if (!quoi || quoi === 'sync') suites.push(['synchronisation (Firestore factice)', 'pwa_sync_suite.js'])
if (!suites.length) { console.error('✖ Usage : node tests/run-headless.js [socle|modules|sync]'); process.exit(2) }

let echecTotal = 0
console.log('')
const vers = verifierVersion()
console.log('── Cohérence de la version ' + '─'.repeat(44))
vers.forEach(v => {
  console.log(`  ${v.ok ? '✔' : '✖'} ${v.id}  ${v.titre}` + (v.ok ? '' : `\n       obtenu : ${v.obtenu}`))
  if (!v.ok) echecTotal++
})

// `require` et un `await` de premier niveau ne cohabitent pas dans un fichier
// que Node doit classer : d'où cette fonction.
async function principal() {
for (const [nom, fichier] of suites) {
  console.log('')
  console.log('── Suite ' + nom + ' ' + '─'.repeat(Math.max(2, 60 - nom.length)))
  const { res, erreurs, modules } = await executer(fichier)
  if (!res) {
    console.log('  ✖ la suite n\'a rien retourné')
    erreurs.forEach(e => console.log('    ' + e))
    echecTotal++
    continue
  }
  console.log(`  ${modules} modules chargés · ${res.pass}/${res.total} assertions`)
  res.echecs.forEach(e => {
    console.log(`  ✖ ${e.id}  ${e.titre}`)
    console.log(`       attendu : ${JSON.stringify(e.attendu)}`)
    console.log(`       obtenu  : ${JSON.stringify(e.obtenu)}`)
  })
  // Une exception dans un render() est rattrapée par l'app et seulement
  // journalisée : sans cette remontée, un panneau cassé passerait inaperçu.
  erreurs.filter(e => !e.includes('stub')).forEach(e => console.log('  ⚠ ' + e))
  echecTotal += res.fail
}

console.log('')
if (echecTotal === 0) { console.log('✔ Tout est vert.'); process.exit(0) }
console.log(`✖ ${echecTotal} échec(s).`)
process.exit(1)
}

principal().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1) })
