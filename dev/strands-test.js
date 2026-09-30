// A sport with strands (Net Games: Badminton, Volleyball) gives a student one
// focus block per strand; a focus from the wrong strand is refused; the
// overview reports per strand; and records saved under the old single names
// are relabelled as badminton by Set up tabs. Runs the real Code.gs against
// dev/fake-sheets.js.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'fake-sheets.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
vm.runInContext(`
  FakeSheets.user = FakeSheets.owner; setupTabs();
  const roster = FakeSheets.book.getSheetByName('Roster'); roster.getRange(2, 1, roster.getLastRow() - 1, 4).clearContent();
  roster.getRange(2, 1, 2, 4).setValues([['7', 'Net Games', 'Kid One', 'kid@example.edu'], ['7', 'Handball', 'Kid Two', 'two@example.edu']]); clearConfigCache();
  const cfg = buildConfig_();
  if (JSON.stringify(cfg.strands['Net Games']) !== '["Badminton","Volleyball"]') throw new Error('strands: ' + JSON.stringify(cfg.strands));
  if (cfg.strands['Handball']) throw new Error('Handball should have no strands');
  if (cfg.skills['Net Games'].length !== 6 || cfg.skills['Net Games'].every(s => s.drills.length !== 4)) throw new Error('Net Games needs 6 skills with 4 drills each');
  // student saves both games at Early
  FakeSheets.user = 'kid@example.edu';
  const scores = { 'Badminton · Serve': 3, 'Badminton · Rally': 5, 'Badminton · Smash': 2, 'Volleyball · Serve': 6, 'Volleyball · Rally': 4, 'Volleyball · Spike': 1 };
  saveCheckin({ checkpoint: 'Early', scores, selfStages: {}, selfOutcomes: {}, wentWell: 'both', nextGoal: '',
    tracks: [{ focusSkill: 'Badminton · Smash', goal: 'g-bad', drillStep: 0, extensionSkill: '', extensionDrill: '' }, { focusSkill: 'Badminton · Serve', goal: 'wrong strand', drillStep: 0, extensionSkill: '', extensionDrill: '' }] });
  let me = bootstrap().student; let c = me.checkins[0];
  if (c.tracks[0].focusSkill !== 'Badminton · Smash' || c.focusSkill !== 'Badminton · Smash') throw new Error('track 1 focus: ' + JSON.stringify(c.tracks));
  if (c.tracks[1].focusSkill !== '') throw new Error('a badminton skill was accepted as the volleyball focus');
  saveCheckin({ checkpoint: 'Early', scores: {}, selfStages: {}, selfOutcomes: {}, wentWell: 'both', nextGoal: '',
    tracks: [{ focusSkill: 'Badminton · Smash', goal: 'g-bad', drillStep: 0 }, { focusSkill: 'Volleyball · Spike', goal: 'g-vb', drillStep: 0 }] });
  // Middle: retests and steps per game
  saveCheckin({ checkpoint: 'Middle', scores: { 'Badminton · Smash': 6, 'Volleyball · Spike': 4 }, selfStages: {}, selfOutcomes: {}, wentWell: 'w', nextGoal: '',
    tracks: [{ focusSkill: 'Badminton · Smash', goal: 'g-bad', drillStep: 2 }, { focusSkill: 'Volleyball · Spike', goal: 'g-vb', drillStep: 3 }] });
  me = bootstrap().student;
  const mid = me.checkins.find(x => x.checkpoint === 'Middle');
  if (mid.tracks[1].drillStep !== 3 || mid.tracks[0].drillStep !== 2) throw new Error('steps per track: ' + JSON.stringify(mid.tracks));
  if (me.tests.length !== 8) throw new Error('expected 8 test rows, got ' + me.tests.length);
  // teacher overview per strand
  FakeSheets.user = FakeSheets.owner;
  const o = getOverview('7', 'Net Games')[0];
  if (o.tracks.length !== 2 || o.tracks[0].strand !== 'Badminton' || o.tracks[1].focus !== 'Volleyball · Spike') throw new Error('overview tracks: ' + JSON.stringify(o.tracks));
  if (o.tracks[0].focusGain !== 4 || o.tracks[1].focusGain !== 3) throw new Error('gains: ' + JSON.stringify(o.tracks.map(t => t.focusGain)));
  if (o.focus !== 'Badminton · Smash + Volleyball · Spike') throw new Error('joined focus: ' + o.focus);
  if (!o.suggested.S1) throw new Error('no S1 suggestion from two gains');
  // Handball student: one track, legacy payload still works
  FakeSheets.user = 'two@example.edu';
  saveCheckin({ checkpoint: 'Early', scores: { 'Passing': 5 }, focusSkill: 'Passing', goal: 'g', drillStep: 0, selfStages: {}, selfOutcomes: {}, wentWell: 'x', nextGoal: '' });
  const h = bootstrap().student.checkins[0]; if (h.focusSkill !== 'Passing' || h.tracks[0].focusSkill !== 'Passing') throw new Error('legacy single-track payload broke: ' + JSON.stringify(h));
  // relabel: old names on rows → badminton
  FakeSheets.user = FakeSheets.owner;
  const st = FakeSheets.book.getSheetByName('SkillTests'); const hdr = st.getRange(1, 1, 1, st.getLastColumn()).getValues()[0];
  const row = hdr.map(hh => ({ Section: '7', Sport: 'Net Games', Student: 'Kid One', Email: 'kid@example.edu', Checkpoint: 'End', Skill: 'Serve accuracy', Score: 9, By: 'student' })[hh] || '');
  st.getRange(st.getLastRow() + 1, 1, 1, hdr.length).setValues([row]);
  const ck = FakeSheets.book.getSheetByName('Checkins'); const ch = ck.getRange(1, 1, 1, ck.getLastColumn()).getValues()[0];
  const crow = ch.map(hh => ({ Section: '7', Sport: 'Net Games', Student: 'Kid One', Email: 'kid@example.edu', Checkpoint: 'End', FocusSkill: 'Attacking shot', SelfStages: '{"Rally control":2}' })[hh] || '');
  ck.getRange(ck.getLastRow() + 1, 1, 1, ch.length).setValues([crow]);
  setupTabs();
  const t2 = readTab_('SkillTests').find(r => r.Checkpoint === 'End'); if (t2.Skill !== 'Badminton · Serve') throw new Error('SkillTests not relabelled: ' + t2.Skill);
  const c2 = readTab_('Checkins').find(r => r.Checkpoint === 'End'); if (c2.FocusSkill !== 'Badminton · Smash' || c2.SelfStages !== '{"Badminton · Rally":2}') throw new Error('Checkins not relabelled: ' + JSON.stringify(c2));
  console.log('STRANDS OK');
`, ctx);
