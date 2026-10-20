// ════════════════════════════════════════════════════════════════════════════
// ventilation.js — VENTILATION D'UNE DÉPENSE ENTRE PLUSIEURS POSTES
//
// Une assurance qui couvre deux immeubles, un forfait téléphone à 30 % locatif
// et 70 % Uber : la division se faisait à la calculatrice et ne laissait aucune
// trace. Trois ans plus tard, personne ne sait plus pourquoi la cellule
// « Assurance habitation » de septembre porte 418,27 $.
//
// Une ventilation est donc conservée comme un document à part entière : libellé,
// montant total, clé de répartition, et les montants EFFECTIVEMENT écrits dans
// chaque cellule — ce qui la rend réversible et vérifiable.
// ════════════════════════════════════════════════════════════════════════════

function ventilations() {
  if (!Array.isArray(state.ventilations)) state.ventilations = []
  return state.ventilations
}

// Destinations possibles d'une part : chaque catégorie déductible de chaque
// immeuble, et chaque poste du véhicule.
function ciblesVentilation() {
  const out = []
  activeProps().forEach(p => {
    (p.deductibles || STD_DEDUCTIBLES).forEach(cat => {
      out.push({ key: 'prop|' + p.id + '|' + cat, groupe: shortLabel(p.label), cat, propId: p.id, type: 'prop' })
    })
  })
  if (setup.modules.rideshare) {
    VEH_CATS.forEach(cat => out.push({ key: 'veh||' + cat, groupe: '🚗 Véhicule', cat, type: 'veh' }))
  }
  return out
}

function cibleParKey(key) {
  return ciblesVentilation().find(c => c.key === key) || null
}

// Somme des pourcentages affectés ; le reste est la part personnelle, non
// déductible — l'afficher explicitement évite la ventilation « à 100 % » faite
// par réflexe sur une dépense mixte.
function totalPctVentilation(v) {
  return (v.parts || []).reduce((s, p) => s + num(p.pct), 0)
}

function nouvelleVentilation() {
  if (guardClosed()) return
  const v = {
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    libelle: '',
    montant: '',
    parts: [{ key: '', pct: '' }],
    applique: false,
    applied: []
  }
  ventilations().push(v)
  save()
  ouvrirVentilation(v.id)
}

function ouvrirVentilation(id) {
  const v = ventilations().find(x => x.id === id)
  if (!v) return
  openSheet('🧮 Ventilation d\'une dépense', htmlVentilation(v), () => { renderVentilations(); refreshAll() })
}

function htmlVentilation(v) {
  const cibles = ciblesVentilation()
  const groupes = [...new Set(cibles.map(c => c.groupe))]
  const options = sel => groupes.map(g =>
    `<optgroup label="${escH(g)}">` +
    cibles.filter(c => c.groupe === g).map(c =>
      `<option value="${escH(c.key)}"${c.key === sel ? ' selected' : ''}>${escH(c.cat)}</option>`
    ).join('') + '</optgroup>'
  ).join('')

  const tot = totalPctVentilation(v)
  const montant = num(v.montant)
  const reste = 100 - tot

  const parts = (v.parts || []).map((p, i) => `
    <div class="cat-row" style="align-items:flex-end;gap:6px">
      <div style="flex:1">
        <label style="font-size:11px;color:var(--text2)">Poste ${i + 1}</label>
        <select class="inp" onchange="majPartVentilation('${v.id}',${i},'key',this.value)">
          <option value="">— choisir —</option>${options(p.key)}
        </select>
      </div>
      <div style="width:76px">
        <label style="font-size:11px;color:var(--text2)">%</label>
        <input type="number" class="inp" style="text-align:right" min="0" max="100" step="0.01"
          value="${escH(p.pct)}" oninput="majPartVentilation('${v.id}',${i},'pct',this.value)">
      </div>
      <div style="width:84px;text-align:right;font-size:12px;font-weight:700;padding-bottom:10px">
        ${montant ? money(montant * num(p.pct) / 100) : '—'}
      </div>
      <button class="btn btn-ghost btn-sm" style="padding:6px 8px;margin-bottom:4px"
        onclick="retirerPartVentilation('${v.id}',${i})">✕</button>
    </div>`).join('')

  const avert = Math.abs(reste) < 0.005 ? ''
    : reste > 0
      ? infoBox(`<strong>${fmt(reste, 2)} %</strong> non affecté = ${money(montant * reste / 100)}
         considéré comme <strong>personnel / non déductible</strong>. C'est volontaire si la dépense
         est mixte ; sinon complétez la répartition.`)
      : warnBox(`La répartition dépasse 100 % (<strong>${fmt(tot, 2)} %</strong>).
         Les montants écrits seraient supérieurs à la dépense réelle.`)

  return `
    <div class="field">
      <label>Libellé de la dépense</label>
      <input type="text" class="inp" value="${escH(v.libelle)}" placeholder="ex: Assurance multirisque — 2 immeubles"
        oninput="majVentilation('${v.id}','libelle',this.value)">
    </div>
    <div class="cat-row" style="gap:8px">
      <div class="field" style="flex:1">
        <label>Montant total</label>
        <input type="number" class="inp" step="0.01" value="${escH(v.montant)}" placeholder="0,00"
          oninput="majVentilation('${v.id}','montant',this.value)">
      </div>
      <div class="field" style="flex:1">
        <label>Date de la dépense</label>
        <input type="date" class="inp" value="${escH(v.date)}"
          oninput="majVentilation('${v.id}','date',this.value)">
      </div>
    </div>
    <div class="divider"></div>
    <div class="section-title">Clé de répartition</div>
    ${parts}
    <button class="btn btn-ghost btn-sm btn-full" onclick="ajouterPartVentilation('${v.id}')">➕ Ajouter un poste</button>
    ${avert}
    <div class="divider"></div>
    ${v.applique
      ? `${infoBox(`Cette ventilation est <strong>appliquée</strong> : les montants ci-dessus sont
           inscrits dans les cellules de ${MONTHS_FR[monthOf(v.date)] || '?'}.`)}
         <button class="btn btn-danger btn-full" onclick="retirerVentilation('${v.id}')">↩️ Retirer des cellules</button>`
      : `<button class="btn btn-primary btn-full" onclick="appliquerVentilation('${v.id}')">✅ Appliquer aux cellules</button>`}
    <button class="btn btn-ghost btn-sm btn-full" style="margin-top:8px" onclick="supprimerVentilation('${v.id}')">🗑️ Supprimer cette ventilation</button>
    ${sourceNote(`Une ventilation <strong>s'ajoute</strong> aux montants déjà saisis dans les cellules
      visées ; elle ne les remplace pas. « Retirer » soustrait exactement ce qui avait été ajouté,
      de sorte qu'un aller-retour laisse les chiffres intacts.`)}`
}

function majVentilation(id, champ, val) {
  if (guardClosed()) return
  const v = ventilations().find(x => x.id === id); if (!v) return
  if (v.applique && (champ === 'montant' || champ === 'date')) {
    toast('↩️ Retirez d\'abord la ventilation des cellules', 2600); return
  }
  v[champ] = val
  autoSave()
  refreshSheet(htmlVentilation(v))
}

function majPartVentilation(id, i, champ, val) {
  if (guardClosed()) return
  const v = ventilations().find(x => x.id === id); if (!v) return
  if (v.applique) { toast('↩️ Retirez d\'abord la ventilation des cellules', 2600); return }
  v.parts[i][champ] = val
  autoSave()
  refreshSheet(htmlVentilation(v))
}

function ajouterPartVentilation(id) {
  const v = ventilations().find(x => x.id === id); if (!v || v.applique) return
  v.parts.push({ key: '', pct: '' })
  autoSave()
  refreshSheet(htmlVentilation(v))
}

function retirerPartVentilation(id, i) {
  const v = ventilations().find(x => x.id === id); if (!v || v.applique) return
  v.parts.splice(i, 1)
  if (v.parts.length === 0) v.parts.push({ key: '', pct: '' })
  autoSave()
  refreshSheet(htmlVentilation(v))
}

// Écrit les montants dans les cellules et mémorise exactement ce qui a été
// écrit, pour pouvoir le défaire au centime près.
function appliquerVentilation(id) {
  if (guardClosed()) return
  const v = ventilations().find(x => x.id === id); if (!v || v.applique) return
  const montant = num(v.montant)
  const mi = monthOf(v.date)
  if (!montant) { toast('⚠️ Indiquez le montant total'); return }
  if (mi < 0) { toast('⚠️ Indiquez la date de la dépense'); return }
  if (yearOf(v.date) !== activeYear) {
    toast('⚠️ La date n\'est pas dans l\'année ' + activeYear, 3000); return
  }
  const valides = (v.parts || []).filter(p => p.key && num(p.pct) > 0)
  if (valides.length === 0) { toast('⚠️ Affectez au moins un poste'); return }
  if (totalPctVentilation(v) > 100.005) { toast('⚠️ La répartition dépasse 100 %', 3000); return }

  v.applied = []
  valides.forEach(p => {
    const c = cibleParKey(p.key); if (!c) return
    // Arrondi au centime sur chaque part : la somme des parts peut s'écarter
    // du total d'un centime, ce qui est préférable à des cellules à 6 décimales.
    const part = Math.round(montant * num(p.pct)) / 100
    if (c.type === 'prop') {
      const avant = getMonthlyVal(c.propId, 'deductibles', c.cat, mi)
      setMonthlyVal(c.propId, 'deductibles', c.cat, mi, String(Math.round((avant + part) * 100) / 100))
    } else {
      const avant = num(state.vehicule.depenses[c.cat])
      state.vehicule.depenses[c.cat] = String(Math.round((avant + part) * 100) / 100)
    }
    v.applied.push({ key: p.key, mi, montant: part })
  })
  v.applique = true
  save()
  toast('✅ Ventilation appliquée')
  refreshSheet(htmlVentilation(v))
  refreshAll()
}

function retirerVentilation(id) {
  if (guardClosed()) return
  const v = ventilations().find(x => x.id === id); if (!v || !v.applique) return
  ;(v.applied || []).forEach(a => {
    const c = cibleParKey(a.key); if (!c) return
    if (c.type === 'prop') {
      const avant = getMonthlyVal(c.propId, 'deductibles', c.cat, a.mi)
      const apres = Math.round((avant - a.montant) * 100) / 100
      setMonthlyVal(c.propId, 'deductibles', c.cat, a.mi, apres === 0 ? '' : String(apres))
    } else {
      const apres = Math.round((num(state.vehicule.depenses[c.cat]) - a.montant) * 100) / 100
      state.vehicule.depenses[c.cat] = apres === 0 ? '' : String(apres)
    }
  })
  v.applique = false
  v.applied = []
  save()
  toast('↩️ Ventilation retirée')
  refreshSheet(htmlVentilation(v))
  refreshAll()
}

function supprimerVentilation(id) {
  if (guardClosed()) return
  const v = ventilations().find(x => x.id === id); if (!v) return
  if (v.applique && !confirm('Cette ventilation est appliquée. La supprimer retirera aussi les montants des cellules. Continuer ?')) return
  if (v.applique) retirerVentilation(id)
  const i = ventilations().findIndex(x => x.id === id)
  ventilations().splice(i, 1)
  save()
  closeSheet()
  toast('🗑️ Ventilation supprimée')
}

function renderVentilations() {
  const el = document.getElementById('ventil-body')
  if (!el) return
  const list = ventilations()

  const items = list.map(v => {
    const tot = totalPctVentilation(v)
    const detail = (v.parts || []).filter(p => p.key).map(p => {
      const c = cibleParKey(p.key)
      return c ? `${escH(c.groupe)} › ${escH(c.cat)} ${fmt(num(p.pct), 0)} %` : '—'
    }).join(' · ')
    return `<div class="trip-item" onclick="ouvrirVentilation('${v.id}')">
      <div class="trip-dot" style="background:${v.applique ? 'var(--green)' : 'var(--text2)'}"></div>
      <div class="trip-info">
        <div class="trip-label">${escH(v.libelle || '(sans libellé)')}</div>
        <div class="trip-reason" style="font-size:11px">${detail || 'Répartition à compléter'}</div>
        <div class="trip-date">${fmtDate(v.date)} · ${fmt(tot, 0)} % affecté${v.applique ? ' · appliquée' : ''}</div>
      </div>
      <div class="trip-amounts"><div class="trip-money">${money(num(v.montant))}</div></div>
    </div>`
  }).join('')

  el.innerHTML = card('🧮 Dépenses ventilées — ' + activeYear, `
    ${infoBox(`Une dépense qui couvre plusieurs immeubles, ou partagée entre usage locatif et
      usage personnel, se saisit <strong>une fois</strong> ici avec sa clé de répartition.
      La trace reste attachée au dossier.`)}
    ${items || `<div class="empty-state">Aucune dépense ventilée</div>`}
    <button class="btn btn-primary btn-full" style="margin-top:10px" onclick="nouvelleVentilation()">➕ Nouvelle ventilation</button>
    ${list.some(v => !v.applique) ? warnBox('Certaines ventilations ne sont <strong>pas appliquées</strong> : leurs montants ne figurent pas encore dans vos totaux.') : ''}
  `, 'brown')
}

registerModule({
  id: 'ventilation',
  label: 'Ventilation des dépenses',
  render: renderVentilations
})
