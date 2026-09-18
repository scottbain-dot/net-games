# Move for Skills — PE tracker

A Google-Sheets-backed web app for skill-focused PE units. Each student is in one sport; the teacher tests 3–4 key skills out of 10, which places the student at a stage (Understanding / Intermediate / Automatic). The student picks one focus skill, sets a goal, and works a drill progression on paper with peer checks and teacher sign-off. Three digital check-ins (Early / Middle / End) capture reflection, self-assessment and personal-skill outcomes. An agility test runs alongside every sport.

Teachers paste **one file** (`dist/Code.gs`) into a Sheet's Apps Script and deploy. Full instructions: [docs/TEACHER-GUIDE.md](docs/TEACHER-GUIDE.md).

## Layout

```
apps-script/
  Code.gs      server: config tabs, Google-login identity, batched upserts, evidence & suggested grades, Sheet menu
  Index.html   page shell (Apps Script template)
  Styles.html  CSS
  App.html     client: student dashboard & check-in form, teacher register / tests / agility / students / overview / print
dist/
  Code.gs      GENERATED single-file build of the four above (what teachers paste) — node dev/build-single.js
docs/
  TEACHER-GUIDE.md
dev/
  fake-sheets.js     in-memory stand-in for SpreadsheetApp & co, so Code.gs runs in a browser / Node
  mock-runtime.js    fake google.script.run + example sections seed (browser)
  build-preview.js   builds dev/preview.html from the real app files
  build-single.js    builds dist/Code.gs
  smoke.js           headless Chromium test of the main flows (Playwright)
```

## Developing

```
node dev/build-preview.js                     # dev/preview.html — open ?role=teacher | student | student2 | unknown, &fail=1, &latency=1500, &reset=1
NODE_PATH=$(npm root -g) node dev/smoke.js    # needs playwright + Chromium; screenshots in dev/shots/
node dev/build-single.js                      # regenerate dist/Code.gs — commit it, it's what teachers paste
```

The preview runs the real `Code.gs` against a fake spreadsheet kept in `localStorage`, so server logic (upserts, identity, evidence scoring) is exercised too.

## Data model (Sheet tabs)

Configuration: `Config`, `Lessons`, `Skills`, `Drills`, `Focus`, `Outcomes`, `Criteria`, `Roster` (Section, Sport, Student, Email), `Teachers`.

Data, one row per key, written by the app:

| Tab | Key | Values |
|---|---|---|
| Register | Section, Student, Lesson | Participation 1–3, Note |
| SkillTests | Section, Student, Checkpoint, Skill | Score 0–10 |
| Agility | Section, Student | Baseline, Retest |
| Checkins | Section, Student, Checkpoint | FocusSkill, Goal, DrillStep, AgilityFocus, SelfStages (JSON), WentWell, NextGoal |
| OutcomeRatings | Section, Student, Checkpoint, Outcome | Self 1–3, Teacher 1–3 |
| Grades | Section, Student, Criterion | Score 1–7, Comment |

Writes are upserts under a script lock; each user action is one request. The client keeps an outbox in `localStorage`, tagged with the login that created it, until the server confirms.

## Suggested grades

Computed in `computeOverview_` and shown dashed in the Overview; the teacher sets the final score. Per criterion `Evidence`: `test` = focus-skill gain band averaged with agility band (cohort-handicapped); `reflection` = check-ins, goal, self-assessment accuracy vs tests, drill progress, reflections; `participation` = register level and attendance; `skills` = mean end score; `outcomes` = mean teacher outcome rating.
