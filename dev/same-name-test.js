// Two students with the same name in one section keep separate records
// (filed by email), nobody's email reaches a browser, and rows saved by an
// earlier version get their Email filled from the Roster. Runs the real
// Code.gs against dev/fake-sheets.js.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'fake-sheets.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
vm.runInContext(`
  FakeSheets.user = FakeSheets.owner;
  setupTabs();
  const roster = FakeSheets.book.getSheetByName('Roster');
  roster.getRange(2, 1, roster.getLastRow() - 1, 4).clearContent();
  roster.getRange(2, 1, 3, 4).setValues([
    ['7', 'Net Games', 'Jiwoo Lim', 'jiwoo_lim@example.edu'],
    ['7', 'Handball', 'Jiwoo Lim', 'jiwoo_lim2@example.edu'],
    ['7', 'Ultimate', 'Solo Kid', 'solo@example.edu'],
  ]);
  clearConfigCache();
  const early = { checkpoint: 'Early', focusSkill: '', goal: '', drillStep: 0, selfStages: {}, selfOutcomes: {}, nextGoal: '' };
  FakeSheets.user = 'jiwoo_lim@example.edu';
  let b1 = bootstrap();
  saveCheckin(Object.assign({ section: b1.identity.section, id: b1.identity.id, student: b1.identity.name, scores: { 'Badminton · Serve': 4 }, wentWell: 'first jiwoo' }, early));
  FakeSheets.user = 'jiwoo_lim2@example.edu';
  let b2 = bootstrap();
  saveCheckin(Object.assign({ section: b2.identity.section, id: b2.identity.id, student: b2.identity.name, scores: { 'Passing': 8 }, wentWell: 'second jiwoo' }, early));
  if (b1.identity.id === b2.identity.id || !b1.identity.id) throw new Error('ids not distinct: ' + b1.identity.id + ' / ' + b2.identity.id);
  b1 = bootstrap.call(null); FakeSheets.user = 'jiwoo_lim@example.edu'; b1 = bootstrap();
  if (b1.student.checkins.length !== 1 || b1.student.checkins[0].wentWell !== 'first jiwoo') throw new Error('student 1 sees: ' + JSON.stringify(b1.student.checkins));
  if (b1.student.sport !== 'Net Games' || b1.student.tests.length !== 1) throw new Error('student 1 data: ' + JSON.stringify(b1.student));
  FakeSheets.user = 'jiwoo_lim2@example.edu'; b2 = bootstrap();
  if (b2.student.checkins.length !== 1 || b2.student.checkins[0].wentWell !== 'second jiwoo' || b2.student.sport !== 'Handball') throw new Error('student 2 sees: ' + JSON.stringify(b2.student));
  [b1, b2].forEach(b => { const j = JSON.stringify(b).split(b.identity.email).join(''); if (j.indexOf('@') !== -1) throw new Error('another email reached a student browser: ' + j.slice(j.indexOf('@') - 60, j.indexOf('@') + 30)); });
  console.log('two Jiwoo Lims kept apart');

  // teacher: section data carries ids, no emails; writes by id land on the right student
  FakeSheets.user = FakeSheets.owner;
  const bt = bootstrap();
  if (JSON.stringify(bt.config.roster).indexOf('@') !== -1) throw new Error('emails in the teacher roster payload');
  const sec = getSectionData('7');
  if (JSON.stringify(sec).indexOf('@') !== -1) throw new Error('emails in section data');
  saveTeacherCheckin({ section: '7', checkpoint: 'Early', entries: [{ id: b2.identity.id, confirmed: true, scores: { 'Passing': 9 } }] });
  saveRegister({ section: '7', lesson: 1, entries: [{ id: b1.identity.id, participation: 3 }, { id: b2.identity.id, participation: 1 }] });
  saveOutcomes({ section: '7', checkpoint: 'Early', entries: [{ id: b1.identity.id, outcome: 'Perseverance', teacher: 2 }] });
  saveGrades({ section: '7', entries: [{ id: b2.identity.id, criterion: 'S1', score: 6 }] });
  const ov = getOverview('7', '');
  const o1 = ov.find(o => o.id === b1.identity.id), o2 = ov.find(o => o.id === b2.identity.id);
  if (!o1 || !o2 || o1.student !== 'Jiwoo Lim' || o2.student !== 'Jiwoo Lim') throw new Error('overview rows: ' + JSON.stringify(ov.map(o => [o.student, o.id])));
  if (o2.focusStart !== null && o2.focusStart !== undefined && o2.focusStart !== 9) {}
  const tests = readTab_('SkillTests');
  const t2 = tests.filter(t => t.Email === 'jiwoo_lim2@example.edu');
  if (t2.length !== 1 || t2[0].Score !== 9 || t2[0].By !== 'teacher') throw new Error('teacher score by id: ' + JSON.stringify(t2));
  if (tests.filter(t => t.Email === 'jiwoo_lim@example.edu').length !== 1) throw new Error('teacher write leaked onto the other Jiwoo');
  if (o1.lessonsAttended !== 1 || o2.lessonsAttended !== 1) throw new Error('register by id: ' + o1.lessonsAttended + '/' + o2.lessonsAttended);
  if (!(o2.final.S1 && o2.final.S1.score === 6) || o1.final.S1) throw new Error('grade by id: ' + JSON.stringify([o1.final, o2.final]));
  // a teacher naming a duplicate by name gets a clear error; a unique name still works
  let threw = ''; try { saveRegister({ section: '7', lesson: 2, entries: [{ student: 'Jiwoo Lim', participation: 2 }] }); } catch (e) { threw = e.message; }
  if (!/More than one student called Jiwoo Lim/.test(threw)) throw new Error('ambiguous name not refused: ' + threw);
  saveRegister({ section: '7', lesson: 2, entries: [{ student: 'Solo Kid', participation: 2 }] });
  if (readTab_('Register').filter(r => r.Email === 'solo@example.edu').length !== 1) throw new Error('unique name lookup failed');
  const msg = checkConfig();
  if (!/Note: 2 different students called "Jiwoo Lim" in section 7/.test(msg)) throw new Error('same-name note missing: ' + msg);
  console.log('teacher writes by id OK');

  // migration: a row from before Email existed is matched to the one student with that name
  const ck = FakeSheets.book.getSheetByName('Checkins');
  const hdr = ck.getRange(1, 1, 1, ck.getLastColumn()).getValues()[0];
  const row = hdr.map(h => ({ Section: '7', Sport: 'Ultimate', Student: 'Solo Kid', Checkpoint: 'Middle', WentWell: 'old row' })[h] || '');
  ck.getRange(ck.getLastRow() + 1, 1, 1, hdr.length).setValues([row]);
  const rowJ = hdr.map(h => ({ Section: '7', Sport: 'Net Games', Student: 'Jiwoo Lim', Checkpoint: 'Middle', WentWell: 'ambiguous old row' })[h] || '');
  ck.getRange(ck.getLastRow() + 1, 1, 1, hdr.length).setValues([rowJ]);
  if (!/1 saved record\\(s\\) have no Email/.test(checkConfig())) throw new Error('unmatched old row not counted');
  setupTabs();
  const solo = readTab_('Checkins').filter(r => r.Student === 'Solo Kid');
  if (solo.length !== 1 || solo[0].Email !== 'solo@example.edu') throw new Error('migration did not fill Email: ' + JSON.stringify(solo));
  if (readTab_('Checkins').some(r => r.WentWell === 'ambiguous old row' && r.Email)) throw new Error('ambiguous old row was assigned to a student');
  FakeSheets.user = 'solo@example.edu';
  if (bootstrap().student.checkins[0].wentWell !== 'old row') throw new Error('migrated row not visible to the student');
  console.log('SAME NAME OK');
`, ctx);
