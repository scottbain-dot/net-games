// Render functions + DOM event handlers (chunk 1: helpers + roster).
var currentStudent = null;
var currentIdx = null;
var teacherMode = false;

function el(tag, cls) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
function showError(msg) {
  var e = document.getElementById('error-banner');
  e.textContent = msg; e.style.display = 'block';
  setTimeout(function() { e.style.display = 'none'; }, 4000);
}
function avatarColor(i) { return PALETTE[i % PALETTE.length]; }
function initialsOf(name) {
  var p = name.split(' ');
  return (p[0][0] + (p[1] ? p[1][0] : '')).toUpperCase();
}
function updateAutosave() {
  var w = document.getElementById('autosave');
  if (!w) return;
  var t = w.querySelector('.text');
  if (savesInFlight > 0) {
    w.classList.add('active', 'pulse'); t.textContent = 'saved';
  } else {
    clearTimeout(saveTextTimeout);
    saveTextTimeout = setTimeout(function() {
      w.classList.remove('active', 'pulse'); t.textContent = 'auto-saving';
    }, 1400);
  }
}
function updateRosterLessonBadge() {
  var n = document.getElementById('roster-lesson-num');
  if (n) n.textContent = 'L' + currentLesson;
  var items = document.querySelectorAll('#lessons-grid .lesson-item');
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var ln = parseInt(it.getAttribute('data-lesson'), 10);
    it.classList.remove('current', 'done', 'upcoming');
    if (ln === currentLesson) it.classList.add('current');
    else if (ln < currentLesson) it.classList.add('done');
    else it.classList.add('upcoming');
  }
}
function renderRoster() {
  var grid = document.getElementById('student-grid');
  grid.innerHTML = '';
  STUDENTS.forEach(function(name, i) {
    var c = avatarColor(i);
    var card = el('div', 'roster-card');
    card.innerHTML = '<div class="avatar" style="background:' + c.bg + ';color:' + c.fg +
      '">' + initialsOf(name) + '</div><span class="name">' + name +
      '</span><span class="dash">&rsaquo;</span>';
    card.addEventListener('click', function() { tapStudentCard(name, i); });
    grid.appendChild(card);
  });
}

// Chunk 2: PIN gate + open/close student
var pinFlow = 'enter';        // 'enter' | 'create-first' | 'create-confirm'
var pinAttempts = 0;
var pinPending = '';          // first PIN entry while creating
function tapStudentCard(name, idx) {
  if (teacherMode) { openStudent(name, idx); return; }
  var d = studentData[name] || {};
  pinAttempts = 0; pinPending = '';
  pinFlow = d.hasPin ? 'enter' : 'create-first';
  openPinOverlay(name, idx);
}
function openPinOverlay(name, idx) {
  var ov = document.getElementById('student-pin-overlay');
  var title = document.getElementById('student-pin-title');
  var hint  = document.getElementById('student-pin-hint');
  var err   = document.getElementById('student-pin-error');
  var inp   = document.getElementById('student-pin-input');
  inp.value = ''; err.textContent = '';
  inp.dataset.target = name; inp.dataset.idx = idx;
  if (pinFlow === 'enter') {
    title.textContent = 'Enter your PIN';
    hint.innerHTML = 'Welcome back, <strong>' + name + '</strong>';
  } else if (pinFlow === 'create-first') {
    title.textContent = 'Create your 4-digit PIN';
    hint.innerHTML = 'Hi <strong>' + name + '</strong> — pick a PIN only you will remember';
  } else {
    title.textContent = 'Confirm your PIN';
    hint.innerHTML = 'Type the same 4 digits again';
  }
  ov.classList.add('active');
  setTimeout(function() { inp.focus(); }, 50);
}
function closePinOverlay() {
  document.getElementById('student-pin-overlay').classList.remove('active');
}
function submitStudentPin() {
  var inp = document.getElementById('student-pin-input');
  var err = document.getElementById('student-pin-error');
  var name = inp.dataset.target;
  var idx = parseInt(inp.dataset.idx, 10);
  var pin = (inp.value || '').trim();
  if (!/^\d{4}$/.test(pin)) { err.textContent = 'Enter 4 digits'; return; }

  if (pinFlow === 'enter') {
    verifyPinRemote(name, pin).then(function(j) {
      if (j && j.ok) { closePinOverlay(); openStudent(name, idx); return; }
      pinAttempts++;
      if (pinAttempts >= 2) { closePinOverlay(); showError('Wrong PIN — ask your teacher'); return; }
      err.textContent = 'Wrong PIN — one more try';
      inp.value = ''; inp.focus();
    });
  } else if (pinFlow === 'create-first') {
    pinPending = pin; pinFlow = 'create-confirm';
    openPinOverlay(name, idx);
  } else {
    if (pin !== pinPending) {
      err.textContent = 'Did not match — try again';
      pinPending = ''; pinFlow = 'create-first';
      inp.value = ''; inp.focus(); return;
    }
    setPinRemote(name, pin).then(function(j) {
      if (j && j.ok) {
        if (studentData[name]) studentData[name].hasPin = true;
        closePinOverlay(); openStudent(name, idx);
      } else {
        err.textContent = (j && j.error) || 'Could not save PIN';
      }
    });
  }
}
function openStudent(name, idx) {
  currentStudent = name; currentIdx = idx;
  viewedLesson = currentLesson;
  var c = avatarColor(idx);
  var av = document.getElementById('detail-avatar');
  av.style.background = c.bg; av.style.color = c.fg;
  av.textContent = initialsOf(name);
  document.getElementById('detail-name').textContent = name;
  renderLessonPills();
  renderDetail(name);
  document.getElementById('view-roster').style.display = 'none';
  document.getElementById('view-detail').style.display = 'block';
  window.scrollTo(0, 0);
}
function closeStudent() {
  document.getElementById('view-detail').style.display = 'none';
  document.getElementById('view-roster').style.display = 'block';
  currentStudent = null; currentIdx = null;
}

// Chunk 3: lesson pills + detail entry + viewed-ratings selector
function canEdit() { return teacherMode || viewedLesson === currentLesson; }
function renderLessonPills() {
  var box = document.getElementById('detail-lesson-pills');
  box.innerHTML = '';
  for (var i = 1; i <= 9; i++) (function(n) {
    var pill = el('span', 'lesson-pill');
    pill.textContent = 'L' + n;
    if (n === currentLesson) pill.classList.add('current');
    if (n === viewedLesson) pill.classList.add('active');
    pill.addEventListener('click', function() { switchLesson(n); });
    box.appendChild(pill);
  })(i);
  var note = document.getElementById('lesson-pills-note');
  note.className = 'lesson-pills-note';
  if (viewedLesson !== currentLesson && !teacherMode) {
    note.textContent = 'Read-only — past lesson'; note.classList.add('readonly');
  } else if (viewedLesson !== currentLesson) {
    note.textContent = 'Editing past lesson';
  } else { note.textContent = ''; }
}
function switchLesson(n) {
  if (!currentStudent || n === viewedLesson) return;
  viewedLesson = n;
  var name = currentStudent;
  if (n === currentLesson) { renderLessonPills(); renderDetail(name); return; }
  if (studentHistory[name] && studentHistory[name]['L' + n] !== undefined) {
    renderLessonPills(); renderDetail(name); return;
  }
  fetchStudentHistory(name).then(function() {
    if (currentStudent === name && viewedLesson === n) {
      renderLessonPills(); renderDetail(name);
    }
  });
}
function getViewed(name) {
  var cur = studentData[name] || {};
  var base = { ag_baseline: cur.ag_baseline || '', ag_retest: cur.ag_retest || '' };
  if (viewedLesson === currentLesson) { for (var k in cur) base[k] = cur[k]; return base; }
  var rec = studentHistory[name] && studentHistory[name]['L' + viewedLesson];
  if (rec) for (var k2 in rec) {
    if (k2 !== 'Student' && k2 !== 'Lesson' && k2 !== 'timestamp') base[k2] = rec[k2];
  }
  return base;
}
function renderDetail(name) {
  var d = getViewed(name);
  var body = document.getElementById('detail-body');
  body.innerHTML = '';
  var topGrid = el('div', 'section-grid');
  topGrid.appendChild(buildAgilityCard(name, d));
  topGrid.appendChild(buildEffortCard(name, d));
  body.appendChild(topGrid);
  body.appendChild(buildFocusCard(name, d));
  body.appendChild(buildOverview(d));
  var skillGrid = el('div', 'section-grid');
  skillGrid.appendChild(buildSkillsCard(name, 'Badminton Skills', 'green', BADMINTON, d));
  skillGrid.appendChild(buildSkillsCard(name, 'Volleyball Skills', 'coral', VOLLEYBALL, d));
  body.appendChild(skillGrid);
}

// Chunk 4: agility test card + effort card
function buildAgilityCard(name, d) {
  var card = el('div', 'section-card');
  var h = el('div', 'section-header blue');
  h.textContent = 'Illinois Agility Test \u00b7 Teacher Recorded';
  card.appendChild(h);
  var body = el('div', 'agility-body');
  var grid = el('div', 'agility-grid');
  grid.appendChild(buildAgilityBox('Baseline', d.ag_baseline, 'ag_baseline', name));
  grid.appendChild(buildAgilityBox('Re-test', d.ag_retest, 'ag_retest', name));
  body.appendChild(grid);
  var b = parseFloat(d.ag_baseline), r = parseFloat(d.ag_retest);
  if (!isNaN(b) && !isNaN(r)) {
    var diff = el('div', 'agility-diff'); var delta = r - b;
    if (delta < 0) {
      diff.classList.add('improved');
      diff.innerHTML = 'Improved by <strong>' + Math.abs(delta).toFixed(2) + 's</strong>';
    } else if (delta > 0) {
      diff.innerHTML = 'Slower by <strong>' + delta.toFixed(2) + 's</strong>';
    } else { diff.innerHTML = '<strong>No change</strong>'; }
    body.appendChild(diff);
  }
  if (!teacherMode) {
    var note = el('div', 'agility-note');
    note.textContent = 'Times will be added by your teacher';
    body.appendChild(note);
  }
  card.appendChild(body);
  return card;
}
function buildEffortCard(name, d) {
  var card = el('div', 'section-card');
  var h = el('div', 'section-header purple'); h.textContent = 'Effort & Focus';
  card.appendChild(h);
  var body = el('div', 'effort-body');
  var prompt = el('div', 'effort-prompt');
  prompt.textContent = 'How hard did you push yourself today?';
  body.appendChild(prompt);
  body.appendChild(buildSkillRow(name, EFFORT_SKILL, d, true));
  card.appendChild(body);
  return card;
}

// Agility focus (8 element buttons + execution power bar)
function buildFocusCard(name, d) {
  var card = el('div', 'section-card');
  var h = el('div', 'section-header blue'); h.textContent = 'My Agility Focus Today';
  card.appendChild(h);
  var body = el('div', 'focus-body');
  var prompt = el('div', 'focus-prompt');
  prompt.textContent = 'Pick the one element you focused on this lesson';
  body.appendChild(prompt);
  var grid = el('div', 'focus-grid');
  var editable = canEdit();
  var selected = String(d.agility_focus || '');
  AGILITY_FOCUS_ELEMENTS.forEach(function(e) {
    var b = el('div', 'focus-btn');
    if (!editable) b.classList.add('readonly');
    if (selected === e.key) b.classList.add('active');
    b.innerHTML = e.label + '<span class="focus-sub">' + e.sub + '</span>';
    if (editable) b.addEventListener('click', function() {
      var next = (selected === e.key) ? '' : e.key;
      d.agility_focus = next;
      if (viewedLesson === currentLesson && studentData[name]) studentData[name].agility_focus = next;
      Array.prototype.forEach.call(grid.children, function(c) { c.classList.remove('active'); });
      if (next) b.classList.add('active');
      selected = next;
      saveField(name, 'agility_focus', next, false);
    });
    grid.appendChild(b);
  });
  body.appendChild(grid);
  var execLabel = el('div', 'focus-exec-label');
  execLabel.textContent = 'How well did I execute it today?';
  body.appendChild(execLabel);
  body.appendChild(buildSkillRow(name, { key: 'agility_execution', label: 'Execution' }, d, true));
  card.appendChild(body);
  return card;
}

// Chunk 5: agility input box + skill progress overview
function buildAgilityBox(label, value, field, student) {
  var box = el('div', 'agility-box');
  var lbl = el('div', 'label'); lbl.textContent = label; box.appendChild(lbl);
  var has = (value !== '' && value !== undefined && value !== null && value !== 0);
  if (teacherMode) {
    var v = el('div', 'value');
    var inp = document.createElement('input');
    inp.type = 'number'; inp.step = '0.01'; inp.min = '0';
    inp.className = 'agility-input';
    inp.value = has ? value : ''; inp.placeholder = '\u2014';
    v.appendChild(inp); box.appendChild(v);
    var u = el('div', 'unit'); u.textContent = 'seconds'; box.appendChild(u);
    var btn = document.createElement('button');
    btn.className = 'agility-save-btn'; btn.textContent = 'Save';
    btn.addEventListener('click', function() {
      var val = parseFloat(inp.value);
      if (isNaN(val)) return;
      btn.disabled = true; btn.textContent = 'Saving\u2026';
      if (studentData[student]) studentData[student][field] = val;
      saveField(student, field, val, true).then(function() {
        btn.textContent = 'Saved!';
        setTimeout(function() {
          btn.disabled = false; btn.textContent = 'Save';
          if (currentStudent === student) renderDetail(student);
        }, 1000);
      });
    });
    box.appendChild(btn);
  } else {
    var v2 = el('div', 'value' + (has ? '' : ' empty'));
    v2.textContent = has ? value : '\u2014'; box.appendChild(v2);
    var u2 = el('div', 'unit'); u2.textContent = 'seconds'; box.appendChild(u2);
  }
  return box;
}
function buildOverview(d) {
  var card = el('div', 'overview-card');
  var t = el('div', 'overview-title'); t.textContent = 'Skill Progress Overview';
  card.appendChild(t);
  var cols = el('div', 'overview-cols');
  cols.appendChild(overviewColumn('Badminton', 'green', BADMINTON, d));
  cols.appendChild(overviewColumn('Volleyball', 'coral', VOLLEYBALL, d));
  card.appendChild(cols);
  return card;
}
function overviewColumn(title, color, skills, data) {
  var col = el('div', 'overview-col');
  var b = el('span', 'overview-badge ' + color); b.textContent = title; col.appendChild(b);
  skills.forEach(function(s) {
    var row = el('div', 'overview-row'), val = parseInt(data[s.key]) || 0;
    var lbl = el('div', 'overview-label'); lbl.textContent = s.label; row.appendChild(lbl);
    var track = el('div', 'overview-bar-track'), fill = el('div', 'overview-bar-fill');
    if (val > 0) fill.classList.add('level-' + val);
    fill.style.width = (val * 25) + '%';
    track.appendChild(fill); row.appendChild(track); col.appendChild(row);
  });
  return col;
}

// Chunk 6: skill cards + skill row (clickable rating bar)
function buildSkillsCard(name, title, color, skills, d) {
  var card = el('div', 'section-card');
  var h = el('div', 'section-header ' + color); h.textContent = title;
  card.appendChild(h);
  var list = el('div', 'skill-list');
  skills.forEach(function(s) { list.appendChild(buildSkillRow(name, s, d, false)); });
  card.appendChild(list);
  return card;
}
function buildSkillRow(student, skill, d, inline) {
  var item = el('div', 'skill-item');
  var top = el('div', 'skill-top');
  var nameEl = el('span', 'skill-name'); nameEl.textContent = skill.label; top.appendChild(nameEl);
  var tap = el('span', 'skill-tap');
  var cur = parseInt(d[skill.key]) || 0;
  tap.textContent = LEVEL_LABELS[cur];
  if (cur > 0) { tap.classList.add('rated'); tap.style.color = LEVEL_COLORS[cur]; }
  top.appendChild(tap); item.appendChild(top);
  if (skill.tags) {
    var td = el('div', 'skill-tags');
    skill.tags.forEach(function(t) { var x = el('span', 'skill-tag'); x.textContent = t; td.appendChild(x); });
    item.appendChild(td);
  }
  var bar = el('div', 'rating-bar'), fill = el('div', 'rating-fill');
  if (cur > 0) fill.classList.add('level-' + cur);
  bar.appendChild(fill);
  var divs = el('div', 'rating-dividers');
  for (var k = 0; k < 4; k++) divs.appendChild(document.createElement('span'));
  bar.appendChild(divs);
  var label = el('div', 'rating-label');
  if (cur === 0) { label.classList.add('level-0'); label.textContent = 'tap to rate'; }
  else { label.classList.add('rated'); label.textContent = LEVEL_LABELS[cur]; }
  bar.appendChild(label);
  if (!canEdit()) { bar.style.cursor = 'not-allowed'; bar.style.opacity = '0.85'; item.appendChild(bar); return item; }
  bar.addEventListener('click', function(e) {
    var rect = bar.getBoundingClientRect(), x = e.clientX - rect.left, pct = x / rect.width;
    var clicked = Math.max(1, Math.min(4, Math.ceil(pct * 4)));
    var old = parseInt(d[skill.key]) || 0;
    var nv = (old === clicked) ? clicked - 1 : clicked;
    d[skill.key] = nv;
    if (viewedLesson === currentLesson && studentData[student]) studentData[student][skill.key] = nv;
    fill.className = 'rating-fill'; if (nv > 0) fill.classList.add('level-' + nv);
    label.className = 'rating-label';
    if (nv === 0) { label.classList.add('level-0'); label.textContent = 'tap to rate'; }
    else { label.classList.add('rated'); label.textContent = LEVEL_LABELS[nv]; }
    tap.className = 'skill-tap'; tap.textContent = LEVEL_LABELS[nv];
    if (nv > 0) { tap.classList.add('rated'); tap.style.color = LEVEL_COLORS[nv]; } else { tap.style.color = ''; }
    updateOverviewBars(d);
    saveField(student, skill.key, nv, false);
  });
  item.appendChild(bar);
  return item;
}

// Chunk 7: overview bar live update + teacher lesson setter pills
function updateOverviewBars(d) {
  var all = BADMINTON.concat(VOLLEYBALL);
  var fills = document.querySelectorAll('.overview-bar-fill');
  fills.forEach(function(fill, idx) {
    if (idx < all.length) {
      var v = parseInt(d[all[idx].key]) || 0;
      fill.className = 'overview-bar-fill';
      if (v > 0) fill.classList.add('level-' + v);
      fill.style.width = (v * 25) + '%';
    }
  });
}
function renderTeacherLessonSetter() {
  var box = document.getElementById('teacher-lesson-pills');
  if (!box) return;
  box.innerHTML = '';
  for (var i = 1; i <= 9; i++) (function(n) {
    var p = el('span', 'lesson-pill');
    p.textContent = 'L' + n;
    if (n === currentLesson) p.classList.add('current', 'active');
    p.addEventListener('click', function() {
      if (p.classList.contains('saving')) return;
      p.classList.add('saving');
      setLessonRemote(n).then(function(j) {
        p.classList.remove('saving');
        if (j && !j.error) {
          currentLesson = n;
          if (!currentStudent) viewedLesson = n;
          updateRosterLessonBadge();
          renderTeacherLessonSetter();
          if (currentStudent && viewedLesson === currentLesson) {
            renderLessonPills(); renderDetail(currentStudent);
          }
        } else { showError('Could not set lesson'); }
      });
    });
    box.appendChild(p);
  })(i);
}

// Engagement grid — students × L1..L9, dot if that lesson has an agility_focus
function openEngagementView() {
  document.getElementById('view-roster').style.display = 'none';
  document.getElementById('view-engagement').style.display = 'block';
  window.scrollTo(0, 0);
  renderEngagementGrid();
}
function closeEngagementView() {
  document.getElementById('view-engagement').style.display = 'none';
  document.getElementById('view-roster').style.display = 'block';
}
function focusElementLabel(key) {
  for (var i = 0; i < AGILITY_FOCUS_ELEMENTS.length; i++) {
    if (AGILITY_FOCUS_ELEMENTS[i].key === key) return AGILITY_FOCUS_ELEMENTS[i].label;
  }
  return key;
}
function renderEngagementGrid() {
  var table = document.getElementById('engagement-grid');
  table.innerHTML = '<tr><td class="name-col">Loading…</td></tr>';
  fetchEngagement().then(function(j) {
    if (j && j.error) { table.innerHTML = '<tr><td class="name-col">Error: ' + j.error + '</td></tr>'; return; }
    var data = (j && j.students) || {};
    var head = '<tr><th class="name-col">Student</th>';
    for (var i = 1; i <= 9; i++) head += '<th>L' + i + '</th>';
    head += '</tr>';
    var rows = [head];
    STUDENTS.forEach(function(name) {
      var row = '<tr><td class="name-col">' + name + '</td>';
      var rec = data[name] || {};
      for (var i = 1; i <= 9; i++) {
        var lesson = rec['L' + i];
        var focus = lesson && lesson.agility_focus ? String(lesson.agility_focus) : '';
        if (focus) {
          row += '<td class="engagement-cell has-data" title="' + focusElementLabel(focus) + '">' +
                 '<span class="engagement-dot on"></span></td>';
        } else {
          row += '<td class="engagement-cell"><span class="engagement-dot"></span></td>';
        }
      }
      row += '</tr>';
      rows.push(row);
    });
    table.innerHTML = rows.join('');
  });
}

// ── Grading view (teacher) ──
var gradingRecs = {};      // engagement data keyed by student
var gradingScores = {};    // saved scores: { student: {S2,S1,S4} }

function openGradingView() {
  document.getElementById('view-roster').style.display = 'none';
  document.getElementById('view-grading').style.display = 'block';
  window.scrollTo(0, 0);
  var table = document.getElementById('grading-table');
  table.innerHTML = '<tr><td>Loading…</td></tr>';
  Promise.all([fetchEngagement(), fetchGrades()]).then(function(res) {
    var eng = res[0] || {}, gr = res[1] || {};
    gradingRecs = (eng && eng.students) || {};
    gradingScores = (gr && gr.grades) || {};
    renderGradingTable();
  });
}
function closeGradingView() {
  document.getElementById('view-grading').style.display = 'none';
  document.getElementById('view-roster').style.display = 'block';
}

// ── Aggregators over engagement data (rec = { L1:{...}, L2:{...}, ... }) ──
function countLogged(rec, field) {
  var c = 0;
  for (var k in rec) if (rec[k] && rec[k][field] !== '' && rec[k][field] !== undefined && rec[k][field] !== null && rec[k][field] !== 0) c++;
  return c;
}
function uniqueValues(rec, field) {
  var set = {}, out = [];
  for (var k in rec) {
    var v = rec[k] && rec[k][field];
    if (v && !set[v]) { set[v] = true; out.push(v); }
  }
  return out;
}
function avgField(rec, field) {
  var sum = 0, n = 0;
  for (var k in rec) {
    var v = parseFloat(rec[k] && rec[k][field]);
    if (!isNaN(v) && v > 0) { sum += v; n++; }
  }
  return n > 0 ? sum / n : 0;
}
function lessonCount(rec) { var c = 0; for (var k in rec) c++; return c; }

function miniBar(percent) {
  var p = Math.max(0, Math.min(100, Math.round(percent)));
  var cls = p <= 25 ? 'q1' : (p <= 50 ? 'q2' : (p <= 75 ? 'q3' : 'q4'));
  return '<div class="mini-bar"><div class="mini-bar-fill ' + cls + '" style="width:' + p + '%"></div></div>' +
         '<div class="mini-bar-label">' + p + '%</div>';
}
function scoreBand(s) { return s <= 3 ? 'band-low' : (s <= 5 ? 'band-mid' : 'band-high'); }

// Three-pill teacher observation input (1/2/3 → saves via saveGradeRemote)
// colorKey: 's2' | 's1' | 's4' for the coloured tint.
function renderTeacherPills(student, criterion, colorKey, labels, selected) {
  var wrap = el('div', 'teacher-pill-group tpg-' + colorKey);
  var lbl = el('div', 'teacher-pill-label');
  lbl.textContent = labels.label;
  wrap.appendChild(lbl);
  var row = el('div', 'teacher-pills');
  labels.options.forEach(function(opt, i) {
    var n = i + 1;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'teacher-pill';
    b.textContent = opt;
    if (selected === n) b.classList.add('selected', 'tp-' + colorKey);
    b.addEventListener('click', function() {
      if (b.disabled) return;
      b.disabled = true;
      saveGradeRemote(student, criterion, n).then(function(j) {
        b.disabled = false;
        if (j && j.ok) {
          if (!gradingScores[student]) gradingScores[student] = {};
          gradingScores[student][criterion] = n;
          renderGradingTable();
        } else { showError('Could not save observation'); }
      });
    });
    row.appendChild(b);
  });
  wrap.appendChild(row);
  return wrap;
}

function renderScoreButtons(student, criterion, selected) {
  var row = el('div', 'score-row');
  for (var i = 1; i <= 7; i++) (function(n) {
    var b = document.createElement('button');
    b.className = 'score-btn';
    b.textContent = n;
    if (selected === n) b.classList.add('selected', scoreBand(n));
    b.addEventListener('click', function() {
      if (b.disabled) return;
      b.disabled = true;
      saveGradeRemote(student, criterion, n).then(function(j) {
        b.disabled = false;
        if (j && j.ok) {
          if (!gradingScores[student]) gradingScores[student] = {};
          gradingScores[student][criterion] = n;
          renderGradingTable();
        } else {
          showError('Could not save grade');
        }
      });
    });
    row.appendChild(b);
  })(i);
  return row;
}

function updateGradingCount() {
  var graded = 0;
  STUDENTS.forEach(function(n) {
    var s = gradingScores[n];
    if (s && s.S2 && s.S1 && s.S4) graded++;
  });
  var c = document.getElementById('grading-count');
  if (c) c.textContent = graded + ' of ' + STUDENTS.length + ' students graded';
}

function renderGradingTable() {
  var table = document.getElementById('grading-table');
  table.innerHTML = '';
  var head = document.createElement('tr');
  head.innerHTML = '<th class="name-col">Student</th>' +
    '<th class="col-s2">S2 · Skill identification</th>' +
    '<th class="col-s1">S1 · Skill development</th>' +
    '<th class="col-s4">S4 · Active participation</th>';
  table.appendChild(head);
  STUDENTS.forEach(function(name, i) {
    var rec = gradingRecs[name] || {};
    var scores = gradingScores[name] || {};
    var tr = document.createElement('tr');
    var nameTd = el('td', 'name-col');
    var c = avatarColor(i);
    nameTd.innerHTML = '<div class="avatar" style="background:' + c.bg + ';color:' + c.fg + '">' +
      initialsOf(name) + '</div><div class="name">' + name + '</div>';
    tr.appendChild(nameTd);
    tr.appendChild(buildS2Cell(name, rec, scores));
    tr.appendChild(buildS1Cell(name, rec, scores));
    tr.appendChild(buildS4Cell(name, rec, scores));
    table.appendChild(tr);
  });
  updateGradingCount();
}

function buildS2Cell(name, rec, scores) {
  var td = el('td', 'grading-cell');
  var logged = countLogged(rec, 'agility_focus');
  var tags = uniqueValues(rec, 'agility_focus');
  var tagHtml = tags.slice(0, 3).map(function(t) {
    return '<span class="grading-tag">' + focusElementLabel(t) + '</span>';
  }).join('');
  if (tags.length > 3) tagHtml += '<span class="grading-tag">+' + (tags.length - 3) + ' more</span>';
  if (!tagHtml) tagHtml = '<span class="grading-tag" style="opacity:0.5">none</span>';
  td.innerHTML =
    '<div class="grading-datum"><span class="grading-datum-label">Focus logged</span>' +
      '<span class="grading-datum-value">' + logged + ' / 9 lessons</span></div>' +
    '<div class="grading-datum"><span class="grading-datum-label">Elements chosen</span>' +
      '<span class="grading-datum-value"><div class="grading-tags">' + tagHtml + '</div></span></div>';
  td.appendChild(renderTeacherPills(name, 's2_teacher', 's2',
    { label: 'Showed awareness of what to improve?', options: ['rarely','sometimes','clearly'] },
    scores.s2_teacher));
  td.appendChild(renderScoreButtons(name, 'S2', scores.S2));
  var hint = el('div', 'rubric-hint');
  hint.textContent = '6-7: clearly identifies strengths and areas for improvement. Strong understanding of skill requirements.';
  td.appendChild(hint);
  return td;
}

function buildS1Cell(name, rec, scores) {
  var td = el('td', 'grading-cell');
  var d = studentData[name] || {};
  var b = parseFloat(d.ag_baseline), r = parseFloat(d.ag_retest);
  var deltaHtml = '<span class="grading-delta neutral">not yet recorded</span>';
  if (!isNaN(b) && !isNaN(r)) {
    var delta = r - b;
    if (Math.abs(delta) < 0.005) deltaHtml = '<span class="grading-delta neutral">no change</span>';
    else if (delta < 0) deltaHtml = '<span class="grading-delta improved">' + delta.toFixed(1) + 's faster</span>';
    else deltaHtml = '<span class="grading-delta slower">+' + delta.toFixed(1) + 's slower</span>';
  }
  td.innerHTML =
    '<div class="grading-datum"><span class="grading-datum-label">Illinois</span>' +
      '<span class="grading-datum-value">' + deltaHtml + '</span></div>';
  td.appendChild(renderTeacherPills(name, 's1_badminton_teacher', 's1',
    { label: 'Badminton skill level', options: ['emerging','developing','consistent'] },
    scores.s1_badminton_teacher));
  td.appendChild(renderTeacherPills(name, 's1_volleyball_teacher', 's1',
    { label: 'Volleyball skill level', options: ['emerging','developing','consistent'] },
    scores.s1_volleyball_teacher));
  td.appendChild(renderScoreButtons(name, 'S1', scores.S1));
  var hint = el('div', 'rubric-hint');
  hint.textContent = '6-7: significant and consistent improvement. Independently applies effective strategies.';
  td.appendChild(hint);
  return td;
}

function buildS4Cell(name, rec, scores) {
  var td = el('td', 'grading-cell');
  var logged = countLogged(rec, 'effort');
  var dots = '';
  for (var i = 1; i <= 9; i++) {
    var hasFocus = rec['L' + i] && rec['L' + i].agility_focus;
    dots += '<span class="engagement-dot' + (hasFocus ? ' on' : '') + '"></span>';
  }
  td.innerHTML =
    '<div class="grading-datum"><span class="grading-datum-label">Engaged</span>' +
      '<span class="grading-datum-value">' + logged + ' / 9 lessons</span></div>' +
    '<div class="grading-datum"><span class="grading-datum-label">Focus log</span>' +
      '<span class="grading-datum-value"><div class="grading-dots">' + dots + '</div></span></div>';
  td.appendChild(renderTeacherPills(name, 's4_teacher', 's4',
    { label: 'Quality of participation observed', options: ['inconsistent','regular','excellent'] },
    scores.s4_teacher));
  td.appendChild(renderScoreButtons(name, 'S4', scores.S4));
  var hint = el('div', 'rubric-hint');
  hint.textContent = '6-7: consistently highly engaged. Excellent self-management, communication, collaboration.';
  td.appendChild(hint);
  return td;
}

// Teacher PINs table — lists every student's PIN with a Reset button
function refreshTeacherPins() {
  var table = document.getElementById('teacher-pins-table');
  if (!table) return;
  table.innerHTML = '<tr><td colspan="3" class="teacher-pins-hint">Loading…</td></tr>';
  fetchAllPins().then(function(j) {
    var pins = (j && j.pins) || {};
    table.innerHTML = '';
    STUDENTS.forEach(function(name) {
      var tr = document.createElement('tr');
      var pin = pins[name] || '';
      tr.innerHTML = '<td class="pin-name">' + name + '</td>' +
        '<td class="pin-value' + (pin ? '' : ' empty') + '">' + (pin || 'no PIN yet') + '</td>' +
        '<td class="pin-actions"></td>';
      var btn = document.createElement('button');
      btn.className = 'pin-reset'; btn.textContent = 'Reset';
      btn.addEventListener('click', function() {
        if (!confirm('Reset PIN for ' + name + '?')) return;
        btn.disabled = true; btn.textContent = 'Resetting…';
        resetPinRemote(name).then(function(r) {
          if (r && r.ok) {
            if (studentData[name]) studentData[name].hasPin = false;
            refreshTeacherPins();
          } else {
            btn.disabled = false; btn.textContent = 'Reset';
            showError('Reset failed');
          }
        });
      });
      tr.querySelector('.pin-actions').appendChild(btn);
      table.appendChild(tr);
    });
  });
}

// Chunk 8: DOM event handlers + boot
document.getElementById('teacher-btn').addEventListener('click', function() {
  if (teacherMode) {
    teacherMode = false; this.textContent = 'Teacher \u203A';
    document.getElementById('teacher-lesson-setter').classList.remove('active');
    document.getElementById('teacher-pins-panel').classList.remove('active');
    document.body.classList.remove('teacher-active');
    if (currentStudent) { renderLessonPills(); renderDetail(currentStudent); }
    return;
  }
  document.getElementById('pin-overlay').classList.add('active');
  document.getElementById('pin-input').value = '';
  document.getElementById('pin-error').textContent = '';
  setTimeout(function() { document.getElementById('pin-input').focus(); }, 50);
});
function checkPin() {
  if (document.getElementById('pin-input').value === TEACHER_PIN) {
    teacherMode = true;
    document.getElementById('pin-overlay').classList.remove('active');
    document.getElementById('teacher-btn').textContent = 'Teacher Mode \u2713';
    document.getElementById('teacher-lesson-setter').classList.add('active');
    document.getElementById('teacher-pins-panel').classList.add('active');
    document.body.classList.add('teacher-active');
    renderTeacherLessonSetter();
    refreshTeacherPins();
    if (currentStudent) { renderLessonPills(); renderDetail(currentStudent); }
  } else { document.getElementById('pin-error').textContent = 'Wrong PIN'; }
}
document.getElementById('pin-ok').addEventListener('click', checkPin);
document.getElementById('pin-input').addEventListener('keydown', function(e) { if (e.key === 'Enter') checkPin(); });
document.getElementById('pin-cancel').addEventListener('click', function() {
  document.getElementById('pin-overlay').classList.remove('active');
});
document.getElementById('student-pin-ok').addEventListener('click', submitStudentPin);
document.getElementById('student-pin-input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') submitStudentPin();
});
document.getElementById('student-pin-cancel').addEventListener('click', closePinOverlay);
document.getElementById('teacher-pins-refresh').addEventListener('click', refreshTeacherPins);
document.getElementById('teacher-engagement-btn').addEventListener('click', openEngagementView);
document.getElementById('engagement-back-btn').addEventListener('click', closeEngagementView);
document.getElementById('teacher-grading-btn').addEventListener('click', openGradingView);
document.getElementById('grading-back-btn').addEventListener('click', closeGradingView);
document.getElementById('back-btn').addEventListener('click', closeStudent);

// Boot
renderRoster();
fetchAllCurrent().then(function() {
  updateRosterLessonBadge();
  document.getElementById('loading').style.display = 'none';
});
