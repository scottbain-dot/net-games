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
  Skills:   ['Sport', 'Skill', 'Test', 'Success', 'Scale'],
  Drills:   ['Sport', 'Skill', 'Step', 'Drill', 'Criteria'],
  Outcomes: ['Outcome', 'LooksLike'],
  BackPage: ['Sport', 'Line'],
  Criteria: ['Code', 'Name', 'Evidence', 'TopBand'],
  Roster:   ['Section', 'Sport', 'Student', 'Email'],
  Teachers: ['Email', 'Name', 'Sport', 'Role']
};
// Records are keyed by Section + Email (the sign-in address, unique per
// student). Student is the display name and may repeat within a section.
var DATA_TABS = {
  Register:   ['Section', 'Sport', 'Student', 'Email', 'Lesson', 'Participation', 'Note', 'Updated'],
  SkillTests: ['Section', 'Sport', 'Student', 'Email', 'Checkpoint', 'Skill', 'Score', 'By', 'Updated'],
  Checkins:   ['Section', 'Sport', 'Student', 'Email', 'Checkpoint', 'FocusSkill', 'Goal', 'DrillStep', 'ExtensionSkill', 'ExtensionDrill', 'SelfStages', 'WentWell', 'NextGoal', 'GamePlay', 'GameNote', 'Engagement', 'Personal', 'Confirmed', 'Updated'],
  OutcomeRatings: ['Section', 'Sport', 'Student', 'Email', 'Checkpoint', 'Outcome', 'Self', 'Teacher', 'Updated'],
  Grades:     ['Section', 'Sport', 'Student', 'Email', 'Criterion', 'Score', 'Comment', 'Updated']
};
// Data tabs of the first version (v1) that this version does not read.
var OBSOLETE_TABS = ['Checkpoints', 'Reflections', 'Tests'];
var DATA_KEYS = {
  Register:   ['Section', 'Email', 'Lesson'],
  SkillTests: ['Section', 'Email', 'Checkpoint', 'Skill'],
  Checkins:   ['Section', 'Email', 'Checkpoint'],
  OutcomeRatings: ['Section', 'Email', 'Checkpoint', 'Outcome'],
  Grades:     ['Section', 'Email', 'Criterion']
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
  oauth_client_id:      ['', 'GitHub Pages front end only: the Google OAuth client ID the page signs in with (see the guide)'],
  allowed_domain:       ['', 'GitHub Pages front end only: Google Workspace domain allowed to sign in (blank = the Sheet owner\'s domain)'],
  daily_register:       ['FALSE', 'TRUE to add a per-lesson participation register for teachers (otherwise engagement is rated at each check-in)']
};
var CACHE_KEY_CONFIG = 'mfs_config_v2';
var CACHE_SECONDS = 180;
var EVIDENCE_TYPES = ['test', 'reflection', 'participation', 'skills', 'outcomes', 'none'];

// ---------- Example unit (seeded only into EMPTY tabs — edit freely) ----------
var EXAMPLE = {
  Lessons: [
    [1, '', ''], [2, '', ''], [3, 'Early', ''], [4, '', ''], [5, '', ''], [6, 'Middle', ''],
    [7, '', ''], [8, '', ''], [9, '', ''], [10, 'End', '']
  ],
  Skills: [
    ['Net Games',    'Serve accuracy',  '10 serves from full distance. Partner calls the target before each serve. Volleyball: left or right half · Badminton: short or long', 'Legal serve that lands in the called half (volleyball) or the called zone: front corners short, back corners long (badminton)', ''],
    ['Net Games',    'Rally control',   '10 feeds from across the net, one at a time. Volleyball: feeder tosses, you forearm pass to your partner at the setter spot · Badminton: feeder clears or drops, you return it over the net', 'Volleyball: your partner catches the pass without moving more than one step · Badminton: the return goes over and lands in', ''],
    ['Net Games',    'Attacking shot',  '10 feeds to alternating sides from a partner. Touch the centre cone between feeds. Volleyball: spike · Badminton: smash', 'Spike or smash that lands in the court (stretch test)', ''],
    ['Ultimate',     'Backhand throw',  '10 backhand throws to a partner 10 m away',                         'Catchable at chest height without the partner moving', ''],
    ['Ultimate',     'Forehand throw',  '10 forehand (flick) throws to a partner 10 m away',                 'Flat and catchable at chest height without the partner moving', ''],
    ['Ultimate',     'Hammer throw',    '10 hammer throws over a 2 m obstacle to a partner 15 m away',       'Clears the obstacle and arrives catchable (stretch test)', ''],
    ['Table Tennis', 'Short serve',     '10 serves: the ball must bounce twice on the far side before the end of the table', 'Legal serve, second bounce before the end line', ''],
    ['Table Tennis', 'Forehand topspin', '10 fed balls, forehand topspin (brush up the back of the ball)',   'On the table, past the middle, with visible topspin', ''],
    ['Table Tennis', 'Third-ball attack', '10 rallies: serve, partner returns anywhere, attack and win the point within two shots', 'Winner or forced error against a partner who defends (stretch test)', ''],
    ['Handball',     'Passing',         '60 s continuous passing, partner 4–5 m apart: count passes, then convert', 'A clean catch by the partner', '≤15→1 · 16–20→2 · 21–25→3 · 26–30→4 · 31–35→5 · 36–40→6 · 41–45→7 · 46–50→8 · 51–55→9 · 56+→10'],
    ['Handball',     'Dribbling',       '3 laps of 20 m: total time, then convert',   'Ball under control the whole way; a lost ball restarts that lap', '>36 s→1 · 33–36→2 · 30–32→3 · 27–29→4 · 24–26→5 · 22–23→6 · 20–21→7 · 18–19→8 · 16–17→9 · ≤15 s→10'],
    ['Handball',     'Shooting',        '10 shots at the goal corners, a mix of standing and jump shots',     'Ball enters a corner zone (stretch test)', '']
  ],
  Drills: [
    ['Net Games', 'Serve accuracy', 1, 'Stage 1', 'Your teacher sets the drill and the target'],
    ['Net Games', 'Serve accuracy', 2, 'Stage 2', 'Your teacher sets the drill and the target'],
    ['Net Games', 'Serve accuracy', 3, 'Stage 3', 'Your teacher sets the drill and the target'],
    ['Net Games', 'Serve accuracy', 4, 'Stage 4 · your design', 'You can explain why your version is harder'],
    ['Net Games', 'Rally control', 1, 'Stage 1', 'Your teacher sets the drill and the target'],
    ['Net Games', 'Rally control', 2, 'Stage 2', 'Your teacher sets the drill and the target'],
    ['Net Games', 'Rally control', 3, 'Stage 3', 'Your teacher sets the drill and the target'],
    ['Net Games', 'Rally control', 4, 'Stage 4 · your design', 'You can explain why your version is harder'],
    ['Net Games', 'Attacking shot', 1, 'Stage 1', 'Your teacher sets the drill and the target'],
    ['Net Games', 'Attacking shot', 2, 'Stage 2', 'Your teacher sets the drill and the target'],
    ['Net Games', 'Attacking shot', 3, 'Stage 3', 'Your teacher sets the drill and the target'],
    ['Net Games', 'Attacking shot', 4, 'Stage 4 · your design', 'You can explain why your version is harder'],
    ['Ultimate', 'Backhand throw', 1, 'Stationary target hit', '7 of 10 through a 1 m gate from 10 m'],
    ['Ultimate', 'Backhand throw', 2, 'Pivot & lead throw', '6 of 10 catchable to a partner cutting across, after a pivot'],
    ['Ultimate', 'Backhand throw', 3, 'Pressure backhand under mark', '5 of 10 completed past a live mark'],
    ['Ultimate', 'Backhand throw', 4, 'Your choice: a harder drill you design', 'Agree the "done when" line with your teacher before you start'],
    ['Ultimate', 'Forehand throw', 1, 'Wrist snap isolation (5 m)', 'Flat, spinning flick over 5 m: 8 of 10 catchable'],
    ['Ultimate', 'Forehand throw', 2, 'Lateral step & target gate (10 m)', '7 of 10 through a 2 m gate from 10 m after a lateral step'],
    ['Ultimate', 'Forehand throw', 3, 'Rapid pivot & flick lead (12 m)', '6 of 10 catchable to a leading cutter from 12 m after a pivot'],
    ['Ultimate', 'Forehand throw', 4, 'Your choice: a harder drill you design', 'Agree the "done when" line with your teacher before you start'],
    ['Ultimate', 'Hammer throw', 1, 'Overhead arc target throw (8 m)', '7 of 10 land inside a 2 m circle at 8 m'],
    ['Ultimate', 'Hammer throw', 2, 'Over-the-obstacle grid drop (12 m)', '6 of 10 clear a 2 m obstacle and land in a 3 m grid at 12 m'],
    ['Ultimate', 'Hammer throw', 3, 'Deep hammer placement (15 m)', '5 of 10 land flat inside a 3 m zone at 15 m'],
    ['Ultimate', 'Hammer throw', 4, 'Your choice: a harder drill you design', 'Agree the "done when" line with your teacher before you start'],
    ['Table Tennis', 'Short serve', 1, 'Ball control & the toss', 'Bounce the ball on the bat 20 times; then toss from an open palm (about 16 cm) and catch it on the bat 5 in a row'],
    ['Table Tennis', 'Short serve', 2, 'Serve over the net, any length', '7 of 10 legal serves land on the far side'],
    ['Table Tennis', 'Short serve', 3, 'Serve short', '7 of 10 bounce twice on the far side before the end line'],
    ['Table Tennis', 'Short serve', 4, 'Serve short to a target', '6 of 10 bounce twice inside a paper target'],
    ['Table Tennis', 'Forehand topspin', 1, 'Shadow, then self-drop and brush', 'Low to high, finish over the shoulder (partner checks 5); then drop the ball and brush it onto the far side 5 of 10'],
    ['Table Tennis', 'Forehand topspin', 2, 'Multi-ball: slow feeds', 'Partner feeds one ball at a time from a box: 7 of 10 on the table and the ball dips'],
    ['Table Tennis', 'Forehand topspin', 3, 'Topspin rally against a block', '6 in a row against a partner who blocks'],
    ['Table Tennis', 'Forehand topspin', 4, 'Topspin against backspin', 'Partner pushes 10 backspin balls: lift 6 onto the table'],
    ['Table Tennis', 'Third-ball attack', 1, 'Serve, then attack a long, slow return', 'Serve, partner returns long and slow, topspin on the table: 6 of 10'],
    ['Table Tennis', 'Third-ball attack', 2, 'Serve, then attack a short return', 'Serve, partner returns short, attack on the table: 5 of 10'],
    ['Table Tennis', 'Third-ball attack', 3, 'Partner chooses long or short', 'Attack on the table whatever comes back: 5 of 10'],
    ['Table Tennis', 'Third-ball attack', 4, 'Live points', 'Win the point within two shots of the serve: 4 of 10'],
    ['Handball', 'Passing', 1, 'Stationary partner passing: pass types', '5 clean reps each of overhead, bounce, hip and lateral pass'],
    ['Handball', 'Passing', 2, 'Triangle passing', '10 consecutive passes with no drops, moving to a new position after each pass'],
    ['Handball', 'Passing', 3, 'Passing to a target / on the move', '8 of 10 clean passes hit a moving or marked target, any pass type'],
    ['Handball', 'Passing', 4, 'Challenge: keep-away 3v1 or 4v2, or your own drill', '8–10 consecutive passes keeping possession against a live defender'],
    ['Handball', 'Dribbling', 1, 'Stationary dribble control, both hands', '10 controlled touches with each hand without losing the ball'],
    ['Handball', 'Dribbling', 2, 'Straight-line dribbling, change of speed', 'A 20 m length under control with each hand, including a controlled acceleration'],
    ['Handball', 'Dribbling', 3, 'Dribbling through obstacles', '4 of 5 clean runs through 5 obstacles, keeping control'],
    ['Handball', 'Dribbling', 4, 'Challenge: 1v1 vs a defender, or your own drill', 'Beat the defender on 5 of 10 attempts using a change of direction or pace'],
    ['Handball', 'Shooting', 1, 'Standing shot technique', '7 of 10 shots on target from standing, correct technique'],
    ['Handball', 'Shooting', 2, 'Shooting off a pass', '7 of 10 catch-and-shoot attempts on target'],
    ['Handball', 'Shooting', 3, 'Shooting off the approach / dribble (jump shot)', '7 of 10 jump shots on target'],
    ['Handball', 'Shooting', 4, 'Challenge: shooting vs a goalkeeper, or your own drill', 'Score against a live keeper, aiming for the corners: 5 of 10']
  ],
  BackPage: [],
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
  var existing = s.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
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
      if (v instanceof Date) v = v.getFullYear() < 1905 ? serialOf_(v) : Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      obj[headers[c]] = v;
      if (v !== '' && v !== null && v !== undefined) empty = false;
    }
    if (!empty) out.push(obj);
  }
  return out;
}

// A small number in a cell that was date-formatted reads back as a Date near
// 1900 (Sheets counts days from 1899-12-30). Turn it back into the number.
function serialOf_(d) { return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000); }
function str_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function num_(v) { if (v === '' || v === null || v === undefined) return null; var n = parseFloat(v); return isNaN(n) ? null : n; }
function bool_(v) { return /^(true|yes|1)$/i.test(str_(v)); }
function lower_(v) { return str_(v).toLowerCase(); }
function keyOf_(fields, obj) { return fields.map(function(f) { return lower_(obj[f]); }).join('\u0001'); }  // separator: '7'+'Ann' must never equal '7A'+'nn'
function splitList_(s) { return str_(s).split('|').map(function(x) { return x.trim(); }).filter(Boolean); }

// Insert-or-update rows keyed on DATA_KEYS[name]. Columns the caller does not
// send keep their existing value.
function upsert_(name, rows) {
  if (!rows || !rows.length) return 0;
  var s = ensureTab_(name, DATA_TABS[name]);
  var keys = DATA_KEYS[name];
  var lastRow = s.getLastRow(), lastCol = s.getLastColumn();
  var sheetHeaders = s.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
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
  lock.waitLock(90000);  // a whole class saving at once queues here; the client retries on failure
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
    (skills[sp] = skills[sp] || []).push({ skill: sk, test: str_(s.Test), success: str_(s.Success), scale: str_(s.Scale), drills: [] });
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
  // Optional back page for the printed student log: one row per line, in
  // order. Sport blank = every sport. A line starting "# " is a heading,
  // "- " a bullet, "___" a ruled writing line, blank a gap.
  var backPages = {};
  readTab_('BackPage').forEach(function(r) { var sp = str_(r.Sport); (backPages[sp] = backPages[sp] || []).push(str_(r.Line)); });
  var criteria = readTab_('Criteria').map(function(r) {
    var ev = lower_(r.Evidence);
    return { code: str_(r.Code), name: str_(r.Name), evidence: EVIDENCE_TYPES.indexOf(ev) === -1 ? 'none' : ev, top: str_(r.TopBand) };
  }).filter(function(c) { return c.code; });

  var sportNames = Object.keys(skills);
  var canonSport = function(v) { var x = str_(v); var hit = sportNames.filter(function(n) { return n.toLowerCase() === x.toLowerCase(); })[0]; return hit || x; };
  var roster = readTab_('Roster').map(function(r) { var em = lower_(r.Email); return { section: str_(r.Section), sport: canonSport(r.Sport), student: str_(r.Student), email: em, id: studentId_(em) }; })
    .filter(function(r) { return r.section && r.student; });
  var sections = [];
  roster.forEach(function(r) { if (sections.indexOf(r.section) === -1) sections.push(r.section); });
  // Role: blank = teacher (everything). 'coach' = an outside instructor: their sport only, no Grades tab, plain wording.
  var teachers = readTab_('Teachers').map(function(r) { return { email: lower_(r.Email), sport: canonSport(r.Sport), role: lower_(str_(r.Role)) }; }).filter(function(t) { return t.email; });

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
    oauthClientId: str_(kv.oauth_client_id), allowedDomain: lower_(kv.allowed_domain),
    lessons: lessons, sports: sports, skills: skills, checkpoints: checkpoints,
    outcomes: outcomes, criteria: criteria, sections: sections, roster: roster, teachers: teachers, backPages: backPages
  };
}
function stageOf_(cfg, score) {
  if (score === null || score === undefined || score === '') return 0;
  if (score <= cfg.stageBands[0]) return 1;
  if (score <= cfg.stageBands[1]) return 2;
  return 3;
}

// ---------- Identity ----------
var REQUEST_EMAIL_ = null;  // set by doPost after verifying a Google ID token (GitHub Pages front end)
function identity_(cfg) {
  var email = REQUEST_EMAIL_ !== null ? REQUEST_EMAIL_ : lower_(Session.getActiveUser().getEmail());
  var owner = lower_(Session.getEffectiveUser().getEmail());
  var out = { email: email, role: 'unknown', name: '', id: '', section: '', sport: '' };
  var t = cfg.teachers.filter(function(x) { return x.email === email; })[0];
  var me = email ? cfg.roster.filter(function(r) { return r.email === email; })[0] : null;
  if (email && (email === owner || t)) {
    out.role = 'teacher'; out.sport = t ? t.sport : ''; out.coach = !!(t && t.role === 'coach');
    // A teacher who is also on the Roster can "Test as student" in the app.
    if (me) out.alsoStudent = { name: me.student, id: me.id, section: me.section, sport: me.sport };
    return out;
  }
  if (me) { out.role = 'student'; out.name = me.student; out.id = me.id; out.section = me.section; out.sport = me.sport; }
  return out;
}
function requireTeacher_(cfg) {
  var id = identity_(cfg);
  if (id.role !== 'teacher') throw new Error('Teachers only');
  return id;
}
// Opaque per-student id sent to browsers instead of the email: a student's
// device never holds another student's address, and a teacher's holds none.
function studentId_(email) { return email ? hashOf_('mfs-student|' + lower_(email)).slice(0, 12) : ''; }
// A roster row by id, email or (when it is unique in the section) name.
function rosterEntry_(cfg, section, ref) {
  ref = str_(ref); if (!ref) return null;
  var inSec = cfg.roster.filter(function(r) { return r.section === section; });
  var hit = inSec.filter(function(r) { return r.id === ref || r.email === ref.toLowerCase(); });
  if (!hit.length) hit = inSec.filter(function(r) { return r.student === ref; });
  if (hit.length > 1) throw new Error('More than one student called ' + ref + ' in ' + section);
  return hit[0] || null;
}
function resolveStudent_(cfg, section, ref) {
  var id = identity_(cfg);
  if (id.role === 'teacher') {
    var r = rosterEntry_(cfg, section, ref);
    if (!r) throw new Error('Student not on roster: ' + ref + ' (' + section + ')');
    return { section: r.section, sport: r.sport, student: r.student, email: r.email, id: r.id, byTeacher: true };
  }
  if (id.role === 'student') return { section: id.section, sport: id.sport, student: id.name, email: id.email, id: id.id, byTeacher: false };
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
// ---------- JSON API (GitHub Pages front end) ----------
// The page on GitHub Pages signs the user in with Google Identity Services and
// POSTs {token, fn, args} here. The ID token is verified with Google, the email
// becomes the request identity, and the same functions the /exec page uses run
// unchanged. Deploy as "Execute as Me" + "Anyone"; the token check is the gate.
var API_FUNCTIONS = ['bootstrap', 'getStudent', 'getSectionData', 'getOverview', 'saveCheckin', 'saveTeacherCheckin', 'saveRegister', 'saveSkillTests', 'saveGrades', 'saveOutcomes'];
function doPost(e) {
  var out;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var cfg = getConfig_();
    var email = verifyIdToken_(str_(body.token), cfg);
    if (!email) { out = { ok: false, code: VERIFY_FAILED_.code, error: 'Sign-in refused: ' + VERIFY_FAILED_.reason }; }
    else {
      var fn = str_(body.fn);
      if (API_FUNCTIONS.indexOf(fn) === -1) throw new Error('Unknown function');
      REQUEST_EMAIL_ = email;
      try { var result = this[fn].apply(null, Array.isArray(body.args) ? body.args : []); out = { ok: true, result: result === undefined ? null : result }; }
      finally { REQUEST_EMAIL_ = null; }
    }
  } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}
// Returns the lower-cased email for a valid Google ID token issued to our client
// ID and an allowed domain, or '' if it is not acceptable — with the reason in
// VERIFY_FAILED_ so the page can say what is wrong instead of asking for another
// sign-in that will fail the same way. code 'auth' = a fresh sign-in may help;
// 'server' = the Sheet owner has something to fix. Verified tokens are cached
// for a few minutes so a class saving at once does not re-verify each call.
var VERIFY_FAILED_ = { code: 'auth', reason: '' };
function verifyIdToken_(token, cfg) {
  var fail = function(code, reason) { VERIFY_FAILED_ = { code: code, reason: reason }; return ''; };
  if (!token) return fail('auth', 'no sign-in token was sent. Please sign in.');
  if (!cfg.oauthClientId) return fail('server', 'oauth_client_id is blank on the Config tab of the Sheet.');
  var cache = CacheService.getScriptCache(), key = 'tok|' + hashOf_(token);
  var hit = cache.get(key); if (hit) return hit;
  var res;
  try { res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true }); }
  catch (err) { return fail('server', 'the Sheet owner has not yet allowed the script to contact Google to check sign-ins. Owner: open the Sheet, run PE Tracker → 2. Check roster & config and approve the permission. (' + String(err && err.message || err) + ')'); }
  if (res.getResponseCode() !== 200) return fail('auth', 'Google did not accept the sign-in token (HTTP ' + res.getResponseCode() + '). Please sign in again.');
  var info; try { info = JSON.parse(res.getContentText()); } catch (err) { return fail('auth', 'Google sent an unreadable reply. Please try again.'); }
  var email = lower_(info.email);
  if (!email || String(info.email_verified) !== 'true') return fail('auth', 'that Google account has no verified email address.');
  if (str_(info.aud) !== cfg.oauthClientId) return fail('server', 'this page signs in with a different client ID from the oauth_client_id on the Sheet\'s Config tab. Owner: make config.js and the Config tab match.');
  var exp = parseInt(info.exp, 10) || 0, now = Math.floor(Date.now() / 1000);
  if (exp <= now) return fail('auth', 'the sign-in has expired. Please sign in again.');
  var domain = cfg.allowedDomain || lower_(Session.getEffectiveUser().getEmail()).split('@')[1] || '';
  if (domain && email.split('@')[1] !== domain) return fail('auth', 'only ' + domain + ' accounts can use this page; you signed in with a ' + email.split('@')[1] + ' account. Choose your school account.');
  try { cache.put(key, email, Math.min(300, Math.max(30, exp - now))); } catch (err) {}
  return email;
}
function hashOf_(str) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str, Utilities.Charset.UTF_8);
  return bytes.map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function include(name) { return EMBEDDED_HTML[name] !== undefined ? EMBEDDED_HTML[name] : HtmlService.createHtmlOutputFromFile(name).getContent(); }

function publicConfig_(cfg) {
  var c = JSON.parse(JSON.stringify(cfg));
  c.roster = c.roster.map(function(r) { return { section: r.section, sport: r.sport, student: r.student, id: r.id }; });
  delete c.teachers; delete c.allowedDomain;
  return c;
}

function bootstrap() {
  var cfg = getConfig_();
  var id = identity_(cfg);
  var out = { config: publicConfig_(cfg), identity: id, appUrl: appUrl_(), switchUrl: chooserUrl_(appUrl_() || ScriptApp.getService().getUrl() || '') };
  if (id.role === 'student') {
    // Data minimisation: a student's browser gets their own roster row only, never the class list.
    out.config.roster = out.config.roster.filter(function(r) { return r.id === id.id; });
    out.config.sections = [id.section];
    out.student = studentData_(cfg, id.section, id.id);
  }
  return out;
}

// ---------- Reads ----------
function rowsFor_(name, section, email) {
  return readTab_(name).filter(function(r) { return str_(r.Section) === section && (!email || lower_(r.Email) === email); });
}
function parseSelf_(s) { try { var o = JSON.parse(s || '{}'); return (o && typeof o === 'object') ? o : {}; } catch (e) { return {}; } }
function mapRegister_(r) { return { id: studentId_(lower_(r.Email)), student: str_(r.Student), lesson: num_(r.Lesson), participation: num_(r.Participation), note: str_(r.Note) }; }
function mapTest_(r) { return { id: studentId_(lower_(r.Email)), student: str_(r.Student), checkpoint: str_(r.Checkpoint), skill: str_(r.Skill), score: num_(r.Score), by: str_(r.By) || 'teacher' }; }
function mapCheckin_(r) { return { id: studentId_(lower_(r.Email)), student: str_(r.Student), checkpoint: str_(r.Checkpoint), focusSkill: str_(r.FocusSkill), goal: str_(r.Goal), drillStep: num_(r.DrillStep), extensionSkill: str_(r.ExtensionSkill), extensionDrill: str_(r.ExtensionDrill), selfStages: parseSelf_(r.SelfStages), wentWell: str_(r.WentWell), nextGoal: str_(r.NextGoal), gamePlay: num_(r.GamePlay), gameNote: str_(r.GameNote), engagement: num_(r.Engagement), personal: num_(r.Personal), confirmed: bool_(r.Confirmed) }; }
function mapOutcome_(r) { return { id: studentId_(lower_(r.Email)), student: str_(r.Student), checkpoint: str_(r.Checkpoint), outcome: str_(r.Outcome), self: num_(r.Self), teacher: num_(r.Teacher) }; }
function mapGrade_(r) { return { id: studentId_(lower_(r.Email)), student: str_(r.Student), criterion: str_(r.Criterion), score: num_(r.Score), comment: str_(r.Comment) }; }

function studentData_(cfg, section, ref) {
  var r = rosterEntry_(cfg, section, ref) || { sport: '', student: '', email: '', id: '' };
  var classRegister = rowsFor_('Register', section);
  var lessonsRun = {};
  classRegister.forEach(function(x) { if (num_(x.Participation) && str_(x.Sport) === r.sport) lessonsRun[num_(x.Lesson)] = true; });
  return {
    section: section, sport: r.sport, student: r.student, id: r.id,
    lessonsRun: Object.keys(lessonsRun).length,
    register: classRegister.filter(function(x) { return lower_(x.Email) === r.email; }).map(mapRegister_),
    tests: rowsFor_('SkillTests', section, r.email).map(mapTest_),
    checkins: rowsFor_('Checkins', section, r.email).map(mapCheckin_),
    outcomes: rowsFor_('OutcomeRatings', section, r.email).map(mapOutcome_),
    grades: rowsFor_('Grades', section, r.email).map(mapGrade_)
  };
}
function getStudent(section, ref) {
  var cfg = getConfig_();
  var who = resolveStudent_(cfg, section, ref);
  return studentData_(cfg, who.section, who.id);
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
  var who = resolveStudent_(cfg, payload.section, payload.id || payload.student);
  var cp = str_(payload.checkpoint);
  if (!cfg.checkpoints.some(function(c) { return c.name === cp; })) throw new Error('Unknown checkpoint: ' + cp);
  var skills = (cfg.skills[who.sport] || []).map(function(s) { return s.skill; });
  var focus = str_(payload.focusSkill);
  if (focus && skills.indexOf(focus) === -1) focus = '';
  var self = {};
  Object.keys(payload.selfStages || {}).forEach(function(k) { if (skills.indexOf(k) !== -1) { var n = clampInt_(payload.selfStages[k], 1, 3); if (n) self[k] = n; } });
  var row = { Section: who.section, Sport: who.sport, Student: who.student, Email: who.email, Checkpoint: cp,
    FocusSkill: focus, Goal: str_(payload.goal).slice(0, 400), DrillStep: blankOr_(payload.drillStep, 0, 20),
    ExtensionSkill: str_(payload.extensionSkill).slice(0, 80), ExtensionDrill: str_(payload.extensionDrill).slice(0, 300),
    SelfStages: JSON.stringify(self),
    WentWell: str_(payload.wentWell).slice(0, 600), NextGoal: str_(payload.nextGoal).slice(0, 600) };
  // Scores the student typed from their paper log. Never overwrite a score
  // the teacher entered or corrected.
  var scores = payload.scores || {};
  // Which scores the teacher owns is decided INSIDE the lock, so a teacher
  // correction that lands while this request queues is never overwritten.
  var buildTestRows = function() {
    var testRows = [];
    if (!Object.keys(scores).length) return testRows;
    var teacherSet = {};
    rowsFor_('SkillTests', who.section, who.email).forEach(function(t) { if (str_(t.Checkpoint) === cp && str_(t.By) === 'teacher' && str_(t.Score) !== '') teacherSet[str_(t.Skill)] = true; });
    Object.keys(scores).forEach(function(k) {
      if (skills.indexOf(k) === -1 || teacherSet[k]) return;
      var v = scores[k];
      if (v === '' || v === null || v === undefined) return;
      testRows.push({ Section: who.section, Sport: who.sport, Student: who.student, Email: who.email, Checkpoint: cp, Skill: k, Score: blankOr_(v, 0, cfg.scoreMax), By: 'student' });
    });
    return testRows;
  };
  // A student re-saving their check-in un-confirms it so the teacher looks again.
  if (!who.byTeacher) row.Confirmed = '';
  var outcomeRows = [];
  Object.keys(payload.selfOutcomes || {}).forEach(function(k) {
    if (!cfg.outcomes.some(function(o) { return o.outcome === k; })) return;
    var n = clampInt_(payload.selfOutcomes[k], 1, 3); if (!n) return;
    outcomeRows.push({ Section: who.section, Sport: who.sport, Student: who.student, Email: who.email, Checkpoint: cp, Outcome: k, Self: n });
  });
  return withLock_(function() {
    var testRows = buildTestRows();
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
    var r = rosterEntry_(cfg, section, e.id || e.student); if (!r) return;
    var c = base_(r, { Checkpoint: cp });
    var any = false;
    if ('confirmed' in e) { c.Confirmed = e.confirmed ? 'yes' : ''; any = true; }
    if ('engagement' in e) { c.Engagement = blankOr_(e.engagement, 1, 3); any = true; }
    if ('personal' in e) { c.Personal = blankOr_(e.personal, 1, 3); any = true; }
    if ('gamePlay' in e) { c.GamePlay = blankOr_(e.gamePlay, 1, 4); any = true; }
    if ('gameNote' in e) { c.GameNote = str_(e.gameNote).slice(0, 200); any = true; }
    if (any) checkRows.push(c);
    Object.keys(e.scores || {}).forEach(function(k) {
      var sc = blankOr_(e.scores[k], 0, cfg.scoreMax);
      testRows.push(base_(r, { Checkpoint: cp, Skill: k, Score: sc, By: sc === '' ? '' : 'teacher' }));
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
    var r = rosterEntry_(cfg, section, e.id || e.student);
    return r ? base_(r, { Checkpoint: cp, Outcome: str_(e.outcome), Teacher: blankOr_(e.teacher, 1, 3) }) : null;
  }).filter(function(r) { return r && r.Outcome; });
  return withLock_(function() { return { ok: true, saved: upsert_('OutcomeRatings', rows) }; });
}

// The identifying columns of a data row, from the roster entry.
function base_(r, rest) { var o = { Section: r.section, Sport: r.sport, Student: r.student, Email: r.email }; Object.keys(rest).forEach(function(k) { o[k] = rest[k]; }); return o; }

// entries: [{student, participation, note}]
function saveRegister(payload) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var section = str_(payload.section), lesson = num_(payload.lesson);
  if (!section || lesson === null) throw new Error('Missing section or lesson');
  var rows = (payload.entries || []).map(function(e) {
    var who = rosterEntry_(cfg, section, e.id || e.student); if (!who) return null;
    var r = base_(who, { Lesson: lesson });
    if ('participation' in e) r.Participation = blankOr_(e.participation, 1, 3);
    if ('note' in e) r.Note = str_(e.note).slice(0, 200);
    return r;
  }).filter(Boolean);
  return withLock_(function() { return { ok: true, saved: upsert_('Register', rows) }; });
}
// entries: [{student, skill, score}]
function saveSkillTests(payload) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var section = str_(payload.section), cp = str_(payload.checkpoint);
  var rows = (payload.entries || []).map(function(e) {
    var r = rosterEntry_(cfg, section, e.id || e.student);
    return r ? base_(r, { Checkpoint: cp, Skill: str_(e.skill), Score: blankOr_(e.score, 0, cfg.scoreMax) }) : null;
  }).filter(function(r) { return r && r.Skill; });
  return withLock_(function() { return { ok: true, saved: upsert_('SkillTests', rows) }; });
}
// entries: [{student, criterion, score, comment}]
function saveGrades(payload) {
  var cfg = getConfig_();
  requireTeacher_(cfg);
  var section = str_(payload.section);
  var rows = (payload.entries || []).map(function(e) {
    var who = rosterEntry_(cfg, section, e.id || e.student); if (!who) return null;
    var r = base_(who, { Criterion: str_(e.criterion) });
    if ('score' in e) r.Score = blankOr_(e.score, 1, 7);
    if ('comment' in e) r.Comment = str_(e.comment).slice(0, 500);
    return r;
  }).filter(function(r) { return r && r.Criterion; });
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
  var sportById = {}; cfg.roster.forEach(function(r) { sportById[r.id] = r.sport; });
  data.register.forEach(function(r) { if (r.participation) { var sp = sportById[r.id] || ''; (lessonsRunBySport[sp] = lessonsRunBySport[sp] || {})[r.lesson] = true; } });

  return roster.map(function(r) {
    var name = r.student, sid = r.id, sp = r.sport;
    var skills = (cfg.skills[sp] || []);
    var nLessons = Object.keys(lessonsRunBySport[sp] || {}).length || cfg.lessons.length || 1;
    var reg = data.register.filter(function(x) { return x.id === sid && x.participation; });
    var partAvg = reg.length ? reg.reduce(function(a, x) { return a + x.participation; }, 0) / reg.length : null;
    var tests = data.tests.filter(function(x) { return x.id === sid; });
    var score = function(cp, sk) { var t = tests.filter(function(x) { return x.checkpoint === cp && x.skill === sk && x.score !== null; })[0]; return t ? t.score : null; };
    var checkins = data.checkins.filter(function(x) { return x.id === sid; });
    var byCp = {}; checkins.forEach(function(c) { byCp[c.checkpoint] = c; });
    var ordered = cps.map(function(c) { return byCp[c.name]; }).filter(Boolean);
    var latest = ordered[ordered.length - 1] || null;
    var focus = ''; ordered.forEach(function(c) { if (c.focusSkill) focus = c.focusSkill; });
    var goal = ''; ordered.forEach(function(c) { if (c.goal) goal = c.goal; });
    var drillStep = null; ordered.forEach(function(c) { if (c.drillStep !== null) drillStep = c.drillStep; });
    var extension = ''; ordered.forEach(function(c) { if (c.extensionSkill) extension = c.extensionSkill; });
    var gamePlay = null, gameNote = ''; ordered.forEach(function(c) { if (c.gamePlay) { gamePlay = c.gamePlay; gameNote = c.gameNote || ''; } });
    var byCheckpoint = cps.map(function(c) { var x = byCp[c.name]; return { checkpoint: c.name, done: !!(x && (x.focusSkill || x.wentWell || x.nextGoal || x.drillStep !== null)), confirmed: !!(x && x.confirmed), personal: x ? x.personal : null, wentWell: x ? x.wentWell : '', nextGoal: x ? x.nextGoal : '', drillStep: x ? x.drillStep : null }; });
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
    var oRows = data.outcomes.filter(function(x) { return x.id === sid; });
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
        // One teacher rating per check-in (personal skills); the old engagement field still counts if present.
        var pr = persAvg !== null ? persAvg : engAvg, prN = persAvg !== null ? pers.length : eng.length;
        if (cfg.dailyRegister && partAvg !== null) s = band(clamp01((partAvg - 1) / 2) * 0.7 + clamp01(reg.length / nLessons) * 0.3);
        else if (pr !== null) s = band(clamp01((pr - 1) / 2) * 0.8 + clamp01(prN / nCp) * 0.2);
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
    data.grades.filter(function(g) { return g.id === sid; }).forEach(function(g) { final[g.criterion] = { score: g.score, comment: g.comment }; });

    return {
      student: name, id: sid, sport: sp,
      lessonsAttended: reg.length, lessonsRun: nLessons, participationAvg: partAvg,
      checkins: nCheckins, reflections: nReflected, selfAccuracy: selfAcc, confirmed: nConfirmed, engagementAvg: engAvg, personalAvg: persAvg,
      focus: focus, goal: goal, drillStep: drillStep, maxSteps: maxSteps, chosenAtUnderstanding: chosenAtUnderstanding, extension: extension, gamePlay: gamePlay, gameNote: gameNote, byCheckpoint: byCheckpoint,
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
    .addItem('1b. Replace unit tabs with the draft (Skills, Drills, Lessons…)', 'resetUnitTabs')
    .addItem('2. Check roster & config', 'checkConfig')
    .addItem('3. Show app link', 'showAppLink')
    .addSeparator()
    .addItem('Build grade report tab', 'buildGradeReport')
    .addItem('Refresh app config now', 'clearConfigCache')
    .addSeparator()
    .addItem('End of unit: clear all student data…', 'clearStudentData')
    .addToUi();
}
function onEdit(e) {
  try { var name = e && e.range && e.range.getSheet().getName(); if (name && CONFIG_TABS[name]) clearConfigCache(); } catch (err) {}
}

var UNIT_TABS = ['Lessons', 'Skills', 'Drills', 'Outcomes', 'Criteria', 'BackPage'];
// Seed a unit tab from the draft by header NAME, not position (a tab kept from
// an older version may have extra or re-ordered columns). With replace=true
// the tab's rows are cleared first; otherwise only an empty tab is seeded.
function seedUnitTab_(n, replace) {
  var t = tab_(n);
  if (!EXAMPLE[n]) return;
  if (t.getLastRow() >= 2) {
    if (!replace) return;
    t.getRange(2, 1, t.getLastRow() - 1, Math.max(1, t.getLastColumn())).clearContent();
  }
  var hdrs = t.getRange(1, 1, 1, Math.max(1, t.getLastColumn())).getValues()[0].map(String);
  var names = CONFIG_TABS[n];
  var rows = EXAMPLE[n].map(function(r) {
    var line = hdrs.map(function() { return ''; });
    names.forEach(function(h, i) { var c = hdrs.indexOf(h); if (c !== -1) line[c] = r[i]; });
    return line;
  });
  if (rows.length) t.getRange(2, 1, rows.length, hdrs.length).setValues(rows);
}
// Menu: replace the unit tabs (Lessons, Skills, Drills, Outcomes, Criteria) with
// the current draft. Roster, Teachers, Config and every data tab are untouched.
function resetUnitTabs() {
  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  if (ui) {
    var ans = ui.alert('Replace unit tabs with the draft?',
      'This overwrites the rows on: ' + UNIT_TABS.join(', ') + '.\n\nRoster, Teachers, Config and all student data are kept. Any tests or drills you have edited by hand on those five tabs will be replaced.',
      ui.ButtonSet.OK_CANCEL);
    if (ans !== ui.Button.OK) return;
  }
  UNIT_TABS.forEach(function(n) { ensureTab_(n, CONFIG_TABS[n]); seedUnitTab_(n, true); });
  clearConfigCache();
  if (ui) ui.alert('Done. ' + UNIT_TABS.join(', ') + ' now hold the draft. Reload the app to see it.');
}
// Menu: clear every data tab (Register, SkillTests, Checkins, OutcomeRatings,
// Grades) at the end of a unit. Config, Roster and Teachers stay. Make a copy
// of the Sheet first if the records must be kept.
function clearStudentData() {
  var ui = null; try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  if (ui) {
    var a1 = ui.alert('Clear all student data?', 'This empties: ' + Object.keys(DATA_TABS).join(', ') + '.\n\nScores, check-ins, reflections, ratings and grades are deleted. Roster, Teachers and the unit tabs stay.\n\nIf the records must be kept, cancel and File → Make a copy first.', ui.ButtonSet.OK_CANCEL);
    if (a1 !== ui.Button.OK) return;
    var a2 = ui.alert('Last check', 'Delete every student record in this Sheet now?', ui.ButtonSet.YES_NO);
    if (a2 !== ui.Button.YES) return;
  }
  Object.keys(DATA_TABS).forEach(function(n) { var t = tab_(n); if (t && t.getLastRow() >= 2) t.getRange(2, 1, t.getLastRow() - 1, Math.max(1, t.getLastColumn())).clearContent(); });
  var gr = tab_('GradeReport'); if (gr) ss_().deleteSheet(gr);
  if (ui) ui.alert('Student data cleared.');
}
// Rows saved before records were filed by email: fill Email from the Roster
// where the section + name matches exactly one student. Returns the count filled.
function fillEmails_(cfg) {
  var byName = {};
  cfg.roster.forEach(function(r) { var k = r.section + '|' + r.student.toLowerCase(); (byName[k] = byName[k] || []).push(r.email); });
  var filled = 0;
  Object.keys(DATA_TABS).forEach(function(n) {
    var t = tab_(n); if (!t || t.getLastRow() < 2) return;
    var data = t.getDataRange().getValues();
    var hdr = data[0].map(function(h) { return String(h).trim(); });
    var cS = hdr.indexOf('Section'), cN = hdr.indexOf('Student'), cE = hdr.indexOf('Email');
    if (cS < 0 || cN < 0 || cE < 0) return;
    for (var i = 1; i < data.length; i++) {
      if (str_(data[i][cE]) || !str_(data[i][cN])) continue;
      var hit = byName[str_(data[i][cS]) + '|' + str_(data[i][cN]).toLowerCase()] || [];
      if (hit.length === 1) { t.getRange(i + 1, cE + 1).setValue(hit[0]); filled++; }
    }
  });
  return filled;
}
function unmatchedDataRows_(cfg) {
  var byName = {};
  cfg.roster.forEach(function(r) { var k = r.section + '|' + r.student.toLowerCase(); (byName[k] = byName[k] || []).push(r.email); });
  var n = 0;
  Object.keys(DATA_TABS).forEach(function(tab) {
    readTab_(tab).forEach(function(r) { if (!str_(r.Email) && str_(r.Student) && (byName[str_(r.Section) + '|' + str_(r.Student).toLowerCase()] || []).length !== 1) n++; });
  });
  return n;
}
function setupTabs() {
  var book = ss_();
  Object.keys(CONFIG_TABS).forEach(function(n) { ensureTab_(n, CONFIG_TABS[n]); });
  Object.keys(DATA_TABS).forEach(function(n) { ensureTab_(n, DATA_TABS[n]); });

  // Config: add any key this version needs that the tab does not have yet
  // (a tab kept from an older version keeps its values; extra keys are ignored).
  var cfgTab = tab_('Config');
  var have = {};
  readTab_('Config').forEach(function(r) { if (str_(r.Key)) have[str_(r.Key)] = true; });
  var rows = Object.keys(CONFIG_DEFAULTS).filter(function(k) { return !have[k]; }).map(function(k) { return [k, CONFIG_DEFAULTS[k][0], CONFIG_DEFAULTS[k][1]]; });
  if (rows.length) cfgTab.getRange(cfgTab.getLastRow() + 1, 1, rows.length, 3).setValues(rows);
  // Seed by header NAME, not position — a tab kept from an older version may
  // have extra or re-ordered columns.
  UNIT_TABS.forEach(function(n) { seedUnitTab_(n, false); });
  var teachers = tab_('Teachers');
  if (teachers.getLastRow() < 2) teachers.getRange(2, 1, 1, 4).setValues([[Session.getEffectiveUser().getEmail(), 'Sheet owner (automatic)', '', '']]);
  var roster = tab_('Roster');
  if (roster.getLastRow() < 2) roster.getRange(2, 1, 2, 4).setValues([['Section A', 'Net Games', 'Example Student', 'example@school.edu'], ['Section A', 'Handball', 'Another Student', 'another@school.edu']]);

  // Date format on the Updated column, found by header NAME: a tab kept from
  // an older version can have it in a different position, and a score column
  // sitting where Updated used to be would otherwise show as a 1900 date.
  Object.keys(DATA_TABS).forEach(function(n) {
    var t = tab_(n), lastCol = Math.max(1, t.getLastColumn()), rowsN = Math.max(1, t.getMaxRows() - 1);
    var hdrs = t.getRange(1, 1, 1, lastCol).getValues()[0].map(function(h) { return String(h).trim(); });
    hdrs.forEach(function(h, i) {
      if (!h) return;
      t.getRange(2, i + 1, rowsN, 1).setNumberFormat(h === 'Updated' ? 'yyyy-mm-dd hh:mm' : 'General');
    });
  });
  fillEmails_(buildConfig_());
  // Tabs from the first version of the tracker that nothing reads any more:
  // removed only while they hold no data rows.
  OBSOLETE_TABS.forEach(function(n) { var t = tab_(n); if (t && t.getLastRow() < 2 && book.getSheets().length > 1) book.deleteSheet(t); });
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
// The school's Google Workspace domain (from the Sheet owner's address).
function schoolDomain_() { return lower_(Session.getEffectiveUser().getEmail()).split('@')[1] || ''; }
// A link that always asks "which account?" and offers only school accounts, then
// opens the app. It sidesteps the "Sorry, unable to open the file" error that a
// browser with a personal Gmail signed in alongside the school account produces.
function chooserUrl_(target) {
  var d = schoolDomain_();
  return 'https://accounts.google.com/AccountChooser?' + (d ? 'hd=' + encodeURIComponent(d) + '&' : '') + 'continue=' + encodeURIComponent(target);
}
function showAppLink() {
  var url = appUrl_();
  var ui = SpreadsheetApp.getUi();
  if (!url) { ui.alert('Not deployed yet.\n\nExtensions → Apps Script → Deploy → New deployment → Web app.'); return; }
  var safe = chooserUrl_(url);
  var html = HtmlService.createHtmlOutput(
    '<div style="font:14px system-ui;padding:8px">' +
    '<p><b>Link to share</b> — asks for the school account first, so laptops with a personal Gmail signed in still get in:</p>' +
    '<input style="width:100%;font-size:13px" value="' + safe + '" onclick="this.select()">' +
    '<p style="margin-top:14px"><b>Direct link</b> (works when the school account is the only one signed in):</p>' +
    '<input style="width:100%;font-size:13px" value="' + url + '" onclick="this.select()">' +
    '<p style="margin-top:14px">Teachers use the same link; they are recognised by their login.</p>' +
    '<p><a target="_blank" href="' + safe + '">Open the app</a></p></div>').setWidth(560).setHeight(290);
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
  var emails = {};
  cfg.roster.forEach(function(r) {
    if (!r.sport) problems.push('No sport for ' + r.student + ' (' + r.section + ').');
    else if (!cfg.skills[r.sport]) problems.push(r.student + ' is in sport "' + r.sport + '" which is not on the Skills tab.');
    if (!r.email) problems.push('No email for ' + r.student + ' (' + r.section + ') — they cannot sign in.');
    else (emails[r.email] = emails[r.email] || []).push(r);
  });
  Object.keys(emails).forEach(function(e) {
    if (emails[e].length > 1) problems.push(e + ' is on the Roster ' + emails[e].length + ' times (' + emails[e].map(function(r) { return r.student + ', ' + r.section; }).join(' / ') + ') — delete the extra row(s).');
  });
  var names = {};
  cfg.roster.forEach(function(r) { if (r.email) { var k = r.section + '|' + r.student.toLowerCase(); names[k] = names[k] || { shown: r.student, section: r.section, emails: {} }; names[k].emails[r.email] = true; } });
  Object.keys(names).forEach(function(k) {
    var g = names[k], n = Object.keys(g.emails).length;
    if (n > 1) problems.push('Note: ' + n + ' different students called "' + g.shown + '" in section ' + g.section + '. Their records stay separate (filed by email) but they look the same in the app — add the class or an initial to one name on the Roster if you want to tell them apart.');
  });
  var orphans = unmatchedDataRows_(cfg);
  if (orphans) problems.push(orphans + ' saved record(s) have no Email and no single matching Roster name, so nobody can see them. Run "1. Set up tabs" after fixing the Roster; rows that still do not match can be deleted from the data tabs.');
  cfg.teachers.forEach(function(t) { if (t.role === 'coach' && !t.sport) problems.push('Coach ' + t.email + ' has no Sport on the Teachers tab.'); if (t.sport && !cfg.skills[t.sport]) problems.push('Teacher ' + t.email + ' has sport "' + t.sport + '" which is not on the Skills tab.'); });
  if (!cfg.oauthClientId) problems.push('oauth_client_id on Config is blank — the GitHub Pages front end cannot sign anyone in until it is filled (see the guide, Part A2).');
  else if (!/\.apps\.googleusercontent\.com$/.test(cfg.oauthClientId)) problems.push('oauth_client_id on Config does not look like a Google OAuth client ID (…apps.googleusercontent.com).');
  var cfgKeys = {}; readTab_('Config').forEach(function(r) { if (str_(r.Key)) cfgKeys[str_(r.Key)] = true; });
  var missingKeys = Object.keys(CONFIG_DEFAULTS).filter(function(k) { return !cfgKeys[k]; });
  if (missingKeys.length) problems.push('Config tab is missing ' + missingKeys.length + ' key(s) from this version (' + missingKeys.slice(0, 3).join(', ') + (missingKeys.length > 3 ? '…' : '') + ') — run "1. Set up tabs" to add them; defaults are used until then.');
  OBSOLETE_TABS.forEach(function(n) { var t = tab_(n); if (t && t.getLastRow() >= 2) problems.push('Tab "' + n + '" is from the first version and is not read any more — delete it once you no longer need its rows.'); });
  if (!cfg.criteria.length) problems.push('Criteria tab is empty.');
  cfg.criteria.forEach(function(c) { if (c.evidence === 'none') problems.push('Criterion ' + c.code + ' has no Evidence type (test / reflection / participation / skills / outcomes).'); });
  var signin = '';
  if (cfg.oauthClientId) {
    // Running this from the menu is also what grants the script permission to
    // contact Google, so the GitHub Pages sign-in check works for students.
    try { var probe = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=probe', { muteHttpExceptions: true }); signin = ' Sign-in check can reach Google (HTTP ' + probe.getResponseCode() + ').'; }
    catch (e) { problems.push('The script is not allowed to contact Google to verify sign-ins, so the GitHub Pages front end refuses everyone. Approve the permission prompt when it appears and run this again. (' + String(e && e.message || e) + ')'); }
  }
  var msg = problems.length ? problems.join('\n') + signin : 'Looks good: ' + cfg.sections.length + ' sections, ' + cfg.roster.length + ' students, ' + cfg.sports.length + ' sports, ' + cfg.checkpoints.length + ' checkpoints.' + signin;
  Logger.log(problems.length ? problems.length + ' problem(s) found — see the dialog' : 'Config looks good');  // names and emails stay out of the script log
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
