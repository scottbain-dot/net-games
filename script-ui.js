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

// Chunk 2: initials gate + open/close student
function tapStudentCard(name, idx) {
  if (teacherMode) { openStudent(name, idx); return; }
  promptInitials(name, idx);
}
function promptInitials(name, idx) {
  var ov = document.getElementById('initials-overlay');
  document.getElementById('initials-title').textContent = 'Confirm: ' + name;
  document.getElementById('initials-hint').innerHTML =
    'Type the initials for <strong>' + name + '</strong>';
  document.getElementById('initials-error').textContent = '';
  var inp = document.getElementById('initials-input');
  inp.value = '';
  inp.dataset.target = name;
  inp.dataset.idx = idx;
  ov.classList.add('active');
  setTimeout(function() { inp.focus(); }, 50);
}
function checkInitials() {
  var inp = document.getElementById('initials-input');
  var name = inp.dataset.target;
  var idx = parseInt(inp.dataset.idx, 10);
  var expect = (STUDENT_INITIALS[name] || '').toUpperCase();
  var got = (inp.value || '').trim().toUpperCase();
  if (got && got === expect) {
    document.getElementById('initials-overlay').classList.remove('active');
    openStudent(name, idx);
  } else {
    document.getElementById('initials-error').textContent = 'Try again';
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
  body.appendChild(buildOverview(d));
  var skillGrid = el('div', 'section-grid');
  skillGrid.appendChild(buildSkillsCard(name, 'Badminton Skills', 'green', BADMINTON, d));
  skillGrid.appendChild(buildSkillsCard(name, 'Volleyball Skills', 'coral', VOLLEYBALL, d));
  body.appendChild(skillGrid);
}
