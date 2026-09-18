# PE Skill Tracker

A Google-Sheets-backed web app for PE units: students self-assess at three checkpoints (Early / Middle / End), teachers keep a one-tap register and rate skills, and both see progress side by side. Daily logging is on paper, generated from the same configuration. Any sport, any number of classes, one copyable Sheet per teacher.

This replaced the 2025 Net Games tracker (per-lesson logging of every skill, PIN logins, one HTML file per class). The reasoning and the design decisions are in the history of this repository.

## Layout

```
apps-script/
  Code.gs      server: config tabs, Google-login identity, batched writes, evidence, Sheet menu
  Index.html   page shell (Apps Script template)
  Styles.html  CSS
  App.html     client: student dashboard, checkpoint form, teacher views, print sheets
docs/
  TEACHER-GUIDE.md   set-up and day-to-day use, written for non-technical colleagues
dev/
  fake-sheets.js     in-memory stand-in for SpreadsheetApp & co, so Code.gs runs in a browser / Node
  mock-runtime.js    fake google.script.run + example class seed (browser)
  build-preview.js   builds dev/preview.html from the real app files
  smoke.js           headless Chromium test of the main flows (Playwright)
```

## Deploying

The four files in `apps-script/` are pasted into the Apps Script project bound to a Google Sheet and deployed as a web app with *Execute as: Me* and *Who has access: Anyone within <school domain>*. Full steps in [docs/TEACHER-GUIDE.md](docs/TEACHER-GUIDE.md).

After changing code, redeploy as a **new version** of the existing deployment so the link stays the same.

## Developing

```
node dev/build-preview.js          # writes dev/preview.html
xdg-open dev/preview.html?role=teacher   # or ?role=student, ?role=unknown, &fail=1, &latency=1500, &reset=1
NODE_PATH=$(npm root -g) node dev/smoke.js   # needs playwright + Chromium; screenshots in dev/shots/
```

The preview runs the real `Code.gs` against a fake spreadsheet kept in `localStorage`, so server logic (upserts, identity, evidence scoring) is exercised too. `&fail=1` makes every write fail, to test the outbox.

## Data model (Sheet tabs)

Configuration, edited by the teacher: `Config`, `Lessons`, `Skills`, `Focus`, `Criteria`, `Roster`, `Teachers`.

Data, written by the app, one row per key:

| Tab | Key | Values |
|---|---|---|
| Register | Class, Student, Lesson | Participation 1–3, Note |
| Checkpoints | Class, Student, Checkpoint, Sport, Skill | Self 1–4, Teacher 1–4 |
| Reflections | Class, Student, Checkpoint | Focus, WentWell, NextGoal |
| Tests | Class, Student | Baseline, Retest |
| Grades | Class, Student, Criterion | Score 1–7, Comment |

Writes are upserts under a script lock; each user action is one request (a whole checkpoint, a whole register lesson, a batch of ratings). The client keeps an outbox in `localStorage`, tagged with the login that created it, until the server confirms.

## Why these choices

- **Google login, not PINs** — removes the PIN reset flow and wrong-name taps; the roster's Email column is the only identity mapping.
- **One write per action, not per tap** — last year's per-tap writes queued behind a global lock and timed out in class. Volume is now a few hundred requests per unit for 150 students, not ~15,000.
- **Paper daily log + three digital checkpoints** — no laptops in the gym except at checkpoints; the log sheet is generated from the Lessons tab so it always matches the unit.
- **Served from the Sheet** — a colleague copies the Sheet and deploys; there is no separate hosting, build step, or URL to paste into code.
