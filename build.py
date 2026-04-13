#!/usr/bin/env python3
"""Combine head.html + body.html + 3 script files into 7a.html and 8a.html."""
import json
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

def read(p):
    with open(os.path.join(ROOT, p), 'r') as f:
        return f.read()

css = read('style.css')
head = read('head.html')
body = read('body.html')
data_js = read('script-data.js')
save_js = read('script-save.js')
ui_js = read('script-ui.js')

APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyFhJyvCrF6ThHNMs7bLedfAnMkC79PUKvRyqvLu2cUUaEJzru3OUkZifaE1YfDrw56Iw/exec'
TEACHER_PIN = '1770'

STUDENTS_7A = [
    'Freya R','Flavio C','Karim Y A G','Soomin O','Chaeyi L',
    'Michelle S','Woojun J','Kian W','Nico S','Louis H',
    'Ella B','Lena L','Austin W','Jihoo P','Ari R',
    'Yilei L','Joon S','Rubin L'
]
STUDENTS_8A = [
    'Nicolas v M','Seppe M','Antonia G','Amaya W','Peter T',
    'Silas V','Seoyeon J','Taehyun S','Dylan T','Ryan S',
    'Josh R','David L','Vihaan M','Philipp N',"Alec O'D",
    'Bora G','Katharina V','Kinley C'
]

INITIALS_7A = {
    'Freya R': 'FR', 'Flavio C': 'FC', 'Karim Y A G': 'KG', 'Soomin O': 'SO',
    'Chaeyi L': 'CL', 'Michelle S': 'MS', 'Woojun J': 'WJ', 'Kian W': 'KW',
    'Nico S': 'NS', 'Louis H': 'LH', 'Ella B': 'EB', 'Lena L': 'LL',
    'Austin W': 'AW', 'Jihoo P': 'JP', 'Ari R': 'AR', 'Yilei L': 'YL',
    'Joon S': 'JS', 'Rubin L': 'RL'
}
INITIALS_8A = {
    'Nicolas v M': 'NM', 'Seppe M': 'SM', 'Antonia G': 'AG', 'Amaya W': 'AW',
    'Peter T': 'PT', 'Silas V': 'SV', 'Seoyeon J': 'SJ', 'Taehyun S': 'TS',
    'Dylan T': 'DT', 'Ryan S': 'RS', 'Josh R': 'JR', 'David L': 'DL',
    'Vihaan M': 'VM', 'Philipp N': 'PN', "Alec O'D": 'AO', 'Bora G': 'BG',
    'Katharina V': 'KV', 'Kinley C': 'KC'
}

def js_array(names):
    return '[' + ', '.join("'" + n.replace("'", "\\'") + "'" for n in names) + ']'

def build(cls_name, students, initials):
    head_html = head.replace('__CLASS__', cls_name).replace('__STYLES__', css)
    body_html = body.replace('__CLASS__', cls_name)
    return f"""{head_html}
<body>
<script>
var CLASS_NAME = '{cls_name}';
var APPS_SCRIPT_URL = '{APPS_SCRIPT_URL}';
var TEACHER_PIN = '{TEACHER_PIN}';
var STUDENTS = {js_array(students)};
var STUDENT_INITIALS = {json.dumps(initials)};
</script>
{body_html}
<script>
{data_js}
</script>
<script>
{save_js}
</script>
<script>
{ui_js}
</script>
</body>
</html>
"""

with open(os.path.join(ROOT, '7a.html'), 'w') as f:
    f.write(build('7A', STUDENTS_7A, INITIALS_7A))
with open(os.path.join(ROOT, '8a.html'), 'w') as f:
    f.write(build('8A', STUDENTS_8A, INITIALS_8A))

print('Built 7a.html and 8a.html')
