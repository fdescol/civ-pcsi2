# civ-pcsi2 — Planning Colloscope PCSI2

Page web statique permettant à chaque élève de consulter son planning
(colles, TDs, TPs) et de l'exporter en `.ics`.

**URL** : https://fdescol.github.io/civ-pcsi2/

---

## Mise à jour des données

1. Modifier `Colles TDs et TPs.xlsx`
2. Regénérer le JSON :
   ```bash
   pip install -r requirements.txt
   python convert.py
   ```
3. Publier :
   ```bash
   git add data.json
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
