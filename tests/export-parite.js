#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// export-parite.js — RELEVER LA RÉFÉRENCE DE PARITÉ POUR LE PORTAGE iOS
//
// Le portage Swift (ios_2026/RevenusDepenses/Core/) doit produire EXACTEMENT
// les mêmes nombres que les modules de la PWA. Retaper les attendus à la main
// dans une suite Swift aurait créé une troisième vérité : si un barème change,
// trois endroits à corriger, et deux occasions de se tromper.
//
// Alors on exécute la vraie suite de modules dans sa page jsdom, et on écrit
// dans un JSON ce qu'elle a mesuré au passage (son champ `parite`). La suite
// Swift rejoue ce JSON. Ce que compare la parité n'est donc pas « Swift contre
// des nombres écrits par Claude », mais « Swift contre ce que la PWA fait ».
//
// Usage :
//   node tests/export-parite.js        → ios_2026/Tests/Parity/parite-vague1.json
//   npm run parite:export              → identique
//
// À relancer quand un barème de fiscal-data.js change, quand la fixture de la
// suite change, ou quand une fonction portée change de comportement — puis
// `npm run parite` pour vérifier que le Swift suit.
// ════════════════════════════════════════════════════════════════════════════
'use strict'

const fs = require('fs')
const path = require('path')
const { RACINE, executer } = require('./page-jsdom')

const SORTIE = path.join(RACINE, 'ios_2026', 'Tests', 'Parity', 'parite-vague1.json')

async function principal() {
  const { res, erreurs } = await executer('pwa_modules_suite.js')
  if (!res) {
    console.error('✖ la suite de modules n\'a rien retourné')
    erreurs.forEach(e => console.error('  ' + e))
    process.exit(1)
  }
  // Une référence relevée sur une suite en échec ne vaut rien : elle figerait
  // le bug dans le JSON, et la parité Swift le reproduirait fidèlement.
  if (res.fail) {
    console.error(`✖ ${res.fail} assertion(s) en échec : la référence n'est pas relevée.`)
    res.echecs.forEach(e => console.error(`  ${e.id}  ${e.titre}`))
    process.exit(1)
  }
  if (!res.parite) {
    console.error('✖ la suite ne renvoie pas de champ `parite` (voir tests/pwa_modules_suite.js)')
    process.exit(1)
  }

  const ref = Object.assign({
    _genere: 'tests/export-parite.js — NE PAS MODIFIER À LA MAIN',
    _source: 'tests/pwa_modules_suite.js (champ `parite`), ' + res.total + ' assertions vertes',
    _date: new Date().toISOString().slice(0, 10)
  }, res.parite)

  fs.mkdirSync(path.dirname(SORTIE), { recursive: true })
  fs.writeFileSync(SORTIE, JSON.stringify(ref, null, 2) + '\n', 'utf8')

  const sections = Object.keys(res.parite).filter(k => k[0] !== '_')
  console.log('')
  console.log('✔ Référence de parité relevée sur ' + res.total + ' assertions vertes.')
  console.log('  ' + sections.length + ' sections : ' + sections.join(', '))
  console.log('  → ' + path.relative(RACINE, SORTIE) +
              ' (' + (fs.statSync(SORTIE).size / 1024).toFixed(1) + ' Ko)')
  console.log('')
}

principal().catch(e => { console.error('✖ ' + (e && e.stack || e)); process.exit(1) })
