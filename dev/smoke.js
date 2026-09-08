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
  const shot = name => page.screenshot({ path: path.join(shots, name + '.png'), fullPage: true });
  const saved = async () => { await page.waitForFunction(() => { const s = document.querySelector('#savestate'); return s && /All saved/.test(s.textContent); }, null, { timeout: 8000 }); };

  // ── student ──
  await page.goto(preview + '?role=student&reset=1');
  await page.waitForSelector('.cp-strip');
  await shot('01-student-dashboard');
  await page.click('[data-act="open-cp"][data-cp="Middle"]');
  await page.waitForSelector('.seg');
  await page.click('.seg[data-key="Badminton|Serve accuracy"] button[data-n="3"]');
  await page.click('.focus-btn >> nth=1');
  await page.fill('textarea[data-in="wentWell"]', 'Serve is landing deep now.');
  await page.fill('textarea[data-in="nextGoal"]', 'Work on drop shots.');
  await shot('02-student-checkpoint-form');
  await page.click('[data-act="cp-save"]');
  await page.waitForSelector('.cp-card.done >> nth=1');
  await saved();
  const chipText = await page.textContent('table.tbl tbody tr:nth-child(2) td:nth-child(3)');
  if (!/3/.test(chipText)) errors.push('Middle self-rating 3 not shown in progress table: ' + chipText);
  await shot('03-student-after-save');

  // outbox: writes fail → banner, then reload without fail → drains
  await page.goto(preview + '?role=student&fail=1');
  await page.waitForSelector('.cp-strip');
  await page.click('[data-act="open-cp"][data-cp="End"]');
  await page.click('.seg[data-key="Volleyball|Serve accuracy"] button[data-n="4"]');
  await page.click('[data-act="cp-save"]');
  await page.waitForSelector('#banner.show');
  await shot('04-student-outbox-failed');
  await page.goto(preview + '?role=student');
  await page.waitForSelector('.cp-strip');
  await saved();
  try { await page.waitForSelector('.cp-card:nth-child(3).done', { timeout: 8000 }); }
  catch (e) { errors.push('Outbox did not re-send the End checkpoint after reload'); }

  // unknown / anonymous
  await page.goto(preview + '?role=unknown');
  await page.waitForSelector('.notice');
  await shot('05-unknown-user');
  await page.goto(preview + '?role=anon');
  await page.waitForSelector('.notice');

  // ── teacher ──
  await page.goto(preview + '?role=teacher');
  await page.waitForSelector('.reg-row');
  await shot('06-teacher-register');
  await page.click('[data-act="reg-all"]');
  await page.click('.reg-row >> nth=0 >> .ppills button[data-n="3"]');
  await page.fill('.reg-row >> nth=0 >> input', 'led warm-up');
  await page.press('.reg-row >> nth=0 >> input', 'Tab');
  await saved();
  await page.click('[data-act="t-tab"][data-tab="checkpoints"]');
  await page.waitForSelector('.cyc');
  await page.click('.cyc >> nth=0'); await page.click('.cyc >> nth=0');
  await page.click('[data-act="tr-copy-self"]');
  await saved();
  await shot('07-teacher-skill-ratings');
  await page.click('[data-act="t-tab"][data-tab="tests"]');
  await page.waitForSelector('.num-in');
  await page.fill('input[data-field="retest"] >> nth=6', '16.2');
  await page.press('input[data-field="retest"] >> nth=6', 'Tab');
  await saved();
  await shot('08-teacher-tests');
  await page.click('[data-act="t-tab"][data-tab="students"]');
  await page.waitForSelector('.student-card');
  await shot('09-teacher-students');
  await page.click('.student-card >> nth=0');
  await page.waitForSelector('.cp-strip');
  await shot('10-teacher-views-student');
  await page.click('[data-act="t-back"]');
  await page.click('[data-act="t-tab"][data-tab="overview"]');
  await page.waitForSelector('.score-row');
  await page.click('.score-row >> nth=0 >> button[data-n="5"]');
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
  const nStudents = await page.$$eval('.sheet', els => els.length);
  if (pdfPages !== nStudents) errors.push(`Print: ${nStudents} sheets produced ${pdfPages} PDF pages (want one page each)`);
  await shot('12-teacher-print-logs');
  await page.click('[data-act="t-class"][data-cls="8A"]');
  await page.waitForSelector('.sheet');
  await page.click('[data-act="t-tab"][data-tab="register"]');
  await page.waitForSelector('.reg-row');

  // verify persistence: reload as teacher and check the register value stuck
  await page.goto(preview + '?role=teacher');
  await page.waitForSelector('.reg-row');
  await page.click('[data-act="t-lesson"][data-n="5"]');
  const on = await page.$eval('.reg-row >> nth=0 >> .ppills button.on', b => b.textContent);
  if (on !== 'Excellent') errors.push('Register value did not persist: ' + on);

  await browser.close();
  if (errors.length) { console.error('SMOKE FAILED\n' + errors.join('\n')); process.exit(1); }
  console.log('SMOKE OK — screenshots in dev/shots/');
}
main().catch(e => { console.error(e); process.exit(1); });
