// State + Apps Script data layer. UI helpers come from script-ui.js.
var savesInFlight = 0;
var saveTextTimeout = null;
var studentData = {};     // current-lesson snapshot per student
var studentHistory = {};  // lazy full-lesson history per student
var currentLesson = 1;
var viewedLesson = 1;

function api(path, payload) {
  var opts = payload
    ? { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) }
    : undefined;
  return fetch(APPS_SCRIPT_URL + (payload ? '' : '?' + path), opts)
    .then(function(r) { return r.json(); });
}
function fetchAllCurrent() {
  return api('action=getAllCurrent&class=' + encodeURIComponent(CLASS_NAME)).then(function(j) {
    if (j.error) throw new Error(j.error);
    currentLesson = parseInt(j.currentLesson, 10) || 1;
    viewedLesson = currentLesson;
    if (j.students) for (var n in j.students) studentData[n] = j.students[n];
  }).catch(function(err) { console.error(err); showError('Could not load data.'); });
}
function fetchStudentHistory(name) {
  return api('action=getStudent&class=' + encodeURIComponent(CLASS_NAME) +
             '&student=' + encodeURIComponent(name)).then(function(j) {
    if (j.error) throw new Error(j.error);
    var h = {};
    (j.lessons || []).forEach(function(row) { h['L' + row.Lesson] = row; });
    studentHistory[name] = h;
    return h;
  });
}
function saveField(student, field, value, isAgility) {
  savesInFlight++; updateAutosave();
  var p = isAgility
    ? { action: 'saveAgility', 'class': CLASS_NAME, student: student, field: field, value: value }
    : { action: 'saveLesson', 'class': CLASS_NAME, student: student, lesson: viewedLesson, field: field, value: value };
  return api(null, p).then(function(j) {
    savesInFlight--; updateAutosave();
    if (j.error) throw new Error(j.error);
  }).catch(function(err) {
    savesInFlight--; updateAutosave();
    console.error(err); showError('Save failed — tap again to retry.');
  });
}
function setLessonRemote(lesson) {
  return api(null, { action: 'setLesson', 'class': CLASS_NAME, lesson: lesson, pin: TEACHER_PIN });
}
function verifyPinRemote(student, pin) {
  return api(null, { action: 'verifyPin', 'class': CLASS_NAME, student: student, pin: pin });
}
function setPinRemote(student, pin, teacherPin) {
  var payload = { action: 'setPin', 'class': CLASS_NAME, student: student, pin: pin };
  if (teacherPin) payload.teacherPin = teacherPin;
  return api(null, payload);
}
function fetchAllPins() {
  return api('action=getAllPins&class=' + encodeURIComponent(CLASS_NAME) + '&pin=' + encodeURIComponent(TEACHER_PIN));
}
function resetPinRemote(student) {
  return api(null, { action: 'resetPin', 'class': CLASS_NAME, student: student, teacherPin: TEACHER_PIN });
}
function fetchEngagement() {
  return api('action=getEngagement&class=' + encodeURIComponent(CLASS_NAME));
}
