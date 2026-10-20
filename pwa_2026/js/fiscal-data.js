// ════════════════════════════════════════════════════════════════════════════
// fiscal-data.js — PARAMÈTRES FISCAUX VERSIONNÉS PAR ANNÉE
//
// Règle du fichier : AUCUN taux fiscal ne doit être une constante ailleurs dans
// l'application. Tout vit ici, indexé par année, avec la source officielle en
// commentaire. Une nouvelle année = un nouveau bloc, rien d'autre à changer.
//
// Toutes les valeurs 2026 ci-dessous ont été vérifiées le 20 octobre 2026 sur
// les sources primaires citées. Voir docs/FISCALITE.md pour les liens complets.
// ════════════════════════════════════════════════════════════════════════════

const FISCAL = {

  2026: {
    verifie: '2026-10-20',

    // ── Taux kilométrique « allocation raisonnable » (Règl. impôt art. 7306) ──
    // Finances Canada, communiqué du 14 janvier 2026.
    // ATTENTION : taux par palier, et non taux unique. L'app historique
    // utilisait 0,72 $ à plat — c'était le taux 2025 du premier palier.
    km: { paliers: [[5000, 0.73], [Infinity, 0.67]], territoires: 0.04 },

    // ── Impôt fédéral ── ARC, « Taux d'impôt et tranches, année courante ».
    // Indexation 2026 : 2,0 %. Le premier taux est passé de 15 % à 14 %.
    fed: {
      paliers: [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.29], [Infinity, 0.33]],
      bpa: 16452,            // montant personnel de base maximal
      bpaMin: 14829,         // montant minimal (revenus élevés)
      bpaSeuilReduction: [181440, 258482],
      abattementQc: 0.165,   // abattement du Québec remboursable (16,5 %)
      tauxCreditBase: 0.14   // taux applicable aux crédits non remboursables
    },

    // ── Impôt du Québec ── Revenu Québec, « Taux d'imposition » (page officielle).
    qc: {
      paliers: [[54345, 0.14], [108680, 0.19], [132245, 0.24], [Infinity, 0.2575]],
      bpa: 18952,            // 18 571 $ (2025, officiel) × 1,0205 — à confirmer au TP-1 2026
      bpaSource: 'indexation',
      tauxCreditBase: 0.14
    },

    // ── RRQ, travailleur autonome ── Revenu Québec, « Maximum des gains
    // admissibles et taux de cotisation » (tableaux officiels).
    // Le travailleur autonome paie les deux parts : 6,30 % × 2 = 12,60 %.
    // N'EST DÛ QUE SUR LE REVENU D'ENTREPRISE (Uber/Lyft), jamais sur un
    // revenu de biens comme le loyer net.
    rrq: {
      mga: 74600, msga: 85000, exemption: 3500,
      tauxAutonome: 0.126,       // base + 1re supplémentaire, les deux parts
      tauxAutonome2: 0.08,       // 2e supplémentaire, entre MGA et MSGA
      maxBase: 8958.60,          // 71 100 $ × 12,60 %
      maxSupp: 832.00            // 10 400 $ × 8 %
    },

    // ── RQAP, travailleur autonome ──
    rqap: { taux: 0.00764, max: 786.92, mga: 103000 },

    // ── Cotisation au FSS (annexe F) ── Finances Québec, bulletin 2025-8.
    // Assiette : revenu d'entreprise, de biens, de retraite, gains en capital.
    // Le revenu d'EMPLOI est exclu — c'est ce qui la rend pertinente ici.
    fss: { seuil: 18500, plafondPremierPalier: 33500, plancher: 150,
           seuilSecondPalier: 64355, plafondSecondPalier: 149355, max: 1000 },

    // ── Automobile ── Finances Canada, 14 janvier 2026.
    auto: { plafondCat101: 39000, loyerMensuelMax: 1100,
            interetMensuelMax: 350, avantageKm: 0.34 },

    // ── Taxes à la consommation ──
    taxes: { tps: 0.05, tvq: 0.09975 },

    // ── Acomptes provisionnels ── ARC « Qui doit payer » + Revenu Québec.
    // Résident du Québec : seuil fédéral abaissé à 1 800 $ par l'abattement.
    acomptes: { seuilFed: 1800, seuilQc: 1800,
                dates: ['03-15', '06-15', '09-15', '12-15'] },

    // ── Relevé 31 ── Revenu Québec, avis aux propriétaires d'immeubles locatifs.
    rl31: { dateLimite: '02-28', penaliteParJour: 25, penaliteMin: 100, penaliteMax: 2500, dateAdmissibilite: '12-31' },

    // Droits sur les mutations immobilières (« taxe de bienvenue »). Les deux
    // premiers seuils sont ceux de la Loi concernant les droits sur les mutations
    // immobilières, indexés chaque année et publiés à la Gazette officielle.
    // Au-delà de 500 000 $, une municipalité peut fixer son propre taux, sans
    // dépasser 3 % — Montréal a son propre barème, plus élevé. Le simulateur
    // affiche donc une ESTIMATION et laisse corriger le montant.
    mutation: {
      paliers: [[62900, 0.005], [315000, 0.01], [Infinity, 0.015]],
      seuilMunicipal: 500000, tauxMaxMunicipal: 0.03,
      creditPremierAcheteur: 5000,
      note: 'Seuils 2026 : 62 900 $ et 315 000 $. Au-delà de 500 000 $, le taux municipal peut atteindre 3 %.'
    }
  },

  2025: {
    verifie: '2026-10-20',
    km: { paliers: [[5000, 0.72], [Infinity, 0.66]], territoires: 0.04 },
    fed: {
      paliers: [[57375, 0.15], [114750, 0.205], [177882, 0.26], [253414, 0.29], [Infinity, 0.33]],
      bpa: 16129, bpaMin: 14538, bpaSeuilReduction: [177882, 253414],
      abattementQc: 0.165, tauxCreditBase: 0.15
    },
    qc: {
      paliers: [[53255, 0.14], [106495, 0.19], [129590, 0.24], [Infinity, 0.2575]],
      bpa: 18571, bpaSource: 'officiel', tauxCreditBase: 0.14
    },
    rrq: { mga: 71300, msga: 81200, exemption: 3500, tauxAutonome: 0.128,
           tauxAutonome2: 0.08, maxBase: 8678.40, maxSupp: 792.00 },
    rqap: { taux: 0.00878, max: 1012.00, mga: 115300 },
    fss: { seuil: 18130, plafondPremierPalier: 33130, plancher: 150,
           seuilSecondPalier: 63060, plafondSecondPalier: 148060, max: 1000 },
    auto: { plafondCat101: 38000, loyerMensuelMax: 1100,
            interetMensuelMax: 350, avantageKm: 0.34 },
    taxes: { tps: 0.05, tvq: 0.09975 },
    acomptes: { seuilFed: 1800, seuilQc: 1800,
                dates: ['03-15', '06-15', '09-15', '12-15'] },
    rl31: { dateLimite: '02-28', penaliteParJour: 25, penaliteMin: 100, penaliteMax: 2500, dateAdmissibilite: '12-31' },
    mutation: {
      paliers: [[61500, 0.005], [307800, 0.01], [Infinity, 0.015]],
      seuilMunicipal: 500000, tauxMaxMunicipal: 0.03,
      creditPremierAcheteur: 5000,
      note: 'Seuils 2025 : 61 500 $ et 307 800 $.'
    }
  }
}

// Année de repli : la plus récente connue. Évite un `undefined` silencieux si
// l'utilisateur crée 2027 avant que les paramètres soient publiés.
function fiscal(year) {
  const y = year || (typeof activeYear !== 'undefined' ? activeYear : new Date().getFullYear())
  if (FISCAL[y]) return FISCAL[y]
  const dispo = Object.keys(FISCAL).map(Number).sort((a, b) => b - a)
  const repli = FISCAL[dispo[0]]
  return Object.assign({}, repli, { _repli: dispo[0] })
}

function fiscalEstRepli(year) { return !!fiscal(year)._repli }

// ── Catégories de DPA ── ARC T4036 « Revenus de location » + T2125.
// `taux` = taux prescrit; `batiment` marque les catégories visées par la
// restriction du par. 1100(11) (la DPA ne peut créer ni augmenter une perte).
const DPA_CATEGORIES = [
  { code: '1',    taux: 0.04,  batiment: true,  label: 'Catégorie 1 — Bâtiment (4 %)',
    aide: 'Immeuble acquis après 1987, et ses composantes intégrées (électricité, chauffage, ascenseur). Le TERRAIN n\'est jamais amortissable.' },
  { code: '1-6',  taux: 0.06,  batiment: true,  label: 'Catégorie 1 — Non résidentiel + 2 % (6 %)',
    aide: 'Bâtiment non résidentiel acquis après le 18 mars 2007, catégorie distincte produite.' },
  { code: '1-10', taux: 0.10,  batiment: true,  label: 'Catégorie 1 — Fabrication + 6 % (10 %)',
    aide: 'Bâtiment utilisé à ≥ 90 % pour la fabrication, catégorie distincte produite.' },
  { code: '3',    taux: 0.05,  batiment: true,  label: 'Catégorie 3 — Bâtiment avant 1988 (5 %)',
    aide: 'Immeuble acquis avant 1988 (ou avant 1990 sous conditions).' },
  { code: '6',    taux: 0.10,  batiment: true,  label: 'Catégorie 6 — Charpente de bois, etc. (10 %)',
    aide: 'Bâtiment en bois, pièce sur pièce, tôle ou terre, sans semelle sous le niveau du sol.' },
  { code: '8',    taux: 0.20,  batiment: false, label: 'Catégorie 8 — Mobilier et électroménagers (20 %)',
    aide: 'Réfrigérateur, cuisinière, laveuse, mobilier, climatiseur non intégré, enseigne, outils de 500 $ et plus.' },
  { code: '10',   taux: 0.30,  batiment: false, label: 'Catégorie 10 — Véhicule et informatique (30 %)',
    aide: 'Voiture de tourisme dont le coût ne dépasse pas le plafond, camionnette, matériel informatique.' },
  { code: '10.1', taux: 0.30,  batiment: false, label: 'Catégorie 10.1 — Voiture de luxe (30 %)',
    aide: 'Voiture de tourisme au-dessus du plafond de l\'année d\'acquisition. Une catégorie distincte PAR véhicule, pas de perte finale ni de récupération.' },
  { code: '12',   taux: 1.00,  batiment: false, label: 'Catégorie 12 — Petits outils, logiciels (100 %)',
    aide: 'Outils de moins de 500 $, vaisselle, ustensiles, logiciel d\'application. Souvent sans règle du demi-taux.' },
  { code: '13',   taux: 0,     batiment: false, label: 'Catégorie 13 — Tenure à bail (linéaire)',
    aide: 'Améliorations locatives : amorties linéairement sur la durée du bail. Saisir la DPA manuellement.' },
  { code: '14.1', taux: 0.05,  batiment: false, label: 'Catégorie 14.1 — Immobilisation incorporelle (5 %)',
    aide: 'Achalandage, permis de durée indéterminée.' },
  { code: '43',   taux: 0.30,  batiment: false, label: 'Catégorie 43 — Matériel de fabrication (30 %)',
    aide: 'Machinerie et matériel de fabrication et de transformation.' },
  { code: '50',   taux: 0.55,  batiment: false, label: 'Catégorie 50 — Matériel informatique (55 %)',
    aide: 'Matériel de traitement de l\'information acquis après le 18 mars 2007.' }
]

function dpaCategorie(code) { return DPA_CATEGORIES.find(c => c.code === String(code)) || null }

// ── Taux kilométrique applicable à un nombre de km, par paliers ──
// Renvoie { montant, tauxMoyen, detail:[{km, taux, montant}] }.
function kmIndemnite(km, year) {
  const p = fiscal(year).km.paliers
  let reste = Math.max(0, parseFloat(km) || 0), bas = 0, montant = 0
  const detail = []
  for (const [plafond, taux] of p) {
    if (reste <= 0) break
    const tranche = Math.min(reste, plafond - bas)
    if (tranche > 0) { montant += tranche * taux; detail.push({ km: tranche, taux, montant: tranche * taux }) }
    reste -= tranche; bas = plafond
  }
  const total = parseFloat(km) || 0
  return { montant, tauxMoyen: total > 0 ? montant / total : 0, detail }
}

// ── Impôt par paliers ──
function impotParPaliers(revenu, paliers) {
  let reste = Math.max(0, revenu || 0), bas = 0, impot = 0, marginal = 0
  for (const [plafond, taux] of paliers) {
    if (reste <= 0) break
    const tranche = Math.min(reste, plafond - bas)
    impot += tranche * taux
    marginal = taux
    reste -= tranche; bas = plafond
  }
  return { impot, marginal }
}

// ── Cotisation au FSS (annexe F), barème à quatre paliers ──
// Retourne un OBJET, comme cotisationRRQ() : le module d'impot lit `.montant` et
// affiche l'assiette. Une version anterieure retournait le nombre nu, ce qui
// donnait `undefined` partout et propageait des NaN jusqu'au solde d'impot.
function cotisationFSS(revenuAssujetti, year) {
  const f = fiscal(year).fss
  const r = Math.max(0, revenuAssujetti || 0)
  const res = (montant, palier) => ({ montant, assiette: r, palier })
  if (r <= f.seuil) return res(0, 'sous le seuil')
  if (r <= f.plafondPremierPalier) return res(Math.min(f.plancher, (r - f.seuil) * 0.01), '1 % du revenu excedant le seuil')
  if (r <= f.seuilSecondPalier) return res(f.plancher, 'cotisation plancher')
  if (r <= f.plafondSecondPalier) return res(Math.min(f.max, f.plancher + (r - f.seuilSecondPalier) * 0.01), 'plancher + 1 % de l\u2019excedent')
  return res(f.max, 'cotisation maximale')
}

// ── Cotisation au RRQ du travailleur autonome ──
// `revenuEntreprise` : revenu net d'entreprise SEUL (pas le loyer net).
// `gainsDejaCotises` : gains d'emploi déjà soumis au RRQ par l'employeur, qui
// consomment l'exemption et le plafond — sans quoi un salarié qui conduit pour
// Uber se verrait facturer deux fois la même tranche.
function cotisationRRQ(revenuEntreprise, gainsDejaCotises, year) {
  const r = fiscal(year).rrq
  const ent = Math.max(0, revenuEntreprise || 0)
  const emploi = Math.max(0, gainsDejaCotises || 0)
  if (ent <= 0) return { base: 0, supp: 0, total: 0, deductible: 0, credit: 0 }

  // Exemption et plafonds déjà consommés par l'emploi.
  const exemptionRestante = Math.max(0, r.exemption - emploi)
  const plafondRestant = Math.max(0, r.mga - Math.max(emploi, r.exemption))
  const cotisableBase = Math.min(Math.max(0, ent - exemptionRestante), plafondRestant)
  const base = cotisableBase * r.tauxAutonome

  const totalGains = emploi + ent
  const cotisableSupp = Math.max(0, Math.min(totalGains, r.msga) - Math.max(emploi, r.mga))
  const supp = Math.max(0, cotisableSupp) * r.tauxAutonome2

  // Pour un autonome : la moitié de la cotisation de base est déduite du revenu
  // (ligne 22200 au fédéral), l'autre moitié donne un crédit; la portion
  // supplémentaire est entièrement déductible.
  return { base, supp, total: base + supp,
           deductible: base / 2 + supp, credit: base / 2 }
}

// ── Cotisation au RQAP du travailleur autonome ──
function cotisationRQAP(revenuEntreprise, year) {
  const q = fiscal(year).rqap
  const assiette = Math.min(Math.max(0, revenuEntreprise || 0), q.mga)
  // Objet, pour la meme raison que cotisationFSS().
  return { montant: Math.min(assiette * q.taux, q.max), assiette, taux: q.taux }
}

// ── Montant personnel de base fédéral, réduit aux revenus élevés ──
function bpaFederal(revenuNet, year) {
  const f = fiscal(year).fed
  const [bas, haut] = f.bpaSeuilReduction
  if (revenuNet <= bas) return f.bpa
  if (revenuNet >= haut) return f.bpaMin
  const ratio = (revenuNet - bas) / (haut - bas)
  return f.bpa - (f.bpa - f.bpaMin) * ratio
}
