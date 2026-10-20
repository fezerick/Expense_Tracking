// ════════════════════════════════════════════════════════════════════════════
// recus.js — AUDIT DES PIÈCES JUSTIFICATIVES + LECTURE OCR
//
// Deux manques distincts :
//
// 1. Les reçus étaient stockés par cellule mais rien ne disait LESQUELLES n'en
//    avaient pas. Or c'est exactement la liste que produit une vérification :
//    « montrez-moi la pièce pour ce 1 480 $ d'entretien ». Trois ans après,
//    reconstituer la pièce est impossible ; la détecter en janvier est trivial.
//
// 2. Le montant était retapé à la main alors que la photo le contient. L'OCR
//    (Tesseract.js, chargé à la demande) le lit et le propose.
// ════════════════════════════════════════════════════════════════════════════

const TESSERACT_CDN = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'

// ── Décodage d'une clé de reçu : `${propId}_${section}_${cat}_${mi}` ──
// La catégorie peut contenir des underscores (« Système d'alarme » non, mais
// « Rénovation / Amélioration — Logement 1 » oui si renommée) : on découpe donc
// par les extrémités, pas par un split naïf.
function parseCleRecu(key) {
  const m = String(key).match(/^(.+?)_(revenus|deductibles|capital)_(.*)_(\d{1,2})$/)
  if (!m) return null
  return { propId: m[1], section: m[2], cat: m[3], mi: parseInt(m[4], 10) }
}

function cleRecu(propId, section, cat, mi) { return `${propId}_${section}_${cat}_${mi}` }

// ── AUDIT ──────────────────────────────────────────────────────────────────
function auditRecus(opts = {}) {
  const seuil = opts.seuil != null ? opts.seuil : 0
  const manquants = []
  const presents = []
  const recus = state.receipts || {}

  activeProps().forEach(prop => {
    ;['deductibles', 'capital'].forEach(section => {
      (prop[section] || []).forEach(cat => {
        // « Frais de déplacement » est alimenté par le journal de trajets :
        // sa pièce justificative est le registre de kilométrage, pas un reçu.
        if (section === 'deductibles' && cat === 'Frais de déplacement') return
        for (let mi = 0; mi < 12; mi++) {
          const val = getMonthlyVal(prop.id, section, cat, mi)
          if (!val) continue
          const key = cleRecu(prop.id, section, cat, mi)
          const cible = { key, propId: prop.id, prop: shortLabel(prop.label), section, cat, mi, montant: val }
          if (recus[key]) presents.push(cible)
          else if (val >= seuil) manquants.push(cible)
        }
      })
    })
  })

  manquants.sort((a, b) => b.montant - a.montant)
  const montantManquant = manquants.reduce((s, m) => s + m.montant, 0)
  const montantPresent = presents.reduce((s, m) => s + m.montant, 0)
  const total = montantManquant + montantPresent
  return {
    manquants, presents, montantManquant, montantPresent, total,
    couverture: total > 0 ? montantPresent / total : 1
  }
}

function renderAuditRecus() {
  const el = document.getElementById('recus-body')
  if (!el) return
  const a = auditRecus()

  if (a.total === 0) {
    el.innerHTML = card('📎 Pièces justificatives',
      infoBox('Aucune dépense saisie pour ' + activeYear + '.'), 'green')
    return
  }

  const top = a.manquants.slice(0, 25).map(m => `
    <div class="trip-item" onclick="openReceiptCamera('${escJS(m.key)}')">
      <div class="trip-dot" style="background:${m.montant >= 500 ? '#C00000' : 'var(--brown)'}"></div>
      <div class="trip-info">
        <div class="trip-label">${escH(m.cat)}</div>
        <div class="trip-date">${escH(m.prop)} · ${MONTHS_FR[m.mi]}${m.section === 'capital' ? ' · capital' : ''}</div>
      </div>
      <div class="trip-amounts">
        <div class="trip-money">${money(m.montant)}</div>
        <div class="trip-km" style="font-size:10px">📷 joindre</div>
      </div>
    </div>`).join('')

  el.innerHTML = card('📎 Pièces justificatives — ' + activeYear, `
    <div class="summary-row">
      ${sumCard('Couvert par un reçu', fmt(a.couverture * 100, 0) + ' %',
                a.couverture >= 0.9 ? 'green' : a.couverture >= 0.6 ? 'orange' : 'red',
                money(a.montantPresent) + ' sur ' + money(a.total))}
      ${sumCard('Sans pièce', money(a.montantManquant),
                a.manquants.length ? 'red' : 'green',
                a.manquants.length + ' montant(s)')}
    </div>
    ${a.manquants.length === 0
      ? infoBox('✅ Chaque montant saisi a une pièce jointe. C\'est exactement l\'état dans lequel une vérification se passe bien.')
      : `${infoBox(`Classé du plus gros au plus petit : c'est l'ordre dans lequel une vérification
           les demandera. Touchez une ligne pour photographier la pièce.`)}
         ${top}
         ${a.manquants.length > 25 ? sourceNote(`… et ${a.manquants.length - 25} autre(s). Exportez la liste complète ci-dessous.`) : ''}`}
    <button class="btn btn-ghost btn-sm btn-full" style="margin-top:10px" onclick="exporterAuditRecus()">📊 Exporter la liste (CSV)</button>
    ${a.presents.length ? `<button class="btn btn-ghost btn-sm btn-full" style="margin-top:6px" onclick="ouvrirLectureOCR()">🔍 Lire les reçus par OCR</button>` : ''}
    ${sourceNote(`L'ARC et Revenu Québec exigent la conservation des pièces <strong>six ans</strong>
      après la fin de l'année d'imposition visée. Les photos stockées ici comptent comme pièces,
      à condition d'être lisibles.`)}
  `, 'green')
}

function exporterAuditRecus() {
  const a = auditRecus()
  const lignes = [csvLigne(['Statut', 'Immeuble', 'Section', 'Catégorie', 'Mois', 'Montant'])]
  a.manquants.forEach(m => lignes.push(csvLigne(['SANS PIÈCE', m.prop, m.section, m.cat, MONTHS_FR[m.mi], fmt(m.montant)])))
  a.presents.forEach(m => lignes.push(csvLigne(['reçu joint', m.prop, m.section, m.cat, MONTHS_FR[m.mi], fmt(m.montant)])))
  dl(`audit_pieces_${activeYear}.csv`, '﻿' + lignes.join('\n'), 'text/csv;charset=utf-8')
  toast('📊 Liste exportée')
}

// ── OCR ────────────────────────────────────────────────────────────────────
// Tesseract.js tourne entièrement dans le navigateur : aucune image de facture
// ne quitte l'appareil. Le modèle de langue (~2 Mo) est téléchargé une fois.
let _ocrPret = false
async function chargerOCR() {
  if (_ocrPret) return
  await loadScript(TESSERACT_CDN)
  if (typeof Tesseract === 'undefined') throw new Error('Tesseract indisponible')
  _ocrPret = true
}

// Extraction des montants. Un reçu contient beaucoup de nombres (quantités,
// numéros de caisse, sous-totaux, taxes) : on privilégie celui qui suit un mot
// marquant le total, et on retient le plus grand à défaut.
function extraireMontants(texte) {
  const t = texte.replace(/ /g, ' ')
  const motifs = /(-?\d{1,3}(?:[ .,]\d{3})*(?:[.,]\d{2}))/g
  const parseMontant = s => {
    const net = s.replace(/[ ]/g, '')
    // Le dernier séparateur à 2 décimales est le séparateur décimal.
    const m = net.match(/^(-?.*)([.,])(\d{2})$/)
    if (!m) return NaN
    return parseFloat(m[1].replace(/[.,]/g, '') + '.' + m[3])
  }

  const tous = []
  let m
  while ((m = motifs.exec(t)) !== null) {
    const v = parseMontant(m[1])
    if (!isNaN(v) && v > 0 && v < 1e7) tous.push({ v, i: m.index })
  }
  if (tous.length === 0) return { montant: null, candidats: [] }

  // Mots-clés de total, du plus fiable au moins fiable.
  const cles = [/\btotal\s*(?:à payer|a payer|dû|du)?\b/gi, /\bmontant\s*(?:total|dû|du)?\b/gi, /\bsolde\b/gi]
  for (const cle of cles) {
    let k
    while ((k = cle.exec(t)) !== null) {
      // Le montant d'un total suit son libellé, sur la même ligne ou la suivante.
      const proche = tous.filter(x => x.i > k.index && x.i - k.index < 60)
      if (proche.length) {
        return { montant: proche[0].v, candidats: [...new Set(tous.map(x => x.v))].sort((a, b) => b - a), source: 'mot-clé' }
      }
    }
  }
  const max = Math.max(...tous.map(x => x.v))
  return { montant: max, candidats: [...new Set(tous.map(x => x.v))].sort((a, b) => b - a), source: 'plus grand montant' }
}

const MOIS_OCR = ['janv', 'févr|fevr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août|aout', 'sept', 'oct', 'nov', 'déc|dec']

function extraireDate(texte, annee) {
  const t = texte.toLowerCase()
  // ISO : 2026-03-14
  let m = t.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (m) return iso(+m[1], +m[2], +m[3])
  // JJ/MM/AAAA — l'ordre jour-mois est la convention au Québec.
  m = t.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})\b/)
  if (m) return iso(+m[3], +m[2], +m[1])
  // 14 mars 2026
  for (let i = 0; i < 12; i++) {
    const re = new RegExp('\\b(\\d{1,2})\\s*(?:er)?\\s*(?:' + MOIS_OCR[i] + ')\\.?\\s*(20\\d{2})?', 'i')
    const mm = t.match(re)
    if (mm) return iso(mm[2] ? +mm[2] : annee, i + 1, +mm[1])
  }
  return null

  function iso(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
}

// Lit un reçu déjà stocké et propose son montant / sa date.
async function lireRecuOCR(key) {
  const src = (state.receipts || {})[key]
  if (!src) { toast('⚠️ Aucun reçu joint à cette cellule'); return }
  const cible = parseCleRecu(key)
  openSheet('🔍 Lecture du reçu', `${infoBox('Lecture en cours… le modèle de langue (~2 Mo) est téléchargé la première fois seulement.')}
    <div style="text-align:center;padding:20px;font-size:28px">⏳</div>
    <div id="ocr-progress" style="text-align:center;font-size:12px;color:var(--text2)"></div>`)
  try {
    await chargerOCR()
    const res = await Tesseract.recognize(src, 'fra', {
      logger: p => {
        const el = document.getElementById('ocr-progress')
        if (el && p.status) el.textContent = p.status + (p.progress ? ' ' + Math.round(p.progress * 100) + ' %' : '')
      }
    })
    const texte = res.data.text || ''
    const { montant, candidats, source } = extraireMontants(texte)
    const date = extraireDate(texte, activeYear)
    const actuel = cible ? getMonthlyVal(cible.propId, cible.section, cible.cat, cible.mi) : 0

    const autres = candidats.filter(c => c !== montant).slice(0, 6)
    refreshSheet(`
      ${montant == null
        ? warnBox('Aucun montant reconnu. La photo est peut-être floue ou trop sombre : reprenez-la en plein cadre, bien à plat.')
        : `<div class="summary-row">
             ${sumCard('Montant lu', money(montant), 'green', source)}
             ${sumCard('Cellule actuelle', actuel ? money(actuel) : '—', 'gray',
                       cible ? escH(cible.cat) + ' · ' + MONTHS_FR[cible.mi] : '')}
           </div>
           ${date ? sourceNote('Date lue sur le reçu : <strong>' + escH(date) + '</strong>'
                     + (cible && monthOf(date) !== cible.mi
                        ? ' — ⚠️ ce n’est pas le mois de la cellule (' + MONTHS_FR[cible.mi] + ')' : '')) : ''}
           <button class="btn btn-primary btn-full" style="margin-top:10px"
             onclick="appliquerMontantOCR('${escJS(key)}',${montant})">✅ Inscrire ${money(montant)} dans la cellule</button>
           ${autres.length ? `<div class="divider"></div><div class="section-title">Autres montants lus</div>
             ${autres.map(c => `<button class="btn btn-ghost btn-sm btn-full" style="margin-bottom:4px"
                onclick="appliquerMontantOCR('${escJS(key)}',${c})">${money(c)}</button>`).join('')}` : ''}`}
      <div class="divider"></div>
      <details><summary style="font-size:12px;color:var(--text2);cursor:pointer">Texte reconnu</summary>
        <pre style="white-space:pre-wrap;font-size:10px;color:var(--text2);max-height:200px;overflow:auto">${escH(texte.slice(0, 2000))}</pre>
      </details>
      ${sourceNote('La reconnaissance se fait entièrement sur l’appareil : aucune image de facture n’est envoyée sur un serveur.')}`)
  } catch (e) {
    refreshSheet(warnBox('Lecture impossible : ' + escH(e.message)))
  }
}

function appliquerMontantOCR(key, montant) {
  if (guardClosed()) return
  const c = parseCleRecu(key)
  if (!c) { toast('⚠️ Cellule introuvable'); return }
  setMonthlyVal(c.propId, c.section, c.cat, c.mi, String(montant))
  save()
  closeSheet()
  toast('✅ ' + money(montant) + ' inscrit')
  refreshAll()
}

// Liste les reçus joints et permet de les relire un par un.
function ouvrirLectureOCR() {
  const a = auditRecus()
  const items = a.presents.map(p => `
    <div class="trip-item" onclick="lireRecuOCR('${escJS(p.key)}')">
      <div class="trip-info">
        <div class="trip-label">${escH(p.cat)}</div>
        <div class="trip-date">${escH(p.prop)} · ${MONTHS_FR[p.mi]}</div>
      </div>
      <div class="trip-amounts"><div class="trip-money">${money(p.montant)}</div>
        <div class="trip-km" style="font-size:10px">🔍 lire</div></div>
    </div>`).join('')
  openSheet('🔍 Reçus joints', `
    ${infoBox('La lecture OCR compare le montant de la photo avec celui saisi : elle sert surtout à repérer une faute de frappe.')}
    ${items || '<div class="empty-state">Aucun reçu joint</div>'}`)
}

registerModule({
  id: 'recus',
  label: 'Pièces justificatives',
  render: renderAuditRecus
})
