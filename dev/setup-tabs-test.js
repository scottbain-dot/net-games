// Checks that PE Tracker → 1 (setupTabs) repairs a Sheet kept from an older
// version: missing Config keys are added (existing values kept), the date
// format lands on the Updated column by NAME, empty v1 tabs are removed and a
// score that was date-formatted reads back as a number. Runs the real Code.gs
// against dev/fake-sheets.js.
const fs = require('fs'); const vm = require('vm'); const path = require('path');
const ctx = { console }; ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'fake-sheets.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);
vm.runInContext(`
  FakeSheets.user = FakeSheets.owner;
  const book = FakeSheets.book;
  const put = (name, rows) => { const s = book.insertSheet(name); s.getRange(1, 1, rows.length, rows[0].length).setValues(rows); return s; };
  // v1 Config: old keys only, one shared key with a custom value
  put('Config', [['Key', 'Value', 'What it does'], ['unit_name', 'Net Games', ''], ['rating_labels', 'a|b|c|d', ''], ['test_name', 'Illinois', ''], ['reflection_prompt_1', 'Custom prompt', '']]);
  // Checkins with the old column order: GamePlay sits where Updated is in this version's layout (column 18)
  const oldCk = ['Section', 'Sport', 'Student', 'Checkpoint', 'FocusSkill', 'Goal', 'DrillStep', 'AgilityFocus', 'SelfStages', 'WentWell', 'NextGoal', 'Updated', 'Engagement', 'Personal', 'Confirmed', 'ExtensionSkill', 'ExtensionDrill', 'GamePlay', 'GameNote'];
  const ck = put('Checkins', [oldCk]);
  put('Checkpoints', [['Class', 'Student']]);
  put('Tests', [['Class', 'Student']]);
  put('Reflections', [['Class', 'Student'], ['7A', 'Someone']]);
  put('Roster', [['Section', 'Sport', 'Student', 'Email'], ['7', 'Net Games', 'Test Kid', 'kid@example.edu']]);

  setupTabs();

  const cfgRows = book.getSheetByName('Config').getDataRange().getValues().slice(1);
  const keys = cfgRows.map(r => r[0]);
  Object.keys(CONFIG_DEFAULTS).forEach(k => { if (keys.indexOf(k) === -1) throw new Error('Config key not added: ' + k); });
  if (keys.filter(k => k === 'unit_name').length !== 1) throw new Error('unit_name duplicated');
  if (keys.indexOf('rating_labels') === -1) throw new Error('old key removed');
  const cfg = buildConfig_();
  if (cfg.unitName !== 'Net Games' || cfg.reflectionPrompts[0] !== 'Custom prompt') throw new Error('existing Config values lost: ' + cfg.unitName + ' / ' + cfg.reflectionPrompts[0]);
  if (cfg.stageLabels.join() !== 'Understanding,Intermediate,Automatic') throw new Error('defaults not applied: ' + cfg.stageLabels);
  console.log('config keys', keys.length, '(added ' + (keys.length - 4) + ')');

  // formats by header name, not position
  const hdr = ck.getRange(1, 1, 1, ck.getLastColumn()).getValues()[0];
  const fmtOf = h => ck.formats[hdr.indexOf(h) + 1];
  if (fmtOf('Updated') !== 'yyyy-mm-dd hh:mm') throw new Error('Updated not date formatted: ' + fmtOf('Updated'));
  if (fmtOf('GamePlay') !== 'General') throw new Error('GamePlay format: ' + fmtOf('GamePlay'));
  if (hdr.indexOf('GamePlay') !== 17) throw new Error('test setup: GamePlay should be column 18');
  console.log('formats OK');

  // obsolete tabs: empty ones removed, one with rows kept
  if (book.getSheetByName('Checkpoints') || book.getSheetByName('Tests')) throw new Error('empty v1 tabs not removed');
  if (!book.getSheetByName('Reflections')) throw new Error('v1 tab with rows was deleted');
  const msg = checkConfig();
  if (msg.indexOf('oauth_client_id on Config is blank') === -1) throw new Error('blank client id not flagged: ' + msg);
  if (msg.indexOf('"Reflections"') === -1) throw new Error('v1 tab with rows not flagged: ' + msg);
  if (msg.indexOf('missing') !== -1) throw new Error('missing keys flagged after setup: ' + msg);
  console.log('obsolete tabs + checkConfig OK');

  // a date-formatted score reads back as the number
  ck.getRange(2, 1, 1, oldCk.length).setValues([['7', 'Net Games', 'Test Kid', 'End', '', '', '', '', '', '', '', '', '', '', '', '', '', new Date(1900, 0, 2), '']]);
  const row = readTab_('Checkins')[0];
  if (row.GamePlay !== 3) throw new Error('date-formatted score read as ' + JSON.stringify(row.GamePlay));
  const later = new Date(2026, 8, 30); ck.getRange(2, 12, 1, 1).setValues([[later]]);
  if (readTab_('Checkins')[0].Updated !== '2026-09-30') throw new Error('real date mangled: ' + readTab_('Checkins')[0].Updated);
  console.log('SETUP TABS OK');
`, ctx);
