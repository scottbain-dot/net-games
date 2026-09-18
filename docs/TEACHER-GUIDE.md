# Move for Skills — Teacher Guide

Everything lives in **one Google Sheet**. The Sheet holds the unit set-up (sports, key skills, drill progressions, lessons, class lists) and all the data. The student/teacher web page is served *from* that Sheet. Nothing to install, and only **one file** to paste.

Students sign in with their **school Google account**. No PINs.

---

## How the unit works

Every student is in **one sport** for the whole unit. Sections of ~70 are split into sport groups, each with a teacher.

| When | Who | What | Where |
|---|---|---|---|
| L1 | Teacher | Test the 3–4 key skills of the sport, score out of 10, plus the agility baseline | App → **Skill tests** / **Agility test** (phone or laptop) |
| L1 or L2 · **Early check-in** | Student | See scores and stage, pick **one focus skill** (ideally one at *Understanding*), confirm a goal, place themselves on each skill and personal skill | App, on a laptop |
| Every lesson | Student | Work the drill progression for the focus skill; **peer check** each step; **teacher signs the paper log** to move on; one line on the paper log | Paper |
| Every lesson | Teacher | Tap participation 1–3 per student (+ optional note) | App → **Register** |
| L5 · **Middle check-in** | Student | Reflect, update drill step, refocus | App |
| L5 | Teacher | Quick retest of each student's **focus skill only**; rate personal skills | App → **Skill tests** |
| L9 · **End check-in** | Student | Final reflection | App |
| L9 | Teacher | Retest all skills, agility re-test, rate personal skills, final grades | App |

The three **stages** come from the score: 0–3 *Understanding*, 4–7 *Intermediate*, 8–10 *Automatic* (editable on the Config tab).

---

## Part A — first-time set-up (about 15 minutes)

1. **Create a new Google Sheet** (sheets.new). Name it, e.g. `Move for Skills – Grade 7`.
2. **Extensions → Apps Script.** An editor opens with an empty `Code.gs`.
3. Open this link, click on the page, select all (Cmd/Ctrl+A), copy:
   **https://raw.githubusercontent.com/scottbain-dot/net-games/main/dist/Code.gs**
   Back in Apps Script, click inside `Code.gs`, select all, paste over it. Press save. (That one file contains the whole app. If the last line number is under 800, the copy was cut short — try again.)
4. Close the editor tab and **reload the Sheet**.
5. A **PE Tracker** menu appears next to *Help*. Choose **1. Set up tabs**. Google asks you to authorise: *Continue* → your account → *Advanced* → *Go to … (unsafe)* → *Allow*. ("Unsafe" only because you wrote it yourself.) Run **1. Set up tabs** again if it did not finish.
6. Fill in the **Roster** tab: `Section`, `Sport`, `Student`, `Email` (school Google address). One row per student, all sections on the one tab. Delete the two example rows. The sport must match a name on the **Skills** tab exactly.
7. Check **Skills**, **Drills**, **Lessons**, **Focus**, **Outcomes** and **Criteria** — pre-filled with a draft for Net Games, Ultimate, Table Tennis and Handball (see Part C to change them).
8. **PE Tracker → 2. Check roster & config.** Fix anything it lists.
9. **Deploy the web app:** Extensions → Apps Script → **Deploy → New deployment** → gear ⚙ next to *Select type* → **Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone within [your school]** ← this is what lets the app know who each student is
   - **Deploy**, authorise if asked.
10. **PE Tracker → 3. Show app link.** One link for students and teachers.

Add colleagues on the **Teachers** tab (Email, Name, and optionally their Sport so the app opens on their group).

---

## Part B — a colleague starting from your Sheet

1. **File → Make a copy** of the Sheet.
2. In the copy: **PE Tracker → 1. Set up tabs**, authorise when asked.
3. Fill in **Roster**; edit the unit tabs if needed.
4. **Extensions → Apps Script → Deploy → New deployment → Web app** (settings as above). A copied Sheet does not copy the deployment, so this step cannot be skipped.
5. **PE Tracker → 3. Show app link.**

---

## Part C — setting up the unit (any sport)

Everything is a tab. Edit cells; the app updates within a couple of minutes (or immediately after **PE Tracker → Refresh app config now**).

**Skills** — the key skills you test. `Sport`, `Skill`, `Test` (how the 10 attempts are run), `Success` (what counts as one). Three or four per sport. Tests should be countable by a peer and verifiable by you.

**Drills** — the progression for each skill. `Sport`, `Skill`, `Step` (1, 2, 3 …), `Drill`, `Criteria` (what the peer checks before you sign off). Three or four steps per skill. This prints on each student's paper log once they have chosen a focus skill.

**Lessons** — `Number`, `Title`, `Checkpoint` (write `Early`, `Middle`, `End` on the check-in lessons), `Date` (optional, prints on the log), `Sport` (optional; leave blank for all groups).

**Focus** — the agility elements students pick one of each lesson on paper.

**Outcomes** — the personal skills for an independent task (draft: self-management, perseverance, collaboration, independence). `Outcome`, `LooksLike`. Students place themselves at each check-in; you rate them per check-in with one tap each. Use `outcomes` as a criterion's Evidence to grade from them.

**Criteria** — `Code`, `Name`, `Evidence`, `TopBand`. Evidence decides where the *suggested* score comes from:
- `test` → focus-skill improvement (score and stage) averaged with agility improvement
- `reflection` → check-ins done, goal written, self-assessment accuracy, drill progress, reflections
- `participation` → the register
- `skills` → all skill scores at the end
- `outcomes` → your personal-skill ratings
- `none` → you grade from observation

**Config** — `unit_name`, `stage_labels`, `stage_bands`, `score_max`, `participation_labels`, `outcome_labels`, `test_name` / `test_unit` / `test_lower_is_better` / `test_top_gain`, `goal_template`, the two reflection prompts, `show_grades_to_students`.

---

## Part D — running the unit

**L1**
- **Skill tests** → *Early* → type each score. The stage appears next to it. Saves as you type.
- **Agility test** → baselines.
- **Register** → tap participation.

**Early check-in (end of L1 or start of L2, laptops)**
- Students open the link. They see their scores and stages, pick a focus skill (those at *Understanding* are marked *recommended*), a goal is drafted for them to edit, they place themselves on each skill and personal skill, and save.
- Then **Print daily logs** → *Print*. One A4 page per student with their name, focus skill, goal and drill progression with peer/teacher tick boxes. Print after the check-in so the drill card is personalised.

**Every lesson**
- Students work their drill step, get a peer check, and you initial the *Teacher ✓* box on their log to let them move on. They fill in one line.
- You: **Register** → *Mark all unmarked as Regular* → adjust the exceptions.

**Middle check-in (L5)**
- **Skill tests** → *Middle* → retest each student's focus skill only (shown in the *Focus* column). Rate personal skills below.
- Students do their check-in on a laptop: update drill step, reflect, refocus.

**End (L9)**
- **Skill tests** → *End* → all skills. **Agility test** → re-tests. Personal skills.
- Students do the End check-in.
- **Overview & grades** → evidence per student, dashed suggested scores, tap the final grade, ✎ for a comment.
- **PE Tracker → Build grade report tab** writes it all to a `GradeReport` tab.

**Absent student at a check-in?** **Students** → their name → *Enter now* to type it in for them.

---

## Troubleshooting

- **"You are not on the roster yet"** — the email shown is not on the Roster tab. Add or correct it; they reload.
- **"Please sign in with your school Google account"** — private window, personal Gmail, or the deployment's *Who has access* is *Anyone* instead of *Anyone within [school]*.
- **Teacher sees the student view or "Teachers only"** — add their email to **Teachers**.
- **Changes to the unit tabs not showing** — PE Tracker → *Refresh app config now*, then reload the app.
- **I changed the code** — after pasting a new `Code.gs` you must **Deploy → Manage deployments → ✎ → Version: New version → Deploy**. The link stays the same.
- **Stuck on "Loading…" forever** — the paste was cut short. Re-paste from the raw link and check the last line number is over 800, then redeploy as a new version.
