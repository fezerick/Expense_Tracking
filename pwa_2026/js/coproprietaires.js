// ════════════════════════════════════════════════════════════════════════════
// coproprietaires.js — ÉTAT PAR COPROPRIÉTAIRE
//
// `pct` et `coOwners` étaient saisis pour chaque immeuble et ne servaient qu'à
// deux lignes du rapport PDF (9369 / 9946). Chaque copropriétaire devait donc
// refaire la division à la main pour sa propre déclaration — et l'app affichait
// partout ailleurs des totaux à 100 %, ce qui laissait croire que le bénéfice
// déclarable était le bénéfice entier.
//
// Ce module produit la part de chacun, immeuble par immeuble, et l'exporte.
// ════════════════════════════════════════════════════════════════════════════

// Un immeuble détenu à `pct` % par l'utilisateur et le reste par `coOwners`
// (texte libre, éventuellement plusieurs noms séparés par une virgule).
function partsImmeuble(prop) {
  const pct = clampPct(prop.pct)
  const parts = [{ nom: HOME_OWNER, pct, moi: true }]
  const autres = String(prop.coOwners || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)
  const reste = Math.max(0, 100 - pct)
  if (reste > 0) {
    if (autres.length === 0) {
      parts.push({ nom: 'Copropriétaire(s) non nommé(s)', pct: reste, moi: false, anonyme: true })
    } else {
      // À défaut d'une répartition saisie, on partage le reste à parts égales
      // entre les copropriétaires nommés — et on le dit.
      autres.forEach(nom => parts.push({ nom, pct: reste / autres.length, moi: false, reparti: autres.length > 1 }))
    }
  }
  return parts
}

// Agrège par personne sur l'ensemble des immeubles.
function etatParCoproprietaire() {
  const gens = {}
  let partagee = false
  activeProps().forEach(prop => {
    const t = propTotals(prop.id)
    const parts = partsImmeuble(prop)
    if (parts.length > 1) partagee = true
    parts.forEach(p => {
      const k = p.nom
      gens[k] = gens[k] || { nom: p.nom, moi: !!p.moi, rev: 0, dep: 0, cap: 0, net: 0, immeubles: [], reparti: false }
      const f = p.pct / 100
      gens[k].rev += t.rev * f
      gens[k].dep += t.dep * f
      gens[k].cap += t.cap * f
      gens[k].net += t.net * f
      gens[k].reparti = gens[k].reparti || !!p.reparti
      gens[k].immeubles.push({ label: shortLabel(prop.label), pct: p.pct,
                               rev: t.rev * f, dep: t.dep * f, net: t.net * f })
    })
  })
  const liste = Object.values(gens).sort((a, b) => (b.moi - a.moi) || (b.net - a.net))
  return { liste, partagee }
}

function renderCoproprietaires() {
  const el = document.getElementById('copro-body')
  if (!el) return
  const { liste, partagee } = etatParCoproprietaire()

  if (!setup.modules.props || liste.length === 0) { el.innerHTML = ''; return }

  if (!partagee) {
    el.innerHTML = card('👥 État par copropriétaire',
      infoBox(`Tous vos immeubles sont détenus à 100 %. Rien à répartir.<br>
        Si ce n'est pas le cas, corrigez le pourcentage de propriété dans
        <em>Réglages → Relancer l'assistant</em>.`), 'blue')
    return
  }

  const blocs = liste.map(p => {
    const rows = p.immeubles.map(im => tr([
      escH(im.label) + ` <span style="color:var(--text2)">(${fmt(im.pct, im.pct % 1 ? 2 : 0)} %)</span>`,
      [money(im.rev), 'right'], [money(im.dep), 'right'],
      [`<span style="font-weight:700;color:${im.net >= 0 ? 'var(--green)' : '#C00000'}">${money(im.net)}</span>`, 'right']
    ]))
    const foot = tr(['TOTAL', [money(p.rev), 'right'], [money(p.dep), 'right'],
                     [money(p.net), 'right']], 'total-tr')
    return card(
      (p.moi ? '🙋 ' : '👤 ') + escH(p.nom) + (p.moi ? ' <span style="font-weight:400;opacity:.8">— vous</span>' : ''),
      `${table(['Immeuble', ['Revenus', 'right'], ['Dépenses', 'right'], ['Bénéfice', 'right']], rows, foot)}
       ${p.cap > 0 ? sourceNote(`Part des dépenses en capital (non déduites, à amortir) : <strong>${money(p.cap)}</strong>`) : ''}
       ${p.reparti ? sourceNote('⚠️ Plusieurs copropriétaires nommés : le solde a été partagé à parts égales faute d\'une répartition saisie.') : ''}`,
      p.moi ? 'blue' : 'dark')
  }).join('')

  el.innerHTML = `
    ${card('👥 État par copropriétaire — ' + activeYear, `
      ${infoBox(`Chaque copropriétaire déclare sa part des revenus et des dépenses, pas le total de l'immeuble.
        C'est aussi ce qui va aux lignes <strong>9369</strong> et <strong>9946</strong> du T776 / TP-128.`)}
      <button class="btn btn-ghost btn-sm btn-full" onclick="exportCoproprietairesCSV()">📊 Exporter la répartition (CSV)</button>
      <button class="btn btn-ghost btn-sm btn-full" style="margin-top:6px" onclick="ouvrirRepartitionDetaillee()">⚖️ Répartition détaillée par personne</button>
    `, 'blue')}
    ${blocs}`
}

// Permet de nommer précisément plusieurs copropriétaires et leur pourcentage
// respectif, au lieu du partage égal par défaut.
function ouvrirRepartitionDetaillee() {
  const props = activeProps()
  const html = props.map(p => {
    const parts = partsImmeuble(p)
    return `<div style="margin-bottom:14px">
      <div style="font-weight:700;font-size:14px;margin-bottom:4px">${propIcon(p)} ${escH(p.label)}</div>
      <div class="field">
        <label>Votre part (%)</label>
        <input type="number" class="inp" min="0" max="100" step="0.01" value="${clampPct(p.pct)}"
          oninput="majPartProp('${p.id}', this.value)">
      </div>
      <div class="field">
        <label>Copropriétaire(s) — séparés par une virgule</label>
        <input type="text" class="inp" value="${escH(p.coOwners || '')}"
          placeholder="ex: Marie Tremblay, Jean Dubois"
          oninput="majCoOwners('${p.id}', this.value)">
      </div>
      ${sourceNote(parts.map(x => `${escH(x.nom)} : ${fmt(x.pct, 2)} %`).join(' · '))}
    </div>`
  }).join('<hr>')

  openSheet('⚖️ Répartition de la propriété', html || infoBox('Aucun immeuble configuré.'),
            () => { renderCoproprietaires(); refreshAll() })
}

function majPartProp(propId, val) {
  if (guardClosed()) return
  const p = propById(propId); if (!p) return
  p.pct = clampPct(val)
  saveSetup()
}

function majCoOwners(propId, val) {
  if (guardClosed()) return
  const p = propById(propId); if (!p) return
  p.coOwners = String(val || '').trim()
  saveSetup()
}

function exportCoproprietairesCSV() {
  const { liste } = etatParCoproprietaire()
  const lignes = [csvLigne(['Copropriétaire', 'Immeuble', 'Part (%)', 'Revenus', 'Dépenses déductibles', 'Bénéfice'])]
  liste.forEach(p => {
    p.immeubles.forEach(im => lignes.push(csvLigne([
      p.nom, im.label, fmt(im.pct, 2), fmt(im.rev), fmt(im.dep), fmt(im.net)
    ])))
    lignes.push(csvLigne([p.nom, 'TOTAL', '', fmt(p.rev), fmt(p.dep), fmt(p.net)]))
  })
  dl(`repartition_coproprietaires_${activeYear}.csv`, '﻿' + lignes.join('\n'), 'text/csv;charset=utf-8')
  toast('📊 Répartition exportée')
}

registerModule({
  id: 'coproprietaires',
  label: 'État par copropriétaire',
  render: renderCoproprietaires
})
