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

const DAY_ORDER = { Lundi: 0, Mardi: 1, Mercredi: 2, Jeudi: 3, Vendredi: 4 };

// ----------------------------------------------------------------
// Boot
// ----------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  fetch('data.json')
    .then(r => r.json())
    .then(data => {
      DATA = data;
      initAutocomplete();
      if (!readUrlParams()) {
        restoreLastStudent();
      }
    })
    .catch(err => {
      document.getElementById('schedule').innerHTML =
        `<p class="no-events">Erreur de chargement des données : ${err.message}</p>`;
    });

  document.getElementById('btn-prev').addEventListener('click', () => navigate(-1));
  document.getElementById('btn-next').addEventListener('click', () => navigate(+1));
  document.getElementById('btn-ics-week').addEventListener('click', exportWeek);
  document.getElementById('btn-ics-all').addEventListener('click', exportAll);
});

// ----------------------------------------------------------------
// Autocomplete
// ----------------------------------------------------------------
function initAutocomplete() {
  const input = document.getElementById('student-search');
  const list  = document.getElementById('suggestions');

  input.addEventListener('input', () => {
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

  document.getElementById('student-info').hidden = false;
  document.getElementById('week-nav').hidden      = false;
  document.getElementById('export-bar').hidden    = false;

  // Find current/next week
  currentWeekIdx = findCurrentWeekIdx();
  renderWeek();
  writeUrlParams();
}

function findCurrentWeekIdx() {
  const now = Date.now();
  // Find first week whose monday >= today
  for (let i = 0; i < DATA.weeks.length; i++) {
    const monday = new Date(DATA.weeks[i].mondayISO).getTime();
    const sunday = monday + 6 * 86400000;
    if (now >= monday && now <= sunday) return i;           // current week
    if (monday > now) return i;                              // next upcoming week
  }
  return DATA.weeks.length - 1;                             // past all: last week
}

// ----------------------------------------------------------------
// Render
// ----------------------------------------------------------------
function renderWeek() {
  if (!currentStudent || !DATA) return;
  const week = DATA.weeks[currentWeekIdx];

  // Week label
  const mondayDate = new Date(week.mondayISO);
  const fridayDate = new Date(week.mondayISO);
  fridayDate.setDate(fridayDate.getDate() + 4);
  const fmtOpts = { day: 'numeric', month: 'short' };
  const locale  = 'fr-FR';
  const labelDate = `${mondayDate.toLocaleDateString(locale, fmtOpts)} – ${fridayDate.toLocaleDateString(locale, fmtOpts)} ${mondayDate.getFullYear()}`;
  document.getElementById('week-label').textContent = `Sem. ${week.label} — ${labelDate}`;

  // Nav buttons
  document.getElementById('btn-prev').disabled = currentWeekIdx === 0;
  document.getElementById('btn-next').disabled = currentWeekIdx === DATA.weeks.length - 1;

  // Filter events for this student + week
  const evts = DATA.events.filter(e =>
    e.weekNumber === week.number &&
    e.studentIds.includes(currentStudent.id)
  );

  // Group by day
  const byDay = {};
  evts.forEach(e => {
    const d = e.day;
    if (!byDay[d]) byDay[d] = [];
    byDay[d].push(e);
  });

  // Sort each day's events by startHour
  Object.values(byDay).forEach(arr => arr.sort((a, b) => (a.startHour ?? 99) - (b.startHour ?? 99)));

  // Render
  const schedule = document.getElementById('schedule');
  if (!evts.length) {
    schedule.innerHTML = '<p class="no-events">Aucun cours cette semaine.</p>';
    return;
  }

  const days = Object.keys(byDay).sort((a, b) => (DAY_ORDER[a] ?? 9) - (DAY_ORDER[b] ?? 9));
  schedule.innerHTML = days.map(day => `
    <div class="day-block">
      <div class="day-title">${day}</div>
      ${byDay[day].map(eventCard).join('')}
    </div>
  `).join('');
}

function eventCard(e) {
  const typeClass   = `type-${e.type.toLowerCase()}`;
  const subjKey     = e.subject.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
  const subjClass   = `subj-${subjKey}`;
  const badgeClass  = `badge-${e.type.toLowerCase()}`;
  const timeStr     = e.startHour != null
    ? `${e.startHour}h – ${e.startHour + (e.durationHours || 1)}h`
    : '';
  const detail = [
    e.teacher ? `${e.teacher}` : null,
    e.room    ? `Salle : ${e.room}` : null,
  ].filter(Boolean).join(' · ');

  return `
    <div class="event-card ${typeClass} ${subjClass}">
      <div class="event-header">
        <span class="badge-type ${badgeClass}">${e.type}</span>
        <span class="event-subject">${e.subject}</span>
        ${timeStr ? `<span class="event-time">${timeStr}</span>` : ''}
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
      document.getElementById('student-search').value = s.name;
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
const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Juin','Jul','Aoû','Sep','Oct','Nov','Déc'];

/** Is date in DST (CEST = UTC+2) for Europe/Paris? */
function isDST(date) {
  // DST starts last Sunday of March at 2:00, ends last Sunday of October at 3:00
  const year = date.getUTCFullYear();
  const lastSunMarch  = lastSundayOfMonth(year, 2);   // month 2 = March (0-based)
  const lastSunOctober= lastSundayOfMonth(year, 9);   // month 9 = October
  return date >= lastSunMarch && date < lastSunOctober;
}

function lastSundayOfMonth(year, month) {
  // Find last day of month, walk back to Sunday
  const d = new Date(Date.UTC(year, month + 1, 0)); // last day
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());     // back to Sunday
  return d;
}

function toICSDate(date) {
  const offset = isDST(date) ? -2 : -1; // UTC+2 summer, UTC+1 winter
  const utc = new Date(date.getTime() - offset * 3600000);
  const pad = n => String(n).padStart(2, '0');
  return `${utc.getUTCFullYear()}${pad(utc.getUTCMonth()+1)}${pad(utc.getUTCDate())}` +
         `T${pad(utc.getUTCHours())}${pad(utc.getUTCMinutes())}00Z`;
}

function eventToVEVENT(e, mondayISO, studentId) {
  const dayOffset = DAY_ORDER[e.day] ?? 0;
  const startHour = e.startHour ?? 8;
  const duration  = e.durationHours || 1;

  const startDate = new Date(`${mondayISO}T${String(startHour).padStart(2,'0')}:00:00+01:00`);
  startDate.setDate(startDate.getDate() + dayOffset);
  const endDate   = new Date(startDate.getTime() + duration * 3600000);

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
    `DTSTART:${toICSDate(startDate)}`,
    `DTEND:${toICSDate(endDate)}`,
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
