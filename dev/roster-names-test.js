// Two different students with the same first name in a section clash (records
// are keyed by section + name); the same email twice is a duplicate row.
// Check roster & config tells them apart and 2b renames the clashes from the
// email's surname part. Runs the real Code.gs against dev/fake-sheets.js.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'fake-sheets.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
vm.runInContext(`
  FakeSheets.user = FakeSheets.owner;
  setupTabs();
  const roster = FakeSheets.book.getSheetByName('Roster');
  roster.getRange(2, 1, roster.getLastRow() - 1, 4).clearContent();
  roster.getRange(2, 1, 9, 4).setValues([
    ['8', 'Net Games', 'Leo', 'leo_kim@example.edu'],
    ['8', 'Handball', 'Leo', 'leo_park@example.edu'],
    ['8', 'Ultimate', 'Leo', 'leo_kang@example.edu'],      // K clashes with Kim → full surnames
    ['7', 'Net Games', 'Hangyul', 'hangyul_kim@example.edu'],
    ['7', 'Net Games', 'Hangyul', 'hangyul_kim@example.edu'], // same student twice
    ['7', 'Ultimate', 'anna', 'anna@example.edu'],           // no surname in email
    ['7', 'Handball', 'Anna', 'anna.lee@example.edu'],
    ['7', 'Table Tennis', 'Grace', 'grace_wu@example.edu'],
    ['8', 'Table Tennis', 'Grace', 'grace_li@example.edu'],  // other section: no clash
  ]);
  const msg = checkConfig();
  console.log(msg.split('\\n').filter(l => /Roster|called/.test(l)).join('\\n'));
  if (!/hangyul_kim@example.edu is on the Roster 2 times/.test(msg)) throw new Error('duplicate row not reported as such');
  if (/students called "Hangyul"/.test(msg)) throw new Error('duplicate row reported as a name clash');
  if (!/3 different students called "Leo" in section 8 .* Leo → Leo Kim, Leo → Leo Park, Leo → Leo Kang/.test(msg)) throw new Error('Leo suggestion wrong: ' + msg);
  if (!/2 different students called "anna" in section 7 .* Rename: Anna → Anna L \\(/.test(msg)) throw new Error('anna suggestion wrong: ' + msg);
  if (/called "Grace"/.test(msg)) throw new Error('Grace in different sections is not a clash');

  const out = fixDuplicateNames();
  console.log(out);
  const names = roster.getDataRange().getValues().slice(1).map(r => r[2]);
  if (names.slice(0, 3).join() !== 'Leo Kim,Leo Park,Leo Kang') throw new Error('Leos not renamed: ' + names);
  if (names[3] !== 'Hangyul' || names[4] !== 'Hangyul') throw new Error('duplicate rows must not be renamed');
  if (names[5] !== 'anna' || names[6] !== 'Anna L') throw new Error('anna group: ' + names[5] + ' / ' + names[6]);
  if (names[7] !== 'Grace' || names[8] !== 'Grace') throw new Error('Grace renamed');
  if (/Could not suggest/.test(out)) throw new Error('anna clash is resolved by renaming Anna Lee: ' + out);
  if (/called "anna"/i.test(checkConfig())) throw new Error('anna clash survived');
  const again = checkConfig();
  if (/called "Leo"/.test(again)) throw new Error('Leo clash survived the fix');
  // renamed students still sign in and see their own row
  FakeSheets.user = 'leo_park@example.edu';
  const b = bootstrap();
  if (b.identity.name !== 'Leo Park' || b.identity.section !== '8') throw new Error('renamed student identity: ' + JSON.stringify(b.identity));
  console.log('ROSTER NAMES OK');
`, ctx);
