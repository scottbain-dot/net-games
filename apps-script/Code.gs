// =============================================================
// PE Skill Tracker — Google Apps Script (server)
// =============================================================
// Lives inside a Google Sheet. The Sheet holds the configuration
// (unit, lessons, sports, skills, roster) AND the data. The web app
// (Index.html / Styles.html / App.html) is served by this script.
//
// First-time setup: see docs/TEACHER-GUIDE.md. Short version:
//   1. Reload the Sheet → "PE Tracker" menu → "1. Set up tabs".
//   2. Fill in Roster (Class, Student, Email) and edit Lessons/Skills.
//   3. Deploy → New deployment → Web app → Execute as Me,
//      access "Anyone within <your school>". Copy the link to students.
//
// Students and teachers are identified by their Google login, so
// there are no PINs. The Sheet owner is always a teacher; add
// colleagues on the Teachers tab.
// =============================================================

// ---------- Tab definitions ----------
// Configuration tabs (teacher edits these)
var CONFIG_TABS = {
  Config:   ['Key', 'Value', 'What it does'],
  Lessons:  ['Number', 'Title', 'Sport', 'Checkpoint', 'Date'],
  Skills:   ['Sport', 'Skill', 'Cue'],
  Focus:    ['Focus', 'Cue'],
  Criteria: ['Code', 'Name', 'Evidence', 'TopBand'],
  Roster:   ['Class', 'Student', 'Email'],
  Teachers: ['Email', 'Name']
};
// Data tabs (the app writes these — do not edit by hand while a class is live)
var DATA_TABS = {
  Register:    ['Class', 'Student', 'Lesson', 'Participation', 'Note', 'Updated'],
  Checkpoints: ['Class', 'Student', 'Checkpoint', 'Sport', 'Skill', 'Self', 'Teacher', 'Updated'],
  Reflections: ['Class', 'Student', 'Checkpoint', 'Focus', 'WentWell', 'NextGoal', 'Updated'],
  Tests:       ['Class', 'Student', 'Baseline', 'Retest', 'Updated'],
  Grades:      ['Class', 'Student', 'Criterion', 'Score', 'Comment', 'Updated']
};
// Key columns that identify one row in each data tab
var DATA_KEYS = {
  Register:    ['Class', 'Student', 'Lesson'],
  Checkpoints: ['Class', 'Student', 'Checkpoint', 'Sport', 'Skill'],
  Reflections: ['Class', 'Student', 'Checkpoint'],
  Tests:       ['Class', 'Student'],
  Grades:      ['Class', 'Student', 'Criterion']
};

var CONFIG_DEFAULTS = {
  unit_name:            ['Net Games', 'Shown at the top of the app'],
  rating_labels:        ['Getting there|Developing|Consistent|Nailed it', 'The 4 self/teacher rating levels, low to high'],
  participation_labels: ['Inconsistent|Regular|Excellent', 'The 3 participation levels the teacher taps in the register'],
  checkpoint_scope:     ['all', '"all" = students rate every sport at every checkpoint; "played" = only sports played so far'],
  test_name:            ['Illinois Agility Test', 'Name of the baseline / re-test fitness test (leave blank for none)'],
  test_unit:            ['seconds', 'Unit for the test score'],
  test_lower_is_better: ['TRUE', 'TRUE for times, FALSE for counts/distances'],
  test_top_gain:        ['2', 'Improvement (in test units, after handicap) that earns the top band'],
  reflection_prompt_1:  ['What went well and what improved?', 'First reflection question at each checkpoint'],
  reflection_prompt_2:  ['My goal for the next lessons', 'Second reflection question at each checkpoint'],
  show_grades_to_students: ['FALSE', 'TRUE to show final grades and comments on the student dashboard']
};

var CACHE_KEY_CONFIG = 'pe_config_v1';
var CACHE_SECONDS = 180;

// ---------- Example unit (seeded only into empty tabs) ----------
var EXAMPLE = {
  Lessons: [
    [1, 'Intro, free play, baseline test', '',           'Early',  ''],
    [2, 'Serve & clear',                   'Badminton',  '',       ''],
    [3, 'Footwork & net play',             'Badminton',  '',       ''],
    [4, 'Match play & tactics',            'Badminton',  'Middle', ''],
    [5, 'Serve & forearm pass',            'Volleyball', '',       ''],
    [6, 'Setting & positioning',           'Volleyball', '',       ''],
    [7, 'Match play & rotation',           'Volleyball', '',       ''],
    [8, 'Re-test & reflection',            '',           'End',    ''],
    [9, 'Choice: badminton / volleyball / football tennis / table tennis', 'Choice', '', '']
  ],
  Skills: [
    ['Badminton',  'Serve accuracy',           'Serves land in the target area most of the time'],
    ['Badminton',  'Shot choice',              'Chooses clear, drop, smash or net shot to suit the rally'],
    ['Badminton',  'Footwork & movement',      'Recovers to base and reaches the shuttle in balance'],
    ['Badminton',  'Tactical play',            'Moves the opponent around the court on purpose'],
    ['Volleyball', 'Serve accuracy',           'Serves over the net into court most of the time'],
    ['Volleyball', 'Forearm pass & set',       'Controls the ball to a teammate on the first two touches'],
    ['Volleyball', 'Positioning & awareness',  'Is in the right place before the ball arrives'],
    ['Volleyball', 'Communication & teamwork', 'Calls the ball and covers for teammates']
  ],
  Focus: [
    ['Explosive start', 'First step'],
    ['Sharp turns',     'Change of direction'],
    ['Quick stop',      'Deceleration'],
    ['Top speed',       'Acceleration'],
    ['Curves',          'Bend running'],
    ['Sideways',        'Shuffle step'],
    ['Go again',        'Stop-start ability'],
    ['React',           'Reaction time']
  ],
  Criteria: [
    ['S2', 'Skill identification', 'reflection',    'Clearly identifies strengths and areas for improvement. Strong understanding of skill requirements.'],
    ['S1', 'Skill development',    'test',          'Significant and consistent improvement. Independently applies effective strategies.'],
    ['S4', 'Active participation', 'participation', 'Consistently highly engaged. Excellent self-management, communication, collaboration.']
  ]
};
// Allowed values for Criteria.Evidence
var EVIDENCE_TYPES = ['test', 'reflection', 'participation', 'skills', 'none'];

// ---------- Sheet helpers ----------
function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function tab_(name) { return ss_().getSheetByName(name); }

function ensureTab_(name, headers) {
  var book = ss_();
  var s = book.getSheetByName(name);
  if (!s) {
    s = book.insertSheet(name);
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
    s.setFrozenRows(1);
    s.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    return s;
  }
  // Add any missing header columns at the end (never reorders or deletes)
  var lastCol = Math.max(1, s.getLastColumn());
  var existing = s.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  while (existing.length && existing[existing.length - 1] === '') existing.pop();
  var missing = headers.filter(function(h) { return existing.indexOf(h) === -1; });
  if (existing.length === 0) {
    s.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else if (missing.length) {
    s.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  }
  s.setFrozenRows(1);
  return s;
}

// Read a tab as an array of objects keyed by the header row.
function readTab_(name) {
  var s = tab_(name);
  if (!s || s.getLastRow() < 2) return [];
  var data = s.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var out = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r], obj = {}, empty = true;
    for (var c = 0; c < headers.length; c++) {
      if (!headers[c]) continue;
      var v = row[c];
      if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      obj[headers[c]] = v;
      if (v !== '' && v !== null && v !== undefined) empty = false;
    }
    if (!empty) { obj._row = r + 1; out.push(obj); }
  }
  return out;
}

function str_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function num_(v) { if (v === '' || v === null || v === undefined) return null; var n = parseFloat(v); return isNaN(n) ? null : n; }
function bool_(v) { return /^(true|yes|1)$/i.test(str_(v)); }
function lower_(v) { return str_(v).toLowerCase(); }
function keyOf_(fields, obj) { return fields.map(function(f) { return lower_(obj[f]); }).join(''); }

// Insert-or-update rows in a data tab, matched on DATA_KEYS[name].
// One read of the tab, then in-place updates and a single append block.
// Columns the caller does not send keep their existing value (so a student
// saving "Self" never wipes the teacher's rating in the same row).
function upsert_(name, rows) {
  if (!rows || !rows.length) return 0;
  var headers = DATA_TABS[name];
  var s = ensureTab_(name, headers);
  var keys = DATA_KEYS[name];
  var lastRow = s.getLastRow(), lastCol = s.getLastColumn();
  var sheetHeaders = s.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  var existing = lastRow > 1 ? s.getRange(2, 1, lastRow - 1, lastCol).getValues() : [];
  var index = {};
  existing.forEach(function(row, i) {
    var o = {};
    sheetHeaders.forEach(function(h, c) { o[h] = row[c]; });
    index[keyOf_(keys, o)] = i;
  });
  var now = new Date();
  var appends = [], updates = [];
  rows.forEach(function(obj) {
    obj.Updated = now;
    var k = keyOf_(keys, obj);
    var line = sheetHeaders.map(function(h) { return (obj[h] === undefined || obj[h] === null) ? '' : obj[h]; });
    if (index[k] !== undefined) {
      var old = existing[index[k]];
      sheetHeaders.forEach(function(h, c) { if (!(h in obj)) line[c] = old[c]; });
      existing[index[k]] = line;
      updates.push(index[k]);
    } else {
      index[k] = existing.length;
      existing.push(line);
      appends.push(line);
    }
  });
  if (updates.length > 8) {
    // Many rows changed — rewrite the block in one call
    s.getRange(2, 1, existing.length, lastCol).setValues(existing);
  } else {
    updates.forEach(function(i) { s.getRange(i + 2, 1, 1, lastCol).setValues([existing[i]]); });
    if (appends.length) s.getRange(lastRow + 1, 1, appends.length, lastCol).setValues(appends);
  }
  return rows.length;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------- Config ----------
function clearConfigCache() { CacheService.getScriptCache().remove(CACHE_KEY_CONFIG); }

function getConfig_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(CACHE_KEY_CONFIG);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  var cfg = buildConfig_();
  try { cache.put(CACHE_KEY_CONFIG, JSON.stringify(cfg), CACHE_SECONDS); } catch (e) { /* too big for cache — fine */ }
  return cfg;
}

function splitList_(s) { return str_(s).split('|').map(function(x) { return x.trim(); }).filter(Boolean); }

function buildConfig_() {
  var kv = {};
  Object.keys(CONFIG_DEFAULTS).forEach(function(k) { kv[k] = CONFIG_DEFAULTS[k][0]; });
  readTab_('Config').forEach(function(r) { if (str_(r.Key)) kv[str_(r.Key)] = str_(r.Value); });

  var lessons = readTab_('Lessons').map(function(r) {
    return { number: num_(r.Number), title: str_(r.Title), sport: str_(r.Sport), checkpoint: str_(r.Checkpoint), date: str_(r.Date) };
  }).filter(function(l) { return l.number !== null; }).sort(function(a, b) { return a.number - b.number; });

  var skillRows = readTab_('Skills');
  var sports = [], skillsBySport = {};
  skillRows.forEach(function(s) {
    var sp = str_(s.Sport), sk = str_(s.Skill);
    if (!sp || !sk) return;
    (skillsBySport[sp] = skillsBySport[sp] || []).push({ skill: sk, cue: str_(s.Cue) });
  });
  // Sport order: first appearance in the lesson plan, then any extra sports from the Skills tab
  lessons.forEach(function(l) { if (l.sport && skillsBySport[l.sport] && sports.indexOf(l.sport) === -1) sports.push(l.sport); });
  Object.keys(skillsBySport).forEach(function(sp) { if (sports.indexOf(sp) === -1) sports.push(sp); });

  var checkpoints = [];
  lessons.forEach(function(l) {
    if (l.checkpoint && !checkpoints.some(function(c) { return c.name === l.checkpoint; })) {
      var played = [];
      lessons.forEach(function(m) { if (m.number <= l.number && m.sport && skillsBySport[m.sport] && played.indexOf(m.sport) === -1) played.push(m.sport); });
      checkpoints.push({ name: l.checkpoint, lesson: l.number, sportsPlayed: played });
    }
  });

  var focus = readTab_('Focus').map(function(r) { return { focus: str_(r.Focus), cue: str_(r.Cue) }; }).filter(function(f) { return f.focus; });
  var criteria = readTab_('Criteria').map(function(r) {
    var ev = lower_(r.Evidence);
    return { code: str_(r.Code), name: str_(r.Name), evidence: EVIDENCE_TYPES.indexOf(ev) === -1 ? 'none' : ev, top: str_(r.TopBand) };
  }).filter(function(c) { return c.code; });

  var roster = readTab_('Roster').map(function(r) { return { cls: str_(r.Class), student: str_(r.Student), email: lower_(r.Email) }; })
    .filter(function(r) { return r.cls && r.student; });
  var classes = [];
  roster.forEach(function(r) { if (classes.indexOf(r.cls) === -1) classes.push(r.cls); });
  var teachers = readTab_('Teachers').map(function(r) { return lower_(r.Email); }).filter(Boolean);

  var ratingLabels = splitList_(kv.rating_labels);
  while (ratingLabels.length < 4) ratingLabels.push('Level ' + (ratingLabels.length + 1));
  var participationLabels = splitList_(kv.participation_labels);
  while (participationLabels.length < 3) participationLabels.push('Level ' + (participationLabels.length + 1));

  return {
    unitName: kv.unit_name || 'PE Unit',
    ratingLabels: ratingLabels.slice(0, 4),
    participationLabels: participationLabels.slice(0, 3),
    checkpointScope: lower_(kv.checkpoint_scope) === 'played' ? 'played' : 'all',
    test: { name: kv.test_name, unit: kv.test_unit, lowerIsBetter: bool_(kv.test_lower_is_better), topGain: num_(kv.test_top_gain) || 2 },
    reflectionPrompts: [kv.reflection_prompt_1, kv.reflection_prompt_2],
    showGradesToStudents: bool_(kv.show_grades_to_students),
    lessons: lessons, sports: sports, skills: skillsBySport, checkpoints: checkpoints,
    focus: focus, criteria: criteria, classes: classes,
    roster: roster, teachers: teachers
  };
}

// ---------- Identity ----------
function identity_(cfg) {
  var email = lower_(Session.getActiveUser().getEmail());
  var owner = lower_(Session.getEffectiveUser().getEmail());
  var out = { email: email, role: 'unknown', name: '', cls: '' };
  if (email && (email === owner || cfg.teachers.indexOf(email) !== -1)) { out.role = 'teacher'; return out; }
  var me = email ? cfg.roster.filter(function(r) { return r.email === email; })[0] : null;
  if (me) { out.role = 'student'; out.name = me.student; out.cls = me.cls; }
  return out;
}
function requireTeacher_(cfg) {
  var id = identity_(cfg);
  if (id.role !== 'teacher') throw new Error('Teachers only');
  return id;
}
// A student may only act on their own record; a teacher on anyone in the roster.
function resolveStudent_(cfg, cls, student) {
  var id = identity_(cfg);
  if (id.role === 'teacher') {
    var ok = cfg.roster.some(function(r) { return r.cls === cls && r.student === student; });
    if (!ok) throw new Error('Student not on roster: ' + student + ' (' + cls + ')');
    return { cls: cls, student: student, byTeacher: true };
  }
  if (id.role === 'student') return { cls: id.cls, student: id.name, byTeacher: false };
  throw new Error('Not signed in with a school account that is on the roster');
}

// ---------- Web app entry ----------
function doGet(e) {
  var t = HtmlService.createTemplateFromFile('Index');
  t.classParam = (e && e.parameter && e.parameter['class']) || '';
  t.viewParam = (e && e.parameter && e.parameter.view) || '';
  return t.evaluate()
    .setTitle('PE Skill Tracker')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

// Client-facing config: strip emails so students never see the roster's addresses.
function publicConfig_(cfg) {
  var c = JSON.parse(JSON.stringify(cfg));
  c.roster = c.roster.map(function(r) { return { cls: r.cls, student: r.student }; });
  delete c.teachers;
  return c;
}

// Called once on page load. Returns config + who you are + your data.
function bootstrap() {
  var cfg = getConfig_();
  var id = identity_(cfg);
  var out = { config: publicConfig_(cfg), identity: id, appUrl: ScriptApp.getService().getUrl() };
  if (id.role === 'student') out.student = studentData_(id.cls, id.name);
  return out;
}

// ---------- Reads ----------
function rowsFor_(name, cls, student) {
  return readTab_(name).filter(function(r) {
    return str_(r.Class) === cls && (!student || str_(r.Student) === student);
  });
}
function studentData_(cls, student) {
  var t = rowsFor_('Tests', cls, student)[0] || {};
  var classRegister = rowsFor_('Register', cls);
  var lessonsRun = {};
  classRegister.forEach(function(r) { if (num_(r.Participation)) lessonsRun[num_(r.Lesson)] = true; });
  return {
    cls: cls, student: student,
    lessonsRun: Object.keys(lessonsRun).length,
    register: classRegister.filter(function(r) { return str_(r.Student) === student; }).map(function(r) { return { lesson: num_(r.Lesson), participation: num_(r.Participation), note: str_(r.Note) }; }),
    checkpoints: rowsFor_('Checkpoints', cls, student).map(function(r) { return { checkpoint: str_(r.Checkpoint), sport: str_(r.Sport), skill: str_(r.Skill), self: num_(r.Self), teacher: num_(r.Teacher) }; }),
    reflections: rowsFor_('Reflections', cls, student).map(function(r) { return { checkpoint: str_(r.Checkpoint), focus: str_(r.Focus), wentWell: str_(r.WentWell), nextGoal: str_(r.NextGoal) }; }),
    test: { baseline: num_(t.Baseline), retest: num_(t.Retest) },
    grades: rowsFor_('Grades', cls, student).map(function(r) { return { criterion: str_(r.Criterion), score: num_(r.Score), comment: str_(r.Comment) }; })
  };
}
function getStudent(cls, student) {
  var cfg = getConfig_();
  var who = resolveStudent_(cfg, cls, student);
  return studentData_(who.cls, who.student);
}
// Teacher: everything for one class in one call.
function getClassData(cls) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var tests = {};
  rowsFor_('Tests', cls).forEach(function(r) { tests[str_(r.Student)] = { baseline: num_(r.Baseline), retest: num_(r.Retest) }; });
  return {
    cls: cls,
    register: rowsFor_('Register', cls).map(function(r) { return { student: str_(r.Student), lesson: num_(r.Lesson), participation: num_(r.Participation), note: str_(r.Note) }; }),
    checkpoints: rowsFor_('Checkpoints', cls).map(function(r) { return { student: str_(r.Student), checkpoint: str_(r.Checkpoint), sport: str_(r.Sport), skill: str_(r.Skill), self: num_(r.Self), teacher: num_(r.Teacher) }; }),
    reflections: rowsFor_('Reflections', cls).map(function(r) { return { student: str_(r.Student), checkpoint: str_(r.Checkpoint), focus: str_(r.Focus), wentWell: str_(r.WentWell), nextGoal: str_(r.NextGoal) }; }),
    tests: tests,
    grades: rowsFor_('Grades', cls).map(function(r) { return { student: str_(r.Student), criterion: str_(r.Criterion), score: num_(r.Score), comment: str_(r.Comment) }; })
  };
}

// ---------- Writes (each is ONE request from the client) ----------
function clampInt_(v, lo, hi) {
  var n = parseInt(v, 10);
  if (isNaN(n)) return null;
  return Math.max(lo, Math.min(hi, n));
}
function blankOr_(v, lo, hi) {
  if (v === null || v === undefined || v === '') return '';
  var n = clampInt_(v, lo, hi);
  return n === null ? '' : n;
}

// Student (or teacher on their behalf) submits a whole checkpoint at once.
// payload: { cls, student, checkpoint, ratings: [{sport, skill, rating}], focus, wentWell, nextGoal }
function saveCheckpoint(payload) {
  var cfg = getConfig_();
  var who = resolveStudent_(cfg, payload.cls, payload.student);
  var cp = str_(payload.checkpoint);
  if (!cfg.checkpoints.some(function(c) { return c.name === cp; })) throw new Error('Unknown checkpoint: ' + cp);
  var rows = (payload.ratings || []).map(function(r) {
    var sport = str_(r.sport), skill = str_(r.skill);
    if (!cfg.skills[sport] || !cfg.skills[sport].some(function(s) { return s.skill === skill; })) return null;
    return { Class: who.cls, Student: who.student, Checkpoint: cp, Sport: sport, Skill: skill, Self: blankOr_(r.rating, 1, 4) };
  }).filter(Boolean);
  var reflection = { Class: who.cls, Student: who.student, Checkpoint: cp,
    Focus: str_(payload.focus).slice(0, 80), WentWell: str_(payload.wentWell).slice(0, 600), NextGoal: str_(payload.nextGoal).slice(0, 600) };
  return withLock_(function() {
    upsert_('Checkpoints', rows);
    upsert_('Reflections', [reflection]);
    return { ok: true, saved: rows.length + 1 };
  });
}

// Teacher register for one lesson. entries: [{student, participation (1-3 or null), note}]
function saveRegister(payload) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var cls = str_(payload.cls), lesson = num_(payload.lesson);
  if (!cls || lesson === null) throw new Error('Missing class or lesson');
  var rows = (payload.entries || []).map(function(e) {
    var r = { Class: cls, Student: str_(e.student), Lesson: lesson };
    if ('participation' in e) r.Participation = blankOr_(e.participation, 1, 3);
    if ('note' in e) r.Note = str_(e.note).slice(0, 200);
    return r;
  }).filter(function(r) { return r.Student; });
  return withLock_(function() { return { ok: true, saved: upsert_('Register', rows) }; });
}

// Teacher skill ratings at a checkpoint. entries: [{student, sport, skill, rating}]
function saveTeacherRatings(payload) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var cls = str_(payload.cls), cp = str_(payload.checkpoint);
  var rows = (payload.entries || []).map(function(e) {
    return { Class: cls, Student: str_(e.student), Checkpoint: cp, Sport: str_(e.sport), Skill: str_(e.skill), Teacher: blankOr_(e.rating, 1, 4) };
  }).filter(function(r) { return r.Student && r.Sport && r.Skill; });
  return withLock_(function() { return { ok: true, saved: upsert_('Checkpoints', rows) }; });
}

// Teacher test scores. entries: [{student, baseline, retest}]
function saveTests(payload) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var cls = str_(payload.cls);
  var rows = (payload.entries || []).map(function(e) {
    var r = { Class: cls, Student: str_(e.student) };
    if ('baseline' in e) r.Baseline = num_(e.baseline) === null ? '' : num_(e.baseline);
    if ('retest' in e) r.Retest = num_(e.retest) === null ? '' : num_(e.retest);
    return r;
  }).filter(function(r) { return r.Student; });
  return withLock_(function() { return { ok: true, saved: upsert_('Tests', rows) }; });
}

// Teacher final grades. entries: [{student, criterion, score (1-7), comment}]
function saveGrades(payload) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var cls = str_(payload.cls);
  var rows = (payload.entries || []).map(function(e) {
    var r = { Class: cls, Student: str_(e.student), Criterion: str_(e.criterion) };
    if ('score' in e) r.Score = blankOr_(e.score, 1, 7);
    if ('comment' in e) r.Comment = str_(e.comment).slice(0, 500);
    return r;
  }).filter(function(r) { return r.Student && r.Criterion; });
  return withLock_(function() { return { ok: true, saved: upsert_('Grades', rows) }; });
}

// ---------- Evidence & suggested grades ----------
// Pure function shared by the web app's Overview and the GradeReport tab.
// Returns one summary object per student in the class.
function computeOverview_(cfg, cls, data) {
  var roster = cfg.roster.filter(function(r) { return r.cls === cls; });
  var lessonsRun = {};
  data.register.forEach(function(r) { if (r.participation) lessonsRun[r.lesson] = true; });
  var nLessons = Object.keys(lessonsRun).length || cfg.lessons.length || 1;

  // Cohort mean baseline for the fast-starter handicap
  var bases = [];
  roster.forEach(function(r) { var t = data.tests[r.student]; if (t && t.baseline) bases.push(t.baseline); });
  var refBaseline = bases.length ? bases.reduce(function(a, b) { return a + b; }, 0) / bases.length : 0;

  var clamp01 = function(x) { return Math.max(0, Math.min(1, x)); };
  var band = function(x) { return Math.max(1, Math.min(7, Math.round(1 + 6 * x))); };
  var T = cfg.test.topGain;
  var testBand = function(adj) {
    if (adj >= T) return 7;
    if (adj >= 0.65 * T) return 6;
    if (adj >= 0.35 * T) return 5;
    if (adj > 0.05) return 4;
    if (adj >= -0.05) return 3;
    if (adj > -0.5 * T) return 2;
    return 1;
  };
  var nCheckpoints = cfg.checkpoints.length || 1;
  var avg = function(list, key) {
    var vals = list.map(function(x) { return x[key]; }).filter(function(v) { return typeof v === 'number' && v > 0; });
    return vals.length ? vals.reduce(function(a, b) { return a + b; }, 0) / vals.length : null;
  };

  return roster.map(function(r) {
    var name = r.student;
    var reg = data.register.filter(function(x) { return x.student === name && x.participation; });
    var partAvg = avg(reg, 'participation');

    var cps = data.checkpoints.filter(function(x) { return x.student === name; });
    var refl = data.reflections.filter(function(x) { return x.student === name; });
    var submitted = {};
    cps.forEach(function(x) { if (x.self) submitted[x.checkpoint] = true; });
    refl.forEach(function(x) { if (x.wentWell || x.nextGoal || x.focus) submitted[x.checkpoint] = true; });
    var nSubmitted = Object.keys(submitted).length;
    var nReflected = refl.filter(function(x) { return x.wentWell && x.nextGoal; }).length;
    var focusSet = {};
    refl.forEach(function(x) { if (x.focus) focusSet[x.focus] = true; });

    // Latest checkpoint average per sport, self and teacher
    var teacherBySport = {}, selfBySport = {};
    cfg.sports.forEach(function(sp) {
      var lastT = null, lastS = null;
      cfg.checkpoints.forEach(function(c) {
        var rows = cps.filter(function(x) { return x.sport === sp && x.checkpoint === c.name; });
        var t = avg(rows, 'teacher'), s = avg(rows, 'self');
        if (t !== null) lastT = t;
        if (s !== null) lastS = s;
      });
      teacherBySport[sp] = lastT; selfBySport[sp] = lastS;
    });
    var teacherVals = cfg.sports.map(function(sp) { return teacherBySport[sp]; }).filter(function(v) { return v !== null; });
    var teacherAvg = teacherVals.length ? teacherVals.reduce(function(a, b) { return a + b; }, 0) / teacherVals.length : null;

    var t = data.tests[name] || {};
    var change = null, adj = null;
    if (typeof t.baseline === 'number' && t.baseline > 0 && typeof t.retest === 'number') {
      var gain = cfg.test.lowerIsBetter ? t.baseline - t.retest : t.retest - t.baseline;
      change = t.retest - t.baseline;
      var factor = 1;
      if (refBaseline > 0) factor = cfg.test.lowerIsBetter ? Math.max(1, refBaseline / t.baseline) : Math.max(1, t.baseline / refBaseline);
      adj = gain * factor;
    }

    var suggested = {};
    cfg.criteria.forEach(function(c) {
      var s = null;
      if (c.evidence === 'test' && adj !== null) s = testBand(adj);
      if (c.evidence === 'participation' && partAvg !== null) s = band(clamp01((partAvg - 1) / 2) * 0.7 + clamp01(reg.length / nLessons) * 0.3);
      if (c.evidence === 'reflection' && nSubmitted > 0) s = band(0.5 * clamp01(nSubmitted / nCheckpoints) + 0.3 * clamp01(nReflected / nCheckpoints) + 0.2 * clamp01(Object.keys(focusSet).length / Math.min(3, nCheckpoints)));
      if (c.evidence === 'skills' && teacherAvg !== null) s = band(clamp01((teacherAvg - 1) / 3));
      suggested[c.code] = s;
    });
    var final = {};
    data.grades.filter(function(g) { return g.student === name; }).forEach(function(g) { final[g.criterion] = { score: g.score, comment: g.comment }; });

    return {
      student: name,
      lessonsAttended: reg.length, lessonsRun: nLessons, participationAvg: partAvg,
      checkpointsSubmitted: nSubmitted, reflectionsComplete: nReflected, focusVariety: Object.keys(focusSet).length,
      teacherBySport: teacherBySport, selfBySport: selfBySport, teacherAvg: teacherAvg,
      test: { baseline: typeof t.baseline === 'number' ? t.baseline : null, retest: typeof t.retest === 'number' ? t.retest : null, change: change, adjusted: adj },
      suggested: suggested, final: final
    };
  });
}
function getOverview(cls) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  return computeOverview_(cfg, cls, getClassData(cls));
}

// ---------- Sheet menu ----------
function onOpen() {
  SpreadsheetApp.getUi().createMenu('PE Tracker')
    .addItem('1. Set up tabs (safe to re-run)', 'setupTabs')
    .addItem('2. Check roster & config', 'checkConfig')
    .addItem('3. Show app link', 'showAppLink')
    .addSeparator()
    .addItem('Build grade report tab', 'buildGradeReport')
    .addItem('Refresh app config now', 'clearConfigCache')
    .addToUi();
}
// Clear the config cache when a teacher edits a configuration tab so the
// app picks the change up straight away.
function onEdit(e) {
  try {
    var name = e && e.range && e.range.getSheet().getName();
    if (name && CONFIG_TABS[name]) clearConfigCache();
  } catch (err) {}
}

function setupTabs() {
  var book = ss_();
  Object.keys(CONFIG_TABS).forEach(function(n) { ensureTab_(n, CONFIG_TABS[n]); });
  Object.keys(DATA_TABS).forEach(function(n) { ensureTab_(n, DATA_TABS[n]); });

  // Seed defaults only where a tab is empty — never overwrite a teacher's edits
  var cfgTab = tab_('Config');
  if (cfgTab.getLastRow() < 2) {
    var rows = Object.keys(CONFIG_DEFAULTS).map(function(k) { return [k, CONFIG_DEFAULTS[k][0], CONFIG_DEFAULTS[k][1]]; });
    cfgTab.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  ['Lessons', 'Skills', 'Focus', 'Criteria'].forEach(function(n) {
    var t = tab_(n);
    if (t.getLastRow() < 2 && EXAMPLE[n]) t.getRange(2, 1, EXAMPLE[n].length, EXAMPLE[n][0].length).setValues(EXAMPLE[n]);
  });
  var teachers = tab_('Teachers');
  if (teachers.getLastRow() < 2) teachers.getRange(2, 1, 1, 2).setValues([[Session.getEffectiveUser().getEmail(), 'Sheet owner (automatic)']]);
  var roster = tab_('Roster');
  if (roster.getLastRow() < 2) roster.getRange(2, 1, 2, 3).setValues([['7A', 'Example Student', 'example@school.edu'], ['7A', 'Another Student', 'another@school.edu']]);

  // Data tabs: readable timestamps
  Object.keys(DATA_TABS).forEach(function(n) {
    var t = tab_(n), col = DATA_TABS[n].indexOf('Updated') + 1;
    if (col > 0) t.getRange(2, col, Math.max(1, t.getMaxRows() - 1), 1).setNumberFormat('yyyy-mm-dd hh:mm');
  });

  // Put configuration tabs first so a new teacher sees them immediately
  var order = Object.keys(CONFIG_TABS).concat(Object.keys(DATA_TABS));
  order.forEach(function(n, i) { var t = tab_(n); if (t) { book.setActiveSheet(t); book.moveActiveSheet(i + 1); } });
  var first = book.getSheets()[0];
  if (first && !CONFIG_TABS[first.getName()] && !DATA_TABS[first.getName()] && first.getLastRow() === 0 && book.getSheets().length > 1) {
    book.deleteSheet(first); // the blank "Sheet1" a new spreadsheet starts with
  }
  book.setActiveSheet(tab_('Roster'));
  clearConfigCache();
  try {
    SpreadsheetApp.getUi().alert('Tabs are ready.\n\nNext: fill in the Roster tab (Class, Student, Email), check Lessons and Skills, then deploy the web app (see the Teacher Guide) and use "3. Show app link".');
  } catch (e) {}
}

function showAppLink() {
  var url = ScriptApp.getService().getUrl();
  var ui = SpreadsheetApp.getUi();
  if (!url) { ui.alert('Not deployed yet.\n\nExtensions → Apps Script → Deploy → New deployment → Web app.'); return; }
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px system-ui;padding:8px">' +
    '<p><b>Student link</b> (share this):</p><input style="width:100%;font-size:13px" value="' + url + '" onclick="this.select()">' +
    '<p style="margin-top:14px"><b>Teacher view</b>: same link — teachers are recognised by their login.</p>' +
    '<p><a target="_blank" href="' + url + '">Open the app</a></p></div>').setWidth(520).setHeight(200);
  ui.showModalDialog(html, 'PE Tracker app link');
}

function checkConfig() {
  var cfg = buildConfig_();
  var problems = [];
  if (!cfg.lessons.length) problems.push('Lessons tab is empty.');
  if (!cfg.checkpoints.length) problems.push('No lesson has a Checkpoint (e.g. Early / Middle / End).');
  if (!cfg.sports.length) problems.push('Skills tab has no sports/skills.');
  cfg.lessons.forEach(function(l) { if (l.sport && !cfg.skills[l.sport] && l.sport.toLowerCase() !== 'choice') problems.push('Lesson ' + l.number + ' uses sport "' + l.sport + '" which has no skills on the Skills tab.'); });
  if (!cfg.roster.length) problems.push('Roster tab is empty.');
  var seen = {};
  cfg.roster.forEach(function(r) {
    if (!r.email) problems.push('No email for ' + r.student + ' (' + r.cls + ') — they cannot sign in.');
    else if (seen[r.email]) problems.push('Duplicate email ' + r.email);
    seen[r.email] = true;
  });
  if (!cfg.criteria.length) problems.push('Criteria tab is empty.');
  cfg.criteria.forEach(function(c) { if (c.evidence === 'none') problems.push('Criterion ' + c.code + ' has no Evidence type (test / reflection / participation / skills).'); });
  var msg = problems.length ? problems.join('\n') : 'Looks good: ' + cfg.classes.length + ' classes, ' + cfg.roster.length + ' students, ' + cfg.sports.length + ' sports, ' + cfg.checkpoints.length + ' checkpoints.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

// Writes a GradeReport tab: evidence, suggested and final grade per student.
function buildGradeReport() {
  var cfg = getConfig_();
  var header = ['Class', 'Student', 'Lessons attended', 'Lessons run', 'Participation avg (1-3)',
    'Checkpoints submitted', 'Reflections complete', 'Focus variety',
    cfg.test.name + ' baseline', cfg.test.name + ' retest', 'Change', 'Adjusted gain'];
  cfg.sports.forEach(function(sp) { header.push(sp + ' self (last)'); header.push(sp + ' teacher (last)'); });
  cfg.criteria.forEach(function(c) { header.push(c.code + ' suggested'); header.push(c.code + ' final'); header.push(c.code + ' comment'); });
  var rows = [header];
  var fmt = function(v, d) { return v === null || v === undefined ? '' : (typeof v === 'number' ? Number(v.toFixed(d === undefined ? 2 : d)) : v); };
  cfg.classes.forEach(function(cls) {
    var data = getClassData(cls);
    computeOverview_(cfg, cls, data).forEach(function(o) {
      var row = [cls, o.student, o.lessonsAttended, o.lessonsRun, fmt(o.participationAvg),
        o.checkpointsSubmitted, o.reflectionsComplete, o.focusVariety,
        fmt(o.test.baseline), fmt(o.test.retest), fmt(o.test.change), fmt(o.test.adjusted)];
      cfg.sports.forEach(function(sp) { row.push(fmt(o.selfBySport[sp], 1)); row.push(fmt(o.teacherBySport[sp], 1)); });
      cfg.criteria.forEach(function(c) {
        var f = o.final[c.code] || {};
        row.push(fmt(o.suggested[c.code])); row.push(fmt(f.score)); row.push(f.comment || '');
      });
      rows.push(row);
    });
  });
  var book = ss_();
  var sh = book.getSheetByName('GradeReport') || book.insertSheet('GradeReport');
  sh.clear();
  sh.getRange(1, 1, rows.length, header.length).setValues(rows);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
  sh.autoResizeColumns(1, header.length);
  book.setActiveSheet(sh);
  return 'GradeReport updated: ' + (rows.length - 1) + ' students.';
}
