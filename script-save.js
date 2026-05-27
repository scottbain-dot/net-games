// State + Apps Script data layer. UI helpers come from script-ui.js.
var savesInFlight = 0;
var saveTextTimeout = null;
var studentData = {};     // per-student static data: hasPin, ag_baseline, ag_retest
var studentHistory = {};  // per-student per-lesson history (lazy)
var viewedLesson = 0;     // 0 = none picked yet — student must choose

function api(path, payload) {
  var opts = payload
    ? { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(payload) }
    : undefined;
  return fetch(APPS_SCRIPT_URL + (payload ? '' : '?' + path), opts)
    .then(function(r) { return r.json(); });
}
// Retry an api() call once after `delay` ms on network/parse failure.
// Apps Script cold-starts and classroom wifi are flaky; a single retry
// rescues most transient failures.
function apiWithRetry(path, payload, delay) {
  return api(path, payload).catch(function(err) {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        api(path, payload).then(resolve, reject);
      }, delay || 700);
    });
  });
}
function fetchAllCurrent() {
  return api('action=getAllCurrent&class=' + encodeURIComponent(CLASS_NAME)).then(function(j) {
    if (j.error) throw new Error(j.error);
    if (j.students) for (var n in j.students) studentData[n] = j.students[n];
  });
}
function fetchStudentHistory(name) {
  return apiWithRetry('action=getStudent&class=' + encodeURIComponent(CLASS_NAME) +
             '&student=' + encodeURIComponent(name)).then(function(j) {
    if (j && j.error) throw new Error(j.error);
    var h = {};
    (j.lessons || []).forEach(function(row) { h['L' + row.Lesson] = row; });
    studentHistory[name] = h;
    return h;
  });
}
// Resolves to true only when the server confirmed the write, false otherwise.
// Callers must revert their optimistic UI on a false result so a student never
// sees a change "stick" that didn't actually persist.
function saveField(student, field, value, isAgility) {
  if (!isAgility && (!viewedLesson || viewedLesson < 1 || viewedLesson > 9)) {
    showError('Pick a lesson before saving.');
    return Promise.resolve(false);
  }
  savesInFlight++; updateAutosave();
  var p = isAgility
    ? { action: 'saveAgility', 'class': CLASS_NAME, student: student, field: field, value: value }
    : { action: 'saveLesson', 'class': CLASS_NAME, student: student, lesson: viewedLesson, field: field, value: value };
  return apiWithRetry(null, p).then(function(j) {
    if (!j || j.error) throw new Error((j && j.error) || 'No response');
    savesInFlight--; updateAutosave(true);
    return true;
  }).catch(function(err) {
    savesInFlight--; updateAutosave(false);
    console.error(err); showError('Save failed — your last change did NOT save. Try again.');
    return false;
  });
}
function verifyPinRemote(student, pin) {
  return apiWithRetry(null, { action: 'verifyPin', 'class': CLASS_NAME, student: student, pin: pin });
}
function setPinRemote(student, pin, teacherPin) {
  var payload = { action: 'setPin', 'class': CLASS_NAME, student: student, pin: pin };
  if (teacherPin) payload.teacherPin = teacherPin;
  return apiWithRetry(null, payload);
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
function fetchGrades() {
  return api('action=getGrades&class=' + encodeURIComponent(CLASS_NAME));
}
function saveGradeRemote(student, criterion, score) {
  return api(null, {
    action: 'saveGrade', 'class': CLASS_NAME,
    student: student, criterion: criterion, score: score
  });
}
