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

  const SERVER_FNS = ['bootstrap', 'getStudent', 'getSectionData', 'getOverview', 'saveCheckin', 'saveRegister', 'saveSkillTests', 'saveAgility', 'saveGrades', 'saveOutcomes'];
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
    // register L1-L4
    for (let L = 1; L <= 4; L++) saveRegister({ section: 'Section A', lesson: L, entries: A.map((r, i) => ({ student: r[2], participation: rnd() < 0.08 ? null : (rnd() < 0.2 ? 1 : rnd() < 0.7 ? 2 : 3), note: (L === 2 && i === 3) ? 'absent (ill)' : '' })) });
    // Early skill tests for everyone, Middle for a few
    const early = [], middle = [];
    A.forEach((r, i) => { cfg.skills[r[1]].forEach(s => { const sc = Math.floor(rnd() * 8); early.push({ student: r[2], skill: s.skill, score: sc }); if (i % 3 === 0) middle.push({ student: r[2], skill: s.skill, score: Math.min(10, sc + 1 + Math.floor(rnd() * 3)) }); }); });
    saveSkillTests({ section: 'Section A', checkpoint: 'Early', entries: early });
    saveSkillTests({ section: 'Section A', checkpoint: 'Middle', entries: middle });
    saveAgility({ section: 'Section A', entries: A.map(r => ({ student: r[2], baseline: Math.round((15.5 + rnd() * 5) * 100) / 100 })) });
    saveAgility({ section: 'Section A', entries: A.slice(0, 6).map(r => ({ student: r[2], retest: Math.round((15 + rnd() * 5) * 100) / 100 })) });
    // Early check-ins for most; Middle for some
    A.forEach((r, i) => {
      if (i % 5 === 4) return;
      FakeSheets.user = r[3];
      const skills = cfg.skills[r[1]];
      const mine = early.filter(e => e.student === r[2]);
      const lowest = mine.slice().sort((a, b) => a.score - b.score)[0];
      const self = {}; skills.forEach(s => { self[s.skill] = 1 + Math.floor(rnd() * 3); });
      saveCheckin({ checkpoint: 'Early', focusSkill: lowest.skill, goal: `Move my ${lowest.skill.toLowerCase()} from Understanding (${lowest.score}/10) to Intermediate (4+/10) by the Middle check-in by working through drill steps 1 to 3.`, drillStep: 0, agilityFocus: cfg.focus[i % cfg.focus.length].focus, selfStages: self, selfOutcomes: { 'Self-management': 2, 'Perseverance': 1 + (i % 3), 'Collaboration': 2, 'Independence': 1 + (i % 2) }, wentWell: 'I know my ' + lowest.skill.toLowerCase() + ' is the weakest, so that is my focus.', nextGoal: 'Do step 1 and 2 with a peer check each lesson.' });
      if (i % 3 === 0) saveCheckin({ checkpoint: 'Middle', focusSkill: lowest.skill, goal: '', drillStep: 2, agilityFocus: cfg.focus[(i + 2) % cfg.focus.length].focus, selfStages: self, selfOutcomes: { 'Self-management': 3, 'Perseverance': 2, 'Collaboration': 2, 'Independence': 2 }, wentWell: 'Step 2 took two lessons but I got the peer check.', nextGoal: 'Step 3 next, and ask for sign-off earlier.' });
    });
    FakeSheets.user = FakeSheets.owner;
    saveOutcomes({ section: 'Section A', checkpoint: 'Early', entries: A.slice(0, 10).flatMap(r => cfg.outcomes.map(o => ({ student: r[2], outcome: o.outcome, teacher: 1 + Math.floor(rnd() * 3) }))) });
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
