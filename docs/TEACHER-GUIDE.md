# Move for Skills — Teacher Guide

Everything lives in **one Google Sheet**. The Sheet holds the unit set-up (sports, key skills, drill progressions, lessons, class lists) and all the data. The student/teacher web page is served *from* that Sheet. Nothing to install, and only **one file** to paste.

Students sign in with their **school Google account**. No PINs.

---

## The unit in one page

Every student is in **one sport** for the whole unit. A section of ~70 is split into sport groups, each with a teacher. Paper is the daily record; the laptop comes out three times. Each sport has **three key skills**, one of which is a stretch test so a proficient player still has something to work on.

| Lesson | Student | Teacher |
|---|---|---|
| **Before L1** | — | **Print → Unit plan** for each sport and hand it to the teacher taking that group to check. Then **Print → One sheet per student**: every sheet carries the three tests, a blank focus-skill line and all three skills' drill progressions, so one sheet lasts the whole unit. |
| **L1** | The three skill tests in pairs (a partner counts 10 attempts), scores written on the paper log; writes the chosen focus skill on the sheet | Watches, spot-checks |
| **Early check-in** (end of L1 or start of L2, laptops, ~8 min) | Types the three scores from paper, picks **one** focus skill (the lowest is recommended), edits the drafted goal, answers one question | Same day, phone or laptop, ~3 min: **Check-ins → Early**. Glance at each row, fix a wrong score, tap ✓, rate personal skills (one tap: Not yet / Sometimes / Consistently). |
| **L2–L4** | Works the drill progression on the paper card; a partner initials each step; you sign and date it; ticks the three personal skills; one line | Circulates; **signs the paper** to let a student move to the next step. **No app.** |
| **Middle check-in** (L5, laptops) | Retests the focus skill (partner counts), types the score, taps the drill step reached, places themselves, one reflection. **Finished every step?** Chooses an extension skill and drill. | **Check-ins → Middle**: check the retest, ✓, personal skills. |
| **L6–L8** | Paper only. Last two lessons: game play. | Paper only. In the **last two lessons** open **Check-ins → Game play**: one row per student with their focus skill and four big buttons (7 · 6–5 · 4–3 · 2–1) plus an optional one-line note. Tap as you watch; it saves itself. |
| **End check-in** (L9) | Taps drill step, places themselves on the focus skill, personal-skill self-rating, two reflections | **Check-ins → End** is your final assessment: type the final retest, ✓, personal skills. The game-play level you tapped is shown on the row (tap to change it). |
| After | — | **Grades**: one card per student showing the evidence for each criterion (game-play level, retest scores, check-ins, the reflections themselves, personal-skills ratings) next to a 1–7 row. *Accept all suggested*, then adjust the ones you disagree with and add comments. "X of N graded" and an *Ungraded only* switch keep track. **PE Tracker → Build grade report tab**. |

The three **stages** come from the score out of 10: 0–3 *Understanding*, 4–7 *Intermediate*, 8–10 *Automatic* (editable on Config).

---

## Assessment: what counts, and who records it

The rule: **nothing self-reported feeds the skill grade.** Students type numbers only where inflating them would hurt them or where you confirm.

| Criterion | Evidence the app uses for the *suggested* score | Recorded by |
|---|---|---|
| **S1 Skill development** | Your **game-play assessment** of the focus skill in the last two lessons (7 / 6–5 / 4–3 / 2–1 → suggested 7 / 6 / 4 / 2). Where you have not entered one, the focus-skill gain from the confirmed Early score to your End retest stands in. | **Teacher.** Early score: student types, teacher confirms. |
| **S2 Skill identification** | Check-ins completed · chose a skill at *Understanding* · goal written · drill steps progressed (signed on paper) · extension chosen when the progression is done · self-placement matches the confirmed score · reflections | Student, against teacher-confirmed data. The reflections are shown on each student's grade card. |
| **S4 Active participation** | Your personal-skills rating at each check-in (self-management, perseverance, collaboration: Not yet / Sometimes / Consistently). Tap *rate each* on a row to rate the three separately. | **Teacher**, three taps per student per unit. The paper log's daily ticks and your initials are the backing evidence. |

Suggested scores are a starting point. The final grade is always your tap.

Two fairness notes built in:
- A student who picks a skill already at *Intermediate* has less room to gain. The app flags "not at Understanding" in Grades, and the stretch test gives strong players a real target.
- The game-play level is yours alone, so a student cannot talk their way up S1.

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
7. Check **Skills**, **Drills**, **Lessons**, **Outcomes**, **Criteria** — pre-filled with a draft for Net Games, Ultimate, Table Tennis and Handball (see Part C). If your Sheet is from an earlier version, delete the old **Focus** tab and the *Independence* row on Outcomes.
8. **PE Tracker → 2. Check roster & config.** Fix anything it lists.
9. **Deploy:** Extensions → Apps Script → **Deploy → New deployment** → gear ⚙ → **Web app**: Execute as **Me**; Who has access **Anyone within [your school]** (this is what lets the app know who each student is) → **Deploy**.
10. **PE Tracker → 3. Show app link.** One link for students and teachers. If it ever says "unable to open the file", copy the URL from **Deploy → Manage deployments** instead.

Add colleagues on the **Teachers** tab (Email, Name, Sport, Role). Sport makes the app open on their group. Put `coach` in **Role** for an outside instructor or anyone who only runs a group: they see their sport only, no Grades tab, no *Test as student*, and a one-line "today / next up" strip telling them what the app needs from them. Give them [docs/COACH-CARD.md](COACH-CARD.md) and the **Print → Unit plan** page for their sport. An outside coach still needs a school Google account to sign in. A teacher who is also on the Roster gets a **Test as student** button.

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

- **Skills** — `Sport`, `Skill`, `Test` (how the 10 attempts run), `Success` (what counts as one). **Three per sport**, one of them a stretch test that challenges a proficient player. Tests must be countable by a partner.
- **Drills** — `Sport`, `Skill`, `Step`, `Drill`, `Criteria` (the "done when" line a partner checks before you sign). Three or four steps per skill. All three skills' progressions print on the paper log from day one (the focus skill is starred once chosen), with an extension row underneath.
- **Lessons** — `Number`, `Checkpoint` (write `Early`, `Middle`, `End` on the check-in lessons), `Date` (optional, prints on the log and drives the "Today · lesson N" strip at the top of the teacher view; without dates the strip shows the next check-in that still has rows to check). No titles: what happens in a lesson is up to you.
- **Outcomes** — personal skills for an independent task: self-management, perseverance, collaboration. `Outcome`, `LooksLike`. Students tick them daily on paper and self-rate at the End check-in; you give one rating per check-in (tap *rate each* on a row for per-outcome detail).
- **Criteria** — `Code`, `Name`, `Evidence`, `TopBand`. Evidence is one of `test`, `reflection`, `participation`, `skills`, `outcomes`, `none` (see the assessment table).
- **Config** — `unit_name`, `stage_labels`, `stage_bands`, `score_max`, `participation_labels`, `outcome_labels`, `game_levels` / `game_level_scores`, `goal_template`, `reflection_prompt_early`, the two later prompts, `show_grades_to_students`, and `daily_register` (TRUE adds a per-lesson register tab if you want one; off by default).

## When a whole class saves at once

Each check-in is one request, and Google runs them one after another, about half a second each. Seventy students saving in the same minute clears in about a minute. If the server is busy, a student sees "Saved — sending in the background", goes back to their dashboard, and the app keeps retrying quietly; nothing is lost even if they close the laptop, because the entry is kept on that device until it gets through. Ask students not to reload while the yellow banner is showing.

---

## Troubleshooting

- **"You are not on the roster yet"** — the email shown is not on the Roster tab. Add or correct it; they reload.
- **"Please sign in with your school Google account"** — private window, personal Gmail, or the deployment's *Who has access* is *Anyone* instead of *Anyone within [school]*.
- **"Sorry, unable to open the file at this time"** — use the URL from **Deploy → Manage deployments**; it should look like `script.google.com/a/macros/<school>/s/…/exec`.
- **Teacher sees the student view or "Teachers only"** — add their email to **Teachers**.
- **Changes to the unit tabs not showing** — PE Tracker → *Refresh app config now*, then reload the app.
- **I pasted a new Code.gs** — **Deploy → Manage deployments → ✎ → Version: New version → Deploy**, otherwise the old version stays live. The link stays the same. (The `/dev` link under *Test deployments* always runs the latest saved code.)
- **Stuck on "Loading…" forever** — the paste was cut short. Re-paste and check the last line number, then redeploy.
