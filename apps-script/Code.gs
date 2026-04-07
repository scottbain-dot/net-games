// =============================================================
// Net Games Skill Tracker — Google Apps Script
// =============================================================
// Deploy: Extensions → Apps Script → Deploy → New deployment
//   Type: Web app | Execute as: Me | Access: Anyone
// After deploying, copy the URL into the APPS_SCRIPT_URL
// constant in 7a.html and 8a.html.
// =============================================================

var SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // ← paste your Sheet ID

var FIELDS = [
  'bserve','bshot','bfoot','btac',
  'vserve','vskill','vpos',
  'comm','effort',
  'ag_baseline','ag_retest'
];

// ---------- helpers ----------

function getSheet(className) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return ss.getSheetByName(className);
}

function getHeaders(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

function findCol(headers, field) {
  for (var i = 0; i < headers.length; i++) {
    if (headers[i] === field) return i + 1; // 1-indexed
  }
  return -1;
}

function findRow(sheet, studentName) {
  var names = sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues();
  for (var i = 0; i < names.length; i++) {
    if (names[i][0] === studentName) return i + 1; // 1-indexed
  }
  return -1;
}

// ---------- GET ----------

function doGet(e) {
  var action = e.parameter.action;
  var className = e.parameter['class'];

  if (action === 'get' && className) {
    var sheet = getSheet(className);
    if (!sheet) {
      return jsonResponse({ error: 'Sheet not found: ' + className });
    }
    var data = sheet.getDataRange().getValues();
    var headers = data[0];
    var students = [];
    for (var r = 1; r < data.length; r++) {
      var obj = {};
      for (var c = 0; c < headers.length; c++) {
        obj[headers[c]] = data[r][c];
      }
      students.push(obj);
    }
    return jsonResponse({ students: students });
  }

  return jsonResponse({ error: 'Invalid request' });
}

// ---------- POST ----------

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ error: 'Invalid JSON' });
  }

  var action = body.action;
  var className = body['class'];
  var student = body.student;
  var field = body.field;
  var value = body.value;

  if (!className || !student || !field) {
    return jsonResponse({ error: 'Missing parameters' });
  }

  var sheet = getSheet(className);
  if (!sheet) return jsonResponse({ error: 'Sheet not found' });

  var headers = getHeaders(sheet);
  var col = findCol(headers, field);
  if (col === -1) return jsonResponse({ error: 'Field not found: ' + field });

  var row = findRow(sheet, student);
  if (row === -1) return jsonResponse({ error: 'Student not found: ' + student });

  if (action === 'save') {
    var intVal = parseInt(value, 10);
    if (isNaN(intVal) || intVal < 0 || intVal > 4) {
      return jsonResponse({ error: 'Value must be 0-4' });
    }
    sheet.getRange(row, col).setValue(intVal);
    return jsonResponse({ ok: true });
  }

  if (action === 'saveAgility') {
    var floatVal = parseFloat(value);
    if (isNaN(floatVal)) {
      return jsonResponse({ error: 'Value must be a number' });
    }
    sheet.getRange(row, col).setValue(floatVal);
    return jsonResponse({ ok: true });
  }

  return jsonResponse({ error: 'Unknown action: ' + action });
}

// ---------- response helper ----------

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Sheet setup helper (run once) ----------

function setupSheets() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var headers = ['Student'].concat(FIELDS);

  var classes = {
    '7A': [
      // ← Replace with real 7A student names
      'Student 1','Student 2','Student 3','Student 4','Student 5',
      'Student 6','Student 7','Student 8','Student 9','Student 10'
    ],
    '8A': [
      // ← Replace with real 8A student names
      'Student 1','Student 2','Student 3','Student 4','Student 5',
      'Student 6','Student 7','Student 8','Student 9','Student 10'
    ]
  };

  for (var cls in classes) {
    var sheet = ss.getSheetByName(cls);
    if (!sheet) {
      sheet = ss.insertSheet(cls);
    }
    // Write headers
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    // Write student names with zeroed skills
    var rows = classes[cls].map(function(name) {
      var row = [name];
      for (var i = 0; i < FIELDS.length; i++) {
        row.push(FIELDS[i].indexOf('ag_') === 0 ? '' : 0);
      }
      return row;
    });
    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
  }
}
