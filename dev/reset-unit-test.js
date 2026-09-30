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

  // ---- A shared Sheet: 1c replaces ONE sport, 1b and 1c both move saved
  // records to renamed skills, and neither leaves a gap a loading student
  // could see (every write is one setValues covering the old rows).
  FakeSheets.reset(); FakeSheets.user = FakeSheets.owner; TAB_MEMO_ = {};   // a fresh book; the per-execution memo would still point at the old one
  setupTabs();
  const col = (t, h) => t.getDataRange().getValues()[0].indexOf(h);
  const sk2 = FakeSheets.book.getSheetByName('Skills'), dr2 = FakeSheets.book.getSheetByName('Drills'), bp2 = FakeSheets.book.getSheetByName('BackPage');
  const rowsOf = (t, sport) => t.getDataRange().getValues().slice(1).filter(r => r[0] === sport);
  const noGaps = t => { const v = t.getDataRange().getValues().slice(1); if (v.some(r => r.every(x => x === ''))) throw new Error(t.getName() + ' has a blank row inside the data'); };
  // Pretend the tab still holds last week's Net Games (one game, old names, no strand)
  const oldNG = [['Net Games', 'Serve accuracy', 't', 's', '', ''], ['Net Games', 'Rally control', 't', 's', '', ''], ['Net Games', 'Attacking shot', 't', 's', '', '']];
  const keepRows = sk2.getDataRange().getValues().slice(1).filter(r => r[0] !== 'Net Games');
  sk2.getRange(2, 1, sk2.getLastRow() - 1, sk2.getLastColumn()).clearContent();
  sk2.getRange(2, 1, keepRows.length + 3, 6).setValues(keepRows.concat(oldNG));
  clearConfigCache();
  // A colleague's hand-written Table Tennis drill, and a Net Games student's records under the old names
  const ttRow = dr2.getDataRange().getValues().findIndex(r => r[0] === 'Table Tennis') + 1;
  dr2.getRange(ttRow, 4, 1, 1).setValues([['hand-written by Mr Manntz']]);
  FakeSheets.book.getSheetByName('Roster').getRange(2, 1, 1, 4).setValues([['8', 'Net Games', 'Clara', 'clara@example.edu']]);
  clearConfigCache();
  FakeSheets.user = 'clara@example.edu';
  const saved = saveCheckin({ checkpoint: 'Early', scores: { 'Serve accuracy': 5, 'Rally control': 4 }, focusSkill: 'Rally control', goal: 'g', drillStep: 0, selfStages: {}, selfOutcomes: {}, wentWell: 'w', nextGoal: '' });
  FakeSheets.user = FakeSheets.owner;
  const st = FakeSheets.book.getSheetByName('SkillTests'), ck = FakeSheets.book.getSheetByName('Checkins');
  if (!st.getDataRange().getValues().some(r => r[col(st, 'Skill')] === 'Serve accuracy')) throw new Error('old-name score not written: ' + JSON.stringify(saved));
  const before = { drillsTT: rowsOf(dr2, 'Table Tennis').length, drillsAll: dr2.getLastRow() - 1 };
  FakeSheets.ui._promptText = 'Net Games';
  resetSportTabs();                                  // via the menu prompt
  const ng = rowsOf(sk2, 'Net Games');
  console.log('1c: Net Games skills', ng.length, 'strands', [...new Set(ng.map(r => r[5]))].join('/'), '| NG drills', rowsOf(dr2, 'Net Games').length, '| TT drills', rowsOf(dr2, 'Table Tennis').length, '| back page lines', rowsOf(bp2, 'Net Games').length);
  if (ng.length !== 6 || ng.filter(r => r[5] === 'Badminton').length !== 3) throw new Error('Net Games not replaced by the two-game draft');
  if (rowsOf(dr2, 'Net Games').length !== 24) throw new Error('Net Games drills not replaced');
  if (rowsOf(dr2, 'Table Tennis').length !== before.drillsTT || !dr2.getDataRange().getValues().some(r => r[3] === 'hand-written by Mr Manntz')) throw new Error('Table Tennis rows of a colleague were touched');
  if (rowsOf(sk2, 'Ultimate').length !== 3 || rowsOf(sk2, 'Handball').length !== 3) throw new Error('skills of other sports changed');
  [sk2, dr2, bp2].forEach(noGaps);
  const scoreNames = st.getDataRange().getValues().slice(1).map(r => r[col(st, 'Skill')]).sort().join(',');
  const focus = ck.getDataRange().getValues().slice(1)[0][col(ck, 'FocusSkill')];
  console.log('1c relabel: scores', scoreNames, '| focus', focus);
  if (scoreNames !== 'Badminton · Rally,Badminton · Serve' || focus !== 'Badminton · Rally') throw new Error('1c did not move saved records to the renamed skills');
  // Unknown sport: nothing changes
  const snap = JSON.stringify(dr2.getDataRange().getValues());
  FakeSheets.ui._promptText = 'Netball'; resetSportTabs();
  if (JSON.stringify(dr2.getDataRange().getValues()) !== snap) throw new Error('unknown sport changed the Drills tab');
  // 1b after old names: relabel runs there too, and a Drills tab that was LONGER than the draft is padded, not left with stragglers
  sk2.getRange(2, 1, sk2.getLastRow() - 1, sk2.getLastColumn()).clearContent();
  sk2.getRange(2, 1, keepRows.length + 3, 6).setValues(keepRows.concat(oldNG));
  st.getRange(2, col(st, 'Skill') + 1, 1, 1).setValues([['Serve accuracy']]);
  dr2.getRange(dr2.getLastRow() + 1, 1, 2, 5).setValues([['X', 'Y', 1, 'extra 1', ''], ['X', 'Y', 2, 'extra 2', '']]);
  clearConfigCache();
  resetUnitTabs();
  if (st.getDataRange().getValues()[1][col(st, 'Skill')] !== 'Badminton · Serve') throw new Error('1b did not relabel');
  if (dr2.getDataRange().getValues().some(r => r[0] === 'X')) throw new Error('rows beyond the draft survived 1b');
  [sk2, dr2, bp2].forEach(noGaps);
  console.log('ONE-SPORT RESET + RELABEL OK');
`, ctx);
