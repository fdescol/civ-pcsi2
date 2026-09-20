# Plan — Colloscope Web (GitHub Pages)

## Vue d'ensemble

Créer une page web statique déployable sur GitHub Pages à l'URL
`https://fdescol.github.io/civ-pcsi2/` permettant à un élève de saisir son nom,
naviguer semaine par semaine dans son planning (colles, TDs, TPs), et exporter
ses créneaux au format ICS.

Les données sont extraites du fichier `Colles TDs et TPs.xlsx` par un script
Python local qui génère un fichier `data.json` statique. Seuls les fichiers
statiques sont déployés ; le `.xlsx` est versionné dans le dépôt en tant que
source de vérité.

### Structure du repo

```
civ-pcsi2/
├── Colles TDs et TPs.xlsx   ← source de vérité (versionné)
├── convert.py               ← script de conversion Excel → JSON
├── requirements.txt
├── data.json                ← généré par convert.py (versionné)
├── index.html
├── app.js
├── style.css
├── README.md
└── .gitignore
```

GitHub Pages sert depuis la branche `main`, dossier racine.

---

## Données — Ce que contient le fichier Excel

### Semaines (feuille `Semaines`)
14 semaines de cours (sem 3 à 17, avec deux interruptions vacances : sem 8
absente côté L colonne, sem 15 présente). Chaque semaine : lundi ISO, numéro,
lettre A ou B.

### Étudiants (feuille `Trinômes`)
48 étudiants, trinômes 1 à 16. Chaque étudiant a :
- un trinôme (numéro 1–16)
- un groupe G (G1 ou G2)
- un groupe C (C1, C2, C3)
- une LV2 optionnelle (Espagnol, Italien — aucune pour la majorité)

**Trinômes LV2 :** trinôme 15 (CHABBERT, WATTRELOT) et trinôme 16 (LEVER BOYER,
LUCOTTE, MINET). Ces trinômes ont des créneaux de colle de Chimie séparés
(lignes annotées `15 – LV2` / `16 – LV2` dans la feuille Colloscope).

### Colles (feuille `Colloscope`, lignes 19–61)
Matières : Mathématiques (8 colleurs), Anglais (8), SI (4), Physique (8),
Chimie (8 + 2 LV2), Français (2).
Pour chaque colleur : jour, heure, salle fixe sur toute l'année ; les colonnes
G→W donnent le trinôme planifié chaque semaine.
Durée d'une colle : **1 heure**.

### TPs et TDs (feuilles `Colloscope` lignes 5–15 et `TPTD`)
- **TP SI** (lignes 9-10) : Mardi, heures 15h ou 17h selon le groupe (C1/C2/C3),
  certaines semaines vides (pas de TP ce semestre-là).
- **TP Physique** (lignes 14-15) : Mardi 8h ou 10h, G1 ou G2 alterne par semaine.
- **TD Chimie** (ligne 12) : Mercredi 15h, alterne G1/G2.
- **TDs récurrents** (feuille `TPTD`) : TD Physique, TD Maths, TD Anglais, TD SI
  ont des créneaux hebdomadaires (lundi 11h/12h selon le groupe, jeudi 10h/11h).
Durée des TPs/TDs : **2 heures**.

### LV2 (feuille `LV2`)
Espagnol → Mercredi (jour 3), Italien → Mercredi (jour 3), Allemand → Lundi
(jour 1). Horaire non précisé dans le fichier — à traiter comme événement
"LV2 Espagnol — Mercredi" sans heure précise dans un premier temps.

---

## Sous-tâche 1 — Script de conversion Excel → JSON

**Status : [ ] pending**

### Intent
Extraire toutes les données utiles du classeur Excel et les sérialiser en un
`data.json` auto-suffisant que le front-end peut charger directement, sans
aucun serveur.

### Expected Outcomes
- Fichier `data.json` généré, contenant :
  - `students` : liste de `{id, name, trinome, groupeG, groupeC, lv2}`
  - `weeks` : liste de `{number, mondayISO, label, abLabel}` (triée par date)
  - `events` : liste de `{id, type, subject, teacher, day, startHour, durationHours, room, weekNumber, studentIds}`
- Toutes les colles, TPs, TDs sont présents avec les bons étudiants.
- Les trinômes LV2 (15 et 16) ont leurs créneaux de Chimie corrects.
- Le script peut être relancé après mise à jour du `.xlsx`.

### Todo List
1. Créer `convert.py` avec `openpyxl` (mode `data_only=True` pour lire les valeurs calculées).
2. Lire feuille `Semaines` → construire `weeks` : liste de dicts `{number, mondayISO, label, abLabel}`.
   - Colonnes semaines dans Colloscope : G=sem3, H=sem4, I=sem5, J=sem6, K=sem7, L=vide (vacances Toussaint), M=sem8, N=sem9, O=sem10, P=sem11, Q=sem12, R=sem13, S=sem14, T=vide (vacances Noël), U=sem15, V=sem16, W=sem17.
3. Lire feuille `Trinômes` → construire `students` avec nom, numéro trinôme, groupeG, groupeC, lv2.
4. Lire les colles dans `Colloscope` lignes 19–61 :
   - Header ligne 17 : col C=Colleur, D=Jour, E=Heure, F=Salle ; colonnes G→W = semaines.
   - Pour chaque ligne non-vide (col A = matière) : créer un événement par semaine où la cellule n'est pas vide.
   - Résoudre les étudiants via trinôme → `students`.
   - Durée = 1h.
5. Lire les TPs dans `Colloscope` lignes 5–15 (groupe C1/C2/C3 ou G1/G2) :
   - Lignes 5–7 (TP SI groupe C) : col D=jour, E=heure ; G→W = C1/C2/C3 (ou vide).
   - Lignes 9–10 (TP SI lignes alternatives) : idem.
   - Lignes 14–15 (TP Physique) : G→W = G1 ou G2.
   - Résoudre les étudiants via leur groupeC ou groupeG.
   - Durée = 2h.
6. Lire les TDs récurrents dans feuille `TPTD` :
   - Lignes 3–4 : TP Physique (heure par semaine par groupe).
   - Lignes 6–8 : TP SI (heure par semaine par sous-groupe).
   - Lignes 10–12 : TP Info.
   - Lignes 14–15 : TD Chimie (heure Mercredi par semaine par groupe).
   - Reconstruire les événements TD hebdomadaires fixes depuis `Colloscope` colonnes AB/AC (créneaux TD Maths, Anglais, Physique, SI avec groupe).
   - Durée = 2h.
7. Pour les LV2 (étudiants avec `lv2 != ""`), ajouter un événement hebdomadaire récurrent par semaine : `{type:"LV2", subject: lv2, day: jour, startHour: null, durationHours: null}`.
8. Sérialiser `{students, weeks, events}` en JSON minifié → écrire `data.json`.
9. Créer `requirements.txt` : `openpyxl>=3.1`.

### Relevant Context
- `data_only=True` est requis pour lire les valeurs (pas les formules).
- Les cellules vides en zone semaines signifient "pas de colle cette semaine-là".
- La colonne L (vacances Toussaint) et T (vacances Noël) sont à ignorer.
- Trinômes 15 et 16 : dans Colloscope les cellules indiquent `15` ou `16` (mêmes règles que les autres trinômes) — les annotations "15 – LV2" sont dans les colonnes Z/AA, pas dans les colonnes semaines.

---

## Sous-tâche 2 — Structure du projet et scaffolding

**Status : [ ] pending**

### Intent
Mettre en place la structure propre de fichiers prête au développement et au
déploiement GitHub Pages.

### Expected Outcomes
- Fichiers `index.html`, `app.js`, `style.css`, `data.json`, `convert.py`,
  `README.md`, `.gitignore` sont en place à la racine.
- `README.md` explique : comment regénérer `data.json`, initialiser git, pousser
  sur GitHub et activer GitHub Pages.

### Todo List
1. Créer `index.html` avec : `<meta name="viewport">`, liens CSS/JS, balise `<noscript>`.
2. Créer `style.css` avec variables CSS de base et import de la police.
3. Créer `app.js` avec commentaire de structure (les sections seront remplies en sous-tâches 3 et 4).
4. Créer `.gitignore` : `__pycache__/`, `*.pyc`, `.env`.
5. Créer `README.md` avec les commandes :
   ```bash
   pip install -r requirements.txt
   python convert.py
   git add data.json && git commit -m "Update data" && git push
   ```
6. Créer `requirements.txt`.

### Relevant Context
- GitHub Pages : Settings → Pages → Source = branch `main`, folder `/` (root).
- URL finale : `https://fdescol.github.io/civ-pcsi2/`.
- Aucun framework JS : vanilla HTML/CSS/JS only.

---

## Sous-tâche 3 — Interface utilisateur HTML + CSS

**Status : [ ] pending**

### Intent
Créer une interface mobile-first responsive permettant : saisie du nom avec
autocomplete, affichage du planning hebdomadaire par jour, navigation entre
semaines, boutons d'export ICS.

### Expected Outcomes
- En chargeant la page, l'utilisateur voit un champ de recherche avec autocomplete.
- Après sélection, il voit son planning de la semaine courante (ou la prochaine
  semaine de cours à venir).
- Les événements sont groupés par jour (Lundi à Vendredi), avec pour chaque
  événement : badge type (Colle/TP/TD/LV2), matière, heure, salle, colleur/prof.
- Navigation prev/next semaine en haut ou bas de page ; badge indiquant numéro
  et date (ex: "Semaine 4A — 21 sept. 2026").
- Un sous-titre affiche trinôme + groupe de l'étudiant sélectionné.
- Deux boutons : "📥 Cette semaine (.ics)" et "📥 Toute l'année (.ics)".
- Design adapté mobile : cards larges, boutons ≥44px, couleurs par matière.

### Todo List
1. Structure HTML `index.html` :
   - `<header>` : titre de l'app + champ de recherche autocomplete.
   - `<section id="student-info">` : nom, trinôme, groupe (masqué jusqu'à sélection).
   - `<nav id="week-nav">` : bouton prev, label semaine, bouton next.
   - `<main id="schedule">` : conteneur des jours / événements (rendu par JS).
   - `<footer>` : boutons export ICS.
2. Dans `style.css` :
   - Variables CSS : `--color-colle`, `--color-td`, `--color-tp`, `--color-lv2` +
     couleurs par matière (maths, anglais, SI, physique, chimie, français).
   - Layout : max-width 600px centré, padding mobile-friendly.
   - `.event-card` : border-left colorée par matière, padding, ombre légère.
   - `.badge-type` : petit badge coloré (Colle / TP / TD).
   - `.week-nav` : flex, justify-between, boutons ≥44px.
   - Media query ≥768px : max-width 800px, 2 colonnes pour les jours si besoin.
   - Autocomplete dropdown : position absolute, z-index élevé, scroll max-height.
3. Composant autocomplete : `<input id="student-search">` + `<ul id="suggestions">` vide
   (peuplé par JS).

### Relevant Context
- Les jours mappés : `Lundi=0, Mardi=1, Mercredi=2, Jeudi=3, Vendredi=4`.
- Certaines semaines n'ont pas d'événement un jour donné → ne pas afficher ce jour.
- Semaines de vacances (L et T dans Colloscope) ne contiennent aucun événement →
  afficher "Pas de cours cette semaine" si l'index pointe sur une semaine sans événements.
- URL doit conserver l'étudiant + semaine : `?e=DUPONT+Jean&w=4`.

---

## Sous-tâche 4 — Logique applicative JavaScript

**Status : [ ] pending**

### Intent
Implémenter en JavaScript vanilla : chargement du JSON, autocomplete, filtrage
par étudiant, navigation semaine, rendu des événements.

### Expected Outcomes
- `app.js` charge `data.json` au démarrage.
- L'autocomplete filtre en temps réel (minimum 2 caractères).
- Après sélection d'un étudiant, la semaine affichée est la semaine courante
  (ou la prochaine semaine de cours si aujourd'hui est entre deux semaines).
- `renderWeek(studentId, weekNumber)` affiche les événements groupés par jour.
- Navigation prev/next met à jour l'URL sans rechargement.
- Boutons prev/next sont désactivés aux extrémités.

### Todo List
1. `loadData()` : `fetch('data.json')` → stocker dans variable globale `DATA`.
2. `initAutocomplete()` : écouter `input` sur le champ, filtrer `DATA.students`
   par substring insensible à la casse, afficher `<li>` dans `#suggestions`.
3. `selectStudent(studentId)` : masquer dropdown, afficher `#student-info`, appeler
   `renderWeek` avec la semaine courante.
4. `getCurrentWeekNumber()` : comparer `Date.now()` avec `DATA.weeks[i].mondayISO`,
   retourner le numéro de la semaine en cours ou la prochaine.
5. `renderWeek(studentId, weekNumber)` :
   a. Filtrer `DATA.events` où `studentIds.includes(studentId)` et `weekNumber === w`.
   b. Grouper par jour (0–4).
   c. Trier les jours par ordre croissant ; trier les événements dans un jour par
      `startHour`.
   d. Générer le HTML et l'injecter dans `#schedule`.
   e. Mettre à jour le label semaine dans `#week-nav`.
6. Handlers prev/next : incrémenter/décrémenter l'index dans `DATA.weeks` (liste
   triée), rappeler `renderWeek`, mettre à jour l'URL.
7. `readUrlParams()` au chargement : si `?e=...` → présélectionner l'étudiant ;
   si `?w=...` → afficher la semaine indiquée.
8. Désactiver les boutons nav aux bornes du tableau des semaines.

### Relevant Context
- `DATA.weeks` est trié par date croissante, indexé 0–13.
- `DATA.events[i].day` est une string de jour FR (`"Lundi"`, `"Mardi"`, …).
- `DATA.events[i].startHour` peut être `null` pour les LV2 (pas d'heure connue).
- `DATA.events[i].studentIds` est un tableau d'IDs d'étudiants.

---

## Sous-tâche 5 — Export ICS

**Status : [ ] pending**

### Intent
Générer des fichiers `.ics` valides (RFC 5545) en JavaScript pur, téléchargeables
depuis le navigateur, pour une semaine ou pour toute l'année.

### Expected Outcomes
- "📥 Cette semaine (.ics)" → télécharge les événements de la semaine affichée.
- "📥 Toute l'année (.ics)" → télécharge tous les événements de l'étudiant.
- Chaque événement ICS a : DTSTART/DTEND en Europe/Paris, SUMMARY, DESCRIPTION,
  LOCATION, UID unique.
- Ouvre correctement dans Google Calendar, Apple Calendar, Outlook.

### Todo List
1. `dayOffsetFromMonday(dayName)` : `{Lundi:0, Mardi:1, Mercredi:2, Jeudi:3, Vendredi:4}`.
2. `eventToVEVENT(event, mondayISO)` :
   - Calculer DTSTART = lundi + `dayOffset` jours + `startHour`h00 (ou 08:00 par défaut si null).
   - DTEND = DTSTART + `durationHours`h (1h pour colles, 2h pour TPs/TDs, 1h pour LV2).
   - Formater en `YYYYMMDDTHHMMSS` avec `TZID=Europe/Paris`.
   - SUMMARY = `[type] Matière` (ex: `[Colle] Mathématiques`).
   - DESCRIPTION = `Colleur: X\nSalle: Y` ou `Professeur: X\nSalle: Y`.
   - LOCATION = salle.
   - UID = `{type}-{subject}-{weekNumber}-{studentId}@civ-pcsi2`.
3. `generateICS(events, weeksMap)` : assembler le texte ICS complet
   (VCALENDAR + liste de VEVENTs).
4. `downloadICS(content, filename)` : Blob `text/calendar`, lien `<a>` temporaire.
5. Brancher bouton "Cette semaine" : appeler `generateICS` avec les événements
   filtrés pour la semaine courante + `downloadICS`.
6. Brancher bouton "Toute l'année" : appeler `generateICS` avec tous les événements
   de l'étudiant + `downloadICS`.

### Relevant Context
- Durées : colles = 1h, TPs/TDs = 2h, LV2 = 1h.
- Fuseau : `TZID=Europe/Paris` — utiliser un bloc `VTIMEZONE` ou émettre les dates
  en UTC décalé (+1h hiver, +2h été). La méthode la plus simple et robuste pour
  un outil statique : calculer l'offset UTC manuellement selon la date (DST change
  dernier dimanche d'octobre/mars) et émettre `DTSTART:YYYYMMDDTHHMMSSZ`.
- UID doit être unique par événement pour éviter les doublons à l'import répété.

---

## Sous-tâche 6 — Déploiement GitHub Pages

**Status : [ ] pending**

### Intent
Configurer le dépôt GitHub `fdescol/civ-pcsi2` et déployer la page sur GitHub Pages.

### Expected Outcomes
- Repo `https://github.com/fdescol/civ-pcsi2` créé et pousscé.
- Page accessible à `https://fdescol.github.io/civ-pcsi2/`.
- Workflow documenté : modifier `.xlsx` → `python convert.py` → commit + push.

### Todo List
1. Initialiser git local : `git init`, `git add .`, `git commit -m "Initial commit"`.
2. Créer le repo sur GitHub : `gh repo create fdescol/civ-pcsi2 --public` ou via
   l'interface web.
3. `git remote add origin https://github.com/fdescol/civ-pcsi2.git`
4. `git push -u origin main`
5. Activer GitHub Pages : Settings → Pages → Source = `main` / `/ (root)`.
6. Vérifier que la page répond à `https://fdescol.github.io/civ-pcsi2/`.
7. Mettre à jour `README.md` avec l'URL et les instructions de mise à jour.

### Relevant Context
- Le `.xlsx` est versionné (source de vérité).
- `data.json` est aussi versionné (artefact de build local).
- GitHub Pages se met à jour automatiquement à chaque push sur `main`.
- Aucun GitHub Action n'est nécessaire (build entièrement local).
