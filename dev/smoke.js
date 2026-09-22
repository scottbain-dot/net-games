#!/usr/bin/env node
// Headless smoke test: renders the preview in Chromium as student, teacher
// and unknown user, exercises the main flows, fails on any page error, and
// writes screenshots to dev/shots/. Requires the `playwright` package
// (globally installed is fine: NODE_PATH=$(npm root -g) node dev/smoke.js).
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const preview = 'file://' + path.join(__dirname, 'preview.html');
const shots = path.join(__dirname, 'shots');
fs.mkdirSync(shots, { recursive: true });
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

async function main() {
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', d => d.accept('Great effort this term.'));
  const shot = name => page.screenshot({ path: path.join(shots, name + '.png'), fullPage: true });
  const saved = async () => { await page.waitForFunction(() => { const s = document.querySelector('#savestate'); return s && /All saved/.test(s.textContent); }, null, { timeout: 8000 }); };

  // ── student 1 (Freya, Net Games, Early + Middle done) → End check-in ──
  await page.goto(preview + '?role=student&reset=1');
  await page.waitForSelector('.cp-strip');
  await shot('01-student-dashboard');
  await page.click('[data-act="open-cp"][data-cp="End"]');
  await page.waitForSelector('[data-act="drill-step"]');
  if (await page.$('input[data-in="score"]')) errors.push('End check-in should not ask the student for scores');
  await page.click('.seg3 >> nth=0 >> button >> nth=2');
  const nSteps = await page.$$eval('[data-act="drill-step"].step', els => els.length);
  await page.click(`[data-act="drill-step"][data-n="${nSteps}"]`);
  await page.waitForSelector('input[data-in="extensionSkill"]');
  await page.fill('input[data-in="extensionSkill"]', 'Backhand smash');
  await page.fill('textarea[data-in="extensionDrill"]', 'Fed high balls to the backhand, 6 of 10 winners.');
  await page.click('[data-act="self-outcome"][data-n="3"] >> nth=0');
  await page.fill('textarea[data-in="wentWell"]', 'My serve is now consistent under pressure.');
  await page.fill('textarea[data-in="nextGoal"]', 'Keep the serve and start on overhead shots.');
  await shot('02-student-end-checkin');
  await page.click('[data-act="cp-save"]');
  await page.waitForSelector('.cp-card:nth-child(3).done');
  await saved();
  const focusText = await page.textContent('.card-head.amber + .card-body');
  if (!/Extension · Backhand smash/.test(focusText || '')) errors.push('Extension skill not shown on dashboard');
  await shot('03-student-after-save');

  // ── student 2 (no check-in yet): Early with own scores → focus recommended, goal drafted ──
  await page.goto(preview + '?role=student2');
  await page.waitForSelector('.cp-strip');
  await page.click('[data-act="open-cp"][data-cp="Early"]');
  await page.waitForSelector('input[data-in="score"]');
  await page.click('.focus-grid >> .focus-btn >> nth=0');   // choose focus before any score exists
  if (/\(\?\//.test(await page.inputValue('textarea[data-in="goal"]'))) errors.push('Goal drafted with ? before a score existed');
  const nIn = (await page.$$('input[data-in="score"]')).length;
  const vals = ['2', '7', '5'];
  for (let i = 0; i < nIn; i++) { const inp = page.locator('input[data-in="score"]').nth(i); await inp.fill(vals[i] || '4'); await inp.dispatchEvent('change'); await page.waitForTimeout(50); }
  const recText = await page.textContent('.focus-grid >> .focus-btn >> nth=0');
  if (!/recommended/.test(recText)) errors.push('Lowest score not marked recommended: ' + recText);
  await page.click('.focus-grid >> .focus-btn >> nth=0');
  await page.waitForSelector('textarea[data-in="goal"]');
  const goal = await page.inputValue('textarea[data-in="goal"]');
  if (!/\(2\/10\).*by the Middle check-in/.test(goal)) errors.push('Goal not drafted from typed score: ' + goal);
  await page.fill('textarea[data-in="wentWell"]', 'It is my lowest score.');
  await shot('04-student-early-checkin');
  await page.click('[data-act="cp-save"]');
  await page.waitForSelector('.cp-card:nth-child(1).done');
  await saved();

  // outbox: writes fail → banner, then reload without fail → drains
  await page.goto(preview + '?role=student&fail=1');
  await page.waitForSelector('.cp-strip');
  await page.click('[data-act="open-cp"][data-cp="Middle"]');
  await page.waitForSelector('textarea[data-in="wentWell"]');
  await page.fill('textarea[data-in="wentWell"]', 'Queued while offline.');
  await page.click('[data-act="cp-save"]');
  await page.waitForSelector('#banner.show');
  await shot('05-student-outbox-failed');
  await page.goto(preview + '?role=student');
  await page.waitForSelector('.cp-strip');
  await saved();
  try { await page.waitForFunction(() => /Queued while offline/.test(document.body.textContent), null, { timeout: 8000 }); }
  catch (e) { errors.push('Outbox did not re-send the Middle check-in after reload'); }

  await page.goto(preview + '?role=unknown'); await page.waitForSelector('.notice'); await shot('06-unknown-user');
  await page.goto(preview + '?role=anon'); await page.waitForSelector('.notice');

  // ── teacher check-in ──
  await page.goto(preview + '?role=teacher');
  await page.waitForSelector('.ok-btn');
  await page.click('[data-act="t-sport"][data-v="Net Games"]');
  await page.waitForSelector('.ok-btn');
  await page.click('[data-act="t-cp"][data-v="Early"]');
  await page.waitForSelector('.ok-btn');
  await shot('07-teacher-checkin-early');
  // confirm the first unconfirmed row, rate engagement + personal, fix a score
  const row = page.locator('table.tc tbody tr:not(.ok):not(.detail)').first();
  const name = await row.locator('td b').first().textContent();
  await row.locator('.ok-btn').click();
  await page.locator(`[data-act="t-pers"][data-student="${name}"][data-n="2"]`).click();
  await page.locator(`input[data-in="tscore"][data-student="${name}"]`).first().fill('9');
  await page.locator(`input[data-in="tscore"][data-student="${name}"]`).first().dispatchEvent('change');
  await page.locator(`[data-act="t-expand"][data-student="${name}"]`).click();
  await page.waitForSelector('tr.detail .cyc');
  await page.click('tr.detail .cyc >> nth=0');
  await saved();
  const okNow = await page.locator(`[data-act="t-confirm"][data-student="${name}"]`).evaluate(b => b.classList.contains('on'));
  if (!okNow) errors.push('Confirm did not stick for ' + name);
  const pill = await page.locator(`[data-stage-for^="${name}|"]`).first().textContent();
  if (pill !== 'Automatic') errors.push('Teacher score 9 did not update stage pill: ' + pill);
  await shot('08-teacher-checkin-after');
  await page.click('[data-act="t-cp"][data-v="Middle"]');
  await page.waitForSelector('.ok-btn');
  await shot('09-teacher-checkin-middle');
  // game-play page (phone-sized rows), then End page picks the level up
  await page.click('[data-act="t-cp"][data-v="__game"]');
  await page.waitForSelector('.gp-row');
  const gpName = await page.locator('.gp-row').nth(1).locator('b').first().textContent();
  await page.locator('.gp-row').nth(1).locator('[data-act="t-game"][data-n="2"]').click();
  await page.locator(`input[data-in="gnote"][data-student="${gpName}"]`).fill('Good under pressure');
  await page.locator(`input[data-in="gnote"][data-student="${gpName}"]`).dispatchEvent('change');
  await saved();
  await shot('09a-teacher-gameplay');
  await page.click('[data-act="t-cp"][data-v="End"]');
  await page.waitForSelector('.ok-btn');
  const onEnd = await page.locator(`[data-act="t-game"][data-student="${gpName}"].on`).count();
  if (!onEnd) errors.push('Game-play level from the Game play tab not shown on End page');
  const endRow = page.locator('table.tc tbody tr').first();
  await endRow.locator('input[data-in="tscore"]').first().fill('8');
  await endRow.locator('input[data-in="tscore"]').first().dispatchEvent('change');
  await endRow.locator('[data-act="t-game"][data-n="1"]').click();
  await page.locator('table.tc tbody tr').first().locator('.ok-btn').click();
  await saved();
  await shot('09b-teacher-checkin-end');

  await page.click('[data-act="t-tab"][data-tab="students"]');
  await page.waitForSelector('.student-card');
  await page.click('.student-card >> nth=0');
  await page.waitForSelector('.cp-strip');
  await shot('10-teacher-views-student');
  await page.click('[data-act="t-back"]');

  await page.click('[data-act="t-tab"][data-tab="overview"]');
  await page.waitForSelector('.gcard');
  if (!(await page.$('.refl-mini'))) errors.push('Reflections not shown on grades cards');
  await page.click('[data-act="accept-sug"]');
  await saved();
  const remaining = await page.$('[data-act="accept-sug"]');
  if (remaining) errors.push('Accept all suggested left suggestions unaccepted');
  await page.click('.score-row >> nth=0 >> button[data-n="5"]');
  await page.click('[data-act="grade-comment"] >> nth=0');
  await saved();
  await shot('11-teacher-grades');
  await page.click('[data-act="ov-ungraded"]');
  await page.waitForTimeout(200);
  await page.click('[data-act="ov-ungraded"]');

  await page.click('[data-act="t-tab"][data-tab="print"]');
  await page.waitForSelector('.sheet');
  await page.locator('.sheet').first().screenshot({ path: path.join(shots, '12-print-sheet.png') });
  await page.emulateMedia({ media: 'print' });
  const pdfPath = path.join(shots, 'daily-logs.pdf');
  await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  const pdfPages = (fs.readFileSync(pdfPath, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  const nSheets = await page.$$eval('.sheet', els => els.length);
  if (pdfPages !== nSheets) errors.push(`Print: ${nSheets} sheets produced ${pdfPages} PDF pages (want one page each)`);
  await shot('13-teacher-print-logs');

  // unit plan print: one page per sport
  await page.click('[data-act="print-mode"][data-v="unit"]');
  await page.waitForSelector('.sheet.unit');
  await page.locator('.sheet.unit').first().screenshot({ path: path.join(shots, '13b-print-unit-plan.png') });
  await page.emulateMedia({ media: 'print' });
  const unitPdf = path.join(shots, 'unit-plan.pdf');
  await page.pdf({ path: unitPdf, format: 'A4', printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  const unitPages = (fs.readFileSync(unitPdf, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  const nUnit = await page.$$eval('.sheet.unit', els => els.length);
  if (unitPages !== nUnit) errors.push(`Unit plan: ${nUnit} sheets produced ${unitPages} PDF pages`);
  await page.click('[data-act="print-mode"][data-v="all"]');

  // all sports + section switch
  await page.click('[data-act="t-sport"][data-v=""]');
  await page.waitForSelector('.sheet');
  await page.click('[data-act="t-section"][data-v="Section B"]');
  await page.waitForSelector('.sheet');
  await page.click('[data-act="t-tab"][data-tab="checkins"]');
  await page.waitForSelector('.ok-btn');

  // teacher who is also on the roster: Test as student round trip
  await page.click('[data-act="test-as-on"]');
  await page.waitForSelector('.cp-strip');
  await page.click('[data-act="open-cp"][data-cp="Early"]');
  await page.waitForSelector('.focus-btn');
  await page.click('.focus-grid >> nth=0 >> .focus-btn >> nth=0');
  await page.click('[data-act="cp-save"]');
  await page.waitForSelector('.cp-card:nth-child(1).done');
  await saved();
  await shot('14-teacher-test-as-student');
  await page.click('[data-act="test-as-off"]');
  await page.waitForSelector('.ok-btn');

  // persistence: teacher's engagement rating stuck after reload
  await page.goto(preview + '?role=teacher');
  await page.waitForSelector('.ok-btn');
  await page.click('[data-act="t-sport"][data-v="Net Games"]');
  await page.click('[data-act="t-cp"][data-v="Early"]');
  const persOn = await page.locator(`[data-act="t-pers"][data-student="${name}"].on`).count();
  if (!persOn) errors.push('Personal-skills rating did not persist for ' + name);

  // ── robustness: teacher taps made while writes fail are sent after a reload ──
  await page.goto(preview + '?role=teacher&fail=1');
  await page.waitForSelector('.ok-btn');
  await page.click('[data-act="t-sport"][data-v="Ultimate"]');
  await page.click('[data-act="t-cp"][data-v="Middle"]');
  await page.waitForSelector('[data-act="t-pers"]');
  const offStudent = await page.$eval('[data-act="t-pers"]', e => e.dataset.student);
  await page.click(`[data-act="t-pers"][data-student="${offStudent}"][data-n="3"]`);
  await page.waitForSelector('#banner.show, .savestate.failed', { timeout: 15000 });
  await page.goto(preview + '?role=teacher');
  await page.waitForSelector('.ok-btn');
  await page.click('[data-act="t-sport"][data-v="Ultimate"]');
  await page.click('[data-act="t-cp"][data-v="Middle"]');
  await saved();
  await page.waitForTimeout(300);
  if (!(await page.$(`[data-act="t-pers"][data-student="${offStudent}"][data-n="3"].on`))) errors.push('Teacher tap made offline was not sent after reload');
  // a tap killed before the 900 ms flush is restored from localStorage on the next open
  await page.click(`[data-act="t-pers"][data-student="${offStudent}"][data-n="1"]`);
  await page.evaluate(() => { window.onbeforeunload = null; });
  await page.goto(preview + '?role=teacher', { waitUntil: 'commit' });
  await page.waitForSelector('.ok-btn');
  await page.click('[data-act="t-sport"][data-v="Ultimate"]');
  await page.click('[data-act="t-cp"][data-v="Middle"]');
  await saved();
  await page.waitForTimeout(300);
  if (!(await page.$(`[data-act="t-pers"][data-student="${offStudent}"][data-n="1"].on`))) errors.push('Tap made just before leaving the page was lost');

  // ── coach role: one sport, no Grades, today strip ──
  await page.goto(preview + '?role=coach');
  await page.waitForSelector('.ok-btn');
  if (await page.$('[data-act="t-tab"][data-tab="overview"]')) errors.push('Coach can see the Grades tab');
  if (await page.$('[data-act="t-sport"]')) errors.push('Coach can see the sport picker');
  if (await page.$('[data-act="test-as-on"]')) errors.push('Coach sees Test as student');
  if (await page.$('[data-act="t-expand"]')) errors.push('Coach sees rate-each links');
  const coachSub = await page.$eval('.topbar .sub', e => e.textContent);
  if (!/Table Tennis/.test(coachSub)) errors.push('Coach not locked to their sport: ' + coachSub);
  if (!(await page.$('.today'))) errors.push('Coach has no today/next strip');
  const goto = await page.$('[data-act="t-goto"]');
  if (goto) { await goto.click(); await page.waitForTimeout(100); }
  await shot('15-coach-checkins');
  await page.click('[data-act="t-cp"][data-v="__game"]');
  await page.waitForSelector('.gp-row');
  await shot('16-coach-gameplay');

  await browser.close();

  if (errors.length) { console.error('SMOKE FAILED\n' + errors.join('\n')); process.exit(1); }
  console.log('SMOKE OK — screenshots in dev/shots/');
}
main().catch(e => { console.error(e); process.exit(1); });
