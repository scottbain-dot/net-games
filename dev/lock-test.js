// Scores can be edited by the student until the teacher ticks the check-in;
// after that the student's scores are ignored while reflection, goal and focus
// still save, and the tick stays. Runs the real Code.gs against dev/fake-sheets.js.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'fake-sheets.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
vm.runInContext(`
  FakeSheets.user = FakeSheets.owner; setupTabs();
  const roster = FakeSheets.book.getSheetByName('Roster'); roster.getRange(2, 1, roster.getLastRow() - 1, 4).clearContent();
  roster.getRange(2, 1, 1, 4).setValues([['7', 'Net Games', 'Kid One', 'kid@example.edu']]); clearConfigCache();
  const base = { checkpoint: 'Early', focusSkill: 'Badminton · Serve', goal: 'g1', drillStep: 0, selfStages: {}, selfOutcomes: {}, nextGoal: '' };
  FakeSheets.user = 'kid@example.edu';
  saveCheckin(Object.assign({}, base, { scores: { 'Badminton · Serve': 3, 'Badminton · Rally': 4 }, wentWell: 'first try' }));
  let r = saveCheckin(Object.assign({}, base, { scores: { 'Badminton · Serve': 5 }, wentWell: 'edited before tick' }));
  let me = bootstrap().student;
  if (me.tests.find(t => t.skill === 'Badminton · Serve').score !== 5 || r.lockedScores) throw new Error('student could not edit a score before the tick');
  // teacher ticks
  FakeSheets.user = FakeSheets.owner;
  saveTeacherCheckin({ section: '7', checkpoint: 'Early', entries: [{ id: me.id, confirmed: true }] });
  // student edits again: reflection changes, scores do not, tick stays
  FakeSheets.user = 'kid@example.edu';
  r = saveCheckin(Object.assign({}, base, { scores: { 'Badminton · Serve': 9, 'Badminton · Rally': 9 }, wentWell: 'edited after tick', goal: 'g2' }));
  me = bootstrap().student;
  const c = me.checkins.find(x => x.checkpoint === 'Early');
  if (!r.lockedScores) throw new Error('save did not report locked scores');
  if (me.tests.find(t => t.skill === 'Badminton · Serve').score !== 5 || me.tests.find(t => t.skill === 'Badminton · Rally').score !== 4) throw new Error('scores changed after the tick: ' + JSON.stringify(me.tests));
  if (c.wentWell !== 'edited after tick' || c.goal !== 'g2') throw new Error('reflection/goal not editable after the tick');
  if (!c.confirmed) throw new Error('student edit removed the teacher tick');
  if (!/\\d\\d:\\d\\d$/.test(c.updated)) throw new Error('updated has no time: ' + c.updated);
  // teacher can still change a score after the tick
  FakeSheets.user = FakeSheets.owner;
  saveTeacherCheckin({ section: '7', checkpoint: 'Early', entries: [{ id: me.id, scores: { 'Badminton · Serve': 7 } }] });
  FakeSheets.user = 'kid@example.edu';
  if (bootstrap().student.tests.find(t => t.skill === 'Badminton · Serve').score !== 7) throw new Error('teacher score after tick not saved');
  const cfg = buildConfig_(); if (!/I will focus on/.test(cfg.starterEarly) || cfg.starters.length !== 2) throw new Error('starters missing: ' + JSON.stringify([cfg.starterEarly, cfg.starters]));
  console.log('LOCK OK');
`, ctx);
