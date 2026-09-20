# civ-pcsi2 — Planning Colloscope PCSI2

Page web statique permettant à chaque élève de consulter son planning
(colles, TDs, TPs) et de l'exporter en `.ics`.

**URL** : https://fdescol.github.io/civ-pcsi2/

---

## Mise à jour des données

### Workflow recommandé — synchronisation automatique

```bash
python sync.py
```

Le script télécharge la dernière version du Google Sheets (aucune configuration requise — fichier public),
compare avec le fichier local, affiche les différences et propose de mettre à jour.

```bash
# Après confirmation de sync.py :
git add data.json "Colles TDs et TPs.xlsx"
git commit -m "Update planning data"
git push
```

Options :
```bash
python sync.py --check   # vérifie uniquement, sans modifier
python sync.py --auto    # met à jour sans confirmation (usage batch)
```

### Workflow manuel (si besoin)

1. Télécharger manuellement `Colles TDs et TPs.xlsx` depuis Google Sheets (Fichier → Télécharger → Excel)
2. Regénérer le JSON :
   ```bash
   pip install -r requirements.txt
   python convert.py
   ```
3. Publier :
   ```bash
   git add data.json "Colles TDs et TPs.xlsx"
   git commit -m "Update planning data"
   git push
   ```

## Déploiement initial

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/fdescol/civ-pcsi2.git
git push -u origin main
```

Ensuite : Settings → Pages → Source = `main` / `/ (root)`.

---

## Données hardcodées (hors Excel)

Certains créneaux n'apparaissent pas dans `Colles TDs et TPs.xlsx` et ont été
ajoutés manuellement dans `convert.py` d'après l'emploi du temps photographié.

### Mercredi matin — TD Maths + TP Chimie 75%

**Flag de contrôle :** variable `MERCREDI_MATIN` dans `convert.py`
- `True` → créneaux inclus dans `data.json` *(état actuel)*
- `False` → créneaux exclus

**Logique par groupe :**

| Créneau | G1 (trinômes 1–8) | G2 (trinômes 9–16) |
|---------|-------------------|-------------------|
| 8h–10h  | TD Mathématiques  | TP Chimie (75%)   |
| 10h–12h | TP Chimie (75%)   | TD Mathématiques  |

- **Jour :** Mercredi, **toutes les semaines** de cours
- **Source :** photo de l'emploi du temps 1er semestre (non vérifiable dans l'Excel)
- **"75%"** : terme de l'emploi du temps officiel — probablement un sous-groupe ;
  faute de données, on l'applique à G1/G2 entiers
- Les événements sont marqués `"note": "hardcoded-mercredi-matin"` dans `data.json`

**Pour désactiver :**
```python
# dans convert.py, ligne ~483
MERCREDI_MATIN = False   # était True
```
puis relancer `python convert.py` et committer `data.json`.

**Pour corriger (alternance, horaire, sous-groupe) :**
Modifier la fonction `load_mercredi_matin()` dans `convert.py`
(section documentée juste au-dessus du flag).

---

## Points d'attention

- **Semaines 7 et 9** : aucun TD Chimie 15h dans l'Excel (semaines spéciales / DS)
- **Colles** : données issues du Colloscope, fiables semaine par semaine
- **TDs fixes** (Maths, Anglais, Physique, SI) : encodés en col AB/AC du Colloscope
- **TPs** (Physique, SI, Info, Chimie) : encodés dans la feuille TPTD
- **Export ICS** : utilise `Intl.DateTimeFormat` Europe/Paris pour les timestamps UTC
  (correction DST correcte pour toutes les semaines sept. 2026 – jan. 2027)

---

## Structure

```
├── Colles TDs et TPs.xlsx   ← source de vérité
├── convert.py               ← script de conversion
├── requirements.txt
├── data.json                ← généré par convert.py
├── index.html
├── app.js
├── style.css
└── README.md
```
