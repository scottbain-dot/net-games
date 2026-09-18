# PE Skill Tracker — Teacher Guide

Everything lives in **one Google Sheet**. The Sheet holds your unit set-up (lessons, sports, skills, class lists) and all the data. The student/teacher web page is served *from* that Sheet. There is nothing to install.

Students sign in with their **school Google account**. No PINs, no passwords to reset.

---

## How the unit works

| When | Who | What | Where |
|---|---|---|---|
| Every lesson | Student | One line on the **paper daily log** (focus, how well, effort, one sentence) | Paper, kept in a folder |
| Every lesson | Teacher | Tap each student once: participation 1–3 (+ optional note) | App → **Register** |
| 3 times per unit (Early / Middle / End) | Student | Rate each skill 1–4, pick the focus element they worked on, two short reflections | App → their dashboard, on a laptop |
| 3 times per unit | Teacher | Rate each student's skills 1–4 | App → **Skill ratings** |
| Twice | Teacher | Fitness test baseline and re-test | App → **Test scores** |
| End | Teacher | Final grades, with suggested scores from the evidence | App → **Overview & grades** |

Students only need a laptop at the three checkpoints. Everything else is paper (students) or the teacher's own device.

---

## Part A — first-time set-up (about 15 minutes)

Do this once per unit copy. If a colleague has already made a template, skip to **Part B**.

1. **Create a new Google Sheet** (sheets.new). Name it, e.g. `PE Tracker – Net Games`.
2. **Extensions → Apps Script.** An editor opens.
3. Delete anything in `Code.gs`. Add these four files, copying the contents from the `apps-script/` folder of this repository (the ⊕ button next to *Files* → *Script* or *HTML*):
   - `Code.gs` (Script)
   - `Index.html` (HTML)
   - `Styles.html` (HTML)
   - `App.html` (HTML)

   File names must match exactly (the editor adds the extension).
4. Click **Save** (💾). Close the editor tab and **reload the Sheet**.
5. A **PE Tracker** menu appears in the Sheet's menu bar. Choose **1. Set up tabs**. The first time, Google asks you to authorise the script: choose your account → *Advanced* → *Go to … (unsafe)* → *Allow*. (It says "unsafe" only because you wrote it yourself.) Run **1. Set up tabs** again after authorising if it did not finish.
6. Fill in the **Roster** tab: one row per student — `Class`, `Student` (name as it should appear), `Email` (their school Google address). Delete the two example rows.
7. Check the **Lessons**, **Skills**, **Focus** and **Criteria** tabs (pre-filled with the Net Games example — see Part C to change them).
8. **PE Tracker → 2. Check roster & config.** Fix anything it lists.
9. **Deploy the web app:** Extensions → Apps Script → **Deploy → New deployment** → click the gear ⚙ next to *Select type* → **Web app**:
   - Description: anything
   - Execute as: **Me**
   - Who has access: **Anyone within [your school]** ← this is what lets the app know who each student is
   - **Deploy**, then authorise if asked.
10. Back in the Sheet: **PE Tracker → 3. Show app link.** Copy the link. That single link is for students *and* teachers.

To add another teacher, put their email on the **Teachers** tab. The Sheet owner is always a teacher.

---

## Part B — a colleague starting from a template

1. Open the template Sheet → **File → Make a copy**.
2. In the copy: **PE Tracker → 1. Set up tabs**, authorise when asked.
3. Fill in the **Roster** tab with your classes.
4. Edit **Lessons / Skills / Focus / Criteria** for your unit (Part C).
5. **Extensions → Apps Script → Deploy → New deployment → Web app** (settings as in Part A step 9). This is the one technical step, and it cannot be skipped — a copied Sheet does not copy the deployment.
6. **PE Tracker → 3. Show app link.** Share it.

---

## Part C — setting up a different unit or sport

Everything is a tab in the Sheet. Edit cells; the app updates within a couple of minutes (or immediately after **PE Tracker → Refresh app config now**).

**Lessons** — one row per lesson.
- `Number` — 1, 2, 3 …
- `Title` — what the lesson is about
- `Sport` — must match a sport on the **Skills** tab (blank for tests/intro; "Choice" is fine)
- `Checkpoint` — write `Early`, `Middle` or `End` on the lessons where students enter their ratings (you can use any names, and 2 or 4 checkpoints instead of 3)
- `Date` — optional, appears on the paper log

**Skills** — one row per skill.
- `Sport` — e.g. Badminton, Volleyball, Basketball, Athletics
- `Skill` — e.g. Serve accuracy
- `Cue` — one line describing what "consistent" looks like (shown to students)

Add as many sports as you like. Four sports → four sections on the checkpoint form and the dashboard.

**Focus** — the elements a student picks one of each lesson (on paper) and reports at checkpoints. Default is the eight agility elements. Replace with anything: fitness components, tactical ideas, character strengths.

**Criteria** — the rubric strands you grade.
- `Code` / `Name` — e.g. S1 / Skill development (or A / Knowing and understanding)
- `Evidence` — where the *suggested* score comes from. One of:
  - `test` → improvement between baseline and re-test
  - `reflection` → checkpoints entered, reflections written, variety of focus
  - `participation` → the register
  - `skills` → your own skill ratings at the latest checkpoint
  - `none` → no suggestion, you grade from observation
- `TopBand` — the 6–7 descriptor, shown as a reminder

**Config** — single settings:
- `unit_name`, `rating_labels` (the 4 levels), `participation_labels` (the 3 levels)
- `test_name`, `test_unit`, `test_lower_is_better` (TRUE for times), `test_top_gain` (improvement that earns a 7)
- `checkpoint_scope` — `all` (students rate every sport every time, so progress reads side by side) or `played` (only sports played so far)
- `reflection_prompt_1`, `reflection_prompt_2`
- `show_grades_to_students` — TRUE to show final grades on the student dashboard

---

## Part D — running a lesson

**Before the unit**
- App → **Print daily logs** → *Print*. One A4 page per student, generated from your Lessons tab. Keep them in a class folder.
- Enter fitness test baselines under **Test scores** when you have them.

**Every lesson (2 minutes, your phone or laptop)**
- App → **Register** → the current lesson is pre-selected → *Mark all unmarked as "Regular"* → adjust the exceptions → type a note where useful. It saves by itself.
- Students write one line on their paper log at the end of the lesson.

**Checkpoint lessons (laptops out, ~10 minutes)**
- Students open the link, sign in, and see their dashboard with the next checkpoint highlighted. They rate each skill, pick their focus element and answer two questions, then **Save checkpoint**.
- If the wifi drops, the app keeps the entry on that laptop and sends it when the connection returns; the student sees a yellow banner and can carry on.
- Absent student? Open **Students** → their name → *Enter now* to type it in for them later.

**After each checkpoint**
- **Skill ratings** → pick the checkpoint and sport → tap each cell (1 → 4 → blank). *Fill blanks from self-ratings* is a quick start you then correct.

**End of unit**
- **Overview & grades** shows every piece of evidence per student and a dashed *suggested* score per criterion. Tap the final score, ✎ for a comment.
- **PE Tracker → Build grade report tab** writes all of it to a `GradeReport` tab for your records or reporting system.

---

## Troubleshooting

- **A student sees "You are not on the roster yet"** — the email they are signed in with is not on the Roster tab. The page shows the exact address; add it (or fix the typo) and ask them to reload.
- **"Please sign in with your school Google account"** — the app could not see who they are. Usually a private window, a personal Gmail, or the deployment's *Who has access* is set to *Anyone* instead of *Anyone within [school]*.
- **A teacher sees the student view / "Teachers only"** — add their email to the **Teachers** tab.
- **Changes to Lessons/Skills not showing** — PE Tracker → *Refresh app config now*, then reload the app.
- **I changed the code** — after editing in Apps Script you must **Deploy → Manage deployments → ✎ → Version: New version → Deploy**, otherwise students keep seeing the old version. The link stays the same.
- **Data tabs (Register, Checkpoints, …)** — you can read and filter them freely. Avoid editing while a class is using the app; if you must, keep the column headers and the `Class`/`Student` spellings exactly as on the Roster.
