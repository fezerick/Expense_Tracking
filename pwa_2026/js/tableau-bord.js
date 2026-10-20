// ════════════════════════════════════════════════════════════════════════════
// tableau-bord.js — TABLEAU DE BORD PLURIANNUEL
//
// Chaque année vit dans sa propre clé localStorage, et l'app n'en affichait
// qu'une : impossible de voir qu'une dépense d'entretien a doublé, ou qu'un
// logement est resté vacant deux mois de plus que l'an dernier.
//
// C'est aussi le premier document à présenter en cas de question du fisc : une
// série de cinq ans cohérente vaut mieux qu'une année isolée.
//
// Les graphiques sont en SVG écrit à la main, sans bibliothèque : une page qui
// doit fonctionner hors ligne ne peut pas dépendre d'un CDN pour afficher une
// barre.
// ════════════════════════════════════════════════════════════════════════════

// Totaux d'un immeuble calculés sur un état QUELCONQUE (pas forcément l'année
// active). propTotals() de index.html lit `state` directement et ne peut donc
// pas servir ici.
function totauxPropDansEtat(st, prop, kmRate) {
  const bloc = st[prop.id] || {}
  const somme = (section, cat) => {
    const d = (bloc[section] || {})[cat] || []
    return d.reduce((s, v) => s + num(v), 0)
  }
  const rev = (prop.revenus || []).reduce((s, c) => s + somme('revenus', c), 0)
  const dep = (prop.deductibles || []).reduce((s, c) => {
    if (c === 'Frais de déplacement') {
      // Ce poste est alimenté par le journal de trajets, pas par des cellules.
      const km = (st.trips || []).filter(t => t.property === prop.id)
        .reduce((ss, t) => ss + num(t.km), 0)
      return s + km * kmRate
    }
    return s + somme('deductibles', c)
  }, 0)
  const cap = (prop.capital || []).reduce((s, c) => s + somme('capital', c), 0)
  return { rev, dep, cap, net: rev - dep }
}

function totauxAnnee(year) {
  const st = readYear(year)
  if (!st) return null
  const kmRate = num(st.settings && st.settings.mileageRate) || 0.72
  const parProp = propsList().map(p => ({ prop: p, t: totauxPropDansEtat(st, p, kmRate) }))
  const rev = parProp.reduce((s, x) => s + x.t.rev, 0)
  const dep = parProp.reduce((s, x) => s + x.t.dep, 0)
  const cap = parProp.reduce((s, x) => s + x.t.cap, 0)

  // Course : uberNetIncome() d'index.html lit `state` ; on applique la MÊME
  // définition à `st` (courses hors taxes des passagers + autres revenus − frais),
  // pour que l'historique ne contredise pas l'écran de l'année active.
  const uv = k => num((st.uber || {})[k])
  const uberRev = UBER_GROUPS[0][1].filter(([k]) => !k.startsWith('gst') && !k.startsWith('qst'))
      .reduce((s, [k]) => s + uv(k), 0)
    + UBER_GROUPS[2][1].reduce((s, [k]) => s + uv(k), 0)
  const uberFrais = uv('service_fee') + uv('other_fees') - uv('fee_discount')
  const uberNet = uberRev - uberFrais
  const lyftNet = Array.from({ length: 12 }, (_, mi) => (st.lyft || [])[mi] || {})
    .reduce((s, m) => s + num(m.taxable) + num(m.bonuses) + num(m.tips) - num(m.fees), 0)
  const vehDep = VEH_CATS.reduce((s, c) => s + num((st.vehicule || {}).depenses ? st.vehicule.depenses[c] : 0), 0)
  const kmTotal = num(st.settings && st.settings.kmTotalAnnuel)
  const kmUber = uv('km_online')
  const kmLyft = Array.from({ length: 12 }, (_, mi) => (st.lyft || [])[mi] || {}).reduce((s, m) => s + num(m.km), 0)
  const partCourse = kmTotal > 0 ? (kmUber + kmLyft) / kmTotal : 0
  const vehDeduit = vehDep * partCourse

  const dpa = (() => {
    try { const d = calculDPA(year, true); return d ? d.total : 0 } catch (e) { return 0 }
  })()

  return {
    year, st, parProp, rev, dep, cap, net: rev - dep,
    uberNet, lyftNet, vehDep, vehDeduit, partCourse, kmTotal,
    dpa, netApresDPA: rev - dep - dpa,
    courseNet: uberNet + lyftNet - vehDeduit,
    cloturee: !!st.closed
  }
}

function seriesPluriannuelles() {
  return anneesDisponibles().slice().sort((a, b) => a - b)
    .map(y => totauxAnnee(y)).filter(Boolean)
}

// ── DÉTECTION D'ANOMALIES ──────────────────────────────────────────────────
// Deux années suffisent : on compare poste par poste, immeuble par immeuble, et
// on ne signale que ce qui est à la fois RELATIVEMENT grand (facteur) et
// ABSOLUMENT significatif (dollars). Sans le second critère, un poste passé de
// 12 $ à 40 $ remonterait en tête de liste.
function anomaliesPluriannuelles(series) {
  const out = []
  if (series.length < 2) return out
  const SEUIL_FACTEUR = 1.75, SEUIL_DOLLARS = 400

  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1], b = series[i]
    propsList().forEach(prop => {
      ;['deductibles', 'capital'].forEach(section => {
        (prop[section] || []).forEach(cat => {
          const va = ((a.st[prop.id] || {})[section] || {})[cat] || []
          const vb = ((b.st[prop.id] || {})[section] || {})[cat] || []
          const sa = va.reduce((s, v) => s + num(v), 0)
          const sb = vb.reduce((s, v) => s + num(v), 0)
          const ecart = sb - sa
          if (Math.abs(ecart) < SEUIL_DOLLARS) return
          if (sa > 0 && sb / sa >= SEUIL_FACTEUR) {
            out.push({ an: b.year, type: 'hausse', prop: shortLabel(prop.label), cat,
              avant: sa, apres: sb, ecart,
              texte: `${shortLabel(prop.label)} — « ${cat} » passe de ${money(sa)} à ${money(sb)} (×${fmt(sb / sa, 1)})` })
          } else if (sb === 0 && sa >= SEUIL_DOLLARS) {
            out.push({ an: b.year, type: 'disparu', prop: shortLabel(prop.label), cat,
              avant: sa, apres: 0, ecart,
              texte: `${shortLabel(prop.label)} — « ${cat} » était de ${money(sa)} et n’apparaît plus. Oubli de saisie ?` })
          }
        })
      })

      // Vacance : un logement qui encaissait un loyer et n'en encaisse plus.
      ;(prop.revenus || []).forEach(u => {
        const va = ((a.st[prop.id] || {}).revenus || {})[u] || []
        const vb = ((b.st[prop.id] || {}).revenus || {})[u] || []
        const moisA = va.filter(v => num(v) > 0).length
        const moisB = vb.filter(v => num(v) > 0).length
        if (moisA >= 10 && moisB <= moisA - 2) {
          out.push({ an: b.year, type: 'vacance', prop: shortLabel(prop.label), cat: u,
            avant: moisA, apres: moisB, ecart: 0,
            texte: `${shortLabel(prop.label)} — « ${u} » : ${moisB} mois de loyer contre ${moisA} l’an précédent (${moisA - moisB} mois de vacance ou de loyer non saisi).` })
        }
      })
    })
  }
  return out.sort((a, b) => (b.an - a.an) || (Math.abs(b.ecart) - Math.abs(a.ecart)))
}

// ── GRAPHIQUE EN BARRES (SVG) ──────────────────────────────────────────────
function barresSVG(points, options = {}) {
  if (!points.length) return ''
  const W = 320, H = 150, pb = 22, pt = 14
  const max = Math.max(1, ...points.map(p => Math.abs(p.valeur)))
  const aNegatif = points.some(p => p.valeur < 0)
  const zero = aNegatif ? pt + (H - pt - pb) / 2 : H - pb
  const hDispo = aNegatif ? (H - pt - pb) / 2 : H - pt - pb
  const lg = Math.min(44, (W - 16) / points.length - 8)
  const pas = (W - 16) / points.length

  const barres = points.map((p, i) => {
    const h = Math.abs(p.valeur) / max * hDispo
    const x = 8 + i * pas + (pas - lg) / 2
    const y = p.valeur >= 0 ? zero - h : zero
    const couleur = p.couleur || (p.valeur >= 0 ? '#2E7D32' : '#C62828')
    return `<rect x="${fmt(x, 1)}" y="${fmt(y, 1)}" width="${fmt(lg, 1)}" height="${fmt(Math.max(1, h), 1)}"
        fill="${couleur}" rx="2"></rect>
      <text x="${fmt(x + lg / 2, 1)}" y="${fmt(p.valeur >= 0 ? y - 3 : y + h + 10, 1)}"
        font-size="8" fill="#666" text-anchor="middle">${p.etiquette || ''}</text>
      <text x="${fmt(x + lg / 2, 1)}" y="${H - 8}" font-size="9" fill="#888" text-anchor="middle">${p.nom}</text>`
  }).join('')

  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block">
    <line x1="4" y1="${fmt(zero, 1)}" x2="${W - 4}" y2="${fmt(zero, 1)}" stroke="#ddd" stroke-width="1"></line>
    ${barres}
  </svg>${options.legende ? sourceNote(options.legende) : ''}`
}

// ── AFFICHAGE ──────────────────────────────────────────────────────────────
function renderTableauBord() {
  const el = document.getElementById('bord-body')
  if (!el) return
  const series = seriesPluriannuelles()

  if (series.length < 2) {
    el.innerHTML = card('📈 Tableau de bord pluriannuel',
      infoBox(`Une seule année de données (${activeYear}). Le tableau de bord compare les années
        entre elles : il s’activera à la création d’une deuxième année
        (<strong>Réglages → Années</strong>).`), 'blue')
    return
  }

  const anomalies = anomaliesPluriannuelles(series)
  const derniere = series[series.length - 1]
  const avant = series[series.length - 2]
  const delta = (a, b) => {
    const d = b - a
    const signe = d >= 0 ? '+' : '−'
    const pct = a !== 0 ? ` (${signe}${fmt(Math.abs(d / a) * 100, 0)} %)` : ''
    return `<span style="color:${d >= 0 ? 'var(--green)' : '#C62828'}">${signe}${money(Math.abs(d))}${pct}</span>`
  }

  const lignes = series.slice().reverse().map(s => tr([
    `${s.year}${s.cloturee ? ' 🔒' : ''}${s.year === activeYear ? ' <strong>•</strong>' : ''}`,
    [money(s.rev), 'right'],
    [money(s.dep), 'right'],
    [money(s.dpa), 'right'],
    [`<strong>${money(s.netApresDPA)}</strong>`, 'right',
     s.netApresDPA < 0 ? 'color:#C62828' : 'color:var(--green)'],
    [money(s.courseNet), 'right'],
    [money(s.cap), 'right']
  ], s.year === activeYear ? 'total-tr' : ''))

  // Évolution par immeuble : une ligne par immeuble, une colonne par année.
  const ans = series.map(s => s.year)
  const lignesProp = propsList().map(p => tr([
    `${propIcon(p)} ${escH(shortLabel(p.label))}`,
    ...series.map(s => {
      const t = (s.parProp.find(x => x.prop.id === p.id) || {}).t || { net: 0 }
      return [money(t.net, 0), 'right', t.net < 0 ? 'color:#C62828' : '']
    })
  ]))

  el.innerHTML = `
    ${card('📈 Évolution — ' + series[0].year + ' à ' + derniere.year, `
      <div class="summary-row">
        ${sumCard('Bénéfice net ' + derniere.year, money(derniere.netApresDPA),
          derniere.netApresDPA >= 0 ? 'green' : 'orange', 'après DPA')}
        ${sumCard('Variation', delta(avant.netApresDPA, derniere.netApresDPA), 'blue',
          'contre ' + avant.year)}
      </div>
      ${barresSVG(series.map(s => ({
        nom: String(s.year), valeur: Math.round(s.netApresDPA),
        etiquette: fmt(s.netApresDPA / 1000, 1) + 'k'
      })), { legende: 'Bénéfice net locatif après DPA, en milliers de dollars.' })}
    `, 'blue')}

    ${card('🧾 Par année', table(
      ['Année', ['Revenus', 'right'], ['Dépenses', 'right'], ['DPA', 'right'],
       ['Net locatif', 'right'], ['Course nette', 'right'], ['Capital', 'right']],
      lignes), 'dark')}

    ${propsList().length > 1 ? card('🏘 Bénéfice net par immeuble', table(
      ['Immeuble', ...ans.map(a => [String(a), 'right'])], lignesProp) +
      sourceNote('Revenus moins dépenses déductibles, avant DPA. Les travaux capitalisés ne sont pas déduits ici.'), 'dark') : ''}

    ${card('🚗 Revenus de course', `
      ${barresSVG(series.map(s => ({
        nom: String(s.year), valeur: Math.round(s.courseNet), couleur: '#E65100',
        etiquette: fmt(s.courseNet / 1000, 1) + 'k'
      })), { legende: 'Revenus Uber et Lyft nets, moins la part d’affaires des frais de véhicule.' })}
      ${table(['Année', ['Uber net', 'right'], ['Lyft net', 'right'], ['Frais véhicule déduits', 'right'], ['Part affaires', 'right']],
        series.slice().reverse().map(s => tr([String(s.year),
          [money(s.uberNet), 'right'], [money(s.lyftNet), 'right'],
          [money(s.vehDeduit), 'right'], [fmt(s.partCourse * 100, 1) + ' %', 'right']])))}
    `, 'brown')}

    ${anomalies.length ? card(`🔍 Écarts à expliquer — ${anomalies.length}`, `
      ${infoBox(`Ce ne sont pas des erreurs : ce sont les écarts qu’un vérificateur remarquerait
        d’abord, et pour lesquels il vaut mieux avoir la facture sous la main.`)}
      ${table(['Année', 'Écart'], anomalies.slice(0, 25).map(a => tr([
        String(a.an),
        `${a.type === 'hausse' ? '📈' : a.type === 'disparu' ? '❓' : '🏚'} ${escH(a.texte)}`
      ])))}
      ${anomalies.length > 25 ? sourceNote(`${anomalies.length - 25} écart(s) de plus, non affichés.`) : ''}
    `, 'brown') : card('✅ Écarts', infoBox('Aucun écart notable d’une année à l’autre.'), 'green')}

    ${card('📤 Exporter', `
      <button class="btn btn-ghost btn-sm btn-full" onclick="exporterPluriannuel()">
        📊 Série pluriannuelle (CSV)</button>
    `, 'dark')}`
}

function exporterPluriannuel() {
  const series = seriesPluriannuelles()
  const L = [csvLigne(['Annee', 'Revenus locatifs', 'Depenses locatives', 'DPA reclamee',
    'Net locatif apres DPA', 'Capital', 'Uber net', 'Lyft net', 'Frais vehicule',
    'Part affaires (%)', 'Course nette', 'Cloturee'])]
  series.forEach(s => L.push(csvLigne([s.year, fmt(s.rev), fmt(s.dep), fmt(s.dpa),
    fmt(s.netApresDPA), fmt(s.cap), fmt(s.uberNet), fmt(s.lyftNet), fmt(s.vehDep),
    fmt(s.partCourse * 100, 2), fmt(s.courseNet), s.cloturee ? 'oui' : 'non'])))
  L.push('')
  L.push(csvLigne(['Immeuble', ...series.map(s => s.year)]))
  propsList().forEach(p => L.push(csvLigne([shortLabel(p.label),
    ...series.map(s => fmt(((s.parProp.find(x => x.prop.id === p.id) || {}).t || { net: 0 }).net))])))
  const an = anomaliesPluriannuelles(series)
  if (an.length) {
    L.push('', csvLigne(['Annee', 'Type', 'Immeuble', 'Poste', 'Avant', 'Apres']))
    an.forEach(a => L.push(csvLigne([a.an, a.type, a.prop, a.cat, fmt(a.avant), fmt(a.apres)])))
  }
  dl(`evolution_pluriannuelle_${activeYear}.csv`, '﻿' + L.join('\n'), 'text/csv;charset=utf-8')
  toast('📊 Série exportée')
}

registerModule({
  id: 'tableau-bord',
  label: 'Tableau de bord pluriannuel',
  render: renderTableauBord
})
