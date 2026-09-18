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

  // ── student (Freya, Net Games, has Early + Middle check-ins) ──
  await page.goto(preview + '?role=student&reset=1');
  await page.waitForSelector('.cp-strip');
  await shot('01-student-dashboard');
  await page.click('[data-act="open-cp"][data-cp="End"]');
  await page.waitForSelector('.focus-btn');
  await page.click('.seg3 >> nth=0 >> button >> nth=1');
  await page.click('[data-act="drill-step"][data-n="3"]');
  await page.click('.focus-grid >> nth=1 >> .focus-btn >> nth=2');
  await page.click('[data-act="self-outcome"][data-n="3"] >> nth=0');
  await page.fill('textarea[data-in="wentWell"]', 'My serve is now consistent under pressure.');
  await page.fill('textarea[data-in="nextGoal"]', 'Keep the serve and start on overhead shots.');
  await shot('02-student-checkin-form');
  await page.click('[data-act="cp-save"]');
  await page.waitForSelector('.cp-card:nth-child(3).done');
  await saved();
  const stepText = await page.textContent('.card-head.amber + .card-body .hint');
  if (!/Step reached: 3/.test(stepText || '')) errors.push('Drill step 3 not reflected on dashboard: ' + stepText);
  await shot('03-student-after-save');

  // student2 (no check-in yet) picks a focus skill at Early → goal auto-drafted
  await page.goto(preview + '?role=student2');
  await page.waitForSelector('.cp-strip');
  await page.click('[data-act="open-cp"][data-cp="Early"]');
  await page.waitForSelector('.focus-btn');
  await page.click('.focus-grid >> nth=0 >> .focus-btn >> nth=0');
  await page.waitForSelector('textarea[data-in="goal"]');
  const goal = await page.inputValue('textarea[data-in="goal"]');
  if (!/Move my .* by the Middle check-in/.test(goal)) errors.push('Goal not drafted: ' + goal);
  await shot('04-student-early-checkin');
  await page.click('[data-act="cp-save"]');
  await page.waitForSelector('.cp-card:nth-child(1).done');
  await saved();

  // outbox: writes fail → banner, then reload without fail → drains
  await page.goto(preview + '?role=student&fail=1');
  await page.waitForSelector('.cp-strip');
  await page.click('[data-act="open-cp"][data-cp="Middle"]');
  await page.waitForSelector('.focus-btn');
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

  // ── teacher ──
  await page.goto(preview + '?role=teacher');
  await page.waitForSelector('.reg-row');
  await page.click('[data-act="t-sport"][data-v="Net Games"]');
  await page.waitForSelector('.reg-row');
  await shot('07-teacher-register');
  await page.click('[data-act="reg-all"]');
  await page.click('.reg-row >> nth=0 >> .ppills button[data-n="3"]');
  await page.fill('.reg-row >> nth=0 >> input', 'led warm-up');
  await page.press('.reg-row >> nth=0 >> input', 'Tab');
  await saved();

  await page.click('[data-act="t-tab"][data-tab="tests"]');
  await page.waitForSelector('input[data-in="test"]');
  await page.click('[data-act="t-cp"][data-v="End"]');
  await page.fill('input[data-in="test"] >> nth=0', '9');
  await page.press('input[data-in="test"] >> nth=0', 'Tab');
  await page.click('.cyc >> nth=0'); await page.click('.cyc >> nth=0');
  await saved();
  const pill = await page.textContent('[data-stage-for] >> nth=0');
  if (pill !== 'Automatic') errors.push('Stage pill did not update to Automatic: ' + pill);
  await shot('08-teacher-skill-tests');

  await page.click('[data-act="t-tab"][data-tab="agility"]');
  await page.waitForSelector('.num-in');
  await page.fill('input[data-field="retest"] >> nth=2', '16.2');
  await page.press('input[data-field="retest"] >> nth=2', 'Tab');
  await saved();
  await shot('09-teacher-agility');

  await page.click('[data-act="t-tab"][data-tab="students"]');
  await page.waitForSelector('.student-card');
  await page.click('.student-card >> nth=0');
  await page.waitForSelector('.cp-strip');
  await shot('10-teacher-views-student');
  await page.click('[data-act="t-back"]');

  await page.click('[data-act="t-tab"][data-tab="overview"]');
  await page.waitForSelector('.score-row');
  await page.click('.score-row >> nth=0 >> button[data-n="5"]');
  await page.click('[data-act="grade-comment"] >> nth=0');
  await saved();
  await shot('11-teacher-overview');

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

  // all sports view + section switch
  await page.click('[data-act="t-sport"][data-v=""]');
  await page.waitForSelector('.sheet');
  await page.click('[data-act="t-section"][data-v="Section B"]');
  await page.waitForSelector('.sheet');
  await page.click('[data-act="t-tab"][data-tab="register"]');
  await page.waitForSelector('.reg-row');

  // persistence: register value stuck
  await page.goto(preview + '?role=teacher');
  await page.waitForSelector('.reg-row');
  await page.click('[data-act="t-sport"][data-v="Net Games"]');
  await page.click('[data-act="t-lesson"][data-n="5"]');
  const on = await page.$eval('.reg-row >> nth=0 >> .ppills button.on', b => b.textContent);
  if (on !== 'Excellent') errors.push('Register value did not persist: ' + on);

  await browser.close();
  if (errors.length) { console.error('SMOKE FAILED\n' + errors.join('\n')); process.exit(1); }
  console.log('SMOKE OK — screenshots in dev/shots/');
}
main().catch(e => { console.error(e); process.exit(1); });
