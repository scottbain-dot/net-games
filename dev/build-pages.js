#!/usr/bin/env node
// Builds the GitHub Pages front end: docs/index.html (the same Styles + App as
// the Apps Script page, plus Google sign-in and a JSON transport) and, if it
// does not exist yet, docs/config.js where the school's API URL and OAuth client
// ID go. GitHub Pages is pointed at the docs/ folder of the main branch.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const styles = read('apps-script/Styles.html');
const app = read('apps-script/App.html');
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Move for Skills</title>
${styles}
</head>
<body>
<div class="banner" id="banner"></div>
<div id="app"><div class="loading"><div class="spinner"></div> Loading…</div></div>
<div class="toast" id="toast"></div>
<script src="config.js"></script>
<script>
var URL_SECTION = new URLSearchParams(location.search).get('section') || '';
var URL_VIEW = new URLSearchParams(location.search).get('view') || '';
</script>
<script src="https://accounts.google.com/gsi/client" async defer></script>
${app}
</body>
</html>
`;
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'docs/index.html'), html);
fs.writeFileSync(path.join(root, 'docs/.nojekyll'), '');
const cfgPath = path.join(root, 'docs/config.js');
if (!fs.existsSync(cfgPath)) fs.writeFileSync(cfgPath, `// Filled in once per school. Both values are safe to publish.
window.MFS_CONFIG = {
  // Extensions → Apps Script → Deploy → Manage deployments → Web app URL (ends in /exec)
  api: '',
  // Google Cloud console → APIs & Services → Credentials → OAuth client ID (Web application)
  clientId: '',
  unitName: 'Move for Skills'
};
`);
console.log('Wrote docs/index.html', `(${(html.length / 1024).toFixed(0)} KB)`);
