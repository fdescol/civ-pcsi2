/* ============================================================
   app.js — Colloscope CIV PCSI2
   ============================================================ */

'use strict';

// ----------------------------------------------------------------
// State
// ----------------------------------------------------------------
let DATA = null;          // { students, weeks, events }
let currentStudent = null; // student object
let currentWeekIdx = 0;   // index into DATA.weeks
let currentView    = 'type'; // 'type' | 'day'

const DAY_ORDER = { Lundi: 0, Mardi: 1, Mercredi: 2, Jeudi: 3, Vendredi: 4 };

// ----------------------------------------------------------------
// Boot
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  fetch('data.json')
    .then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status} — impossible de charger data.json`);
      return r.json();
    })
    .then(data => {
      DATA = data;
      initAutocomplete();
      if (!readUrlParams()) {
        restoreLastStudent();
      }
    })
    .catch(err => {
      console.error('Erreur chargement:', err);
      document.getElementById('schedule').innerHTML =
        `<p class="no-events">Erreur de chargement des données.<br>` +
        `<small>${err.message}</small><br>` +
        `<small>La page doit être servie via un serveur HTTP (pas en file://).</small></p>`;
    });

  document.getElementById('btn-prev').addEventListener('click', () => navigate(-1));
  document.getElementById('btn-next').addEventListener('click', () => navigate(+1));
  document.getElementById('week-select').addEventListener('change', e => {
    currentWeekIdx = parseInt(e.target.value, 10);
    renderWeek();
    writeUrlParams();
  });
  document.getElementById('btn-view-type').addEventListener('click', () => setView('type'));
  document.getElementById('btn-view-day').addEventListener('click',  () => setView('day'));
  document.getElementById('btn-ics-week').addEventListener('click', exportWeek);
  document.getElementById('btn-ics-all').addEventListener('click', exportAll);
});

function setView(v) {
  currentView = v;
  document.getElementById('btn-view-type').classList.toggle('active', v === 'type');
  document.getElementById('btn-view-day').classList.toggle('active',  v === 'day');
  document.getElementById('btn-view-type').setAttribute('aria-pressed', v === 'type');
  document.getElementById('btn-view-day').setAttribute('aria-pressed',  v === 'day');
  renderWeek();
}

// ----------------------------------------------------------------
// Autocomplete
// ----------------------------------------------------------------
function initAutocomplete() {
  const input     = document.getElementById('student-search');
  const list      = document.getElementById('suggestions');
  const btnClear  = document.getElementById('btn-clear-search');

  function updateClearBtn() {
    btnClear.hidden = input.value.length === 0;
  }

  btnClear.addEventListener('mousedown', e => {
    e.preventDefault();
    input.value = '';
    list.innerHTML = '';
    btnClear.hidden = true;
    input.focus();
  });

  input.addEventListener('input', () => {
    updateClearBtn();
    const q = input.value.trim();
    list.innerHTML = '';
    if (q.length < 2) return;

    const lower = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const matches = DATA.students.filter(s => {
      const n = s.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return n.includes(lower);
    }).slice(0, 10);

    matches.forEach(s => {
      const li = document.createElement('li');
      li.textContent = s.name;
      li.setAttribute('role', 'option');
      li.addEventListener('mousedown', e => {
        e.preventDefault();
        selectStudent(s.id);
        input.value = s.name;
        list.innerHTML = '';
        updateClearBtn();
      });
      list.appendChild(li);
    });
  });

  // Close on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-wrapper')) list.innerHTML = '';
  });

  input.addEventListener('keydown', e => {
    const items = list.querySelectorAll('li');
    if (!items.length) return;
    if (e.key === 'Escape') { list.innerHTML = ''; return; }
    const sel = list.querySelector('[aria-selected="true"]');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = sel ? (sel.nextElementSibling || items[0]) : items[0];
      if (sel) sel.removeAttribute('aria-selected');
      next.setAttribute('aria-selected', 'true');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = sel ? (sel.previousElementSibling || items[items.length - 1]) : items[items.length - 1];
      if (sel) sel.removeAttribute('aria-selected');
      prev.setAttribute('aria-selected', 'true');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (sel) {
        const s = DATA.students.find(st => st.name === sel.textContent);
        if (s) { selectStudent(s.id); input.value = s.name; list.innerHTML = ''; }
      }
    }
  });
}

// ----------------------------------------------------------------
// Student selection
// ----------------------------------------------------------------
const LS_KEY = 'civ-pcsi2-last-student';

function populateWeekSelect() {
  const sel = document.getElementById('week-select');
  sel.innerHTML = DATA.weeks.map((w, i) => {
    const monday = new Date(w.mondayISO);
    const friday = new Date(w.mondayISO);
    friday.setDate(friday.getDate() + 4);
    const fmt = { day: 'numeric', month: 'short' };
    const label = `Sem. ${w.label} — ${monday.toLocaleDateString('fr-FR', fmt)} › ${friday.toLocaleDateString('fr-FR', fmt)}`;
    return `<option value="${i}">${label}</option>`;
  }).join('');
}

function selectStudent(studentId) {
  currentStudent = DATA.students.find(s => s.id === studentId);
  if (!currentStudent) return;
  try { localStorage.setItem(LS_KEY, currentStudent.name); } catch (_) {}

  // Info bar
  document.getElementById('student-name').textContent = currentStudent.name;
  const meta = [
    `Trinôme ${currentStudent.trinome}`,
    currentStudent.groupeG,
    currentStudent.groupeC,
    currentStudent.lv2 ? `LV2 : ${currentStudent.lv2}` : null,
  ].filter(Boolean).join(' · ');
  document.getElementById('student-meta').textContent = meta;

  document.getElementById('student-info').hidden  = false;
  document.getElementById('week-nav').hidden       = false;
  document.getElementById('view-toggle').hidden    = false;

  populateWeekSelect();

  // Find current/next week
  currentWeekIdx = findCurrentWeekIdx();
  renderWeek();
  writeUrlParams();
}

function findCurrentWeekIdx() {
  // Utilise midi UTC pour éviter les décalages de fuseau sur le lundi ISO
  const today = new Date();
  // Samedi (6) ou dimanche (0) → pointer vers la semaine suivante
  const dayOfWeek = today.getDay(); // 0=dim, 6=sam
  const lookAhead = (dayOfWeek === 0 || dayOfWeek === 6);

  for (let i = 0; i < DATA.weeks.length; i++) {
    const monday = new Date(DATA.weeks[i].mondayISO + 'T12:00:00Z');
    const friday = new Date(monday.getTime() + 4 * 86400000);
    const nextMonday = new Date(monday.getTime() + 7 * 86400000);

    if (!lookAhead) {
      // Lun–Ven : retourner la semaine dont le lundi <= aujourd'hui <= vendredi
      if (today >= monday && today <= friday) return i;
      if (monday > today) return i; // première semaine future
    } else {
      // Sam–Dim : retourner la première semaine dont le lundi est après aujourd'hui
      if (monday > today) return i;
    }
  }
  return DATA.weeks.length - 1;
}

// ----------------------------------------------------------------
// Render
// ----------------------------------------------------------------
function renderWeek() {
  if (!currentStudent || !DATA) return;
  const week = DATA.weeks[currentWeekIdx];

  // Sync week select
  document.getElementById('week-select').value = currentWeekIdx;

  // Nav buttons
  document.getElementById('btn-prev').disabled = currentWeekIdx === 0;
  document.getElementById('btn-next').disabled = currentWeekIdx === DATA.weeks.length - 1;

  // Filter events for this student + week
  const evts = DATA.events.filter(e =>
    e.weekNumber === week.number &&
    e.studentIds.includes(currentStudent.id)
  );

  const schedule = document.getElementById('schedule');
  if (!evts.length) {
    schedule.innerHTML = '<p class="no-events">Aucun cours cette semaine.</p>';
    return;
  }

  schedule.innerHTML = currentView === 'day'
    ? renderByDay(evts, week.mondayISO)
    : renderByType(evts, week.mondayISO);
}

const TYPE_ORDER  = { Colle: 0, TP: 1, TD: 2, LV2: 3 };
const TYPE_LABELS = { Colle: 'Colles', TP: 'Travaux Pratiques', TD: 'Travaux Dirigés', LV2: 'LV2' };

/** Calcule la date d'un jour de la semaine à partir du lundi ISO */
function eventDate(mondayISO, dayName) {
  const d = new Date(mondayISO + 'T12:00:00');
  d.setDate(d.getDate() + (DAY_ORDER[dayName] ?? 0));
  return d;
}

/** Formate une Date en "Mercredi 24 sept." */
function formatDate(date) {
  const days  = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
  const months = ['jan.','fév.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
  return `${days[date.getDay()]} ${date.getDate()} ${months[date.getMonth()]}`;
}

function renderByType(evts, mondayISO) {
  const byType = {};
  evts.forEach(e => { (byType[e.type] = byType[e.type] || []).push(e); });
  Object.values(byType).forEach(arr => arr.sort((a, b) => {
    const d = (DAY_ORDER[a.day] ?? 9) - (DAY_ORDER[b.day] ?? 9);
    return d !== 0 ? d : (a.startHour ?? 99) - (b.startHour ?? 99);
  }));
  return Object.keys(byType)
    .sort((a, b) => (TYPE_ORDER[a] ?? 9) - (TYPE_ORDER[b] ?? 9))
    .map(type => `
      <div class="day-block">
        <div class="day-title">${TYPE_LABELS[type] || type}</div>
        ${byType[type].map(e => eventCard(e, false, mondayISO)).join('')}
      </div>
    `).join('');
}

function renderByDay(evts, mondayISO) {
  const byDay = {};
  evts.forEach(e => { (byDay[e.day] = byDay[e.day] || []).push(e); });
  Object.values(byDay).forEach(arr => arr.sort((a, b) => {
    const t = (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9);
    return t !== 0 ? t : (a.startHour ?? 99) - (b.startHour ?? 99);
  }));
  return Object.keys(byDay)
    .sort((a, b) => (DAY_ORDER[a] ?? 9) - (DAY_ORDER[b] ?? 9))
    .map(day => {
      const date = eventDate(mondayISO, day);
      return `
        <div class="day-block">
          <div class="day-title">${formatDate(date)}</div>
          ${byDay[day].map(e => eventCard(e, true, mondayISO)).join('')}
        </div>
      `;
    }).join('');
}

function eventCard(e, hideDay = false, mondayISO = null) {
  const typeClass  = `type-${e.type.toLowerCase()}`;
  const subjKey    = e.subject.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
  const subjClass  = `subj-${subjKey}`;
  const badgeClass = `badge-${e.type.toLowerCase()}`;
  const timeStr = e.startHour != null ? `${e.startHour}h` : '';
  let dayPart = '';
  if (!hideDay && e.day) {
    dayPart = (mondayISO && e.day in DAY_ORDER)
      ? formatDate(eventDate(mondayISO, e.day))
      : e.day;
  }
  const timePart = [dayPart, timeStr].filter(Boolean).join(' · ');
  const detail   = [
    e.teacher || null,
    e.room ? `Salle : ${e.room}` : null,
  ].filter(Boolean).join(' · ');

  return `
    <div class="event-card ${typeClass} ${subjClass}">
      <div class="event-header">
        <span class="badge-type ${badgeClass}">${e.type}</span>
        <span class="event-subject">${e.subject}</span>
        ${timePart ? `<span class="event-time">${timePart}</span>` : ''}
      </div>
      ${detail ? `<div class="event-detail">${detail}</div>` : ''}
    </div>
  `;
}

// ----------------------------------------------------------------
// Navigation
// ----------------------------------------------------------------
function navigate(delta) {
  const newIdx = currentWeekIdx + delta;
  if (newIdx < 0 || newIdx >= DATA.weeks.length) return;
  currentWeekIdx = newIdx;
  renderWeek();
  writeUrlParams();
}

// ----------------------------------------------------------------
// URL persistence
// ----------------------------------------------------------------
function readUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const eName = params.get('e');
  const wNum  = params.get('w');

  if (eName) {
    const normalise = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const s = DATA.students.find(st => normalise(st.name) === normalise(eName));
    if (s) {
      const inp = document.getElementById('student-search');
      inp.value = s.name;
      document.getElementById('btn-clear-search').hidden = false;
      selectStudent(s.id);
      if (wNum) {
        const idx = DATA.weeks.findIndex(w => w.number === parseInt(wNum, 10));
        if (idx >= 0) { currentWeekIdx = idx; renderWeek(); }
      }
      return true;
    }
  }
  return false;
}

function restoreLastStudent() {
  let name;
  try { name = localStorage.getItem(LS_KEY); } catch (_) { return; }
  if (!name) return;
  const normalise = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const s = DATA.students.find(st => normalise(st.name) === normalise(name));
  if (!s) return;
  document.getElementById('student-search').value = s.name;
  document.getElementById('btn-clear-search').hidden = false;
  selectStudent(s.id);
}

function writeUrlParams() {
  if (!currentStudent) return;
  const params = new URLSearchParams();
  params.set('e', currentStudent.name);
  params.set('w', DATA.weeks[currentWeekIdx].number);
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  history.replaceState(null, '', newUrl);
}

// ----------------------------------------------------------------
// ICS Export (RFC 5545)
// ----------------------------------------------------------------

/**
 * Retourne l'offset Europe/Paris en minutes pour une date locale donnée.
 * Utilise l'API Intl pour déterminer si la date est en heure d'été (UTC+2)
 * ou en heure d'hiver (UTC+1), sans calcul manuel DST.
 */
function parisOffsetMinutes(isoLocalNoTZ) {
  // On sonde l'offset réel via Intl en comparant l'heure UTC interprétée
  // avec l'heure locale Paris correspondante.
  const utcDate = new Date(isoLocalNoTZ + 'Z'); // interprète comme UTC
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Paris',
    hour: 'numeric', minute: 'numeric',
    hour12: false,
  }).formatToParts(utcDate);
  const h = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const m = parseInt(parts.find(p => p.type === 'minute').value, 10);
  const utcH = utcDate.getUTCHours();
  const utcM = utcDate.getUTCMinutes();
  let diff = (h * 60 + m) - (utcH * 60 + utcM);
  if (diff > 720)  diff -= 1440;
  if (diff < -720) diff += 1440;
  return diff; // +60 (hiver) ou +120 (été)
}

/** Formate une Date JS (déjà en UTC) en chaîne ICS : 20260923T140000Z */
function toICSDate(dateUTC) {
  const pad = n => String(n).padStart(2, '0');
  return `${dateUTC.getUTCFullYear()}${pad(dateUTC.getUTCMonth()+1)}${pad(dateUTC.getUTCDate())}` +
         `T${pad(dateUTC.getUTCHours())}${pad(dateUTC.getUTCMinutes())}00Z`;
}

function eventToVEVENT(e, mondayISO, studentId) {
  const dayOffset = DAY_ORDER[e.day] ?? 0;
  const startHour = e.startHour ?? 8;

  // Durée ICS : 1h par défaut pour TP et TD (durée réelle non garantie par l'Excel),
  // sauf TP dont la durée 2h est confirmée par l'emploi du temps officiel.
  // Colles et LV2 restent à durationHours (1h).
  // Pour passer tous les TP/TD à 2h : remplacer la ligne ci-dessous par :
  //   const duration = e.durationHours || 1;
  const CONFIRMED_2H_TYPES = ['TP']; // TD exclus car durée non garantie dans l'Excel
  const duration = (CONFIRMED_2H_TYPES.includes(e.type) ? 2 : (e.durationHours || 1));

  // Calcule la date locale (sans fuseau) du jour de l'événement
  const pad2 = n => String(n).padStart(2, '0');
  const mondayDate = new Date(mondayISO + 'T12:00:00Z');
  const eventLocalDate = new Date(mondayDate.getTime() + dayOffset * 86400000);
  const dateStr = `${eventLocalDate.getUTCFullYear()}-${pad2(eventLocalDate.getUTCMonth()+1)}-${pad2(eventLocalDate.getUTCDate())}`;
  const localNoTZ = `${dateStr}T${pad2(startHour)}:00:00`;

  // Détermine l'offset réel Europe/Paris pour cette date/heure locale
  const offsetMin = parisOffsetMinutes(localNoTZ);
  // Convertit en UTC : heure locale − offset
  const startUTC = new Date(new Date(localNoTZ + 'Z').getTime() - offsetMin * 60000);
  const endUTC   = new Date(startUTC.getTime() + duration * 3600000);

  const uid     = `${e.type}-${e.subject.replace(/\s/g,'')}-${e.weekNumber}-${studentId}@civ-pcsi2`;
  const summary = `[${e.type}] ${e.subject}`;
  const desc    = [
    e.teacher ? `Intervenant : ${e.teacher}` : null,
    e.room    ? `Salle : ${e.room}` : null,
  ].filter(Boolean).join('\\n');

  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(new Date())}`,
    `DTSTART:${toICSDate(startUTC)}`,
    `DTEND:${toICSDate(endUTC)}`,
    `SUMMARY:${summary}`,
    desc ? `DESCRIPTION:${desc}` : null,
    e.room ? `LOCATION:${e.room}` : null,
    'END:VEVENT',
  ].filter(Boolean).join('\r\n');
}

function generateICS(events) {
  const weekMap = {};
  DATA.weeks.forEach(w => { weekMap[w.number] = w.mondayISO; });

  const vevents = events.map(e => eventToVEVENT(e, weekMap[e.weekNumber], currentStudent.id));
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CIV PCSI2 Colloscope//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Planning CIV PCSI2',
    'X-WR-TIMEZONE:Europe/Paris',
    ...vevents,
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadICS(content, filename) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportWeek() {
  if (!currentStudent || !DATA) return;
  const week = DATA.weeks[currentWeekIdx];
  const evts = DATA.events.filter(e =>
    e.weekNumber === week.number &&
    e.studentIds.includes(currentStudent.id)
  );
  downloadICS(generateICS(evts), `planning_sem${week.number}_${currentStudent.name.replace(/\s+/g,'_')}.ics`);
}

function exportAll() {
  if (!currentStudent || !DATA) return;
  const evts = DATA.events.filter(e => e.studentIds.includes(currentStudent.id));
  downloadICS(generateICS(evts), `planning_annee_${currentStudent.name.replace(/\s+/g,'_')}.ics`);
}
