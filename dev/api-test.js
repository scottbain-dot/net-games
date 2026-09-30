// The JSON API used by the GitHub Pages front end, run against the fake Sheet:
// token gate, domain gate, function whitelist, and identity from the token.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'fake-sheets.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
vm.runInContext(`
  FakeSheets.owner = 'teacher@example.edu'; FakeSheets.user = FakeSheets.owner;
  setupTabs();
  const roster = FakeSheets.book.getSheetByName('Roster');
  roster.getRange(2, 1, 2, 4).setValues([[7, 'Net Games', 'Ann Lee', 'ann@example.edu'], [8, 'Handball', 'Ben Ito', 'ben@example.edu']]);
  const post = (body) => JSON.parse(doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  // no client id configured → every token refused
  let r = post({ token: 'good-token:ann@example.edu', fn: 'bootstrap', args: [] });
  if (r.ok || r.code !== 'server' || !/oauth_client_id is blank/.test(r.error)) throw new Error('accepted a token with no client id configured: ' + JSON.stringify(r));
  const cfgTab = FakeSheets.book.getSheetByName('Config');
  const vals = cfgTab.getDataRange().getValues(); const row = vals.findIndex(v => v[0] === 'oauth_client_id') + 1;
  cfgTab.getRange(row, 2).setValue('test-client'); clearConfigCache();
  // good token → identity from the token, not the session user
  FakeSheets.user = '';  // no Google session at all, as on GitHub Pages
  r = post({ token: 'good-token:ann@example.edu', fn: 'bootstrap', args: [] });
  if (!r.ok || r.result.identity.role !== 'student' || r.result.identity.name !== 'Ann Lee') throw new Error('token identity failed: ' + JSON.stringify(r).slice(0, 300));
  if (r.result.config.roster.length !== 1) throw new Error('student got the class list over the API');
  // student can save and the row is theirs
  r = post({ token: 'good-token:ann@example.edu', fn: 'saveCheckin', args: [{ checkpoint: 'Early', scores: { 'Serve accuracy': 4 }, focusSkill: 'Serve accuracy', goal: 'g', drillStep: 0, selfStages: {}, selfOutcomes: {}, wentWell: 'via api', nextGoal: '' }] });
  if (!r.ok) throw new Error('save over API failed: ' + r.error);
  // teacher (the owner) over the API
  r = post({ token: 'good-token:teacher@example.edu', fn: 'getSectionData', args: ['7'] });
  if (!r.ok || r.result.checkins.length !== 1 || r.result.checkins[0].wentWell !== 'via api') throw new Error('teacher read failed: ' + JSON.stringify(r).slice(0, 200));
  // the same API over GET, answered as a page that posts the JSON to its parent (the one-hop route)
  const fr = doGet({ parameter: { api: '1', id: 'req42', fn: 'bootstrap', args: '[]', token: 'good-token:ann@example.edu' } }).getContent();
  const m = /postMessage\((.*), "\*"\);/.exec(fr); if (!m) throw new Error('frame reply has no postMessage: ' + fr.slice(0, 200));
  const posted = JSON.parse(m[1]);
  if (posted.mfs !== 1 || posted.id !== 'req42' || !posted.out.ok || posted.out.result.identity.name !== 'Ann Lee') throw new Error('frame reply wrong: ' + JSON.stringify(posted).slice(0, 200));
  if (/<\/script>/.test(m[1])) throw new Error('unescaped </script> inside the frame reply');
  const frBad = JSON.parse(/postMessage\((.*), "\*"\);/.exec(doGet({ parameter: { api: '1', id: 'x', fn: 'bootstrap', args: 'not json', token: 'nonsense' } }).getContent())[1]);
  if (frBad.out.ok || frBad.out.code !== 'auth') throw new Error('frame route accepted a bad token: ' + JSON.stringify(frBad));
  // a student cannot call teacher functions
  r = post({ token: 'good-token:ann@example.edu', fn: 'getSectionData', args: ['7'] });
  if (r.ok) throw new Error('student read section data over the API');
  // wrong audience, wrong domain, bad token, unknown function
  r = post({ token: 'other-client:ann@example.edu', fn: 'bootstrap', args: [] }); if (r.ok || r.code !== 'server' || !/different client ID/.test(r.error)) throw new Error('token for another client accepted: ' + JSON.stringify(r));
  r = post({ token: 'good-token:ann@gmail.com', fn: 'bootstrap', args: [] }); if (r.ok || r.code !== 'auth' || !/only example.edu accounts/.test(r.error) || /ann@/.test(r.error)) throw new Error('token from another domain: ' + JSON.stringify(r));
  r = post({ token: 'nonsense', fn: 'bootstrap', args: [] }); if (r.ok || r.code !== 'auth' || !/HTTP 400/.test(r.error)) throw new Error('bad token: ' + JSON.stringify(r));
  // the script has not been allowed to contact Google: an owner-side problem, named as such, not a sign-in loop
  const realFetch = UrlFetchApp.fetch; UrlFetchApp.fetch = () => { throw new Error('You do not have permission to call UrlFetchApp.fetch'); };
  r = post({ token: 'good-token:ben@example.edu', fn: 'bootstrap', args: [] });   // a token not yet in the verified cache
  if (r.ok || r.code !== 'server' || !/2\. Check roster & config/.test(r.error)) throw new Error('fetch permission failure not surfaced: ' + JSON.stringify(r));
  if (!/not allowed to contact Google/.test(checkConfig())) throw new Error('checkConfig did not report the fetch permission');
  UrlFetchApp.fetch = realFetch;
  if (!/Sign-in check can reach Google/.test(checkConfig())) throw new Error('checkConfig probe missing');
  r = post({ token: 'good-token:ann@example.edu', fn: 'setupTabs', args: [] }); if (r.ok) throw new Error('non-whitelisted function ran');
  r = post({ token: 'good-token:ann@example.edu', fn: 'clearStudentData', args: [] }); if (r.ok) throw new Error('destructive function ran over the API');
  // identity does not leak into the next (session) request
  if (REQUEST_EMAIL_ !== null) throw new Error('request email leaked');
  console.log('API OK');
`, ctx);
