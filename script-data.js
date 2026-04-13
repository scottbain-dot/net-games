// ── Constants & static data for Net Games ──
// CLASS_NAME, APPS_SCRIPT_URL, TEACHER_PIN, STUDENTS, STUDENT_INITIALS
// are injected by build.py just before these files are concatenated.

// Avatar palette (8 colors, cycle by index)
var PALETTE = [
  { bg: '#d4f0e4', fg: '#0a5c35' },
  { bg: '#e8e4ff', fg: '#4a3a9a' },
  { bg: '#ddeeff', fg: '#1a4a7a' },
  { bg: '#ffe4d4', fg: '#7a2a0a' },
  { bg: '#fff0d4', fg: '#7a5a0a' },
  { bg: '#fde4ee', fg: '#8a2a5a' },
  { bg: '#d4eeff', fg: '#0a4a7a' },
  { bg: '#e4ffd4', fg: '#2a6a0a' }
];

// Rating levels (0–4) shared across skill bars and agility execution
var LEVEL_LABELS = ['tap to rate', 'getting there', 'developing', 'consistent', 'nailed it \u2605'];
var LEVEL_COLORS = ['#ccc', '#F0A500', '#1D9E75', '#2E86DE', '#6C3FC5'];

// Skill definitions
var BADMINTON = [
  { key: 'bserve', label: 'Serve accuracy' },
  { key: 'bshot',  label: 'Shot choice', tags: ['clear','drop','smash','net shot'] },
  { key: 'bfoot',  label: 'Footwork & movement' },
  { key: 'btac',   label: 'Tactical play' }
];
var VOLLEYBALL = [
  { key: 'vserve', label: 'Serve accuracy' },
  { key: 'vskill', label: 'Skill focus', tags: ['pass','serve','set','hit'] },
  { key: 'vpos',   label: 'Positioning & awareness' },
  { key: 'comm',   label: 'Communication & teamwork' }
];
var EFFORT_SKILL = { key: 'effort', label: 'Effort & focus' };

// Agility focus elements (8 tap-buttons in the "My agility focus today" card)
var AGILITY_FOCUS_ELEMENTS = [
  { key: 'explosive_start', label: 'Explosive start', sub: 'First step' },
  { key: 'sharp_turns',     label: 'Sharp turns',     sub: 'Change of direction' },
  { key: 'quick_stop',      label: 'Quick stop',      sub: 'Deceleration' },
  { key: 'top_speed',       label: 'Top speed',       sub: 'Acceleration' },
  { key: 'curves',          label: 'Curves',          sub: 'Bend running' },
  { key: 'sideways',        label: 'Sideways',        sub: 'Shuffle step' },
  { key: 'go_again',        label: 'Go again',        sub: 'Stop-start ability' },
  { key: 'react',           label: 'React',           sub: 'Reaction time' }
];
