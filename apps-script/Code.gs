// =============================================================
// Net Games Skill Tracker — Google Apps Script
// =============================================================
// Deploy: Extensions → Apps Script → Deploy → New deployment
//   Type: Web app | Execute as: Me | Access: Anyone
// After deploying, copy the URL into APPS_SCRIPT_URL in build.py
// (then rebuild and push).
//
// ⚠️  Run setupSheets() ONCE from the editor after pasting — this
//     nukes and recreates all tabs (7A, 8A, Agility, Settings).
// =============================================================

var SPREADSHEET_ID = '1FYDW1Zm78XTC6wNYlrnhThcnhuEZBMuoVwa2YlZ2-e8';
var TEACHER_PIN = '1770';

// Per-lesson skill/effort/agility-focus fields (class sheets)
var LESSON_FIELDS = [
  'bserve','bshot','bfoot','btac',
  'vserve','vskill','vpos','comm',
  'effort',
  'agility_focus','agility_execution'
];
var LESSON_HEADERS = ['Student','Lesson'].concat(LESSON_FIELDS).concat(['timestamp']);

// Agility tab fields (baseline + retest, separate from per-lesson rows)
var AGILITY_HEADERS = ['Student','Class','ag_baseline','ag_retest'];

// PINs tab — one row per student per class, holds their 4-digit PIN
var PIN_HEADERS = ['Student','Class','PIN'];

// Grades tab — one row per student per class, holds S2/S1/S4 scores + teacher pills
var GRADE_HEADERS = ['Student','Class','S2','S1','S4',
  's2_teacher','s1_badminton_teacher','s1_volleyball_teacher','s4_teacher','timestamp'];
var GRADE_CRITERIA = ['S2','S1','S4',
  's2_teacher','s1_badminton_teacher','s1_volleyball_teacher','s4_teacher'];
var GRADE_SCORE_CRITERIA = ['S2','S1','S4'];        // 1-7 range
var GRADE_PILL_CRITERIA = ['s2_teacher','s1_badminton_teacher','s1_volleyball_teacher','s4_teacher']; // 1-3 range

// Settings tab fields
var SETTINGS_HEADERS = ['Class','CurrentLesson'];

var CLASSES = ['7A','8A'];

// Student rosters (kept in sync with build.py STUDENTS_7A / STUDENTS_8A)
var ROSTERS = {
  '7A': [
    'Freya R','Flavio C','Karim Y A G','Soomin O','Chaeyi L',
    'Michelle S','Woojun J','Kian W','Nico S','Louis H',
    'Ella B','Lena L','Austin W','Jihoo P','Ari R',
    'Yilei L','Joon S','Rubin L','Minh V'
  ],
  '8A': [
    'Nicolas v M','Seppe M','Antonia G','Amaya W','Peter T',
    'Silas V','Seoyeon J','Taehyun S','Dylan T','Ryan S',
    'Josh R','David L','Vihaan M','Philipp N',"Alec O'D",
    'Bora G','Katharina V','Kinley C','Ray S'
  ]
};

// ---------- helpers ----------

function ss() { return SpreadsheetApp.openById(SPREADSHEET_ID); }
function getSheet(name) { return ss().getSheetByName(name); }

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function colIndex(headers, field) {
  for (var i = 0; i < headers.length; i++) if (headers[i] === field) return i + 1;
  return -1;
}

function findLessonRow(sheet, student, lesson) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var vals = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0] === student && String(vals[i][1]) === String(lesson)) return i + 2;
  }
  return -1;
}

function findRowBy(sheet, col, value) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var vals = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) if (vals[i][0] === value) return i + 2;
  return -1;
}

function findRowBy2(sheet, col1, val1, col2, val2) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var lastCol = Math.max(col1, col2);
  var vals = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][col1 - 1] === val1 && vals[i][col2 - 1] === val2) return i + 2;
  }
  return -1;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Serialize every write. Apps Script runs web-app requests concurrently, so a
// classroom full of students tapping at once would otherwise interleave the
// read-row / append / setValue steps below — appending to the wrong row or
// creating duplicate (Student, Lesson) rows. Holding the script lock makes
// each write atomic relative to the others.
function withLock(fn) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
  } catch (e) {
    return jsonResponse({ error: 'Busy — retry' });
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

// ---------- GET ----------

function doGet(e) {
  try {
    var action = e.parameter.action;
    var className = e.parameter['class'];

    if (action === 'getStudent') {
      var student = e.parameter.student;
      if (!className || !student) return jsonResponse({ error: 'Missing params' });
      return jsonResponse(readStudent(className, student));
    }
    if (action === 'getRoster') {
      if (!className) return jsonResponse({ error: 'Missing class' });
      return jsonResponse(readRoster(className));
    }
    if (action === 'getAllCurrent') {
      if (!className) return jsonResponse({ error: 'Missing class' });
      return jsonResponse(readAllCurrent(className));
    }
    if (action === 'getEngagement') {
      if (!className) return jsonResponse({ error: 'Missing class' });
      return jsonResponse(readEngagement(className));
    }
    if (action === 'getAllPins') {
      if (!className) return jsonResponse({ error: 'Missing class' });
      if (e.parameter.pin !== TEACHER_PIN) return jsonResponse({ error: 'Bad PIN' });
      return jsonResponse({ pins: readPinMap(className) });
    }
    if (action === 'getGrades') {
      if (!className) return jsonResponse({ error: 'Missing class' });
      return jsonResponse({ grades: readGrades(className) });
    }
    return jsonResponse({ error: 'Invalid action' });
  } catch (err) {
    return jsonResponse({ error: String(err) });
  }
}

function readStudent(className, student) {
  var out = {
    student: student,
    lessons: [],
    agility: { ag_baseline: '', ag_retest: '' }
  };
  var sheet = getSheet(className);
  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    for (var r = 1; r < data.length; r++) {
      if (data[r][0] !== student) continue;
      var obj = {};
      for (var c = 0; c < headers.length; c++) obj[headers[c]] = data[r][c];
      out.lessons.push(obj);
    }
  }
  var ag = getSheet('Agility');
  if (ag && ag.getLastRow() > 1) {
    var row = findRowBy2(ag, 1, student, 2, className);
    if (row !== -1) {
      var hdrs = getHeaders(ag);
      var vals = ag.getRange(row, 1, 1, hdrs.length).getValues()[0];
      for (var i = 0; i < hdrs.length; i++) {
        if (hdrs[i] === 'ag_baseline' || hdrs[i] === 'ag_retest') out.agility[hdrs[i]] = vals[i];
      }
    }
  }
  return out;
}

function readRoster(className) {
  return { students: ROSTERS[className] || [] };
}

// One-shot load of the static per-student data the roster page needs:
// hasPin (controls create-vs-enter flow) and agility test times. Per-lesson
// reflections are fetched on demand via getStudent when a pill is tapped.
function readAllCurrent(className) {
  var out = { students: {} };
  (ROSTERS[className] || []).forEach(function(n) {
    out.students[n] = { ag_baseline: '', ag_retest: '' };
  });

  var ag = getSheet('Agility');
  if (ag && ag.getLastRow() > 1) {
    var agData = ag.getDataRange().getValues();
    for (var r2 = 1; r2 < agData.length; r2++) {
      if (agData[r2][1] !== className) continue;
      var n2 = agData[r2][0];
      if (!out.students[n2]) out.students[n2] = { ag_baseline: '', ag_retest: '' };
      out.students[n2].ag_baseline = agData[r2][2];
      out.students[n2].ag_retest = agData[r2][3];
    }
  }

  var pinMap = readPinMap(className);
  for (var n3 in out.students) {
    out.students[n3].hasPin = !!(pinMap[n3] && String(pinMap[n3]).length > 0);
  }

  return out;
}

// Normalize a PIN cell — Sheets coerces "0123" into the number 123 on write,
// so any PIN with a leading zero comes back missing digits. Re-pad to 4.
function normalizePin(raw) {
  if (raw === '' || raw === null || raw === undefined) return '';
  var s = String(raw);
  if (/^\d+$/.test(s) && s.length > 0 && s.length < 4) s = ('0000' + s).slice(-4);
  return s;
}

function readPinMap(className) {
  var sheet = getSheet('Pins');
  var map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  var data = sheet.getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (data[r][1] === className) map[data[r][0]] = normalizePin(data[r][2]);
  }
  return map;
}

function blankStudentRatings() {
  var d = { ag_baseline: '', ag_retest: '', agility_focus: '', agility_execution: 0 };
  for (var i = 0; i < LESSON_FIELDS.length; i++) {
    var k = LESSON_FIELDS[i];
    if (k !== 'agility_focus' && k !== 'agility_execution') d[k] = 0;
  }
  return d;
}

function readEngagement(className) {
  var out = { students: {} };
  (ROSTERS[className] || []).forEach(function(n) { out.students[n] = {}; });
  var sheet = getSheet(className);
  if (!sheet || sheet.getLastRow() < 2) return out;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  for (var r = 1; r < data.length; r++) {
    var student = data[r][0];
    var lesson = data[r][1];
    if (!student || !lesson) continue;
    if (!out.students[student]) out.students[student] = {};
    var obj = {};
    for (var c = 2; c < headers.length; c++) obj[headers[c]] = data[r][c];
    out.students[student]['L' + lesson] = obj;
  }
  return out;
}

// ---------- POST ----------

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    if (action === 'saveLesson') return withLock(function() { return saveLesson(body); });
    if (action === 'saveAgility') return withLock(function() { return saveAgility(body); });
    if (action === 'verifyPin') return verifyPin(body);
    if (action === 'setPin') return withLock(function() { return setPin(body); });
    if (action === 'resetPin') return withLock(function() { return resetPin(body); });
    if (action === 'saveGrade') return withLock(function() { return saveGrade(body); });
    return jsonResponse({ error: 'Unknown action' });
  } catch (err) {
    return jsonResponse({ error: String(err) });
  }
}

function saveLesson(body) {
  var className = body['class'];
  var student = body.student;
  var lesson = parseInt(body.lesson, 10);
  var field = body.field;
  var value = body.value;

  if (!className || !student || !lesson || !field) return jsonResponse({ error: 'Missing params' });
  if (LESSON_FIELDS.indexOf(field) === -1) return jsonResponse({ error: 'Bad field: ' + field });

  var sheet = getSheet(className);
  if (!sheet) return jsonResponse({ error: 'Sheet not found: ' + className });
  var headers = getHeaders(sheet);

  var row = findLessonRow(sheet, student, lesson);
  if (row === -1) {
    var newRow = new Array(headers.length);
    for (var i = 0; i < headers.length; i++) newRow[i] = '';
    newRow[0] = student;
    newRow[1] = lesson;
    for (var j = 2; j < headers.length; j++) {
      if (LESSON_FIELDS.indexOf(headers[j]) !== -1 && headers[j] !== 'agility_focus') newRow[j] = 0;
    }
    sheet.appendRow(newRow);
    row = sheet.getLastRow();
  }

  var col = colIndex(headers, field);
  if (col === -1) return jsonResponse({ error: 'Unknown column: ' + field });

  var toWrite;
  if (field === 'agility_focus') {
    toWrite = String(value || '');
  } else {
    var n = parseInt(value, 10);
    if (isNaN(n) || n < 0 || n > 4) return jsonResponse({ error: 'Value must be 0-4' });
    toWrite = n;
  }
  sheet.getRange(row, col).setValue(toWrite);

  var tsCol = colIndex(headers, 'timestamp');
  if (tsCol !== -1) sheet.getRange(row, tsCol).setValue(new Date());

  return jsonResponse({ ok: true });
}

function saveAgility(body) {
  var className = body['class'];
  var student = body.student;
  var field = body.field;
  var value = parseFloat(body.value);

  if (!className || !student || !field) return jsonResponse({ error: 'Missing params' });
  if (field !== 'ag_baseline' && field !== 'ag_retest') return jsonResponse({ error: 'Bad field' });
  if (isNaN(value)) return jsonResponse({ error: 'Value must be numeric' });

  var sheet = getSheet('Agility');
  if (!sheet) return jsonResponse({ error: 'Agility sheet missing' });
  var headers = getHeaders(sheet);

  var row = findRowBy2(sheet, 1, student, 2, className);
  if (row === -1) {
    sheet.appendRow([student, className, '', '']);
    row = sheet.getLastRow();
  }
  var col = colIndex(headers, field);
  sheet.getRange(row, col).setValue(value);
  return jsonResponse({ ok: true });
}

function verifyPin(body) {
  var className = body['class'];
  var student = body.student;
  var pin = String(body.pin || '');
  if (!className || !student) return jsonResponse({ error: 'Missing params' });
  var map = readPinMap(className);
  var stored = String(map[student] || '');
  if (!stored) return jsonResponse({ error: 'No PIN set' });
  if (stored === pin) return jsonResponse({ ok: true });
  return jsonResponse({ error: 'Wrong PIN' });
}

function setPin(body) {
  var className = body['class'];
  var student = body.student;
  var pin = String(body.pin || '');
  var teacherPin = body.teacherPin;
  if (!className || !student) return jsonResponse({ error: 'Missing params' });
  if (!/^\d{4}$/.test(pin)) return jsonResponse({ error: 'PIN must be 4 digits' });

  var sheet = getSheet('Pins');
  if (!sheet) return jsonResponse({ error: 'Pins sheet missing' });

  var row = findRowBy2(sheet, 1, student, 2, className);
  var existing = '';
  if (row !== -1) existing = String(sheet.getRange(row, 3).getValue() || '');

  // Allow if: no existing PIN (first-time create) OR teacher PIN matches (reset).
  if (existing && teacherPin !== TEACHER_PIN) {
    return jsonResponse({ error: 'PIN already set — ask teacher to reset' });
  }

  if (row === -1) {
    sheet.appendRow([student, className, '']);
    row = sheet.getLastRow();
  }
  var cell = sheet.getRange(row, 3);
  cell.setNumberFormat('@');
  cell.setValue(pin);
  return jsonResponse({ ok: true });
}

function readGrades(className) {
  var sheet = getSheet('Grades');
  var out = {};
  if (!sheet || sheet.getLastRow() < 2) return out;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  function cellInt(row, field) {
    var c = colIndex(headers, field);
    if (c === -1) return null;
    var v = row[c - 1];
    return (v === '' || v === null || v === undefined) ? null : parseInt(v, 10);
  }
  for (var r = 1; r < data.length; r++) {
    if (data[r][1] !== className) continue;
    var rec = {};
    GRADE_CRITERIA.forEach(function(k) { rec[k] = cellInt(data[r], k); });
    out[data[r][0]] = rec;
  }
  return out;
}

function saveGrade(body) {
  var className = body['class'];
  var student = body.student;
  var criterion = body.criterion;
  var score = parseInt(body.score, 10);
  if (!className || !student || !criterion) return jsonResponse({ error: 'Missing params' });
  if (GRADE_CRITERIA.indexOf(criterion) === -1) return jsonResponse({ error: 'Bad criterion' });
  var isPill = GRADE_PILL_CRITERIA.indexOf(criterion) !== -1;
  var max = isPill ? 3 : 7;
  if (isNaN(score) || score < 1 || score > max) return jsonResponse({ error: 'Score must be 1-' + max });
  var sheet = getSheet('Grades');
  if (!sheet) return jsonResponse({ error: 'Grades sheet missing' });
  var headers = getHeaders(sheet);
  var row = findRowBy2(sheet, 1, student, 2, className);
  if (row === -1) {
    var newRow = new Array(headers.length);
    for (var i = 0; i < headers.length; i++) newRow[i] = '';
    newRow[0] = student; newRow[1] = className;
    newRow[headers.length - 1] = new Date();
    sheet.appendRow(newRow);
    row = sheet.getLastRow();
  }
  sheet.getRange(row, colIndex(headers, criterion)).setValue(score);
  sheet.getRange(row, colIndex(headers, 'timestamp')).setValue(new Date());
  return jsonResponse({ ok: true });
}

function resetPin(body) {
  if (body.teacherPin !== TEACHER_PIN) return jsonResponse({ error: 'Bad teacher PIN' });
  var className = body['class'];
  var student = body.student;
  if (!className || !student) return jsonResponse({ error: 'Missing params' });
  var sheet = getSheet('Pins');
  if (!sheet) return jsonResponse({ error: 'Pins sheet missing' });
  var row = findRowBy2(sheet, 1, student, 2, className);
  if (row !== -1) sheet.getRange(row, 3).setValue('');
  return jsonResponse({ ok: true });
}

// ---------- Sheet setup (run ONCE from editor) ----------

function setupSheets() {
  var book = ss();

  CLASSES.forEach(function(cls) {
    var s = book.getSheetByName(cls) || book.insertSheet(cls);
    s.clear();
    s.getRange(1, 1, 1, LESSON_HEADERS.length).setValues([LESSON_HEADERS]);
    s.setFrozenRows(1);
  });

  var ag = book.getSheetByName('Agility') || book.insertSheet('Agility');
  ag.clear();
  ag.getRange(1, 1, 1, AGILITY_HEADERS.length).setValues([AGILITY_HEADERS]);
  ag.setFrozenRows(1);
  var agRows = [];
  CLASSES.forEach(function(cls) {
    (ROSTERS[cls] || []).forEach(function(name) { agRows.push([name, cls, '', '']); });
  });
  if (agRows.length) ag.getRange(2, 1, agRows.length, AGILITY_HEADERS.length).setValues(agRows);

  var pn = book.getSheetByName('Pins') || book.insertSheet('Pins');
  pn.clear();
  pn.getRange(1, 1, 1, PIN_HEADERS.length).setValues([PIN_HEADERS]);
  pn.setFrozenRows(1);
  // Keep the PIN column text-formatted so leading zeros survive setValue.
  pn.getRange('C:C').setNumberFormat('@');
  var pnRows = [];
  CLASSES.forEach(function(cls) {
    (ROSTERS[cls] || []).forEach(function(name) { pnRows.push([name, cls, '']); });
  });
  if (pnRows.length) pn.getRange(2, 1, pnRows.length, PIN_HEADERS.length).setValues(pnRows);

  var gr = book.getSheetByName('Grades') || book.insertSheet('Grades');
  gr.clear();
  gr.getRange(1, 1, 1, GRADE_HEADERS.length).setValues([GRADE_HEADERS]);
  gr.setFrozenRows(1);

  var st = book.getSheetByName('Settings') || book.insertSheet('Settings');
  st.clear();
  st.getRange(1, 1, 1, SETTINGS_HEADERS.length).setValues([SETTINGS_HEADERS]);
  st.setFrozenRows(1);
  var stRows = CLASSES.map(function(c) { return [c, 1]; });
  st.getRange(2, 1, stRows.length, SETTINGS_HEADERS.length).setValues(stRows);
}

// ---------- Data-integrity audit (read-only, run from editor) ----------
// Reports duplicate rows that the old unlocked writes could have produced:
//   - class tabs (7A/8A): duplicate (Student, Lesson)
//   - Agility/Grades/Pins: duplicate (Student, Class)
// Duplicates mean writes and reads may target different rows, so values can
// appear to "not save". Non-destructive — only reads and logs. View output in
// the editor under Executions, or read the returned string.
function auditDuplicates() {
  var report = [];

  CLASSES.forEach(function(cls) {
    var sheet = getSheet(cls);
    if (!sheet || sheet.getLastRow() < 2) return;
    var data = sheet.getDataRange().getValues();
    var seen = {};
    for (var r = 1; r < data.length; r++) {
      if (data[r][0] === '' && data[r][1] === '') continue;
      var key = data[r][0] + ' || L' + data[r][1];
      if (seen[key]) {
        report.push(cls + ': DUPLICATE ' + data[r][0] + ' Lesson ' + data[r][1] +
                    ' (sheet rows ' + (seen[key] + 1) + ' and ' + (r + 1) + ')');
      } else {
        seen[key] = r;
      }
    }
  });

  ['Agility', 'Grades', 'Pins'].forEach(function(tab) {
    var sheet = getSheet(tab);
    if (!sheet || sheet.getLastRow() < 2) return;
    var data = sheet.getDataRange().getValues();
    var seen = {};
    for (var r = 1; r < data.length; r++) {
      if (data[r][0] === '') continue;
      var key = data[r][0] + ' || ' + data[r][1];
      if (seen[key]) {
        report.push(tab + ': DUPLICATE ' + data[r][0] + ' / ' + data[r][1] +
                    ' (sheet rows ' + (seen[key] + 1) + ' and ' + (r + 1) + ')');
      } else {
        seen[key] = r;
      }
    }
  });

  if (report.length === 0) report.push('No duplicate rows found — data integrity looks clean.');
  var text = report.join('\n');
  Logger.log(text);
  return text;
}

// ---------- Per-student coverage / loss triage (run from editor) ----------
// Separates "lost data" from "never did it" by cross-referencing each
// student's saved work against whether they set a PIN. A student who set a
// PIN clearly opened and used the app, so a PIN with little/no saved data is
// a strong sign their saves were lost. Writes a readable table to an "Audit"
// tab (only creates/overwrites that one tab — never touches class data).
//
// Status meanings:
//   CORRUPTED  — has duplicate (Student, Lesson) rows; work exists but is
//                split across rows. Recoverable by merging (see auditDuplicates).
//   LOST?      — set a PIN (used the app) but saved nothing. Almost certainly
//                lost. Ask the student to re-enter; their data is gone.
//   PARTIAL?   — set a PIN and has rows, but the fullest lesson has <=2 of 11
//                fields. Could be partial loss or just light use — verify.
//   NO ACTIVITY— no PIN and no rows. Most likely never started.
//   OK         — has data and no duplicates.
function dataCoverageReport() {
  var TOTAL_FIELDS = LESSON_FIELDS.length;
  var header = ['Class', 'Student', 'Set PIN?', 'Lessons w/ data',
                'Duplicate lessons', 'Best lesson fill', 'Status'];
  var summary = [header];

  CLASSES.forEach(function(cls) {
    var roster = ROSTERS[cls] || [];
    var pinMap = readPinMap(cls);
    var perStudent = {};
    roster.forEach(function(n) { perStudent[n] = {}; });

    var sheet = getSheet(cls);
    if (sheet && sheet.getLastRow() > 1) {
      var data = sheet.getDataRange().getValues();
      var headers = data[0];
      var fieldCols = LESSON_FIELDS.map(function(f) { return headers.indexOf(f); });
      for (var r = 1; r < data.length; r++) {
        var student = data[r][0];
        if (!student) continue;
        if (!perStudent[student]) perStudent[student] = {};
        var filled = 0;
        fieldCols.forEach(function(ci) {
          if (ci === -1) return;
          var v = data[r][ci];
          if (v !== '' && v !== null && v !== undefined && v !== 0) filled++;
        });
        var lkey = 'L' + data[r][1];
        if (!perStudent[student][lkey]) perStudent[student][lkey] = { count: 0, fill: 0 };
        perStudent[student][lkey].count++;
        perStudent[student][lkey].fill = Math.max(perStudent[student][lkey].fill, filled);
      }
    }

    roster.forEach(function(n) {
      var lessons = perStudent[n] || {};
      var keys = Object.keys(lessons);
      var dup = keys.filter(function(k) { return lessons[k].count > 1; });
      var bestFill = 0;
      keys.forEach(function(k) { bestFill = Math.max(bestFill, lessons[k].fill); });
      var withData = keys.filter(function(k) { return lessons[k].fill > 0; }).length;
      var hasPin = !!(pinMap[n] && String(pinMap[n]).length > 0);

      var status;
      if (dup.length > 0) status = 'CORRUPTED';
      else if (withData === 0 && hasPin) status = 'LOST?';
      else if (withData === 0 && !hasPin) status = 'NO ACTIVITY';
      else if (bestFill <= 2 && hasPin) status = 'PARTIAL?';
      else status = 'OK';

      summary.push([cls, n, hasPin ? 'yes' : 'no', withData,
                    dup.length ? dup.join(' ') : '',
                    bestFill + ' / ' + TOTAL_FIELDS, status]);
    });
  });

  var book = ss();
  var au = book.getSheetByName('Audit') || book.insertSheet('Audit');
  au.clear();
  au.getRange(1, 1, summary.length, header.length).setValues(summary);
  au.setFrozenRows(1);
  au.autoResizeColumns(1, header.length);

  return 'Audit tab updated — ' + (summary.length - 1) + ' students reviewed.';
}

// ---------- Single-student detail (run from editor to answer one email) ----------
// Dumps, lesson by lesson (L1..L9), exactly what is stored for one student:
// whether a row exists, how many fields are filled (and which), the last-save
// timestamp, and a DUPLICATE flag. Use this to verify a "I can't see my data
// after lesson N" report — e.g. studentDetail('7A', 'Soomin O').
// Read-only. Output appears under Executions and as the return string.
function studentDetail(className, student) {
  var sheet = getSheet(className);
  var lines = ['Detail for "' + student + '" in ' + className + ':'];
  var byLesson = {};

  if (sheet && sheet.getLastRow() > 1) {
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var fieldCols = LESSON_FIELDS.map(function(f) { return headers.indexOf(f); });
    var tsCol = headers.indexOf('timestamp');
    for (var r = 1; r < data.length; r++) {
      if (data[r][0] !== student) continue;
      var filled = [];
      LESSON_FIELDS.forEach(function(f, i) {
        var ci = fieldCols[i];
        if (ci === -1) return;
        var v = data[r][ci];
        if (v !== '' && v !== null && v !== undefined && v !== 0) filled.push(f);
      });
      var lkey = 'L' + data[r][1];
      if (!byLesson[lkey]) byLesson[lkey] = [];
      byLesson[lkey].push({ row: r + 1, filled: filled, ts: tsCol !== -1 ? data[r][tsCol] : '' });
    }
  }

  for (var L = 1; L <= 9; L++) {
    var recs = byLesson['L' + L];
    if (!recs) { lines.push('L' + L + ': NO ROW — nothing was ever saved'); continue; }
    var dupFlag = recs.length > 1 ? '  *** ' + recs.length + ' DUPLICATE ROWS ***' : '';
    recs.forEach(function(rec) {
      lines.push('L' + L + ': row ' + rec.row + ' — ' + rec.filled.length + '/' +
                 LESSON_FIELDS.length + ' fields [' + rec.filled.join(', ') + '] · last save ' +
                 rec.ts + dupFlag);
    });
  }

  var text = lines.join('\n');
  Logger.log(text);
  return text;
}

// ---------- Duplicate-row repair (merge split records) ----------
// Merges duplicate (Student, Lesson) rows on the class tabs and duplicate
// (Student, Class) rows on Grades back into a single row, so work that the
// old unlocked writes split across two rows is reconstructed.
//
// Merge rule, per field: take the one "set" value (non-zero / non-blank). If
// two rows disagree on a field, keep the one from the row with the later
// timestamp and note it as a conflict. The merged row keeps the latest
// timestamp; the extra row(s) are deleted.
//
// SAFETY:
//   repairDuplicates()      → DRY RUN. Changes nothing; logs the exact plan.
//   repairDuplicates(true)  → APPLY. First copies 7A/8A/Grades to timestamped
//                             backup tabs, then merges. Holds the script lock
//                             so it can't race live student saves.
// Always run the dry run, read the plan, THEN apply.
function repairDuplicates(apply) {
  var book = ss();
  var lock = LockService.getScriptLock();
  if (apply) {
    try { lock.waitLock(30000); }
    catch (e) { return 'Could not acquire lock — students may be saving. Try again in a moment.'; }
  }
  try {
    var out = [];
    if (apply) {
      var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmm');
      ['7A', '8A', 'Grades'].forEach(function(name) {
        var sh = book.getSheetByName(name);
        if (sh) book.getSheetByName(name).copyTo(book).setName('bak_' + name + '_' + stamp);
      });
      out.push('Backups created with suffix _' + stamp + '. Merging…');
    } else {
      out.push('DRY RUN — nothing changed. Review the plan, then run repairDuplicates(true) to apply.');
    }

    CLASSES.forEach(function(cls) {
      out = out.concat(repairSheet(getSheet(cls), cls, LESSON_FIELDS, apply));
    });
    out = out.concat(repairSheet(getSheet('Grades'), 'Grades', GRADE_CRITERIA, apply));

    if (out.length === 1) out.push('No duplicates to merge.');
    var text = out.join('\n');
    Logger.log(text);
    return text;
  } finally {
    if (apply) lock.releaseLock();
  }
}

// Friendly wrappers so you can run these straight from the editor's Run
// menu (which can't pass arguments). Pick the function name, click Run, then
// read the Execution log at the bottom.
function previewRepair() { return repairDuplicates(false); }  // safe — changes nothing
function applyRepair()   { return repairDuplicates(true);  }  // backs up, then merges

// Merge duplicate rows within one sheet, keyed on columns 1+2. Returns a list
// of human-readable plan lines. Only mutates the sheet when apply is true.
function repairSheet(sheet, label, valueFields, apply) {
  var out = [];
  if (!sheet || sheet.getLastRow() < 2) return out;
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var tsCol = headers.indexOf('timestamp');

  var groups = {};
  for (var r = 1; r < data.length; r++) {
    if (data[r][0] === '') continue;
    var key = data[r][0] + '||' + data[r][1];
    (groups[key] = groups[key] || []).push(r);
  }

  var deletions = [];
  Object.keys(groups).forEach(function(key) {
    var idxs = groups[key];
    if (idxs.length < 2) return;
    var survivor = idxs[0];
    var merged = data[survivor].slice();
    var conflicts = [];

    valueFields.forEach(function(f) {
      var ci = headers.indexOf(f);
      if (ci === -1) return;
      var chosen = null, chosenTs = null;
      idxs.forEach(function(ri) {
        var v = data[ri][ci];
        if (v === '' || v === null || v === undefined || v === 0) return; // unset
        var ts = tsCol !== -1 ? data[ri][tsCol] : null;
        if (chosen === null) { chosen = v; chosenTs = ts; }
        else if (v !== chosen) {
          if (ts && chosenTs && ts > chosenTs) { chosen = v; chosenTs = ts; }
          if (conflicts.indexOf(f) === -1) conflicts.push(f);
        }
      });
      if (chosen !== null) merged[ci] = chosen;
    });

    if (tsCol !== -1) {
      var latest = null;
      idxs.forEach(function(ri) { var t = data[ri][tsCol]; if (t && (!latest || t > latest)) latest = t; });
      if (latest) merged[tsCol] = latest;
    }

    var dupRows = idxs.slice(1).map(function(ri) { return ri + 1; });
    out.push(label + ': merge ' + data[survivor][0] + ' / ' + data[survivor][1] +
             ' → keep row ' + (survivor + 1) + ', remove row(s) ' + dupRows.join(', ') +
             (conflicts.length ? '  [conflict on ' + conflicts.join(', ') + ' — kept latest]' : ''));

    if (apply) {
      sheet.getRange(survivor + 1, 1, 1, merged.length).setValues([merged]);
      dupRows.forEach(function(rw) { deletions.push(rw); });
    }
  });

  if (apply && deletions.length) {
    deletions.sort(function(a, b) { return b - a; });
    deletions.forEach(function(rw) { sheet.deleteRow(rw); });
  }
  return out;
}

// ---------- Grade report (read from raw rows, write to GradeReport tab) ----------
// Builds a trustworthy grading worksheet straight from the stored lesson rows
// — independent of the web UI. For every student it lays out the evidence for
// each criterion, a transparent suggested 1-7, and whatever the app already
// saved, so you can grade from data and spot UI/data drift.
//
// Suggested scores:
//   S2 Skill Identification = consistency of logging a focus (60%) + variety,
//        i.e. clearly working on DIFFERENT elements over time (40%).
//   S1 Skill Development    = Illinois improvement in SECONDS, on a generous
//        curve where 2s+ = 7 (incredible) and small gains still score well.
//        A "faster is harder to improve" handicap scales each student's gain by
//        (cohort-average baseline / their baseline), capped at >=1 so it only
//        ever boosts fast starters and never penalises slower ones.
//   S4 Active Participation = the teacher's own 1-7 (passthrough — no formula).
//
// Tunables (optional args):
//   gradeReport(lessons, varietyTarget, s1IncredibleSeconds)
//   - lessons:      coverage denominator. Default = distinct lessons in the tab.
//   - varietyTarget: # distinct elements that counts as full variety. Default 4.
//   - s1IncredibleSeconds: adjusted seconds that scores a 7. Default 2.
function gradeReport(expectedLessons, varietyTarget, s1IncredibleSeconds) {
  var book = ss();
  var VARIETY_TARGET = varietyTarget || 4;
  var S1_INCREDIBLE = s1IncredibleSeconds || 2;
  var header = ['Class', 'Student', 'Lessons run',
    'S2 focus logged', 'S2 distinct elements', 'S2 pill', 'S2 saved', 'S2 SUGGEST',
    'S1 baseline', 'S1 retest', 'S1 change', 'S1 adj. seconds', 'S1 saved', 'S1 SUGGEST',
    'S4 pill', 'S4 saved (teacher)', 'S4 SUGGEST'];
  var rows = [header];

  var clamp = function(x) { return Math.max(0, Math.min(1, x)); };
  var band = function(x) { return Math.max(1, Math.min(7, Math.round(1 + 6 * x))); };
  var pill = function(v) { return (v == null || v === '') ? '' : v; };
  // Generous concave scale: fractions of the "incredible" target map to bands.
  var s1Band = function(eff, T) {
    var f = eff / T;
    if (f >= 1.00) return 7;
    if (f >= 0.75) return 6;
    if (f >= 0.55) return 5;
    if (f >= 0.35) return 4;
    if (f >= 0.20) return 3;
    if (f >= 0.05) return 2;
    return 1;
  };

  CLASSES.forEach(function(cls) {
    var sheet = getSheet(cls);
    var grades = readGrades(cls);

    var agMap = {};
    var ag = getSheet('Agility');
    if (ag && ag.getLastRow() > 1) {
      var ad = ag.getDataRange().getValues();
      for (var i = 1; i < ad.length; i++) if (ad[i][1] === cls) agMap[ad[i][0]] = { b: ad[i][2], r: ad[i][3] };
    }
    // Cohort mean baseline, used as the handicap reference.
    var bases = [];
    for (var k in agMap) { var bb = parseFloat(agMap[k].b); if (!isNaN(bb) && bb > 0) bases.push(bb); }
    var refBaseline = bases.length ? bases.reduce(function(x, y) { return x + y; }, 0) / bases.length : 0;

    var byStudent = {}, lessonsSeen = {}, col = {};
    if (sheet && sheet.getLastRow() > 1) {
      var data = sheet.getDataRange().getValues();
      data[0].forEach(function(h, idx) { col[h] = idx; });
      for (var r = 1; r < data.length; r++) {
        var s = data[r][0]; if (!s) continue;
        (byStudent[s] = byStudent[s] || []).push(data[r]);
        lessonsSeen[data[r][1]] = true;
      }
    }
    var lessonsRun = expectedLessons || Object.keys(lessonsSeen).length || 1;

    (ROSTERS[cls] || []).forEach(function(name) {
      var lrows = byStudent[name] || [];
      var focusLogged = 0, elems = {};
      lrows.forEach(function(row) {
        var af = row[col['agility_focus']];
        if (af !== '' && af != null) { focusLogged++; elems[af] = true; }
      });
      var distinctElems = Object.keys(elems).length;

      var g = grades[name] || {};
      var b = parseFloat(agMap[name] && agMap[name].b), rt = parseFloat(agMap[name] && agMap[name].r);
      var change = '', adjStr = '', s1sug = '';
      var haveTimes = !isNaN(b) && !isNaN(rt) && b > 0;
      if (haveTimes) {
        var d = rt - b;                                   // negative = faster
        change = (d < 0 ? d.toFixed(1) : (d > 0 ? '+' + d.toFixed(1) : '0')) + 's';
        var raw = b - rt;                                 // positive = improvement
        var factor = refBaseline > 0 ? Math.max(1, refBaseline / b) : 1;
        var adj = raw * factor;                           // handicap only ever boosts
        adjStr = adj.toFixed(2) + 's';
        s1sug = s1Band(adj, S1_INCREDIBLE);
      }

      var s2sug = '';
      if (focusLogged > 0) {
        s2sug = band(0.6 * clamp(focusLogged / lessonsRun) + 0.4 * clamp(distinctElems / VARIETY_TARGET));
      }

      var s4sug = pill(g.S4);  // S4 is the teacher's own 1-7, passed straight through

      rows.push([cls, name, lessonsRun,
        focusLogged, distinctElems, pill(g.s2_teacher), pill(g.S2), s2sug,
        haveTimes ? b : '', haveTimes ? rt : '', change, adjStr, pill(g.S1), s1sug,
        pill(g.s4_teacher), pill(g.S4), s4sug]);
    });
  });

  var sh = book.getSheetByName('GradeReport') || book.insertSheet('GradeReport');
  sh.clear();
  sh.getRange(1, 1, rows.length, header.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1, header.length);
  return 'GradeReport tab updated — ' + (rows.length - 1) + ' students.';
}

// Additive migration — run once if Grades tab already exists and you don't
// want to wipe its data. Adds any missing columns from GRADE_HEADERS.
function upgradeGradesSchema() {
  var book = ss();
  var gr = book.getSheetByName('Grades');
  if (!gr) {
    gr = book.insertSheet('Grades');
    gr.getRange(1, 1, 1, GRADE_HEADERS.length).setValues([GRADE_HEADERS]);
    gr.setFrozenRows(1);
    return;
  }
  var existing = gr.getRange(1, 1, 1, Math.max(1, gr.getLastColumn())).getValues()[0];
  while (existing.length && existing[existing.length - 1] === '') existing.pop();
  var missing = [];
  GRADE_HEADERS.forEach(function(h) { if (existing.indexOf(h) === -1) missing.push(h); });
  if (missing.length === 0) return;
  var tsIdx = existing.indexOf('timestamp');
  var before = tsIdx === -1 ? existing : existing.slice(0, tsIdx);
  var after  = tsIdx === -1 ? [] : existing.slice(tsIdx);
  var extras = missing.filter(function(m) { return m !== 'timestamp'; });
  var ordered = before.concat(extras).concat(after);
  if (missing.indexOf('timestamp') !== -1 && tsIdx === -1) ordered.push('timestamp');
  gr.getRange(1, 1, 1, ordered.length).setValues([ordered]);
}
