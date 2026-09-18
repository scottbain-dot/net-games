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
  Lessons:  ['Number', 'Checkpoint', 'Date'],
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
    [1, 'Early', ''], [2, '', ''], [3, '', ''], [4, '', ''], [5, 'Middle', ''],
    [6, '', ''], [7, '', ''], [8, '', ''], [9, 'End', '']
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
  // Seed by header NAME, not position — a tab kept from an older version may
  // have extra or re-ordered columns.
  ['Lessons', 'Skills', 'Drills', 'Focus', 'Outcomes', 'Criteria'].forEach(function(n) {
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
