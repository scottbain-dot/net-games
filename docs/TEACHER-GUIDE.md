# Move for Skills — Teacher Guide

Everything lives in **one Google Sheet**. The Sheet holds the unit set-up (sports, key skills, drill progressions, lessons, class lists) and all the data. The student/teacher web page is served *from* that Sheet. Nothing to install, and only **one file** to paste.

Students sign in with their **school Google account**. No PINs.

---

## The unit in one page

Every student is in **one sport** for the whole unit. A section of ~70 is split into sport groups, each with a teacher. Paper is the daily record; the laptop comes out three times.

| Lesson | Student | Teacher |
|---|---|---|
| **L1** | Skill tests in pairs (peer counts 10 attempts), scores written on the paper log | Watches, spot-checks. Runs the agility test and writes the times down. |
| **Early check-in** (end of L1 or start of L2, laptops, ~8 min) | Types the 4 scores from paper, picks **one** focus skill (the lowest is recommended), edits the drafted goal, picks an agility element, answers one question | Same day, phone or laptop, ~3 min: **Check-ins → Early**. Glance at each row, fix a wrong score, type the agility baseline, tap ✓, rate engagement and personal skills. Then **Print logs**. |
| **L2–L4** | Works the drill progression on the paper card; peer check each step; one line on the log | Circulates; **signs the paper** to let a student move to the next drill step. **No app.** |
| **Middle check-in** (L5, laptops) | Types the focus-skill retest score, taps the drill step reached, places themselves, one reflection | **Check-ins → Middle**: check the retest, ✓, engagement, personal skills. |
| **L6–L8** | Paper only | Paper only |
| **End check-in** (L9) | Taps drill step, places themselves on the focus skill, personal-skill self-rating, two reflections | **Check-ins → End**: **you** type each student's final retest of their focus skill and their agility re-test, ✓, engagement, personal skills. |
| After | — | **Grades**: *Accept all suggested*, then adjust the ones you disagree with, add comments. **PE Tracker → Build grade report tab**. |

The three **stages** come from the score out of 10: 0–3 *Understanding*, 4–7 *Intermediate*, 8–10 *Automatic* (editable on Config).

---

## Assessment: what counts, and who records it

The rule: **nothing self-reported feeds the skill-improvement grade.** Students type numbers only where inflating them would hurt them or where you confirm.

| Criterion | Evidence the app uses for the *suggested* score | Recorded by |
|---|---|---|
| **S1 Skill development** | Focus-skill gain: Early score → End retest, in points and in stage. Plus agility change, baseline → re-test, with a handicap so fast starters aren't penalised. Averaged. | Early score: student types, **teacher confirms**. End retest: **teacher**. Agility: **teacher**, both times. |
| **S2 Skill identification** | Check-ins completed · chose a skill at *Understanding* · goal written · drill steps progressed (teacher-signed on paper) · self-placement matches the confirmed score · reflections written | Student, against teacher-confirmed data. Read the reflections in **Students** when finalising. |
| **S4 Active participation** | Engagement rating at each check-in (1–3), plus personal-skills rating | **Teacher**, three taps per student per unit. Paper log with your initials is the backing evidence. |

Suggested scores are a starting point. The final grade is always your tap.

Two fairness notes built in:
- A student who picks a skill already at *Intermediate* has less room to gain. The app flags "not at Understanding" in Grades, and stage gains carry a bonus so a genuine step up still scores well.
- A student who under-reports an Early score to inflate their gain is caught at your ✓, and the End retest is yours anyway.

---

## Part A — first-time set-up (about 15 minutes)

1. **Create a new Google Sheet** (sheets.new). Name it, e.g. `Move for Skills – Grade 7`.
2. **Extensions → Apps Script.** An editor opens with an empty `Code.gs`.
3. Open this link, click on the page, select all (Cmd/Ctrl+A), copy:
   **https://raw.githubusercontent.com/scottbain-dot/net-games/main/dist/Code.gs**
   Back in Apps Script, click inside `Code.gs`, select all, paste over it. Save. (That one file is the whole app. If the last line number is under 800, the copy was cut short.)
4. Close the editor tab and **reload the Sheet**.
5. A **PE Tracker** menu appears next to *Help*. Choose **1. Set up tabs**. Authorise: *Continue* → your account → *Advanced* → *Go to … (unsafe)* → *Allow*. Run **1. Set up tabs** again if it did not finish.
6. Fill in the **Roster** tab: `Section`, `Sport`, `Student`, `Email` (school Google address). One row per student, all sections on the one tab. The sport must match a name on the **Skills** tab exactly. Extra columns (e.g. a Teacher column for your own reference) are ignored.
7. Check **Skills**, **Drills**, **Lessons**, **Focus**, **Outcomes**, **Criteria** — pre-filled with a draft for Net Games, Ultimate, Table Tennis and Handball (see Part C).
8. **PE Tracker → 2. Check roster & config.** Fix anything it lists.
9. **Deploy:** Extensions → Apps Script → **Deploy → New deployment** → gear ⚙ → **Web app**: Execute as **Me**; Who has access **Anyone within [your school]** (this is what lets the app know who each student is) → **Deploy**.
10. **PE Tracker → 3. Show app link.** One link for students and teachers. If it ever says "unable to open the file", copy the URL from **Deploy → Manage deployments** instead.

Add colleagues on the **Teachers** tab (Email, Name, and optionally their Sport so the app opens on their group). A teacher who is also on the Roster gets a **Test as student** button.

---

## Part B — a colleague starting from your Sheet

1. **File → Make a copy** of the Sheet.
2. In the copy: **PE Tracker → 1. Set up tabs**, authorise when asked.
3. Fill in **Roster**; edit the unit tabs if needed.
4. **Extensions → Apps Script → Deploy → New deployment → Web app** (settings as above). A copied Sheet does not copy the deployment.
5. **PE Tracker → 3. Show app link.**

---

## Part C — setting up the unit (any sport)

Everything is a tab. Edit cells; the app updates within a couple of minutes (or immediately after **PE Tracker → Refresh app config now**).

- **Skills** — `Sport`, `Skill`, `Test` (how the 10 attempts run), `Success` (what counts as one). Three or four per sport. Tests should be countable by a peer.
- **Drills** — `Sport`, `Skill`, `Step`, `Drill`, `Criteria` (what the peer checks before you sign). Three or four steps per skill. Prints on the student's paper log once they have a focus skill.
- **Lessons** — `Number`, `Checkpoint` (write `Early`, `Middle`, `End` on the check-in lessons), `Date` (optional, prints on the log). No titles: what happens in a lesson is up to you.
- **Focus** — the agility elements students pick one of each lesson on paper.
- **Outcomes** — personal skills for an independent task. `Outcome`, `LooksLike`. Students self-rate at the End check-in; you give one overall rating per check-in (expand a row for per-outcome detail).
- **Criteria** — `Code`, `Name`, `Evidence`, `TopBand`. Evidence is one of `test`, `reflection`, `participation`, `skills`, `outcomes`, `none` (see the assessment table).
- **Config** — `unit_name`, `stage_labels`, `stage_bands`, `score_max`, `participation_labels`, `outcome_labels`, `test_name` / `test_unit` / `test_lower_is_better` / `test_top_gain`, `goal_template`, `reflection_prompt_early`, the two later prompts, `show_grades_to_students`, and `daily_register` (TRUE adds a per-lesson register tab if you want one; off by default).

---

## Troubleshooting

- **"You are not on the roster yet"** — the email shown is not on the Roster tab. Add or correct it; they reload.
- **"Please sign in with your school Google account"** — private window, personal Gmail, or the deployment's *Who has access* is *Anyone* instead of *Anyone within [school]*.
- **"Sorry, unable to open the file at this time"** — use the URL from **Deploy → Manage deployments**; it should look like `script.google.com/a/macros/<school>/s/…/exec`.
- **Teacher sees the student view or "Teachers only"** — add their email to **Teachers**.
- **Changes to the unit tabs not showing** — PE Tracker → *Refresh app config now*, then reload the app.
- **I pasted a new Code.gs** — **Deploy → Manage deployments → ✎ → Version: New version → Deploy**, otherwise the old version stays live. The link stays the same. (The `/dev` link under *Test deployments* always runs the latest saved code.)
- **Stuck on "Loading…" forever** — the paste was cut short. Re-paste and check the last line number, then redeploy.
