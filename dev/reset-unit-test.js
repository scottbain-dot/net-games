// Checks that PE Tracker → 1b (resetUnitTabs) replaces the unit tabs with the
// draft and leaves Roster alone. Runs the real Code.gs against dev/fake-sheets.js.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'fake-sheets.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
vm.runInContext(`
  FakeSheets.user = FakeSheets.owner;
  setupTabs();
  const sk = FakeSheets.book.getSheetByName('Skills');
  sk.getRange(2, 2, 1, 1).setValues([['OLD NAME']]);
  const dr = FakeSheets.book.getSheetByName('Drills');
  dr.getRange(2, 1, dr.getLastRow() - 1, dr.getLastColumn()).clearContent();
  dr.getRange(2, 1, 1, 5).setValues([['X', 'Y', 1, 'hand-written', 'z']]);
  const roster = FakeSheets.book.getSheetByName('Roster');
  roster.getRange(2, 1, 1, 4).setValues([['Section A', 'Table Tennis', 'Keep Me', 'keep@example.edu']]);
  resetUnitTabs();
  const skills = sk.getDataRange().getValues().slice(1).filter(r => r[0]);
  const drills = dr.getDataRange().getValues().slice(1).filter(r => r[0]);
  const tt = skills.filter(r => r[0] === 'Table Tennis').map(r => r[1]);
  console.log('skills rows', skills.length, 'drills rows', drills.length, 'TT', tt.join(' | '));
  console.log('roster kept:', roster.getDataRange().getValues()[1][2]);
  if (skills.some(r => r[1] === 'OLD NAME') || drills.some(r => r[3] === 'hand-written')) throw new Error('old rows survived');
  if (tt.join() !== 'Short serve,Forehand topspin,Third-ball attack') throw new Error('TT not reseeded');
  console.log('RESET OK');
  // end-of-unit clear: data tabs emptied, roster and unit tabs kept
  FakeSheets.user = roster.getDataRange().getValues()[1][3];
  saveCheckin({ checkpoint: 'Early', scores: {}, focusSkill: '', goal: '', drillStep: 0, selfStages: {}, selfOutcomes: {}, wentWell: 'to be cleared', nextGoal: '' });
  FakeSheets.user = FakeSheets.owner;
  if (FakeSheets.book.getSheetByName('Checkins').getLastRow() < 2) throw new Error('test check-in was not written');
  clearStudentData();
  ['Register', 'SkillTests', 'Checkins', 'OutcomeRatings', 'Grades'].forEach(n => { if (FakeSheets.book.getSheetByName(n).getDataRange().getValues().slice(1).some(r => r.some(v => v !== ''))) throw new Error(n + ' not cleared'); });
  if (roster.getDataRange().getValues()[1][2] !== 'Keep Me') throw new Error('roster lost');
  if (sk.getDataRange().getValues().length < 4) throw new Error('unit tabs lost');
  // student bootstrap: own roster row only
  FakeSheets.user = 'keep@example.edu';
  const b = bootstrap();
  if (b.identity.role !== 'student' || b.config.roster.length !== 1 || b.config.roster[0].student !== 'Keep Me') throw new Error('student received more than their own roster row: ' + JSON.stringify(b.config.roster));
  if (JSON.stringify(b).indexOf('@') !== -1 && JSON.stringify(b.config).indexOf('@') !== -1) throw new Error('email address in student config');
  console.log('CLEAR + MINIMISATION OK');
`, ctx);
