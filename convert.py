#!/usr/bin/env python3
"""
convert.py — Extrait les données de "Colles TDs et TPs.xlsx" et génère data.json.
Usage : python convert.py
"""
import json
import re
from pathlib import Path
import openpyxl

XLSX = Path("Colles TDs et TPs.xlsx")
OUT  = Path("data.json")

# ---------------------------------------------------------------------------
# Colonnes de la zone semaines dans Colloscope (col index 0-based dans openpyxl)
# G=6, H=7, I=8, J=9, K=10, L=11(vide), M=12, N=13, O=14, P=15, Q=16, R=17,
# S=18, T=19(vide), U=20, V=21, W=22
WEEK_COLS = [6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 20, 21, 22]
# Dans TPTD : B=1, C=2, D=3, E=4, F=5, G=6(vide), H=7, I=8, J=9, K=10,
#             L=11, M=12, N=13, O=14(vide), P=15, Q=16, R=17
TPTD_WEEK_COLS = [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17]

DAY_MAP = {
    "Lundi": 0, "Mardi": 1, "Mercredi": 2, "Jeudi": 3, "Vendredi": 4
}

def parse_hour(h):
    """'15h' → 15, '8h' → 8, None/'' → None"""
    if h is None:
        return None
    s = str(h).strip()
    m = re.match(r'^(\d+)h', s)
    if m:
        return int(m.group(1))
    try:
        return int(float(s))
    except (ValueError, TypeError):
        return None

def cell(ws, row, col):
    """Valeur d'une cellule (1-based row/col) ou None."""
    v = ws.cell(row=row, column=col).value
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v if v else None
    return v

def intval(v):
    """Convertit une valeur en int ou None."""
    if v is None:
        return None
    try:
        return int(float(str(v)))
    except (ValueError, TypeError):
        return None

# ---------------------------------------------------------------------------
def load_weeks(wb):
    """Charge la feuille Semaines → list[dict] triée par numéro."""
    ws = wb["Semaines"]
    weeks = []
    for row in ws.iter_rows(min_row=2, values_only=True):
        lundi, num, ab = row[0], row[1], row[2]
        if lundi is None:
            continue
        n = intval(num)
        if n is None:
            continue
        # lundi peut être un datetime ou une string ISO
        if hasattr(lundi, 'strftime'):
            lundi_iso = lundi.strftime("%Y-%m-%d")
        else:
            lundi_iso = str(lundi)[:10]
        weeks.append({
            "number": n,
            "mondayISO": lundi_iso,
            "label": f"{n}{ab}" if ab else str(n),
            "abLabel": str(ab) if ab else "",
        })
    weeks.sort(key=lambda w: w["number"])
    return weeks

# Mapping numéro de semaine → index dans la liste WEEK_COLS
def build_week_col_map(ws):
    """
    Lit la ligne 1 de Colloscope pour construire : numéro_semaine → col_index (1-based).
    """
    mapping = {}
    for col_idx in WEEK_COLS:
        v = intval(ws.cell(row=1, column=col_idx + 1).value)  # +1 car openpyxl 1-based
        if v is not None:
            mapping[v] = col_idx + 1  # garder en 1-based
    return mapping

# ---------------------------------------------------------------------------
# Mapping trinôme → groupeG et groupeC (d'après Colloscope lignes 13-17)
# G1 : trinômes 1-8 ; G2 : trinômes 9-16
# C1 : trinômes 1-6 ; C2 : trinômes 7-11 ; C3 (LV2) : trinômes 12-16
def trinome_to_groupeG(t):
    if t is None: return None
    return "G1" if t <= 8 else "G2"

def trinome_to_groupeC(t):
    if t is None: return None
    if t <= 6:  return "C1"
    if t <= 11: return "C2"
    return "C3"

def load_students(wb):
    """
    Charge la feuille Trinômes.
    Colonnes (0-based dans row): A=Nom, B=Trinôme, C=Place, D=LV2
    GroupeG et GroupeC sont déduits du numéro de trinôme.
    """
    ws = wb["Trinômes"]
    students = []
    sid = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        name = row[0]
        if not name or str(name).strip() == "":
            continue
        trinome_raw = row[1]
        lv2_raw     = row[3] if len(row) > 3 else None

        trinome = intval(trinome_raw)
        lv2     = str(lv2_raw).strip() if lv2_raw else ""

        students.append({
            "id":      sid,
            "name":    str(name).strip(),
            "trinome": trinome,
            "groupeG": trinome_to_groupeG(trinome),
            "groupeC": trinome_to_groupeC(trinome),
            "lv2":     lv2,
        })
        sid += 1
    return students

# ---------------------------------------------------------------------------
def build_trinome_map(students):
    """trinôme_num → list[student_id]"""
    m = {}
    for s in students:
        t = s["trinome"]
        if t is not None:
            m.setdefault(t, []).append(s["id"])
    return m

def build_groupeG_map(students):
    """'G1' → list[student_id], 'G2' → list[student_id]"""
    m = {}
    for s in students:
        g = s["groupeG"]
        if g:
            m.setdefault(g, []).append(s["id"])
    return m

def build_groupeC_map(students):
    """'C1' → [...], 'C2' → [...], 'C3' → [...]"""
    m = {}
    for s in students:
        c = s["groupeC"]
        if c:
            m.setdefault(c, []).append(s["id"])
    return m

# ---------------------------------------------------------------------------
SUBJECTS = {"Mathématiques", "Anglais", "SI", "Physique", "Chimie", "Français"}

def load_colles(ws, week_col_map, trinome_map):
    """
    Lit les colles dans Colloscope lignes 19–61.
    Retourne list[event_dict].
    """
    events = []
    current_subject = None

    for row_num in range(19, 62):
        a = cell(ws, row_num, 1)   # matière (peut rester sur la même)
        c = cell(ws, row_num, 3)   # colleur
        d = cell(ws, row_num, 4)   # jour
        e = cell(ws, row_num, 5)   # heure
        f = cell(ws, row_num, 6)   # salle

        # Mise à jour de la matière courante
        if a in SUBJECTS:
            current_subject = a
            # Lignes d'en-tête de matière (pas de colleur) → skip
            if not c:
                continue

        # Ligne de colle : doit avoir colleur + jour + heure
        if not (c and d and e):
            continue
        if d not in DAY_MAP:
            continue

        hour = parse_hour(e)
        teacher = str(c).strip()
        room = str(f).strip() if f else ""
        day = str(d).strip()

        # Parcourir les colonnes semaines
        for week_num, col in week_col_map.items():
            v = cell(ws, row_num, col)
            if v is None:
                continue
            trinome_num = intval(v)
            if trinome_num is None:
                continue
            student_ids = trinome_map.get(trinome_num, [])
            if not student_ids:
                continue
            events.append({
                "type":          "Colle",
                "subject":       current_subject or "?",
                "teacher":       teacher,
                "day":           day,
                "startHour":     hour,
                "durationHours": 1,
                "room":          room,
                "weekNumber":    week_num,
                "studentIds":    student_ids,
            })
    return events

# ---------------------------------------------------------------------------
def load_tps_colloscope(ws, week_col_map, groupeG_map, groupeC_map):
    """
    Lit les TPs dans Colloscope lignes 5–15.
    Structure :
      SI (col A = "SI" ou vide) :
        TP1 (row 5) : Mardi 8h  → C3 ou C1 par semaine
        TP2 (row 6) : Mardi 10h → C1 ou C3
        TP3 (row 7) : Mardi 15h → C2 toutes semaines
        TP1 Info (row 9) : Mardi 15h → C1 par semaine (semaines paires seulement)
        TP2 Info (row10) : Mardi 17h → C3 ou C2 par semaine
      Chimie :
        TD Chimie (row12) : Mercredi 15h → G1 ou G2
      Physique :
        TP1 (row14) : Mardi 8h  → G1 ou G2
        TP2 (row15) : Mardi 10h → G2 ou G1
    """
    events = []

    # Mapping de configuration : (row, subject, day, type)
    tp_rows = [
        # row, sujet, type_label
        (5,  "SI",      "TP"),   # TP SI C1/C3
        (6,  "SI",      "TP"),   # TP SI C1/C3
        (7,  "SI",      "TP"),   # TP SI C2
        (9,  "Info",    "TP"),   # TP Info C1
        (10, "Info",    "TP"),   # TP Info C2/C3
        (12, "Chimie",  "TD"),   # TD Chimie G1/G2
        (14, "Physique","TP"),   # TP Physique G1/G2
        (15, "Physique","TP"),   # TP Physique G1/G2
    ]

    for row_num, subject, evt_type in tp_rows:
        d = cell(ws, row_num, 4)  # jour (col E = 4e col)
        e = cell(ws, row_num, 5)  # heure (col F = 5e col)
        if not (d and e):
            # Certaines lignes n'ont pas de jour/heure en col D/E
            # Essayer col B pour l'heure (cas des lignes de TP SI qui ont B=heure)
            e2 = cell(ws, row_num, 2)
            hour = parse_hour(e2)
            day = "Mardi"  # toutes les lignes TP sont Mardi sauf TD Chimie
            if subject == "Chimie":
                day = "Mercredi"
        else:
            hour = parse_hour(e)
            day = str(d).strip() if d in DAY_MAP else "Mardi"

        for week_num, col in week_col_map.items():
            v = cell(ws, row_num, col)
            if v is None:
                continue
            vs = str(v).strip().upper()
            # Résoudre groupe
            student_ids = []
            if vs in ("G1", "G2"):
                student_ids = groupeG_map.get(vs, [])
            elif vs in ("C1", "C2", "C3"):
                student_ids = groupeC_map.get(vs, [])
            if not student_ids:
                continue
            events.append({
                "type":          evt_type,
                "subject":       subject,
                "teacher":       "",
                "day":           day,
                "startHour":     hour,
                "durationHours": 2,
                "room":          "",
                "weekNumber":    week_num,
                "studentIds":    student_ids,
            })
    return events

# ---------------------------------------------------------------------------
def load_tptd_sheet(wb, weeks, groupeG_map, groupeC_map):
    """
    Lit la feuille TPTD pour les TPs récurrents (Physique, SI, Info, TD Chimie).
    Structure :
      Row 1 : numéros de semaine (col B:R, G et O vides)
      Row 2 : 'TP Physique'
      Rows 3-4 : groupe 1 et 2 → heure par semaine (Mardi)
      Row 5 : 'TP SI'
      Rows 6-8 : groupes C1, C2, C3 → heure (Mardi)
      Row 9 : 'TP Info'
      Rows 10-12 : groupes 1, 2, 3 → heure (Mardi)
      Row 13 : 'TD Chimie'
      Rows 14-15 : groupes G1, G2 → heure (Mercredi)
    """
    ws = wb["TPTD"]
    events = []

    # Lire les numéros de semaine en ligne 1
    week_nums = []
    for ci in range(1, 18):  # colonnes B (index 1) à R (index 17), 0-based → ci+1 en 1-based
        v = ws.cell(row=1, column=ci + 1).value
        n = intval(v)
        week_nums.append(n)  # None pour colonnes vides (G et O)

    # Groupes correspondant aux lignes de données
    # TP Physique : rows 3, 4 → groupe 1, 2
    # TP SI       : rows 6, 7, 8 → C1, C2, C3
    # TP Info     : rows 10, 11, 12 → sous-groupes d'Info
    # TD Chimie   : rows 14, 15 → G1, G2

    # Durées confirmées par l'Excel et l'emploi du temps :
    #   TP (Physique, SI, Info) : 2h — blocs 2h visibles sur l'EDT
    #   TD Chimie               : 1h — l'Excel ne stocke pas de durée explicite ;
    #                             le créneau est de 2h d'après la photo mais
    #                             encodé prudemment à 1h (à réviser si confirmation)
    sections = [
        # (start_data_row, list_of_groups_per_row, subject, type, day, duration_hours)
        (3,  ["G1", "G2"],          "Physique", "TP",  "Mardi",     2),
        (6,  ["C1", "C2", "C3"],    "SI",       "TP",  "Mardi",     2),
        (10, ["C1", "C2", "C3"],    "Info",     "TP",  "Mardi",     2),
        (14, ["G1", "G2"],          "Chimie",   "TD",  "Mercredi",  2),
    ]

    for start_row, groups, subject, evt_type, day, dur in sections:
        for i, groupe in enumerate(groups):
            data_row = start_row + i
            for ci, week_num in enumerate(week_nums):
                if week_num is None:
                    continue  # colonne vide (vacances)
                hour_val = ws.cell(row=data_row, column=ci + 2).value  # +2 : col A=1, B=2
                hour = parse_hour(hour_val)
                if hour is None:
                    continue  # pas de TP/TD cette semaine pour ce groupe

                if groupe in ("G1", "G2"):
                    student_ids = groupeG_map.get(groupe, [])
                elif groupe in ("C1", "C2", "C3"):
                    student_ids = groupeC_map.get(groupe, [])
                else:
                    student_ids = []
                if not student_ids:
                    continue

                events.append({
                    "type":          evt_type,
                    "subject":       subject,
                    "teacher":       "",
                    "day":           day,
                    "startHour":     hour,
                    "durationHours": dur,
                    "room":          "",
                    "weekNumber":    week_num,
                    "studentIds":    student_ids,
                })
    return events

# ---------------------------------------------------------------------------
def load_tds_fixed(ws, weeks, groupeG_map):
    """
    Charge les TDs fixes hebdomadaires depuis Colloscope colonnes AB/AC (lignes 3-10).
    Col AB (28) = créneau (ex: 'Lundi 11h'), col AC (29) = groupe (ex: 'G1').
    Ces TDs ont lieu toutes les semaines de cours.
    Matières correspondant aux lignes :
      row 3 : TD Maths  G1 / row 4 : TD Maths G2
      row 5 : TD Anglais G2 / row 6 : TD Anglais G1
      row 7 : TD Physique G1 / row 8 : TD Physique G2
      row 9 : TD SI G2 / row 10 : TD SI G1

    Durée : 1h confirmée par l'Excel — les créneaux s'enchaînent heure par heure
    (ex : Maths G1 11h puis Anglais G2 11h, Maths G2 12h puis Anglais G1 12h),
    ce qui prouve que chaque TD dure exactement 1h.
    """
    # Lire les définitions de créneaux fixes dans Colloscope (lignes 3-10, col 28-29)
    td_defs = []
    subject_map = {
        3: "Mathématiques", 4: "Mathématiques",
        5: "Anglais",       6: "Anglais",
        7: "Physique",      8: "Physique",
        9: "SI",           10: "SI",
    }
    for row_num in range(3, 11):
        creneau = cell(ws, row_num, 28)  # col AB
        groupe  = cell(ws, row_num, 29)  # col AC
        subject = subject_map.get(row_num)
        if not (creneau and groupe and subject):
            continue
        # Parser le créneau ex: 'Lundi 11h', 'Jeudi 10h'
        parts = str(creneau).strip().split()
        if len(parts) < 2:
            continue
        day  = parts[0]
        hour = parse_hour(parts[1])
        if day not in DAY_MAP or hour is None:
            continue
        td_defs.append({
            "subject": subject,
            "day":     day,
            "hour":    hour,
            "groupe":  str(groupe).strip(),
        })

    events = []
    for td in td_defs:
        student_ids = groupeG_map.get(td["groupe"], [])
        if not student_ids:
            continue
        for w in weeks:
            events.append({
                "type":          "TD",
                "subject":       td["subject"],
                "teacher":       "",
                "day":           td["day"],
                "startHour":     td["hour"],
                "durationHours": 1,  # 1h confirmé : créneaux consécutifs dans l'Excel
                "room":          "",
                "weekNumber":    w["number"],
                "studentIds":    student_ids,
            })
    return events

# ---------------------------------------------------------------------------
def load_lv2_events(students, weeks):
    """
    Génère un événement LV2 hebdomadaire pour chaque étudiant ayant une LV2.
    Jour : Espagnol/Italien → Mercredi, Allemand → Lundi (d'après feuille LV2).
    """
    lv2_day = {
        "Espagnol": "Mercredi",
        "Italien":  "Mercredi",
        "Allemand": "Lundi",
    }
    events = []
    for s in students:
        lv2 = s["lv2"]
        if not lv2:
            continue
        day = lv2_day.get(lv2, "Mercredi")
        for w in weeks:
            events.append({
                "type":          "LV2",
                "subject":       lv2,
                "teacher":       "",
                "day":           day,
                "startHour":     None,
                "durationHours": 1,
                "room":          "",
                "weekNumber":    w["number"],
                "studentIds":    [s["id"]],
            })
    return events

# ---------------------------------------------------------------------------
# HARDCODE — Mercredi matin : TD Maths + TP Chimie (non encodés dans l'Excel)
# ---------------------------------------------------------------------------
# ACTIVATION : mettre MERCREDI_MATIN = True pour inclure ces créneaux.
# DÉSACTIVATION : mettre MERCREDI_MATIN = False (ou supprimer la section).
#
# Source : emploi du temps photographié (1er semestre).
# Ces créneaux N'APPARAISSENT PAS dans le fichier Excel et ont été ajoutés
# manuellement d'après la photo.
#
# Logique :
#   8h–10h  → G1 : TD Mathématiques  |  G2 : TP Chimie (75%)
#  10h–12h  → G1 : TP Chimie (75%)   |  G2 : TD Mathématiques
#
# "75%" : terme de l'emploi du temps officiel (sous-groupe partiel).
# Ici on applique à G1 entier et G2 entier faute de subdivision dans l'Excel.
#
# Semaines : toutes les semaines de cours (pas d'alternance connue).
# À réviser si un emploi du temps plus détaillé est fourni.
#
MERCREDI_MATIN = True   # <-- mettre False pour désactiver

def load_mercredi_matin(weeks, groupeG_map):
    """
    Génère les événements du mercredi matin hardcodés.
    Retourne une liste vide si MERCREDI_MATIN est False.
    """
    if not MERCREDI_MATIN:
        return []

    events = []
    for w in weeks:
        wn = w["number"]

        # G1 : TD Maths 8h, TP Chimie 10h
        g1_ids = groupeG_map.get("G1", [])
        if g1_ids:
            events.append({
                "type": "TD", "subject": "Mathématiques",
                "teacher": "", "day": "Mercredi",
                "startHour": 8, "durationHours": 2, "room": "",
                "weekNumber": wn, "studentIds": g1_ids,
                "note": "hardcoded-mercredi-matin",
            })
            events.append({
                "type": "TP", "subject": "Chimie (75%)",
                "teacher": "", "day": "Mercredi",
                "startHour": 10, "durationHours": 2, "room": "",
                "weekNumber": wn, "studentIds": g1_ids,
                "note": "hardcoded-mercredi-matin",
            })

        # G2 : TP Chimie 8h, TD Maths 10h
        g2_ids = groupeG_map.get("G2", [])
        if g2_ids:
            events.append({
                "type": "TP", "subject": "Chimie (75%)",
                "teacher": "", "day": "Mercredi",
                "startHour": 8, "durationHours": 2, "room": "",
                "weekNumber": wn, "studentIds": g2_ids,
                "note": "hardcoded-mercredi-matin",
            })
            events.append({
                "type": "TD", "subject": "Mathématiques",
                "teacher": "", "day": "Mercredi",
                "startHour": 10, "durationHours": 2, "room": "",
                "weekNumber": wn, "studentIds": g2_ids,
                "note": "hardcoded-mercredi-matin",
            })

    return events

# ---------------------------------------------------------------------------
def assign_ids(events):
    """Ajoute un champ 'id' unique à chaque événement."""
    for i, ev in enumerate(events):
        ev["id"] = i
    return events

# ---------------------------------------------------------------------------
def main():
    print(f"Chargement de {XLSX} ...")
    wb = openpyxl.load_workbook(XLSX, data_only=True)

    # 1. Semaines
    weeks = load_weeks(wb)
    week_nums = {w["number"] for w in weeks}
    print(f"  {len(weeks)} semaines chargées : {[w['number'] for w in weeks]}")

    # 2. Étudiants / trinômes
    students = load_students(wb)
    print(f"  {len(students)} étudiants chargés")

    trinome_map = build_trinome_map(students)
    groupeG_map = build_groupeG_map(students)
    groupeC_map = build_groupeC_map(students)

    ws_coll = wb["Colloscope"]

    # 3. Mapping colonnes semaines dans Colloscope
    week_col_map = build_week_col_map(ws_coll)
    # Vérification
    missing = week_nums - set(week_col_map.keys())
    if missing:
        print(f"  ⚠ Semaines sans colonne Colloscope : {missing}")

    # 4. Colles
    events_colles = load_colles(ws_coll, week_col_map, trinome_map)
    print(f"  {len(events_colles)} événements colles")

    # 5. TPs/TDs depuis feuille TPTD
    events_tptd = load_tptd_sheet(wb, weeks, groupeG_map, groupeC_map)
    events_tps_coll = []  # Colloscope TP rows are redundant with TPTD sheet
    print(f"  {len(events_tptd)} événements TP/TD (feuille TPTD)")

    # 7. TDs fixes hebdomadaires
    events_tds = load_tds_fixed(ws_coll, weeks, groupeG_map)
    print(f"  {len(events_tds)} événements TD fixes")

    # 8. LV2
    events_lv2 = load_lv2_events(students, weeks)
    print(f"  {len(events_lv2)} événements LV2")

    # 9. Mercredi matin hardcodé (TD Maths + TP Chimie 75%)
    events_mercredi = load_mercredi_matin(weeks, groupeG_map)
    if events_mercredi:
        print(f"  {len(events_mercredi)} événements mercredi matin [HARDCODED — voir MERCREDI_MATIN dans convert.py]")
    else:
        print(f"  Mercredi matin hardcodé : désactivé (MERCREDI_MATIN=False)")

    all_events = events_colles + events_tps_coll + events_tptd + events_tds + events_lv2 + events_mercredi
    assign_ids(all_events)
    print(f"  Total : {len(all_events)} événements")

    # 9. Écriture
    data = {
        "students": students,
        "weeks":    weeks,
        "events":   all_events,
    }
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding="utf-8")
    print(f"\nOK: {OUT} ecrit ({OUT.stat().st_size // 1024} Ko)")

if __name__ == "__main__":
    main()
