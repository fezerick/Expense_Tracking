import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side, numbers
from openpyxl.utils import get_column_letter

MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin",
          "Juillet","Août","Septembre","Octobre","Novembre","Décembre"]

# Colors
BLUE  = "FF0070C0"
DARK  = "FF1F3864"
LIGHT = "FFD9E1F2"
LIGHT2= "FFDCE6F1"
GREEN_LIGHT = "FFE2EFDA"
ORANGE_LIGHT= "FFFFF2CC"
GRAY  = "FFF2F2F2"
WHITE = "FFFFFFFF"
RED_LIGHT = "FFFCE4D6"

def thin_border():
    s = Side(style='thin', color='FF000000')
    return Border(left=s, right=s, top=s, bottom=s)

def header_font(bold=True, size=10, color="FFFFFFFF"):
    return Font(name="Arial", bold=bold, size=size, color=color)

def normal_font(bold=False, size=10, color="FF000000"):
    return Font(name="Arial", bold=bold, size=size, color=color)

def blue_input_font():
    return Font(name="Arial", size=10, color="FF0000FF")

def fill(hex_color):
    return PatternFill("solid", fgColor=hex_color)

def center():
    return Alignment(horizontal="center", vertical="center", wrap_text=True)

def left():
    return Alignment(horizontal="left", vertical="center", wrap_text=True)

def style_header(cell, text, bg=DARK, fg="FFFFFFFF", bold=True, size=10):
    cell.value = text
    cell.font = Font(name="Arial", bold=bold, size=size, color=fg)
    cell.fill = fill(bg)
    cell.alignment = center()
    cell.border = thin_border()

def style_label(cell, text, bg=LIGHT, bold=False):
    cell.value = text
    cell.font = normal_font(bold=bold)
    cell.fill = fill(bg)
    cell.alignment = left()
    cell.border = thin_border()

def style_input(cell, bg=WHITE):
    cell.fill = fill(bg)
    cell.font = blue_input_font()
    cell.alignment = center()
    cell.border = thin_border()
    cell.number_format = '#,##0.00;(#,##0.00);-'

def style_formula(cell, formula, bg=GRAY):
    cell.value = formula
    cell.fill = fill(bg)
    cell.font = normal_font(bold=True)
    cell.alignment = center()
    cell.border = thin_border()
    cell.number_format = '#,##0.00;(#,##0.00);-'

def style_total(cell, formula, bg=DARK, fg="FFFFFFFF"):
    cell.value = formula
    cell.font = Font(name="Arial", bold=True, size=10, color=fg)
    cell.fill = fill(bg)
    cell.alignment = center()
    cell.border = thin_border()
    cell.number_format = '#,##0.00;(#,##0.00);-'

def add_month_headers(ws, start_row, start_col=3):
    """Add month headers + Total Annuel"""
    for i, m in enumerate(MONTHS):
        c = ws.cell(row=start_row, column=start_col+i)
        style_header(c, m)
        ws.column_dimensions[get_column_letter(start_col+i)].width = 10
    c = ws.cell(row=start_row, column=start_col+12)
    style_header(c, "Total Annuel", bg=BLUE)
    ws.column_dimensions[get_column_letter(start_col+12)].width = 13

def set_col_widths(ws, widths):
    for col, w in widths.items():
        ws.column_dimensions[col].width = w

# ─────────────────────────────────────────────
# SHEET 1: 1090 Oscar Benoît
# ─────────────────────────────────────────────
def build_1090(wb):
    ws = wb.create_sheet("1090 Oscar Benoît")
    ws.freeze_panes = "C4"

    # Title
    ws.merge_cells("A1:P1")
    t = ws["A1"]
    t.value = "REVENUS & DÉPENSES LOCATIFS 2025 — 201-1090 Oscar Benoît, Pointe-aux-Trembles, H1A 5E6, QC"
    t.font = Font(name="Arial", bold=True, size=12, color="FFFFFFFF")
    t.fill = fill(DARK)
    t.alignment = center()
    ws.row_dimensions[1].height = 22

    # Legend row
    ws.merge_cells("A2:P2")
    leg = ws["A2"]
    leg.value = "Texte bleu = saisie manuelle  |  Texte noir = formule automatique"
    leg.font = Font(name="Arial", italic=True, size=9, color="FF595959")
    leg.fill = fill(GRAY)
    leg.alignment = center()

    # Column labels
    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 38
    set_col_widths(ws, {"C":10,"D":10,"E":10,"F":10,"G":10,"H":10,"I":10,"J":10,"K":10,"L":10,"M":10,"N":10,"O":13})

    # ── REVENUS ──
    r = 3
    ws.merge_cells(f"B{r}:O{r}")
    h = ws[f"B{r}"]
    style_header(h, "REVENUS DE LOCATION", bg=BLUE)
    for col in range(3,16): ws.cell(row=r, column=col).fill = fill(BLUE)
    ws.row_dimensions[r].height = 18

    r = 4
    ws.cell(row=r, column=2).value = "Locataire"
    ws.cell(row=r, column=2).font = header_font(color="FF000000")
    ws.cell(row=r, column=2).fill = fill(LIGHT)
    ws.cell(row=r, column=2).alignment = left()
    add_month_headers(ws, r, 3)
    ws.row_dimensions[r].height = 30

    locataires = ["Coloc 1 (Salon)", "Coloc 2 (Ch.Princ)", "Coloc 3 (Ch. Bur)"]
    rev_rows = []
    for i, loc in enumerate(locataires):
        r += 1
        rev_rows.append(r)
        style_label(ws.cell(row=r, column=2), loc, bg=WHITE)
        for col in range(3, 15):
            style_input(ws.cell(row=r, column=col), bg=ORANGE_LIGHT)
        # Total annuel formula
        style_formula(ws.cell(row=r, column=15),
                      f"=SUM({get_column_letter(3)}{r}:{get_column_letter(14)}{r})")

    # Total revenus
    r += 1
    tr_row = r
    style_label(ws.cell(row=r, column=2), "TOTAL DES REVENUS", bg=LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        rows_str = "+".join([f"{cl}{rr}" for rr in rev_rows])
        style_total(ws.cell(row=r, column=col), f"={rows_str}")
    style_total(ws.cell(row=r, column=15), f"=SUM(O{rev_rows[0]}:O{rev_rows[-1]})")
    ws.row_dimensions[r].height = 16

    # ── DÉPENSES DÉDUCTIBLES ──
    r += 2
    ws.merge_cells(f"B{r}:O{r}")
    h = ws[f"B{r}"]
    style_header(h, "DÉPENSES DÉDUCTIBLES", bg="FF375623")
    for col in range(3,16): ws.cell(row=r, column=col).fill = fill("FF375623")
    ws.row_dimensions[r].height = 18

    r += 1
    ws.cell(row=r, column=2).value = "Catégorie de dépense"
    ws.cell(row=r, column=2).font = header_font(color="FF000000")
    ws.cell(row=r, column=2).fill = fill(LIGHT)
    ws.cell(row=r, column=2).alignment = left()
    add_month_headers(ws, r, 3)
    ws.row_dimensions[r].height = 30

    dep_ded = [
        "Taxes municipales",
        "Taxe scolaire",
        "Électricité",
        "Chauffage (mazout / plan d'entretien)",
        "Frais de condo",
        "Internet",
        "Assurance habitation",
        "Système d'alarme",
        "Frais de déplacement",
        "Entretien / Réparations courantes",
        "Honoraires professionnels (comptable, notaire…)",
        "Frais de gestion",
        "Frais de bureau (papeterie, clés…)",
        "Publicité",
        "Outils / Matériel",
        "Intérêts sur hypothèque / frais bancaires",
        "Autres dépenses déductibles",
    ]
    ded_rows = []
    for cat in dep_ded:
        r += 1
        ded_rows.append(r)
        style_label(ws.cell(row=r, column=2), cat, bg=WHITE)
        for col in range(3, 15):
            style_input(ws.cell(row=r, column=col), bg=ORANGE_LIGHT)
        style_formula(ws.cell(row=r, column=15),
                      f"=SUM({get_column_letter(3)}{r}:{get_column_letter(14)}{r})")

    r += 1
    tot_ded_row = r
    style_label(ws.cell(row=r, column=2), "TOTAL DÉPENSES DÉDUCTIBLES", bg=LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        rows_str = "+".join([f"{cl}{rr}" for rr in ded_rows])
        style_total(ws.cell(row=r, column=col), f"={rows_str}")
    style_total(ws.cell(row=r, column=15),
                f"=SUM(O{ded_rows[0]}:O{ded_rows[-1]})")
    ws.row_dimensions[r].height = 16

    # ── DÉPENSES EN CAPITAL ──
    r += 2
    ws.merge_cells(f"B{r}:O{r}")
    h = ws[f"B{r}"]
    style_header(h, "DÉPENSES EN CAPITAL (non déductibles)", bg="FF7B3F00")
    for col in range(3,16): ws.cell(row=r, column=col).fill = fill("FF7B3F00")
    ws.row_dimensions[r].height = 18

    r += 1
    ws.cell(row=r, column=2).value = "Description travaux"
    ws.cell(row=r, column=2).font = header_font(color="FF000000")
    ws.cell(row=r, column=2).fill = fill(LIGHT)
    ws.cell(row=r, column=2).alignment = left()
    add_month_headers(ws, r, 3)
    ws.row_dimensions[r].height = 30

    cap_cats = [
        "Rénovation / Amélioration majeure",
        "Remplacement d'équipements (chauffe-eau, fournaise…)",
        "Autres travaux majeurs",
    ]
    cap_rows = []
    for cat in cap_cats:
        r += 1
        cap_rows.append(r)
        style_label(ws.cell(row=r, column=2), cat, bg=WHITE)
        for col in range(3, 15):
            style_input(ws.cell(row=r, column=col), bg=ORANGE_LIGHT)
        style_formula(ws.cell(row=r, column=15),
                      f"=SUM({get_column_letter(3)}{r}:{get_column_letter(14)}{r})")

    r += 1
    tot_cap_row = r
    style_label(ws.cell(row=r, column=2), "TOTAL DÉPENSES EN CAPITAL", bg=LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        rows_str = "+".join([f"{cl}{rr}" for rr in cap_rows])
        style_total(ws.cell(row=r, column=col), f"={rows_str}")
    style_total(ws.cell(row=r, column=15),
                f"=SUM(O{cap_rows[0]}:O{cap_rows[-1]})")
    ws.row_dimensions[r].height = 16

    # ── BÉNÉFICE / PERTE ──
    r += 2
    ws.merge_cells(f"B{r}:O{r}")
    h = ws[f"B{r}"]
    style_header(h, "SOMMAIRE", bg=DARK)
    for col in range(3,16): ws.cell(row=r, column=col).fill = fill(DARK)
    ws.row_dimensions[r].height = 18

    r += 1
    style_label(ws.cell(row=r, column=2), "Total revenus", bg=GREEN_LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        style_formula(ws.cell(row=r, column=col), f"={cl}{tr_row}", bg=GREEN_LIGHT)
    style_formula(ws.cell(row=r, column=15), f"=O{tr_row}", bg=GREEN_LIGHT)

    r += 1
    style_label(ws.cell(row=r, column=2), "Total dépenses déductibles", bg=RED_LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        style_formula(ws.cell(row=r, column=col), f"={cl}{tot_ded_row}", bg=RED_LIGHT)
    style_formula(ws.cell(row=r, column=15), f"=O{tot_ded_row}", bg=RED_LIGHT)

    r += 1
    ben_row = r
    style_label(ws.cell(row=r, column=2), "BÉNÉFICE (PERTE) AVANT IMPÔTS", bg=LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        style_total(ws.cell(row=r, column=col),
                    f"={cl}{ben_row-2}-{cl}{ben_row-1}")
    style_total(ws.cell(row=r, column=15),
                f"=O{ben_row-2}-O{ben_row-1}")
    ws.row_dimensions[r].height = 18

    return ws

# ─────────────────────────────────────────────
# SHEET 2: 470 Gélinas — Résumé Triplex
# ─────────────────────────────────────────────
def build_470_resume(wb):
    ws = wb.create_sheet("470 Gélinas - Résumé")
    ws.freeze_panes = "C4"

    ws.merge_cells("A1:P1")
    t = ws["A1"]
    t.value = "REVENUS & DÉPENSES LOCATIFS 2025 — 468-470 Rue Gélinas, Trois-Rivières, G8T 7E3, QC — TRIPLEX"
    t.font = Font(name="Arial", bold=True, size=12, color="FFFFFFFF")
    t.fill = fill(DARK)
    t.alignment = center()
    ws.row_dimensions[1].height = 22

    ws.merge_cells("A2:P2")
    leg = ws["A2"]
    leg.value = "Texte bleu = saisie manuelle  |  Texte noir = formule automatique  |  Vert = lien vers onglets logements"
    leg.font = Font(name="Arial", italic=True, size=9, color="FF595959")
    leg.fill = fill(GRAY)
    leg.alignment = center()

    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 38
    set_col_widths(ws, {"C":10,"D":10,"E":10,"F":10,"G":10,"H":10,"I":10,"J":10,"K":10,"L":10,"M":10,"N":10,"O":13})

    # ── REVENUS ──
    r = 3
    ws.merge_cells(f"B{r}:O{r}")
    style_header(ws[f"B{r}"], "REVENUS DE LOCATION", bg=BLUE)
    for col in range(3,16): ws.cell(row=r, column=col).fill = fill(BLUE)
    ws.row_dimensions[r].height = 18

    r = 4
    ws.cell(row=r, column=2).value = "Logement"
    ws.cell(row=r, column=2).font = header_font(color="FF000000")
    ws.cell(row=r, column=2).fill = fill(LIGHT)
    ws.cell(row=r, column=2).alignment = left()
    add_month_headers(ws, r, 3)
    ws.row_dimensions[r].height = 30

    logements = ["Logement 470", "Logement 468", "Logement 468 A"]
    rev_rows = []
    for i, log in enumerate(logements, 1):
        r += 1
        rev_rows.append(r)
        style_label(ws.cell(row=r, column=2), log, bg=WHITE)
        for col in range(3, 15):
            style_input(ws.cell(row=r, column=col), bg=ORANGE_LIGHT)
        style_formula(ws.cell(row=r, column=15),
                      f"=SUM({get_column_letter(3)}{r}:{get_column_letter(14)}{r})")

    r += 1
    tr_row = r
    style_label(ws.cell(row=r, column=2), "TOTAL DES REVENUS", bg=LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        rows_str = "+".join([f"{cl}{rr}" for rr in rev_rows])
        style_total(ws.cell(row=r, column=col), f"={rows_str}")
    style_total(ws.cell(row=r, column=15), f"=SUM(O{rev_rows[0]}:O{rev_rows[-1]})")
    ws.row_dimensions[r].height = 16

    # ── DÉPENSES DÉDUCTIBLES AU PRORATA ──
    r += 2
    ws.merge_cells(f"B{r}:O{r}")
    style_header(ws[f"B{r}"], "DÉPENSES DÉDUCTIBLES AU PRORATA (Triplex)", bg="FF375623")
    for col in range(3,16): ws.cell(row=r, column=col).fill = fill("FF375623")
    ws.row_dimensions[r].height = 18

    r += 1
    ws.cell(row=r, column=2).value = "Catégorie de dépense"
    ws.cell(row=r, column=2).font = header_font(color="FF000000")
    ws.cell(row=r, column=2).fill = fill(LIGHT)
    ws.cell(row=r, column=2).alignment = left()
    add_month_headers(ws, r, 3)
    ws.row_dimensions[r].height = 30

    dep_ded = [
        "Taxes municipales",
        "Taxe scolaire",
        "Électricité (parties communes)",
        "Chauffage (mazout / plan d'entretien)",
        "Frais de déneigement",
        "Assurance habitation",
        "Système d'alarme",
        "Frais de déplacement",
        "Entretien / Réparations courantes (parties communes)",
        "Honoraires professionnels (comptable, notaire…)",
        "Frais de gestion",
        "Frais de bureau (papeterie, clés…)",
        "Publicité",
        "Outils / Matériel",
        "Intérêts sur hypothèque / frais bancaires",
        "Autres dépenses déductibles",
    ]
    ded_rows = []
    for cat in dep_ded:
        r += 1
        ded_rows.append(r)
        style_label(ws.cell(row=r, column=2), cat, bg=WHITE)
        for col in range(3, 15):
            style_input(ws.cell(row=r, column=col), bg=ORANGE_LIGHT)
        style_formula(ws.cell(row=r, column=15),
                      f"=SUM({get_column_letter(3)}{r}:{get_column_letter(14)}{r})")

    r += 1
    tot_ded_row = r
    style_label(ws.cell(row=r, column=2), "TOTAL DÉPENSES DÉDUCTIBLES", bg=LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        rows_str = "+".join([f"{cl}{rr}" for rr in ded_rows])
        style_total(ws.cell(row=r, column=col), f"={rows_str}")
    style_total(ws.cell(row=r, column=15), f"=SUM(O{ded_rows[0]}:O{ded_rows[-1]})")
    ws.row_dimensions[r].height = 16

    # ── DÉPENSES EN CAPITAL ──
    r += 2
    ws.merge_cells(f"B{r}:O{r}")
    style_header(ws[f"B{r}"], "DÉPENSES EN CAPITAL (non déductibles)", bg="FF7B3F00")
    for col in range(3,16): ws.cell(row=r, column=col).fill = fill("FF7B3F00")
    ws.row_dimensions[r].height = 18

    r += 1
    ws.cell(row=r, column=2).value = "Description travaux"
    ws.cell(row=r, column=2).font = header_font(color="FF000000")
    ws.cell(row=r, column=2).fill = fill(LIGHT)
    ws.cell(row=r, column=2).alignment = left()
    add_month_headers(ws, r, 3)
    ws.row_dimensions[r].height = 30

    cap_cats = [
        "Rénovation / Amélioration majeure — Logement 1",
        "Rénovation / Amélioration majeure — Logement 2",
        "Rénovation / Amélioration majeure — Logement 3",
        "Rénovation / Amélioration majeure — Parties communes",
        "Remplacement d'équipements (chauffe-eau, fournaise…)",
        "Autres travaux majeurs",
    ]
    cap_rows = []
    for cat in cap_cats:
        r += 1
        cap_rows.append(r)
        style_label(ws.cell(row=r, column=2), cat, bg=WHITE)
        for col in range(3, 15):
            style_input(ws.cell(row=r, column=col), bg=ORANGE_LIGHT)
        style_formula(ws.cell(row=r, column=15),
                      f"=SUM({get_column_letter(3)}{r}:{get_column_letter(14)}{r})")

    r += 1
    tot_cap_row = r
    style_label(ws.cell(row=r, column=2), "TOTAL DÉPENSES EN CAPITAL", bg=LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        rows_str = "+".join([f"{cl}{rr}" for rr in cap_rows])
        style_total(ws.cell(row=r, column=col), f"={rows_str}")
    style_total(ws.cell(row=r, column=15), f"=SUM(O{cap_rows[0]}:O{cap_rows[-1]})")
    ws.row_dimensions[r].height = 16

    # ── SOMMAIRE ──
    r += 2
    ws.merge_cells(f"B{r}:O{r}")
    style_header(ws[f"B{r}"], "SOMMAIRE", bg=DARK)
    for col in range(3,16): ws.cell(row=r, column=col).fill = fill(DARK)
    ws.row_dimensions[r].height = 18

    r += 1
    style_label(ws.cell(row=r, column=2), "Total revenus", bg=GREEN_LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        style_formula(ws.cell(row=r, column=col), f"={cl}{tr_row}", bg=GREEN_LIGHT)
    style_formula(ws.cell(row=r, column=15), f"=O{tr_row}", bg=GREEN_LIGHT)

    r += 1
    style_label(ws.cell(row=r, column=2), "Total dépenses déductibles", bg=RED_LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        style_formula(ws.cell(row=r, column=col), f"={cl}{tot_ded_row}", bg=RED_LIGHT)
    style_formula(ws.cell(row=r, column=15), f"=O{tot_ded_row}", bg=RED_LIGHT)

    r += 1
    ben_row = r
    style_label(ws.cell(row=r, column=2), "BÉNÉFICE (PERTE) AVANT IMPÔTS", bg=LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        style_total(ws.cell(row=r, column=col), f"={cl}{ben_row-2}-{cl}{ben_row-1}")
    style_total(ws.cell(row=r, column=15), f"=O{ben_row-2}-O{ben_row-1}")
    ws.row_dimensions[r].height = 18

    return ws

# ─────────────────────────────────────────────
# SHEET: Logement detail (for each of 3 units in triplex)
# ─────────────────────────────────────────────
def build_logement(wb, num):
    ws = wb.create_sheet(f"470 - Logement {num}")
    ws.freeze_panes = "C4"

    ws.merge_cells("A1:O1")
    t = ws["A1"]
    t.value = f"DÉPENSES DÉTAILLÉES — 470 Rue Gélinas, Logement {num} — 2025"
    t.font = Font(name="Arial", bold=True, size=12, color="FFFFFFFF")
    t.fill = fill(DARK)
    t.alignment = center()
    ws.row_dimensions[1].height = 22

    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 38
    set_col_widths(ws, {"C":10,"D":10,"E":10,"F":10,"G":10,"H":10,"I":10,"J":10,"K":10,"L":10,"M":10,"N":10,"O":13})

    # ── TRAVAUX MINEURS ──
    r = 2
    ws.merge_cells(f"B{r}:O{r}")
    style_header(ws[f"B{r}"], f"TRAVAUX MINEURS — DÉPENSES COURANTES — Logement {num}", bg="FF375623")
    for col in range(3,16): ws.cell(row=r, column=col).fill = fill("FF375623")
    ws.row_dimensions[r].height = 18

    r = 3
    ws.cell(row=r, column=2).value = "Description"
    ws.cell(row=r, column=2).font = header_font(color="FF000000")
    ws.cell(row=r, column=2).fill = fill(LIGHT)
    ws.cell(row=r, column=2).alignment = left()
    add_month_headers(ws, r, 3)
    ws.row_dimensions[r].height = 30

    min_rows = []
    for i in range(8):
        r += 1
        min_rows.append(r)
        style_input(ws.cell(row=r, column=2), bg=ORANGE_LIGHT)
        ws.cell(row=r, column=2).font = blue_input_font()
        ws.cell(row=r, column=2).alignment = left()
        ws.cell(row=r, column=2).number_format = "@"
        for col in range(3, 15):
            style_input(ws.cell(row=r, column=col), bg=ORANGE_LIGHT)
        style_formula(ws.cell(row=r, column=15),
                      f"=SUM({get_column_letter(3)}{r}:{get_column_letter(14)}{r})")

    r += 1
    tot_min_row = r
    style_label(ws.cell(row=r, column=2), "TOTAL TRAVAUX MINEURS", bg=LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        rows_str = "+".join([f"{cl}{rr}" for rr in min_rows])
        style_total(ws.cell(row=r, column=col), f"={rows_str}")
    style_total(ws.cell(row=r, column=15), f"=SUM(O{min_rows[0]}:O{min_rows[-1]})")
    ws.row_dimensions[r].height = 16

    # ── TRAVAUX MAJEURS ──
    r += 2
    ws.merge_cells(f"B{r}:O{r}")
    style_header(ws[f"B{r}"], f"TRAVAUX MAJEURS — DÉPENSES EN CAPITAL — Logement {num}", bg="FF7B3F00")
    for col in range(3,16): ws.cell(row=r, column=col).fill = fill("FF7B3F00")
    ws.row_dimensions[r].height = 18

    r += 1
    ws.cell(row=r, column=2).value = "Description"
    ws.cell(row=r, column=2).font = header_font(color="FF000000")
    ws.cell(row=r, column=2).fill = fill(LIGHT)
    ws.cell(row=r, column=2).alignment = left()
    add_month_headers(ws, r, 3)
    ws.row_dimensions[r].height = 30

    maj_rows = []
    for i in range(5):
        r += 1
        maj_rows.append(r)
        style_input(ws.cell(row=r, column=2), bg=ORANGE_LIGHT)
        ws.cell(row=r, column=2).font = blue_input_font()
        ws.cell(row=r, column=2).alignment = left()
        ws.cell(row=r, column=2).number_format = "@"
        for col in range(3, 15):
            style_input(ws.cell(row=r, column=col), bg=ORANGE_LIGHT)
        style_formula(ws.cell(row=r, column=15),
                      f"=SUM({get_column_letter(3)}{r}:{get_column_letter(14)}{r})")

    r += 1
    tot_maj_row = r
    style_label(ws.cell(row=r, column=2), "TOTAL TRAVAUX MAJEURS", bg=LIGHT, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        rows_str = "+".join([f"{cl}{rr}" for rr in maj_rows])
        style_total(ws.cell(row=r, column=col), f"={rows_str}")
    style_total(ws.cell(row=r, column=15), f"=SUM(O{maj_rows[0]}:O{maj_rows[-1]})")

    r += 1
    style_label(ws.cell(row=r, column=2), "GRAND TOTAL", bg=DARK, bold=True)
    for col in range(3, 15):
        cl = get_column_letter(col)
        style_total(ws.cell(row=r, column=col), f"={cl}{tot_min_row}+{cl}{tot_maj_row}")
    style_total(ws.cell(row=r, column=15), f"=O{tot_min_row}+O{tot_maj_row}")
    ws.row_dimensions[r].height = 18

    return ws

# ─────────────────────────────────────────────
# SHEET: Véhicule (Uber or Lyft)
# ─────────────────────────────────────────────
def build_vehicle(wb, platform):
    ws = wb.create_sheet(platform)
    ws.freeze_panes = "A1"

    bg_color = "FF1F3864" if platform == "Uber" else "FF2E4057"
    accent = BLUE if platform == "Uber" else "FF00B0F0"

    ws.merge_cells("A1:H1")
    t = ws["A1"]
    t.value = f"DÉPENSES VÉHICULE 2025 — {platform.upper()}"
    t.font = Font(name="Arial", bold=True, size=12, color="FFFFFFFF")
    t.fill = fill(bg_color)
    t.alignment = center()
    ws.row_dimensions[1].height = 22

    ws.column_dimensions["A"].width = 3
    ws.column_dimensions["B"].width = 38
    ws.column_dimensions["C"].width = 18
    ws.column_dimensions["D"].width = 18
    ws.column_dimensions["E"].width = 18
    ws.column_dimensions["F"].width = 18
    ws.column_dimensions["G"].width = 18
    ws.column_dimensions["H"].width = 18

    # ── INFOS VÉHICULE ──
    r = 2
    ws.merge_cells(f"A{r}:H{r}")
    style_header(ws[f"A{r}"], "INFORMATIONS VÉHICULE", bg=bg_color)
    for col in range(1,9): ws.cell(row=r, column=col).fill = fill(bg_color)

    vehicle_info = [
        ("Modèle / Marque", ""),
        ("Kilométrage TOTAL annuel", 0),
        ("Kilométrage pour AFFAIRES", 0),
        ("% utilisation affaires", "=IF(C5=0,0,C6/C5)"),
    ]
    r = 3
    for label, val in vehicle_info:
        r += 1
        ws.cell(row=r, column=2).value = label
        ws.cell(row=r, column=2).font = normal_font(bold=True)
        ws.cell(row=r, column=2).fill = fill(LIGHT)
        ws.cell(row=r, column=2).alignment = left()
        ws.cell(row=r, column=2).border = thin_border()
        c = ws.cell(row=r, column=3)
        if isinstance(val, str) and val.startswith("="):
            c.value = val
            c.font = normal_font(bold=True)
            c.fill = fill(GRAY)
            if "%" in label:
                c.number_format = "0.00%"
            else:
                c.number_format = '#,##0.00;(#,##0.00);-'
        else:
            c.value = val if val != 0 else None
            c.font = blue_input_font()
            c.fill = fill(ORANGE_LIGHT)
            if "Kilométrage" in label:
                c.number_format = "#,##0"
        c.alignment = center()
        c.border = thin_border()

    # ── DÉPENSES ──
    r += 2
    ws.merge_cells(f"A{r}:H{r}")
    style_header(ws[f"A{r}"], "DÉPENSES VÉHICULE ANNUELLES", bg="FF375623")
    for col in range(1,9): ws.cell(row=r, column=col).fill = fill("FF375623")
    ws.row_dimensions[r].height = 18

    r += 1
    for col, header in enumerate(["Catégorie de dépense", "Montant total ($)", "% affaires", "Montant déductible ($)"], 2):
        c = ws.cell(row=r, column=col)
        style_header(c, header, bg=DARK)
    ws.row_dimensions[r].height = 30

    dep_veh = [
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
    dep_start_row = r + 1
    dep_rows = []
    for cat in dep_veh:
        r += 1
        dep_rows.append(r)
        style_label(ws.cell(row=r, column=2), cat, bg=WHITE)
        style_input(ws.cell(row=r, column=3), bg=ORANGE_LIGHT)  # Montant total
        # % affaires (links to C6/C5)
        c = ws.cell(row=r, column=4)
        c.value = "=IF($C$5=0,0,$C$6/$C$5)"
        c.font = normal_font()
        c.fill = fill(GRAY)
        c.alignment = center()
        c.border = thin_border()
        c.number_format = "0.00%"
        # Montant déductible
        c = ws.cell(row=r, column=5)
        c.value = f"=IF(C{r}=\"\",0,C{r}*D{r})"
        c.font = normal_font(bold=True)
        c.fill = fill(GREEN_LIGHT)
        c.alignment = center()
        c.border = thin_border()
        c.number_format = '#,##0.00;(#,##0.00);-'

    r += 1
    style_label(ws.cell(row=r, column=2), "TOTAL DES DÉPENSES", bg=LIGHT, bold=True)
    c = ws.cell(row=r, column=3)
    c.value = f"=SUM(C{dep_start_row}:C{r-1})"
    c.font = Font(name="Arial", bold=True, size=10, color="FFFFFFFF")
    c.fill = fill(DARK)
    c.alignment = center()
    c.border = thin_border()
    c.number_format = '#,##0.00;(#,##0.00);-'
    ws.cell(row=r, column=4).fill = fill(DARK)
    ws.cell(row=r, column=4).border = thin_border()
    c2 = ws.cell(row=r, column=5)
    c2.value = f"=SUM(E{dep_start_row}:E{r-1})"
    c2.font = Font(name="Arial", bold=True, size=10, color="FFFFFFFF")
    c2.fill = fill(DARK)
    c2.alignment = center()
    c2.border = thin_border()
    c2.number_format = '#,##0.00;(#,##0.00);-'
    ws.row_dimensions[r].height = 16

    # ── JOURNAL DE CARBURANT ──
    r += 3
    ws.merge_cells(f"A{r}:H{r}")
    style_header(ws[f"A{r}"], "JOURNAL DE CARBURANT — DÉTAIL TRANSACTIONS", bg=bg_color)
    for col in range(1,9): ws.cell(row=r, column=col).fill = fill(bg_color)
    ws.row_dimensions[r].height = 18

    r += 1
    for col, header in enumerate(["Date", "Fournisseur", "Litres", "Montant ($)", "Notes"], 2):
        c = ws.cell(row=r, column=col)
        style_header(c, header, bg=DARK)
    ws.row_dimensions[r].height = 22

    fuel_start = r + 1
    for i in range(60):
        r += 1
        for col in range(2, 7):
            c = ws.cell(row=r, column=col)
            c.fill = fill(ORANGE_LIGHT if col in [2,3,4,5,6] else WHITE)
            c.font = blue_input_font()
            c.alignment = center() if col != 6 else left()
            c.border = thin_border()
            if col == 2:  # Date
                c.number_format = "YYYY-MM-DD"
            elif col == 5:  # Amount
                c.number_format = '#,##0.00;(#,##0.00);-'
            elif col == 4:  # Litres
                c.number_format = '#,##0.00'

    r += 1
    style_label(ws.cell(row=r, column=2), "TOTAL CARBURANT", bg=LIGHT, bold=True)
    for col in [4, 5]:
        c = ws.cell(row=r, column=col)
        c.value = f"=SUM({get_column_letter(col)}{fuel_start}:{get_column_letter(col)}{r-1})"
        c.font = Font(name="Arial", bold=True, size=10, color="FFFFFFFF")
        c.fill = fill(DARK)
        c.alignment = center()
        c.border = thin_border()
        c.number_format = '#,##0.00;(#,##0.00);-'
    ws.row_dimensions[r].height = 16

    return ws

# ─────────────────────────────────────────────
# BUILD WORKBOOK
# ─────────────────────────────────────────────
wb = openpyxl.Workbook()
wb.remove(wb.active)  # remove default sheet

build_1090(wb)
build_470_resume(wb)
for i in range(1, 4):
    build_logement(wb, i)
build_vehicle(wb, "Uber")
build_vehicle(wb, "Lyft")

output = "/sessions/eloquent-eager-wozniak/mnt/outputs/Revenus_Dépenses_2025.xlsx"
wb.save(output)
print("✅ Saved:", output)
