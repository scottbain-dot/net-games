// =============================================================
// Move for Skills — PE tracker (Google Apps Script server)
// =============================================================
// Lives inside a Google Sheet. The Sheet holds the set-up (sports,
// skills, drills, lessons, roster) AND the data. The web app
// (Index.html / Styles.html / App.html) is served by this script.
//
// Model
//   • Every student is in ONE sport group for the unit (Roster: Section, Sport).
//   • Teachers test 3–4 key skills per sport, score out of 10. The score
//     places the student at a stage: Understanding / Intermediate / Automatic.
//   • At the Early check-in the student picks ONE focus skill (ideally one
//     at Understanding), confirms a goal, and works through that skill's
//     drill progression on paper (peer check + teacher sign-off on the log).
//   • Mid check-in: reflect, refocus, quick retest of the focus skill.
//   • End: teacher records the final retest of the focus skill and a game-play
//     assessment (4 levels) watched over the last two lessons. Final reflection.
//
// Setup: see docs/TEACHER-GUIDE.md. Menu "PE Tracker" → 1. Set up tabs.
// Deploy as Web app: Execute as Me, access "Anyone within <school>".
// =============================================================

// ---------- Tab definitions ----------
var CONFIG_TABS = {
  Config:   ['Key', 'Value', 'What it does'],
  Lessons:  ['Number', 'Checkpoint', 'Date'],
  Skills:   ['Sport', 'Skill', 'Test', 'Success'],
  Drills:   ['Sport', 'Skill', 'Step', 'Drill', 'Criteria'],
  Outcomes: ['Outcome', 'LooksLike'],
  Criteria: ['Code', 'Name', 'Evidence', 'TopBand'],
  Roster:   ['Section', 'Sport', 'Student', 'Email'],
  Teachers: ['Email', 'Name', 'Sport']
};
var DATA_TABS = {
  Register:   ['Section', 'Sport', 'Student', 'Lesson', 'Participation', 'Note', 'Updated'],
  SkillTests: ['Section', 'Sport', 'Student', 'Checkpoint', 'Skill', 'Score', 'By', 'Updated'],
  Checkins:   ['Section', 'Sport', 'Student', 'Checkpoint', 'FocusSkill', 'Goal', 'DrillStep', 'ExtensionSkill', 'ExtensionDrill', 'SelfStages', 'WentWell', 'NextGoal', 'GamePlay', 'Engagement', 'Personal', 'Confirmed', 'Updated'],
  OutcomeRatings: ['Section', 'Sport', 'Student', 'Checkpoint', 'Outcome', 'Self', 'Teacher', 'Updated'],
  Grades:     ['Section', 'Sport', 'Student', 'Criterion', 'Score', 'Comment', 'Updated']
};
var DATA_KEYS = {
  Register:   ['Section', 'Student', 'Lesson'],
  SkillTests: ['Section', 'Student', 'Checkpoint', 'Skill'],
  Checkins:   ['Section', 'Student', 'Checkpoint'],
  OutcomeRatings: ['Section', 'Student', 'Checkpoint', 'Outcome'],
  Grades:     ['Section', 'Student', 'Criterion']
};

var CONFIG_DEFAULTS = {
  unit_name:            ['Move for Skills', 'Shown at the top of the app and on the paper log'],
  stage_labels:         ['Understanding|Intermediate|Automatic', 'The three learning stages, low to high'],
  stage_bands:          ['3|7', 'Score out of 10: up to first number = stage 1, up to second = stage 2, above = stage 3'],
  score_max:            ['10', 'Skill tests are scored out of this'],
  participation_labels: ['Inconsistent|Regular|Excellent', 'The 3 participation levels the teacher taps in the register'],
  outcome_labels:       ['Not yet|Sometimes|Consistently', 'The 3 levels for the personal-skill outcomes (Outcomes tab)'],
  game_levels:          ['7|6-5|4-3|2-1', 'The four levels of the teacher\'s game-play assessment, best first'],
  game_level_scores:    ['7|6|4|2', 'Suggested 1-7 score for each of those levels'],
  goal_template:        ['Move my {skill} from {stage} ({score}/{max}) to {nextStage} ({target}+/{max}) by the {checkpoint} check-in by working through drill steps {steps}.', 'Draft goal shown to the student. Placeholders in {braces} are filled in.'],
  reflection_prompt_early: ['Why this skill, and what will you do first?', 'The one question at the Early check-in'],
  reflection_prompt_1:  ['What went well and what has improved?', 'First reflection question at each check-in'],
  reflection_prompt_2:  ['What will I do differently in the next lessons?', 'Second reflection question at each check-in'],
  show_grades_to_students: ['FALSE', 'TRUE to show final grades and comments on the student dashboard'],
  daily_register:       ['FALSE', 'TRUE to add a per-lesson participation register for teachers (otherwise engagement is rated at each check-in)']
};
var CACHE_KEY_CONFIG = 'mfs_config_v2';
var CACHE_SECONDS = 180;
var EVIDENCE_TYPES = ['test', 'reflection', 'participation', 'skills', 'outcomes', 'none'];

// ---------- Example unit (seeded only into EMPTY tabs — edit freely) ----------
var EXAMPLE = {
  Lessons: [
    [1, 'Early', ''], [2, '', ''], [3, '', ''], [4, '', ''], [5, 'Middle', ''],
    [6, '', ''], [7, '', ''], [8, '', ''], [9, 'End', '']
  ],
  Skills: [
    ['Net Games',    'Serve',           '10 serves into the target zone',                                 'Legal serve, lands in the zone'],
    ['Net Games',    'Rally',           '10 shots in a cooperative rally with a partner',                 'Stays in and the partner can return it'],
    ['Net Games',    'Attacking shot',  '10 fed balls: win the point with a smash or drive against a defender', 'Winner or forced error, in court (stretch test)'],
    ['Ultimate',     'Backhand throw',  '10 throws to a partner 10 m away',                               'Catchable at chest height without moving'],
    ['Ultimate',     'Catching',        '10 throws from a partner, mixed height',                         'Two-hand catch, disc held'],
    ['Ultimate',     'Break the mark',  '10 throws past an active mark to a cutting receiver',            'Completed past the mark (stretch test)'],
    ['Table Tennis', 'Serve',           '10 serves to the diagonal half',                                 'Legal serve landing in the diagonal half'],
    ['Table Tennis', 'Forehand drive',  '10 fed balls, forehand drive',                                   'On the table, past the middle'],
    ['Table Tennis', 'Third-ball attack', '10 rallies: serve, return, then attack to win the point',      'Winner or forced error (stretch test)'],
    ['Handball',     'Pass & catch',    '10 passes on the move over 5 m',                                 'Caught cleanly by the partner'],
    ['Handball',     'Jump shot',       '10 shots from the 9 m line over a passive defender',             'On target from a legal jump'],
    ['Handball',     'Beat and shoot',  '10 attempts: beat a live defender 1v1 and shoot',                'On target after beating the defender (stretch test)']
  ],
  Drills: [
    ['Net Games', 'Serve', 1, 'Shadow & toss', 'Stance, toss and contact point look the same 5 times in a row'],
    ['Net Games', 'Serve', 2, 'Serve to a big target', '7 of 10 into the half-court'],
    ['Net Games', 'Serve', 3, 'Serve to a small target', '6 of 10 into a hoop or zone'],
    ['Net Games', 'Serve', 4, 'Serve under pressure', '6 of 10 in a game situation, partner returns'],
    ['Net Games', 'Rally', 1, 'Cooperative rally, big court', '5 in a row, twice'],
    ['Net Games', 'Rally', 2, 'Cooperative rally, half court', '8 in a row, twice'],
    ['Net Games', 'Rally', 3, 'Rally with a move', 'Partner moves you front and back: 6 in a row'],
    ['Net Games', 'Rally', 4, 'Rally to targets', 'Partner calls a side each shot: 6 in a row'],
    ['Net Games', 'Attacking shot', 1, 'Shadow the swing', 'Side-on, elbow high, contact in front: partner checks 5 times'],
    ['Net Games', 'Attacking shot', 2, 'Fed high balls, no defender', '7 of 10 hit down into court'],
    ['Net Games', 'Attacking shot', 3, 'Fed balls vs passive defender', '6 of 10 winners'],
    ['Net Games', 'Attacking shot', 4, 'Rally then attack', 'Play 3 shots then attack on the short ball: 5 of 10'],
    ['Ultimate', 'Backhand throw', 1, 'Grip & wrist snap', 'Disc flies flat 5 m, 5 in a row'],
    ['Ultimate', 'Backhand throw', 2, 'Step & throw 10 m', '7 of 10 catchable'],
    ['Ultimate', 'Backhand throw', 3, 'Throw to a moving target', '6 of 10 catchable on the run'],
    ['Ultimate', 'Catching', 1, 'Pancake catch, standing', '8 of 10 from 5 m'],
    ['Ultimate', 'Catching', 2, 'Two-hand rim catch, high & low', '7 of 10 mixed height'],
    ['Ultimate', 'Catching', 3, 'Catch on the run', '6 of 10 while cutting'],
    ['Ultimate', 'Break the mark', 1, 'Pivot foot only', 'Pivot 10 times without lifting the foot'],
    ['Ultimate', 'Break the mark', 2, 'Fake then throw, passive mark', '7 of 10 past the mark'],
    ['Ultimate', 'Break the mark', 3, 'Live mark, stall count', '5 of 10 past an active mark'],
    ['Table Tennis', 'Serve', 1, 'Toss & contact', 'Legal toss and contact 5 times in a row'],
    ['Table Tennis', 'Serve', 2, 'Serve to the diagonal', '7 of 10 legal into the diagonal half'],
    ['Table Tennis', 'Serve', 3, 'Serve to a target', '6 of 10 into a paper target'],
    ['Table Tennis', 'Forehand drive', 1, 'Shadow swing', 'Low to high, partner checks 5 times'],
    ['Table Tennis', 'Forehand drive', 2, 'Fed balls', '7 of 10 on the table'],
    ['Table Tennis', 'Forehand drive', 3, 'Forehand rally', '6 in a row with a partner'],
    ['Table Tennis', 'Third-ball attack', 1, 'Serve then drive', 'Serve, partner returns long, drive on the table: 6 of 10'],
    ['Table Tennis', 'Third-ball attack', 2, 'Attack the short return', 'Serve, partner returns short, attack on the table: 5 of 10'],
    ['Table Tennis', 'Third-ball attack', 3, 'Live points', 'Win the point on the third ball: 4 of 10'],
    ['Handball', 'Pass & catch', 1, 'Standing pass 5 m', '8 of 10 caught cleanly'],
    ['Handball', 'Pass & catch', 2, 'Pass on the move', '7 of 10 caught cleanly while jogging'],
    ['Handball', 'Pass & catch', 3, 'Pass with a passive defender', '6 of 10 completed'],
    ['Handball', 'Jump shot', 1, 'Three-step & jump, no ball', 'Correct footwork 5 times in a row'],
    ['Handball', 'Jump shot', 2, 'Jump shot at goal', '7 of 10 on target'],
    ['Handball', 'Jump shot', 3, 'Jump shot over a defender', '5 of 10 on target'],
    ['Handball', 'Beat and shoot', 1, 'Fake and go, cone defender', 'Beats the cone and shoots on target 7 of 10'],
    ['Handball', 'Beat and shoot', 2, 'Passive defender', 'Beats the defender and shoots on target 6 of 10'],
    ['Handball', 'Beat and shoot', 3, 'Live defender', 'Beats the defender and shoots on target 4 of 10']
  ],
  Outcomes: [
    ['Self-management', 'Starts without being told, keeps the paper log up to date, moves on only after sign-off, asks for help at the right moment'],
    ['Perseverance',    'Keeps going when a step is hard and repeats it until the criteria are met'],
    ['Collaboration',   'Gives honest peer checks and useful feedback; shares space and equipment']
  ],
  Criteria: [
    ['S2', 'Skill identification', 'reflection',    'Clearly identifies strengths and areas for improvement. Strong understanding of skill requirements.'],
    ['S1', 'Skill development',    'test',          'Significant and consistent improvement. Independently applies effective strategies.'],
    ['S4', 'Active participation', 'participation', 'Consistently highly engaged. Excellent self-management, communication, collaboration.']
  ]
};

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
  var lastCol = Math.max(1, s.getLastColumn());
  var existing = s.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  while (existing.length && existing[existing.length - 1] === '') existing.pop();
  var missing = headers.filter(function(h) { return existing.indexOf(h) === -1; });
  if (existing.length === 0) s.getRange(1, 1, 1, headers.length).setValues([headers]);
  else if (missing.length) s.getRange(1, existing.length + 1, 1, missing.length).setValues([missing]);
  s.setFrozenRows(1);
  return s;
}

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
    if (!empty) out.push(obj);
  }
  return out;
}

function str_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function num_(v) { if (v === '' || v === null || v === undefined) return null; var n = parseFloat(v); return isNaN(n) ? null : n; }
function bool_(v) { return /^(true|yes|1)$/i.test(str_(v)); }
function lower_(v) { return str_(v).toLowerCase(); }
function keyOf_(fields, obj) { return fields.map(function(f) { return lower_(obj[f]); }).join(''); }
function splitList_(s) { return str_(s).split('|').map(function(x) { return x.trim(); }).filter(Boolean); }

// Insert-or-update rows keyed on DATA_KEYS[name]. Columns the caller does not
// send keep their existing value.
function upsert_(name, rows) {
  if (!rows || !rows.length) return 0;
  var s = ensureTab_(name, DATA_TABS[name]);
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
  try { cache.put(CACHE_KEY_CONFIG, JSON.stringify(cfg), CACHE_SECONDS); } catch (e) {}
  return cfg;
}

function buildConfig_() {
  var kv = {};
  Object.keys(CONFIG_DEFAULTS).forEach(function(k) { kv[k] = CONFIG_DEFAULTS[k][0]; });
  readTab_('Config').forEach(function(r) { if (str_(r.Key)) kv[str_(r.Key)] = str_(r.Value); });

  var lessons = readTab_('Lessons').map(function(r) {
    return { number: num_(r.Number), checkpoint: str_(r.Checkpoint), date: str_(r.Date) };
  }).filter(function(l) { return l.number !== null; }).sort(function(a, b) { return a.number - b.number; });

  var sports = [], skills = {};
  readTab_('Skills').forEach(function(s) {
    var sp = str_(s.Sport), sk = str_(s.Skill);
    if (!sp || !sk) return;
    if (sports.indexOf(sp) === -1) sports.push(sp);
    (skills[sp] = skills[sp] || []).push({ skill: sk, test: str_(s.Test), success: str_(s.Success), drills: [] });
  });
  readTab_('Drills').forEach(function(d) {
    var sp = str_(d.Sport), sk = str_(d.Skill), step = num_(d.Step);
    var target = (skills[sp] || []).filter(function(x) { return x.skill === sk; })[0];
    if (!target || step === null) return;
    target.drills.push({ step: step, drill: str_(d.Drill), criteria: str_(d.Criteria) });
  });
  Object.keys(skills).forEach(function(sp) { skills[sp].forEach(function(s) { s.drills.sort(function(a, b) { return a.step - b.step; }); }); });

  var checkpoints = [];
  lessons.forEach(function(l) {
    if (l.checkpoint && !checkpoints.some(function(c) { return c.name === l.checkpoint; })) checkpoints.push({ name: l.checkpoint, lesson: l.number });
  });

  var outcomes = readTab_('Outcomes').map(function(r) { return { outcome: str_(r.Outcome), looksLike: str_(r.LooksLike) }; }).filter(function(o) { return o.outcome; });
  var criteria = readTab_('Criteria').map(function(r) {
    var ev = lower_(r.Evidence);
    return { code: str_(r.Code), name: str_(r.Name), evidence: EVIDENCE_TYPES.indexOf(ev) === -1 ? 'none' : ev, top: str_(r.TopBand) };
  }).filter(function(c) { return c.code; });

  var roster = readTab_('Roster').map(function(r) { return { section: str_(r.Section), sport: str_(r.Sport), student: str_(r.Student), email: lower_(r.Email) }; })
    .filter(function(r) { return r.section && r.student; });
  var sections = [];
  roster.forEach(function(r) { if (sections.indexOf(r.section) === -1) sections.push(r.section); });
  var teachers = readTab_('Teachers').map(function(r) { return { email: lower_(r.Email), sport: str_(r.Sport) }; }).filter(function(t) { return t.email; });

  var stageLabels = splitList_(kv.stage_labels); while (stageLabels.length < 3) stageLabels.push('Stage ' + (stageLabels.length + 1));
  var bands = splitList_(kv.stage_bands).map(num_); if (bands.length < 2 || bands[0] === null || bands[1] === null) bands = [3, 7];
  var pLabels = splitList_(kv.participation_labels); while (pLabels.length < 3) pLabels.push('Level ' + (pLabels.length + 1));
  var oLabels = splitList_(kv.outcome_labels); while (oLabels.length < 3) oLabels.push('Level ' + (oLabels.length + 1));

  return {
    unitName: kv.unit_name || 'PE Unit',
    stageLabels: stageLabels.slice(0, 3), stageBands: bands.slice(0, 2), scoreMax: num_(kv.score_max) || 10,
    participationLabels: pLabels.slice(0, 3), outcomeLabels: oLabels.slice(0, 3),
    gameLevels: (function() { var l = splitList_(kv.game_levels); while (l.length < 4) l.push('Level ' + (l.length + 1)); return l.slice(0, 4); })(),
    gameLevelScores: (function() { var l = splitList_(kv.game_level_scores).map(num_); while (l.length < 4) l.push(null); return l.slice(0, 4); })(),
    goalTemplate: kv.goal_template,
    reflectionPrompts: [kv.reflection_prompt_1, kv.reflection_prompt_2], earlyPrompt: kv.reflection_prompt_early,
    showGradesToStudents: bool_(kv.show_grades_to_students), dailyRegister: bool_(kv.daily_register),
    lessons: lessons, sports: sports, skills: skills, checkpoints: checkpoints,
    outcomes: outcomes, criteria: criteria, sections: sections, roster: roster, teachers: teachers
  };
}
function stageOf_(cfg, score) {
  if (score === null || score === undefined || score === '') return 0;
  if (score <= cfg.stageBands[0]) return 1;
  if (score <= cfg.stageBands[1]) return 2;
  return 3;
}

// ---------- Identity ----------
function identity_(cfg) {
  var email = lower_(Session.getActiveUser().getEmail());
  var owner = lower_(Session.getEffectiveUser().getEmail());
  var out = { email: email, role: 'unknown', name: '', section: '', sport: '' };
  var t = cfg.teachers.filter(function(x) { return x.email === email; })[0];
  var me = email ? cfg.roster.filter(function(r) { return r.email === email; })[0] : null;
  if (email && (email === owner || t)) {
    out.role = 'teacher'; out.sport = t ? t.sport : '';
    // A teacher who is also on the Roster can "Test as student" in the app.
    if (me) out.alsoStudent = { name: me.student, section: me.section, sport: me.sport };
    return out;
  }
  if (me) { out.role = 'student'; out.name = me.student; out.section = me.section; out.sport = me.sport; }
  return out;
}
function requireTeacher_(cfg) {
  var id = identity_(cfg);
  if (id.role !== 'teacher') throw new Error('Teachers only');
  return id;
}
function rosterEntry_(cfg, section, student) {
  return cfg.roster.filter(function(r) { return r.section === section && r.student === student; })[0] || null;
}
function resolveStudent_(cfg, section, student) {
  var id = identity_(cfg);
  if (id.role === 'teacher') {
    var r = rosterEntry_(cfg, section, student);
    if (!r) throw new Error('Student not on roster: ' + student + ' (' + section + ')');
    return { section: r.section, sport: r.sport, student: r.student, byTeacher: true };
  }
  if (id.role === 'student') return { section: id.section, sport: id.sport, student: id.name, byTeacher: false };
  throw new Error('Not signed in with a school account that is on the roster');
}

// ---------- Web app entry ----------
// When built as a single file (dist/Code.gs), the three HTML files are
// embedded here so there is only one thing to paste into Apps Script.
var EMBEDDED_HTML = {};
function doGet(e) {
  var t = EMBEDDED_HTML.Index ? HtmlService.createTemplate(EMBEDDED_HTML.Index) : HtmlService.createTemplateFromFile('Index');
  t.sectionParam = (e && e.parameter && e.parameter.section) || '';
  t.viewParam = (e && e.parameter && e.parameter.view) || '';
  return t.evaluate()
    .setTitle('Move for Skills')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(name) { return EMBEDDED_HTML[name] !== undefined ? EMBEDDED_HTML[name] : HtmlService.createHtmlOutputFromFile(name).getContent(); }

function publicConfig_(cfg) {
  var c = JSON.parse(JSON.stringify(cfg));
  c.roster = c.roster.map(function(r) { return { section: r.section, sport: r.sport, student: r.student }; });
  delete c.teachers;
  return c;
}

function bootstrap() {
  var cfg = getConfig_();
  var id = identity_(cfg);
  var out = { config: publicConfig_(cfg), identity: id, appUrl: appUrl_() };
  if (id.role === 'student') out.student = studentData_(cfg, id.section, id.name);
  return out;
}

// ---------- Reads ----------
function rowsFor_(name, section, student) {
  return readTab_(name).filter(function(r) { return str_(r.Section) === section && (!student || str_(r.Student) === student); });
}
function parseSelf_(s) { try { var o = JSON.parse(s || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; } }
function mapRegister_(r) { return { student: str_(r.Student), lesson: num_(r.Lesson), participation: num_(r.Participation), note: str_(r.Note) }; }
function mapTest_(r) { return { student: str_(r.Student), checkpoint: str_(r.Checkpoint), skill: str_(r.Skill), score: num_(r.Score), by: str_(r.By) || 'teacher' }; }
function mapCheckin_(r) { return { student: str_(r.Student), checkpoint: str_(r.Checkpoint), focusSkill: str_(r.FocusSkill), goal: str_(r.Goal), drillStep: num_(r.DrillStep), extensionSkill: str_(r.ExtensionSkill), extensionDrill: str_(r.ExtensionDrill), selfStages: parseSelf_(r.SelfStages), wentWell: str_(r.WentWell), nextGoal: str_(r.NextGoal), gamePlay: num_(r.GamePlay), engagement: num_(r.Engagement), personal: num_(r.Personal), confirmed: bool_(r.Confirmed) }; }
function mapOutcome_(r) { return { student: str_(r.Student), checkpoint: str_(r.Checkpoint), outcome: str_(r.Outcome), self: num_(r.Self), teacher: num_(r.Teacher) }; }
function mapGrade_(r) { return { student: str_(r.Student), criterion: str_(r.Criterion), score: num_(r.Score), comment: str_(r.Comment) }; }

function studentData_(cfg, section, student) {
  var r = rosterEntry_(cfg, section, student) || { sport: '' };
  var classRegister = rowsFor_('Register', section);
  var lessonsRun = {};
  classRegister.forEach(function(x) { if (num_(x.Participation) && str_(x.Sport) === r.sport) lessonsRun[num_(x.Lesson)] = true; });
  return {
    section: section, sport: r.sport, student: student,
    lessonsRun: Object.keys(lessonsRun).length,
    register: classRegister.filter(function(x) { return str_(x.Student) === student; }).map(mapRegister_),
    tests: rowsFor_('SkillTests', section, student).map(mapTest_),
    checkins: rowsFor_('Checkins', section, student).map(mapCheckin_),
    outcomes: rowsFor_('OutcomeRatings', section, student).map(mapOutcome_),
    grades: rowsFor_('Grades', section, student).map(mapGrade_)
  };
}
function getStudent(section, student) {
  var cfg = getConfig_();
  var who = resolveStudent_(cfg, section, student);
  return studentData_(cfg, who.section, who.student);
}
// Teacher: everything for one section (all sport groups) in one call.
function getSectionData(section) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  return {
    section: section,
    register: rowsFor_('Register', section).map(mapRegister_),
    tests: rowsFor_('SkillTests', section).map(mapTest_),
    checkins: rowsFor_('Checkins', section).map(mapCheckin_),
    outcomes: rowsFor_('OutcomeRatings', section).map(mapOutcome_),
    grades: rowsFor_('Grades', section).map(mapGrade_)
  };
}

// ---------- Writes (one request per user action) ----------
function clampInt_(v, lo, hi) { var n = parseInt(v, 10); return isNaN(n) ? null : Math.max(lo, Math.min(hi, n)); }
function blankOr_(v, lo, hi) { if (v === null || v === undefined || v === '') return ''; var n = clampInt_(v, lo, hi); return n === null ? '' : n; }

// Student check-in (or teacher on their behalf).
// payload: { section, student, checkpoint, scores:{skill:n}, focusSkill, goal, drillStep, extensionSkill, extensionDrill, selfStages:{skill:1-3}, selfOutcomes:{outcome:1-3}, wentWell, nextGoal }
function saveCheckin(payload) {
  var cfg = getConfig_();
  var who = resolveStudent_(cfg, payload.section, payload.student);
  var cp = str_(payload.checkpoint);
  if (!cfg.checkpoints.some(function(c) { return c.name === cp; })) throw new Error('Unknown checkpoint: ' + cp);
  var skills = (cfg.skills[who.sport] || []).map(function(s) { return s.skill; });
  var focus = str_(payload.focusSkill);
  if (focus && skills.indexOf(focus) === -1) focus = '';
  var self = {};
  Object.keys(payload.selfStages || {}).forEach(function(k) { if (skills.indexOf(k) !== -1) { var n = clampInt_(payload.selfStages[k], 1, 3); if (n) self[k] = n; } });
  var row = { Section: who.section, Sport: who.sport, Student: who.student, Checkpoint: cp,
    FocusSkill: focus, Goal: str_(payload.goal).slice(0, 400), DrillStep: blankOr_(payload.drillStep, 0, 20),
    ExtensionSkill: str_(payload.extensionSkill).slice(0, 80), ExtensionDrill: str_(payload.extensionDrill).slice(0, 300),
    SelfStages: JSON.stringify(self),
    WentWell: str_(payload.wentWell).slice(0, 600), NextGoal: str_(payload.nextGoal).slice(0, 600) };
  // Scores the student typed from their paper log. Never overwrite a score
  // the teacher entered or corrected.
  var testRows = [];
  var scores = payload.scores || {};
  if (Object.keys(scores).length) {
    var teacherSet = {};
    rowsFor_('SkillTests', who.section, who.student).forEach(function(t) { if (str_(t.Checkpoint) === cp && str_(t.By) === 'teacher') teacherSet[str_(t.Skill)] = true; });
    Object.keys(scores).forEach(function(k) {
      if (skills.indexOf(k) === -1 || teacherSet[k]) return;
      var v = scores[k];
      if (v === '' || v === null || v === undefined) return;
      testRows.push({ Section: who.section, Sport: who.sport, Student: who.student, Checkpoint: cp, Skill: k, Score: blankOr_(v, 0, cfg.scoreMax), By: 'student' });
    });
  }
  // A student re-saving their check-in un-confirms it so the teacher looks again.
  if (!who.byTeacher) row.Confirmed = '';
  var outcomeRows = [];
  Object.keys(payload.selfOutcomes || {}).forEach(function(k) {
    if (!cfg.outcomes.some(function(o) { return o.outcome === k; })) return;
    var n = clampInt_(payload.selfOutcomes[k], 1, 3); if (!n) return;
    outcomeRows.push({ Section: who.section, Sport: who.sport, Student: who.student, Checkpoint: cp, Outcome: k, Self: n });
  });
  return withLock_(function() {
    upsert_('Checkins', [row]);
    if (testRows.length) upsert_('SkillTests', testRows);
    if (outcomeRows.length) upsert_('OutcomeRatings', outcomeRows);
    return { ok: true };
  });
}
// Teacher's one-page check-in. entries: [{student, confirmed, engagement, personal,
//   gamePlay (1-4, best first), scores: {skill: score}}] — any subset of fields.
function saveTeacherCheckin(payload) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var section = str_(payload.section), cp = str_(payload.checkpoint);
  if (!section || !cfg.checkpoints.some(function(c) { return c.name === cp; })) throw new Error('Missing section or checkpoint');
  var checkRows = [], testRows = [];
  (payload.entries || []).forEach(function(e) {
    var student = str_(e.student); if (!student) return;
    var sport = sportOf_(cfg, section, student);
    var c = { Section: section, Sport: sport, Student: student, Checkpoint: cp };
    var any = false;
    if ('confirmed' in e) { c.Confirmed = e.confirmed ? 'yes' : ''; any = true; }
    if ('engagement' in e) { c.Engagement = blankOr_(e.engagement, 1, 3); any = true; }
    if ('personal' in e) { c.Personal = blankOr_(e.personal, 1, 3); any = true; }
    if ('gamePlay' in e) { c.GamePlay = blankOr_(e.gamePlay, 1, 4); any = true; }
    if (any) checkRows.push(c);
    Object.keys(e.scores || {}).forEach(function(k) {
      testRows.push({ Section: section, Sport: sport, Student: student, Checkpoint: cp, Skill: k, Score: blankOr_(e.scores[k], 0, cfg.scoreMax), By: 'teacher' });
    });
  });
  return withLock_(function() {
    if (checkRows.length) upsert_('Checkins', checkRows);
    if (testRows.length) upsert_('SkillTests', testRows);
    return { ok: true, saved: checkRows.length + testRows.length };
  });
}
// Teacher ratings of personal-skill outcomes. entries: [{student, outcome, teacher}]
function saveOutcomes(payload) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var section = str_(payload.section), cp = str_(payload.checkpoint);
  var rows = (payload.entries || []).map(function(e) {
    return { Section: section, Sport: sportOf_(cfg, section, str_(e.student)), Student: str_(e.student), Checkpoint: cp, Outcome: str_(e.outcome), Teacher: blankOr_(e.teacher, 1, 3) };
  }).filter(function(r) { return r.Student && r.Outcome; });
  return withLock_(function() { return { ok: true, saved: upsert_('OutcomeRatings', rows) }; });
}

function sportOf_(cfg, section, student) { var r = rosterEntry_(cfg, section, student); return r ? r.sport : ''; }

// entries: [{student, participation, note}]
function saveRegister(payload) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var section = str_(payload.section), lesson = num_(payload.lesson);
  if (!section || lesson === null) throw new Error('Missing section or lesson');
  var rows = (payload.entries || []).map(function(e) {
    var r = { Section: section, Sport: sportOf_(cfg, section, str_(e.student)), Student: str_(e.student), Lesson: lesson };
    if ('participation' in e) r.Participation = blankOr_(e.participation, 1, 3);
    if ('note' in e) r.Note = str_(e.note).slice(0, 200);
    return r;
  }).filter(function(r) { return r.Student; });
  return withLock_(function() { return { ok: true, saved: upsert_('Register', rows) }; });
}
// entries: [{student, skill, score}]
function saveSkillTests(payload) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var section = str_(payload.section), cp = str_(payload.checkpoint);
  var rows = (payload.entries || []).map(function(e) {
    return { Section: section, Sport: sportOf_(cfg, section, str_(e.student)), Student: str_(e.student), Checkpoint: cp, Skill: str_(e.skill),
      Score: blankOr_(e.score, 0, cfg.scoreMax) };
  }).filter(function(r) { return r.Student && r.Skill; });
  return withLock_(function() { return { ok: true, saved: upsert_('SkillTests', rows) }; });
}
// entries: [{student, criterion, score, comment}]
function saveGrades(payload) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var section = str_(payload.section);
  var rows = (payload.entries || []).map(function(e) {
    var r = { Section: section, Sport: sportOf_(cfg, section, str_(e.student)), Student: str_(e.student), Criterion: str_(e.criterion) };
    if ('score' in e) r.Score = blankOr_(e.score, 1, 7);
    if ('comment' in e) r.Comment = str_(e.comment).slice(0, 500);
    return r;
  }).filter(function(r) { return r.Student && r.Criterion; });
  return withLock_(function() { return { ok: true, saved: upsert_('Grades', rows) }; });
}

// ---------- Evidence & suggested grades ----------
// One summary object per student in the section (optionally one sport).
function computeOverview_(cfg, section, sport, data) {
  var roster = cfg.roster.filter(function(r) { return r.section === section && (!sport || r.sport === sport); });
  var cps = cfg.checkpoints, nCp = cps.length || 1;
  var clamp01 = function(x) { return Math.max(0, Math.min(1, x)); };
  var band = function(x) { return Math.max(1, Math.min(7, Math.round(1 + 6 * x))); };
  // Focus-skill gain in points out of scoreMax → 1-7. Reaching the top stage from below also counts.
  var skillBand = function(gain, endStage, startStage) {
    var g = gain * 10 / cfg.scoreMax;
    var b = g >= 5 ? 7 : g >= 4 ? 6 : g >= 3 ? 5 : g >= 2 ? 4 : g >= 1 ? 3 : g >= 0 ? 2 : 1;
    if (endStage > startStage) b = Math.max(b, 4 + (endStage - startStage));
    return Math.min(7, b);
  };
  var lessonsRunBySport = {};
  data.register.forEach(function(r) { if (r.participation) { var sp = sportOf_(cfg, section, r.student); (lessonsRunBySport[sp] = lessonsRunBySport[sp] || {})[r.lesson] = true; } });

  return roster.map(function(r) {
    var name = r.student, sp = r.sport;
    var skills = (cfg.skills[sp] || []);
    var nLessons = Object.keys(lessonsRunBySport[sp] || {}).length || cfg.lessons.length || 1;
    var reg = data.register.filter(function(x) { return x.student === name && x.participation; });
    var partAvg = reg.length ? reg.reduce(function(a, x) { return a + x.participation; }, 0) / reg.length : null;
    var tests = data.tests.filter(function(x) { return x.student === name; });
    var score = function(cp, sk) { var t = tests.filter(function(x) { return x.checkpoint === cp && x.skill === sk && x.score !== null; })[0]; return t ? t.score : null; };
    var checkins = data.checkins.filter(function(x) { return x.student === name; });
    var byCp = {}; checkins.forEach(function(c) { byCp[c.checkpoint] = c; });
    var ordered = cps.map(function(c) { return byCp[c.name]; }).filter(Boolean);
    var latest = ordered[ordered.length - 1] || null;
    var focus = ''; ordered.forEach(function(c) { if (c.focusSkill) focus = c.focusSkill; });
    var goal = ''; ordered.forEach(function(c) { if (c.goal) goal = c.goal; });
    var drillStep = null; ordered.forEach(function(c) { if (c.drillStep !== null) drillStep = c.drillStep; });
    var extension = ''; ordered.forEach(function(c) { if (c.extensionSkill) extension = c.extensionSkill; });
    var gamePlay = null; ordered.forEach(function(c) { if (c.gamePlay) gamePlay = c.gamePlay; });
    var maxSteps = 0; skills.forEach(function(s) { if (s.skill === focus) maxSteps = s.drills.length; });

    // focus skill: first and last recorded score
    var fStart = null, fEnd = null, fStartCp = '', fEndCp = '';
    if (focus) cps.forEach(function(c) { var v = score(c.name, focus); if (v !== null) { if (fStart === null) { fStart = v; fStartCp = c.name; } fEnd = v; fEndCp = c.name; } });
    var fGain = (fStart !== null && fEnd !== null && fStartCp !== fEndCp) ? fEnd - fStart : null;
    // all skills: mean of first and of last checkpoint with data
    var firstCp = null, lastCp = null;
    cps.forEach(function(c) { if (skills.some(function(s) { return score(c.name, s.skill) !== null; })) { if (!firstCp) firstCp = c.name; lastCp = c.name; } });
    var meanAt = function(cp) { var v = skills.map(function(s) { return score(cp, s.skill); }).filter(function(x) { return x !== null; }); return v.length ? v.reduce(function(a, b) { return a + b; }, 0) / v.length : null; };
    var allStart = firstCp ? meanAt(firstCp) : null, allEnd = lastCp ? meanAt(lastCp) : null;
    var stagesEnd = {}; skills.forEach(function(s) { stagesEnd[s.skill] = stageOf_(cfg, lastCp ? score(lastCp, s.skill) : null); });

    // self-assessment accuracy: self stage == tested stage at the same checkpoint
    var selfN = 0, selfHit = 0;
    checkins.forEach(function(c) { Object.keys(c.selfStages || {}).forEach(function(sk) { var v = score(c.checkpoint, sk); if (v === null) return; selfN++; if (stageOf_(cfg, v) === c.selfStages[sk]) selfHit++; }); });
    var selfAcc = selfN ? selfHit / selfN : null;
    var nCheckins = ordered.filter(function(c) { return c.focusSkill || c.wentWell || c.nextGoal || c.drillStep !== null; }).length;
    var nConfirmed = ordered.filter(function(c) { return c.confirmed; }).length;
    var eng = ordered.filter(function(c) { return c.engagement; });
    var engAvg = eng.length ? eng.reduce(function(a, c) { return a + c.engagement; }, 0) / eng.length : null;
    var pers = ordered.filter(function(c) { return c.personal; });
    var persAvg = pers.length ? pers.reduce(function(a, c) { return a + c.personal; }, 0) / pers.length : null;
    var nReflected = ordered.filter(function(c) { return c.wentWell && c.nextGoal; }).length;
    var chosenAtUnderstanding = focus && fStart !== null ? stageOf_(cfg, fStart) === 1 : null;

    // personal-skill outcomes: latest teacher rating per outcome, and self
    var oRows = data.outcomes.filter(function(x) { return x.student === name; });
    var tLatest = {}, sLatest = {};
    cps.forEach(function(c) { oRows.filter(function(x) { return x.checkpoint === c.name; }).forEach(function(x) { if (x.teacher) tLatest[x.outcome] = x.teacher; if (x.self) sLatest[x.outcome] = x.self; }); });
    var tVals = Object.keys(tLatest).map(function(k) { return tLatest[k]; }), sVals = Object.keys(sLatest).map(function(k) { return sLatest[k]; });
    var outcomesTeacher = tVals.length ? tVals.reduce(function(a, b) { return a + b; }, 0) / tVals.length : persAvg;
    var outcomesSelf = sVals.length ? sVals.reduce(function(a, b) { return a + b; }, 0) / sVals.length : null;


    var suggested = {};
    cfg.criteria.forEach(function(c) {
      var s = null;
      if (c.evidence === 'test') {
        // The teacher's game-play assessment leads; the focus-skill retest gain backs it up.
        var gp = gamePlay ? cfg.gameLevelScores[gamePlay - 1] : null;
        if (gp !== null && gp !== undefined) s = gp;
        else if (fGain !== null) s = skillBand(fGain, stageOf_(cfg, fEnd), stageOf_(cfg, fStart));
      }
      if (c.evidence === 'participation') {
        if (cfg.dailyRegister && partAvg !== null) s = band(clamp01((partAvg - 1) / 2) * 0.7 + clamp01(reg.length / nLessons) * 0.3);
        else if (engAvg !== null) s = band(clamp01((engAvg - 1) / 2) * 0.8 + clamp01(eng.length / nCp) * 0.2);
      }
      if (c.evidence === 'reflection' && nCheckins > 0) {
        var x = 0.35 * clamp01(nCheckins / nCp) + 0.15 * (goal ? 1 : 0) + 0.2 * (selfAcc === null ? 0.5 : selfAcc) +
                0.15 * (maxSteps ? clamp01((drillStep || 0) / maxSteps) : 0.5) + 0.15 * clamp01(nReflected / nCp);
        s = band(x);
      }
      if (c.evidence === 'skills' && allEnd !== null) s = band(clamp01(allEnd / cfg.scoreMax));
      if (c.evidence === 'outcomes' && outcomesTeacher !== null) s = band(clamp01((outcomesTeacher - 1) / 2));
      suggested[c.code] = s;
    });
    var final = {};
    data.grades.filter(function(g) { return g.student === name; }).forEach(function(g) { final[g.criterion] = { score: g.score, comment: g.comment }; });

    return {
      student: name, sport: sp,
      lessonsAttended: reg.length, lessonsRun: nLessons, participationAvg: partAvg,
      checkins: nCheckins, reflections: nReflected, selfAccuracy: selfAcc, confirmed: nConfirmed, engagementAvg: engAvg, personalAvg: persAvg,
      focus: focus, goal: goal, drillStep: drillStep, maxSteps: maxSteps, chosenAtUnderstanding: chosenAtUnderstanding, extension: extension, gamePlay: gamePlay,
      focusStart: fStart, focusEnd: fEnd, focusGain: fGain, focusStageStart: stageOf_(cfg, fStart), focusStageEnd: stageOf_(cfg, fEnd),
      allStart: allStart, allEnd: allEnd, stagesEnd: stagesEnd,
      outcomesTeacher: outcomesTeacher, outcomesSelf: outcomesSelf, outcomesDetail: tLatest,
      suggested: suggested, final: final
    };
  });
}
function getOverview(section, sport) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  return computeOverview_(cfg, section, sport || '', getSectionData(section));
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
function onEdit(e) {
  try { var name = e && e.range && e.range.getSheet().getName(); if (name && CONFIG_TABS[name]) clearConfigCache(); } catch (err) {}
}

function setupTabs() {
  var book = ss_();
  Object.keys(CONFIG_TABS).forEach(function(n) { ensureTab_(n, CONFIG_TABS[n]); });
  Object.keys(DATA_TABS).forEach(function(n) { ensureTab_(n, DATA_TABS[n]); });

  var cfgTab = tab_('Config');
  if (cfgTab.getLastRow() < 2) {
    var rows = Object.keys(CONFIG_DEFAULTS).map(function(k) { return [k, CONFIG_DEFAULTS[k][0], CONFIG_DEFAULTS[k][1]]; });
    cfgTab.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  // Seed by header NAME, not position — a tab kept from an older version may
  // have extra or re-ordered columns.
  ['Lessons', 'Skills', 'Drills', 'Outcomes', 'Criteria'].forEach(function(n) {
    var t = tab_(n);
    if (t.getLastRow() >= 2 || !EXAMPLE[n]) return;
    var hdrs = t.getRange(1, 1, 1, Math.max(1, t.getLastColumn())).getValues()[0].map(String);
    var names = CONFIG_TABS[n];
    var rows = EXAMPLE[n].map(function(r) {
      var line = hdrs.map(function() { return ''; });
      names.forEach(function(h, i) { var c = hdrs.indexOf(h); if (c !== -1) line[c] = r[i]; });
      return line;
    });
    t.getRange(2, 1, rows.length, hdrs.length).setValues(rows);
  });
  var teachers = tab_('Teachers');
  if (teachers.getLastRow() < 2) teachers.getRange(2, 1, 1, 3).setValues([[Session.getEffectiveUser().getEmail(), 'Sheet owner (automatic)', '']]);
  var roster = tab_('Roster');
  if (roster.getLastRow() < 2) roster.getRange(2, 1, 2, 4).setValues([['Section A', 'Net Games', 'Example Student', 'example@school.edu'], ['Section A', 'Handball', 'Another Student', 'another@school.edu']]);

  Object.keys(DATA_TABS).forEach(function(n) {
    var t = tab_(n), col = DATA_TABS[n].indexOf('Updated') + 1;
    if (col > 0) t.getRange(2, col, Math.max(1, t.getMaxRows() - 1), 1).setNumberFormat('yyyy-mm-dd hh:mm');
  });
  var order = Object.keys(CONFIG_TABS).concat(Object.keys(DATA_TABS));
  order.forEach(function(n, i) { var t = tab_(n); if (t) { book.setActiveSheet(t); book.moveActiveSheet(i + 1); } });
  var first = book.getSheets()[0];
  if (first && !CONFIG_TABS[first.getName()] && !DATA_TABS[first.getName()] && first.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(first);
  book.setActiveSheet(tab_('Roster'));
  clearConfigCache();
  try { SpreadsheetApp.getUi().alert('Tabs are ready.\n\nNext: fill in the Roster tab (Section, Sport, Student, Email), check Skills / Drills / Lessons, then deploy the web app (see the Teacher Guide) and use "3. Show app link".'); } catch (e) {}
}

// getUrl() can return the older "/a/<domain>/macros/s/" form, which some
// Workspace domains no longer serve. Normalise to "/a/macros/<domain>/s/".
function appUrl_() {
  var url = ScriptApp.getService().getUrl() || '';
  return url.replace(/^https:\/\/script\.google\.com\/a\/([^\/]+)\/macros\/s\//, 'https://script.google.com/a/macros/$1/s/');
}
function showAppLink() {
  var url = appUrl_();
  var ui = SpreadsheetApp.getUi();
  if (!url) { ui.alert('Not deployed yet.\n\nExtensions → Apps Script → Deploy → New deployment → Web app.'); return; }
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px system-ui;padding:8px"><p><b>Student link</b> (share this):</p>' +
    '<input style="width:100%;font-size:13px" value="' + url + '" onclick="this.select()">' +
    '<p style="margin-top:14px"><b>Teacher view</b>: same link — teachers are recognised by their login.</p>' +
    '<p><a target="_blank" href="' + url + '">Open the app</a></p></div>').setWidth(520).setHeight(200);
  ui.showModalDialog(html, 'App link');
}

function checkConfig() {
  var cfg = buildConfig_();
  var problems = [];
  if (!cfg.lessons.length) problems.push('Lessons tab is empty.');
  if (!cfg.checkpoints.length) problems.push('No lesson has a Checkpoint (e.g. Early / Middle / End).');
  if (!cfg.sports.length) problems.push('Skills tab has no sports/skills.');
  cfg.sports.forEach(function(sp) { cfg.skills[sp].forEach(function(s) { if (!s.drills.length) problems.push(sp + ' / ' + s.skill + ' has no drill steps on the Drills tab.'); }); });
  if (!cfg.roster.length) problems.push('Roster tab is empty.');
  var seen = {};
  cfg.roster.forEach(function(r) {
    if (!r.sport) problems.push('No sport for ' + r.student + ' (' + r.section + ').');
    else if (!cfg.skills[r.sport]) problems.push(r.student + ' is in sport "' + r.sport + '" which is not on the Skills tab.');
    if (!r.email) problems.push('No email for ' + r.student + ' (' + r.section + ') — they cannot sign in.');
    else if (seen[r.email]) problems.push('Duplicate email ' + r.email);
    seen[r.email] = true;
  });
  if (!cfg.criteria.length) problems.push('Criteria tab is empty.');
  cfg.criteria.forEach(function(c) { if (c.evidence === 'none') problems.push('Criterion ' + c.code + ' has no Evidence type (test / reflection / participation / skills / outcomes).'); });
  var msg = problems.length ? problems.join('\n') : 'Looks good: ' + cfg.sections.length + ' sections, ' + cfg.roster.length + ' students, ' + cfg.sports.length + ' sports, ' + cfg.checkpoints.length + ' checkpoints.';
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}
  return msg;
}

function buildGradeReport() {
  var cfg = getConfig_();
  var header = ['Section', 'Sport', 'Student', 'Lessons attended', 'Lessons run', 'Participation avg (1-3)', 'Engagement avg (1-3)', 'Personal skills avg (1-3)',
    'Check-ins', 'Confirmed', 'Reflections', 'Self-assessment accuracy', 'Focus skill', 'Chosen at ' + cfg.stageLabels[0] + '?', 'Drill step', 'Extension skill',
    'Focus start', 'Focus end', 'Focus gain', 'Stage start', 'Stage end', 'Game-play level'];
  cfg.outcomes.forEach(function(o) { header.push(o.outcome + ' (teacher)'); });
  header.push('Outcomes self avg');
  cfg.criteria.forEach(function(c) { header.push(c.code + ' suggested'); header.push(c.code + ' final'); header.push(c.code + ' comment'); });
  var rows = [header];
  var fmt = function(v, d) { return v === null || v === undefined ? '' : (typeof v === 'number' ? Number(v.toFixed(d === undefined ? 2 : d)) : v); };
  var stage = function(n) { return n ? cfg.stageLabels[n - 1] : ''; };
  cfg.sections.forEach(function(section) {
    var data = getSectionData(section);
    computeOverview_(cfg, section, '', data).forEach(function(o) {
      var row = [section, o.sport, o.student, o.lessonsAttended, o.lessonsRun, fmt(o.participationAvg), fmt(o.engagementAvg), fmt(o.personalAvg),
        o.checkins, o.confirmed, o.reflections, o.selfAccuracy === null ? '' : Math.round(o.selfAccuracy * 100) + '%', o.focus,
        o.chosenAtUnderstanding === null ? '' : (o.chosenAtUnderstanding ? 'yes' : 'no'), o.maxSteps ? (o.drillStep || 0) + ' / ' + o.maxSteps : '', o.extension,
        fmt(o.focusStart), fmt(o.focusEnd), fmt(o.focusGain), stage(o.focusStageStart), stage(o.focusStageEnd), o.gamePlay ? cfg.gameLevels[o.gamePlay - 1] : ''];
      cfg.outcomes.forEach(function(oc) { row.push(o.outcomesDetail[oc.outcome] ? cfg.outcomeLabels[o.outcomesDetail[oc.outcome] - 1] : ''); });
      row.push(fmt(o.outcomesSelf, 1));
      cfg.criteria.forEach(function(c) { var f = o.final[c.code] || {}; row.push(fmt(o.suggested[c.code])); row.push(fmt(f.score)); row.push(f.comment || ''); });
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


// =============================================================
// Embedded web-app files (generated by dev/build-single.js — do not edit here;
// edit apps-script/*.html and rebuild).
// =============================================================
EMBEDDED_HTML = {
  Index: "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<base target=\"_top\">\n<title>Move for Skills</title>\n<?!= include('Styles') ?>\n</head>\n<body>\n<div class=\"banner\" id=\"banner\"></div>\n<div id=\"app\"><div class=\"loading\"><div class=\"spinner\"></div> Loading…</div></div>\n<div class=\"toast\" id=\"toast\"></div>\n<script>\nvar URL_SECTION = '<?= sectionParam ?>';\nvar URL_VIEW = '<?= viewParam ?>';\n<\/script>\n<?!= include('App') ?>\n</body>\n</html>\n",
  Styles: "<style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\n:root {\n  --bg: #f5f4f0; --card: #fff; --line: #e6e4df; --ink: #1a1a1a; --muted: #6f6f6f; --faint: #a8a8a8;\n  --blue: #2E86DE; --green: #1D9E75; --coral: #E8735A; --purple: #6C3FC5; --amber: #F0A500; --red: #d64545;\n  --lv1: #F0A500; --lv2: #1D9E75; --lv3: #2E86DE; --lv4: #6C3FC5;\n  --p1: #E8735A; --p2: #2E86DE; --p3: #1D9E75;\n}\nhtml { -webkit-text-size-adjust: 100%; }\nbody {\n  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;\n  background: var(--bg); color: var(--ink); line-height: 1.4; -webkit-tap-highlight-color: transparent;\n}\nbutton { font: inherit; color: inherit; cursor: pointer; }\ninput, select, textarea { font: inherit; color: inherit; }\na { color: var(--blue); }\n\n#app { max-width: 1120px; margin: 0 auto; padding: 18px 16px 60px; }\n.loading { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 60vh; color: var(--muted); }\n.spinner { width: 26px; height: 26px; border: 3px solid #e0e0e0; border-top-color: var(--blue); border-radius: 50%; animation: spin .7s linear infinite; }\n@keyframes spin { to { transform: rotate(360deg); } }\n\n/* ── banners ── */\n.banner { position: fixed; left: 0; right: 0; top: 0; z-index: 900; padding: 10px 16px; font-size: .88rem; text-align: center; display: none; }\n.banner.show { display: block; }\n.banner.err { background: var(--red); color: #fff; }\n.banner.warn { background: #fff3cd; color: #6b4e00; border-bottom: 1px solid #f0d78a; }\n.banner button { margin-left: 12px; padding: 4px 12px; border-radius: 8px; border: 1px solid currentColor; background: transparent; }\n.toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); background: #222; color: #fff; padding: 9px 16px; border-radius: 10px; font-size: .85rem; opacity: 0; transition: opacity .2s; pointer-events: none; z-index: 950; }\n.toast.show { opacity: 1; }\n\n/* ── header ── */\n.topbar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }\n.topbar .title { font-size: 1.35rem; font-weight: 700; letter-spacing: -.01em; }\n.topbar .sub { color: var(--muted); font-size: .85rem; }\n.topbar .grow { flex: 1; }\n.pill-btn { padding: 7px 13px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); font-size: .82rem; }\n.pill-btn:hover { background: #f8f6f2; }\n.pill-btn.primary { background: var(--blue); border-color: var(--blue); color: #fff; }\n.pill-btn.primary:disabled { opacity: .55; cursor: default; }\n.pill-btn.small { padding: 4px 10px; font-size: .76rem; }\n.avatar { width: 38px; height: 38px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: .78rem; flex-shrink: 0; }\n\n/* ── nav tabs ── */\n.tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }\n.tab { padding: 8px 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); font-size: .85rem; color: var(--muted); }\n.tab.active { background: var(--ink); color: #fff; border-color: var(--ink); }\n.subtabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 14px; }\n.subtab { padding: 6px 11px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); font-size: .8rem; }\n.subtab.active { background: var(--blue); border-color: var(--blue); color: #fff; }\n.subtab .tiny { display: block; font-size: .68rem; opacity: .75; }\n\n/* ── cards ── */\n.grid { display: grid; gap: 14px; }\n.grid.cols-2 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }\n.grid.cols-3 { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }\n.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.04); margin-bottom: 14px; }\n.card-head { padding: 11px 16px; font-size: .78rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #fff; background: var(--blue); display: flex; align-items: center; gap: 10px; }\n.card-head.green { background: var(--green); } .card-head.coral { background: var(--coral); } .card-head.purple { background: var(--purple); } .card-head.dark { background: #333; } .card-head.amber { background: var(--amber); }\n.card-head .right { margin-left: auto; font-weight: 500; text-transform: none; letter-spacing: 0; opacity: .9; }\n.card-body { padding: 16px; }\n.muted { color: var(--muted); } .faint { color: var(--faint); } .small { font-size: .8rem; } .tiny { font-size: .72rem; }\n.hint { font-size: .8rem; color: var(--muted); margin-top: 6px; }\n.empty { color: var(--faint); font-size: .85rem; padding: 10px 0; }\n\n/* ── checkpoint strip ── */\n.cp-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 14px; }\n.cp-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }\n.cp-card.done { border-color: var(--green); }\n.cp-card.next { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(46,134,222,.12); }\n.cp-card .cp-name { font-weight: 700; font-size: 1.05rem; }\n.cp-card .cp-status { font-size: .8rem; }\n.cp-card .cp-status.done { color: var(--green); font-weight: 600; }\n.cp-card button { align-self: flex-start; margin-top: 4px; }\n\n/* ── progress table ── */\n.tbl-wrap { overflow-x: auto; }\ntable.tbl { border-collapse: collapse; width: 100%; font-size: .85rem; }\ntable.tbl th, table.tbl td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: middle; white-space: nowrap; }\ntable.tbl th { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 600; background: #fafaf8; }\ntable.tbl td.c, table.tbl th.c { text-align: center; }\ntable.tbl tr.sport-row td { background: #f7f6f2; font-weight: 700; font-size: .78rem; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }\ntable.tbl td.skill { white-space: normal; min-width: 160px; }\ntable.tbl td.skill .cue { display: block; font-size: .72rem; color: var(--faint); }\n.chip { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 6px; border-radius: 8px; font-weight: 700; font-size: .8rem; color: #fff; background: #ddd; }\n.chip.lv1 { background: var(--lv1); } .chip.lv2 { background: var(--lv2); } .chip.lv3 { background: var(--lv3); } .chip.lv4 { background: var(--lv4); }\n.chip.t { background: #fff; border: 2px solid #ccc; color: #999; }\n.chip.t.lv1 { border-color: var(--lv1); color: var(--lv1); } .chip.t.lv2 { border-color: var(--lv2); color: var(--lv2); } .chip.t.lv3 { border-color: var(--lv3); color: var(--lv3); } .chip.t.lv4 { border-color: var(--lv4); color: var(--lv4); }\n.chip.none { background: transparent; color: var(--faint); font-weight: 400; }\n.chip-pair { display: inline-flex; gap: 4px; }\n.legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: .76rem; color: var(--muted); margin-top: 10px; align-items: center; }\n.legend .chip { min-width: 22px; height: 22px; font-size: .7rem; }\n\n/* ── participation dots ── */\n.dots { display: flex; flex-wrap: wrap; gap: 8px; }\n.dot { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: .7rem; font-weight: 700; border: 2px solid var(--line); color: var(--faint); background: #fff; }\n.dot.p1 { background: var(--p1); border-color: var(--p1); color: #fff; } .dot.p2 { background: var(--p2); border-color: var(--p2); color: #fff; } .dot.p3 { background: var(--p3); border-color: var(--p3); color: #fff; }\n.dot.cp { box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--amber); }\n\n/* ── test card ── */\n.test-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }\n.test-box { background: #f8f7f3; border-radius: 12px; padding: 12px; text-align: center; }\n.test-box .label { font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }\n.test-box .value { font-size: 1.7rem; font-weight: 700; margin: 2px 0; }\n.test-box .value.empty { color: var(--faint); }\n.test-box .unit { font-size: .72rem; color: var(--faint); }\n.delta { margin-top: 10px; text-align: center; font-size: .9rem; padding: 8px; border-radius: 10px; background: #f0f0ee; }\n.delta.good { background: #e3f6ee; color: #0a5c35; } .delta.bad { background: #fdecea; color: #8a2a1e; }\n\n/* ── reflections ── */\n.refl { border-left: 3px solid var(--line); padding: 4px 12px; margin-bottom: 12px; }\n.refl .cp { font-weight: 700; font-size: .85rem; }\n.refl .q { font-size: .72rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-top: 6px; }\n.refl .a { font-size: .9rem; white-space: pre-wrap; }\n.tag { display: inline-block; padding: 2px 9px; border-radius: 999px; background: #eef4fb; color: #1a4a7a; font-size: .74rem; font-weight: 600; }\n\n/* ── checkpoint form ── */\n.rate-row { display: grid; grid-template-columns: minmax(150px, 1.2fr) 2fr; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }\n.rate-row:last-child { border-bottom: 0; }\n.rate-row .name { font-weight: 600; font-size: .9rem; }\n.rate-row .cue { font-size: .74rem; color: var(--faint); }\n.seg { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }\n.seg button { padding: 8px 4px; border-radius: 9px; border: 1px solid var(--line); background: #fff; font-size: .74rem; line-height: 1.15; color: var(--muted); }\n.seg button b { display: block; font-size: .95rem; color: var(--ink); }\n.seg button.on { color: #fff; border-color: transparent; }\n.seg button.on b { color: #fff; }\n.seg button.on.lv1 { background: var(--lv1); } .seg button.on.lv2 { background: var(--lv2); } .seg button.on.lv3 { background: var(--lv3); } .seg button.on.lv4 { background: var(--lv4); }\n.field { margin-bottom: 14px; }\n.field label { display: block; font-weight: 600; font-size: .88rem; margin-bottom: 6px; }\n.field textarea, .field select, .field input[type=text] { width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }\n.field textarea { min-height: 80px; resize: vertical; }\n.focus-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; }\n.focus-btn { padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); background: #fff; text-align: left; font-size: .82rem; font-weight: 600; }\n.focus-btn span { display: block; font-size: .7rem; font-weight: 400; color: var(--faint); }\n.focus-btn.on { background: var(--blue); border-color: var(--blue); color: #fff; }\n.focus-btn.on span { color: rgba(255,255,255,.8); }\n.form-actions { display: flex; gap: 10px; align-items: center; margin-top: 8px; flex-wrap: wrap; }\n.form-actions .status { font-size: .8rem; color: var(--muted); }\n\n/* ── teacher register ── */\n.reg-row { display: grid; grid-template-columns: minmax(140px, 1fr) auto minmax(120px, 1.2fr); gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line); }\n.reg-row:last-child { border-bottom: 0; }\n.reg-row .name { font-weight: 600; font-size: .9rem; display: flex; align-items: center; gap: 8px; }\n.reg-row .avatar { width: 28px; height: 28px; font-size: .62rem; }\n.reg-row input { padding: 6px 9px; border: 1px solid var(--line); border-radius: 8px; font-size: .8rem; width: 100%; }\n.ppills { display: inline-flex; gap: 4px; }\n.ppills button { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: #fff; font-size: .76rem; color: var(--muted); }\n.ppills button.on { color: #fff; border-color: transparent; }\n.ppills button.on.p1 { background: var(--p1); } .ppills button.on.p2 { background: var(--p2); } .ppills button.on.p3 { background: var(--p3); }\n.toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }\n.toolbar .grow { flex: 1; }\n.savestate { font-size: .78rem; color: var(--muted); }\n.savestate.pending { color: var(--amber); } .savestate.failed { color: var(--red); font-weight: 600; }\n\n/* ── teacher rating grid ── */\ntable.tbl td.cell { text-align: center; }\n.cyc { min-width: 44px; height: 38px; border-radius: 9px; border: 1px solid var(--line); background: #fff; font-weight: 700; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; gap: 2px; }\n.cyc small { font-size: .62rem; font-weight: 400; color: var(--faint); }\n.cyc.lv1 { background: var(--lv1); color: #fff; border-color: transparent; } .cyc.lv2 { background: var(--lv2); color: #fff; border-color: transparent; } .cyc.lv3 { background: var(--lv3); color: #fff; border-color: transparent; } .cyc.lv4 { background: var(--lv4); color: #fff; border-color: transparent; }\n.cyc.lv1 small, .cyc.lv2 small, .cyc.lv3 small, .cyc.lv4 small { color: rgba(255,255,255,.85); }\n.cyc.st1 { background: var(--st1); color: #fff; border-color: transparent; } .cyc.st2 { background: var(--st2); color: #fff; border-color: transparent; } .cyc.st3 { background: var(--st3); color: #fff; border-color: transparent; }\n.cyc.st1 small, .cyc.st2 small, .cyc.st3 small { color: rgba(255,255,255,.85); }\n.chip.t.st1 { border-color: var(--st1); color: var(--st1); background: #fff; } .chip.t.st2 { border-color: var(--st2); color: var(--st2); background: #fff; } .chip.t.st3 { border-color: var(--st3); color: var(--st3); background: #fff; }\n.num-in { width: 84px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; text-align: center; }\n\n/* ── overview / grades ── */\n.score-row { display: inline-flex; gap: 2px; }\n.score-row button { width: 23px; height: 24px; border-radius: 6px; border: 1px solid var(--line); background: #fff; font-size: .7rem; color: var(--muted); padding: 0; }\ntable.tbl.ov th, table.tbl.ov td { padding: 7px 7px; }\ntable.tbl .sticky { position: sticky; left: 0; background: #fff; z-index: 1; box-shadow: 1px 0 0 var(--line); }\ntable.tbl th.sticky { background: #fafaf8; }\n.score-row button.on { color: #fff; border-color: transparent; background: var(--blue); }\n.score-row button.sug { border-color: var(--amber); border-style: dashed; }\n.sug-note { font-size: .68rem; color: var(--faint); display: block; }\n.grade-cell { white-space: nowrap; }\n.grade-line { display: flex; align-items: center; gap: 6px; padding: 2px 0; }\n.grade-code { font-size: .7rem; font-weight: 700; color: var(--muted); width: 26px; }\n.grade-comment { font-size: .8rem; }\n.student-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }\n.student-card { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; cursor: pointer; text-align: left; }\n.student-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.08); }\n.student-card .n { font-weight: 600; font-size: .88rem; }\n.student-card .s { font-size: .72rem; color: var(--muted); }\n\n/* ── unknown user ── */\n.notice { max-width: 560px; margin: 60px auto; background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 28px; }\n.notice h2 { font-size: 1.2rem; margin-bottom: 10px; }\n.notice p { margin-bottom: 10px; color: var(--muted); font-size: .92rem; }\n.notice code { background: #f3f2ee; padding: 2px 6px; border-radius: 6px; font-size: .85rem; }\n\n/* ── print: daily log sheets ── */\n.print-only { display: none; }\n.sheet { background: #fff; border: 1px solid var(--line); margin: 0 auto 18px; padding: 10mm 10mm; width: 210mm; min-height: 280mm; font-size: 10pt; color: #111; }\n.sheet .s-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 4px; margin-bottom: 5px; }\n.sheet .s-head .u { font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #555; }\n.sheet .s-head .n { font-size: 16pt; font-weight: 700; }\n.sheet .s-head .blank { display: inline-block; min-width: 70mm; border-bottom: 1px solid #111; }\n.sheet .s-cols { display: grid; grid-template-columns: 1.1fr 1fr; gap: 6mm; margin-bottom: 6px; }\n.sheet .s-box { border: 1px solid #999; border-radius: 4px; padding: 5px 7px; }\n.sheet .s-box h4 { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 3px; }\n.sheet .s-box ol, .sheet .s-box ul { padding-left: 16px; font-size: 9pt; line-height: 1.3; }\n.sheet .s-box li span { color: #666; }\n.sheet .s-box.two ol { columns: 2; }\n.sheet table { width: 100%; border-collapse: collapse; font-size: 9pt; }\n.sheet th, .sheet td { border: 1px solid #555; padding: 3px 4px; vertical-align: top; }\n.sheet th { background: #eee; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; text-align: left; }\n.sheet td.circ { white-space: nowrap; letter-spacing: .25em; text-align: center; font-weight: 600; }\n.sheet td.tall { height: 7.5mm; }\n.sheet tr.cp td { background: #fff7d6; }\n.sheet .s-foot { margin-top: 6px; font-size: 8.5pt; color: #444; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }\n@media print {\n  body { background: #fff; }\n  #app { max-width: none; padding: 0; }\n  .no-print, .banner, .toast, .topbar, .tabs, .subtabs, .seg-tabs { display: none !important; }\n  @page { size: A4; margin: 8mm; }\n  .sheet { border: 0; margin: 0; width: auto; min-height: 0; page-break-after: always; break-inside: avoid; overflow: hidden; padding: 2mm 2mm; font-size: 9.5pt; }\n  .sheet:last-child { page-break-after: auto; }\n}\n\n/* ── stages (Understanding / Intermediate / Automatic) ── */\n:root { --st1: #E8735A; --st2: #F0A500; --st3: #1D9E75; }\n.chip.st1 { background: var(--st1); } .chip.st2 { background: var(--st2); } .chip.st3 { background: var(--st3); }\n.stage-pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: .72rem; font-weight: 700; color: #fff; background: #ccc; white-space: nowrap; }\n.stage-pill.st0 { background: #e6e4df; color: var(--faint); font-weight: 500; }\n.stage-pill.st1 { background: var(--st1); } .stage-pill.st2 { background: var(--st2); } .stage-pill.st3 { background: var(--st3); }\n.self-note { display: block; font-size: .66rem; color: var(--faint); margin-top: 2px; }\ntable.tbl tr.focus-row td { background: #fff8e6; }\n.seg3 { display: inline-grid; grid-template-columns: repeat(3, auto); gap: 4px; }\n.seg3 button { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: #fff; font-size: .74rem; color: var(--muted); white-space: nowrap; }\n.seg3 button.on { color: #fff; border-color: transparent; }\n.seg3 button.on.st1 { background: var(--st1); } .seg3 button.on.st2 { background: var(--st2); } .seg3 button.on.st3 { background: var(--st3); }\n.goal { font-size: 1rem; line-height: 1.45; padding: 10px 14px; background: #fff8e6; border-left: 4px solid var(--amber); border-radius: 8px; margin-bottom: 12px; }\n.steps { display: flex; flex-direction: column; gap: 6px; }\n.step { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: #fff; text-align: left; }\n.step.done { background: #e9f7f0; border-color: var(--green); }\n.step.now { border-color: var(--blue); box-shadow: 0 0 0 2px rgba(46,134,222,.15); }\n.step-n { width: 26px; height: 26px; border-radius: 50%; background: #eee; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: .78rem; }\n.step.done .step-n { background: var(--green); color: #fff; }\n.step-name { font-weight: 600; font-size: .88rem; }\n.step-crit { font-size: .74rem; color: var(--muted); }\n.step-mark { font-size: .78rem; font-weight: 700; color: var(--green); }\n.step.now .step-mark { color: var(--blue); }\n.steps.pick .step { cursor: pointer; }\n.score-in { display: inline-flex; flex-direction: column; align-items: center; gap: 3px; }\n.num-in.short { width: 56px; padding: 6px 4px; }\n.sport-tabs { margin-top: -6px; }\n.sheet .s-goal { font-size: 9.5pt; padding: 4px 0 6px; border-bottom: 1px solid #ccc; margin-bottom: 6px; }\n.sheet .s-goal .blank { display: inline-block; min-width: 40mm; border-bottom: 1px solid #111; }\n.sheet .s-box ol.two { columns: 2; }\n.sheet table.s-drills { font-size: 8.5pt; margin-top: 2px; }\n.sheet table.s-drills th, .sheet table.s-drills td { padding: 2px 3px; }\n.sheet table.s-drills td.box { width: 9mm; height: 7mm; }\n.sheet .s-cols { grid-template-columns: 1.5fr 1fr; }\n\n/* ── teacher chrome ── */\n.seg-tabs { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; background: #fff; overflow: hidden; }\n.seg-tabs button { padding: 7px 13px; border: 0; background: transparent; font-size: .8rem; color: var(--muted); }\n.seg-tabs button.on { background: var(--ink); color: #fff; }\n.tabs.main .tab { padding: 10px 18px; font-size: .9rem; }\n.lesson-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }\n.lesson-title { font-size: 1.3rem; font-weight: 700; display: flex; align-items: center; gap: 10px; }\n.lesson-pills { display: inline-flex; gap: 4px; margin-left: auto; flex-wrap: wrap; }\n.lp { width: 32px; height: 32px; border-radius: 8px; border: 1px solid var(--line); background: #fff; font-size: .8rem; color: var(--muted); }\n.lp.done { border-color: var(--green); color: var(--green); }\n.lp.on { background: var(--blue); border-color: var(--blue); color: #fff; }\n.sheet tr.cp td.ttl::after { content: '★ check-in on the laptop'; font-weight: 700; font-size: 8pt; }\n/* ── teacher check-in ── */\n.num-in.by-student { color: var(--muted); border-style: dashed; }\ntable.tbl.tc th, table.tbl.tc td { padding: 6px 6px; }\ntable.tbl.tc tr.ok td { background: #f2fbf6; }\n.ok-btn { width: 34px; height: 34px; border-radius: 50%; border: 2px solid var(--line); background: #fff; color: var(--faint); font-weight: 700; }\n.ok-btn.on { background: var(--green); border-color: var(--green); color: #fff; }\n.ppills.tight button { padding: 5px 8px; min-width: 28px; }\n.ppills.st button.on.st1 { background: var(--st1); } .ppills.st button.on.st2 { background: var(--st2); } .ppills.st button.on.st3 { background: var(--st3); }\n.ppills + a.tiny { display: block; margin-top: 3px; color: var(--faint); }\ntr.detail td { background: #fafaf8; }\n.detail-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; font-size: .8rem; }\n.detail-item { display: inline-flex; align-items: center; gap: 6px; }\n.cyc.sm { min-width: 38px; height: 32px; font-size: .8rem; }\n.legend .grow { flex: 1; }\n.eng-row { display: flex; gap: 14px; flex-wrap: wrap; }\n.eng { display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }\n.eng-cp { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }\n.stage-pill.p1 { background: var(--p1); } .stage-pill.p2 { background: var(--p2); } .stage-pill.p3 { background: var(--p3); }\n/* ── game-play levels, extension, paper tweaks ── */\n:root { --gl1: #1D9E75; --gl2: #2E86DE; --gl3: #F0A500; --gl4: #E8735A; }\n.chip.gl1 { background: var(--gl1); } .chip.gl2 { background: var(--gl2); } .chip.gl3 { background: var(--gl3); } .chip.gl4 { background: var(--gl4); }\n.ppills.gp button { min-width: 44px; }\n.ppills.gp button.on.gl1 { background: var(--gl1); } .ppills.gp button.on.gl2 { background: var(--gl2); } .ppills.gp button.on.gl3 { background: var(--gl3); } .ppills.gp button.on.gl4 { background: var(--gl4); }\n.game-level { display: flex; align-items: baseline; gap: 14px; padding: 6px 0 10px; }\n.gl-big { font-size: 2.4rem; font-weight: 800; }\n.gl-sub { color: var(--muted); font-size: .9rem; }\n.ext, .ext-form { margin-top: 12px; padding: 12px 14px; border-radius: 10px; background: #eef4fb; border-left: 4px solid var(--blue); }\n.ext-title { font-weight: 700; font-size: .9rem; margin-bottom: 4px; }\n.ext-body { font-size: .88rem; color: var(--body, #333); }\n.ext-form .field { margin: 8px 0 0; }\n.ext-form input[type=text] { width: 100%; padding: 9px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }\n.sheet .s-row { margin-bottom: 3mm; }\n.sheet .s-cols.two { grid-template-columns: 1.7fr 1fr; gap: 3mm; margin-bottom: 3mm; }\n.sheet .s-cols.two .s-box, .sheet .s-row .s-box { padding: 4px 6px; }\n.sheet .s-cols.two h4, .sheet .s-row h4 { font-size: 8pt; margin-bottom: 2px; }\n.sheet table.s-tests td.box { height: 6mm; }\n.sheet table.s-drills { font-size: 7pt; table-layout: fixed; width: 100%; word-wrap: break-word; }\n.sheet .s-cols, .sheet .s-box { min-width: 0; overflow: hidden; }\n.sheet table.s-drills td.box { height: 5mm; }\n.sheet td.box.na { background: repeating-linear-gradient(45deg, #eee 0 2px, #fff 2px 5px); }\n.sheet td.ticks { white-space: nowrap; text-align: center; }\n.sheet .tick { display: inline-block; width: 6mm; height: 6mm; border: 1px solid #555; border-radius: 2px; font-size: 7pt; line-height: 6mm; color: #999; margin: 0 1px; }\n.sheet tr.cp td.ttl::after { content: ''; }\n.sheet tr.cp td { background: #e9f0fb; }\n@media (max-width: 640px) {\n  #app { padding: 12px 10px 50px; }\n  .rate-row { grid-template-columns: 1fr; gap: 6px; }\n  .reg-row { grid-template-columns: 1fr; gap: 6px; }\n  .test-grid { grid-template-columns: 1fr 1fr; }\n}\n</style>\n",
  App: "<script>\n(function () {\n'use strict';\n\n// ═══════════════════════ utils ═══════════════════════\nconst esc = s => String(s == null ? '' : s).replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]));\nconst $ = (sel, root) => (root || document).querySelector(sel);\nconst PALETTE = [\n  ['#d4f0e4', '#0a5c35'], ['#e8e4ff', '#4a3a9a'], ['#ddeeff', '#1a4a7a'], ['#ffe4d4', '#7a2a0a'],\n  ['#fff0d4', '#7a5a0a'], ['#fde4ee', '#8a2a5a'], ['#d4eeff', '#0a4a7a'], ['#e4ffd4', '#2a6a0a']\n];\nfunction initials(name) { const p = String(name).trim().split(/\\s+/); return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')).toUpperCase(); }\nfunction hashIdx(name) { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % PALETTE.length; }\nfunction avatar(name) { const c = PALETTE[hashIdx(name)]; return `<span class=\"avatar\" style=\"background:${c[0]};color:${c[1]}\">${esc(initials(name))}</span>`; }\nconst fmt = (v, d = 1) => (v === null || v === undefined || v === '' || isNaN(v)) ? '—' : Number(v).toFixed(d).replace(/\\.0+$/, '');\nconst num = v => { if (v === '' || v === null || v === undefined) return null; const n = parseFloat(v); return isNaN(n) ? null : n; };\nfunction toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }\nfunction banner(kind, html) { const b = $('#banner'); if (!html) { b.className = 'banner'; b.innerHTML = ''; return; } b.className = 'banner show ' + kind; b.innerHTML = html; }\n\n// ═══════════════════════ server bridge ═══════════════════════\nfunction call(fn, ...args) {\n  return new Promise((resolve, reject) => {\n    if (!window.google || !google.script || !google.script.run) return reject(new Error('Not running inside the Apps Script web app'));\n    google.script.run.withSuccessHandler(resolve).withFailureHandler(e => reject(new Error(e && e.message ? e.message : String(e))))[fn](...args);\n  });\n}\n\n// ═══════════════════════ outbox ═══════════════════════\n// Every write goes through here and is kept in localStorage (tagged with the\n// login that created it) until the server confirms, so a wifi drop or reload\n// never loses work.\nconst OUTBOX_KEY = 'mfs_outbox_v1';\nconst Outbox = {\n  items: [], draining: false, failed: false, lastError: '', waiters: {},\n  load() { try { this.items = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch (e) { this.items = []; } },\n  persist() { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(this.items)); } catch (e) {} },\n  mine() { return this.items.filter(i => i.owner === S.id.email); },\n  add(fn, payload, label) {\n    const id = String(Date.now()) + Math.random().toString(36).slice(2, 7);\n    this.items.push({ id, fn, payload, label, owner: S.id.email, ts: Date.now() });\n    this.persist();\n    const p = new Promise((res, rej) => { this.waiters[id] = { res, rej }; });\n    this.drain(); updateSaveState();\n    return p;\n  },\n  async drain() {\n    if (this.draining) return;\n    this.draining = true;\n    let item, sentOrphan = false;\n    while ((item = this.mine()[0])) {\n      try {\n        await call(item.fn, item.payload);\n        this.items = this.items.filter(i => i.id !== item.id); this.persist(); this.failed = false;\n        if (this.waiters[item.id]) { this.waiters[item.id].res(); delete this.waiters[item.id]; } else sentOrphan = true;\n      } catch (e) {\n        this.failed = true; this.lastError = e.message;\n        if (/Teachers only|not on roster|Unknown checkpoint|Missing/i.test(e.message)) {\n          this.items = this.items.filter(i => i.id !== item.id); this.persist();\n          if (this.waiters[item.id]) { this.waiters[item.id].rej(e); delete this.waiters[item.id]; }\n          continue;\n        }\n        break;\n      }\n      updateSaveState();\n    }\n    this.draining = false; updateSaveState();\n    if (sentOrphan) refreshAfterOutbox();\n  },\n  retry() { this.failed = false; updateSaveState(); this.drain(); }\n};\nasync function refreshAfterOutbox() {\n  try {\n    if (studentMode()) { S.me = await call('getStudent', S.me.section, S.me.student); if (S.view === 'dash') render(); toast('Earlier changes sent ✓'); }\n    else if (S.T.section) { S.T.data = await call('getSectionData', S.T.section); S.T.overview = null; if (['register', 'checkins', 'students'].indexOf(S.T.tab) !== -1) render(); toast('Earlier changes sent ✓'); }\n  } catch (e) {}\n}\n// Coalesces rapid teacher taps into one request per (section, checkpoint/lesson).\n// `scores` and `agility` sub-objects are merged rather than replaced.\nconst Pending = {\n  map: {}, timer: null,\n  put(key, fn, base, entryKey, entry) {\n    const p = this.map[key] || (this.map[key] = { fn, base, entries: {} });\n    const cur = p.entries[entryKey] || (p.entries[entryKey] = {});\n    Object.keys(entry).forEach(k => {\n      if (k === 'scores' && entry[k] && typeof entry[k] === 'object') cur[k] = Object.assign(cur[k] || {}, entry[k]);\n      else cur[k] = entry[k];\n    });\n    clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 900); updateSaveState();\n  },\n  count() { return Object.keys(this.map).length; },\n  flush() {\n    clearTimeout(this.timer);\n    const m = this.map; this.map = {};\n    Object.keys(m).forEach(key => { const p = m[key]; Outbox.add(p.fn, Object.assign({}, p.base, { entries: Object.values(p.entries) }), key).catch(() => {}); });\n  }\n};\nwindow.addEventListener('beforeunload', () => Pending.flush());\nfunction updateSaveState() {\n  const el = $('#savestate'); if (!el) return;\n  const n = Outbox.mine().length + Pending.count();\n  if (Outbox.failed) { el.className = 'savestate failed'; el.innerHTML = `${n} change${n === 1 ? '' : 's'} not saved · <a href=\"#\" data-act=\"retry\">retry</a>`; }\n  else if (n > 0) { el.className = 'savestate pending'; el.textContent = 'Saving…'; }\n  else { el.className = 'savestate'; el.textContent = 'All saved ✓'; }\n  if (Outbox.failed) banner('warn', `Could not reach the server — your last change is kept on this device and will be re-sent. <span class=\"tiny\">${esc(Outbox.lastError)}</span><button data-act=\"retry\">Retry now</button>`);\n  else banner();\n}\n\n// ═══════════════════════ state & helpers ═══════════════════════\nconst S = {\n  cfg: null, id: null, me: null, view: 'dash', cp: null, form: null, testAs: false,\n  T: { section: '', sport: '', tab: 'checkins', lesson: null, cpName: '', data: null, overview: null, viewing: null, printMode: 'all', expanded: {} }\n};\nconst CPS = () => S.cfg.checkpoints;\nconst studentMode = () => S.id.role === 'student' || S.testAs;\nconst skillsOf = sport => S.cfg.skills[sport] || [];\nconst skillDef = (sport, name) => skillsOf(sport).find(s => s.skill === name) || null;\nfunction stageOf(score) { if (score === null || score === undefined || score === '') return 0; if (score <= S.cfg.stageBands[0]) return 1; if (score <= S.cfg.stageBands[1]) return 2; return 3; }\nconst stageName = n => n ? S.cfg.stageLabels[n - 1] : '';\nfunction cpMode(cp) { const i = CPS().findIndex(c => c.name === cp.name); return i === 0 ? 'early' : (i === CPS().length - 1 ? 'end' : 'middle'); }\nfunction testRow(me, cp, skill) { return me.tests.find(x => x.checkpoint === cp && x.skill === skill && x.score !== null) || null; }\nfunction testScore(me, cp, skill) { const t = testRow(me, cp, skill); return t ? t.score : null; }\nfunction latestScore(me, skill, uptoCp) { let v = null; for (const c of CPS()) { const s = testScore(me, c.name, skill); if (s !== null) v = s; if (uptoCp && c.name === uptoCp) break; } return v; }\nfunction checkinOf(me, cp) { return me.checkins.find(c => c.checkpoint === cp) || null; }\nfunction cpDone(me, cp) { const c = checkinOf(me, cp.name); return !!(c && (c.focusSkill || c.wentWell || c.nextGoal || c.drillStep !== null)) || me.tests.some(t => t.checkpoint === cp.name && t.score !== null); }\nfunction nextCheckpoint(me) { return CPS().find(cp => !cpDone(me, cp)) || null; }\nfunction currentFocus(me) { let f = '', step = null, goal = '', ext = '', extDrill = ''; CPS().forEach(c => { const x = checkinOf(me, c.name); if (!x) return; if (x.focusSkill) f = x.focusSkill; if (x.goal) goal = x.goal; if (x.drillStep !== null) step = x.drillStep; if (x.extensionSkill) { ext = x.extensionSkill; extDrill = x.extensionDrill || ''; } }); return { skill: f, step, goal, extension: ext, extensionDrill: extDrill }; }\nfunction gameLabel(n) { return n ? S.cfg.gameLevels[n - 1] : ''; }\nfunction outcomeRow(me, cp, outcome) { return (me.outcomes || []).find(x => x.checkpoint === cp && x.outcome === outcome) || null; }\nfunction oChip(v, teacher) { return v ? `<span class=\"chip ${teacher ? 't' : ''} st${v}\" title=\"${esc(S.cfg.outcomeLabels[v - 1])}${teacher ? ' (teacher)' : ''}\">${v}</span>` : `<span class=\"chip none\">·</span>`; }\nfunction stageChip(score, extra) { const st = stageOf(score); return st ? `<span class=\"chip st${st} ${extra || ''}\" title=\"${esc(stageName(st))}\">${fmt(score, 0)}</span>` : `<span class=\"chip none\">·</span>`; }\nfunction bandsLegend() { const cfg = S.cfg; return cfg.stageLabels.map((l, i) => `<span><span class=\"chip st${i + 1}\">${i === 0 ? '0–' + cfg.stageBands[0] : i === 1 ? (cfg.stageBands[0] + 1) + '–' + cfg.stageBands[1] : (cfg.stageBands[1] + 1) + '–' + cfg.scoreMax}</span> ${esc(l)}</span>`).join(''); }\nfunction draftGoal(me, skill, cp, scoreOverride) {\n  const s = scoreOverride !== undefined ? scoreOverride : latestScore(me, skill, cp); const st = stageOf(s); const max = S.cfg.scoreMax;\n  const nextSt = Math.min(3, (st || 1) + 1);\n  const target = nextSt === 2 ? S.cfg.stageBands[0] + 1 : S.cfg.stageBands[1] + 1;\n  const def = skillDef(me.sport, skill); const steps = def && def.drills.length ? '1 to ' + Math.min(def.drills.length, 3) : '1 to 3';\n  const nextCp = CPS()[CPS().findIndex(c => c.name === cp) + 1]; const cpName = nextCp ? nextCp.name : 'End';\n  return (S.cfg.goalTemplate || '')\n    .replace('{skill}', skill.toLowerCase()).replace('{stage}', stageName(st || 1)).replace('{score}', s === null ? '?' : fmt(s, 0))\n    .replace('{nextStage}', stageName(nextSt)).replace('{target}', target).replace(/\\{max\\}/g, max).replace('{checkpoint}', cpName).replace('{steps}', steps);\n}\n\n// ═══════════════════════ boot ═══════════════════════\nasync function boot() {\n  try {\n    const b = await call('bootstrap');\n    S.cfg = b.config; S.id = b.identity;\n    Outbox.load();\n    if (S.id.role === 'student') S.me = b.student;\n    if (S.id.role === 'teacher') {\n      S.T.section = (URL_SECTION && S.cfg.sections.indexOf(URL_SECTION) !== -1) ? URL_SECTION : (S.cfg.sections[0] || '');\n      if (URL_VIEW) S.T.tab = URL_VIEW;\n      S.T.sport = S.id.sport && S.cfg.sports.indexOf(S.id.sport) !== -1 ? S.id.sport : '';\n    }\n    render(); Outbox.drain();\n    if (S.id.role === 'teacher' && S.T.section) loadSection(S.T.section);\n  } catch (e) {\n    $('#app').innerHTML = `<div class=\"notice\"><h2>Could not load</h2><p>${esc(e.message)}</p><p><button class=\"pill-btn primary\" data-act=\"reload\">Try again</button></p></div>`;\n  }\n}\nfunction render() {\n  const app = $('#app');\n  if (S.id.role === 'unknown') app.innerHTML = renderUnknown();\n  else if (studentMode()) app.innerHTML = S.view === 'cpform' ? renderCpForm(S.me, S.cp, false) : renderStudentPage(S.me, false);\n  else app.innerHTML = renderTeacher();\n  updateSaveState(); window.scrollTo(0, 0);\n}\nfunction renderUnknown() {\n  const email = S.id.email;\n  return `<div class=\"notice\">\n    <h2>${email ? 'You are not on the roster yet' : 'Please sign in with your school Google account'}</h2>\n    ${email ? `<p>You are signed in as <code>${esc(email)}</code>, but that address is not on any class list for <b>${esc(S.cfg.unitName)}</b>.</p><p>Ask your teacher to add this exact email to the <b>Roster</b> tab, then reload this page.</p>`\n            : `<p>This page could not see who you are. Open it in a browser where you are signed in to your school account (not a private window), or ask your teacher to check that the app is shared with \"Anyone within the school\".</p>`}\n    <p><button class=\"pill-btn primary\" data-act=\"reload\">Reload</button></p></div>`;\n}\n\n// ═══════════════════════ student dashboard ═══════════════════════\nfunction renderStudentPage(me, asTeacher) {\n  const cfg = S.cfg, cps = CPS(), next = nextCheckpoint(me), skills = skillsOf(me.sport), focus = currentFocus(me);\n  const head = `<div class=\"topbar\">\n      ${asTeacher ? `<button class=\"pill-btn\" data-act=\"t-back\">&larr; Students</button>` : ''}\n      ${S.testAs ? `<button class=\"pill-btn\" data-act=\"test-as-off\">&larr; Back to teacher view</button>` : ''}\n      ${avatar(me.student)}\n      <div><div class=\"title\">${esc(me.student)}</div><div class=\"sub\">${esc(cfg.unitName)} &middot; ${esc(me.sport)} &middot; ${esc(me.section)}${asTeacher ? ' &middot; <b>teacher view</b>' : ''}</div></div>\n      <div class=\"grow\"></div><div class=\"savestate\" id=\"savestate\"></div></div>`;\n\n  const strip = `<div class=\"cp-strip\">${cps.map(cp => { const done = cpDone(me, cp), isNext = next && next.name === cp.name; const ci = checkinOf(me, cp.name); return `<div class=\"cp-card ${done ? 'done' : ''} ${isNext ? 'next' : ''}\">\n      <div class=\"cp-name\">${esc(cp.name)} check-in</div>\n      <div class=\"small muted\">lesson ${cp.lesson}</div>\n      <div class=\"cp-status ${done ? 'done' : 'muted'}\">${done ? (ci && ci.confirmed ? '✓ Done · teacher confirmed' : '✓ Done') : (isNext ? 'Up next' : 'Not yet')}</div>\n      <button class=\"pill-btn ${isNext && !done ? 'primary' : ''} small\" data-act=\"open-cp\" data-cp=\"${esc(cp.name)}\">${done ? 'Edit' : 'Enter now'}</button></div>`; }).join('')}</div>`;\n\n  let focusCard;\n  if (focus.skill) {\n    const def = skillDef(me.sport, focus.skill); const step = focus.step || 0;\n    focusCard = `<div class=\"card\"><div class=\"card-head amber\">My focus skill <span class=\"right\">${esc(focus.skill)}</span></div><div class=\"card-body\">\n      <div class=\"goal\">${focus.goal ? esc(focus.goal) : '<span class=\"faint\">No goal written yet.</span>'}</div>\n      ${def && def.drills.length ? `<div class=\"steps\">${def.drills.map(d => `<div class=\"step ${d.step <= step ? 'done' : (d.step === step + 1 ? 'now' : '')}\"><span class=\"step-n\">${d.step}</span><div><div class=\"step-name\">${esc(d.drill)}</div><div class=\"step-crit\">${esc(d.criteria)}</div></div><span class=\"step-mark\">${d.step <= step ? '✓' : (d.step === step + 1 ? 'now' : '')}</span></div>`).join('')}</div>` : ''}\n      ${focus.extension ? `<div class=\"ext\"><div class=\"ext-title\">Extension · ${esc(focus.extension)}</div><div class=\"ext-body\">${esc(focus.extensionDrill || 'Drill chosen with your teacher.')}</div></div>` : (def && def.drills.length && step >= def.drills.length ? `<div class=\"hint\">All steps signed off. Choose an extension skill at your next check-in.</div>` : '')}\n    </div></div>`;\n  } else {\n    focusCard = `<div class=\"card\"><div class=\"card-head amber\">My focus skill</div><div class=\"card-body\"><div class=\"empty\">Chosen at the <b>${esc(cps[0] ? cps[0].name : 'Early')}</b> check-in.</div></div></div>`;\n  }\n\n  const skillsCard = `<div class=\"card\"><div class=\"card-head\">My ${esc(me.sport)} skills <span class=\"right\">out of ${cfg.scoreMax}</span></div><div class=\"card-body\"><div class=\"tbl-wrap\">\n    <table class=\"tbl\"><thead><tr><th>Skill</th>${cps.map(cp => `<th class=\"c\">${esc(cp.name)}</th>`).join('')}<th>Stage now</th></tr></thead><tbody>\n    ${skills.map(s => { const last = latestScore(me, s.skill); const st = stageOf(last); const isF = s.skill === focus.skill; return `<tr class=\"${isF ? 'focus-row' : ''}\"><td class=\"skill\">${isF ? '★ ' : ''}${esc(s.skill)}<span class=\"cue\">${esc(s.test)}</span></td>\n      ${cps.map(cp => { const v = testScore(me, cp.name, s.skill); const ci = checkinOf(me, cp.name); const self = ci && ci.selfStages && ci.selfStages[s.skill]; return `<td class=\"c\">${stageChip(v)}${self ? `<span class=\"self-note\">me: ${esc(stageName(self))}</span>` : ''}</td>`; }).join('')}\n      <td>${st ? `<span class=\"stage-pill st${st}\">${esc(stageName(st))}</span>` : '<span class=\"faint\">not tested</span>'}</td></tr>`; }).join('')}\n    </tbody></table></div><div class=\"legend\">${bandsLegend()}</div></div></div>`;\n\n  let part;\n  if (cfg.dailyRegister) {\n    const attended = me.register.filter(r => r.participation).length;\n    part = `<div class=\"card\"><div class=\"card-head green\">Participation <span class=\"right\">${attended} of ${me.lessonsRun || 0}</span></div><div class=\"card-body\">\n      <div class=\"dots\">${cfg.lessons.map(l => { const r = me.register.find(x => x.lesson === l.number); const lvl = r && r.participation; const isCp = cps.some(c => c.lesson === l.number);\n        return `<div class=\"dot ${lvl ? 'p' + lvl : ''} ${isCp ? 'cp' : ''}\" title=\"Lesson ${l.number}${lvl ? ' · ' + esc(cfg.participationLabels[lvl - 1]) : ''}${r && r.note ? ' · ' + esc(r.note) : ''}\">L${l.number}</div>`; }).join('')}</div>\n      <div class=\"legend\">${cfg.participationLabels.map((l, i) => `<span><span class=\"dot p${i + 1}\" style=\"display:inline-flex;width:18px;height:18px;border-radius:5px\"></span> ${esc(l)}</span>`).join('')}</div></div></div>`;\n  } else {\n    part = `<div class=\"card\"><div class=\"card-head green\">Engagement <span class=\"right\">teacher rated</span></div><div class=\"card-body\">\n      <div class=\"eng-row\">${cps.map(cp => { const ci = checkinOf(me, cp.name); const v = ci && ci.engagement; return `<div class=\"eng\"><div class=\"eng-cp\">${esc(cp.name)}</div>${v ? `<span class=\"stage-pill p${v}\">${esc(cfg.participationLabels[v - 1])}</span>` : '<span class=\"faint\">—</span>'}</div>`; }).join('')}</div></div></div>`;\n  }\n\n  const endCp = cps[cps.length - 1]; const endCi = endCp ? checkinOf(me, endCp.name) : null; const gp = endCi && endCi.gamePlay;\n  const gameCard = `<div class=\"card\"><div class=\"card-head purple\">Game-play assessment <span class=\"right\">teacher, last two lessons</span></div><div class=\"card-body\">\n    ${gp ? `<div class=\"game-level\"><span class=\"gl-big\">${esc(gameLabel(gp))}</span><span class=\"gl-sub\">${esc(focus.skill || 'your focus skill')} in game play</span></div>` : `<div class=\"empty\">Your teacher watches your ${focus.skill ? esc(focus.skill) : 'focus skill'} in game play during the last two lessons.</div>`}\n    <div class=\"legend\">${cfg.gameLevels.map((l, i) => `<span><span class=\"chip gl${i + 1}\">${esc(l)}</span></span>`).join('')}</div></div></div>`;\n\n  let outcomesCard = '';\n  if (cfg.outcomes.length) {\n    outcomesCard = `<div class=\"card\"><div class=\"card-head dark\">Personal skills <span class=\"right\">me · teacher</span></div><div class=\"card-body\"><div class=\"tbl-wrap\">\n      <table class=\"tbl\"><thead><tr><th></th>${cps.map(cp => `<th class=\"c\">${esc(cp.name)}</th>`).join('')}</tr></thead><tbody>\n      <tr><td class=\"skill\"><b>Overall</b></td>${cps.map(cp => { const ci = checkinOf(me, cp.name); return `<td class=\"c\">${oChip(ci && ci.personal, true)}</td>`; }).join('')}</tr>\n      ${cfg.outcomes.map(o => `<tr><td class=\"skill\">${esc(o.outcome)}<span class=\"cue\">${esc(o.looksLike)}</span></td>${cps.map(cp => { const r = outcomeRow(me, cp.name, o.outcome); return `<td class=\"c\"><span class=\"chip-pair\">${oChip(r && r.self, false)}${oChip(r && r.teacher, true)}</span></td>`; }).join('')}</tr>`).join('')}\n      </tbody></table></div><div class=\"legend\">${cfg.outcomeLabels.map((l, i) => `<span><span class=\"chip st${i + 1}\">${i + 1}</span> ${esc(l)}</span>`).join('')}<span><span class=\"chip t st3\">3</span> teacher</span></div></div></div>`;\n  }\n\n  const refl = `<div class=\"card\"><div class=\"card-head coral\">My check-ins</div><div class=\"card-body\">\n    ${cps.filter(cp => checkinOf(me, cp.name)).length === 0 ? `<div class=\"empty\">Nothing entered yet.</div>` :\n      cps.map(cp => { const c = checkinOf(me, cp.name); if (!c) return ''; const mode = cpMode(cp); return `<div class=\"refl\"><div class=\"cp\">${esc(cp.name)} ${c.focusSkill ? `<span class=\"tag\">focus: ${esc(c.focusSkill)}</span>` : ''} ${c.drillStep ? `<span class=\"tag\">drill step ${c.drillStep}</span>` : ''} ${c.extensionSkill ? `<span class=\"tag\">extension: ${esc(c.extensionSkill)}</span>` : ''}</div>\n        ${c.goal && mode === 'early' ? `<div class=\"q\">Goal</div><div class=\"a\">${esc(c.goal)}</div>` : ''}\n        ${c.wentWell ? `<div class=\"q\">${esc(mode === 'early' ? cfg.earlyPrompt : cfg.reflectionPrompts[0])}</div><div class=\"a\">${esc(c.wentWell)}</div>` : ''}\n        ${c.nextGoal ? `<div class=\"q\">${esc(cfg.reflectionPrompts[1])}</div><div class=\"a\">${esc(c.nextGoal)}</div>` : ''}</div>`; }).join('')}</div></div>`;\n\n  let grades = '';\n  if ((asTeacher || cfg.showGradesToStudents) && me.grades.some(g => g.score)) {\n    grades = `<div class=\"card\"><div class=\"card-head dark\">Grades</div><div class=\"card-body\"><div class=\"tbl-wrap\"><table class=\"tbl\"><thead><tr><th>Criterion</th><th class=\"c\">Score</th><th>Comment</th></tr></thead><tbody>\n      ${cfg.criteria.map(c => { const g = me.grades.find(x => x.criterion === c.code); if (!g || !g.score) return ''; return `<tr><td><b>${esc(c.code)}</b> ${esc(c.name)}</td><td class=\"c\"><span class=\"chip st2\">${g.score}</span></td><td style=\"white-space:normal\">${esc(g.comment)}</td></tr>`; }).join('')}</tbody></table></div></div></div>`;\n  }\n  return head + strip + focusCard + skillsCard + `<div class=\"grid cols-2\">${part}${gameCard}</div>` + outcomesCard + refl + grades;\n}\n\n// ═══════════════════════ check-in form ═══════════════════════\n// Early: student types all test scores (teacher confirms), picks focus skill, goal, one question.\n// Middle: student types focus-skill retest, drill step, self-stage on the focus skill, one reflection.\n// End: drill step, self-stage on the focus skill, personal skills, two reflections.\n// Finished the whole progression? An extension skill + drill can be chosen at Middle or End.\n// The End retest and the game-play level are teacher-recorded (nothing self-reported feeds S1).\nfunction openCpForm(me, cpName) {\n  const cp = CPS().find(c => c.name === cpName); if (!cp) return;\n  const mode = cpMode(cp);\n  const existing = checkinOf(me, cp.name) || {};\n  const prev = currentFocus(me);\n  const scores = {};\n  skillsOf(me.sport).forEach(s => { const t = testRow(me, cp.name, s.skill); scores[s.skill] = t ? t.score : ''; });\n  S.cp = cp;\n  S.form = {\n    mode, scores,\n    extensionSkill: existing.extensionSkill || prev.extension || '', extensionDrill: existing.extensionDrill || prev.extensionDrill || '',\n    focusSkill: existing.focusSkill || prev.skill || '',\n    goal: existing.goal || prev.goal || '', goalTouched: !!(existing.goal || prev.goal),\n    drillStep: existing.drillStep !== null && existing.drillStep !== undefined ? existing.drillStep : (prev.step || 0),\n    selfStages: Object.assign({}, existing.selfStages || {}),\n    selfOutcomes: (() => { const o = {}; S.cfg.outcomes.forEach(x => { const r = outcomeRow(me, cp.name, x.outcome); if (r && r.self) o[x.outcome] = r.self; }); return o; })(),\n    wentWell: existing.wentWell || '', nextGoal: existing.nextGoal || '', sending: false, showFocusPick: false\n  };\n  if (mode === 'early' && S.form.focusSkill && !S.form.goal) S.form.goal = draftGoal(me, S.form.focusSkill, cp.name, num(scores[S.form.focusSkill]));\n  if (studentMode()) S.view = 'cpform'; else S.T.tab = 'cpform';\n  render();\n}\nfunction renderCpForm(me, cp, asTeacher) {\n  const cfg = S.cfg, f = S.form, skills = skillsOf(me.sport), mode = f.mode;\n  const def = f.focusSkill ? skillDef(me.sport, f.focusSkill) : null;\n  const intro = { early: 'From your paper log: type your test scores, then pick <b>one</b> skill to focus on and confirm your goal.',\n                  middle: 'From your paper log: type your focus-skill retest score and the drill step you have reached, then reflect.',\n                  end: 'Your teacher records your final retest and watches your focus skill in game play. Tap the drill step you reached, place yourself honestly, and reflect on the unit.' }[mode];\n  const head = `<div class=\"topbar\"><button class=\"pill-btn\" data-act=\"cp-cancel\">&larr; Back</button>\n      <div><div class=\"title\">${esc(cp.name)} check-in</div><div class=\"sub\">${esc(me.student)} &middot; ${esc(me.sport)}${asTeacher ? ' &middot; <b>entering as teacher</b>' : ''}</div></div>\n      <div class=\"grow\"></div><div class=\"savestate\" id=\"savestate\"></div></div>\n    <div class=\"card\"><div class=\"card-body small muted\">${intro}</div></div>`;\n  let n = 0; const sec = (title, color) => `<div class=\"card-head ${color || ''}\">${++n} · ${title}</div>`;\n  const lockedBy = sk => { const t = testRow(me, cp.name, sk); return !!(t && t.by === 'teacher' && !asTeacher); };\n  const prevCp = CPS()[CPS().findIndex(c => c.name === cp.name) - 1];\n\n  // 1 · scores\n  let scoresCard = '';\n  const scoreSkills = mode === 'early' ? skills : (mode === 'middle' ? skills.filter(s => s.skill === f.focusSkill) : []);\n  if (scoreSkills.length) {\n    scoresCard = `<div class=\"card\">${sec(mode === 'middle' ? 'My retest' : 'My test scores', '')}<div class=\"card-body\">\n      <div class=\"tbl-wrap\"><table class=\"tbl\"><thead><tr><th>Skill</th><th class=\"c\">Score / ${cfg.scoreMax}</th><th>Stage</th>${mode !== 'early' ? '<th>Where do <em>you</em> think you are?</th>' : ''}</tr></thead><tbody>\n      ${scoreSkills.map(s => { const v = f.scores[s.skill]; const st = stageOf(num(v)); const self = f.selfStages[s.skill] || 0; const prevV = prevCp ? latestScore(me, s.skill, prevCp.name) : null; const locked = lockedBy(s.skill);\n        return `<tr><td class=\"skill\">${esc(s.skill)}<span class=\"cue\">${esc(s.test)}${prevV !== null ? ` · last time ${fmt(prevV, 0)}` : ''}${locked ? ' · entered by your teacher' : ''}</span></td>\n        <td class=\"c\"><input class=\"num-in short\" type=\"number\" min=\"0\" max=\"${cfg.scoreMax}\" step=\"1\" inputmode=\"numeric\" value=\"${v === '' || v === null ? '' : v}\" data-in=\"score\" data-skill=\"${esc(s.skill)}\" ${locked ? 'disabled' : ''}></td>\n        <td><span class=\"stage-pill st${st}\" data-stage-for=\"${esc(s.skill)}\">${st ? esc(stageName(st)) : '–'}</span></td>\n        ${mode !== 'early' ? `<td><div class=\"seg3\">${[1, 2, 3].map(k => `<button type=\"button\" class=\"${self === k ? 'on st' + k : ''}\" data-act=\"self\" data-skill=\"${esc(s.skill)}\" data-n=\"${k}\">${esc(cfg.stageLabels[k - 1])}</button>`).join('')}</div></td>` : ''}</tr>`; }).join('')}\n      </tbody></table></div><div class=\"legend\">${bandsLegend()}</div></div></div>`;\n  }\n  // End: self-placement on the focus skill only (the score itself is teacher-recorded)\n  if (mode === 'end' && def) {\n    const self = f.selfStages[f.focusSkill] || 0; const last = latestScore(me, f.focusSkill);\n    scoresCard = `<div class=\"card\">${sec('Where are you now with ' + esc(f.focusSkill) + '?', '')}<div class=\"card-body\">\n      <div class=\"rate-row\"><div><div class=\"name\">${esc(f.focusSkill)}</div><div class=\"cue\">${last !== null ? 'last recorded score ' + fmt(last, 0) + '/' + cfg.scoreMax : 'your teacher will record your final retest'}</div></div>\n      <div class=\"seg3\">${[1, 2, 3].map(k => `<button type=\"button\" class=\"${self === k ? 'on st' + k : ''}\" data-act=\"self\" data-skill=\"${esc(f.focusSkill)}\" data-n=\"${k}\">${esc(cfg.stageLabels[k - 1])}</button>`).join('')}</div></div>\n      <div class=\"legend\">${bandsLegend()}</div></div></div>`;\n  }\n\n  // 2 · focus skill\n  let focusCard = '';\n  if (mode === 'early') {\n    focusCard = `<div class=\"card\">${sec('My focus skill', 'amber')}<div class=\"card-body\">\n      <div class=\"focus-grid\">${skills.map(s => { const v = num(f.scores[s.skill]); const st = stageOf(v); return `<button type=\"button\" class=\"focus-btn ${f.focusSkill === s.skill ? 'on' : ''}\" data-act=\"focus-skill\" data-v=\"${esc(s.skill)}\">${esc(s.skill)}<span>${st ? esc(stageName(st)) + ' · ' + fmt(v, 0) + '/' + cfg.scoreMax : 'no score yet'}${st === 1 ? ' · recommended' : ''}</span></button>`; }).join('')}</div>\n      ${def ? `<div class=\"field\" style=\"margin-top:14px\"><label>My goal</label><textarea data-in=\"goal\" maxlength=\"400\">${esc(f.goal)}</textarea><div class=\"hint\">Drafted from your score — change it so it sounds like you. <a href=\"#\" data-act=\"goal-redraft\">Re-draft</a></div></div>` : '<div class=\"hint\">Pick a skill above.</div>'}\n    </div></div>`;\n  } else if (def) {\n    focusCard = `<div class=\"card\">${sec('Drill step reached · ' + esc(f.focusSkill), 'amber')}<div class=\"card-body\">\n      <div class=\"steps pick\">${def.drills.map(d => `<button type=\"button\" class=\"step ${f.drillStep >= d.step ? 'done' : ''}\" data-act=\"drill-step\" data-n=\"${d.step}\"><span class=\"step-n\">${d.step}</span><div><div class=\"step-name\">${esc(d.drill)}</div><div class=\"step-crit\">${esc(d.criteria)}</div></div><span class=\"step-mark\">${f.drillStep >= d.step ? '✓' : ''}</span></button>`).join('')}</div>\n      <div class=\"hint\">Tap the last step your teacher signed off on your paper log. <a href=\"#\" data-act=\"drill-step\" data-n=\"0\">Clear</a> &middot; <a href=\"#\" data-act=\"toggle-focus-pick\">Change focus skill</a></div>\n      ${f.showFocusPick ? `<div class=\"focus-grid\" style=\"margin-top:10px\">${skills.map(s => `<button type=\"button\" class=\"focus-btn ${f.focusSkill === s.skill ? 'on' : ''}\" data-act=\"focus-skill\" data-v=\"${esc(s.skill)}\">${esc(s.skill)}</button>`).join('')}</div>` : ''}\n      ${f.drillStep >= def.drills.length ? `<div class=\"ext-form\"><div class=\"ext-title\">All steps signed off — choose an extension</div>\n        <div class=\"field\"><label>New skill I will work on</label><input type=\"text\" maxlength=\"80\" placeholder=\"e.g. Backhand smash\" value=\"${esc(f.extensionSkill)}\" data-in=\"extensionSkill\"></div>\n        <div class=\"field\"><label>The drill I will use (agree it with your teacher)</label><textarea data-in=\"extensionDrill\" maxlength=\"300\" placeholder=\"What you will do and what counts as done\">${esc(f.extensionDrill)}</textarea></div></div>` : ''}\n    </div></div>`;\n  } else {\n    focusCard = `<div class=\"card\">${sec('My focus skill', 'amber')}<div class=\"card-body\"><div class=\"focus-grid\">${skills.map(s => `<button type=\"button\" class=\"focus-btn ${f.focusSkill === s.skill ? 'on' : ''}\" data-act=\"focus-skill\" data-v=\"${esc(s.skill)}\">${esc(s.skill)}</button>`).join('')}</div></div></div>`;\n  }\n\n  // 3 · agility element, personal skills (end), reflection\n  const prompts = mode === 'early' ? [['wentWell', cfg.earlyPrompt]] : mode === 'middle' ? [['wentWell', cfg.reflectionPrompts[0]]] : [['wentWell', cfg.reflectionPrompts[0]], ['nextGoal', cfg.reflectionPrompts[1]]];\n  const reflCard = `<div class=\"card\">${sec('Reflection', 'purple')}<div class=\"card-body\">\n      ${prompts.map(([k, label]) => `<div class=\"field\"><label>${esc(label)}</label><textarea data-in=\"${k}\" maxlength=\"600\" placeholder=\"${mode === 'early' ? 'One or two sentences…' : 'Two or three sentences…'}\">${esc(f[k])}</textarea></div>`).join('')}\n      ${mode === 'end' && cfg.outcomes.length ? `<div class=\"field\"><label>Personal skills — where are you honestly?</label><div class=\"tbl-wrap\"><table class=\"tbl\"><tbody>${cfg.outcomes.map(o => { const v = f.selfOutcomes[o.outcome] || 0; return `<tr><td class=\"skill\">${esc(o.outcome)}<span class=\"cue\">${esc(o.looksLike)}</span></td><td><div class=\"seg3\">${[1, 2, 3].map(k => `<button type=\"button\" class=\"${v === k ? 'on st' + k : ''}\" data-act=\"self-outcome\" data-outcome=\"${esc(o.outcome)}\" data-n=\"${k}\">${esc(cfg.outcomeLabels[k - 1])}</button>`).join('')}</div></td></tr>`; }).join('')}</tbody></table></div></div>` : ''}\n      <div class=\"form-actions\"><button class=\"pill-btn primary\" data-act=\"cp-save\" ${f.sending ? 'disabled' : ''}>${f.sending ? 'Saving…' : 'Save check-in'}</button><button class=\"pill-btn\" data-act=\"cp-cancel\">Cancel</button><span class=\"status\" id=\"cp-status\"></span></div>\n    </div></div>`;\n  return head + scoresCard + focusCard + reflCard;\n}\nasync function saveCpForm() {\n  const me = S.me, cp = S.cp, f = S.form;\n  const asTeacher = S.id.role === 'teacher' && !S.testAs;\n  const scores = {};\n  Object.keys(f.scores).forEach(k => {\n    const v = f.scores[k]; if (v === '' || v === null || v === undefined) return;\n    const t = testRow(me, cp.name, k); if (t && t.by === 'teacher' && !asTeacher) return;\n    scores[k] = Math.max(0, Math.min(S.cfg.scoreMax, Math.round(num(v))));\n  });\n  if (!Object.keys(scores).length && !f.focusSkill && !f.wentWell && !f.nextGoal && !Object.keys(f.selfStages).length) { toast('Type a score or pick a focus skill first'); return; }\n  const payload = { section: me.section, student: me.student, checkpoint: cp.name, scores, focusSkill: f.focusSkill, goal: f.goal, drillStep: f.drillStep, extensionSkill: f.extensionSkill, extensionDrill: f.extensionDrill, selfStages: f.selfStages, selfOutcomes: f.selfOutcomes, wentWell: f.wentWell, nextGoal: f.nextGoal };\n  // optimistic local update\n  let c = checkinOf(me, cp.name); if (!c) { c = { checkpoint: cp.name, engagement: null, personal: null, gamePlay: null, confirmed: false }; me.checkins.push(c); }\n  Object.assign(c, { focusSkill: f.focusSkill, goal: f.goal, drillStep: f.drillStep, extensionSkill: f.extensionSkill, extensionDrill: f.extensionDrill, selfStages: Object.assign({}, f.selfStages), wentWell: f.wentWell, nextGoal: f.nextGoal, confirmed: asTeacher ? c.confirmed : false });\n  Object.keys(scores).forEach(k => { let t = me.tests.find(x => x.checkpoint === cp.name && x.skill === k); if (!t) { t = { checkpoint: cp.name, skill: k, score: null, by: asTeacher ? 'teacher' : 'student' }; me.tests.push(t); } t.score = scores[k]; });\n  me.outcomes = me.outcomes || [];\n  Object.keys(f.selfOutcomes).forEach(k => { let r = outcomeRow(me, cp.name, k); if (!r) { r = { checkpoint: cp.name, outcome: k, self: null, teacher: null }; me.outcomes.push(r); } r.self = f.selfOutcomes[k]; });\n  f.sending = true; render();\n  const goBack = () => { if (studentMode()) S.view = 'dash'; else { S.T.tab = 'student'; syncTeacherCache(me); } render(); };\n  let settled = false;\n  const watch = setInterval(() => { if (settled) { clearInterval(watch); return; } if (Outbox.failed) { clearInterval(watch); settled = true; f.sending = false; goBack(); toast('Saved on this device — will send when the connection returns'); } }, 400);\n  try { await Outbox.add('saveCheckin', payload, 'check-in ' + cp.name); if (settled) return; settled = true; f.sending = false; goBack(); toast('Check-in saved ✓'); }\n  catch (e) { if (settled) return; settled = true; f.sending = false; render(); const st = $('#cp-status'); if (st) st.textContent = 'Not saved: ' + e.message; }\n}\nfunction syncTeacherCache(me) {\n  const d = S.T.data; if (!d || d.section !== me.section) return;\n  d.checkins = d.checkins.filter(r => r.student !== me.student).concat(me.checkins.map(r => Object.assign({ student: me.student }, r)));\n  d.tests = d.tests.filter(r => r.student !== me.student).concat(me.tests.map(r => Object.assign({ student: me.student }, r)));\n  d.outcomes = d.outcomes.filter(r => r.student !== me.student).concat((me.outcomes || []).map(r => Object.assign({ student: me.student }, r)));\n}\n\n// ═══════════════════════ teacher ═══════════════════════\nfunction TABS() { const t = [['checkins', 'Check-ins'], ['students', 'Students'], ['overview', 'Grades'], ['print', 'Print logs']]; if (S.cfg.dailyRegister) t.unshift(['register', 'Register']); return t; }\nfunction groupRoster() { return S.cfg.roster.filter(r => r.section === S.T.section && (!S.T.sport || r.sport === S.T.sport)); }\nfunction sportsInSection() { const out = []; S.cfg.roster.filter(r => r.section === S.T.section).forEach(r => { if (r.sport && out.indexOf(r.sport) === -1) out.push(r.sport); }); return out; }\nfunction meOf(student) { const T = S.T.data; return { checkins: T.checkins.filter(x => x.student === student), tests: T.tests.filter(x => x.student === student), outcomes: T.outcomes.filter(x => x.student === student) }; }\nasync function loadSection(section) {\n  S.T.section = section; S.T.data = null; S.T.overview = null; S.T.viewing = null;\n  if (S.T.tab === 'student' || S.T.tab === 'cpform') S.T.tab = 'students';\n  if (!S.cfg.dailyRegister && S.T.tab === 'register') S.T.tab = 'checkins';\n  render();\n  try {\n    const d = await call('getSectionData', section);\n    if (S.T.section !== section) return;\n    S.T.data = d;\n    if (sportsInSection().indexOf(S.T.sport) === -1) S.T.sport = '';\n    if (S.T.lesson === null) { const done = d.register.filter(r => r.participation).map(r => r.lesson); const last = done.length ? Math.max(...done) : 0; const nextL = S.cfg.lessons.find(l => l.number > last) || S.cfg.lessons[S.cfg.lessons.length - 1]; S.T.lesson = nextL ? nextL.number : null; }\n    if (!S.T.cpName && CPS().length) {\n      // default to the first checkpoint that still has unconfirmed check-ins\n      const roster = S.cfg.roster.filter(r => r.section === section);\n      const open = CPS().find(cp => roster.some(r => { const c = d.checkins.find(x => x.student === r.student && x.checkpoint === cp.name); return !(c && c.confirmed); }));\n      S.T.cpName = (open || CPS()[CPS().length - 1]).name;\n    }\n    render();\n    if (S.T.tab === 'overview') loadOverview();\n  } catch (e) { banner('err', 'Could not load section: ' + esc(e.message) + ' <button data-act=\"reload\">Reload</button>'); }\n}\nasync function loadOverview() {\n  try { const o = await call('getOverview', S.T.section, S.T.sport); S.T.overview = o; if (S.T.tab === 'overview') render(); }\n  catch (e) { toast('Overview failed: ' + e.message); }\n}\nfunction renderTeacher() {\n  const cfg = S.cfg, T = S.T;\n  if (T.tab === 'student' && S.me) return renderStudentPage(S.me, true);\n  if (T.tab === 'cpform' && S.me && S.cp) return renderCpForm(S.me, S.cp, true);\n  const sports = T.data ? sportsInSection() : [];\n  const head = `<div class=\"topbar\">\n      <div><div class=\"title\">${esc(cfg.unitName)}</div><div class=\"sub\">${esc(T.section)}${T.sport ? ' · ' + esc(T.sport) : ''}</div></div>\n      <div class=\"grow\"></div>\n      ${cfg.sections.length > 1 ? `<div class=\"seg-tabs\">${cfg.sections.map(c => `<button class=\"${c === T.section ? 'on' : ''}\" data-act=\"t-section\" data-v=\"${esc(c)}\">${esc(c)}</button>`).join('')}</div>` : ''}\n      ${sports.length > 1 ? `<div class=\"seg-tabs\">${sports.map(sp => `<button class=\"${sp === T.sport ? 'on' : ''}\" data-act=\"t-sport\" data-v=\"${esc(sp)}\">${esc(sp)}</button>`).join('')}<button class=\"${!T.sport ? 'on' : ''}\" data-act=\"t-sport\" data-v=\"\">All</button></div>` : ''}\n      ${S.id.alsoStudent ? `<button class=\"pill-btn small\" data-act=\"test-as-on\">Test as student &rsaquo;</button>` : ''}\n      <div class=\"savestate\" id=\"savestate\"></div></div>\n    <div class=\"tabs main\">${TABS().map(([k, l]) => `<button class=\"tab ${T.tab === k ? 'active' : ''}\" data-act=\"t-tab\" data-tab=\"${k}\">${l}</button>`).join('')}</div>`;\n  if (!cfg.sections.length) return head + `<div class=\"notice\"><h2>No students yet</h2><p>Add students to the <b>Roster</b> tab of the Sheet (Section, Sport, Student, Email), then reload.</p></div>`;\n  if (!T.data) return head + `<div class=\"loading\"><div class=\"spinner\"></div> Loading…</div>`;\n  const body = { register: renderRegister, checkins: renderTeacherCheckin, students: renderStudents, overview: renderOverview, print: renderPrint }[T.tab] || renderTeacherCheckin;\n  return head + body();\n}\n\n// ── teacher check-in: one row per student ──\nfunction renderTeacherCheckin() {\n  const cfg = S.cfg, T = S.T, cp = CPS().find(c => c.name === T.cpName) || CPS()[0];\n  if (!cp) return `<div class=\"empty\">No checkpoints defined — add Early / Middle / End in the Checkpoint column of the Lessons tab.</div>`;\n  const mode = cpMode(cp);\n  const sports = T.sport ? [T.sport] : sportsInSection();\n  const roster = groupRoster();\n  const isConfirmed = student => { const c = T.data.checkins.find(x => x.student === student && x.checkpoint === cp.name); return !!(c && c.confirmed); };\n  const intro = { early: 'Students typed their scores from their paper log. Glance at each row, fix anything wrong, tap <b>✓</b>, rate engagement and personal skills.',\n                  middle: 'Students typed their focus-skill retest. Check it, tap <b>✓</b>, rate engagement and personal skills.',\n                  end: 'Your final assessment. Type each student\\'s final retest of their focus skill, tap the <b>game-play level</b> you saw over the last two lessons, then <b>✓</b>, engagement and personal skills.' }[mode];\n  return `<div class=\"subtabs\">${CPS().map(c => `<button class=\"subtab ${c.name === cp.name ? 'active' : ''}\" data-act=\"t-cp\" data-v=\"${esc(c.name)}\">${esc(c.name)}<span class=\"tiny\">lesson ${c.lesson}</span></button>`).join('')}</div>\n    <div class=\"card\"><div class=\"card-body small muted\">${intro} <span class=\"faint\">Dashed scores are the student's own entry; solid ones you have set.</span></div></div>\n    ${sports.map(sp => { const skills = mode === 'early' ? skillsOf(sp) : []; const rows = roster.filter(r => r.sport === sp); if (!rows.length) return '';\n      const cols = 3 + skills.length + (mode !== 'early' ? 2 : 0) + (mode === 'end' ? 1 : 0);\n      return `<div class=\"card\"><div class=\"card-head ${mode === 'end' ? 'purple' : 'coral'}\">${esc(cp.name)}${mode === 'end' ? ' · final assessment' : ''} · ${esc(sp)} <span class=\"right\">${rows.filter(r => isConfirmed(r.student)).length} of ${rows.length} confirmed</span></div><div class=\"card-body\">\n        <div class=\"tbl-wrap\"><table class=\"tbl tc\"><thead><tr><th>Student</th><th>Focus skill</th>${skills.map(s => `<th class=\"c\" title=\"${esc(s.test)}\">${esc(s.skill)}</th>`).join('')}${mode !== 'early' ? `<th class=\"c\">${mode === 'end' ? 'Final retest' : 'Retest'}</th><th class=\"c\">Drill</th>` : ''}${mode === 'end' ? '<th class=\"c\">Game play</th>' : ''}<th class=\"c\">Confirm</th><th class=\"c\">Engagement</th><th class=\"c\">Personal</th></tr></thead><tbody>\n        ${rows.map(r => { const me = meOf(r.student); const c = me.checkins.find(x => x.checkpoint === cp.name) || {}; const fc = currentFocus(me); const fdef = fc.skill ? skillDef(sp, fc.skill) : null;\n          const cell = (skill) => { const t = testRow(me, cp.name, skill); const v = t ? t.score : ''; const st = stageOf(num(v)); return `<td class=\"cell\"><div class=\"score-in\"><input class=\"num-in short ${t && t.by === 'student' ? 'by-student' : ''}\" type=\"number\" min=\"0\" max=\"${cfg.scoreMax}\" step=\"1\" inputmode=\"numeric\" value=\"${v}\" data-in=\"tscore\" data-student=\"${esc(r.student)}\" data-skill=\"${esc(skill)}\"><span class=\"stage-pill st${st}\" data-stage-for=\"${esc(r.student)}|${esc(skill)}\">${st ? esc(stageName(st)) : '–'}</span></div></td>`; };\n          const focusCell = fc.skill ? `<span class=\"tag\">${esc(fc.skill)}</span>${fc.extension ? `<span class=\"sug-note\">+ ${esc(fc.extension)}</span>` : ''}` : '<span class=\"faint\">–</span>';\n          return `<tr class=\"${c.confirmed ? 'ok' : ''}\"><td><b>${esc(r.student)}</b></td><td>${focusCell}</td>\n          ${skills.map(s => cell(s.skill)).join('')}\n          ${mode !== 'early' ? (fc.skill ? cell(fc.skill) : '<td class=\"c faint\">no focus</td>') + `<td class=\"c\">${fdef ? (fc.step || 0) + '/' + fdef.drills.length : '–'}${fdef && (fc.step || 0) >= fdef.drills.length ? '<span class=\"sug-note\">done</span>' : ''}</td>` : ''}\n          ${mode === 'end' ? `<td class=\"c\"><div class=\"ppills tight gp\">${[1, 2, 3, 4].map(v => `<button type=\"button\" class=\"${c.gamePlay === v ? 'on gl' + v : ''}\" data-act=\"t-game\" data-student=\"${esc(r.student)}\" data-n=\"${v}\">${esc(cfg.gameLevels[v - 1])}</button>`).join('')}</div></td>` : ''}\n          <td class=\"c\"><button type=\"button\" class=\"ok-btn ${c.confirmed ? 'on' : ''}\" data-act=\"t-confirm\" data-student=\"${esc(r.student)}\" title=\"${c.confirmed ? 'Confirmed — tap to undo' : 'Confirm'}\">✓</button></td>\n          <td class=\"c\"><div class=\"ppills tight\">${[1, 2, 3].map(v => `<button type=\"button\" class=\"${c.engagement === v ? 'on p' + v : ''}\" data-act=\"t-eng\" data-student=\"${esc(r.student)}\" data-n=\"${v}\" title=\"${esc(cfg.participationLabels[v - 1])}\">${v}</button>`).join('')}</div></td>\n          <td class=\"c\"><div class=\"ppills tight st\">${[1, 2, 3].map(v => `<button type=\"button\" class=\"${c.personal === v ? 'on st' + v : ''}\" data-act=\"t-pers\" data-student=\"${esc(r.student)}\" data-n=\"${v}\" title=\"${esc(cfg.outcomeLabels[v - 1])}\">${v}</button>`).join('')}</div>${cfg.outcomes.length ? `<a href=\"#\" class=\"tiny\" data-act=\"t-expand\" data-student=\"${esc(r.student)}\">${T.expanded[r.student] ? 'less' : 'detail'}</a>` : ''}</td></tr>\n          ${T.expanded[r.student] ? `<tr class=\"detail\"><td></td><td colspan=\"${cols}\"><div class=\"detail-row\">${cfg.outcomes.map(o => { const x = me.outcomes.find(y => y.checkpoint === cp.name && y.outcome === o.outcome) || {}; return `<span class=\"detail-item\"><span class=\"muted\">${esc(o.outcome)}</span> <button type=\"button\" class=\"cyc sm ${x.teacher ? 'st' + x.teacher : ''}\" data-act=\"t-outcome\" data-student=\"${esc(r.student)}\" data-outcome=\"${esc(o.outcome)}\">${x.teacher || '–'}<small>self ${x.self || '–'}</small></button></span>`; }).join('')}</div></td></tr>` : ''}`; }).join('')}\n        </tbody></table></div>\n        <div class=\"legend\">${bandsLegend()}<span class=\"grow\"></span>${mode === 'end' ? `<span>Game play: the level of the focus skill you saw in games (7 = top)</span>` : ''}<span>Engagement: ${cfg.participationLabels.map((l, i) => `${i + 1} ${esc(l)}`).join(' · ')}</span><span>Personal: ${cfg.outcomeLabels.map((l, i) => `${i + 1} ${esc(l)}`).join(' · ')}</span></div>\n      </div></div>`; }).join('')}`;\n}\nfunction tCheckin(student) { let c = S.T.data.checkins.find(x => x.student === student && x.checkpoint === S.T.cpName); if (!c) { c = { student, checkpoint: S.T.cpName, focusSkill: '', goal: '', drillStep: null, extensionSkill: '', extensionDrill: '', selfStages: {}, wentWell: '', nextGoal: '', gamePlay: null, engagement: null, personal: null, confirmed: false }; S.T.data.checkins.push(c); } return c; }\nfunction putTeacherCheckin(student, entry) { Pending.put('tcheck|' + S.T.section + '|' + S.T.cpName, 'saveTeacherCheckin', { section: S.T.section, checkpoint: S.T.cpName }, student, Object.assign({ student }, entry)); }\nfunction setTeacherScore(student, skill, value) {\n  const v = value === '' ? '' : Math.max(0, Math.min(S.cfg.scoreMax, Math.round(num(value))));\n  let t = S.T.data.tests.find(x => x.student === student && x.checkpoint === S.T.cpName && x.skill === skill);\n  if (!t) { t = { student, checkpoint: S.T.cpName, skill, score: null, by: 'teacher' }; S.T.data.tests.push(t); }\n  t.score = v === '' ? null : v; t.by = 'teacher';\n  const pill = document.querySelector(`[data-stage-for=\"${CSS.escape(student + '|' + skill)}\"]`); if (pill) { const st = stageOf(t.score); pill.className = 'stage-pill st' + st; pill.textContent = st ? stageName(st) : '–'; }\n  const inp = document.querySelector(`input[data-in=\"tscore\"][data-student=\"${CSS.escape(student)}\"][data-skill=\"${CSS.escape(skill)}\"]`); if (inp) inp.classList.remove('by-student');\n  const scores = {}; scores[skill] = v; putTeacherCheckin(student, { scores });\n}\nfunction setOutcome(student, outcome, v) {\n  const T = S.T; let x = T.data.outcomes.find(y => y.student === student && y.checkpoint === T.cpName && y.outcome === outcome);\n  if (!x) { x = { student, checkpoint: T.cpName, outcome, self: null, teacher: null }; T.data.outcomes.push(x); }\n  x.teacher = v;\n  Pending.put('outcomes|' + T.section + '|' + T.cpName, 'saveOutcomes', { section: T.section, checkpoint: T.cpName }, student + '|' + outcome, { student, outcome, teacher: v === null ? '' : v });\n}\n\n// ── optional daily register ──\nfunction regEntry(student, lesson) { return S.T.data.register.find(r => r.student === student && r.lesson === lesson); }\nfunction renderRegister() {\n  const cfg = S.cfg, T = S.T, lesson = T.lesson, roster = groupRoster();\n  const marked = roster.filter(r => { const e = regEntry(r.student, lesson); return e && e.participation; }).length;\n  const cp = CPS().find(c => c.lesson === lesson);\n  const idx = cfg.lessons.findIndex(l => l.number === lesson);\n  const prev = cfg.lessons[idx - 1], next = cfg.lessons[idx + 1];\n  return `<div class=\"lesson-bar\">\n      <button class=\"pill-btn\" data-act=\"t-lesson\" data-n=\"${prev ? prev.number : lesson}\" ${prev ? '' : 'disabled'}>&lsaquo;</button>\n      <div class=\"lesson-title\">Lesson ${lesson}${cp ? `<span class=\"tag\">${esc(cp.name)} check-in</span>` : ''}</div>\n      <button class=\"pill-btn\" data-act=\"t-lesson\" data-n=\"${next ? next.number : lesson}\" ${next ? '' : 'disabled'}>&rsaquo;</button>\n      <div class=\"lesson-pills\">${cfg.lessons.map(l => { const any = T.data.register.some(r => r.lesson === l.number && r.participation); return `<button class=\"lp ${l.number === lesson ? 'on' : ''} ${any ? 'done' : ''}\" data-act=\"t-lesson\" data-n=\"${l.number}\">${l.number}</button>`; }).join('')}</div>\n    </div>\n    <div class=\"card\"><div class=\"card-head green\">Participation <span class=\"right\">${marked} of ${roster.length}</span></div><div class=\"card-body\">\n      <div class=\"toolbar\"><div class=\"grow\"></div><button class=\"pill-btn small\" data-act=\"reg-all\" data-n=\"2\">Mark the rest \"${esc(cfg.participationLabels[1])}\"</button></div>\n      ${roster.map(r => { const e = regEntry(r.student, lesson) || {}; return `<div class=\"reg-row\"><div class=\"name\">${avatar(r.student)} <span>${esc(r.student)}${!T.sport ? `<span class=\"tiny muted\"> · ${esc(r.sport)}</span>` : ''}</span></div>\n        <div class=\"ppills\">${[1, 2, 3].map(v => `<button type=\"button\" class=\"${e.participation === v ? 'on p' + v : ''}\" data-act=\"reg\" data-student=\"${esc(r.student)}\" data-n=\"${v}\">${esc(cfg.participationLabels[v - 1])}</button>`).join('')}</div>\n        <input type=\"text\" placeholder=\"note\" maxlength=\"200\" value=\"${esc(e.note || '')}\" data-in=\"reg-note\" data-student=\"${esc(r.student)}\"></div>`; }).join('')}\n    </div></div>`;\n}\nfunction setRegister(student, lesson, patch) {\n  let e = regEntry(student, lesson); if (!e) { e = { student, lesson, participation: null, note: '' }; S.T.data.register.push(e); }\n  Object.assign(e, patch);\n  Pending.put('reg|' + S.T.section + '|' + lesson, 'saveRegister', { section: S.T.section, lesson }, student, Object.assign({ student }, patch));\n}\n\n// ── students ──\nfunction renderStudents() {\n  const T = S.T, roster = groupRoster(), cps = CPS();\n  return `<div class=\"card\"><div class=\"card-head\">Students <span class=\"right\">tap to open</span></div><div class=\"card-body\">\n    <div class=\"student-list\">${roster.map(r => { const me = meOf(r.student); const done = cps.filter(c => cpDone(me, c)).length; const fc = currentFocus(me);\n      return `<button class=\"student-card\" data-act=\"t-open-student\" data-student=\"${esc(r.student)}\">${avatar(r.student)}<div><div class=\"n\">${esc(r.student)}</div><div class=\"s\">${esc(r.sport)} · ${done}/${cps.length} check-ins${fc.skill ? ' · ' + esc(fc.skill) : ''}</div></div></button>`; }).join('')}</div></div></div>`;\n}\nasync function openStudentAsTeacher(name) {\n  const T = S.T; T.viewing = name; S.me = null; T.tab = 'student';\n  $('#app').innerHTML = `<div class=\"loading\"><div class=\"spinner\"></div> Loading ${esc(name)}…</div>`;\n  try { const d = await call('getStudent', T.section, name); if (T.viewing !== name) return; S.me = d; render(); }\n  catch (e) { T.tab = 'students'; render(); toast('Could not load: ' + e.message); }\n}\n\n// ── grades ──\nfunction renderOverview() {\n  const cfg = S.cfg, T = S.T;\n  if (!T.overview) { if (!T._loadingOv) { T._loadingOv = true; loadOverview().finally(() => { T._loadingOv = false; }); } return `<div class=\"loading\"><div class=\"spinner\"></div> Building overview…</div>`; }\n  const evLabel = { test: 'game-play level (or retest gain)', reflection: 'check-ins, goal, self-assessment, drill progress', participation: cfg.dailyRegister ? 'register' : 'engagement ratings', skills: 'all skill scores at the end', outcomes: 'personal-skill ratings', none: 'no automatic evidence' };\n  const pendingSug = T.overview.reduce((n, o) => n + cfg.criteria.filter(c => o.suggested[c.code] && !(o.final[c.code] && o.final[c.code].score)).length, 0);\n  return `<div class=\"card\"><div class=\"card-head dark\">Grades <span class=\"right\">dashed = suggested from ${cfg.criteria.map(c => `${esc(c.code)}: ${esc(evLabel[c.evidence])}`).join(' · ')}</span></div><div class=\"card-body\">\n    <div class=\"toolbar\"><span class=\"small muted\">Tap a number to set the final grade, ✎ for a comment.</span><div class=\"grow\"></div>${pendingSug ? `<button class=\"pill-btn small primary\" data-act=\"accept-sug\">Accept all suggested (${pendingSug})</button>` : ''}<a href=\"#\" class=\"small\" data-act=\"ov-refresh\">refresh</a></div>\n    <div class=\"tbl-wrap\">\n    <table class=\"tbl ov\"><thead><tr><th class=\"sticky\">Student</th><th class=\"c\">${cfg.dailyRegister ? 'Register' : 'Engagement'}</th><th class=\"c\">Check-ins</th><th>Focus skill</th>${cfg.outcomes.length ? '<th class=\"c\">Personal<br><span class=\"tiny\" style=\"text-transform:none;letter-spacing:0\">teacher / self</span></th>' : ''}<th class=\"c\">Game play</th><th>Grades</th></tr></thead><tbody>\n    ${T.overview.map(o => `<tr><td class=\"sticky\"><b>${esc(o.student)}</b>${!T.sport ? `<span class=\"sug-note\">${esc(o.sport)}</span>` : ''}</td>\n      <td class=\"c\">${cfg.dailyRegister ? `${o.lessonsAttended}/${o.lessonsRun}<span class=\"sug-note\">${o.participationAvg === null ? '—' : 'avg ' + fmt(o.participationAvg, 1)}</span>` : (o.engagementAvg === null ? '<span class=\"faint\">—</span>' : fmt(o.engagementAvg, 1) + '<span class=\"tiny muted\">/3</span>')}</td>\n      <td class=\"c\">${o.checkins}/${CPS().length}<span class=\"sug-note\">${o.confirmed}/${o.checkins} confirmed${o.maxSteps ? ' · drill ' + (o.drillStep || 0) + '/' + o.maxSteps : ''}${o.selfAccuracy !== null ? ' · self ' + Math.round(o.selfAccuracy * 100) + '%' : ''}</span></td>\n      <td>${o.focus ? `${esc(o.focus)}${o.extension ? ` <span class=\"tiny muted\">+ ${esc(o.extension)}</span>` : ''}<span class=\"sug-note\">${o.focusStart === null ? 'not tested' : `${fmt(o.focusStart, 0)} → ${o.focusEnd !== null && o.focusGain !== null ? fmt(o.focusEnd, 0) : '·'}${o.focusGain !== null ? ` <span style=\"color:${o.focusGain > 0 ? 'var(--green)' : o.focusGain < 0 ? 'var(--red)' : 'inherit'}\">(${o.focusGain > 0 ? '+' : ''}${o.focusGain})</span>` : ''}`}${o.chosenAtUnderstanding === false ? ' · not at ' + esc(cfg.stageLabels[0]) : ''}</span>` : '<span class=\"faint\">—</span>'}</td>\n      ${cfg.outcomes.length ? `<td class=\"c\">${fmt(o.outcomesTeacher, 1)} / ${fmt(o.outcomesSelf, 1)}</td>` : ''}\n      <td class=\"c\">${o.gamePlay ? `<span class=\"chip gl${o.gamePlay}\">${esc(gameLabel(o.gamePlay))}</span>` : '<span class=\"faint\">—</span>'}</td>\n      <td class=\"grade-cell\">${cfg.criteria.map(c => { const f = o.final[c.code] || {}, sug = o.suggested[c.code]; return `<div class=\"grade-line\"><span class=\"grade-code\" title=\"${esc(c.name)}\">${esc(c.code)}</span><div class=\"score-row\">${[1, 2, 3, 4, 5, 6, 7].map(n => `<button type=\"button\" class=\"${f.score === n ? 'on' : ''} ${sug === n && f.score !== n ? 'sug' : ''}\" data-act=\"grade\" data-student=\"${esc(o.student)}\" data-code=\"${esc(c.code)}\" data-n=\"${n}\">${n}</button>`).join('')}<button type=\"button\" title=\"${esc(f.comment || 'Add comment')}\" data-act=\"grade-comment\" data-student=\"${esc(o.student)}\" data-code=\"${esc(c.code)}\" style=\"${f.comment ? 'background:#eef4fb;color:var(--blue)' : ''}\">✎</button></div>${f.comment ? `<span class=\"grade-comment\" title=\"${esc(f.comment)}\">💬</span>` : ''}</div>`; }).join('')}</td>\n    </tr>`).join('')}\n    </tbody></table></div></div></div>`;\n}\nfunction setGrade(student, code, patch) {\n  const o = S.T.overview.find(x => x.student === student); if (!o) return;\n  o.final[code] = Object.assign(o.final[code] || {}, patch);\n  Pending.put('grade|' + S.T.section, 'saveGrades', { section: S.T.section }, student + '|' + code, Object.assign({ student, criterion: code }, patch));\n}\n\n// ── print daily logs ──\nfunction renderPrint() {\n  const T = S.T; const roster = T.printMode === 'blank' ? [null] : groupRoster();\n  return `<div class=\"toolbar no-print\">\n      <button class=\"subtab ${T.printMode === 'all' ? 'active' : ''}\" data-act=\"print-mode\" data-v=\"all\">One sheet per student (${groupRoster().length})</button>\n      <button class=\"subtab ${T.printMode === 'blank' ? 'active' : ''}\" data-act=\"print-mode\" data-v=\"blank\">Blank sheet</button>\n      <div class=\"grow\"></div><span class=\"small muted\">Print after the ${esc(CPS()[0] ? CPS()[0].name : 'Early')} check-in so each sheet has the student's drill card</span>\n      <button class=\"pill-btn primary\" data-act=\"print\">Print</button></div>\n    ${roster.map(r => renderSheet(r)).join('')}`;\n}\nfunction renderSheet(r) {\n  const cfg = S.cfg, cps = CPS(); const T = S.T;\n  const sport = r ? r.sport : (T.sport || '');\n  const me = r ? meOf(r.student) : { checkins: [], tests: [], outcomes: [] };\n  const fc = currentFocus(me); const def = fc.skill ? skillDef(sport, fc.skill) : null;\n  const skills = skillsOf(sport);\n  const first = cps[0], mid = cps.length > 2 ? cps.slice(1, -1) : [], last = cps.length > 1 ? cps[cps.length - 1] : null;\n  const lastTwo = cfg.lessons.slice(-2).map(l => l.number);\n  const what = l => { const cp = cps.find(c => c.lesson === l.number); const parts = [];\n    if (cp) parts.push(cp === first ? 'Test all ' + skills.length + ' skills · choose focus · LAPTOP ' + cp.name + ' check-in' : cp === last ? 'Final retest of focus skill · LAPTOP ' + cp.name + ' check-in' : 'Retest focus skill · LAPTOP ' + cp.name + ' check-in');\n    else if (lastTwo.indexOf(l.number) !== -1) parts.push('Game play · teacher watches your focus skill');\n    else parts.push('Drill step ____');\n    return parts.join(' · '); };\n  const oc = cfg.outcomes.slice(0, 4);\n  const testsBox = `<div class=\"s-box\"><h4>Skill tests · score out of ${cfg.scoreMax}</h4><table class=\"s-drills s-tests\"><thead><tr><th style=\"width:17%\">Skill</th><th style=\"width:47%\">Test</th><th style=\"width:12%\">${esc(first ? first.name : 'Start')}<br><span style=\"font-weight:400\">all skills</span></th>${mid.map(c => `<th style=\"width:12%\">${esc(c.name)}<br><span style=\"font-weight:400\">focus only</span></th>`).join('')}${last ? `<th style=\"width:12%\">${esc(last.name)}<br><span style=\"font-weight:400\">focus only</span></th>` : ''}</tr></thead><tbody>${skills.map(s => { const isF = fc.skill === s.skill; const na = fc.skill && !isF; return `<tr><td><b>${esc(s.skill)}</b>${isF ? ' ★' : ''}</td><td>${esc(s.test)}</td><td class=\"box\"></td>${mid.map(() => `<td class=\"box ${na ? 'na' : ''}\"></td>`).join('')}${last ? `<td class=\"box ${na ? 'na' : ''}\"></td>` : ''}</tr>`; }).join('')}</tbody></table><div style=\"font-size:8pt;color:#555;margin-top:2px\">Ten attempts, a partner counts. After ${esc(first ? first.name : 'the start')}, only your ★ focus skill is retested.</div></div>`;\n  const drillsBox = def\n    ? `<div class=\"s-box\"><h4>My drill progression · ${esc(fc.skill)}</h4><table class=\"s-drills\"><thead><tr><th>Step</th><th>Drill</th><th>Done when…</th><th>Peer initials</th><th>Teacher sign</th><th>Date</th></tr></thead><tbody>${def.drills.map(d => `<tr><td><b>${d.step}</b></td><td>${esc(d.drill)}</td><td>${esc(d.criteria)}</td><td class=\"box\"></td><td class=\"box\"></td><td class=\"box\"></td></tr>`).join('')}<tr><td><b>+</b></td><td>Extension: ${fc.extension ? esc(fc.extension) : '____________'}</td><td>${fc.extensionDrill ? esc(fc.extensionDrill) : 'Agree a new skill and drill with your teacher once every step is signed'}</td><td class=\"box\"></td><td class=\"box\"></td><td class=\"box\"></td></tr></tbody></table></div>`\n    : `<div class=\"s-box\"><h4>My drill progression</h4><div style=\"font-size:9pt;color:#555\">Printed after the ${esc(first ? first.name : 'Early')} check-in with your focus skill's steps. Until then, use the class drill card.</div></div>`;\n  const procBox = `<div class=\"s-box\"><h4>How to move up a step</h4><ol style=\"font-size:8pt;line-height:1.3;padding-left:14px\"><li>Do the drill until you meet the <b>Done when</b> line.</li><li>A partner watches and <b>initials</b>.</li><li>Show your teacher: <b>sign and date</b>.</li><li>Next step. All signed? Choose an <b>extension</b>.</li></ol></div>`;\n  const persBox = `<div class=\"s-box\"><h4>Personal skills · tick each lesson</h4><div style=\"font-size:8pt;line-height:1.3\">${oc.map(o => `<div><b>${esc(o.outcome[0])}</b> ${esc(o.outcome)}: <span style=\"color:#555\">${esc(o.looksLike)}</span></div>`).join('')}</div></div>`;\n  return `<div class=\"sheet\">\n    <div class=\"s-head\"><div><div class=\"u\">${esc(cfg.unitName)} · Daily log · ${esc(T.section)}${sport ? ' · ' + esc(sport) : ''}</div><div class=\"n\">${r ? esc(r.student) : '<span class=\"blank\">&nbsp;</span>'}</div></div>\n      <div style=\"text-align:right;font-size:8.5pt;color:#555\">Paper every lesson. Laptop only on the shaded lessons.<br>Lessons ${lastTwo.join(' and ')}: your teacher watches your focus skill in game play.</div></div>\n    <div class=\"s-goal\"><b>Focus skill:</b> ${fc.skill ? esc(fc.skill) : '<span class=\"blank\">&nbsp;</span>'} &nbsp; <b>Goal:</b> ${fc.goal ? esc(fc.goal) : '<span class=\"blank\" style=\"min-width:110mm\">&nbsp;</span>'}</div>\n    <div class=\"s-row\">${testsBox}</div>\n    <div class=\"s-cols two\">${drillsBox}<div style=\"display:flex;flex-direction:column;gap:3mm\">${procBox}${persBox}</div></div>\n    <table><thead><tr><th style=\"width:6mm\">L</th><th style=\"width:14mm\">Date</th><th>What happens today</th><th style=\"width:11mm\">Step worked on</th><th style=\"width:${8 * oc.length + 4}mm\">Personal skills</th><th>One thing I learned / will change next time</th><th style=\"width:9mm\">Tchr</th></tr></thead><tbody>\n    ${cfg.lessons.map(l => { const isCp = cps.some(c => c.lesson === l.number); return `<tr class=\"${isCp ? 'cp' : ''}\"><td class=\"tall\"><b>${l.number}</b></td><td>${esc(l.date || '')}</td><td class=\"ttl\">${esc(what(l))}</td><td></td><td class=\"ticks\">${oc.map(o => `<span class=\"tick\">${esc(o.outcome[0])}</span>`).join('')}</td><td></td><td></td></tr>`; }).join('')}\n    </tbody></table>\n    <div class=\"s-foot\"><span>Laptop check-ins: ${cps.map(c => `<b>${esc(c.name)}</b> L${c.lesson}`).join(' · ')}</span><span>Final teacher assessment: focus skill in game play, lessons ${lastTwo.join('–')}</span></div>\n  </div>`;\n}\n\n// ═══════════════════════ events ═══════════════════════\nconst actions = {\n  reload() { location.reload(); },\n  retry() { Outbox.retry(); },\n  'open-cp'(t) { openCpForm(S.me, t.dataset.cp); },\n  'cp-cancel'() { if (studentMode()) S.view = 'dash'; else S.T.tab = 'student'; render(); },\n  'cp-save'() { saveCpForm(); },\n  async 'test-as-on'() {\n    const a = S.id.alsoStudent; if (!a) return;\n    $('#app').innerHTML = `<div class=\"loading\"><div class=\"spinner\"></div> Loading ${esc(a.name)}…</div>`;\n    try { S.me = await call('getStudent', a.section, a.name); S.testAs = true; S.view = 'dash'; render(); }\n    catch (e) { render(); toast('Could not load: ' + e.message); }\n  },\n  'test-as-off'() { S.testAs = false; S.me = null; S.view = 'dash'; S.T.overview = null; loadSection(S.T.section); },\n  self(t) { const sk = t.dataset.skill, n = parseInt(t.dataset.n, 10); if (S.form.selfStages[sk] === n) delete S.form.selfStages[sk]; else S.form.selfStages[sk] = n; Array.from(t.parentElement.children).forEach(b => { b.className = ''; }); if (S.form.selfStages[sk]) t.className = 'on st' + n; },\n  'self-outcome'(t) { const k = t.dataset.outcome, n = parseInt(t.dataset.n, 10); if (S.form.selfOutcomes[k] === n) delete S.form.selfOutcomes[k]; else S.form.selfOutcomes[k] = n; Array.from(t.parentElement.children).forEach(b => { b.className = ''; }); if (S.form.selfOutcomes[k]) t.className = 'on st' + n; },\n  'focus-skill'(t) { const v = t.dataset.v; const changed = S.form.focusSkill !== v; S.form.focusSkill = v; S.form.showFocusPick = false; if (changed) { S.form.drillStep = 0; if (S.form.mode === 'early' && !S.form.goalTouched) S.form.goal = draftGoal(S.me, v, S.cp.name, num(S.form.scores[v])); } render(); },\n  'toggle-focus-pick'() { S.form.showFocusPick = !S.form.showFocusPick; render(); },\n  'goal-redraft'() { if (S.form.focusSkill) { S.form.goal = draftGoal(S.me, S.form.focusSkill, S.cp.name, num(S.form.scores[S.form.focusSkill])); S.form.goalTouched = false; render(); } },\n  'drill-step'(t) { S.form.drillStep = parseInt(t.dataset.n, 10); render(); },\n  't-section'(t) { S.T.lesson = null; S.T.cpName = ''; loadSection(t.dataset.v); },\n  't-sport'(t) { S.T.sport = t.dataset.v; S.T.overview = null; render(); if (S.T.tab === 'overview') loadOverview(); },\n  't-tab'(t) { S.T.tab = t.dataset.tab; S.T.viewing = null; render(); if (S.T.tab === 'overview' && !S.T.overview) loadOverview(); },\n  't-back'() { S.T.tab = 'students'; S.T.viewing = null; render(); },\n  't-lesson'(t) { S.T.lesson = parseInt(t.dataset.n, 10); render(); },\n  't-cp'(t) { S.T.cpName = t.dataset.v; render(); },\n  't-open-student'(t) { openStudentAsTeacher(t.dataset.student); },\n  't-confirm'(t) { const c = tCheckin(t.dataset.student); c.confirmed = !c.confirmed; putTeacherCheckin(t.dataset.student, { confirmed: c.confirmed }); render(); },\n  't-eng'(t) { const c = tCheckin(t.dataset.student), n = parseInt(t.dataset.n, 10); c.engagement = c.engagement === n ? null : n; putTeacherCheckin(t.dataset.student, { engagement: c.engagement }); render(); },\n  't-game'(t) { const c = tCheckin(t.dataset.student), n = parseInt(t.dataset.n, 10); c.gamePlay = c.gamePlay === n ? null : n; putTeacherCheckin(t.dataset.student, { gamePlay: c.gamePlay }); render(); },\n  't-pers'(t) { const c = tCheckin(t.dataset.student), n = parseInt(t.dataset.n, 10); c.personal = c.personal === n ? null : n; putTeacherCheckin(t.dataset.student, { personal: c.personal }); render(); },\n  't-expand'(t) { S.T.expanded[t.dataset.student] = !S.T.expanded[t.dataset.student]; render(); },\n  't-outcome'(t) { const student = t.dataset.student, outcome = t.dataset.outcome; const x = S.T.data.outcomes.find(y => y.student === student && y.checkpoint === S.T.cpName && y.outcome === outcome); const cur = x && x.teacher ? x.teacher : 0; const next = cur >= 3 ? null : cur + 1; setOutcome(student, outcome, next); t.className = 'cyc sm ' + (next ? 'st' + next : ''); t.innerHTML = (next || '–') + `<small>self ${x && x.self ? x.self : '–'}</small>`; },\n  reg(t) { const student = t.dataset.student, n = parseInt(t.dataset.n, 10); const e = regEntry(student, S.T.lesson); setRegister(student, S.T.lesson, { participation: e && e.participation === n ? null : n }); render(); },\n  'reg-all'(t) { const n = parseInt(t.dataset.n, 10); groupRoster().forEach(r => { const e = regEntry(r.student, S.T.lesson); if (!e || !e.participation) setRegister(r.student, S.T.lesson, { participation: n }); }); render(); },\n  grade(t) { const student = t.dataset.student, code = t.dataset.code, n = parseInt(t.dataset.n, 10); const o = S.T.overview.find(x => x.student === student); const cur = o && o.final[code] && o.final[code].score; setGrade(student, code, { score: cur === n ? null : n }); render(); },\n  'grade-comment'(t) { const student = t.dataset.student, code = t.dataset.code; const o = S.T.overview.find(x => x.student === student); const cur = (o && o.final[code] && o.final[code].comment) || ''; const v = window.prompt(`Comment for ${student} · ${code}`, cur); if (v === null) return; setGrade(student, code, { comment: v.trim() }); render(); },\n  'accept-sug'() { let n = 0; S.T.overview.forEach(o => { S.cfg.criteria.forEach(c => { const sug = o.suggested[c.code]; if (sug && !(o.final[c.code] && o.final[c.code].score)) { setGrade(o.student, c.code, { score: sug }); n++; } }); }); render(); toast(`Accepted ${n} suggested grade${n === 1 ? '' : 's'} — adjust any you disagree with`); },\n  'ov-refresh'() { S.T.overview = null; render(); loadOverview(); },\n  'print-mode'(t) { S.T.printMode = t.dataset.v; render(); },\n  print() { window.print(); }\n};\ndocument.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (!t) return; if (t.tagName === 'A') e.preventDefault(); const fn = actions[t.dataset.act]; if (fn) fn(t, e); });\ndocument.addEventListener('input', e => {\n  const t = e.target; const k = t.dataset && t.dataset.in; if (!k) return;\n  if (k === 'wentWell' || k === 'nextGoal') S.form[k] = t.value;\n  if (k === 'goal') { S.form.goal = t.value; S.form.goalTouched = true; }\n  if (k === 'extensionSkill' || k === 'extensionDrill') S.form[k] = t.value;\n  if (k === 'score') { S.form.scores[t.dataset.skill] = t.value; const pill = document.querySelector(`[data-stage-for=\"${CSS.escape(t.dataset.skill)}\"]`); if (pill) { const st = stageOf(num(t.value)); pill.className = 'stage-pill st' + st; pill.textContent = st ? stageName(st) : '–'; } }\n});\ndocument.addEventListener('change', e => {\n  const t = e.target; const k = t.dataset && t.dataset.in; if (!k) return;\n  if (k === 'reg-note') setRegister(t.dataset.student, S.T.lesson, { note: t.value.trim() });\n  if (k === 'tscore') setTeacherScore(t.dataset.student, t.dataset.skill, t.value);\n  if (k === 'score' && S.form && S.form.mode === 'early') { if (!S.form.goalTouched && S.form.focusSkill) S.form.goal = draftGoal(S.me, S.form.focusSkill, S.cp.name, num(S.form.scores[S.form.focusSkill])); render(); }\n});\n\nboot();\n})();\n<\/script>\n"
};
