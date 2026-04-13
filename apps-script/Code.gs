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

// Settings tab fields
var SETTINGS_HEADERS = ['Class','CurrentLesson'];

var CLASSES = ['7A','8A'];

// Student rosters (kept in sync with build.py STUDENTS_7A / STUDENTS_8A)
var ROSTERS = {
  '7A': [
    'Freya R','Flavio C','Karim Y A G','Soomin O','Chaeyi L',
    'Michelle S','Woojun J','Kian W','Nico S','Louis H',
    'Ella B','Lena L','Austin W','Jihoo P','Ari R',
    'Yilei L','Joon S','Rubin L'
  ],
  '8A': [
    'Nicolas v M','Seppe M','Antonia G','Amaya W','Peter T',
    'Silas V','Seoyeon J','Taehyun S','Dylan T','Ryan S',
    'Josh R','David L','Vihaan M','Philipp N',"Alec O'D",
    'Bora G','Katharina V','Kinley C'
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

// ---------- GET ----------

function doGet(e) {
  try {
    var action = e.parameter.action;
    var className = e.parameter['class'];

    if (action === 'getSettings') {
      return jsonResponse({ currentLesson: readCurrentLesson(className) });
    }
    if (action === 'getStudent') {
      var student = e.parameter.student;
      if (!className || !student) return jsonResponse({ error: 'Missing params' });
      return jsonResponse(readStudent(className, student));
    }
    if (action === 'getRoster') {
      if (!className) return jsonResponse({ error: 'Missing class' });
      return jsonResponse(readRoster(className));
    }
    if (action === 'getEngagement') {
      if (!className) return jsonResponse({ error: 'Missing class' });
      return jsonResponse(readEngagement(className));
    }
    return jsonResponse({ error: 'Invalid action' });
  } catch (err) {
    return jsonResponse({ error: String(err) });
  }
}

function readCurrentLesson(className) {
  var sheet = getSheet('Settings');
  if (!sheet) return 1;
  var row = findRowBy(sheet, 1, className);
  if (row === -1) return 1;
  var v = sheet.getRange(row, 2).getValue();
  var n = parseInt(v, 10);
  return (isNaN(n) || n < 1) ? 1 : n;
}

function readStudent(className, student) {
  var out = {
    student: student,
    lessons: [],
    agility: { ag_baseline: '', ag_retest: '' },
    currentLesson: readCurrentLesson(className)
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
  return { students: ROSTERS[className] || [], currentLesson: readCurrentLesson(className) };
}

function readEngagement(className) {
  var out = { students: {}, currentLesson: readCurrentLesson(className) };
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
    if (action === 'saveLesson') return saveLesson(body);
    if (action === 'saveAgility') return saveAgility(body);
    if (action === 'setLesson') return setLesson(body);
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

function setLesson(body) {
  if (body.pin !== TEACHER_PIN) return jsonResponse({ error: 'Bad PIN' });
  var className = body['class'];
  var lesson = parseInt(body.lesson, 10);
  if (!className || !lesson || lesson < 1 || lesson > 9) return jsonResponse({ error: 'Bad params' });

  var sheet = getSheet('Settings');
  if (!sheet) return jsonResponse({ error: 'Settings missing' });

  var row = findRowBy(sheet, 1, className);
  if (row === -1) sheet.appendRow([className, lesson]);
  else sheet.getRange(row, 2).setValue(lesson);

  return jsonResponse({ ok: true, currentLesson: lesson });
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

  var st = book.getSheetByName('Settings') || book.insertSheet('Settings');
  st.clear();
  st.getRange(1, 1, 1, SETTINGS_HEADERS.length).setValues([SETTINGS_HEADERS]);
  st.setFrozenRows(1);
  var stRows = CLASSES.map(function(c) { return [c, 1]; });
  st.getRange(2, 1, stRows.length, SETTINGS_HEADERS.length).setValues(stRows);
}
