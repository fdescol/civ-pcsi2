# Plan — Script sync Google Sheets → Excel + comparaison

## Vue d'ensemble

Créer un script Python `sync.py` qui :
1. Télécharge le Google Sheets public `1eL0ZbPJXE0zdFNRiFXLSVzSLKFqk2T9Y7VNR4qHAITM` au format `.xlsx` via l'URL d'export public (aucune authentification requise)
2. Compare le fichier téléchargé avec le fichier local `Colles TDs et TPs.xlsx` sur les feuilles utiles
3. Affiche un rapport de différences cellule par cellule
4. Si des différences existent, propose de remplacer le fichier local et de relancer `convert.py`

**Test préalable validé** : `urllib.request` standard + URL `export?format=xlsx` → 105 Ko, 9 feuilles, aucune auth.

Dépendances : `openpyxl` uniquement (déjà dans `requirements.txt`). Aucun package supplémentaire.

---

## Sous-tâche 1 — Téléchargement du Google Sheets

**Status : [x] done**

Validé par test : `urllib.request.urlopen` sur l'URL d'export public retourne le xlsx en 105 Ko, lisible par openpyxl.

---

## Sous-tâche 2 — Comparaison cellule par cellule

**Status : [ ] pending**

### Intent
Comparer les feuilles pertinentes entre le fichier téléchargé et le fichier local, et retourner la liste des différences.

### Expected Outcomes
- Fonction `compare_workbooks(local_path, remote_path) -> list[dict]` qui retourne toutes les cellules différentes
- Ne compare que les 4 feuilles lues par `convert.py` : `Colloscope`, `Trinômes`, `Semaines`, `TPTD`
- Chaque diff : `{sheet, cell, local_val, remote_val}`
- Rapport affiché par feuille avec résumé final

### Todo List
1. `SHEETS_TO_COMPARE = ["Colloscope", "Trinômes", "Semaines", "TPTD"]`
2. Ouvrir les deux fichiers avec `openpyxl.load_workbook(..., data_only=True)`
3. Pour chaque feuille : itérer sur les lignes/colonnes jusqu'au max des deux fichiers, comparer les valeurs
4. Grouper et afficher les diffs par feuille avec comptage

### Relevant Context
- `data_only=True` lit les valeurs calculées — cohérent avec `convert.py`
- Les colonnes G→W de `Colloscope` lignes 19–61 (affectations colles par semaine) sont les plus susceptibles de changer
- Les feuilles `Colles`, `Créneaux`, `Étudiants`, `Colleurs` sont ignorées (non utilisées par `convert.py`)

---

## Sous-tâche 3 — Orchestration et mise à jour interactive

**Status : [ ] pending**

### Intent
Point d'entrée `main()` qui enchaîne téléchargement → comparaison → rapport → proposition de mise à jour.

### Expected Outcomes
- `python sync.py` : télécharge, compare, affiche le rapport
- Si différences : propose "Mettre a jour le fichier local et relancer convert.py ? [o/N]"
- Si "o" : remplace `Colles TDs et TPs.xlsx` et exécute `convert.py` via `sys.executable`
- Si aucune différence : "Aucune modification detectee — data.json est a jour"
- Option `--auto` : met à jour sans confirmation (usage script batch)
- Nettoie le fichier temporaire dans tous les cas

### Todo List
1. `argparse` avec `--auto` flag
2. Télécharger dans `_downloaded_tmp.xlsx`, toujours supprimer en `finally`
3. Si diffs=0 → message + exit 0
4. Si diffs>0 + pas `--auto` → `input()` pour confirmation
5. Si confirmé → `shutil.copy` + `subprocess.run([sys.executable, "convert.py"], check=True)`
6. Afficher "data.json regenere — pensez a: git add data.json ..."

---

## Sous-tâche 4 — Mise à jour requirements.txt et README

**Status : [ ] pending**

### Intent
`requirements.txt` inchangé (openpyxl déjà présent). Documenter le workflow simplifié dans le README.

### Todo List
1. Mettre à jour la section "Mise à jour des données" du `README.md` :
   ```
   1. python sync.py          # telecharge + compare + propose la mise a jour
   2. git add data.json "Colles TDs et TPs.xlsx"
   3. git commit -m "Update planning data"
   4. git push
   ```
2. Ajouter note : aucune configuration requise (fichier public).
