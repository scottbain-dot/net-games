#!/usr/bin/env python3
"""Combine style.css + body.html + script.js into 7a.html and 8a.html."""
import os

ROOT = os.path.dirname(os.path.abspath(__file__))

def read(p):
    with open(os.path.join(ROOT, p), 'r') as f:
        return f.read()

css = read('style.css')
body = read('body.html')
js = read('script.js')

APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyFhJyvCrF6ThHNMs7bLedfAnMkC79PUKvRyqvLu2cUUaEJzru3OUkZifaE1YfDrw56Iw/exec'
TEACHER_PIN = '1770'

STUDENTS_7A = [
    'Freya R','Flavio C','Karim Y A G','Soomin O','Chaeyi L',
    'Michelle S','Woojun J','Kian W','Nico S','Louis',
    'Ella B','Lena L','Austin W','Jihoo P','Ari R',
    'Yilei L','Joon S','Rubin L'
]

STUDENTS_8A = [
    'Student 1','Student 2','Student 3','Student 4','Student 5',
    'Student 6','Student 7','Student 8','Student 9','Student 10'
]

def js_array(names):
    return '[' + ', '.join("'" + n.replace("'", "\\'") + "'" for n in names) + ']'

def build(cls_name, students):
    body_html = body.replace('__CLASS__', cls_name)
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
<title>Net Games · Class {cls_name}</title>
<style>
{css}
</style>
</head>
<body>
<script>
var CLASS_NAME = '{cls_name}';
var APPS_SCRIPT_URL = '{APPS_SCRIPT_URL}';
var TEACHER_PIN = '{TEACHER_PIN}';
var STUDENTS = {js_array(students)};
</script>
{body_html}
<script>
{js}
</script>
</body>
</html>
"""

with open(os.path.join(ROOT, '7a.html'), 'w') as f:
    f.write(build('7A', STUDENTS_7A))

with open(os.path.join(ROOT, '8a.html'), 'w') as f:
    f.write(build('8A', STUDENTS_8A))

print('Built 7a.html and 8a.html')
