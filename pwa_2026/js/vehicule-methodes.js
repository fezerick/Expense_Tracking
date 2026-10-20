// ════════════════════════════════════════════════════════════════════════════
// vehicule-methodes.js — MÉTHODE 1 (frais réels) CONTRE MÉTHODE 2 (taux/km)
//
// L'application détenait déjà les deux jeux de données et n'en calculait qu'un :
// les frais réels prorata km pour Uber/Lyft (méthode 1) et le taux par km pour
// les déplacements locatifs (méthode 2). Résultat : deux activités du MÊME
// véhicule étaient traitées selon deux méthodes différentes, ce qui n'est pas
// défendable devant l'ARC, et personne ne voyait laquelle était la meilleure.
//
// Ce module calcule les deux pour l'ensemble des km d'affaires et affiche
// l'écart en dollars.
// ════════════════════════════════════════════════════════════════════════════

function vehDepensesTotal() {
  return VEH_CATS.reduce((s, c) => s + num(state.vehicule.depenses[c]), 0)
}

// Renvoie le détail complet de la comparaison.
function comparerMethodesVehicule() {
  const f = fiscal()
  const kmTotal  = num(state.settings.kmTotalAnnuel)
  const kmUber   = num(state.uber.km_online)
  const kmLyft   = getLyftKmTotal()
  const kmLoc    = getRentalKmTotal()
  const kmAff    = kmUber + kmLyft + kmLoc
  const fraisReels = vehDepensesTotal()

  // ── Méthode 1 : frais réels au prorata de l'usage d'affaires ──
  const prorata = kmTotal > 0 ? kmAff / kmTotal : 0
  const m1 = {
    total: fraisReels * prorata,
    uber:  kmTotal > 0 ? fraisReels * kmUber / kmTotal : 0,
    lyft:  kmTotal > 0 ? fraisReels * kmLyft / kmTotal : 0,
    loc:   kmTotal > 0 ? fraisReels * kmLoc  / kmTotal : 0
  }

  // ── Méthode 2 : taux par kilomètre, paliers appliqués au TOTAL des km
  // d'affaires (les paliers sont annuels et par personne, pas par activité :
  // les répartir activité par activité gonflerait artificiellement le premier
  // palier autant de fois qu'il y a d'activités).
  const ind = kmIndemnite(kmAff)
  const part = km => kmAff > 0 ? ind.montant * km / kmAff : 0
  const m2 = {
    total: ind.montant,
    uber: part(kmUber), lyft: part(kmLyft), loc: part(kmLoc),
    tauxMoyen: ind.tauxMoyen, detail: ind.detail
  }

  const ecart = m1.total - m2.total
  return {
    kmTotal, kmUber, kmLyft, kmLoc, kmAff, prorata, fraisReels,
    m1, m2, ecart,
    meilleure: Math.abs(ecart) < 0.005 ? 'egal' : (ecart > 0 ? 'm1' : 'm2'),
    // La méthode retenue aujourd'hui par l'app, pour montrer l'écart avec le
    // montant réellement porté au sommaire.
    actuelle: m1.uber + m1.lyft + m2.loc,
    paliers: f.km.paliers
  }
}

function renderComparaisonMethodes() {
  const el = document.getElementById('veh-methodes')
  if (!el) return
  const c = comparerMethodesVehicule()

  if (c.kmAff <= 0) {
    el.innerHTML = card('⚖️ Méthode 1 contre méthode 2',
      infoBox('Saisissez des kilomètres d\'affaires (Uber, Lyft ou déplacements vers les immeubles) pour comparer les deux méthodes de déduction.'),
      'blue')
    return
  }

  const detailPaliers = c.m2.detail
    .map(d => `${fmt(d.km, 0)} km × ${fmt(d.taux, 2)} $`)
    .join(' + ')

  const gagnante = c.meilleure === 'egal'
    ? `Les deux méthodes donnent le même résultat.`
    : c.meilleure === 'm1'
      ? `<strong>La méthode 1 (frais réels) est plus avantageuse de ${money(Math.abs(c.ecart))}.</strong>`
      : `<strong>La méthode 2 (taux par km) est plus avantageuse de ${money(Math.abs(c.ecart))}.</strong>`

  const rows = [
    tr(['🟠 Uber', [money(c.m1.uber), 'right'], [money(c.m2.uber), 'right'],
        [ecartCell(c.m1.uber - c.m2.uber), 'right']]),
    tr(['💗 Lyft', [money(c.m1.lyft), 'right'], [money(c.m2.lyft), 'right'],
        [ecartCell(c.m1.lyft - c.m2.lyft), 'right']]),
    tr(['🏘 Immeubles', [money(c.m1.loc), 'right'], [money(c.m2.loc), 'right'],
        [ecartCell(c.m1.loc - c.m2.loc), 'right']])
  ]
  const foot = tr(['TOTAL', [money(c.m1.total), 'right'], [money(c.m2.total), 'right'],
                   [ecartCell(c.ecart), 'right']], 'total-tr')

  el.innerHTML = card('⚖️ Méthode 1 contre méthode 2 — ' + activeYear, `
    <div class="summary-row">
      ${sumCard('Méthode 1 — frais réels', money(c.m1.total), c.meilleure === 'm1' ? 'green' : 'blue',
                fmt(c.prorata * 100, 1) + ' % × ' + money(c.fraisReels))}
      ${sumCard('Méthode 2 — taux par km', money(c.m2.total), c.meilleure === 'm2' ? 'green' : 'blue',
                fmt(c.kmAff, 0) + ' km · moy. ' + fmt(c.m2.tauxMoyen, 3) + ' $')}
    </div>
    ${infoBox(gagnante + `<br>Écart sur l'année : ${money(Math.abs(c.ecart))}
      — à un taux marginal de 40 %, cela représente environ
      ${money(Math.abs(c.ecart) * 0.40)} d'impôt.`)}
    ${table(['Activité', ['Méthode 1', 'right'], ['Méthode 2', 'right'], ['Écart', 'right']], rows, foot)}
    ${sourceNote(`
      <strong>Méthode 1</strong> : ${money(c.fraisReels)} de frais réels × ${fmt(c.kmAff, 0)} km d'affaires ÷ ${fmt(c.kmTotal, 0)} km au total.<br>
      <strong>Méthode 2</strong> : ${detailPaliers} = ${money(c.m2.total)}.
      Taux ${activeYear} de l'ARC par paliers (Règl. impôt art. 7306), et non un taux unique.<br>
      <strong>Montant actuellement porté au sommaire</strong> : ${money(c.actuelle)}
      — l'app applique la méthode 1 à Uber/Lyft et la méthode 2 aux déplacements locatifs.
    `)}
    ${warnBox(`Pour un travailleur autonome, l'ARC attend en principe les <strong>frais réels</strong>
      (méthode 1) appuyés par les pièces et par un registre de kilométrage. Le taux par kilomètre est
      d'abord conçu pour les allocations versées par un employeur. La méthode 2 reste un repère utile
      — et la seule praticable si les reçus d'essence manquent — mais la méthode 1 est celle à
      privilégier si vous détenez les pièces.`)}
  `, 'blue')
}

function ecartCell(v) {
  const color = Math.abs(v) < 0.005 ? 'var(--text2)' : (v > 0 ? 'var(--green)' : '#C00000')
  const signe = v > 0.005 ? '+' : ''
  return `<span style="font-weight:700;color:${color}">${signe}${fmt(v)} $</span>`
}

registerModule({
  id: 'vehicule-methodes',
  label: 'Comparaison des méthodes véhicule',
  render: renderComparaisonMethodes
})
