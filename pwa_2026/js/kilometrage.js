// ════════════════════════════════════════════════════════════════════════════
// kilometrage.js — JOURNAL DE KILOMÉTRAGE ASSISTÉ
//
// Le registre de kilométrage est la pièce la plus souvent reconstituée de
// mémoire, donc la plus fragile en vérification. L'ARC et Revenu Québec en
// attendent un par déplacement : DATE, DESTINATION, MOTIF et KILOMÈTRES, et
// l'odomètre au début et à la fin de l'année.
//
// Ce que la version web peut faire — et ce qu'elle ne peut pas :
//
// • Pas de détection de trajet en arrière-plan : un navigateur ne reçoit pas la
//   position quand l'app est fermée. C'est une limite de la plateforme, pas de
//   l'app ; la détection automatique reste réservée à la version iOS.
// • En revanche : enregistrement d'un trajet par GPS pendant le déplacement,
//   relevés d'odomètre, contrôle de cohérence du registre, détection des
//   semaines sans aucune note, rappel hebdomadaire, et export du registre au
//   format attendu par une vérification.
// ════════════════════════════════════════════════════════════════════════════

function donneesKm() {
  if (!state.kmJournal) state.kmJournal = {}
  return state.kmJournal
}

// ── CONTRÔLE DE COHÉRENCE ──────────────────────────────────────────────────
function coherenceKm() {
  const d = donneesKm()
  const trips = state.trips.filter(t => yearOf(t.date) === activeYear)
  const kmTrips = trips.reduce((s, t) => s + num(t.km), 0)
  const kmUber = num(state.uber.km_online)
  const kmLyft = getLyftKmTotal()
  const kmAffaires = kmTrips + kmUber + kmLyft

  const odoDebut = num(d.odoDebut)
  const odoFin = num(d.odoFin)
  const kmOdo = odoFin > odoDebut ? odoFin - odoDebut : 0
  const kmDeclare = num(state.settings.kmTotalAnnuel)

  const anomalies = []
  if (kmOdo > 0 && kmDeclare > 0 && Math.abs(kmOdo - kmDeclare) > Math.max(200, kmDeclare * 0.02)) {
    anomalies.push(`L'écart entre les relevés d'odomètre (${fmt(kmOdo, 0)} km) et le total annuel
      déclaré (${fmt(kmDeclare, 0)} km) est de ${fmt(Math.abs(kmOdo - kmDeclare), 0)} km.`)
  }
  if (kmDeclare > 0 && kmAffaires > kmDeclare) {
    anomalies.push(`Les kilomètres d'affaires (${fmt(kmAffaires, 0)} km) dépassent le total annuel
      du véhicule (${fmt(kmDeclare, 0)} km) : la proration serait supérieure à 100 %.`)
  }
  if (!odoDebut || !odoFin) {
    anomalies.push('Les relevés d’odomètre du 1ᵉʳ janvier et du 31 décembre ne sont pas saisis. Ce sont les deux chiffres qu’une vérification demande en premier.')
  }
  const sansMotif = trips.filter(t => !String(t.reason || '').trim())
  if (sansMotif.length) {
    anomalies.push(`${sansMotif.length} déplacement(s) sans motif. Un registre sans motif n’est pas un registre.`)
  }

  // Mois sans aucun déplacement noté, alors que l'immeuble a généré des revenus :
  // signe d'un oubli de saisie plutôt que d'une absence réelle de déplacement.
  const moisVides = []
  for (let mi = 0; mi < 12; mi++) {
    if (trips.some(t => monthOf(t.date) === mi)) continue
    const revMois = activeProps().reduce((s, p) =>
      s + (p.revenus || []).reduce((ss, c) => ss + getMonthlyVal(p.id, 'revenus', c, mi), 0), 0)
    if (revMois > 0) moisVides.push(mi)
  }

  return { trips, kmTrips, kmUber, kmLyft, kmAffaires, kmOdo, kmDeclare,
           odoDebut, odoFin, anomalies, moisVides, sansMotif,
           prorata: kmDeclare > 0 ? kmAffaires / kmDeclare : 0 }
}

function majKm(champ, val) {
  if (guardClosed()) return
  donneesKm()[champ] = val
  autoSave()
  renderKilometrage()
}

// ── ENREGISTREMENT PAR GPS ─────────────────────────────────────────────────
// Mesure la distance réellement parcourue pendant que l'écran reste ouvert.
// Honnête sur sa limite : si l'app passe en arrière-plan, la mesure s'arrête.
let _gpsWatch = null
let _gpsTrace = []

function demarrerTrajetGPS() {
  if (!navigator.geolocation) { toast('⚠️ Géolocalisation indisponible'); return }
  if (_gpsWatch != null) { arreterTrajetGPS(); return }
  _gpsTrace = []
  _gpsWatch = navigator.geolocation.watchPosition(pos => {
    const p = { lat: pos.coords.latitude, lon: pos.coords.longitude,
                acc: pos.coords.accuracy, t: Date.now() }
    // Un point à plus de 50 m d'incertitude fait gonfler la distance : on l'écarte.
    if (p.acc > 50) return
    _gpsTrace.push(p)
    majAffichageGPS()
  }, err => {
    toast('⚠️ GPS : ' + err.message, 3000)
    arreterTrajetGPS()
  }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 })
  toast('🛰️ Enregistrement démarré — gardez l’écran ouvert', 3200)
  renderKilometrage()
}

function distanceTrace(trace) {
  let d = 0
  for (let i = 1; i < trace.length; i++) d += haversineKm(trace[i - 1], trace[i])
  return d
}

function haversineKm(a, b) {
  const R = 6371
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLon = (b.lon - a.lon) * Math.PI / 180
  const la1 = a.lat * Math.PI / 180, la2 = b.lat * Math.PI / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function majAffichageGPS() {
  const el = document.getElementById('gps-live')
  if (el) el.textContent = fmt(distanceTrace(_gpsTrace), 2) + ' km · ' + _gpsTrace.length + ' points'
}

function arreterTrajetGPS() {
  if (_gpsWatch != null) { navigator.geolocation.clearWatch(_gpsWatch); _gpsWatch = null }
  const km = distanceTrace(_gpsTrace)
  _gpsTrace = []
  if (km <= 0.1) { toast('Aucun déplacement mesuré'); renderKilometrage(); return }
  // Pré-remplit le formulaire de trajet existant plutôt que d'enregistrer à
  // l'aveugle : le motif reste à saisir, et c'est lui qui rend le registre valable.
  const inp = document.getElementById('trip-km')
  if (inp) { inp.value = km.toFixed(1); if (typeof updateKmPreview === 'function') updateKmPreview() }
  showTab('trips')
  toast('🛰️ ' + fmt(km, 1) + ' km mesurés — indiquez la destination et le motif', 3600)
  renderKilometrage()
}

// ── RAPPEL HEBDOMADAIRE ────────────────────────────────────────────────────
// Sans service de notification côté serveur, le rappel se déclenche à
// l'ouverture de l'app. C'est une limite assumée : mieux vaut un rappel visible
// à l'ouverture qu'une promesse de notification que le navigateur ne tiendra pas.
function joursDepuisDernierTrajet() {
  const trips = state.trips.filter(t => t.date)
  if (!trips.length) return null
  const dernier = trips.map(t => t.date).sort().pop()
  return Math.floor((Date.now() - new Date(dernier + 'T12:00:00').getTime()) / 86400000)
}

function renderRappelKm() {
  const el = document.getElementById('home-rappel-km')
  if (!el) return
  if (!setup.modules.trips) { el.innerHTML = ''; return }
  const j = joursDepuisDernierTrajet()
  if (j == null || j < 14) { el.innerHTML = ''; return }
  el.innerHTML = `<div class="sum-card" style="background:#fff3e0;color:#7B3F00;margin-bottom:10px;cursor:pointer"
      onclick="showTab('trips')">
    <div class="s-lbl">🚗 Aucun déplacement noté depuis ${j} jours</div>
    <div style="font-size:11px;margin-top:3px">Un registre reconstitué de mémoire en avril ne vaut rien en vérification.</div>
  </div>`
}

// ── AFFICHAGE ──────────────────────────────────────────────────────────────
function renderKilometrage() {
  const el = document.getElementById('km-body')
  if (!el) return
  const c = coherenceKm()
  const d = donneesKm()
  const ind = kmIndemnite(c.kmAffaires)

  el.innerHTML = `
    ${card('📏 Registre de kilométrage — ' + activeYear, `
      <div class="summary-row">
        ${sumCard('Km d’affaires', fmt(c.kmAffaires, 0) + ' km', 'blue',
                  fmt(c.prorata * 100, 1) + ' % du véhicule')}
        ${sumCard('Indemnité au taux de l’ARC', money(ind.montant), 'green',
                  'moy. ' + fmt(ind.tauxMoyen, 3) + ' $/km')}
      </div>
      ${table(['Usage', ['Kilomètres', 'right']], [
        tr(['🏘 Déplacements vers les immeubles', [fmt(c.kmTrips, 1) + ' km', 'right']]),
        tr(['🟠 Uber (en ligne)', [fmt(c.kmUber, 0) + ' km', 'right']]),
        tr(['💗 Lyft', [fmt(c.kmLyft, 0) + ' km', 'right']]),
        tr(['🏠 Usage personnel', [fmt(Math.max(0, c.kmDeclare - c.kmAffaires), 0) + ' km', 'right']])
      ], tr(['TOTAL ANNUEL', [fmt(c.kmDeclare, 0) + ' km', 'right']], 'total-tr'))}
      ${sourceNote(`Taux ${activeYear} par paliers : ${ind.detail.map(x => fmt(x.km, 0) + ' km × ' + fmt(x.taux, 2) + ' $').join(' + ')}.`)}
    `, 'blue')}

    ${card('🔢 Relevés d’odomètre', `
      ${infoBox(`Ce sont les deux premiers chiffres qu’une vérification demande. Sans eux, le total
        annuel du véhicule n’est qu’une affirmation.`)}
      <div class="cat-row" style="gap:8px">
        <div class="field" style="flex:1">
          <label>1ᵉʳ janvier ${activeYear}</label>
          <input type="number" class="inp" step="1" value="${escH(d.odoDebut)}" placeholder="km"
            oninput="majKm('odoDebut',this.value)">
        </div>
        <div class="field" style="flex:1">
          <label>31 décembre ${activeYear}</label>
          <input type="number" class="inp" step="1" value="${escH(d.odoFin)}" placeholder="km"
            oninput="majKm('odoFin',this.value)">
        </div>
      </div>
      ${c.kmOdo > 0 ? sumCard('Distance selon l’odomètre', fmt(c.kmOdo, 0) + ' km',
          Math.abs(c.kmOdo - c.kmDeclare) < 200 ? 'green' : 'orange',
          c.kmDeclare ? 'déclaré ' + fmt(c.kmDeclare, 0) + ' km' : '') : ''}
      ${c.kmOdo > 0 && c.kmDeclare !== c.kmOdo
        ? `<button class="btn btn-ghost btn-sm btn-full" style="margin-top:8px"
             onclick="saveSetting('kmTotalAnnuel',${c.kmOdo});renderKilometrage();refreshAll()">
             ↪️ Utiliser ${fmt(c.kmOdo, 0)} km comme total annuel</button>` : ''}
    `, 'dark')}

    ${card('🛰️ Mesurer un trajet', `
      ${_gpsWatch != null
        ? `${infoBox('Enregistrement en cours. Gardez cet écran ouvert : un navigateur n’a pas accès à la position en arrière-plan.')}
           <div id="gps-live" style="text-align:center;font-size:24px;font-weight:800;padding:14px">0,00 km</div>
           <button class="btn btn-danger btn-full" onclick="arreterTrajetGPS()">⏹ Arrêter et enregistrer</button>`
        : `${infoBox(`Mesure la distance réellement parcourue, au lieu de l’estimer. À l’arrêt,
             le kilométrage est reporté dans le formulaire de déplacement — il ne reste que la
             destination et le motif à saisir.`)}
           <button class="btn btn-primary btn-full" onclick="demarrerTrajetGPS()">▶️ Démarrer la mesure</button>`}
      ${warnBox(`La <strong>détection automatique</strong> des trajets (« 42 km vers le Triplex,
        hier 14 h — classer ? ») exige la position en arrière-plan, que seule une application
        native peut obtenir. Elle est prévue dans la version iOS.`)}
    `, 'green')}

    ${c.anomalies.length || c.moisVides.length ? card('⚠️ Contrôles du registre', `
      ${c.anomalies.length ? warnBox('<ul style="margin:4px 0 0 18px;padding:0">'
        + c.anomalies.map(a => `<li style="margin-bottom:4px">${a}</li>`).join('') + '</ul>') : ''}
      ${c.moisVides.length ? infoBox(`Mois avec des loyers encaissés mais <strong>aucun déplacement
        noté</strong> : ${c.moisVides.map(mi => MONTHS_FR[mi]).join(', ')}. Visite, entretien,
        dépôt bancaire : vérifiez si un déplacement a été oublié.`) : ''}
    `, 'brown') : card('✅ Contrôles du registre', infoBox('Aucune anomalie détectée.'), 'green')}

    ${card('📤 Exporter le registre', `
      ${infoBox(`Format attendu en vérification : une ligne par déplacement, avec la date, la
        destination, le motif et les kilomètres, plus les relevés d’odomètre.`)}
      <button class="btn btn-ghost btn-sm btn-full" onclick="exporterRegistreKm()">📊 Registre complet (CSV)</button>
    `, 'dark')}`
}

function exporterRegistreKm() {
  const c = coherenceKm()
  const lignes = [csvLigne(['Date', 'Destination', 'Motif', 'Km', 'Aller-retour', 'Indemnite au taux'])]
  c.trips.sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(t => {
    const p = propById(t.property)
    const dest = t.property === 'other' ? (t.customDest || 'Autre') : shortLabel((p || {}).label || t.property)
    lignes.push(csvLigne([t.date, dest, t.reason || '', fmt(num(t.km), 1),
                          t.roundTrip ? 'oui' : 'non', fmt(num(t.km) * rate())]))
  })
  lignes.push('')
  lignes.push(csvLigne(['Odometre au 1er janvier', c.odoDebut || '']))
  lignes.push(csvLigne(['Odometre au 31 decembre', c.odoFin || '']))
  lignes.push(csvLigne(['Km total annuel declare', fmt(c.kmDeclare, 0)]))
  lignes.push(csvLigne(['Km immeubles', fmt(c.kmTrips, 1)]))
  lignes.push(csvLigne(['Km Uber', fmt(c.kmUber, 0)]))
  lignes.push(csvLigne(['Km Lyft', fmt(c.kmLyft, 0)]))
  lignes.push(csvLigne(['Km affaires', fmt(c.kmAffaires, 1)]))
  lignes.push(csvLigne(['Part affaires (%)', fmt(c.prorata * 100, 2)]))
  dl(`registre_kilometrage_${activeYear}.csv`, '﻿' + lignes.join('\n'), 'text/csv;charset=utf-8')
  toast('📊 Registre exporté')
}

registerModule({
  id: 'kilometrage',
  label: 'Registre de kilométrage',
  render: renderKilometrage
})
