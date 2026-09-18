#!/usr/bin/env node
// Builds dev/preview.html: the real Index/Styles/App pages with Code.gs
// running in the browser against a fake spreadsheet. Open it in a browser:
//   node dev/build-preview.js && open dev/preview.html?role=teacher
// See dev/mock-runtime.js for the URL switches (role, as, fail, latency, reset).
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const index = read('apps-script/Index.html');
const styles = read('apps-script/Styles.html');
const app = read('apps-script/App.html');
const code = read('apps-script/Code.gs');
const fake = read('dev/fake-sheets.js');
const mock = read('dev/mock-runtime.js');

const wrap = js => `<script>\n${js}\n</script>`;
let html = index
  .replace("<?!= include('Styles') ?>", styles)
  .replace("<?= classParam ?>", '')
  .replace("<?= viewParam ?>", '')
  .replace("<?!= include('App') ?>", [wrap(fake), wrap(code), wrap(mock), app].join('\n'));

const out = path.join(__dirname, 'preview.html');
fs.writeFileSync(out, html);
console.log('Wrote', path.relative(root, out), `(${(html.length / 1024).toFixed(0)} KB)`);
