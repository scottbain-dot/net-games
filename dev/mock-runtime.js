// Browser-only: wires the real Code.gs (running against fake-sheets.js) up to
// a fake google.script.run, seeds an example class, and picks who "you" are
// from the URL:
//   ?role=teacher | ?role=student | ?role=unknown | ?as=email@school.edu
//   &fail=1   → every write fails (to test the outbox)
//   &latency=800 → simulated round-trip in ms
//   &reset=1  → wipe the fake spreadsheet stored in localStorage
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const STORE = 'pe_fake_book_v1';
  const latency = parseInt(q.get('latency') || '250', 10);
  const failWrites = q.get('fail') === '1';

  // ---- persistence of the fake spreadsheet across reloads ----
  if (q.get('reset') !== '1') {
    try { const j = localStorage.getItem(STORE); if (j) FakeSheets.book = FakeSheets.Book.fromJSON(JSON.parse(j)); } catch (e) {}
  }
  FakeSheets.book.onChange = b => { try { localStorage.setItem(STORE, JSON.stringify(b.toJSON())); } catch (e) {} };

  const SERVER_FNS = ['bootstrap', 'getStudent', 'getClassData', 'getOverview', 'saveCheckpoint', 'saveRegister', 'saveTeacherRatings', 'saveTests', 'saveGrades'];
  const isWrite = fn => /^save/.test(fn);

  // ---- seed (only when the sheet is fresh) ----
  const first = ['Freya', 'Flavio', 'Karim', 'Soomin', 'Chaeyi', 'Michelle', 'Woojun', 'Kian', 'Nico', 'Louis', 'Ella', 'Lena', 'Austin', 'Jihoo', 'Ari', 'Yilei', 'Joon', 'Rubin', 'Minh', 'Amaya', 'Peter', 'Silas'];
  const last = 'RCAOLSJWSHBLWPRLSLVWTV';
  function seed() {
    FakeSheets.owner = 'teacher@example.edu';
    FakeSheets.user = FakeSheets.owner;
    setupTabs();
    const rosterRows = [];
    const mk = (cls, n, off) => { for (let i = 0; i < n; i++) { const nm = first[(i + off) % first.length] + ' ' + last[(i + off) % last.length]; rosterRows.push([cls, nm, nm.toLowerCase().replace(/\s+/g, '.') + '.' + cls.toLowerCase() + '@example.edu']); } };
    mk('7A', 22, 0); mk('8A', 20, 7);
    const roster = FakeSheets.book.getSheetByName('Roster');
    roster.clear(); roster.getRange(1, 1, 1, 3).setValues([['Class', 'Student', 'Email']]);
    roster.getRange(2, 1, rosterRows.length, 3).setValues(rosterRows);
    clearConfigCache();
    // Some history for 7A: lessons 1-4 registered, Early checkpoint entered, tests
    const cfg = buildConfig_();
    const names7 = rosterRows.filter(r => r[0] === '7A').map(r => r[1]);
    let seedRand = 7; const rnd = () => { seedRand = (seedRand * 9301 + 49297) % 233280; return seedRand / 233280; };
    for (let L = 1; L <= 4; L++) {
      saveRegister({ cls: '7A', lesson: L, entries: names7.map((s, i) => ({ student: s, participation: rnd() < 0.08 ? null : (rnd() < 0.2 ? 1 : rnd() < 0.7 ? 2 : 3), note: (L === 2 && i === 3) ? 'absent (ill)' : '' })) });
    }
    saveTests({ cls: '7A', entries: names7.map(s => ({ student: s, baseline: Math.round((15.5 + rnd() * 5) * 100) / 100 })) });
    saveTests({ cls: '7A', entries: names7.slice(0, 5).map(s => ({ student: s, retest: Math.round((15 + rnd() * 5) * 100) / 100 })) });
    names7.forEach((s, i) => {
      if (i % 5 === 4) return; // a few students haven't entered yet
      FakeSheets.user = rosterRows.find(r => r[1] === s)[2];
      const ratings = [];
      cfg.sports.forEach(sp => cfg.skills[sp].forEach(sk => ratings.push({ sport: sp, skill: sk.skill, rating: 1 + Math.floor(rnd() * 3) })));
      saveCheckpoint({ checkpoint: 'Early', ratings, focus: cfg.focus[i % cfg.focus.length].focus, wentWell: 'My serve is more consistent than at the start. I still rush my footwork.', nextGoal: 'Get back to base after every shot in badminton.' });
      if (i % 3 === 0) saveCheckpoint({ checkpoint: 'Middle', ratings: ratings.map(r => ({ sport: r.sport, skill: r.skill, rating: Math.min(4, r.rating + 1) })), focus: cfg.focus[(i + 2) % cfg.focus.length].focus, wentWell: 'Tactics improved: I move my opponent to the back and then drop.', nextGoal: 'Communicate more in volleyball.' });
    });
    FakeSheets.user = FakeSheets.owner;
    saveTeacherRatings({ cls: '7A', checkpoint: 'Early', entries: names7.slice(0, 12).flatMap(s => cfg.skills['Badminton'].map(sk => ({ student: s, sport: 'Badminton', skill: sk.skill, rating: 1 + Math.floor(rnd() * 3) }))) });
    saveGrades({ cls: '7A', entries: [{ student: names7[0], criterion: 'S4', score: 6, comment: 'Leads warm-ups, always encouraging.' }] });
  }
  if (!FakeSheets.book.getSheetByName('Roster')) seed();

  // ---- who am I ----
  const role = q.get('role') || 'teacher';
  const rosterTab = FakeSheets.book.getSheetByName('Roster').getDataRange().getValues().slice(1);
  if (q.get('as')) FakeSheets.user = q.get('as');
  else if (role === 'student') FakeSheets.user = rosterTab[0][2];
  else if (role === 'student2') FakeSheets.user = rosterTab[4][2];
  else if (role === 'unknown') FakeSheets.user = 'nobody@example.edu';
  else if (role === 'anon') FakeSheets.user = '';
  else FakeSheets.user = FakeSheets.owner;

  // ---- google.script.run ----
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
          } catch (e) {
            if (r._err) r._err({ message: e.message || String(e) }); else console.error(e);
          }
        }, latency);
      };
    });
    return r;
  }
  window.google = { script: { run: makeRunner() } };
  // each chained call gets fresh handlers
  ['withSuccessHandler', 'withFailureHandler'].forEach(k => { const orig = window.google.script.run[k]; window.google.script.run[k] = fn => makeRunner()[k](fn); });
  window.__preview = { role, user: FakeSheets.user, failWrites, latency };
})();
