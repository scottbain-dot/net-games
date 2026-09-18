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
//   • End: retest everything + final reflection. Agility test runs alongside.
//
// Setup: see docs/TEACHER-GUIDE.md. Menu "PE Tracker" → 1. Set up tabs.
// Deploy as Web app: Execute as Me, access "Anyone within <school>".
// =============================================================

// ---------- Tab definitions ----------
var CONFIG_TABS = {
  Config:   ['Key', 'Value', 'What it does'],
  Lessons:  ['Number', 'Title', 'Checkpoint', 'Date', 'Sport'],
  Skills:   ['Sport', 'Skill', 'Test', 'Success'],
  Drills:   ['Sport', 'Skill', 'Step', 'Drill', 'Criteria'],
  Focus:    ['Focus', 'Cue'],
  Outcomes: ['Outcome', 'LooksLike'],
  Criteria: ['Code', 'Name', 'Evidence', 'TopBand'],
  Roster:   ['Section', 'Sport', 'Student', 'Email'],
  Teachers: ['Email', 'Name', 'Sport']
};
var DATA_TABS = {
  Register:   ['Section', 'Sport', 'Student', 'Lesson', 'Participation', 'Note', 'Updated'],
  SkillTests: ['Section', 'Sport', 'Student', 'Checkpoint', 'Skill', 'Score', 'Updated'],
  Agility:    ['Section', 'Sport', 'Student', 'Baseline', 'Retest', 'Updated'],
  Checkins:   ['Section', 'Sport', 'Student', 'Checkpoint', 'FocusSkill', 'Goal', 'DrillStep', 'AgilityFocus', 'SelfStages', 'WentWell', 'NextGoal', 'Updated'],
  OutcomeRatings: ['Section', 'Sport', 'Student', 'Checkpoint', 'Outcome', 'Self', 'Teacher', 'Updated'],
  Grades:     ['Section', 'Sport', 'Student', 'Criterion', 'Score', 'Comment', 'Updated']
};
var DATA_KEYS = {
  Register:   ['Section', 'Student', 'Lesson'],
  SkillTests: ['Section', 'Student', 'Checkpoint', 'Skill'],
  Agility:    ['Section', 'Student'],
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
  test_name:            ['Illinois Agility Test', 'The common fitness test run alongside every sport (blank for none)'],
  test_unit:            ['seconds', 'Unit for the fitness test'],
  test_lower_is_better: ['TRUE', 'TRUE for times, FALSE for counts/distances'],
  test_top_gain:        ['2', 'Improvement (in test units, after handicap) that earns the top band'],
  goal_template:        ['Move my {skill} from {stage} ({score}/{max}) to {nextStage} ({target}+/{max}) by the {checkpoint} check-in by working through drill steps {steps}.', 'Draft goal shown to the student. Placeholders in {braces} are filled in.'],
  reflection_prompt_1:  ['What went well and what has improved?', 'First reflection question at each check-in'],
  reflection_prompt_2:  ['What will I do differently in the next lessons?', 'Second reflection question at each check-in'],
  show_grades_to_students: ['FALSE', 'TRUE to show final grades and comments on the student dashboard']
};
var CACHE_KEY_CONFIG = 'mfs_config_v2';
var CACHE_SECONDS = 180;
var EVIDENCE_TYPES = ['test', 'reflection', 'participation', 'skills', 'outcomes', 'none'];

// ---------- Example unit (seeded only into EMPTY tabs — edit freely) ----------
var EXAMPLE = {
  Lessons: [
    [1, 'Intro · skill tests · agility baseline', 'Early',  '', ''],
    [2, 'Drills & peer checks',                   '',       '', ''],
    [3, 'Drills & peer checks',                   '',       '', ''],
    [4, 'Drills & game play',                     '',       '', ''],
    [5, 'Mid check-in · quick retest of focus skill', 'Middle', '', ''],
    [6, 'Drills & peer checks',                   '',       '', ''],
    [7, 'Drills & game play',                     '',       '', ''],
    [8, 'Game play · prepare for retests',        '',       '', ''],
    [9, 'Retests · agility re-test · final check-in', 'End', '', '']
  ],
  Skills: [
    ['Net Games',    'Serve',            '10 serves into the target zone',                       'Lands in the zone, legal serve'],
    ['Net Games',    'Overhead shot',    '10 fed shuttles/balls, hit to the back third',         'Clears the net and lands in the back third'],
    ['Net Games',    'Net shot',         '10 fed shuttles/balls, play into the front zone',      'Clears the net and lands in the front zone'],
    ['Net Games',    'Rally',            '10 shots in a cooperative rally with a partner',       'Shot stays in and partner can return it'],
    ['Ultimate',     'Backhand throw',   '10 throws to a partner 10 m away',                     'Catchable at chest height without moving'],
    ['Ultimate',     'Forehand throw',   '10 throws to a partner 10 m away',                     'Catchable at chest height without moving'],
    ['Ultimate',     'Catching',         '10 throws from a partner, mixed height',               'Two-hand catch, disc held'],
    ['Ultimate',     'Pivot & fake',     '10 throws against a live mark',                        'Throw gets past the mark to a target'],
    ['Table Tennis', 'Serve',            '10 serves to the diagonal half',                       'Legal serve landing in the diagonal half'],
    ['Table Tennis', 'Forehand drive',   '10 fed balls, forehand drive',                         'On the table, past the middle'],
    ['Table Tennis', 'Backhand push',    '10 fed balls, backhand push',                          'On the table, low over the net'],
    ['Table Tennis', 'Rally',            '10 shots in a cooperative rally',                      'On the table and returnable'],
    ['Handball',     'Pass & catch',     '10 passes on the move over 5 m',                       'Caught cleanly by the partner'],
    ['Handball',     'Dribble',          '10 runs through 5 cones, 10 m',                         'Ball under control, no double dribble, no cone missed'],
    ['Handball',     'Jump shot',        '10 shots from the 9 m line over a passive defender',   'On target from a legal jump'],
    ['Handball',     '1v1 defending',    '10 attacks by a partner',                              'Attacker stopped without a foul']
  ],
  Drills: [
    ['Net Games', 'Serve', 1, 'Shadow & toss', 'Stance, toss and contact point look the same 5 times in a row'],
    ['Net Games', 'Serve', 2, 'Serve to a big target', '7 of 10 into the half-court'],
    ['Net Games', 'Serve', 3, 'Serve to a small target', '6 of 10 into a hoop or zone'],
    ['Net Games', 'Serve', 4, 'Serve under pressure', '6 of 10 in a game situation, partner returns'],
    ['Net Games', 'Overhead shot', 1, 'Shadow the swing', 'Side-on, elbow high, contact above head — partner checks 5 times'],
    ['Net Games', 'Overhead shot', 2, 'Fed shots, no net', '7 of 10 clean contacts'],
    ['Net Games', 'Overhead shot', 3, 'Fed shots over the net', '6 of 10 land in the back third'],
    ['Net Games', 'Overhead shot', 4, 'Rally then overhead', 'Play 3 rally shots then an overhead to the back — 5 of 10'],
    ['Net Games', 'Net shot', 1, 'Catch & place', 'Catch/stop 5 fed shuttles, then place over the net softly'],
    ['Net Games', 'Net shot', 2, 'Fed net shots', '6 of 10 land in the front zone'],
    ['Net Games', 'Net shot', 3, 'Net shot in a rally', 'Rally, then net shot on partner\'s call — 5 of 10'],
    ['Net Games', 'Rally', 1, 'Cooperative rally, big court', '5 in a row, twice'],
    ['Net Games', 'Rally', 2, 'Cooperative rally, half court', '8 in a row, twice'],
    ['Net Games', 'Rally', 3, 'Rally with a move', 'Partner moves you front/back — 6 in a row'],
    ['Ultimate', 'Backhand throw', 1, 'Grip & wrist snap', 'Disc flies flat 5 m, 5 in a row'],
    ['Ultimate', 'Backhand throw', 2, 'Step & throw 10 m', '7 of 10 catchable'],
    ['Ultimate', 'Backhand throw', 3, 'Throw to a moving target', '6 of 10 catchable on the run'],
    ['Ultimate', 'Forehand throw', 1, 'Grip & wrist snap', 'Disc flies flat 5 m, 5 in a row'],
    ['Ultimate', 'Forehand throw', 2, 'Step & throw 10 m', '7 of 10 catchable'],
    ['Ultimate', 'Forehand throw', 3, 'Throw to a moving target', '6 of 10 catchable on the run'],
    ['Ultimate', 'Catching', 1, 'Pancake catch, standing', '8 of 10 from 5 m'],
    ['Ultimate', 'Catching', 2, 'Two-hand rim catch, high & low', '7 of 10 mixed height'],
    ['Ultimate', 'Catching', 3, 'Catch on the run', '6 of 10 while cutting'],
    ['Ultimate', 'Pivot & fake', 1, 'Pivot foot only', 'Pivot 10 times without lifting the foot'],
    ['Ultimate', 'Pivot & fake', 2, 'Fake then throw, passive mark', '7 of 10 past the mark'],
    ['Ultimate', 'Pivot & fake', 3, 'Live mark, stall count', '5 of 10 past an active mark'],
    ['Table Tennis', 'Serve', 1, 'Toss & contact', 'Legal toss and contact 5 times in a row'],
    ['Table Tennis', 'Serve', 2, 'Serve to the diagonal', '7 of 10 legal into the diagonal half'],
    ['Table Tennis', 'Serve', 3, 'Serve to a target', '6 of 10 into a paper target'],
    ['Table Tennis', 'Forehand drive', 1, 'Shadow swing', 'Low to high, partner checks 5 times'],
    ['Table Tennis', 'Forehand drive', 2, 'Fed balls', '7 of 10 on the table'],
    ['Table Tennis', 'Forehand drive', 3, 'Forehand rally', '6 in a row with a partner'],
    ['Table Tennis', 'Backhand push', 1, 'Shadow push', 'Open bat, short push, partner checks 5 times'],
    ['Table Tennis', 'Backhand push', 2, 'Fed balls', '7 of 10 on the table, low'],
    ['Table Tennis', 'Backhand push', 3, 'Push rally', '6 in a row with a partner'],
    ['Table Tennis', 'Rally', 1, 'Cooperative rally', '5 in a row, twice'],
    ['Table Tennis', 'Rally', 2, 'Forehand-backhand alternate', '6 in a row alternating'],
    ['Table Tennis', 'Rally', 3, 'Rally to targets', '6 in a row to called sides'],
    ['Handball', 'Pass & catch', 1, 'Standing pass 5 m', '8 of 10 caught cleanly'],
    ['Handball', 'Pass & catch', 2, 'Pass on the move', '7 of 10 caught cleanly while jogging'],
    ['Handball', 'Pass & catch', 3, 'Pass with a passive defender', '6 of 10 completed'],
    ['Handball', 'Dribble', 1, 'Stationary dribble', '20 bounces each hand without losing control'],
    ['Handball', 'Dribble', 2, 'Dribble through cones', 'Through 5 cones without a mistake, twice'],
    ['Handball', 'Dribble', 3, 'Dribble & pass under pressure', '6 of 10 vs a passive defender'],
    ['Handball', 'Jump shot', 1, 'Three-step & jump, no ball', 'Correct footwork 5 times in a row'],
    ['Handball', 'Jump shot', 2, 'Jump shot at goal', '7 of 10 on target'],
    ['Handball', 'Jump shot', 3, 'Jump shot over a defender', '5 of 10 on target'],
    ['Handball', '1v1 defending', 1, 'Defensive stance & shuffle', 'Stays low and between attacker and goal for 20 s'],
    ['Handball', '1v1 defending', 2, 'Shadow the attacker', 'Stops 6 of 10 walking attacks'],
    ['Handball', '1v1 defending', 3, 'Live 1v1', 'Stops 5 of 10 live attacks without a foul']
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
  Outcomes: [
    ['Self-management', 'Starts the drill without being told, keeps the paper log up to date, uses the time well'],
    ['Perseverance',    'Keeps going when a step is hard and repeats it until the criteria are met'],
    ['Collaboration',   'Gives honest peer checks and useful feedback; shares space and equipment'],
    ['Independence',    'Chooses the right drill step, moves on only after sign-off, asks for help at the right moment']
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
    return { number: num_(r.Number), title: str_(r.Title), checkpoint: str_(r.Checkpoint), date: str_(r.Date), sport: str_(r.Sport) };
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

  var focus = readTab_('Focus').map(function(r) { return { focus: str_(r.Focus), cue: str_(r.Cue) }; }).filter(function(f) { return f.focus; });
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
    test: { name: kv.test_name, unit: kv.test_unit, lowerIsBetter: bool_(kv.test_lower_is_better), topGain: num_(kv.test_top_gain) || 2 },
    goalTemplate: kv.goal_template,
    reflectionPrompts: [kv.reflection_prompt_1, kv.reflection_prompt_2],
    showGradesToStudents: bool_(kv.show_grades_to_students),
    lessons: lessons, sports: sports, skills: skills, checkpoints: checkpoints,
    focus: focus, outcomes: outcomes, criteria: criteria, sections: sections, roster: roster, teachers: teachers
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
  if (email && (email === owner || t)) { out.role = 'teacher'; out.sport = t ? t.sport : ''; return out; }
  var me = email ? cfg.roster.filter(function(r) { return r.email === email; })[0] : null;
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
  var out = { config: publicConfig_(cfg), identity: id, appUrl: ScriptApp.getService().getUrl() };
  if (id.role === 'student') out.student = studentData_(cfg, id.section, id.name);
  return out;
}

// ---------- Reads ----------
function rowsFor_(name, section, student) {
  return readTab_(name).filter(function(r) { return str_(r.Section) === section && (!student || str_(r.Student) === student); });
}
function parseSelf_(s) { try { var o = JSON.parse(s || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; } }
function mapRegister_(r) { return { student: str_(r.Student), lesson: num_(r.Lesson), participation: num_(r.Participation), note: str_(r.Note) }; }
function mapTest_(r) { return { student: str_(r.Student), checkpoint: str_(r.Checkpoint), skill: str_(r.Skill), score: num_(r.Score) }; }
function mapCheckin_(r) { return { student: str_(r.Student), checkpoint: str_(r.Checkpoint), focusSkill: str_(r.FocusSkill), goal: str_(r.Goal), drillStep: num_(r.DrillStep), agilityFocus: str_(r.AgilityFocus), selfStages: parseSelf_(r.SelfStages), wentWell: str_(r.WentWell), nextGoal: str_(r.NextGoal) }; }
function mapOutcome_(r) { return { student: str_(r.Student), checkpoint: str_(r.Checkpoint), outcome: str_(r.Outcome), self: num_(r.Self), teacher: num_(r.Teacher) }; }
function mapGrade_(r) { return { student: str_(r.Student), criterion: str_(r.Criterion), score: num_(r.Score), comment: str_(r.Comment) }; }

function studentData_(cfg, section, student) {
  var r = rosterEntry_(cfg, section, student) || { sport: '' };
  var classRegister = rowsFor_('Register', section);
  var lessonsRun = {};
  classRegister.forEach(function(x) { if (num_(x.Participation) && str_(x.Sport) === r.sport) lessonsRun[num_(x.Lesson)] = true; });
  var ag = rowsFor_('Agility', section, student)[0] || {};
  return {
    section: section, sport: r.sport, student: student,
    lessonsRun: Object.keys(lessonsRun).length,
    register: classRegister.filter(function(x) { return str_(x.Student) === student; }).map(mapRegister_),
    tests: rowsFor_('SkillTests', section, student).map(mapTest_),
    checkins: rowsFor_('Checkins', section, student).map(mapCheckin_),
    outcomes: rowsFor_('OutcomeRatings', section, student).map(mapOutcome_),
    agility: { baseline: num_(ag.Baseline), retest: num_(ag.Retest) },
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
  var agility = {};
  rowsFor_('Agility', section).forEach(function(r) { agility[str_(r.Student)] = { baseline: num_(r.Baseline), retest: num_(r.Retest) }; });
  return {
    section: section,
    register: rowsFor_('Register', section).map(mapRegister_),
    tests: rowsFor_('SkillTests', section).map(mapTest_),
    checkins: rowsFor_('Checkins', section).map(mapCheckin_),
    outcomes: rowsFor_('OutcomeRatings', section).map(mapOutcome_),
    agility: agility,
    grades: rowsFor_('Grades', section).map(mapGrade_)
  };
}

// ---------- Writes (one request per user action) ----------
function clampInt_(v, lo, hi) { var n = parseInt(v, 10); return isNaN(n) ? null : Math.max(lo, Math.min(hi, n)); }
function blankOr_(v, lo, hi) { if (v === null || v === undefined || v === '') return ''; var n = clampInt_(v, lo, hi); return n === null ? '' : n; }

// Student check-in (or teacher on their behalf).
// payload: { section, student, checkpoint, focusSkill, goal, drillStep, agilityFocus, selfStages:{skill:1-3}, wentWell, nextGoal }
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
    AgilityFocus: str_(payload.agilityFocus).slice(0, 80), SelfStages: JSON.stringify(self),
    WentWell: str_(payload.wentWell).slice(0, 600), NextGoal: str_(payload.nextGoal).slice(0, 600) };
  var outcomeRows = [];
  Object.keys(payload.selfOutcomes || {}).forEach(function(k) {
    if (!cfg.outcomes.some(function(o) { return o.outcome === k; })) return;
    var n = clampInt_(payload.selfOutcomes[k], 1, 3); if (!n) return;
    outcomeRows.push({ Section: who.section, Sport: who.sport, Student: who.student, Checkpoint: cp, Outcome: k, Self: n });
  });
  return withLock_(function() { upsert_('Checkins', [row]); if (outcomeRows.length) upsert_('OutcomeRatings', outcomeRows); return { ok: true }; });
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
// entries: [{student, baseline, retest}]
function saveAgility(payload) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var section = str_(payload.section);
  var rows = (payload.entries || []).map(function(e) {
    var r = { Section: section, Sport: sportOf_(cfg, section, str_(e.student)), Student: str_(e.student) };
    if ('baseline' in e) r.Baseline = num_(e.baseline) === null ? '' : num_(e.baseline);
    if ('retest' in e) r.Retest = num_(e.retest) === null ? '' : num_(e.retest);
    return r;
  }).filter(function(r) { return r.Student; });
  return withLock_(function() { return { ok: true, saved: upsert_('Agility', rows) }; });
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
  var T = cfg.test.topGain;
  var agilityBand = function(adj) {
    if (adj >= T) return 7; if (adj >= 0.65 * T) return 6; if (adj >= 0.35 * T) return 5;
    if (adj > 0.05) return 4; if (adj >= -0.05) return 3; if (adj > -0.5 * T) return 2; return 1;
  };
  // Focus-skill gain in points out of scoreMax → 1-7. Reaching the top stage from below also counts.
  var skillBand = function(gain, endStage, startStage) {
    var g = gain * 10 / cfg.scoreMax;
    var b = g >= 5 ? 7 : g >= 4 ? 6 : g >= 3 ? 5 : g >= 2 ? 4 : g >= 1 ? 3 : g >= 0 ? 2 : 1;
    if (endStage > startStage) b = Math.max(b, 4 + (endStage - startStage));
    return Math.min(7, b);
  };
  // Cohort mean baseline for the fast-starter handicap (whole section, all sports)
  var bases = [];
  cfg.roster.filter(function(r) { return r.section === section; }).forEach(function(r) { var t = data.agility[r.student]; if (t && t.baseline) bases.push(t.baseline); });
  var refBaseline = bases.length ? bases.reduce(function(a, b) { return a + b; }, 0) / bases.length : 0;

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
    var nCheckins = ordered.filter(function(c) { return c.focusSkill || c.wentWell || c.nextGoal || c.agilityFocus; }).length;
    var nReflected = ordered.filter(function(c) { return c.wentWell && c.nextGoal; }).length;
    var chosenAtUnderstanding = focus && fStart !== null ? stageOf_(cfg, fStart) === 1 : null;

    // personal-skill outcomes: latest teacher rating per outcome, and self
    var oRows = data.outcomes.filter(function(x) { return x.student === name; });
    var tLatest = {}, sLatest = {};
    cps.forEach(function(c) { oRows.filter(function(x) { return x.checkpoint === c.name; }).forEach(function(x) { if (x.teacher) tLatest[x.outcome] = x.teacher; if (x.self) sLatest[x.outcome] = x.self; }); });
    var tVals = Object.keys(tLatest).map(function(k) { return tLatest[k]; }), sVals = Object.keys(sLatest).map(function(k) { return sLatest[k]; });
    var outcomesTeacher = tVals.length ? tVals.reduce(function(a, b) { return a + b; }, 0) / tVals.length : null;
    var outcomesSelf = sVals.length ? sVals.reduce(function(a, b) { return a + b; }, 0) / sVals.length : null;

    var ag = data.agility[name] || {};
    var change = null, adj = null;
    if (typeof ag.baseline === 'number' && ag.baseline > 0 && typeof ag.retest === 'number') {
      var gain = cfg.test.lowerIsBetter ? ag.baseline - ag.retest : ag.retest - ag.baseline;
      change = ag.retest - ag.baseline;
      var factor = refBaseline > 0 ? (cfg.test.lowerIsBetter ? Math.max(1, refBaseline / ag.baseline) : Math.max(1, ag.baseline / refBaseline)) : 1;
      adj = gain * factor;
    }

    var suggested = {};
    cfg.criteria.forEach(function(c) {
      var s = null;
      if (c.evidence === 'test') {
        var parts = [];
        if (fGain !== null) parts.push(skillBand(fGain, stageOf_(cfg, fEnd), stageOf_(cfg, fStart)));
        if (adj !== null) parts.push(agilityBand(adj));
        if (parts.length) s = Math.round(parts.reduce(function(a, b) { return a + b; }, 0) / parts.length);
      }
      if (c.evidence === 'participation' && partAvg !== null) s = band(clamp01((partAvg - 1) / 2) * 0.7 + clamp01(reg.length / nLessons) * 0.3);
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
      checkins: nCheckins, reflections: nReflected, selfAccuracy: selfAcc,
      focus: focus, goal: goal, drillStep: drillStep, maxSteps: maxSteps, chosenAtUnderstanding: chosenAtUnderstanding,
      focusStart: fStart, focusEnd: fEnd, focusGain: fGain, focusStageStart: stageOf_(cfg, fStart), focusStageEnd: stageOf_(cfg, fEnd),
      allStart: allStart, allEnd: allEnd, stagesEnd: stagesEnd,
      outcomesTeacher: outcomesTeacher, outcomesSelf: outcomesSelf, outcomesDetail: tLatest,
      agility: { baseline: typeof ag.baseline === 'number' ? ag.baseline : null, retest: typeof ag.retest === 'number' ? ag.retest : null, change: change, adjusted: adj },
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
  ['Lessons', 'Skills', 'Drills', 'Focus', 'Outcomes', 'Criteria'].forEach(function(n) {
    var t = tab_(n);
    if (t.getLastRow() < 2 && EXAMPLE[n]) t.getRange(2, 1, EXAMPLE[n].length, EXAMPLE[n][0].length).setValues(EXAMPLE[n]);
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

function showAppLink() {
  var url = ScriptApp.getService().getUrl();
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
  var header = ['Section', 'Sport', 'Student', 'Lessons attended', 'Lessons run', 'Participation avg (1-3)',
    'Check-ins', 'Reflections', 'Self-assessment accuracy', 'Focus skill', 'Chosen at ' + cfg.stageLabels[0] + '?', 'Drill step',
    'Focus start', 'Focus end', 'Focus gain', 'Stage start', 'Stage end', 'All skills start (mean)', 'All skills end (mean)',
    cfg.test.name + ' baseline', cfg.test.name + ' retest', 'Change', 'Adjusted gain'];
  cfg.outcomes.forEach(function(o) { header.push(o.outcome + ' (teacher)'); });
  header.push('Outcomes self avg');
  cfg.criteria.forEach(function(c) { header.push(c.code + ' suggested'); header.push(c.code + ' final'); header.push(c.code + ' comment'); });
  var rows = [header];
  var fmt = function(v, d) { return v === null || v === undefined ? '' : (typeof v === 'number' ? Number(v.toFixed(d === undefined ? 2 : d)) : v); };
  var stage = function(n) { return n ? cfg.stageLabels[n - 1] : ''; };
  cfg.sections.forEach(function(section) {
    var data = getSectionData(section);
    computeOverview_(cfg, section, '', data).forEach(function(o) {
      var row = [section, o.sport, o.student, o.lessonsAttended, o.lessonsRun, fmt(o.participationAvg),
        o.checkins, o.reflections, o.selfAccuracy === null ? '' : Math.round(o.selfAccuracy * 100) + '%', o.focus,
        o.chosenAtUnderstanding === null ? '' : (o.chosenAtUnderstanding ? 'yes' : 'no'), o.maxSteps ? (o.drillStep || 0) + ' / ' + o.maxSteps : '',
        fmt(o.focusStart), fmt(o.focusEnd), fmt(o.focusGain), stage(o.focusStageStart), stage(o.focusStageEnd), fmt(o.allStart, 1), fmt(o.allEnd, 1),
        fmt(o.agility.baseline), fmt(o.agility.retest), fmt(o.agility.change), fmt(o.agility.adjusted)];
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
  Styles: "<style>\n* { margin: 0; padding: 0; box-sizing: border-box; }\n:root {\n  --bg: #f5f4f0; --card: #fff; --line: #e6e4df; --ink: #1a1a1a; --muted: #6f6f6f; --faint: #a8a8a8;\n  --blue: #2E86DE; --green: #1D9E75; --coral: #E8735A; --purple: #6C3FC5; --amber: #F0A500; --red: #d64545;\n  --lv1: #F0A500; --lv2: #1D9E75; --lv3: #2E86DE; --lv4: #6C3FC5;\n  --p1: #E8735A; --p2: #2E86DE; --p3: #1D9E75;\n}\nhtml { -webkit-text-size-adjust: 100%; }\nbody {\n  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;\n  background: var(--bg); color: var(--ink); line-height: 1.4; -webkit-tap-highlight-color: transparent;\n}\nbutton { font: inherit; color: inherit; cursor: pointer; }\ninput, select, textarea { font: inherit; color: inherit; }\na { color: var(--blue); }\n\n#app { max-width: 1120px; margin: 0 auto; padding: 18px 16px 60px; }\n.loading { display: flex; align-items: center; justify-content: center; gap: 10px; min-height: 60vh; color: var(--muted); }\n.spinner { width: 26px; height: 26px; border: 3px solid #e0e0e0; border-top-color: var(--blue); border-radius: 50%; animation: spin .7s linear infinite; }\n@keyframes spin { to { transform: rotate(360deg); } }\n\n/* ── banners ── */\n.banner { position: fixed; left: 0; right: 0; top: 0; z-index: 900; padding: 10px 16px; font-size: .88rem; text-align: center; display: none; }\n.banner.show { display: block; }\n.banner.err { background: var(--red); color: #fff; }\n.banner.warn { background: #fff3cd; color: #6b4e00; border-bottom: 1px solid #f0d78a; }\n.banner button { margin-left: 12px; padding: 4px 12px; border-radius: 8px; border: 1px solid currentColor; background: transparent; }\n.toast { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); background: #222; color: #fff; padding: 9px 16px; border-radius: 10px; font-size: .85rem; opacity: 0; transition: opacity .2s; pointer-events: none; z-index: 950; }\n.toast.show { opacity: 1; }\n\n/* ── header ── */\n.topbar { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 18px; }\n.topbar .title { font-size: 1.35rem; font-weight: 700; letter-spacing: -.01em; }\n.topbar .sub { color: var(--muted); font-size: .85rem; }\n.topbar .grow { flex: 1; }\n.pill-btn { padding: 7px 13px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); font-size: .82rem; }\n.pill-btn:hover { background: #f8f6f2; }\n.pill-btn.primary { background: var(--blue); border-color: var(--blue); color: #fff; }\n.pill-btn.primary:disabled { opacity: .55; cursor: default; }\n.pill-btn.small { padding: 4px 10px; font-size: .76rem; }\n.avatar { width: 38px; height: 38px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: .78rem; flex-shrink: 0; }\n\n/* ── nav tabs ── */\n.tabs { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }\n.tab { padding: 8px 14px; border-radius: 10px; border: 1px solid var(--line); background: var(--card); font-size: .85rem; color: var(--muted); }\n.tab.active { background: var(--ink); color: #fff; border-color: var(--ink); }\n.subtabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 4px 0 14px; }\n.subtab { padding: 6px 11px; border-radius: 999px; border: 1px solid var(--line); background: var(--card); font-size: .8rem; }\n.subtab.active { background: var(--blue); border-color: var(--blue); color: #fff; }\n.subtab .tiny { display: block; font-size: .68rem; opacity: .75; }\n\n/* ── cards ── */\n.grid { display: grid; gap: 14px; }\n.grid.cols-2 { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); }\n.grid.cols-3 { grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }\n.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.04); margin-bottom: 14px; }\n.card-head { padding: 11px 16px; font-size: .78rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #fff; background: var(--blue); display: flex; align-items: center; gap: 10px; }\n.card-head.green { background: var(--green); } .card-head.coral { background: var(--coral); } .card-head.purple { background: var(--purple); } .card-head.dark { background: #333; } .card-head.amber { background: var(--amber); }\n.card-head .right { margin-left: auto; font-weight: 500; text-transform: none; letter-spacing: 0; opacity: .9; }\n.card-body { padding: 16px; }\n.muted { color: var(--muted); } .faint { color: var(--faint); } .small { font-size: .8rem; } .tiny { font-size: .72rem; }\n.hint { font-size: .8rem; color: var(--muted); margin-top: 6px; }\n.empty { color: var(--faint); font-size: .85rem; padding: 10px 0; }\n\n/* ── checkpoint strip ── */\n.cp-strip { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 14px; }\n.cp-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; }\n.cp-card.done { border-color: var(--green); }\n.cp-card.next { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(46,134,222,.12); }\n.cp-card .cp-name { font-weight: 700; font-size: 1.05rem; }\n.cp-card .cp-status { font-size: .8rem; }\n.cp-card .cp-status.done { color: var(--green); font-weight: 600; }\n.cp-card button { align-self: flex-start; margin-top: 4px; }\n\n/* ── progress table ── */\n.tbl-wrap { overflow-x: auto; }\ntable.tbl { border-collapse: collapse; width: 100%; font-size: .85rem; }\ntable.tbl th, table.tbl td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--line); vertical-align: middle; white-space: nowrap; }\ntable.tbl th { font-size: .72rem; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 600; background: #fafaf8; }\ntable.tbl td.c, table.tbl th.c { text-align: center; }\ntable.tbl tr.sport-row td { background: #f7f6f2; font-weight: 700; font-size: .78rem; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }\ntable.tbl td.skill { white-space: normal; min-width: 160px; }\ntable.tbl td.skill .cue { display: block; font-size: .72rem; color: var(--faint); }\n.chip { display: inline-flex; align-items: center; justify-content: center; min-width: 26px; height: 26px; padding: 0 6px; border-radius: 8px; font-weight: 700; font-size: .8rem; color: #fff; background: #ddd; }\n.chip.lv1 { background: var(--lv1); } .chip.lv2 { background: var(--lv2); } .chip.lv3 { background: var(--lv3); } .chip.lv4 { background: var(--lv4); }\n.chip.t { background: #fff; border: 2px solid #ccc; color: #999; }\n.chip.t.lv1 { border-color: var(--lv1); color: var(--lv1); } .chip.t.lv2 { border-color: var(--lv2); color: var(--lv2); } .chip.t.lv3 { border-color: var(--lv3); color: var(--lv3); } .chip.t.lv4 { border-color: var(--lv4); color: var(--lv4); }\n.chip.none { background: transparent; color: var(--faint); font-weight: 400; }\n.chip-pair { display: inline-flex; gap: 4px; }\n.legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: .76rem; color: var(--muted); margin-top: 10px; align-items: center; }\n.legend .chip { min-width: 22px; height: 22px; font-size: .7rem; }\n\n/* ── participation dots ── */\n.dots { display: flex; flex-wrap: wrap; gap: 8px; }\n.dot { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: .7rem; font-weight: 700; border: 2px solid var(--line); color: var(--faint); background: #fff; }\n.dot.p1 { background: var(--p1); border-color: var(--p1); color: #fff; } .dot.p2 { background: var(--p2); border-color: var(--p2); color: #fff; } .dot.p3 { background: var(--p3); border-color: var(--p3); color: #fff; }\n.dot.cp { box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--amber); }\n\n/* ── test card ── */\n.test-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }\n.test-box { background: #f8f7f3; border-radius: 12px; padding: 12px; text-align: center; }\n.test-box .label { font-size: .7rem; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }\n.test-box .value { font-size: 1.7rem; font-weight: 700; margin: 2px 0; }\n.test-box .value.empty { color: var(--faint); }\n.test-box .unit { font-size: .72rem; color: var(--faint); }\n.delta { margin-top: 10px; text-align: center; font-size: .9rem; padding: 8px; border-radius: 10px; background: #f0f0ee; }\n.delta.good { background: #e3f6ee; color: #0a5c35; } .delta.bad { background: #fdecea; color: #8a2a1e; }\n\n/* ── reflections ── */\n.refl { border-left: 3px solid var(--line); padding: 4px 12px; margin-bottom: 12px; }\n.refl .cp { font-weight: 700; font-size: .85rem; }\n.refl .q { font-size: .72rem; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; margin-top: 6px; }\n.refl .a { font-size: .9rem; white-space: pre-wrap; }\n.tag { display: inline-block; padding: 2px 9px; border-radius: 999px; background: #eef4fb; color: #1a4a7a; font-size: .74rem; font-weight: 600; }\n\n/* ── checkpoint form ── */\n.rate-row { display: grid; grid-template-columns: minmax(150px, 1.2fr) 2fr; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--line); }\n.rate-row:last-child { border-bottom: 0; }\n.rate-row .name { font-weight: 600; font-size: .9rem; }\n.rate-row .cue { font-size: .74rem; color: var(--faint); }\n.seg { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }\n.seg button { padding: 8px 4px; border-radius: 9px; border: 1px solid var(--line); background: #fff; font-size: .74rem; line-height: 1.15; color: var(--muted); }\n.seg button b { display: block; font-size: .95rem; color: var(--ink); }\n.seg button.on { color: #fff; border-color: transparent; }\n.seg button.on b { color: #fff; }\n.seg button.on.lv1 { background: var(--lv1); } .seg button.on.lv2 { background: var(--lv2); } .seg button.on.lv3 { background: var(--lv3); } .seg button.on.lv4 { background: var(--lv4); }\n.field { margin-bottom: 14px; }\n.field label { display: block; font-weight: 600; font-size: .88rem; margin-bottom: 6px; }\n.field textarea, .field select, .field input[type=text] { width: 100%; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }\n.field textarea { min-height: 80px; resize: vertical; }\n.focus-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; }\n.focus-btn { padding: 8px 10px; border-radius: 10px; border: 1px solid var(--line); background: #fff; text-align: left; font-size: .82rem; font-weight: 600; }\n.focus-btn span { display: block; font-size: .7rem; font-weight: 400; color: var(--faint); }\n.focus-btn.on { background: var(--blue); border-color: var(--blue); color: #fff; }\n.focus-btn.on span { color: rgba(255,255,255,.8); }\n.form-actions { display: flex; gap: 10px; align-items: center; margin-top: 8px; flex-wrap: wrap; }\n.form-actions .status { font-size: .8rem; color: var(--muted); }\n\n/* ── teacher register ── */\n.reg-row { display: grid; grid-template-columns: minmax(140px, 1fr) auto minmax(120px, 1.2fr); gap: 10px; align-items: center; padding: 7px 0; border-bottom: 1px solid var(--line); }\n.reg-row:last-child { border-bottom: 0; }\n.reg-row .name { font-weight: 600; font-size: .9rem; display: flex; align-items: center; gap: 8px; }\n.reg-row .avatar { width: 28px; height: 28px; font-size: .62rem; }\n.reg-row input { padding: 6px 9px; border: 1px solid var(--line); border-radius: 8px; font-size: .8rem; width: 100%; }\n.ppills { display: inline-flex; gap: 4px; }\n.ppills button { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: #fff; font-size: .76rem; color: var(--muted); }\n.ppills button.on { color: #fff; border-color: transparent; }\n.ppills button.on.p1 { background: var(--p1); } .ppills button.on.p2 { background: var(--p2); } .ppills button.on.p3 { background: var(--p3); }\n.toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }\n.toolbar .grow { flex: 1; }\n.savestate { font-size: .78rem; color: var(--muted); }\n.savestate.pending { color: var(--amber); } .savestate.failed { color: var(--red); font-weight: 600; }\n\n/* ── teacher rating grid ── */\ntable.tbl td.cell { text-align: center; }\n.cyc { min-width: 44px; height: 38px; border-radius: 9px; border: 1px solid var(--line); background: #fff; font-weight: 700; display: inline-flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1; gap: 2px; }\n.cyc small { font-size: .62rem; font-weight: 400; color: var(--faint); }\n.cyc.lv1 { background: var(--lv1); color: #fff; border-color: transparent; } .cyc.lv2 { background: var(--lv2); color: #fff; border-color: transparent; } .cyc.lv3 { background: var(--lv3); color: #fff; border-color: transparent; } .cyc.lv4 { background: var(--lv4); color: #fff; border-color: transparent; }\n.cyc.lv1 small, .cyc.lv2 small, .cyc.lv3 small, .cyc.lv4 small { color: rgba(255,255,255,.85); }\n.cyc.st1 { background: var(--st1); color: #fff; border-color: transparent; } .cyc.st2 { background: var(--st2); color: #fff; border-color: transparent; } .cyc.st3 { background: var(--st3); color: #fff; border-color: transparent; }\n.cyc.st1 small, .cyc.st2 small, .cyc.st3 small { color: rgba(255,255,255,.85); }\n.chip.t.st1 { border-color: var(--st1); color: var(--st1); background: #fff; } .chip.t.st2 { border-color: var(--st2); color: var(--st2); background: #fff; } .chip.t.st3 { border-color: var(--st3); color: var(--st3); background: #fff; }\n.num-in { width: 84px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; text-align: center; }\n\n/* ── overview / grades ── */\n.score-row { display: inline-flex; gap: 2px; }\n.score-row button { width: 23px; height: 24px; border-radius: 6px; border: 1px solid var(--line); background: #fff; font-size: .7rem; color: var(--muted); padding: 0; }\ntable.tbl.ov th, table.tbl.ov td { padding: 7px 7px; }\ntable.tbl .sticky { position: sticky; left: 0; background: #fff; z-index: 1; box-shadow: 1px 0 0 var(--line); }\ntable.tbl th.sticky { background: #fafaf8; }\n.score-row button.on { color: #fff; border-color: transparent; background: var(--blue); }\n.score-row button.sug { border-color: var(--amber); border-style: dashed; }\n.sug-note { font-size: .68rem; color: var(--faint); display: block; }\n.grade-cell { white-space: nowrap; }\n.grade-line { display: flex; align-items: center; gap: 6px; padding: 2px 0; }\n.grade-code { font-size: .7rem; font-weight: 700; color: var(--muted); width: 26px; }\n.grade-comment { font-size: .8rem; }\n.student-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; }\n.student-card { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; cursor: pointer; text-align: left; }\n.student-card:hover { box-shadow: 0 2px 8px rgba(0,0,0,.08); }\n.student-card .n { font-weight: 600; font-size: .88rem; }\n.student-card .s { font-size: .72rem; color: var(--muted); }\n\n/* ── unknown user ── */\n.notice { max-width: 560px; margin: 60px auto; background: #fff; border: 1px solid var(--line); border-radius: 16px; padding: 28px; }\n.notice h2 { font-size: 1.2rem; margin-bottom: 10px; }\n.notice p { margin-bottom: 10px; color: var(--muted); font-size: .92rem; }\n.notice code { background: #f3f2ee; padding: 2px 6px; border-radius: 6px; font-size: .85rem; }\n\n/* ── print: daily log sheets ── */\n.print-only { display: none; }\n.sheet { background: #fff; border: 1px solid var(--line); margin: 0 auto 18px; padding: 14mm 12mm; width: 210mm; min-height: 280mm; font-size: 10.5pt; color: #111; }\n.sheet .s-head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 8px; }\n.sheet .s-head .u { font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #555; }\n.sheet .s-head .n { font-size: 16pt; font-weight: 700; }\n.sheet .s-head .blank { display: inline-block; min-width: 70mm; border-bottom: 1px solid #111; }\n.sheet .s-cols { display: grid; grid-template-columns: 1.1fr 1fr; gap: 6mm; margin-bottom: 6px; }\n.sheet .s-box { border: 1px solid #999; border-radius: 4px; padding: 5px 7px; }\n.sheet .s-box h4 { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 3px; }\n.sheet .s-box ol, .sheet .s-box ul { padding-left: 16px; font-size: 9pt; line-height: 1.3; }\n.sheet .s-box li span { color: #666; }\n.sheet .s-box.two ol { columns: 2; }\n.sheet table { width: 100%; border-collapse: collapse; font-size: 9pt; }\n.sheet th, .sheet td { border: 1px solid #555; padding: 3px 4px; vertical-align: top; }\n.sheet th { background: #eee; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; text-align: left; }\n.sheet td.circ { white-space: nowrap; letter-spacing: .25em; text-align: center; font-weight: 600; }\n.sheet td.tall { height: 12mm; }\n.sheet tr.cp td { background: #fff7d6; }\n.sheet tr.cp td.ttl::after { content: ' ★ check-in on the laptop'; font-weight: 700; font-size: 8pt; }\n.sheet .s-foot { margin-top: 6px; font-size: 8.5pt; color: #444; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }\n@media print {\n  body { background: #fff; }\n  #app { max-width: none; padding: 0; }\n  .no-print, .banner, .toast { display: none !important; }\n  .sheet { border: 0; margin: 0; width: auto; min-height: 0; page-break-after: always; padding: 8mm 6mm; }\n  .sheet:last-child { page-break-after: auto; }\n}\n\n/* ── stages (Understanding / Intermediate / Automatic) ── */\n:root { --st1: #E8735A; --st2: #F0A500; --st3: #1D9E75; }\n.chip.st1 { background: var(--st1); } .chip.st2 { background: var(--st2); } .chip.st3 { background: var(--st3); }\n.stage-pill { display: inline-block; padding: 2px 9px; border-radius: 999px; font-size: .72rem; font-weight: 700; color: #fff; background: #ccc; white-space: nowrap; }\n.stage-pill.st0 { background: #e6e4df; color: var(--faint); font-weight: 500; }\n.stage-pill.st1 { background: var(--st1); } .stage-pill.st2 { background: var(--st2); } .stage-pill.st3 { background: var(--st3); }\n.self-note { display: block; font-size: .66rem; color: var(--faint); margin-top: 2px; }\ntable.tbl tr.focus-row td { background: #fff8e6; }\n.seg3 { display: inline-grid; grid-template-columns: repeat(3, auto); gap: 4px; }\n.seg3 button { padding: 6px 10px; border-radius: 8px; border: 1px solid var(--line); background: #fff; font-size: .74rem; color: var(--muted); white-space: nowrap; }\n.seg3 button.on { color: #fff; border-color: transparent; }\n.seg3 button.on.st1 { background: var(--st1); } .seg3 button.on.st2 { background: var(--st2); } .seg3 button.on.st3 { background: var(--st3); }\n.goal { font-size: 1rem; line-height: 1.45; padding: 10px 14px; background: #fff8e6; border-left: 4px solid var(--amber); border-radius: 8px; margin-bottom: 12px; }\n.steps { display: flex; flex-direction: column; gap: 6px; }\n.step { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 10px; background: #fff; text-align: left; }\n.step.done { background: #e9f7f0; border-color: var(--green); }\n.step.now { border-color: var(--blue); box-shadow: 0 0 0 2px rgba(46,134,222,.15); }\n.step-n { width: 26px; height: 26px; border-radius: 50%; background: #eee; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: .78rem; }\n.step.done .step-n { background: var(--green); color: #fff; }\n.step-name { font-weight: 600; font-size: .88rem; }\n.step-crit { font-size: .74rem; color: var(--muted); }\n.step-mark { font-size: .78rem; font-weight: 700; color: var(--green); }\n.step.now .step-mark { color: var(--blue); }\n.steps.pick .step { cursor: pointer; }\n.score-in { display: inline-flex; flex-direction: column; align-items: center; gap: 3px; }\n.num-in.short { width: 56px; padding: 6px 4px; }\n.sport-tabs { margin-top: -6px; }\n.sheet .s-goal { font-size: 9.5pt; padding: 4px 0 6px; border-bottom: 1px solid #ccc; margin-bottom: 6px; }\n.sheet .s-goal .blank { display: inline-block; min-width: 40mm; border-bottom: 1px solid #111; }\n.sheet .s-box ol.two { columns: 2; }\n.sheet table.s-drills { font-size: 8.5pt; margin-top: 2px; }\n.sheet table.s-drills th, .sheet table.s-drills td { padding: 2px 3px; }\n.sheet table.s-drills td.box { width: 9mm; height: 7mm; }\n.sheet .s-cols { grid-template-columns: 1.5fr 1fr; }\n\n@media (max-width: 640px) {\n  #app { padding: 12px 10px 50px; }\n  .rate-row { grid-template-columns: 1fr; gap: 6px; }\n  .reg-row { grid-template-columns: 1fr; gap: 6px; }\n  .test-grid { grid-template-columns: 1fr 1fr; }\n}\n</style>\n",
  App: "<script>\n(function () {\n'use strict';\n\n// ═══════════════════════ utils ═══════════════════════\nconst esc = s => String(s == null ? '' : s).replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]));\nconst $ = (sel, root) => (root || document).querySelector(sel);\nconst PALETTE = [\n  ['#d4f0e4', '#0a5c35'], ['#e8e4ff', '#4a3a9a'], ['#ddeeff', '#1a4a7a'], ['#ffe4d4', '#7a2a0a'],\n  ['#fff0d4', '#7a5a0a'], ['#fde4ee', '#8a2a5a'], ['#d4eeff', '#0a4a7a'], ['#e4ffd4', '#2a6a0a']\n];\nfunction initials(name) { const p = String(name).trim().split(/\\s+/); return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')).toUpperCase(); }\nfunction hashIdx(name) { let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % PALETTE.length; }\nfunction avatar(name) { const c = PALETTE[hashIdx(name)]; return `<span class=\"avatar\" style=\"background:${c[0]};color:${c[1]}\">${esc(initials(name))}</span>`; }\nconst fmt = (v, d = 1) => (v === null || v === undefined || v === '' || isNaN(v)) ? '—' : Number(v).toFixed(d).replace(/\\.0+$/, '');\nconst num = v => { if (v === '' || v === null || v === undefined) return null; const n = parseFloat(v); return isNaN(n) ? null : n; };\nfunction toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200); }\nfunction banner(kind, html) { const b = $('#banner'); if (!html) { b.className = 'banner'; b.innerHTML = ''; return; } b.className = 'banner show ' + kind; b.innerHTML = html; }\n\n// ═══════════════════════ server bridge ═══════════════════════\nfunction call(fn, ...args) {\n  return new Promise((resolve, reject) => {\n    if (!window.google || !google.script || !google.script.run) return reject(new Error('Not running inside the Apps Script web app'));\n    google.script.run.withSuccessHandler(resolve).withFailureHandler(e => reject(new Error(e && e.message ? e.message : String(e))))[fn](...args);\n  });\n}\n\n// ═══════════════════════ outbox ═══════════════════════\n// Every write goes through here and is kept in localStorage (tagged with the\n// login that created it) until the server confirms, so a wifi drop or reload\n// never loses work.\nconst OUTBOX_KEY = 'mfs_outbox_v1';\nconst Outbox = {\n  items: [], draining: false, failed: false, lastError: '', waiters: {},\n  load() { try { this.items = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); } catch (e) { this.items = []; } },\n  persist() { try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(this.items)); } catch (e) {} },\n  mine() { return this.items.filter(i => i.owner === S.id.email); },\n  add(fn, payload, label) {\n    const id = String(Date.now()) + Math.random().toString(36).slice(2, 7);\n    this.items.push({ id, fn, payload, label, owner: S.id.email, ts: Date.now() });\n    this.persist();\n    const p = new Promise((res, rej) => { this.waiters[id] = { res, rej }; });\n    this.drain(); updateSaveState();\n    return p;\n  },\n  async drain() {\n    if (this.draining) return;\n    this.draining = true;\n    let item, sentOrphan = false;\n    while ((item = this.mine()[0])) {\n      try {\n        await call(item.fn, item.payload);\n        this.items = this.items.filter(i => i.id !== item.id); this.persist(); this.failed = false;\n        if (this.waiters[item.id]) { this.waiters[item.id].res(); delete this.waiters[item.id]; } else sentOrphan = true;\n      } catch (e) {\n        this.failed = true; this.lastError = e.message;\n        if (/Teachers only|not on roster|Unknown checkpoint|Missing/i.test(e.message)) {\n          this.items = this.items.filter(i => i.id !== item.id); this.persist();\n          if (this.waiters[item.id]) { this.waiters[item.id].rej(e); delete this.waiters[item.id]; }\n          continue;\n        }\n        break;\n      }\n      updateSaveState();\n    }\n    this.draining = false; updateSaveState();\n    if (sentOrphan) refreshAfterOutbox();\n  },\n  retry() { this.failed = false; updateSaveState(); this.drain(); }\n};\nasync function refreshAfterOutbox() {\n  try {\n    if (S.id.role === 'student') { S.me = await call('getStudent', S.me.section, S.me.student); if (S.view === 'dash') render(); toast('Earlier changes sent ✓'); }\n    else if (S.T.section) { S.T.data = await call('getSectionData', S.T.section); S.T.overview = null; if (['register', 'tests', 'agility', 'students'].indexOf(S.T.tab) !== -1) render(); toast('Earlier changes sent ✓'); }\n  } catch (e) {}\n}\n// Coalesces rapid teacher taps into one request per (section, lesson/checkpoint).\nconst Pending = {\n  map: {}, timer: null,\n  put(key, fn, base, entryKey, entry) {\n    const p = this.map[key] || (this.map[key] = { fn, base, entries: {} });\n    p.entries[entryKey] = Object.assign(p.entries[entryKey] || {}, entry);\n    clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 900); updateSaveState();\n  },\n  count() { return Object.keys(this.map).length; },\n  flush() {\n    clearTimeout(this.timer);\n    const m = this.map; this.map = {};\n    Object.keys(m).forEach(key => { const p = m[key]; Outbox.add(p.fn, Object.assign({}, p.base, { entries: Object.values(p.entries) }), key).catch(() => {}); });\n  }\n};\nwindow.addEventListener('beforeunload', () => Pending.flush());\nfunction updateSaveState() {\n  const el = $('#savestate'); if (!el) return;\n  const n = Outbox.mine().length + Pending.count();\n  if (Outbox.failed) { el.className = 'savestate failed'; el.innerHTML = `${n} change${n === 1 ? '' : 's'} not saved · <a href=\"#\" data-act=\"retry\">retry</a>`; }\n  else if (n > 0) { el.className = 'savestate pending'; el.textContent = 'Saving…'; }\n  else { el.className = 'savestate'; el.textContent = 'All saved ✓'; }\n  if (Outbox.failed) banner('warn', `Could not reach the server — your last change is kept on this device and will be re-sent. <span class=\"tiny\">${esc(Outbox.lastError)}</span><button data-act=\"retry\">Retry now</button>`);\n  else banner();\n}\n\n// ═══════════════════════ state & helpers ═══════════════════════\nconst S = {\n  cfg: null, id: null, me: null, view: 'dash', cp: null, form: null,\n  T: { section: '', sport: '', tab: 'register', lesson: null, cpName: '', data: null, overview: null, viewing: null, printMode: 'all' }\n};\nconst CPS = () => S.cfg.checkpoints;\nconst skillsOf = sport => S.cfg.skills[sport] || [];\nconst skillDef = (sport, name) => skillsOf(sport).find(s => s.skill === name) || null;\nfunction stageOf(score) { if (score === null || score === undefined || score === '') return 0; if (score <= S.cfg.stageBands[0]) return 1; if (score <= S.cfg.stageBands[1]) return 2; return 3; }\nconst stageName = n => n ? S.cfg.stageLabels[n - 1] : '';\nfunction testScore(me, cp, skill) { const t = me.tests.find(x => x.checkpoint === cp && x.skill === skill && x.score !== null); return t ? t.score : null; }\nfunction latestScore(me, skill, uptoCp) { let v = null; for (const c of CPS()) { const s = testScore(me, c.name, skill); if (s !== null) v = s; if (uptoCp && c.name === uptoCp) break; } return v; }\nfunction checkinOf(me, cp) { return me.checkins.find(c => c.checkpoint === cp) || null; }\nfunction cpDone(me, cp) { const c = checkinOf(me, cp.name); return !!(c && (c.focusSkill || c.wentWell || c.nextGoal || c.agilityFocus)); }\nfunction nextCheckpoint(me) { return CPS().find(cp => !cpDone(me, cp)) || null; }\nfunction currentFocus(me) { let f = '', step = null, goal = '', ag = ''; CPS().forEach(c => { const x = checkinOf(me, c.name); if (!x) return; if (x.focusSkill) f = x.focusSkill; if (x.goal) goal = x.goal; if (x.drillStep !== null) step = x.drillStep; if (x.agilityFocus) ag = x.agilityFocus; }); return { skill: f, step, goal, agility: ag }; }\nfunction outcomeRow(me, cp, outcome) { return (me.outcomes || []).find(x => x.checkpoint === cp && x.outcome === outcome) || null; }\nfunction oChip(v, teacher) { return v ? `<span class=\"chip ${teacher ? 't' : ''} st${v}\" title=\"${esc(S.cfg.outcomeLabels[v - 1])}${teacher ? ' (teacher)' : ''}\">${v}</span>` : `<span class=\"chip none\">·</span>`; }\nfunction lessonByNumber(n) { return S.cfg.lessons.find(l => l.number === n); }\nfunction stageChip(score, extra) { const st = stageOf(score); return st ? `<span class=\"chip st${st} ${extra || ''}\" title=\"${esc(stageName(st))}\">${fmt(score, 0)}</span>` : `<span class=\"chip none\">·</span>`; }\nfunction draftGoal(me, skill, cp) {\n  const s = latestScore(me, skill, cp); const st = stageOf(s); const max = S.cfg.scoreMax;\n  const nextSt = Math.min(3, (st || 1) + 1);\n  const target = nextSt === 2 ? S.cfg.stageBands[0] + 1 : S.cfg.stageBands[1] + 1;\n  const def = skillDef(me.sport, skill); const steps = def && def.drills.length ? '1 to ' + Math.min(def.drills.length, 3) : '1 to 3';\n  const nextCp = CPS()[CPS().findIndex(c => c.name === cp) + 1]; const cpName = nextCp ? nextCp.name : 'End';\n  return (S.cfg.goalTemplate || '')\n    .replace('{skill}', skill.toLowerCase()).replace('{stage}', stageName(st || 1)).replace('{score}', s === null ? '?' : fmt(s, 0))\n    .replace('{nextStage}', stageName(nextSt)).replace('{target}', target).replace(/\\{max\\}/g, max).replace('{checkpoint}', cpName).replace('{steps}', steps);\n}\n\n// ═══════════════════════ boot ═══════════════════════\nasync function boot() {\n  try {\n    const b = await call('bootstrap');\n    S.cfg = b.config; S.id = b.identity;\n    Outbox.load();\n    if (S.id.role === 'student') S.me = b.student;\n    if (S.id.role === 'teacher') {\n      S.T.section = (URL_SECTION && S.cfg.sections.indexOf(URL_SECTION) !== -1) ? URL_SECTION : (S.cfg.sections[0] || '');\n      if (URL_VIEW) S.T.tab = URL_VIEW;\n      S.T.sport = S.id.sport && S.cfg.sports.indexOf(S.id.sport) !== -1 ? S.id.sport : '';\n    }\n    render(); Outbox.drain();\n    if (S.id.role === 'teacher' && S.T.section) loadSection(S.T.section);\n  } catch (e) {\n    $('#app').innerHTML = `<div class=\"notice\"><h2>Could not load</h2><p>${esc(e.message)}</p><p><button class=\"pill-btn primary\" data-act=\"reload\">Try again</button></p></div>`;\n  }\n}\nfunction render() {\n  const app = $('#app');\n  if (S.id.role === 'unknown') app.innerHTML = renderUnknown();\n  else if (S.id.role === 'student') app.innerHTML = S.view === 'cpform' ? renderCpForm(S.me, S.cp, false) : renderStudentPage(S.me, false);\n  else app.innerHTML = renderTeacher();\n  updateSaveState(); window.scrollTo(0, 0);\n}\nfunction renderUnknown() {\n  const email = S.id.email;\n  return `<div class=\"notice\">\n    <h2>${email ? 'You are not on the roster yet' : 'Please sign in with your school Google account'}</h2>\n    ${email ? `<p>You are signed in as <code>${esc(email)}</code>, but that address is not on any class list for <b>${esc(S.cfg.unitName)}</b>.</p><p>Ask your teacher to add this exact email to the <b>Roster</b> tab, then reload this page.</p>`\n            : `<p>This page could not see who you are. Open it in a browser where you are signed in to your school account (not a private window), or ask your teacher to check that the app is shared with \"Anyone within the school\".</p>`}\n    <p><button class=\"pill-btn primary\" data-act=\"reload\">Reload</button></p></div>`;\n}\n\n// ═══════════════════════ student dashboard ═══════════════════════\nfunction renderStudentPage(me, asTeacher) {\n  const cfg = S.cfg, cps = CPS(), next = nextCheckpoint(me), skills = skillsOf(me.sport), focus = currentFocus(me);\n  const head = `<div class=\"topbar\">\n      ${asTeacher ? `<button class=\"pill-btn\" data-act=\"t-back\">&larr; ${esc(S.T.section)} students</button>` : ''}\n      ${avatar(me.student)}\n      <div><div class=\"title\">${esc(me.student)}</div><div class=\"sub\">${esc(cfg.unitName)} &middot; ${esc(me.sport)} &middot; ${esc(me.section)}${asTeacher ? ' &middot; <b>teacher view</b>' : ''}</div></div>\n      <div class=\"grow\"></div><div class=\"savestate\" id=\"savestate\"></div></div>`;\n\n  const strip = `<div class=\"cp-strip\">${cps.map(cp => { const done = cpDone(me, cp), isNext = next && next.name === cp.name; return `<div class=\"cp-card ${done ? 'done' : ''} ${isNext ? 'next' : ''}\">\n      <div class=\"cp-name\">${esc(cp.name)} check-in</div>\n      <div class=\"small muted\">lesson ${cp.lesson}${lessonByNumber(cp.lesson) ? ' · ' + esc(lessonByNumber(cp.lesson).title) : ''}</div>\n      <div class=\"cp-status ${done ? 'done' : 'muted'}\">${done ? '✓ Done' : (isNext ? 'Up next' : 'Not yet')}</div>\n      <button class=\"pill-btn ${isNext && !done ? 'primary' : ''} small\" data-act=\"open-cp\" data-cp=\"${esc(cp.name)}\">${done ? 'Edit' : 'Enter now'}</button></div>`; }).join('')}</div>`;\n\n  let focusCard;\n  if (focus.skill) {\n    const def = skillDef(me.sport, focus.skill); const step = focus.step || 0;\n    focusCard = `<div class=\"card\"><div class=\"card-head amber\">My focus skill <span class=\"right\">${esc(focus.skill)}</span></div><div class=\"card-body\">\n      <div class=\"goal\">${focus.goal ? esc(focus.goal) : '<span class=\"faint\">No goal written yet — add one at your next check-in.</span>'}</div>\n      ${def && def.drills.length ? `<div class=\"steps\">${def.drills.map(d => `<div class=\"step ${d.step <= step ? 'done' : (d.step === step + 1 ? 'now' : '')}\"><span class=\"step-n\">${d.step}</span><div><div class=\"step-name\">${esc(d.drill)}</div><div class=\"step-crit\">${esc(d.criteria)}</div></div><span class=\"step-mark\">${d.step <= step ? '✓' : (d.step === step + 1 ? 'now' : '')}</span></div>`).join('')}</div>\n        <div class=\"hint\">Step reached: <b>${step} of ${def.drills.length}</b> (from your last check-in). Peer checks and teacher sign-offs are on your paper log.</div>` : ''}\n      ${focus.agility ? `<div class=\"hint\">Agility element: <span class=\"tag\">${esc(focus.agility)}</span></div>` : ''}\n    </div></div>`;\n  } else {\n    focusCard = `<div class=\"card\"><div class=\"card-head amber\">My focus skill</div><div class=\"card-body\"><div class=\"empty\">Not chosen yet. Your teacher will test the key skills first, then you pick one focus skill at the <b>${esc(cps[0] ? cps[0].name : 'Early')}</b> check-in.</div></div></div>`;\n  }\n\n  const skillsCard = `<div class=\"card\"><div class=\"card-head\">My ${esc(me.sport)} skills <span class=\"right\">score out of ${cfg.scoreMax} · teacher tested</span></div><div class=\"card-body\"><div class=\"tbl-wrap\">\n    <table class=\"tbl\"><thead><tr><th>Skill</th>${cps.map(cp => `<th class=\"c\">${esc(cp.name)}<br><span class=\"tiny\" style=\"text-transform:none;letter-spacing:0\">L${cp.lesson}</span></th>`).join('')}<th>Stage now</th></tr></thead><tbody>\n    ${skills.map(s => { const last = latestScore(me, s.skill); const st = stageOf(last); const isF = s.skill === focus.skill; return `<tr class=\"${isF ? 'focus-row' : ''}\"><td class=\"skill\">${isF ? '★ ' : ''}${esc(s.skill)}<span class=\"cue\">${esc(s.test)}</span></td>\n      ${cps.map(cp => { const v = testScore(me, cp.name, s.skill); const ci = checkinOf(me, cp.name); const self = ci && ci.selfStages && ci.selfStages[s.skill]; return `<td class=\"c\">${stageChip(v)}${self ? `<span class=\"self-note\" title=\"where you placed yourself\">me: ${esc(stageName(self))}</span>` : ''}</td>`; }).join('')}\n      <td>${st ? `<span class=\"stage-pill st${st}\">${esc(stageName(st))}</span>` : '<span class=\"faint\">not tested</span>'}</td></tr>`; }).join('')}\n    </tbody></table></div>\n    <div class=\"legend\">${cfg.stageLabels.map((l, i) => `<span><span class=\"chip st${i + 1}\">${i === 0 ? '0–' + cfg.stageBands[0] : i === 1 ? (cfg.stageBands[0] + 1) + '–' + cfg.stageBands[1] : (cfg.stageBands[1] + 1) + '–' + cfg.scoreMax}</span> ${esc(l)}</span>`).join('')}</div></div></div>`;\n\n  const attended = me.register.filter(r => r.participation).length;\n  const part = `<div class=\"card\"><div class=\"card-head green\">Participation <span class=\"right\">${attended} of ${me.lessonsRun || 0} lesson${me.lessonsRun === 1 ? '' : 's'} so far</span></div><div class=\"card-body\">\n    <div class=\"dots\">${cfg.lessons.map(l => { const r = me.register.find(x => x.lesson === l.number); const lvl = r && r.participation; const isCp = cps.some(c => c.lesson === l.number);\n      return `<div class=\"dot ${lvl ? 'p' + lvl : ''} ${isCp ? 'cp' : ''}\" title=\"L${l.number} ${esc(l.title)}${lvl ? ' · ' + esc(cfg.participationLabels[lvl - 1]) : ''}${r && r.note ? ' · ' + esc(r.note) : ''}\">L${l.number}</div>`; }).join('')}</div>\n    <div class=\"legend\">${cfg.participationLabels.map((l, i) => `<span><span class=\"dot p${i + 1}\" style=\"display:inline-flex;width:18px;height:18px;border-radius:5px\"></span> ${esc(l)}</span>`).join('')}<span class=\"faint\">Recorded by your teacher each lesson.</span></div></div></div>`;\n\n  let test = '';\n  if (cfg.test.name) {\n    const b = me.agility.baseline, r = me.agility.retest; let delta = '';\n    if (b !== null && r !== null) { const d = r - b, better = cfg.test.lowerIsBetter ? d < 0 : d > 0; const word = cfg.test.lowerIsBetter ? (better ? 'Faster' : 'Slower') : (better ? 'Higher' : 'Lower');\n      delta = Math.abs(d) < 1e-9 ? `<div class=\"delta\">No change</div>` : `<div class=\"delta ${better ? 'good' : 'bad'}\">${word} by <b>${fmt(Math.abs(d), 2)} ${esc(cfg.test.unit)}</b></div>`; }\n    test = `<div class=\"card\"><div class=\"card-head purple\">${esc(cfg.test.name)} <span class=\"right\">teacher recorded</span></div><div class=\"card-body\"><div class=\"test-grid\">\n      <div class=\"test-box\"><div class=\"label\">Baseline</div><div class=\"value ${b === null ? 'empty' : ''}\">${b === null ? '—' : fmt(b, 2)}</div><div class=\"unit\">${esc(cfg.test.unit)}</div></div>\n      <div class=\"test-box\"><div class=\"label\">Re-test</div><div class=\"value ${r === null ? 'empty' : ''}\">${r === null ? '—' : fmt(r, 2)}</div><div class=\"unit\">${esc(cfg.test.unit)}</div></div></div>${delta}</div></div>`;\n  }\n\n  let outcomesCard = '';\n  if (cfg.outcomes.length) {\n    outcomesCard = `<div class=\"card\"><div class=\"card-head dark\">Personal skills <span class=\"right\">me · teacher</span></div><div class=\"card-body\"><div class=\"tbl-wrap\">\n      <table class=\"tbl\"><thead><tr><th>Outcome</th>${cps.map(cp => `<th class=\"c\">${esc(cp.name)}</th>`).join('')}</tr></thead><tbody>\n      ${cfg.outcomes.map(o => `<tr><td class=\"skill\">${esc(o.outcome)}<span class=\"cue\">${esc(o.looksLike)}</span></td>${cps.map(cp => { const r = outcomeRow(me, cp.name, o.outcome); return `<td class=\"c\"><span class=\"chip-pair\">${oChip(r && r.self, false)}${oChip(r && r.teacher, true)}</span></td>`; }).join('')}</tr>`).join('')}\n      </tbody></table></div><div class=\"legend\">${cfg.outcomeLabels.map((l, i) => `<span><span class=\"chip st${i + 1}\">${i + 1}</span> ${esc(l)}</span>`).join('')}<span><span class=\"chip t st3\">3</span> teacher</span></div></div></div>`;\n  }\n  const refl = `<div class=\"card\"><div class=\"card-head coral\">My check-ins</div><div class=\"card-body\">\n    ${cps.filter(cp => cpDone(me, cp)).length === 0 ? `<div class=\"empty\">Nothing entered yet.</div>` :\n      cps.map(cp => { const c = checkinOf(me, cp.name); if (!c || !cpDone(me, cp)) return ''; return `<div class=\"refl\"><div class=\"cp\">${esc(cp.name)} ${c.focusSkill ? `<span class=\"tag\">focus: ${esc(c.focusSkill)}</span>` : ''} ${c.agilityFocus ? `<span class=\"tag\">agility: ${esc(c.agilityFocus)}</span>` : ''} ${c.drillStep ? `<span class=\"tag\">drill step ${c.drillStep}</span>` : ''}</div>\n        ${c.goal ? `<div class=\"q\">Goal</div><div class=\"a\">${esc(c.goal)}</div>` : ''}\n        ${c.wentWell ? `<div class=\"q\">${esc(cfg.reflectionPrompts[0])}</div><div class=\"a\">${esc(c.wentWell)}</div>` : ''}\n        ${c.nextGoal ? `<div class=\"q\">${esc(cfg.reflectionPrompts[1])}</div><div class=\"a\">${esc(c.nextGoal)}</div>` : ''}</div>`; }).join('')}</div></div>`;\n\n  let grades = '';\n  if ((asTeacher || cfg.showGradesToStudents) && me.grades.some(g => g.score)) {\n    grades = `<div class=\"card\"><div class=\"card-head dark\">Grades</div><div class=\"card-body\"><div class=\"tbl-wrap\"><table class=\"tbl\"><thead><tr><th>Criterion</th><th class=\"c\">Score</th><th>Comment</th></tr></thead><tbody>\n      ${cfg.criteria.map(c => { const g = me.grades.find(x => x.criterion === c.code); if (!g || !g.score) return ''; return `<tr><td><b>${esc(c.code)}</b> ${esc(c.name)}</td><td class=\"c\"><span class=\"chip st2\">${g.score}</span></td><td style=\"white-space:normal\">${esc(g.comment)}</td></tr>`; }).join('')}</tbody></table></div></div></div>`;\n  }\n  return head + strip + focusCard + skillsCard + `<div class=\"grid cols-2\">${part}${test}</div>` + outcomesCard + refl + grades;\n}\n\n// ═══════════════════════ check-in form ═══════════════════════\nfunction openCpForm(me, cpName) {\n  const cp = CPS().find(c => c.name === cpName); if (!cp) return;\n  const existing = checkinOf(me, cp.name) || {};\n  const prev = currentFocus(me);\n  S.cp = cp;\n  S.form = {\n    focusSkill: existing.focusSkill || prev.skill || '',\n    goal: existing.goal || prev.goal || '',\n    goalTouched: !!(existing.goal || prev.goal),\n    drillStep: existing.drillStep !== null && existing.drillStep !== undefined ? existing.drillStep : (prev.step || 0),\n    agilityFocus: existing.agilityFocus || '',\n    selfStages: Object.assign({}, existing.selfStages || {}),\n    selfOutcomes: (() => { const o = {}; S.cfg.outcomes.forEach(x => { const r = outcomeRow(me, cp.name, x.outcome); if (r && r.self) o[x.outcome] = r.self; }); return o; })(),\n    wentWell: existing.wentWell || '', nextGoal: existing.nextGoal || '', sending: false\n  };\n  if (S.form.focusSkill && !S.form.goal) S.form.goal = draftGoal(me, S.form.focusSkill, cp.name);\n  if (S.id.role === 'student') S.view = 'cpform'; else S.T.tab = 'cpform';\n  render();\n}\nfunction renderCpForm(me, cp, asTeacher) {\n  const cfg = S.cfg, f = S.form, skills = skillsOf(me.sport);\n  const idx = CPS().findIndex(c => c.name === cp.name);\n  const isFirst = idx === 0;\n  const def = f.focusSkill ? skillDef(me.sport, f.focusSkill) : null;\n  return `<div class=\"topbar\"><button class=\"pill-btn\" data-act=\"cp-cancel\">&larr; Back</button>\n      <div><div class=\"title\">${esc(cp.name)} check-in</div><div class=\"sub\">${esc(me.student)} &middot; ${esc(me.sport)} &middot; lesson ${cp.lesson}${asTeacher ? ' &middot; <b>entering as teacher</b>' : ''}</div></div>\n      <div class=\"grow\"></div><div class=\"savestate\" id=\"savestate\"></div></div>\n    <div class=\"card\"><div class=\"card-body small muted\">Have your <b>paper daily log</b> next to you. ${isFirst ? 'Look at your test scores, pick <b>one</b> skill to focus on (one at <b>' + esc(cfg.stageLabels[0]) + '</b> is the best choice), and confirm your goal.' : 'Look back over the lessons since your last check-in. Update your drill step, rethink your goal if you need to, and answer the two questions honestly.'}</div></div>\n\n    <div class=\"card\"><div class=\"card-head\">1 · Your test scores <span class=\"right\">out of ${cfg.scoreMax}</span></div><div class=\"card-body\">\n      <div class=\"tbl-wrap\"><table class=\"tbl\"><thead><tr><th>Skill</th><th class=\"c\">Score</th><th>Stage</th><th>Where do <em>you</em> think you are?</th></tr></thead><tbody>\n      ${skills.map(s => { const v = latestScore(me, s.skill, cp.name); const st = stageOf(v); const self = f.selfStages[s.skill] || 0;\n        return `<tr><td class=\"skill\">${esc(s.skill)}<span class=\"cue\">${esc(s.test)}</span></td><td class=\"c\">${stageChip(v)}</td><td>${st ? `<span class=\"stage-pill st${st}\">${esc(stageName(st))}</span>` : '<span class=\"faint\">not tested yet</span>'}</td>\n        <td><div class=\"seg3\">${[1, 2, 3].map(n => `<button type=\"button\" class=\"${self === n ? 'on st' + n : ''}\" data-act=\"self\" data-skill=\"${esc(s.skill)}\" data-n=\"${n}\">${esc(cfg.stageLabels[n - 1])}</button>`).join('')}</div></td></tr>`; }).join('')}\n      </tbody></table></div></div></div>\n\n    <div class=\"card\"><div class=\"card-head amber\">2 · My focus skill</div><div class=\"card-body\">\n      <div class=\"focus-grid\">${skills.map(s => { const v = latestScore(me, s.skill, cp.name); const st = stageOf(v); return `<button type=\"button\" class=\"focus-btn ${f.focusSkill === s.skill ? 'on' : ''}\" data-act=\"focus-skill\" data-v=\"${esc(s.skill)}\">${esc(s.skill)}<span>${st ? esc(stageName(st)) + ' · ' + fmt(v, 0) + '/' + cfg.scoreMax : 'not tested'}${st === 1 ? ' · recommended' : ''}</span></button>`; }).join('')}</div>\n      ${def ? `<div class=\"field\" style=\"margin-top:14px\"><label>My goal</label><textarea data-in=\"goal\" maxlength=\"400\">${esc(f.goal)}</textarea><div class=\"hint\">Drafted from your score — change it so it sounds like you. <a href=\"#\" data-act=\"goal-redraft\">Re-draft</a></div></div>\n        <div class=\"field\"><label>Drill step reached for ${esc(f.focusSkill)}</label>\n          <div class=\"steps pick\">${def.drills.map(d => `<button type=\"button\" class=\"step ${f.drillStep >= d.step ? 'done' : ''}\" data-act=\"drill-step\" data-n=\"${d.step}\"><span class=\"step-n\">${d.step}</span><div><div class=\"step-name\">${esc(d.drill)}</div><div class=\"step-crit\">${esc(d.criteria)}</div></div><span class=\"step-mark\">${f.drillStep >= d.step ? '✓' : ''}</span></button>`).join('')}</div>\n          <div class=\"hint\">${isFirst ? 'Leave all unticked if you are just starting. ' : ''}Tap the last step your teacher has signed off on your paper log. <a href=\"#\" data-act=\"drill-step\" data-n=\"0\">Clear</a></div></div>` : '<div class=\"hint\">Pick a skill above to see its drill progression.</div>'}\n    </div></div>\n\n    <div class=\"card\"><div class=\"card-head purple\">3 · Agility & reflection</div><div class=\"card-body\">\n      ${cfg.focus.length ? `<div class=\"field\"><label>The agility element I am working on (from my daily log)</label>\n        <div class=\"focus-grid\">${cfg.focus.map(fe => `<button type=\"button\" class=\"focus-btn ${f.agilityFocus === fe.focus ? 'on' : ''}\" data-act=\"agility\" data-v=\"${esc(fe.focus)}\">${esc(fe.focus)}${fe.cue ? `<span>${esc(fe.cue)}</span>` : ''}</button>`).join('')}</div></div>` : ''}\n      <div class=\"field\"><label>${esc(cfg.reflectionPrompts[0])}</label><textarea data-in=\"wentWell\" maxlength=\"600\" placeholder=\"Two or three sentences…\">${esc(f.wentWell)}</textarea></div>\n      <div class=\"field\"><label>${esc(cfg.reflectionPrompts[1])}</label><textarea data-in=\"nextGoal\" maxlength=\"600\" placeholder=\"Be specific: which drill, what will you change?\">${esc(f.nextGoal)}</textarea></div>\n      ${cfg.outcomes.length ? `<div class=\"field\"><label>Personal skills — where are you honestly?</label><div class=\"tbl-wrap\"><table class=\"tbl\"><tbody>${cfg.outcomes.map(o => { const v = f.selfOutcomes[o.outcome] || 0; return `<tr><td class=\"skill\">${esc(o.outcome)}<span class=\"cue\">${esc(o.looksLike)}</span></td><td><div class=\"seg3\">${[1, 2, 3].map(n => `<button type=\"button\" class=\"${v === n ? 'on st' + n : ''}\" data-act=\"self-outcome\" data-outcome=\"${esc(o.outcome)}\" data-n=\"${n}\">${esc(cfg.outcomeLabels[n - 1])}</button>`).join('')}</div></td></tr>`; }).join('')}</tbody></table></div></div>` : ''}\n      <div class=\"form-actions\"><button class=\"pill-btn primary\" data-act=\"cp-save\" ${f.sending ? 'disabled' : ''}>${f.sending ? 'Saving…' : 'Save check-in'}</button><button class=\"pill-btn\" data-act=\"cp-cancel\">Cancel</button><span class=\"status\" id=\"cp-status\"></span></div>\n    </div></div>`;\n}\nasync function saveCpForm() {\n  const me = S.me, cp = S.cp, f = S.form;\n  if (!f.focusSkill && !f.wentWell && !f.nextGoal && !f.agilityFocus && !Object.keys(f.selfStages).length) { toast('Pick a focus skill or write a reflection first'); return; }\n  const payload = { section: me.section, student: me.student, checkpoint: cp.name, focusSkill: f.focusSkill, goal: f.goal, drillStep: f.drillStep, agilityFocus: f.agilityFocus, selfStages: f.selfStages, selfOutcomes: f.selfOutcomes, wentWell: f.wentWell, nextGoal: f.nextGoal };\n  me.outcomes = me.outcomes || [];\n  Object.keys(f.selfOutcomes).forEach(k => { let r = outcomeRow(me, cp.name, k); if (!r) { r = { checkpoint: cp.name, outcome: k, self: null, teacher: null }; me.outcomes.push(r); } r.self = f.selfOutcomes[k]; });\n  let c = checkinOf(me, cp.name); if (!c) { c = { checkpoint: cp.name }; me.checkins.push(c); }\n  Object.assign(c, { focusSkill: f.focusSkill, goal: f.goal, drillStep: f.drillStep, agilityFocus: f.agilityFocus, selfStages: Object.assign({}, f.selfStages), wentWell: f.wentWell, nextGoal: f.nextGoal });\n  f.sending = true; render();\n  const goBack = () => { if (S.id.role === 'student') S.view = 'dash'; else { S.T.tab = 'student'; syncTeacherCache(me); } render(); };\n  let settled = false;\n  const watch = setInterval(() => { if (settled) { clearInterval(watch); return; } if (Outbox.failed) { clearInterval(watch); settled = true; f.sending = false; goBack(); toast('Saved on this device — will send when the connection returns'); } }, 400);\n  try { await Outbox.add('saveCheckin', payload, 'check-in ' + cp.name); if (settled) return; settled = true; f.sending = false; goBack(); toast('Check-in saved ✓'); }\n  catch (e) { if (settled) return; settled = true; f.sending = false; render(); const st = $('#cp-status'); if (st) st.textContent = 'Not saved: ' + e.message; }\n}\nfunction syncTeacherCache(me) {\n  const d = S.T.data; if (!d || d.section !== me.section) return;\n  d.checkins = d.checkins.filter(r => r.student !== me.student).concat(me.checkins.map(r => Object.assign({ student: me.student }, r)));\n  d.outcomes = d.outcomes.filter(r => r.student !== me.student).concat((me.outcomes || []).map(r => Object.assign({ student: me.student }, r)));\n}\n\n// ═══════════════════════ teacher ═══════════════════════\nconst TABS = [['register', 'Register'], ['tests', 'Skill tests'], ['agility', 'Agility test'], ['students', 'Students'], ['overview', 'Overview & grades'], ['print', 'Print daily logs']];\nfunction groupRoster() { return S.cfg.roster.filter(r => r.section === S.T.section && (!S.T.sport || r.sport === S.T.sport)); }\nfunction sportsInSection() { const out = []; S.cfg.roster.filter(r => r.section === S.T.section).forEach(r => { if (r.sport && out.indexOf(r.sport) === -1) out.push(r.sport); }); return out; }\nasync function loadSection(section) {\n  S.T.section = section; S.T.data = null; S.T.overview = null; S.T.viewing = null;\n  if (S.T.tab === 'student' || S.T.tab === 'cpform') S.T.tab = 'students';\n  render();\n  try {\n    const d = await call('getSectionData', section);\n    if (S.T.section !== section) return;\n    S.T.data = d;\n    if (sportsInSection().indexOf(S.T.sport) === -1) S.T.sport = '';\n    if (S.T.lesson === null) { const done = d.register.filter(r => r.participation).map(r => r.lesson); const last = done.length ? Math.max(...done) : 0; const nextL = S.cfg.lessons.find(l => l.number > last) || S.cfg.lessons[S.cfg.lessons.length - 1]; S.T.lesson = nextL ? nextL.number : null; }\n    if (!S.T.cpName && CPS().length) S.T.cpName = CPS()[0].name;\n    render();\n    if (S.T.tab === 'overview') loadOverview();\n  } catch (e) { banner('err', 'Could not load section: ' + esc(e.message) + ' <button data-act=\"reload\">Reload</button>'); }\n}\nasync function loadOverview() {\n  try { const o = await call('getOverview', S.T.section, S.T.sport); S.T.overview = o; if (S.T.tab === 'overview') render(); }\n  catch (e) { toast('Overview failed: ' + e.message); }\n}\nfunction renderTeacher() {\n  const cfg = S.cfg, T = S.T;\n  if (T.tab === 'student' && S.me) return renderStudentPage(S.me, true);\n  if (T.tab === 'cpform' && S.me && S.cp) return renderCpForm(S.me, S.cp, true);\n  const sports = T.data ? sportsInSection() : [];\n  const head = `<div class=\"topbar\"><div><div class=\"title\">${esc(cfg.unitName)}</div><div class=\"sub\">Teacher &middot; ${esc(S.id.email)}</div></div><div class=\"grow\"></div>\n      <div class=\"tabs\" style=\"margin:0\">${cfg.sections.map(c => `<button class=\"tab ${c === T.section ? 'active' : ''}\" data-act=\"t-section\" data-v=\"${esc(c)}\">${esc(c)}</button>`).join('')}</div>\n      <div class=\"savestate\" id=\"savestate\"></div></div>\n    <div class=\"tabs\">${TABS.map(([k, l]) => `<button class=\"tab ${T.tab === k ? 'active' : ''}\" data-act=\"t-tab\" data-tab=\"${k}\">${l}</button>`).join('')}</div>\n    ${sports.length > 1 ? `<div class=\"subtabs sport-tabs\"><button class=\"subtab ${!T.sport ? 'active' : ''}\" data-act=\"t-sport\" data-v=\"\">All sports</button>${sports.map(sp => `<button class=\"subtab ${sp === T.sport ? 'active' : ''}\" data-act=\"t-sport\" data-v=\"${esc(sp)}\">${esc(sp)}</button>`).join('')}</div>` : ''}`;\n  if (!cfg.sections.length) return head + `<div class=\"notice\"><h2>No students yet</h2><p>Add students to the <b>Roster</b> tab of the Sheet (Section, Sport, Student, Email), then reload.</p></div>`;\n  if (!T.data) return head + `<div class=\"loading\"><div class=\"spinner\"></div> Loading ${esc(T.section)}…</div>`;\n  const body = { register: renderRegister, tests: renderSkillTests, agility: renderAgility, students: renderStudents, overview: renderOverview, print: renderPrint }[T.tab] || renderRegister;\n  return head + body();\n}\n\n// ── register ──\nfunction regEntry(student, lesson) { return S.T.data.register.find(r => r.student === student && r.lesson === lesson); }\nfunction renderRegister() {\n  const cfg = S.cfg, T = S.T, lesson = T.lesson, L = lessonByNumber(lesson), roster = groupRoster();\n  const marked = roster.filter(r => { const e = regEntry(r.student, lesson); return e && e.participation; }).length;\n  return `<div class=\"subtabs\">${cfg.lessons.map(l => { const any = T.data.register.some(r => r.lesson === l.number && r.participation); return `<button class=\"subtab ${l.number === lesson ? 'active' : ''}\" data-act=\"t-lesson\" data-n=\"${l.number}\" title=\"${esc(l.title)}\">L${l.number}${any ? ' ✓' : ''}<span class=\"tiny\">${esc(l.checkpoint || '')}</span></button>`; }).join('')}</div>\n    <div class=\"card\"><div class=\"card-head green\">L${lesson} · ${esc(L ? L.title : '')} <span class=\"right\">${marked} of ${roster.length} marked</span></div><div class=\"card-body\">\n      <div class=\"toolbar\"><span class=\"small muted\">Tap once per student. Notes are optional (\"absent\", \"injured\", \"led warm-up\").</span><div class=\"grow\"></div><button class=\"pill-btn small\" data-act=\"reg-all\" data-n=\"2\">Mark all unmarked as \"${esc(cfg.participationLabels[1])}\"</button></div>\n      ${roster.map(r => { const e = regEntry(r.student, lesson) || {}; return `<div class=\"reg-row\"><div class=\"name\">${avatar(r.student)} <span>${esc(r.student)}${!T.sport ? `<span class=\"tiny muted\"> · ${esc(r.sport)}</span>` : ''}</span></div>\n        <div class=\"ppills\">${[1, 2, 3].map(v => `<button type=\"button\" class=\"${e.participation === v ? 'on p' + v : ''}\" data-act=\"reg\" data-student=\"${esc(r.student)}\" data-n=\"${v}\">${esc(cfg.participationLabels[v - 1])}</button>`).join('')}</div>\n        <input type=\"text\" placeholder=\"note\" maxlength=\"200\" value=\"${esc(e.note || '')}\" data-in=\"reg-note\" data-student=\"${esc(r.student)}\"></div>`; }).join('')}\n    </div></div>`;\n}\nfunction setRegister(student, lesson, patch) {\n  let e = regEntry(student, lesson); if (!e) { e = { student, lesson, participation: null, note: '' }; S.T.data.register.push(e); }\n  Object.assign(e, patch);\n  Pending.put('reg|' + S.T.section + '|' + lesson, 'saveRegister', { section: S.T.section, lesson }, student, Object.assign({ student }, patch));\n}\n\n// ── skill tests ──\nfunction tScore(student, cp, skill) { const t = S.T.data.tests.find(x => x.student === student && x.checkpoint === cp && x.skill === skill); return t && t.score !== null ? t.score : null; }\nfunction renderSkillTests() {\n  const cfg = S.cfg, T = S.T, cp = CPS().find(c => c.name === T.cpName) || CPS()[0];\n  if (!cp) return `<div class=\"empty\">No checkpoints defined — add Early / Middle / End in the Checkpoint column of the Lessons tab.</div>`;\n  const sports = T.sport ? [T.sport] : sportsInSection();\n  return `<div class=\"subtabs\">${CPS().map(c => `<button class=\"subtab ${c.name === cp.name ? 'active' : ''}\" data-act=\"t-cp\" data-v=\"${esc(c.name)}\">${esc(c.name)}<span class=\"tiny\">L${c.lesson}</span></button>`).join('')}</div>\n    ${sports.map(sp => { const skills = skillsOf(sp); const roster = groupRoster().filter(r => r.sport === sp); if (!roster.length) return '';\n      return `<div class=\"card\"><div class=\"card-head coral\">${esc(cp.name)} · ${esc(sp)} <span class=\"right\">score out of ${cfg.scoreMax} · saves as you type</span></div><div class=\"card-body\">\n        <div class=\"tbl-wrap\"><table class=\"tbl\"><thead><tr><th>Student</th><th class=\"c\">Focus</th>${skills.map(s => `<th class=\"c\" title=\"${esc(s.test)} — ${esc(s.success)}\">${esc(s.skill)}<br><span class=\"tiny\" style=\"text-transform:none;letter-spacing:0;font-weight:400\">${esc(s.test)}</span></th>`).join('')}</tr></thead><tbody>\n        ${roster.map(r => { const me = { checkins: T.data.checkins.filter(x => x.student === r.student) }; const fc = currentFocus(me);\n          return `<tr><td><b>${esc(r.student)}</b></td><td class=\"c\">${fc.skill ? `<span class=\"tag\" title=\"focus skill\">${esc(fc.skill)}</span>` : '<span class=\"faint\">–</span>'}</td>\n          ${skills.map(s => { const v = tScore(r.student, cp.name, s.skill); const st = stageOf(v); return `<td class=\"cell\"><div class=\"score-in\"><input class=\"num-in short\" type=\"number\" min=\"0\" max=\"${cfg.scoreMax}\" step=\"1\" inputmode=\"numeric\" value=\"${v === null ? '' : v}\" data-in=\"test\" data-student=\"${esc(r.student)}\" data-skill=\"${esc(s.skill)}\"><span class=\"stage-pill st${st}\" data-stage-for=\"${esc(r.student)}|${esc(s.skill)}\">${st ? esc(stageName(st)) : '–'}</span></div></td>`; }).join('')}</tr>`; }).join('')}\n        </tbody></table></div>\n        <div class=\"legend\">${cfg.stageLabels.map((l, i) => `<span><span class=\"chip st${i + 1}\">${i === 0 ? '0–' + cfg.stageBands[0] : i === 1 ? (cfg.stageBands[0] + 1) + '–' + cfg.stageBands[1] : (cfg.stageBands[1] + 1) + '–' + cfg.scoreMax}</span> ${esc(l)}</span>`).join('')}<span class=\"faint\">Tip: at the Middle check-in you only need to retest each student's focus skill.</span></div>\n      </div></div>`; }).join('')}\n    ${cfg.outcomes.length ? renderOutcomesGrid(cp) : ''}`;\n}\nfunction tOutcome(student, cp, outcome) { return S.T.data.outcomes.find(x => x.student === student && x.checkpoint === cp && x.outcome === outcome) || null; }\nfunction renderOutcomesGrid(cp) {\n  const cfg = S.cfg, roster = groupRoster();\n  return `<div class=\"card\"><div class=\"card-head dark\">${esc(cp.name)} · Personal skills <span class=\"right\">tap to cycle 1 → 3 → blank · small number = student's own view</span></div><div class=\"card-body\">\n    <div class=\"tbl-wrap\"><table class=\"tbl\"><thead><tr><th>Student</th>${cfg.outcomes.map(o => `<th class=\"c\" title=\"${esc(o.looksLike)}\">${esc(o.outcome)}</th>`).join('')}</tr></thead><tbody>\n    ${roster.map(r => `<tr><td><b>${esc(r.student)}</b>${!S.T.sport ? `<span class=\"sug-note\">${esc(r.sport)}</span>` : ''}</td>${cfg.outcomes.map(o => { const x = tOutcome(r.student, cp.name, o.outcome) || {}; return `<td class=\"cell\"><button type=\"button\" class=\"cyc ${x.teacher ? 'st' + x.teacher : ''}\" data-act=\"t-outcome\" data-student=\"${esc(r.student)}\" data-outcome=\"${esc(o.outcome)}\">${x.teacher || '–'}<small>self ${x.self || '–'}</small></button></td>`; }).join('')}</tr>`).join('')}\n    </tbody></table></div><div class=\"legend\">${cfg.outcomeLabels.map((l, i) => `<span><span class=\"chip st${i + 1}\">${i + 1}</span> ${esc(l)}</span>`).join('')}</div></div></div>`;\n}\nfunction setOutcome(student, outcome, v) {\n  const T = S.T; let x = tOutcome(student, T.cpName, outcome);\n  if (!x) { x = { student, checkpoint: T.cpName, outcome, self: null, teacher: null }; T.data.outcomes.push(x); }\n  x.teacher = v;\n  Pending.put('outcomes|' + T.section + '|' + T.cpName, 'saveOutcomes', { section: T.section, checkpoint: T.cpName }, student + '|' + outcome, { student, outcome, teacher: v === null ? '' : v });\n}\nfunction setTestScore(student, skill, value) {\n  const T = S.T; const v = value === '' ? null : Math.max(0, Math.min(S.cfg.scoreMax, Math.round(num(value))));\n  let t = T.data.tests.find(x => x.student === student && x.checkpoint === T.cpName && x.skill === skill);\n  if (!t) { t = { student, checkpoint: T.cpName, skill, score: null }; T.data.tests.push(t); }\n  t.score = v;\n  const pill = document.querySelector(`[data-stage-for=\"${CSS.escape(student + '|' + skill)}\"]`); if (pill) { const st = stageOf(v); pill.className = 'stage-pill st' + st; pill.textContent = st ? stageName(st) : '–'; }\n  Pending.put('tests|' + T.section + '|' + T.cpName, 'saveSkillTests', { section: T.section, checkpoint: T.cpName }, student + '|' + skill, { student, skill, score: v === null ? '' : v });\n}\n\n// ── agility ──\nfunction renderAgility() {\n  const cfg = S.cfg, T = S.T, roster = groupRoster();\n  if (!cfg.test.name) return `<div class=\"empty\">No fitness test configured. Set <b>test_name</b> on the Config tab.</div>`;\n  return `<div class=\"card\"><div class=\"card-head purple\">${esc(cfg.test.name)} <span class=\"right\">${esc(cfg.test.unit)} · ${cfg.test.lowerIsBetter ? 'lower is better' : 'higher is better'} · saves as you type</span></div><div class=\"card-body\">\n    <div class=\"tbl-wrap\"><table class=\"tbl\"><thead><tr><th>Student</th>${!T.sport ? '<th>Sport</th>' : ''}<th class=\"c\">Baseline</th><th class=\"c\">Re-test</th><th class=\"c\">Change</th></tr></thead><tbody>\n    ${roster.map(r => { const t = T.data.agility[r.student] || {}; const b = num(t.baseline), rt = num(t.retest); let ch = '—';\n      if (b !== null && rt !== null) { const d = rt - b, better = cfg.test.lowerIsBetter ? d < 0 : d > 0; ch = `<span style=\"color:${Math.abs(d) < 1e-9 ? 'var(--muted)' : (better ? 'var(--green)' : 'var(--red)')}\">${d > 0 ? '+' : ''}${fmt(d, 2)}</span>`; }\n      return `<tr><td><b>${esc(r.student)}</b></td>${!T.sport ? `<td class=\"muted small\">${esc(r.sport)}</td>` : ''}\n        <td class=\"c\"><input class=\"num-in\" type=\"number\" step=\"0.01\" inputmode=\"decimal\" value=\"${b === null ? '' : b}\" data-in=\"agility\" data-field=\"baseline\" data-student=\"${esc(r.student)}\"></td>\n        <td class=\"c\"><input class=\"num-in\" type=\"number\" step=\"0.01\" inputmode=\"decimal\" value=\"${rt === null ? '' : rt}\" data-in=\"agility\" data-field=\"retest\" data-student=\"${esc(r.student)}\"></td><td class=\"c\">${ch}</td></tr>`; }).join('')}\n    </tbody></table></div></div></div>`;\n}\nfunction setAgility(student, field, value) {\n  const T = S.T; const t = T.data.agility[student] || (T.data.agility[student] = { baseline: null, retest: null }); t[field] = num(value);\n  const entry = { student }; entry[field] = num(value);\n  Pending.put('agility|' + T.section, 'saveAgility', { section: T.section }, student + '|' + field, entry);\n}\n\n// ── students ──\nfunction renderStudents() {\n  const T = S.T, roster = groupRoster(), cps = CPS();\n  return `<div class=\"card\"><div class=\"card-head\">Students · ${esc(T.section)}${T.sport ? ' · ' + esc(T.sport) : ''} <span class=\"right\">open a student to see their dashboard or enter a check-in for them</span></div><div class=\"card-body\">\n    <div class=\"student-list\">${roster.map(r => { const me = { checkins: T.data.checkins.filter(x => x.student === r.student) }; const done = cps.filter(c => cpDone(me, c)).length; const fc = currentFocus(me);\n      return `<button class=\"student-card\" data-act=\"t-open-student\" data-student=\"${esc(r.student)}\">${avatar(r.student)}<div><div class=\"n\">${esc(r.student)}</div><div class=\"s\">${esc(r.sport)} · ${done}/${cps.length} check-ins${fc.skill ? ' · ' + esc(fc.skill) : ''}</div></div></button>`; }).join('')}</div></div></div>`;\n}\nasync function openStudentAsTeacher(name) {\n  const T = S.T; T.viewing = name; S.me = null; T.tab = 'student';\n  $('#app').innerHTML = `<div class=\"loading\"><div class=\"spinner\"></div> Loading ${esc(name)}…</div>`;\n  try { const d = await call('getStudent', T.section, name); if (T.viewing !== name) return; S.me = d; render(); }\n  catch (e) { T.tab = 'students'; render(); toast('Could not load: ' + e.message); }\n}\n\n// ── overview & grades ──\nfunction renderOverview() {\n  const cfg = S.cfg, T = S.T;\n  if (!T.overview) { if (!T._loadingOv) { T._loadingOv = true; loadOverview().finally(() => { T._loadingOv = false; }); } return `<div class=\"loading\"><div class=\"spinner\"></div> Building overview…</div>`; }\n  const evLabel = { test: 'focus-skill gain + ' + (cfg.test.name || 'test'), reflection: 'check-ins, goal, self-assessment, drill progress', participation: 'register', skills: 'all skill scores at the end', outcomes: 'your personal-skill ratings', none: 'no automatic evidence' };\n  return `<div class=\"card\"><div class=\"card-body small muted\"><b>Suggested</b> scores (dashed) come from the evidence: ${cfg.criteria.map(c => `<b>${esc(c.code)}</b> ← ${esc(evLabel[c.evidence])}`).join(' · ')}. A starting point only. Tap a number to set the <b>final</b> grade; ✎ adds a comment. \"Build grade report tab\" in the Sheet menu exports everything.</div></div>\n    <div class=\"card\"><div class=\"card-head dark\">Overview · ${esc(T.section)}${T.sport ? ' · ' + esc(T.sport) : ''} <span class=\"right\"><a href=\"#\" data-act=\"ov-refresh\" style=\"color:#fff\">refresh</a></span></div><div class=\"card-body\"><div class=\"tbl-wrap\">\n    <table class=\"tbl ov\"><thead><tr><th class=\"sticky\">Student</th><th class=\"c\">Lessons</th><th class=\"c\">Particip.</th><th class=\"c\">Check-ins</th><th>Focus skill</th><th class=\"c\">Focus score</th><th class=\"c\">Drill</th><th class=\"c\">Self-assess</th>${cfg.outcomes.length ? '<th class=\"c\">Personal<br><span class=\"tiny\" style=\"text-transform:none;letter-spacing:0\">teacher / self</span></th>' : ''}${cfg.test.name ? `<th class=\"c\">${esc(cfg.test.name)}</th>` : ''}<th>Grades <span class=\"tiny\" style=\"text-transform:none;letter-spacing:0\">(dashed = suggested)</span></th></tr></thead><tbody>\n    ${T.overview.map(o => `<tr><td class=\"sticky\"><b>${esc(o.student)}</b>${!T.sport ? `<span class=\"sug-note\">${esc(o.sport)}</span>` : ''}</td>\n      <td class=\"c\">${o.lessonsAttended}/${o.lessonsRun}</td>\n      <td class=\"c\">${o.participationAvg === null ? '—' : fmt(o.participationAvg, 1) + '<span class=\"tiny muted\">/3</span>'}</td>\n      <td class=\"c\">${o.checkins}/${CPS().length}<span class=\"sug-note\">${o.reflections} reflections</span></td>\n      <td>${o.focus ? esc(o.focus) + (o.chosenAtUnderstanding === false ? '<span class=\"sug-note\">not at ' + esc(cfg.stageLabels[0]) + '</span>' : '') : '<span class=\"faint\">—</span>'}</td>\n      <td class=\"c\">${o.focusStart === null ? '<span class=\"faint\">—</span>' : `${stageChip(o.focusStart)} → ${o.focusEnd !== null && o.focusGain !== null ? stageChip(o.focusEnd) : '<span class=\"chip none\">·</span>'}${o.focusGain !== null ? `<span class=\"sug-note\" style=\"color:${o.focusGain > 0 ? 'var(--green)' : o.focusGain < 0 ? 'var(--red)' : 'inherit'}\">${o.focusGain > 0 ? '+' : ''}${o.focusGain}</span>` : ''}`}</td>\n      <td class=\"c\">${o.maxSteps ? (o.drillStep || 0) + '/' + o.maxSteps : '<span class=\"faint\">—</span>'}</td>\n      <td class=\"c\">${o.selfAccuracy === null ? '<span class=\"faint\">—</span>' : Math.round(o.selfAccuracy * 100) + '%'}</td>\n      ${cfg.outcomes.length ? `<td class=\"c\">${fmt(o.outcomesTeacher, 1)} / ${fmt(o.outcomesSelf, 1)}</td>` : ''}\n      ${cfg.test.name ? `<td class=\"c\">${o.agility.change === null ? '<span class=\"faint\">—</span>' : `<span style=\"color:${(cfg.test.lowerIsBetter ? o.agility.change < 0 : o.agility.change > 0) ? 'var(--green)' : 'var(--red)'}\">${o.agility.change > 0 ? '+' : ''}${fmt(o.agility.change, 2)}</span><span class=\"sug-note\">adj ${fmt(o.agility.adjusted, 2)}</span>`}</td>` : ''}\n      <td class=\"grade-cell\">${cfg.criteria.map(c => { const f = o.final[c.code] || {}, sug = o.suggested[c.code]; return `<div class=\"grade-line\"><span class=\"grade-code\" title=\"${esc(c.name)}\">${esc(c.code)}</span><div class=\"score-row\">${[1, 2, 3, 4, 5, 6, 7].map(n => `<button type=\"button\" class=\"${f.score === n ? 'on' : ''} ${sug === n && f.score !== n ? 'sug' : ''}\" data-act=\"grade\" data-student=\"${esc(o.student)}\" data-code=\"${esc(c.code)}\" data-n=\"${n}\">${n}</button>`).join('')}<button type=\"button\" title=\"${esc(f.comment || 'Add comment')}\" data-act=\"grade-comment\" data-student=\"${esc(o.student)}\" data-code=\"${esc(c.code)}\" style=\"${f.comment ? 'background:#eef4fb;color:var(--blue)' : ''}\">✎</button></div>${f.comment ? `<span class=\"grade-comment\" title=\"${esc(f.comment)}\">💬</span>` : ''}</div>`; }).join('')}</td>\n    </tr>`).join('')}\n    </tbody></table></div></div></div>`;\n}\nfunction setGrade(student, code, patch) {\n  const o = S.T.overview.find(x => x.student === student); if (!o) return;\n  o.final[code] = Object.assign(o.final[code] || {}, patch);\n  Pending.put('grade|' + S.T.section, 'saveGrades', { section: S.T.section }, student + '|' + code, Object.assign({ student, criterion: code }, patch));\n}\n\n// ── print daily logs ──\nfunction renderPrint() {\n  const T = S.T; const roster = T.printMode === 'blank' ? [null] : groupRoster();\n  return `<div class=\"toolbar no-print\">\n      <button class=\"subtab ${T.printMode === 'all' ? 'active' : ''}\" data-act=\"print-mode\" data-v=\"all\">One sheet per student (${groupRoster().length})</button>\n      <button class=\"subtab ${T.printMode === 'blank' ? 'active' : ''}\" data-act=\"print-mode\" data-v=\"blank\">Blank sheet</button>\n      <div class=\"grow\"></div><span class=\"small muted\">A4 portrait · one page each · best printed after the ${esc(CPS()[0] ? CPS()[0].name : 'Early')} check-in so each student's focus skill and drills are on it</span>\n      <button class=\"pill-btn primary\" data-act=\"print\">Print</button></div>\n    ${roster.map(r => renderSheet(r)).join('')}`;\n}\nfunction renderSheet(r) {\n  const cfg = S.cfg, cps = CPS(); const T = S.T;\n  const sport = r ? r.sport : (T.sport || '');\n  const me = r ? { checkins: T.data.checkins.filter(x => x.student === r.student) } : { checkins: [] };\n  const fc = currentFocus(me); const def = fc.skill ? skillDef(sport, fc.skill) : null;\n  const skills = skillsOf(sport);\n  const drillsBox = def\n    ? `<div class=\"s-box\"><h4>My drill progression · ${esc(fc.skill)}</h4><table class=\"s-drills\"><thead><tr><th>Step</th><th>Drill</th><th>Peer check: I can…</th><th>Peer ✓</th><th>Teacher ✓</th></tr></thead><tbody>${def.drills.map(d => `<tr><td><b>${d.step}</b></td><td>${esc(d.drill)}</td><td>${esc(d.criteria)}</td><td class=\"box\"></td><td class=\"box\"></td></tr>`).join('')}</tbody></table></div>`\n    : `<div class=\"s-box\"><h4>Key skills${sport ? ' · ' + esc(sport) : ''}</h4><ul>${skills.map(s => `<li><b>${esc(s.skill)}</b> <span>· ${esc(s.test)}</span></li>`).join('')}</ul><div style=\"font-size:8.5pt;color:#555;margin-top:3px\">Choose your focus skill at the ${esc(cps[0] ? cps[0].name : 'Early')} check-in. Your drill card for it follows.</div></div>`;\n  return `<div class=\"sheet\">\n    <div class=\"s-head\"><div><div class=\"u\">${esc(cfg.unitName)} · Daily log · ${esc(T.section)}${sport ? ' · ' + esc(sport) : ''}</div><div class=\"n\">${r ? esc(r.student) : '<span class=\"blank\">&nbsp;</span>'}</div></div>\n      <div style=\"text-align:right;font-size:8.5pt;color:#555\">Fill in one line at the end of every lesson.<br>Get a peer check, then a teacher signature, before moving to the next drill step.</div></div>\n    <div class=\"s-goal\"><b>Focus skill:</b> ${fc.skill ? esc(fc.skill) : '<span class=\"blank\">&nbsp;</span>'} &nbsp; <b>Goal:</b> ${fc.goal ? esc(fc.goal) : '<span class=\"blank\" style=\"min-width:110mm\">&nbsp;</span>'}</div>\n    <div class=\"s-cols\">${drillsBox}\n      <div class=\"s-box\"><h4>Agility elements (write the number)</h4>${cfg.focus.length ? `<ol class=\"two\">${cfg.focus.map(f => `<li><b>${esc(f.focus)}</b>${f.cue ? ` <span>· ${esc(f.cue)}</span>` : ''}</li>`).join('')}</ol>` : ''}\n        <h4 style=\"margin-top:4px\">Effort</h4><div style=\"font-size:9pt\">${cfg.participationLabels.map((l, i) => `${i + 1} = ${esc(l)}`).join(' · ')}</div></div></div>\n    <table><thead><tr><th style=\"width:7mm\">L</th><th style=\"width:15mm\">Date</th><th>Lesson</th><th style=\"width:11mm\">Drill step</th><th style=\"width:11mm\">Agility #</th><th style=\"width:15mm\">Effort</th><th>One thing I learned / will change next time</th><th style=\"width:10mm\">Tchr</th></tr></thead><tbody>\n    ${cfg.lessons.map(l => { const isCp = cps.some(c => c.lesson === l.number); return `<tr class=\"${isCp ? 'cp' : ''}\"><td class=\"tall\"><b>${l.number}</b></td><td>${esc(l.date || '')}</td><td class=\"ttl\">${esc(l.title)}</td><td></td><td></td><td class=\"circ\">1 2 3</td><td></td><td></td></tr>`; }).join('')}\n    </tbody></table>\n    <div class=\"s-foot\"><span>Check-ins on the laptop: ${cps.map(c => `<b>${esc(c.name)}</b> L${c.lesson}`).join(' · ')}</span><span>${cfg.test.name ? `${esc(cfg.test.name)}: baseline ______ ${esc(cfg.test.unit)} &nbsp; re-test ______ ${esc(cfg.test.unit)}` : ''}</span></div>\n  </div>`;\n}\n\n// ═══════════════════════ events ═══════════════════════\nconst actions = {\n  reload() { location.reload(); },\n  retry() { Outbox.retry(); },\n  'open-cp'(t) { openCpForm(S.me, t.dataset.cp); },\n  'cp-cancel'() { if (S.id.role === 'student') S.view = 'dash'; else S.T.tab = 'student'; render(); },\n  'cp-save'() { saveCpForm(); },\n  self(t) { const sk = t.dataset.skill, n = parseInt(t.dataset.n, 10); if (S.form.selfStages[sk] === n) delete S.form.selfStages[sk]; else S.form.selfStages[sk] = n; Array.from(t.parentElement.children).forEach(b => { b.className = ''; }); if (S.form.selfStages[sk]) t.className = 'on st' + n; },\n  'self-outcome'(t) { const k = t.dataset.outcome, n = parseInt(t.dataset.n, 10); if (S.form.selfOutcomes[k] === n) delete S.form.selfOutcomes[k]; else S.form.selfOutcomes[k] = n; Array.from(t.parentElement.children).forEach(b => { b.className = ''; }); if (S.form.selfOutcomes[k]) t.className = 'on st' + n; },\n  't-outcome'(t) { const student = t.dataset.student, outcome = t.dataset.outcome; const x = tOutcome(student, S.T.cpName, outcome); const cur = x && x.teacher ? x.teacher : 0; const next = cur >= 3 ? null : cur + 1; setOutcome(student, outcome, next); t.className = 'cyc ' + (next ? 'st' + next : ''); t.innerHTML = (next || '–') + `<small>self ${x && x.self ? x.self : '–'}</small>`; },\n  'focus-skill'(t) { const v = t.dataset.v; const changed = S.form.focusSkill !== v; S.form.focusSkill = v; if (changed) { S.form.drillStep = 0; if (!S.form.goalTouched) S.form.goal = draftGoal(S.me, v, S.cp.name); } render(); },\n  'goal-redraft'() { if (S.form.focusSkill) { S.form.goal = draftGoal(S.me, S.form.focusSkill, S.cp.name); S.form.goalTouched = false; render(); } },\n  'drill-step'(t) { S.form.drillStep = parseInt(t.dataset.n, 10); render(); },\n  agility(t) { const v = t.dataset.v; S.form.agilityFocus = S.form.agilityFocus === v ? '' : v; Array.from(t.parentElement.children).forEach(b => b.classList.toggle('on', b.dataset.v === S.form.agilityFocus)); },\n  't-section'(t) { S.T.lesson = null; loadSection(t.dataset.v); },\n  't-sport'(t) { S.T.sport = t.dataset.v; S.T.overview = null; render(); if (S.T.tab === 'overview') loadOverview(); },\n  't-tab'(t) { S.T.tab = t.dataset.tab; S.T.viewing = null; render(); if (S.T.tab === 'overview' && !S.T.overview) loadOverview(); },\n  't-back'() { S.T.tab = 'students'; S.T.viewing = null; render(); },\n  't-lesson'(t) { S.T.lesson = parseInt(t.dataset.n, 10); render(); },\n  't-cp'(t) { S.T.cpName = t.dataset.v; render(); },\n  't-open-student'(t) { openStudentAsTeacher(t.dataset.student); },\n  reg(t) { const student = t.dataset.student, n = parseInt(t.dataset.n, 10); const e = regEntry(student, S.T.lesson); setRegister(student, S.T.lesson, { participation: e && e.participation === n ? null : n }); render(); },\n  'reg-all'(t) { const n = parseInt(t.dataset.n, 10); groupRoster().forEach(r => { const e = regEntry(r.student, S.T.lesson); if (!e || !e.participation) setRegister(r.student, S.T.lesson, { participation: n }); }); render(); },\n  grade(t) { const student = t.dataset.student, code = t.dataset.code, n = parseInt(t.dataset.n, 10); const o = S.T.overview.find(x => x.student === student); const cur = o && o.final[code] && o.final[code].score; setGrade(student, code, { score: cur === n ? null : n }); render(); },\n  'grade-comment'(t) { const student = t.dataset.student, code = t.dataset.code; const o = S.T.overview.find(x => x.student === student); const cur = (o && o.final[code] && o.final[code].comment) || ''; const v = window.prompt(`Comment for ${student} · ${code}`, cur); if (v === null) return; setGrade(student, code, { comment: v.trim() }); render(); },\n  'ov-refresh'() { S.T.overview = null; render(); loadOverview(); },\n  'print-mode'(t) { S.T.printMode = t.dataset.v; render(); },\n  print() { window.print(); }\n};\ndocument.addEventListener('click', e => { const t = e.target.closest('[data-act]'); if (!t) return; if (t.tagName === 'A') e.preventDefault(); const fn = actions[t.dataset.act]; if (fn) fn(t, e); });\ndocument.addEventListener('input', e => { const t = e.target; const k = t.dataset && t.dataset.in; if (!k) return; if (k === 'wentWell' || k === 'nextGoal') S.form[k] = t.value; if (k === 'goal') { S.form.goal = t.value; S.form.goalTouched = true; } });\ndocument.addEventListener('change', e => {\n  const t = e.target; const k = t.dataset && t.dataset.in; if (!k) return;\n  if (k === 'reg-note') setRegister(t.dataset.student, S.T.lesson, { note: t.value.trim() });\n  if (k === 'agility') setAgility(t.dataset.student, t.dataset.field, t.value);\n  if (k === 'test') setTestScore(t.dataset.student, t.dataset.skill, t.value);\n});\n\nboot();\n})();\n<\/script>\n"
};
