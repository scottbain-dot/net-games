// Browser-only: wires the real Code.gs (running against fake-sheets.js) up to
// a fake google.script.run, seeds an example section, and picks who "you" are
// from the URL:
//   ?role=teacher | ?role=student | ?role=student2 | ?role=unknown | ?role=anon | ?as=email
//   &fail=1        every write fails (to test the outbox)
//   &latency=800   simulated round-trip in ms
//   &reset=1       wipe the fake spreadsheet stored in localStorage
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const STORE = 'mfs_fake_book_v1';
  const latency = parseInt(q.get('latency') || '250', 10);
  const failWrites = q.get('fail') === '1';

  if (q.get('reset') !== '1') {
    try { const j = localStorage.getItem(STORE); if (j) FakeSheets.book = FakeSheets.Book.fromJSON(JSON.parse(j)); } catch (e) {}
  }
  FakeSheets.book.onChange = b => { try { localStorage.setItem(STORE, JSON.stringify(b.toJSON())); } catch (e) {} };

  const SERVER_FNS = ['bootstrap', 'getStudent', 'getSectionData', 'getOverview', 'saveCheckin', 'saveTeacherCheckin', 'saveRegister', 'saveSkillTests', 'saveGrades', 'saveOutcomes'];
  const isWrite = fn => /^save/.test(fn);

  const first = ['Freya', 'Flavio', 'Karim', 'Soomin', 'Chaeyi', 'Michelle', 'Woojun', 'Kian', 'Nico', 'Louis', 'Ella', 'Lena', 'Austin', 'Jihoo', 'Ari', 'Yilei', 'Joon', 'Rubin', 'Minh', 'Amaya', 'Peter', 'Silas', 'Bora', 'Ray', 'Kinley', 'Josh', 'David', 'Vihaan'];
  const last = 'RCAOLSJWSHBLWPRLSLVWTVGSCRLM';
  function seed() {
    FakeSheets.owner = 'teacher@example.edu';
    FakeSheets.user = FakeSheets.owner;
    setupTabs();
    const sports = ['Net Games', 'Ultimate', 'Table Tennis', 'Handball'];
    const rosterRows = [];
    const mk = (section, n, off) => { for (let i = 0; i < n; i++) { const nm = first[(i + off) % first.length] + ' ' + last[(i + off) % last.length]; rosterRows.push([section, sports[i % 4], nm, nm.toLowerCase().replace(/\s+/g, '.') + '.' + section.replace(/\s+/g, '').toLowerCase() + '@example.edu']); } };
    mk('Section A', 28, 0); mk('Section B', 24, 9);
    rosterRows.push(['Section B', 'Handball', 'Teacher Test', 'teacher@example.edu']); // the owner, on the roster to test the student view
    const roster = FakeSheets.book.getSheetByName('Roster');
    roster.clear(); roster.getRange(1, 1, 1, 4).setValues([['Section', 'Sport', 'Student', 'Email']]);
    roster.getRange(2, 1, rosterRows.length, 4).setValues(rosterRows);
    clearConfigCache();
    const cfg = buildConfig_();
    const A = rosterRows.filter(r => r[0] === 'Section A');
    let seedRand = 7; const rnd = () => { seedRand = (seedRand * 9301 + 49297) % 233280; return seedRand / 233280; };
    // Early: students typed their own scores + agility; teacher confirmed most and rated engagement/personal
    const early = {};
    A.forEach((r, i) => {
      if (i % 5 === 4) return; // a few haven't done the Early check-in (index 4 = ?role=student2)
      FakeSheets.user = r[3];
      const skills = cfg.skills[r[1]];
      const scores = {}; skills.forEach(s => { scores[s.skill] = Math.floor(rnd() * 8); });
      early[r[2]] = scores;
      const lowest = skills.slice().sort((a, b) => scores[a.skill] - scores[b.skill])[0].skill;
      saveCheckin({ checkpoint: 'Early', scores, focusSkill: lowest, goal: `Move my ${lowest.toLowerCase()} from Understanding (${scores[lowest]}/10) to Intermediate (4+/10) by the Middle check-in by working through drill steps 1 to 3.`, drillStep: 0, selfStages: {}, selfOutcomes: {}, wentWell: 'It is my weakest score and I want to fix it first.', nextGoal: '' });
      if (i % 3 === 0) { const maxSteps = skills.find(s => s.skill === lowest).drills.length; const done = i % 6 === 0; saveCheckin({ checkpoint: 'Middle', scores: { [lowest]: Math.min(10, scores[lowest] + 1 + Math.floor(rnd() * 3)) }, focusSkill: lowest, goal: '', drillStep: done ? maxSteps : 2, extensionSkill: done ? 'Backhand under pressure' : '', extensionDrill: done ? 'Partner feeds 10 to my backhand while I move; 7 of 10 back deep' : '', selfStages: { [lowest]: 2 }, selfOutcomes: {}, wentWell: done ? 'All steps signed off, moving to an extension.' : 'Step 2 took two lessons but I got the peer check.', nextGoal: '' }); }
    });
    FakeSheets.user = FakeSheets.owner;
    saveTeacherCheckin({ section: 'Section A', checkpoint: 'Early', entries: A.filter((r, i) => i % 5 !== 4 && i % 4 !== 3).map((r, i) => ({ student: r[2], confirmed: true, engagement: 1 + Math.floor(rnd() * 3), personal: 1 + Math.floor(rnd() * 3) })) });
    saveTeacherCheckin({ section: 'Section A', checkpoint: 'Early', entries: [{ student: A[1][2], scores: { [cfg.skills[A[1][1]][0].skill]: 5 } }] });
    saveTeacherCheckin({ section: 'Section A', checkpoint: 'End', entries: [{ student: A[0][2], gamePlay: 2, confirmed: true, engagement: 3, personal: 2 }] });
    saveOutcomes({ section: 'Section A', checkpoint: 'Early', entries: A.slice(0, 4).flatMap(r => cfg.outcomes.map(o => ({ student: r[2], outcome: o.outcome, teacher: 1 + Math.floor(rnd() * 3) }))) });
    saveGrades({ section: 'Section A', entries: [{ student: A[0][2], criterion: 'S4', score: 6, comment: 'Leads warm-ups, always encouraging.' }] });
  }
  if (!FakeSheets.book.getSheetByName('Roster')) seed();

  const role = q.get('role') || 'teacher';
  const rosterTab = FakeSheets.book.getSheetByName('Roster').getDataRange().getValues().slice(1);
  if (q.get('as')) FakeSheets.user = q.get('as');
  else if (role === 'student') FakeSheets.user = rosterTab[0][3];
  else if (role === 'student2') FakeSheets.user = rosterTab[4][3];
  else if (role === 'unknown') FakeSheets.user = 'nobody@example.edu';
  else if (role === 'anon') FakeSheets.user = '';
  else FakeSheets.user = FakeSheets.owner;

  function makeRunner() {
    const r = { _ok: null, _err: null };
    r.withSuccessHandler = fn => { r._ok = fn; return r; };
    r.withFailureHandler = fn => { r._err = fn; return r; };
    SERVER_FNS.forEach(name => {
      r[name] = (...args) => {
        const cloned = JSON.parse(JSON.stringify(args));
        setTimeout(() => {
          try {
            if (failWrites && isWrite(name)) throw new Error('Simulated network failure');
            const out = window[name](...cloned);
            const res = out === undefined ? null : JSON.parse(JSON.stringify(out));
            if (r._ok) r._ok(res);
          } catch (e) { if (r._err) r._err({ message: e.message || String(e) }); else console.error(e); }
        }, latency);
      };
    });
    return r;
  }
  window.google = { script: { run: makeRunner() } };
  ['withSuccessHandler', 'withFailureHandler'].forEach(k => { window.google.script.run[k] = fn => makeRunner()[k](fn); });
  window.__preview = { role, user: FakeSheets.user, failWrites, latency };
})();
