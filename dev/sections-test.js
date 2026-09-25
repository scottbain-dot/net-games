// Sections typed as numbers (7, 8) on the Roster must work end to end, and
// duplicate names inside a section must be flagged. Runs Code.gs on fake Sheets.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'fake-sheets.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
vm.runInContext(`
  FakeSheets.user = FakeSheets.owner;
  setupTabs();
  const roster = FakeSheets.book.getSheetByName('Roster');
  roster.getRange(2, 1, 6, 4).setValues([
    [7, 'Net Games', 'Ann Lee', 'ann@example.edu'],      // numeric section, three classes' worth of kids share it
    [7, 'Handball', 'Ben Ito', 'ben@example.edu'],
    [7, 'Ultimate', 'Cara Ng', 'cara@example.edu'],
    [8, 'Net Games', 'Dev Rao', 'dev@example.edu'],
    [8, 'Table Tennis', 'Eli Kim', 'eli@example.edu'],
    [8, 'Handball', 'Ann Lee', 'ann2@example.edu'],      // same name as a section-7 student: allowed, different section
  ]);
  clearConfigCache();
  const cfg = buildConfig_();
  if (JSON.stringify(cfg.sections) !== '["7","8"]') throw new Error('sections read as ' + JSON.stringify(cfg.sections));
  // student in section 7 saves a check-in
  FakeSheets.user = 'ann@example.edu';
  const b = bootstrap();
  if (b.identity.section !== '7' || b.config.sections[0] !== '7') throw new Error('student section ' + JSON.stringify(b.identity));
  saveCheckin({ checkpoint: 'Early', scores: { 'Serve accuracy': 4 }, focusSkill: 'Serve accuracy', goal: 'g', drillStep: 0, selfStages: {}, selfOutcomes: {}, wentWell: 'section seven', nextGoal: '' });
  // the section-8 Ann Lee must not see or touch it
  FakeSheets.user = 'ann2@example.edu';
  const b8 = bootstrap();
  if (b8.identity.section !== '8') throw new Error('wrong section for the second Ann');
  if (b8.student.checkins.some(c => c.wentWell === 'section seven')) throw new Error('records merged across sections');
  saveCheckin({ checkpoint: 'Early', scores: {}, focusSkill: '', goal: '', drillStep: 0, selfStages: {}, selfOutcomes: {}, wentWell: 'section eight', nextGoal: '' });
  // teacher reads section 7 (as a string, which is what the app sends)
  FakeSheets.user = FakeSheets.owner;
  const d7 = getSectionData('7'), d8 = getSectionData('8');
  if (d7.checkins.length !== 1 || d7.checkins[0].wentWell !== 'section seven') throw new Error('section 7 data: ' + JSON.stringify(d7.checkins));
  if (d8.checkins.length !== 1 || d8.checkins[0].wentWell !== 'section eight') throw new Error('section 8 data: ' + JSON.stringify(d8.checkins));
  if (d7.tests.length !== 1 || d7.tests[0].score !== 4) throw new Error('section 7 test row missing');
  // the Sheet may store "7" back as the number 7; reading again must still match
  const ck = FakeSheets.book.getSheetByName('Checkins');
  const hdr = ck.getRange(1, 1, 1, ck.getLastColumn()).getValues()[0]; const col = hdr.indexOf('Section') + 1;
  ck.getRange(2, col, ck.getLastRow() - 1, 1).setValues(ck.getRange(2, col, ck.getLastRow() - 1, 1).getValues().map(r => [Number(r[0])]));
  if (getSectionData('7').checkins.length !== 1) throw new Error('numeric Section in a data tab no longer matches');
  // duplicate name inside one section is flagged by the config check
  roster.getRange(8, 1, 1, 4).setValues([[7, 'Ultimate', 'ann lee', 'ann3@example.edu']]);
  clearConfigCache();
  const msg = checkConfig();
  if (!/Two students called/.test(msg)) throw new Error('duplicate name in a section not flagged: ' + msg);
  console.log('SECTIONS OK');
`, ctx);
