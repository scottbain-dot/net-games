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
