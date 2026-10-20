// ════════════════════════════════════════════════════════════════════════════
// baux.js — BAUX, RELEVÉ 31 ET PRÉ-REMPLISSAGE DES LOYERS
//
// L'app connaissait les logements (« Logement 1 », « Coloc 2 ») mais pas les
// personnes. Deux conséquences :
//
// 1. Le RL-31 — à remettre à chaque locataire avant le 28 février, et sans
//    lequel le locataire perd son crédit d'impôt de solidarité — n'était pas
//    outillé du tout. Défaut de produire : 25 $ par jour de retard, minimum
//    100 $, maximum 2 500 $ (Loi sur l'administration fiscale, art. 59.0.2).
//
// 2. Les 12 mois de loyer étaient saisis à la main, logement par logement,
//    alors que le bail les détermine. C'est le gros de la saisie annuelle.
//
// Les baux vivent dans l'année (`state.baux`) : les locataires changent, et le
// RL-31 est un document annuel. `reporterBaux()` les reconduit à la création
// d'une nouvelle année, avec indexation facultative.
// ════════════════════════════════════════════════════════════════════════════

function baux() {
  if (!Array.isArray(state.baux)) state.baux = []
  return state.baux
}

function bailParId(id) { return baux().find(b => b.id === id) || null }

// Un bail couvre une unité d'un immeuble. Les unités sont les catégories de
// revenus de l'immeuble : c'est déjà là que le loyer est saisi.
function unitesDisponibles(propId) {
  const p = propById(propId)
  return p ? (p.revenus || []) : []
}

function nouveauBail(propId, unite) {
  if (guardClosed()) return
  const b = {
    id: uid(),
    propId: propId || (activeProps()[0] || {}).id || '',
    unite: unite || '',
    locataires: [{ prenom: '', nom: '' }],
    loyerMensuel: '',
    dateDebut: activeYear + '-07-01',   // date de reconduction usuelle au Québec
    dateFin: (activeYear + 1) + '-06-30',
    nbChambres: '',
    depotGaranti: '',
    occupeAu31dec: true,
    notes: ''
  }
  baux().push(b)
  save()
  ouvrirBail(b.id)
}

function ouvrirBail(id) {
  const b = bailParId(id); if (!b) return
  openSheet('📝 Bail', htmlBail(b), () => { renderBaux(); refreshAll() })
}

function htmlBail(b) {
  const props = activeProps()
  const unites = unitesDisponibles(b.propId)
  const loyer = num(b.loyerMensuel)
  const moisCouverts = moisCouvertsParBail(b)
  const saisi = totalSaisiUnite(b)
  const attendu = loyer * moisCouverts.length

  const locs = (b.locataires || []).map((l, i) => `
    <div class="cat-row" style="gap:6px;align-items:flex-end">
      <div style="flex:1"><label style="font-size:11px;color:var(--text2)">Prénom</label>
        <input type="text" class="inp" value="${escH(l.prenom)}" oninput="majLocataire('${b.id}',${i},'prenom',this.value)"></div>
      <div style="flex:1"><label style="font-size:11px;color:var(--text2)">Nom</label>
        <input type="text" class="inp" value="${escH(l.nom)}" oninput="majLocataire('${b.id}',${i},'nom',this.value)"></div>
      <button class="btn btn-ghost btn-sm" style="padding:6px 8px;margin-bottom:4px"
        onclick="retirerLocataire('${b.id}',${i})">✕</button>
    </div>`).join('')

  return `
    <div class="cat-row" style="gap:8px">
      <div class="field" style="flex:1">
        <label>Immeuble</label>
        <select class="inp" onchange="majBail('${b.id}','propId',this.value)">
          ${props.map(p => `<option value="${escH(p.id)}"${p.id === b.propId ? ' selected' : ''}>${escH(shortLabel(p.label))}</option>`).join('')}
        </select>
      </div>
      <div class="field" style="flex:1">
        <label>Unité / logement</label>
        <select class="inp" onchange="majBail('${b.id}','unite',this.value)">
          <option value="">— choisir —</option>
          ${unites.map(u => `<option value="${escH(u)}"${u === b.unite ? ' selected' : ''}>${escH(u)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="divider"></div>
    <div class="section-title">Locataires nommés au bail</div>
    ${locs}
    <button class="btn btn-ghost btn-sm btn-full" onclick="ajouterLocataire('${b.id}')">➕ Ajouter un locataire</button>
    ${sourceNote(`La case A du RL-31 est le <strong>nombre de locataires et sous-locataires nommés au bail
      le 31 décembre ${activeYear}</strong>. Nommez-les tous : chacun a droit à sa part du crédit de solidarité.`)}
    <div class="divider"></div>
    <div class="cat-row" style="gap:8px">
      <div class="field" style="flex:1">
        <label>Loyer mensuel</label>
        <input type="number" class="inp" step="0.01" value="${escH(b.loyerMensuel)}" placeholder="0,00"
          oninput="majBail('${b.id}','loyerMensuel',this.value)">
      </div>
      <div class="field" style="flex:1">
        <label>Chambres</label>
        <input type="number" class="inp" step="1" min="0" value="${escH(b.nbChambres)}"
          oninput="majBail('${b.id}','nbChambres',this.value)">
      </div>
    </div>
    <div class="cat-row" style="gap:8px">
      <div class="field" style="flex:1">
        <label>Début du bail</label>
        <input type="date" class="inp" value="${escH(b.dateDebut)}" oninput="majBail('${b.id}','dateDebut',this.value)">
      </div>
      <div class="field" style="flex:1">
        <label>Fin du bail</label>
        <input type="date" class="inp" value="${escH(b.dateFin)}" oninput="majBail('${b.id}','dateFin',this.value)">
      </div>
    </div>
    <div class="field">
      <label>Dépôt / avance (pour mémoire)</label>
      <input type="number" class="inp" step="0.01" value="${escH(b.depotGaranti)}"
        oninput="majBail('${b.id}','depotGaranti',this.value)">
      ${sourceNote(`Au Québec un propriétaire ne peut exiger ni dépôt de garantie ni chèques postdatés
        (Code civil, art. 1904). Ce champ ne sert qu'à noter une avance de loyer réellement reçue —
        laquelle est un <strong>revenu</strong> de l'année où elle couvre le loyer.`)}
    </div>
    <div class="toggle-row" onclick="majBail('${b.id}','occupeAu31dec',${!b.occupeAu31dec})">
      <div><div style="font-weight:600;font-size:14px">Logement loué au 31 décembre ${activeYear}</div>
      <div style="font-size:11px;color:var(--text2)">Condition d'émission du RL-31</div></div>
      <div class="toggle ${b.occupeAu31dec ? 'active' : ''}"><div class="toggle-slider"></div></div>
    </div>
    <div class="divider"></div>
    <div class="summary-row">
      ${sumCard('Loyer attendu ' + activeYear, money(attendu), 'blue', moisCouverts.length + ' mois couverts')}
      ${sumCard('Loyer saisi', money(saisi), Math.abs(saisi - attendu) < 1 ? 'green' : 'orange',
                Math.abs(saisi - attendu) < 1 ? 'conforme au bail' : 'écart ' + money(saisi - attendu))}
    </div>
    ${b.unite && loyer > 0
      ? `<button class="btn btn-primary btn-full" onclick="prefillLoyers('${b.id}')">
           📅 Pré-remplir les ${moisCouverts.length} mois à ${money(loyer)}</button>`
      : infoBox('Choisissez l’unité et saisissez le loyer mensuel pour activer le pré-remplissage.')}
    <button class="btn btn-ghost btn-sm btn-full" style="margin-top:8px" onclick="supprimerBail('${b.id}')">🗑️ Supprimer ce bail</button>`
}

// Mois de l'année active réellement couverts par le bail.
function moisCouvertsParBail(b) {
  const out = []
  const d0 = b.dateDebut ? new Date(b.dateDebut + 'T12:00:00') : null
  const d1 = b.dateFin ? new Date(b.dateFin + 'T12:00:00') : null
  for (let mi = 0; mi < 12; mi++) {
    const finDuMois = new Date(activeYear, mi + 1, 0, 12)
    const debutDuMois = new Date(activeYear, mi, 1, 12)
    if (d0 && d0 > finDuMois) continue
    if (d1 && d1 < debutDuMois) continue
    out.push(mi)
  }
  return out
}

function totalSaisiUnite(b) {
  if (!b.propId || !b.unite) return 0
  let s = 0
  for (let mi = 0; mi < 12; mi++) s += getMonthlyVal(b.propId, 'revenus', b.unite, mi)
  return s
}

function majBail(id, champ, val) {
  if (guardClosed()) return
  const b = bailParId(id); if (!b) return
  b[champ] = val
  if (champ === 'propId') b.unite = ''
  autoSave()
  refreshSheet(htmlBail(b))
}

function majLocataire(id, i, champ, val) {
  if (guardClosed()) return
  const b = bailParId(id); if (!b) return
  b.locataires[i][champ] = val
  autoSave()
}

function ajouterLocataire(id) {
  const b = bailParId(id); if (!b) return
  b.locataires.push({ prenom: '', nom: '' })
  autoSave()
  refreshSheet(htmlBail(b))
}

function retirerLocataire(id, i) {
  const b = bailParId(id); if (!b) return
  b.locataires.splice(i, 1)
  if (!b.locataires.length) b.locataires.push({ prenom: '', nom: '' })
  autoSave()
  refreshSheet(htmlBail(b))
}

function supprimerBail(id) {
  if (guardClosed()) return
  if (!confirm('Supprimer ce bail ? Les loyers déjà saisis ne sont pas touchés.')) return
  const i = baux().findIndex(b => b.id === id)
  if (i >= 0) baux().splice(i, 1)
  save()
  closeSheet()
  toast('🗑️ Bail supprimé')
}

// Écrit le loyer du bail dans les mois couverts. N'écrase une cellule déjà
// remplie qu'après confirmation : un loyer majoré en cours d'année, ou un mois
// de gratuité, est une information que l'utilisateur a saisie exprès.
function prefillLoyers(id) {
  if (guardClosed()) return
  const b = bailParId(id); if (!b || !b.unite) return
  const loyer = num(b.loyerMensuel)
  if (!loyer) { toast('⚠️ Saisissez le loyer mensuel'); return }
  const mois = moisCouvertsParBail(b)
  const occupes = mois.filter(mi => getMonthlyVal(b.propId, 'revenus', b.unite, mi) > 0)

  if (occupes.length && !confirm(
      `${occupes.length} mois portent déjà un montant (${occupes.map(mi => MONTHS_SHORT[mi]).join(', ')}).\n\n` +
      `OK = les remplacer par ${fmt(loyer)} $\nAnnuler = ne remplir que les mois vides`)) {
    mois.filter(mi => !occupes.includes(mi))
        .forEach(mi => setMonthlyVal(b.propId, 'revenus', b.unite, mi, String(loyer)))
  } else {
    mois.forEach(mi => setMonthlyVal(b.propId, 'revenus', b.unite, mi, String(loyer)))
  }
  save()
  toast('✅ ' + mois.length + ' mois pré-remplis')
  refreshSheet(htmlBail(b))
  refreshAll()
}

// ── ÉCARTS DE LOYER ────────────────────────────────────────────────────────
// Un mois inférieur au bail est un retard de paiement, une gratuité ou un
// oubli de saisie. Les trois méritent d'être vus ; aujourd'hui aucun ne l'était.
function ecartsLoyers() {
  const out = []
  baux().forEach(b => {
    const loyer = num(b.loyerMensuel)
    if (!loyer || !b.unite) return
    moisCouvertsParBail(b).forEach(mi => {
      const val = getMonthlyVal(b.propId, 'revenus', b.unite, mi)
      const ecart = val - loyer
      if (Math.abs(ecart) >= 1) {
        out.push({ bail: b, mi, attendu: loyer, saisi: val, ecart,
                   prop: shortLabel((propById(b.propId) || {}).label || b.propId) })
      }
    })
  })
  return out
}

// ── RELEVÉ 31 ──────────────────────────────────────────────────────────────
function bauxRL31() {
  return baux().filter(b => b.occupeAu31dec !== false && b.unite &&
    (b.locataires || []).some(l => (l.nom || '').trim() || (l.prenom || '').trim()))
}

function renderBaux() {
  const el = document.getElementById('baux-body')
  if (!el) return
  const list = baux()
  const f = fiscal()
  const ecarts = ecartsLoyers()
  const rl31 = bauxRL31()

  const items = list.map(b => {
    const noms = (b.locataires || []).map(l => `${l.prenom || ''} ${l.nom || ''}`.trim()).filter(Boolean)
    const loyer = num(b.loyerMensuel)
    const mois = moisCouvertsParBail(b).length
    const pret = b.occupeAu31dec !== false && noms.length > 0
    return `<div class="trip-item" onclick="ouvrirBail('${b.id}')">
      <div class="trip-dot" style="background:${pret ? 'var(--green)' : 'var(--brown)'}"></div>
      <div class="trip-info">
        <div class="trip-label">${escH(b.unite || '(unité non choisie)')}</div>
        <div class="trip-reason" style="font-size:11px">${escH(noms.join(', ') || 'locataire à nommer')}</div>
        <div class="trip-date">${escH(shortLabel((propById(b.propId) || {}).label || ''))} · ${mois} mois</div>
      </div>
      <div class="trip-amounts">
        <div class="trip-money">${loyer ? money(loyer) + '/m' : '—'}</div>
        <div class="trip-km" style="font-size:10px">${pret ? 'RL-31 ✓' : 'RL-31 ✗'}</div>
      </div>
    </div>`
  }).join('')

  const unitesSansBail = []
  activeProps().forEach(p => (p.revenus || []).forEach(u => {
    if (!list.some(b => b.propId === p.id && b.unite === u)) {
      unitesSansBail.push(shortLabel(p.label) + ' › ' + u)
    }
  }))

  el.innerHTML = `
    ${card('📝 Baux et Relevé 31 — ' + activeYear, `
      ${infoBox(`Le <strong>RL-31</strong> doit être transmis à Revenu Québec et remis à chaque
        locataire au plus tard le <strong>28 février ${activeYear + 1}</strong>, pour chaque logement
        loué au 31 décembre ${activeYear}. Défaut de produire : ${f.rl31.penaliteParJour} $ par jour,
        minimum ${f.rl31.penaliteMin} $, maximum ${money(f.rl31.penaliteMax)}.`)}
      ${items || '<div class="empty-state">Aucun bail enregistré</div>'}
      <button class="btn btn-primary btn-full" style="margin-top:10px" onclick="nouveauBail()">➕ Nouveau bail</button>
      ${unitesSansBail.length ? warnBox(`Unité(s) sans bail : ${escH(unitesSansBail.join(' · '))}.
        Sans bail, pas de RL-31 ni de pré-remplissage.`) : ''}
    `, 'blue')}

    ${card('📄 Relevés 31 à produire — ' + rl31.length, `
      ${rl31.length === 0
        ? infoBox('Aucun relevé à produire : nommez les locataires et confirmez l’occupation au 31 décembre.')
        : `${table(['Unité', 'Locataires', ['Case A', 'right']],
             rl31.map(b => tr([
               escH(shortLabel((propById(b.propId) || {}).label || '')) + ' › ' + escH(b.unite),
               escH((b.locataires || []).map(l => `${l.prenom || ''} ${l.nom || ''}`.trim()).filter(Boolean).join(', ')),
               [String((b.locataires || []).filter(l => (l.nom || '').trim() || (l.prenom || '').trim()).length), 'right']
             ])))}
           <button class="btn btn-primary btn-full" style="margin-top:10px" onclick="genererRL31PDF()">📄 Feuillets RL-31 (PDF)</button>
           <button class="btn btn-ghost btn-sm btn-full" style="margin-top:6px" onclick="exporterRL31CSV()">📊 Données de transmission (CSV)</button>`}
      ${warnBox(`Les feuillets produits ici sont des <strong>copies destinées aux locataires</strong> et
        un bordereau de saisie. Le relevé officiel doit être <strong>transmis à Revenu Québec par voie
        électronique</strong> (service « Préparation des relevés 31 » de Mon dossier, ou logiciel
        autorisé) : l’app prépare les données, elle ne les transmet pas.`)}
    `, 'green')}

    ${ecarts.length ? card('⚠️ Écarts entre les loyers saisis et les baux', `
      ${table(['Unité', 'Mois', ['Au bail', 'right'], ['Saisi', 'right'], ['Écart', 'right']],
        ecarts.map(e => tr([
          escH(e.prop) + ' › ' + escH(e.bail.unite), MONTHS_FR[e.mi],
          [money(e.attendu), 'right'], [money(e.saisi), 'right'],
          [`<span style="color:${e.ecart < 0 ? '#C00000' : 'var(--green)'};font-weight:700">${e.ecart > 0 ? '+' : ''}${fmt(e.ecart)} $</span>`, 'right']
        ])))}
      ${sourceNote(`Un montant inférieur au bail est soit un retard de paiement, soit une gratuité
        consentie, soit un mois non saisi. Un loyer impayé ne se déduit pas comme dépense : il ne
        s’inscrit tout simplement pas en revenu (comptabilité de caisse).`)}
    `, 'brown') : ''}`
}

function exporterRL31CSV() {
  const lignes = [csvLigne(['Immeuble', 'Adresse', 'Unite', 'Case A (nb locataires)',
                            'Locataire prenom', 'Locataire nom', 'Loyer mensuel',
                            'Debut du bail', 'Fin du bail', 'Chambres', 'Annee'])]
  bauxRL31().forEach(b => {
    const p = propById(b.propId) || {}
    const nb = (b.locataires || []).filter(l => (l.nom || '').trim() || (l.prenom || '').trim()).length
    ;(b.locataires || []).forEach(l => {
      if (!(l.nom || '').trim() && !(l.prenom || '').trim()) return
      lignes.push(csvLigne([shortLabel(p.label || ''), p.address || '', b.unite, nb,
                            l.prenom || '', l.nom || '', fmt(num(b.loyerMensuel)),
                            b.dateDebut || '', b.dateFin || '', b.nbChambres || '', activeYear]))
    })
  })
  dl(`rl31_${activeYear}.csv`, '﻿' + lignes.join('\n'), 'text/csv;charset=utf-8')
  toast('📊 Données RL-31 exportées')
}

// Feuillets destinés aux locataires. jsPDF 2.5.1 n'embarque que des polices
// WinAnsi : pas d'emoji ici, seulement du texte latin.
async function genererRL31PDF() {
  const list = bauxRL31()
  if (!list.length) { toast('⚠️ Aucun relevé à produire'); return }
  try {
    await loadJsPDF()
    const { jsPDF } = window.jspdf
    const doc = new jsPDF({ unit: 'mm', format: 'letter' })
    const W = doc.internal.pageSize.getWidth()
    let premiere = true

    list.forEach((b, idx) => {
      if (!premiere) doc.addPage()
      premiere = false
      const p = propById(b.propId) || {}
      const nb = (b.locataires || []).filter(l => (l.nom || '').trim() || (l.prenom || '').trim()).length

      doc.setFillColor(31, 56, 100); doc.rect(0, 0, W, 26, 'F')
      doc.setTextColor(255, 255, 255); doc.setFontSize(16); doc.setFont(undefined, 'bold')
      doc.text('RELEVE 31 - Renseignements sur l\'occupation', 14, 12)
      doc.setFontSize(10); doc.setFont(undefined, 'normal')
      doc.text('Logement loue - Annee ' + activeYear + '  (copie du locataire)', 14, 20)

      doc.setTextColor(0, 0, 0)
      let y = 40
      const ligne = (lbl, val) => {
        doc.setFont(undefined, 'bold'); doc.setFontSize(9)
        doc.text(String(lbl), 14, y)
        doc.setFont(undefined, 'normal'); doc.setFontSize(10)
        doc.text(String(val || '-'), 75, y)
        y += 8
      }

      doc.setFontSize(11); doc.setFont(undefined, 'bold')
      doc.text('Case A - Nombre de locataires et sous-locataires', 14, y); y += 7
      doc.setFontSize(22); doc.text(String(nb), 14, y); y += 12

      doc.setFontSize(11); doc.setFont(undefined, 'bold')
      doc.text('Locataires nommes au bail au 31 decembre ' + activeYear, 14, y); y += 7
      ;(b.locataires || []).forEach(l => {
        const nom = `${l.prenom || ''} ${l.nom || ''}`.trim()
        if (nom) { doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.text('- ' + nom, 18, y); y += 6 }
      })
      y += 6

      doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.text('Logement', 14, y); y += 7
      ligne('Immeuble', shortLabel(p.label || ''))
      ligne('Adresse', p.address || '')
      ligne('Unite', b.unite)
      ligne('Nombre de chambres', b.nbChambres || '-')
      ligne('Loyer mensuel', fmt(num(b.loyerMensuel)) + ' $')
      ligne('Periode du bail', (b.dateDebut || '?') + ' au ' + (b.dateFin || '?'))
      y += 4

      doc.setFontSize(11); doc.setFont(undefined, 'bold'); doc.text('Proprietaire', 14, y); y += 7
      ligne('Nom', HOME_OWNER)
      ligne('Part detenue', fmt(clampPct(p.pct), 0) + ' %')
      if (p.coOwners) ligne('Coproprietaire(s)', p.coOwners)

      y += 8
      doc.setFillColor(245, 245, 245); doc.rect(14, y - 4, W - 28, 30, 'F')
      doc.setFontSize(8); doc.setTextColor(80, 80, 80); doc.setFont(undefined, 'normal')
      doc.text(doc.splitTextToSize(
        'Ce document reprend les renseignements du releve 31 produit a Revenu Quebec pour ' +
        'l\'annee ' + activeYear + '. Il vous sert a demander le credit d\'impot pour solidarite ' +
        '(composante relative au logement) dans votre declaration de revenus. Conservez-le. ' +
        'Le releve officiel est transmis a Revenu Quebec par voie electronique.', W - 32), 16, y + 2)

      doc.setFontSize(8); doc.setTextColor(150, 150, 150)
      doc.text(`${HOME_OWNER} - Releve 31 ${activeYear} - Feuillet ${idx + 1}/${list.length}`,
               W / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
    })

    doc.save(`RL31_${activeYear}.pdf`)
    toast(`✅ ${list.length} feuillet(s) RL-31 générés`)
  } catch (e) {
    toast('❌ Erreur PDF : ' + e.message)
  }
}

// ── REPORT D'UNE ANNÉE À L'AUTRE ───────────────────────────────────────────
// Appelé à la création d'une nouvelle année : les baux se reconduisent de plein
// droit au Québec, donc les retaper serait absurde.
function reporterBaux(anneeSource, anneeCible, indexationPct) {
  const src = readYear(anneeSource)
  if (!src || !Array.isArray(src.baux) || !src.baux.length) return 0
  const cible = readYear(anneeCible)
  if (!cible) return 0
  const idx = 1 + (num(indexationPct) / 100)
  cible.baux = src.baux.map(b => ({
    ...b,
    id: uid(),
    loyerMensuel: b.loyerMensuel ? String(Math.round(num(b.loyerMensuel) * idx * 100) / 100) : '',
    dateDebut: decalerAnnee(b.dateDebut, anneeCible - anneeSource),
    dateFin: decalerAnnee(b.dateFin, anneeCible - anneeSource),
    reportDe: anneeSource
  }))
  writeYear(anneeCible, cible)
  return cible.baux.length
}

function decalerAnnee(d, n) {
  if (!d) return d
  const m = String(d).match(/^(\d{4})(-\d{2}-\d{2})$/)
  return m ? (parseInt(m[1], 10) + n) + m[2] : d
}

registerModule({
  id: 'baux',
  label: 'Baux et RL-31',
  render: renderBaux
})
