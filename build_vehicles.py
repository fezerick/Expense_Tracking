import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

# ── Data from PDFs ──────────────────────────────────────────────
UBER_PDF = {
    'rides_gross': 8423.35, 'green_surcharge': 10.50, 'booking_fee': 1009.84,
    'mtq_dues': 404.82, 'airport_fee': 170.62, 'tolls': 28.86,
    'tips_rides': 425.49, 'gst_riders': 501.06, 'qst_riders': 999.36,
    'total_gross': 11973.90,
    'service_fee': 2103.05, 'other_fees': 1180.46, 'fee_discount': 13.05,
    'gst_paid_uber': 164.16, 'qst_paid_uber': 325.95, 'total_fees': 3760.57,
    'supplies_excl_tax': 10019.13, 'gst_remitted': 273.52, 'qst_remitted': 617.18,
    'eats_gross': 600.00, 'eats_tips': 610.98,
    'other_income': 592.94,
    'km_on_trip': 6581, 'km_online': 15286,
}

# 0-indexed months (6=Jul, 11=Dec)
LYFT_MONTHLY = {
    6:  {'taxable': 100.51, 'bonuses': 0.00,  'tips': 7.00,  'fees': 29.02, 'km': 87.702},
    7:  {'taxable': 387.59, 'bonuses': 21.26, 'tips': 10.00, 'fees': 46.32, 'km': 393.101},
    8:  {'taxable': 212.88, 'bonuses': 23.80, 'tips': 9.40,  'fees': 37.73, 'km': 208.015},
    9:  {'taxable': 268.22, 'bonuses': 17.59, 'tips': 10.00, 'fees': 17.10, 'km': 238.990},
    10: {'taxable': 178.08, 'bonuses': 27.40, 'tips': 2.00,  'fees': 17.39, 'km': 149.085},
    11: {'taxable': 229.98, 'bonuses': 4.48,  'tips': 2.00,  'fees': 38.38, 'km': 155.364},
}
MONTHS_FR = ["Janvier","Février","Mars","Avril","Mai","Juin",
             "Juillet","Août","Septembre","Octobre","Novembre","Décembre"]

# ── Cross-sheet cell references (must stay in sync with layout) ──
LYFT_KM_TOTAL_CELL = "G18"         # Total km row in Lyft sheet
VEH_KM_TOTAL_ANNUAL_CELL = "C6"   # Total annual km in Véhicule sheet
VEH_KM_UBER_CELL = "C10"          # Uber km in Véhicule sheet
VEH_KM_LYFT_CELL = "C11"          # Lyft km ref in Véhicule sheet
VEH_UBER_DED_CELL = "D26"         # Uber deductible total in Véhicule sheet
VEH_LYFT_DED_CELL = "E26"         # Lyft deductible total in Véhicule sheet
DEP_VEHICLE_CATS = [
    "Frais de plaque / immatriculation",
    "Frais de carburant (total annuel)",
    "Frais d'assurance",
    "Frais de permis de conduire",
    "Changement d'huile",
    "Achat et changement de pneus",
    "Frais de réparation",
    "Autres réparations / accessoires",
    "Forfait annuel téléphone",
    "Autres dépenses véhicule",
]

# ── Style constants ──
DARK="FF1F3864"; BLUE="FF0070C0"; GREEN_HDR="FF375623"
LIGHT="FFD9E1F2"; ORANGE="FFFFF2CC"; GRAY="FFF2F2F2"; WHITE="FFFFFFFF"
GREEN_LIGHT="FFE2EFDA"; RED_LIGHT="FFFCE4D6"
PDF_FILL="FFD9EAD3"   # darker green = value from official PDF

def tb():
    s=Side(style='thin',color='FF000000')
    return Border(left=s,right=s,top=s,bottom=s)

def fill(c): return PatternFill("solid",fgColor=c)
def ctr(): return Alignment(horizontal="center",vertical="center",wrap_text=True)
def lft(): return Alignment(horizontal="left",vertical="center",wrap_text=True)

def hdr(cell, text, bg=DARK, fg="FFFFFFFF", size=10, bold=True):
    cell.value=text
    cell.font=Font(name="Arial",bold=bold,size=size,color=fg)
    cell.fill=fill(bg); cell.alignment=ctr(); cell.border=tb()

def lbl(cell, text, bg=LIGHT, bold=False, left=True):
    cell.value=text
    cell.font=Font(name="Arial",bold=bold,size=10,color="FF000000")
    cell.fill=fill(bg)
    cell.alignment=lft() if left else ctr()
    cell.border=tb()

def inp(cell, bg=ORANGE):
    cell.fill=fill(bg); cell.font=Font(name="Arial",size=10,color="FF0000FF")
    cell.alignment=ctr(); cell.border=tb()
    cell.number_format='#,##0.00;(#,##0.00);-'

def pdf_val(cell, value, num_fmt='#,##0.00'):
    """Pre-filled from official PDF — styled distinctly"""
    cell.value=value
    cell.font=Font(name="Arial",size=10,color="FF1A4731",bold=True)
    cell.fill=fill(PDF_FILL); cell.alignment=ctr(); cell.border=tb()
    cell.number_format=num_fmt

def calc(cell, formula, bg=GRAY, bold=True):
    cell.value=formula
    cell.font=Font(name="Arial",bold=bold,size=10,color="FF000000")
    cell.fill=fill(bg); cell.alignment=ctr(); cell.border=tb()
    cell.number_format='#,##0.00;(#,##0.00);-'

def total_row(cell, formula, bg=DARK):
    cell.value=formula
    cell.font=Font(name="Arial",bold=True,size=10,color="FFFFFFFF")
    cell.fill=fill(bg); cell.alignment=ctr(); cell.border=tb()
    cell.number_format='#,##0.00;(#,##0.00);-'

def merge_hdr(ws, row, col_start, col_end, text, bg=DARK):
    ws.merge_cells(start_row=row,start_column=col_start,end_row=row,end_column=col_end)
    c=ws.cell(row=row,column=col_start)
    hdr(c,text,bg=bg)
    for col in range(col_start+1,col_end+1):
        ws.cell(row=row,column=col).fill=fill(bg)
    ws.row_dimensions[row].height=18

def set_widths(ws, w_dict):
    for col,w in w_dict.items():
        ws.column_dimensions[col].width=w

# ══════════════════════════════════════════════════════════════════
# SHEET: LYFT (REVENUS)  — built first so Vehicle sheet can ref it
# ══════════════════════════════════════════════════════════════════
def build_lyft(wb):
    ws = wb.create_sheet("Lyft (Revenus)")
    ws.freeze_panes = "B7"
    set_widths(ws, {"A":18,"B":14,"C":12,"D":12,"E":14,"F":14,"G":12,"H":12})

    # Title
    ws.merge_cells("A1:H1")
    t=ws["A1"]; t.value="REVENUS LYFT 2025 — ERIC IGOR Chomgwo FEZEU"
    t.font=Font(name="Arial",bold=True,size=13,color="FFFFFFFF")
    t.fill=fill("FFE91E8C"); t.alignment=ctr(); ws.row_dimensions[1].height=24

    ws.merge_cells("A2:H2")
    leg=ws["A2"]; leg.value="🟢 Vert foncé = données officielles pré-remplies depuis les relevés Lyft  |  🟡 Jaune = saisie manuelle  |  ⬜ Gris = calcul auto"
    leg.font=Font(name="Arial",italic=True,size=9,color="FF555555")
    leg.fill=fill(GRAY); leg.alignment=ctr()

    ws.merge_cells("A3:H3")
    note=ws["A3"]; note.value="⚠️  Données disponibles : Juillet à Décembre 2025 uniquement (Jan–Juin = 0$, service démarré en Juillet)"
    note.font=Font(name="Arial",italic=True,size=9,color="FF7B3F00")
    note.fill=fill("FFFFF2CC"); note.alignment=ctr()

    # ── Revenue section header ──
    merge_hdr(ws,4,1,8,"REVENUS DE COURSES — DÉTAIL MENSUEL",bg="FFB5177B")
    ws.row_dimensions[4].height=18

    # Column headers (row 5)
    headers=["Mois","Base taxable ($)","Primes ($)","Pourboires ($)","Frais Lyft ($)","Net reçu ($)","Km","Courses"]
    for ci,h in enumerate(headers,1):
        c=ws.cell(row=5,column=ci); hdr(c,h,bg=DARK)
    ws.row_dimensions[5].height=30

    # Monthly rows (rows 6-17, Jan=6, Dec=17)
    data_rows = []
    for mi in range(12):
        r = 6+mi
        data_rows.append(r)
        d = LYFT_MONTHLY.get(mi)
        month_cell = ws.cell(row=r,column=1)
        month_cell.value = MONTHS_FR[mi]
        month_cell.font = Font(name="Arial",size=10,color="FF000000",bold=(d is not None))
        month_cell.fill = fill(PDF_FILL if d else GRAY)
        month_cell.alignment = lft(); month_cell.border = tb()

        cols = ['taxable','bonuses','tips','fees']
        for ci,key in enumerate(cols,2):
            c = ws.cell(row=r,column=ci)
            if d:
                v = d[key]
                if key=='fees': v=-v  # fees are negative
                pdf_val(c,v)
            else:
                calc(c,0,bg=GRAY,bold=False)

        # Net = taxable + bonuses + tips - fees (stored as negative so + here)
        nc=ws.cell(row=r,column=6)
        if d:
            calc(nc, f"=B{r}+C{r}+D{r}+E{r}")  # E is already negative
        else:
            calc(nc, 0, bg=GRAY, bold=False)

        # Km
        kc=ws.cell(row=r,column=7)
        if d:
            pdf_val(kc, d['km'], num_fmt='#,##0.000')
        else:
            calc(kc, 0, bg=GRAY, bold=False)

        # Rides count (blank for 0 months, editable for active months)
        rc=ws.cell(row=r,column=8)
        if d:
            rides_map={6:5,7:19,8:13,9:13,10:13,11:14}
            pdf_val(rc, rides_map.get(mi,0), num_fmt='#,##0')
        else:
            calc(rc,0,bg=GRAY,bold=False)

    # Total row (row 18) — this is LYFT_KM_TOTAL_CELL row
    r=18
    assert r == int(LYFT_KM_TOTAL_CELL[1:]), f"Mismatch: expected row {LYFT_KM_TOTAL_CELL[1:]}, got {r}"
    ws.cell(row=r,column=1).value="TOTAL 2025"
    ws.cell(row=r,column=1).font=Font(name="Arial",bold=True,size=10,color="FFFFFFFF")
    ws.cell(row=r,column=1).fill=fill("FFB5177B"); ws.cell(row=r,column=1).border=tb(); ws.cell(row=r,column=1).alignment=lft()
    for ci in range(2,9):
        total_row(ws.cell(row=r,column=ci), f"=SUM({get_column_letter(ci)}6:{get_column_letter(ci)}17)", bg="FFB5177B")
        if ci==7: ws.cell(row=r,column=ci).number_format='#,##0.000'
        if ci==8: ws.cell(row=r,column=ci).number_format='#,##0'
    ws.row_dimensions[r].height=16

    # ── GST/QST section ──
    merge_hdr(ws,20,1,8,"TPS / TVQ — RÉSUMÉ",bg=DARK)
    gst_items = [
        ("TPS reçue des passagers (total)","=SUMIF(A6:A17,\"<>0\",B6:B17)*0",None),
    ]
    # Simple info rows
    gst_data = []
    for mi in range(12):
        d=LYFT_MONTHLY.get(mi)
        if d:
            row_r=6+mi
            gst_data.append(("TPS reçue — "+MONTHS_FR[mi], None, None))

    # Simplified: just note numbers
    note_r=21
    items_gst=[
        ("TPS totale reçue passagers (Jul-Déc)","CA$ 31.25"),
        ("TVQ totale reçue passagers (Jul-Déc)","CA$ 52.61"),
        ("TPS versée par Lyft (Jul-Déc)","CA$ 37.65"),
        ("TVQ versée par Lyft (Jul-Déc)","CA$ 84.88"),
    ]
    for label,val in items_gst:
        lbl(ws.cell(row=note_r,column=1),label,bg=LIGHT)
        ws.merge_cells(start_row=note_r,start_column=1,end_row=note_r,end_column=5)
        c=ws.cell(row=note_r,column=6)
        c.value=val; c.font=Font(name="Arial",size=10,bold=True,color="FF1A4731")
        c.fill=fill(PDF_FILL); c.alignment=ctr(); c.border=tb()
        ws.merge_cells(start_row=note_r,start_column=6,end_row=note_r,end_column=8)
        note_r+=1

    # ── Part dépenses véhicule ──
    note_r+=1
    merge_hdr(ws,note_r,1,8,"PART DES DÉPENSES VÉHICULE DÉDUCTIBLES",bg=GREEN_HDR)
    note_r+=1
    lbl(ws.cell(row=note_r,column=1),"Km Lyft (référencé dans Véhicule Commun)",bg=LIGHT)
    ws.merge_cells(start_row=note_r,start_column=1,end_row=note_r,end_column=5)
    calc(ws.cell(row=note_r,column=6),f"={LYFT_KM_TOTAL_CELL}")
    ws.merge_cells(start_row=note_r,start_column=6,end_row=note_r,end_column=8)

    note_r+=1
    lbl(ws.cell(row=note_r,column=1),"Montant déductible (depuis Véhicule Commun)",bg=LIGHT)
    ws.merge_cells(start_row=note_r,start_column=1,end_row=note_r,end_column=5)
    ded_c=ws.cell(row=note_r,column=6)
    ded_c.value=f"='Véhicule (Commun)'!{VEH_LYFT_DED_CELL}"
    ded_c.font=Font(name="Arial",size=10,bold=True,color="FF375623")
    ded_c.fill=fill(GREEN_LIGHT); ded_c.alignment=ctr(); ded_c.border=tb()
    ded_c.number_format='#,##0.00;(#,##0.00);-'
    ws.merge_cells(start_row=note_r,start_column=6,end_row=note_r,end_column=8)

    return ws


# ══════════════════════════════════════════════════════════════════
# SHEET: VÉHICULE (COMMUN)
# ══════════════════════════════════════════════════════════════════
def build_vehicle_commun(wb):
    ws = wb.create_sheet("Véhicule (Commun)")
    ws.freeze_panes = "A14"
    set_widths(ws, {"A":3,"B":42,"C":16,"D":20,"E":20,"F":20})

    # Title
    ws.merge_cells("A1:F1")
    t=ws["A1"]; t.value="DÉPENSES VÉHICULE 2025 — PARTAGÉES UBER & LYFT — Même véhicule, répartition par km"
    t.font=Font(name="Arial",bold=True,size=12,color="FFFFFFFF")
    t.fill=fill(DARK); t.alignment=ctr(); ws.row_dimensions[1].height=24

    ws.merge_cells("A2:F2")
    leg=ws["A2"]; leg.value="🟡 Jaune = saisie manuelle  |  🟢 Vert = depuis relevés officiels  |  ⬜ Gris = calcul auto  |  La répartition Uber/Lyft est calculée AU PRORATA des km"
    leg.font=Font(name="Arial",italic=True,size=9,color="FF555555")
    leg.fill=fill(GRAY); leg.alignment=ctr()

    # ── INFOS VÉHICULE (rows 4-6) ──
    merge_hdr(ws,4,2,6,"INFORMATIONS VÉHICULE",bg=DARK)

    r=5
    lbl(ws.cell(row=r,column=2),"Modèle / Marque",bold=True)
    c=ws.cell(row=r,column=3); inp(c,bg=ORANGE)
    c.number_format="@"
    ws.merge_cells(start_row=r,start_column=3,end_row=r,end_column=6)

    r=6; assert VEH_KM_TOTAL_ANNUAL_CELL==f"C{r}"
    lbl(ws.cell(row=r,column=2),"Kilométrage TOTAL annuel 2025 (odomètre)",bold=True)
    c=ws.cell(row=r,column=3); inp(c,bg=ORANGE); c.value=22000; c.number_format="#,##0"
    ws.cell(row=r,column=4).value="⚠️ À ajuster selon votre odomètre"
    ws.cell(row=r,column=4).font=Font(name="Arial",italic=True,size=9,color="FF7B3F00")
    ws.cell(row=r,column=4).fill=fill("FFFFF2CC"); ws.cell(row=r,column=4).border=tb()
    ws.merge_cells(start_row=r,start_column=4,end_row=r,end_column=6)

    # ── KILOMÉTRAGE PAR PLATEFORME (rows 8-12) ──
    merge_hdr(ws,8,2,6,"KILOMÉTRAGE PAR PLATEFORME & RÉPARTITION")

    r=9
    for ci,h in enumerate(["Plateforme","Km affaires","% du km total annuel","Source / Note"],2):
        hdr(ws.cell(row=r,column=ci),h,bg=DARK)
    ws.row_dimensions[r].height=28

    r=10; assert VEH_KM_UBER_CELL==f"C{r}"
    lbl(ws.cell(row=r,column=2),"Uber (km Online 2025)",bold=True,bg=WHITE)
    c=ws.cell(row=r,column=3); pdf_val(c,UBER_PDF['km_online'],num_fmt="#,##0")
    pct=ws.cell(row=r,column=4)
    calc(pct,f"=IF({VEH_KM_TOTAL_ANNUAL_CELL}=0,0,{VEH_KM_UBER_CELL}/{VEH_KM_TOTAL_ANNUAL_CELL})",bg=GREEN_LIGHT)
    pct.number_format="0.00%"
    note=ws.cell(row=r,column=5)
    note.value=f"Relevé annuel Uber • On Trip: {UBER_PDF['km_on_trip']:,} km • Online: {UBER_PDF['km_online']:,} km"
    note.font=Font(name="Arial",italic=True,size=9); note.fill=fill(GRAY); note.border=tb()
    ws.merge_cells(start_row=r,start_column=5,end_row=r,end_column=6)

    r=11; assert VEH_KM_LYFT_CELL==f"C{r}"
    lbl(ws.cell(row=r,column=2),"Lyft (km Jul–Déc 2025)",bold=True,bg=WHITE)
    lyft_km_c=ws.cell(row=r,column=3)
    lyft_km_c.value=f"='Lyft (Revenus)'!{LYFT_KM_TOTAL_CELL}"
    lyft_km_c.font=Font(name="Arial",size=10,color="FF375623",bold=True)
    lyft_km_c.fill=fill(GREEN_LIGHT); lyft_km_c.alignment=ctr(); lyft_km_c.border=tb()
    lyft_km_c.number_format="#,##0.000"
    pct2=ws.cell(row=r,column=4)
    calc(pct2,f"=IF({VEH_KM_TOTAL_ANNUAL_CELL}=0,0,{VEH_KM_LYFT_CELL}/{VEH_KM_TOTAL_ANNUAL_CELL})",bg=GREEN_LIGHT)
    pct2.number_format="0.00%"
    note2=ws.cell(row=r,column=5); note2.value="Lien vers onglet Lyft (Revenus) • Relevés mensuels Jul–Déc"
    note2.font=Font(name="Arial",italic=True,size=9); note2.fill=fill(GRAY); note2.border=tb()
    ws.merge_cells(start_row=r,start_column=5,end_row=r,end_column=6)

    r=12
    lbl(ws.cell(row=r,column=2),"TOTAL km affaires (Uber + Lyft)",bold=True)
    total_row(ws.cell(row=r,column=3),f"={VEH_KM_UBER_CELL}+{VEH_KM_LYFT_CELL}")
    ws.cell(row=r,column=3).number_format="#,##0.000"
    pct3=ws.cell(row=r,column=4)
    total_row(pct3,f"=IF({VEH_KM_TOTAL_ANNUAL_CELL}=0,0,(C12)/{VEH_KM_TOTAL_ANNUAL_CELL})")
    pct3.number_format="0.00%"
    note3=ws.cell(row=r,column=5)
    note3.value="% usage affaires global (tous services)"
    note3.font=Font(name="Arial",italic=True,size=9,color="FFFFFFFF")
    note3.fill=fill(DARK); note3.border=tb()
    ws.merge_cells(start_row=r,start_column=5,end_row=r,end_column=6)
    ws.row_dimensions[r].height=16

    # ── DÉPENSES VÉHICULE (rows 14-27) ──
    merge_hdr(ws,14,2,6,"DÉPENSES VÉHICULE — SAISIE UNIQUE (même véhicule pour les 2 services)",bg=GREEN_HDR)

    r=15
    for ci,h in enumerate(["Catégorie de dépense","Montant total ($)","Part Uber ($)","Part Lyft ($)","Total déductible ($)"],2):
        hdr(ws.cell(row=r,column=ci),h)
    ws.row_dimensions[r].height=30

    dep_start_r = 16
    dep_rows=[]
    for i,cat in enumerate(DEP_VEHICLE_CATS):
        r=dep_start_r+i; dep_rows.append(r)
        lbl(ws.cell(row=r,column=2),cat,bg=WHITE)
        inp(ws.cell(row=r,column=3))  # User enters amount
        # Uber share = amount × (Uber km / total km)
        uber_share=ws.cell(row=r,column=4)
        calc(uber_share,f"=IF({VEH_KM_TOTAL_ANNUAL_CELL}=0,0,C{r}*({VEH_KM_UBER_CELL}/{VEH_KM_TOTAL_ANNUAL_CELL}))",bg=LIGHT)
        # Lyft share
        lyft_share=ws.cell(row=r,column=5)
        calc(lyft_share,f"=IF({VEH_KM_TOTAL_ANNUAL_CELL}=0,0,C{r}*({VEH_KM_LYFT_CELL}/{VEH_KM_TOTAL_ANNUAL_CELL}))",bg=LIGHT)
        # Total deductible
        total_ded=ws.cell(row=r,column=6)
        calc(total_ded,f"=D{r}+E{r}",bg=GREEN_LIGHT)

    # Total row (row 27) — VEH_UBER_DED_CELL and VEH_LYFT_DED_CELL must match
    r=dep_start_r+len(DEP_VEHICLE_CATS)
    assert r==int(VEH_UBER_DED_CELL[1:]), f"Mismatch UBER_DED row: expected {VEH_UBER_DED_CELL[1:]}, got {r}"
    assert r==int(VEH_LYFT_DED_CELL[1:])
    lbl(ws.cell(row=r,column=2),"TOTAL DÉPENSES",bg=LIGHT,bold=True)
    total_row(ws.cell(row=r,column=3),f"=SUM(C{dep_start_r}:C{r-1})")
    total_row(ws.cell(row=r,column=4),f"=SUM(D{dep_start_r}:D{r-1})",bg=BLUE)
    total_row(ws.cell(row=r,column=5),f"=SUM(E{dep_start_r}:E{r-1})",bg="FFB5177B")
    total_row(ws.cell(row=r,column=6),f"=SUM(F{dep_start_r}:F{r-1})",bg=GREEN_HDR)
    ws.row_dimensions[r].height=18

    # ── Note box ──
    note_r=r+2
    ws.merge_cells(f"B{note_r}:F{note_r}")
    nc=ws[f"B{note_r}"]
    nc.value=("📌 MÉTHODE DE CALCUL : Dépenses déductibles Uber = Montant × (km Uber ÷ km total annuel) | "
              "Dépenses déductibles Lyft = Montant × (km Lyft ÷ km total annuel) | "
              f"Km Uber (Online) = {UBER_PDF['km_online']:,} km | Km Lyft (Jul–Déc) = {sum(d['km'] for d in LYFT_MONTHLY.values()):.3f} km")
    nc.font=Font(name="Arial",italic=True,size=9,color="FF1A4731")
    nc.fill=fill(GREEN_LIGHT); nc.alignment=Alignment(horizontal="left",wrap_text=True)
    nc.border=tb(); ws.row_dimensions[note_r].height=40

    return ws


# ══════════════════════════════════════════════════════════════════
# SHEET: UBER (REVENUS)
# ══════════════════════════════════════════════════════════════════
def build_uber(wb):
    ws = wb.create_sheet("Uber (Revenus)")
    set_widths(ws, {"A":3,"B":48,"C":18,"D":18})

    # Title
    ws.merge_cells("A1:D1")
    t=ws["A1"]; t.value="REVENUS UBER 2025 — ERIC FEZEU — Résumé annuel (relevé Uber)"
    t.font=Font(name="Arial",bold=True,size=13,color="FFFFFFFF")
    t.fill=fill(DARK); t.alignment=ctr(); ws.row_dimensions[1].height=24

    ws.merge_cells("A2:D2")
    leg=ws["A2"]; leg.value="🟢 Vert foncé = valeurs pré-remplies depuis le relevé fiscal Uber 2025  |  ⚠️ Uber fournit des données ANNUELLES (pas de détail mensuel)"
    leg.font=Font(name="Arial",italic=True,size=9,color="FF555555")
    leg.fill=fill(GRAY); leg.alignment=ctr()

    def section(ws, row, title, bg=DARK):
        ws.merge_cells(f"B{row}:D{row}")
        hdr(ws.cell(row=row,column=2),title,bg=bg)
        for col in [3,4]: ws.cell(row=row,column=col).fill=fill(bg)
        ws.row_dimensions[row].height=18

    def item_row(ws, row, label, value, editable=False):
        lbl(ws.cell(row=row,column=2),label)
        c=ws.cell(row=row,column=3)
        if editable:
            inp(c,bg=ORANGE); c.value=value
        else:
            pdf_val(c,value)
        ws.merge_cells(start_row=row,start_column=3,end_row=row,end_column=4)

    def item_neg(ws, row, label, value):
        """Negative amount (expense)"""
        lbl(ws.cell(row=row,column=2),label,bg=RED_LIGHT)
        c=ws.cell(row=row,column=3)
        pdf_val(c,-abs(value))
        ws.merge_cells(start_row=row,start_column=3,end_row=row,end_column=4)

    r=4
    # ── RIDES GROSS ──
    section(ws,r,"UBER RIDES — REVENUS BRUTS",bg=BLUE); r+=1
    rides_items=[
        ("Tarifs bruts courses (Gross Fares)",UBER_PDF['rides_gross']),
        ("Surtaxe verte (Green Surcharge)",UBER_PDF['green_surcharge']),
        ("Frais de réservation (Booking fee)",UBER_PDF['booking_fee']),
        ("Droits MTQ",UBER_PDF['mtq_dues']),
        ("Frais d'aéroport",UBER_PDF['airport_fee']),
        ("Péages",UBER_PDF['tolls']),
        ("Pourboires (Tips)",UBER_PDF['tips_rides']),
        ("TPS collectée auprès des passagers",UBER_PDF['gst_riders']),
        ("TVQ collectée auprès des passagers",UBER_PDF['qst_riders']),
    ]
    ride_rows=[]
    for label,val in rides_items:
        item_row(ws,r,label,val); ride_rows.append(r); r+=1
    lbl(ws.cell(row=r,column=2),"TOTAL BRUT",bold=True)
    total_row(ws.cell(row=r,column=3),f"=SUM(C{ride_rows[0]}:C{r-1})"); r+=1

    # ── FEES ──
    r+=1; section(ws,r,"FRAIS PAYÉS À UBER (déductibles)",bg=GREEN_HDR); r+=1
    fee_items=[
        ("Frais de service Uber",UBER_PDF['service_fee'],False),
        ("Autres frais (réservation, aéroport, Green Future…)",UBER_PDF['other_fees'],False),
        ("TPS payée à Uber",UBER_PDF['gst_paid_uber'],False),
        ("TVQ payée à Uber",UBER_PDF['qst_paid_uber'],False),
    ]
    fee_rows=[]
    for label,val,ed in fee_items:
        item_neg(ws,r,label,val); fee_rows.append(r); r+=1
    lbl(ws.cell(row=r,column=2),"Escompte sur frais (Fee Discount)",bold=False)
    pdf_val(ws.cell(row=r,column=3),UBER_PDF['fee_discount']); r+=1
    lbl(ws.cell(row=r,column=2),"TOTAL FRAIS UBER",bold=True)
    total_row(ws.cell(row=r,column=3),f"=SUM(C{fee_rows[0]}:C{r-2})+C{r-1}"); r+=1

    # ── UBER EATS ──
    r+=1; section(ws,r,"UBER EATS — REVENUS",bg="FF4A235A"); r+=1
    item_row(ws,r,"Tarif brut Uber Eats",UBER_PDF['eats_gross']); r+=1
    item_row(ws,r,"Pourboires Uber Eats",UBER_PDF['eats_tips']); r+=1

    # ── OTHER INCOME ──
    r+=1; section(ws,r,"AUTRES REVENUS",bg="FF4A235A"); r+=1
    item_row(ws,r,"6.085% Méthode comptabilité simplifiée",UBER_PDF['other_income']); r+=1

    # ── GST/QST ──
    r+=1; section(ws,r,"POUR DÉCLARATION TPS/TVQ",bg=DARK); r+=1
    gst_items=[
        ("Fournitures excl. TPS/TVQ",UBER_PDF['supplies_excl_tax']),
        ("TPS versée par Uber en votre nom",UBER_PDF['gst_remitted']),
        ("TVQ versée par Uber en votre nom",UBER_PDF['qst_remitted']),
        ("TPS collectée des passagers",UBER_PDF['gst_riders']),
        ("TVQ collectée des passagers",UBER_PDF['qst_riders']),
    ]
    for label,val in gst_items:
        item_row(ws,r,label,val); r+=1

    # ── KILOMÉTRAGE ──
    r+=1; section(ws,r,"KILOMÉTRAGE (depuis relevé Uber)",bg=GREEN_HDR); r+=1
    km_items=[
        ("Km en course (On Trip)",UBER_PDF['km_on_trip']),
        ("Km en ligne — Online (utilisé pour déduction)",UBER_PDF['km_online']),
    ]
    for label,val in km_items:
        lbl(ws.cell(row=r,column=2),label)
        c=ws.cell(row=r,column=3); pdf_val(c,val,num_fmt="#,##0")
        ws.merge_cells(start_row=r,start_column=3,end_row=r,end_column=4); r+=1

    # ── PART DÉPENSES VÉHICULE ──
    r+=1; section(ws,r,"PART DES DÉPENSES VÉHICULE DÉDUCTIBLES (depuis Véhicule Commun)",bg=BLUE); r+=1
    lbl(ws.cell(row=r,column=2),"Km Uber utilisés dans la répartition",bold=True)
    pdf_val(ws.cell(row=r,column=3),UBER_PDF['km_online'],num_fmt="#,##0")
    ws.merge_cells(start_row=r,start_column=3,end_row=r,end_column=4); r+=1

    lbl(ws.cell(row=r,column=2),"% du km total annuel",bold=True)
    c=ws.cell(row=r,column=3)
    c.value=f"='Véhicule (Commun)'!D{VEH_KM_UBER_CELL[1:]}"  # % row
    # Actually let me just reference the pct cell
    c.value=f"=IF('Véhicule (Commun)'!{VEH_KM_TOTAL_ANNUAL_CELL}=0,0,'Véhicule (Commun)'!{VEH_KM_UBER_CELL}/'Véhicule (Commun)'!{VEH_KM_TOTAL_ANNUAL_CELL})"
    c.font=Font(name="Arial",size=10,bold=True,color="FF0070C0")
    c.fill=fill(LIGHT); c.alignment=ctr(); c.border=tb(); c.number_format="0.00%"
    ws.merge_cells(start_row=r,start_column=3,end_row=r,end_column=4); r+=1

    lbl(ws.cell(row=r,column=2),"MONTANT DÉDUCTIBLE (depuis Véhicule Commun)",bold=True)
    ded_c=ws.cell(row=r,column=3)
    ded_c.value=f"='Véhicule (Commun)'!{VEH_UBER_DED_CELL}"
    ded_c.font=Font(name="Arial",size=12,bold=True,color="FFFFFFFF")
    ded_c.fill=fill(BLUE); ded_c.alignment=ctr(); ded_c.border=tb()
    ded_c.number_format='#,##0.00;(#,##0.00);-'
    ws.merge_cells(start_row=r,start_column=3,end_row=r,end_column=4)
    ws.row_dimensions[r].height=22; r+=1

    return ws


# ══════════════════════════════════════════════════════════════════
# MAIN: rebuild workbook keeping 1090, 470 sheets, replacing vehicle
# ══════════════════════════════════════════════════════════════════
if __name__=="__main__":
    wb = openpyxl.load_workbook("/sessions/eloquent-eager-wozniak/mnt/outputs/Revenus_Dépenses_2025.xlsx")

    # Remove old Uber and Lyft sheets
    for sname in ["Uber","Lyft"]:
        if sname in wb.sheetnames:
            del wb[sname]

    # Add new vehicle sheets (order matters for cross-refs display)
    build_lyft(wb)
    build_vehicle_commun(wb)
    build_uber(wb)

    out="/sessions/eloquent-eager-wozniak/mnt/outputs/Revenus_Dépenses_2025.xlsx"
    wb.save(out)
    print("✅ Saved:", out)
    print("Sheets:", wb.sheetnames)
