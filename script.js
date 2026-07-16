const SEMESTER_LENGTH = 16;  // days per semester
const MAX_YEARS = 2;         // scope: only years 1-2 are built right now
const EVENT_CHANCE = 0.45;   // chance a random event fires on an ordinary day

const EXAM_FOCUS_SLOTS = 2;  // how many courses you can "grind it out" for per exam period 
const BASE_MASTERY = 70;     // starting per-course grade bar (0-100), roughly a C- — matches the starting 2.0 GPA
const NEGLECT_THRESHOLD = 5; // days a course can go untouched before its grade starts slipping
const NEGLECT_RATE = 2;      // mastery points lost per day beyond the threshold
const PROBATION_SANITY_PENALTY = 10;

// courses per "year-semester" key
const COURSES = {
  "1-1": ["CS101", "MATH101", "MBG110", "ENG101", "TURK101"],
  "1-2": ["CS102", "MATH102", "MATH132", "ENG102", "TURK102"],
  "2-1": ["CS201", "CS223", "HIST200", "PHYS101", "HUM111"],
  "2-2": ["CS202", "CS224", "MATH225", "PHYS102", "HUM112"]
};

// credit weights for GPA calculation
const COURSE_WEIGHTS = {
  // Year 1
  "CS101": 4, "MATH101": 4, "MBG110": 3, "ENG101": 3, "TURK101": 2,
  "CS102": 4, "MATH102": 4, "MATH132": 3, "ENG102": 3, "TURK102": 2,
  
  // Year 2
  "CS201": 3, "CS223": 4, "HIST200": 4, "PHYS101": 4, "HUM111": 3,
  "CS202": 3, "CS224": 4, "MATH225": 4, "PHYS102": 4, "HUM112": 3
};

// ---- state ----
const state = {
  gpa: 2.5,
  sanity: 70,
  social: 50,
  budget: 500,
  day: 1,
  courseProgress: {},
  courseLastTouched: {},
  harassmentChain: false,
  completedEvents: [],
  minigamePlayed: false,
  avatar: null, // set during character creation: { hair, clothes, expression }
  completedGradePoints: 0,
  completedCredits: 0
};

// ---- avatar (pixel-art, Stardew-style bust) ----
const AVATAR_PX = 4; // base pixel size — every shape is grid-aligned, no curves/smoothing

const AVATAR_OPTIONS = {
  hair: [
    { id: "pigtails", label: "Pigtails", color: "#7a4a2a", accent: "#e2574c" },
    { id: "bob", label: "Bob", color: "#2b2320", accent: "#2b2320" },
    { id: "ponytail", label: "Ponytail", color: "#d9a441", accent: "#e8a33d" },
    { id: "bun", label: "Bun", color: "#a1462f", accent: "#a1462f" }
  ],
  clothes: [
    { id: "dress", label: "Dress", color: "#e37fa0", shadow: "#c45f80" },
    { id: "hoodie", label: "Hoodie", color: "#e8a33d", shadow: "#c9841f" },
    { id: "overalls", label: "Overalls", color: "#4a6fa5", shadow: "#375684" },
    { id: "sweater", label: "Sweater", color: "#4fb286", shadow: "#39946c" }
  ],
  expression: [
    { id: "chill", label: "Chill" },
    { id: "focused", label: "Focused" },
    { id: "smirk", label: "Smirk" }
  ]
};

// Builds a blocky pixel-art bust from the chosen config, modulated by current sanity/social.
// Everything is drawn on a fixed grid as flat-color rects (crispEdges, no anti-aliasing) —
// that's what gives it the chunky Stardew-portrait look instead of smooth shapes.
// sanity < 35 -> "crazier" (red/glassy eyes, jagged mouth, stray hair, sweat drop)
// sanity < 15 -> pushes further (fully bloodshot eyes)
// social < 25 -> "antisocial" (half-lidded averted eyes, flat mouth, under-eye shadow, turned away)
// social < 10 -> pushes further (bigger turn, arms crossed)
function buildAvatarSVG(config, s) {
  s = s || state;
  const px = AVATAR_PX;
  const crazy = s.sanity < 35;
  const veryCrazy = s.sanity < 15;
  const antisocial = s.social < 25;
  const veryAntisocial = s.social < 10;

  const hair = AVATAR_OPTIONS.hair.find(h => h.id === config.hair) || AVATAR_OPTIONS.hair[0];
  const clothes = AVATAR_OPTIONS.clothes.find(c => c.id === config.clothes) || AVATAR_OPTIONS.clothes[0];

  const skin = "#f2c9a1";
  const eyeWhite = "#fff6ee";
  const pupil = "#3a2c22";
  const mouthColor = "#7a3b3b";
  const blush = "#f0a3ab";

  const rects = [];
  const r = (gx, gy, gw, gh, color, opacity) => {
    rects.push(`<rect x="${gx * px}" y="${gy * px}" width="${gw * px}" height="${gh * px}" fill="${color}"${opacity ? ` opacity="${opacity}"` : ""} shape-rendering="crispEdges"/>`);
  };

  // --- hair, back layer (bunches / tail sitting behind the head) ---
  if (hair.id === "pigtails") {
    r(7, 7, 3, 7, hair.color);
    r(22, 7, 3, 7, hair.color);
    r(7, 7, 3, 1, hair.accent);
    r(22, 7, 3, 1, hair.accent);
  } else if (hair.id === "ponytail") {
    r(23, 10, 3, 9, hair.color);
    r(23, 10, 3, 1, hair.accent);
  } else if (hair.id === "bob") {
    r(9, 9, 2, 13, hair.color);
    r(21, 9, 2, 13, hair.color);
  } else if (hair.id === "bun") {
    r(13, 4, 6, 4, hair.color);
  }

  // --- body / clothes (tapered shoulders) ---
  const bodyFill = clothes.id === "overalls" ? "#f5f0e6" : clothes.color;
  r(11, 23, 10, 1, bodyFill);
  r(9, 24, 14, 1, bodyFill);
  for (let row = 25; row <= 31; row++) r(8, row, 16, 1, bodyFill);

  if (clothes.id === "overalls") {
    r(13, 23, 1, 9, clothes.color);
    r(18, 23, 1, 9, clothes.color);
    r(13, 26, 6, 4, clothes.color);
  }
  if (clothes.id === "hoodie") {
    r(9, 22, 2, 2, clothes.shadow);
    r(21, 22, 2, 2, clothes.shadow);
  }
  if (clothes.id === "sweater") {
    r(14, 23, 4, 1, skin);
  }
  if (clothes.id === "dress") {
    r(6, 32, 20, 1, clothes.shadow);
    r(4, 33, 24, 1, clothes.shadow);
  }

  // --- head ---
  r(13, 9, 6, 1, skin);
  r(11, 10, 10, 1, skin);
  for (let row = 11; row <= 18; row++) r(10, row, 12, 1, skin);
  r(11, 19, 10, 1, skin);
  r(12, 20, 8, 1, skin);
  r(14, 21, 4, 2, skin); // neck

  // --- hair, front layer (bangs / hairline) ---
  r(12, 7, 8, 1, hair.color);
  r(10, 8, 12, 1, hair.color);
  r(10, 9, 3, 1, hair.color);
  r(19, 9, 3, 1, hair.color);
  if (hair.id === "bob") r(10, 9, 12, 1, hair.color);

  // --- eyes ---
  if (antisocial) {
    const off = veryAntisocial ? -1 : 0;
    r(12 + off, 14, 3, 1, pupil);
    r(17 + off, 14, 3, 1, pupil);
  } else if (veryCrazy) {
    r(12, 13, 3, 3, "#e2574c");
    r(17, 13, 3, 3, "#e2574c");
    r(13, 14, 1, 1, "#1a1a1a");
    r(18, 14, 1, 1, "#1a1a1a");
  } else if (crazy) {
    r(12, 13, 3, 3, eyeWhite);
    r(17, 13, 3, 3, eyeWhite);
    r(14, 13, 1, 1, "#e2574c");
    r(12, 14, 1, 1, "#e2574c");
    r(13, 14, 1, 1, pupil);
    r(18, 14, 1, 1, pupil);
  } else {
    r(12, 13, 3, 3, eyeWhite);
    r(17, 13, 3, 3, eyeWhite);
    r(13, 14, 1, 1, pupil);
    r(18, 14, 1, 1, pupil);
  }

  // --- blush ---
  if (!antisocial) {
    r(11, 16, 1, 1, blush);
    r(20, 16, 1, 1, blush);
  }

  // --- mouth ---
  if (veryCrazy || crazy) {
    r(13, 17, 1, 1, mouthColor);
    r(14, 16, 1, 1, mouthColor);
    r(15, 17, 1, 1, mouthColor);
    r(16, 16, 1, 1, mouthColor);
    r(17, 17, 1, 1, mouthColor);
    r(18, 16, 1, 1, mouthColor);
  } else if (antisocial) {
    r(14, 17, 4, 1, mouthColor);
  } else if (config.expression === "smirk") {
    r(14, 17, 3, 1, mouthColor);
    r(17, 16, 1, 1, mouthColor);
  } else if (config.expression === "focused") {
    r(15, 17, 2, 1, mouthColor);
  } else {
    r(14, 17, 4, 1, mouthColor);
    r(13, 16, 1, 1, mouthColor);
    r(18, 16, 1, 1, mouthColor);
  }

  // --- mood overlays ---
  if (crazy) {
    r(22, 11, 1, 2, "#7fd8e8"); // sweat drop
    r(9, 6, 1, 1, hair.color);  // stray hair
    r(22, 6, 1, 1, hair.color);
  }
  if (antisocial) {
    r(12, 16, 1, 1, "#000000", 0.15);
    r(19, 16, 1, 1, "#000000", 0.15);
  }
  if (veryAntisocial) {
    r(8, 29, 16, 2, clothes.shadow, 0.9); // crossed arms
  }

  const shiftX = antisocial ? (veryAntisocial ? -6 : -3) : 0;

  return `
  <svg viewBox="0 0 128 152" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <g transform="translate(${shiftX} 0)">
      ${rects.join("")}
    </g>
  </svg>`;
}

function renderCharacterCreation() {
  if (!state.avatar) state.avatar = { hair: "pigtails", clothes: "dress", expression: "chill" };

  document.getElementById("window-title").textContent = "create_character.sh";
  document.getElementById("hint").textContent = "";
  document.getElementById("courses").innerHTML = "";
  document.getElementById("avatar-box").innerHTML = "";

  const optionRow = (group, options) => `
    <div class="avatar-option-row">
      ${options.map(o => `<button data-group="${group}" data-id="${o.id}" class="${state.avatar[group] === o.id ? "selected" : ""}">${o.label}</button>`).join("")}
    </div>`;

  const body = document.getElementById("window-body");
  body.innerHTML = `
    <div class="avatar-creator">
      <p class="scene-text">Build your character.</p>
      <div class="avatar-preview">${buildAvatarSVG(state.avatar, state)}</div>
      <div class="avatar-options">
        <div class="avatar-option-group">
          <div class="avatar-option-label">hair</div>
          ${optionRow("hair", AVATAR_OPTIONS.hair)}
        </div>
        <div class="avatar-option-group">
          <div class="avatar-option-label">clothes</div>
          ${optionRow("clothes", AVATAR_OPTIONS.clothes)}
        </div>
        <div class="avatar-option-group">
          <div class="avatar-option-label">expression</div>
          ${optionRow("expression", AVATAR_OPTIONS.expression)}
        </div>
      </div>
      <button class="primary" id="confirm-avatar">looks good →</button>
    </div>`;

  body.querySelectorAll(".avatar-option-row button").forEach(btn => {
    btn.onclick = () => {
      state.avatar[btn.dataset.group] = btn.dataset.id;
      renderCharacterCreation();
    };
  });

  document.getElementById("confirm-avatar").onclick = () => rollScene();
}


let eventPool = [];
let recentEventIds = [];
let usedThisSemester = new Set();
let lastSemesterKey = null;
let examQueue = [];
let examFocusPoints = 0;
let gameOver = false;
let currentEvent = null;

const actions = [
  {
    id: "study",
    label: "Study"
  },
  {
    id: "sleep",
    label: "Sleep",
    effects: { gpa: -0.02, sanity: 20, social: -10 , budget: 50},
    results: [
      "A full eight hours. It feels vaguely illegal at this point in the semester.",
      "You wake up before noon. A personal record.",
      "You dream about a deadline. You wake up relieved it was a dream, then remember it wasn't."
    ]
  },
  {
    id: "goout",
    label: "Go out",
    effects: { gpa: -0.03, sanity: 10, budget: -60, social: 20 },
    results: [
      "Iced latte, complaining about classes, and money you didn't really have. Worth it.",
      "You leave your notes at home on purpose. Best decision all week.",
      "Somehow the conversation is still about coursework. You cannot escape it. You laugh anyway."
    ]
  }
];

// ---- boot ----
async function boot() {
  try {
    const res = await fetch("events.json");
    eventPool = await res.json();
  } catch (e) {
    console.error("Could not load events.json — check it's in the same folder.", e);
    eventPool = [];
  }
  renderCharacterCreation();
}

function meetsRequirements(event) {
  if (!event.requires) return true;
  return event.requires.every(r => {
    const val = state[r.stat];
    if ("equals" in r) return val === r.equals;
    if ("min" in r) return val >= r.min;
    if ("max" in r) return val <= r.max;
    return true;
  });
}

// ---- derived time ----
function getTime() {
  const semesterIndex = Math.floor((state.day - 1) / SEMESTER_LENGTH);
  return {
    year: Math.floor(semesterIndex / 2) + 1,
    semester: (semesterIndex % 2) + 1,
    dayInSemester: ((state.day - 1) % SEMESTER_LENGTH) + 1
  };
}

function currentCourses() {
  const t = getTime();
  return COURSES[`${t.year}-${t.semester}`] || [];
}

// ---- rendering: top bar ----
function renderTopBar() {
  const t = getTime();
  document.getElementById("year").textContent = t.year;
  document.getElementById("semester").textContent = t.semester;
  document.getElementById("day").textContent = t.dayInSemester;

  // Calculate the new weighted GPA and sync it to the global state
  const currentGPA = calculateProjectedGPA();
  state.gpa = currentGPA; 

  const el = document.getElementById("stats");
  el.innerHTML =
    statCard("gpa", currentGPA.toFixed(2), currentGPA / 4, colorFor("gpa", currentGPA)) +
    statCard("sanity", Math.round(state.sanity), state.sanity / 100, colorFor("sanity", state.sanity)) +
    statCard("budget", Math.round(state.budget) + " TL", clamp01(state.budget / 1000), colorFor("budget", state.budget)) +
    statCard("social", Math.round(state.social), state.social / 100, colorFor("social", state.social));

  ensureCourseProgress(currentCourses());
  document.getElementById("courses").innerHTML = currentCourses()
    .map(c => {
      const g = letterGrade(state.courseProgress[c]);
      return `<div class="course-item">${c} <span class="course-grade" style="color:${gradeColor(g)}">${g}</span></div>`;
    }).join("");

  if (state.avatar) {
    document.getElementById("avatar-box").innerHTML = buildAvatarSVG(state.avatar, state);
  }

  renderTrack(t);
}

function ensureCourseProgress(courses) {
  courses.forEach(c => {
    if (!(c in state.courseProgress)) state.courseProgress[c] = BASE_MASTERY;
    if (!(c in state.courseLastTouched)) state.courseLastTouched[c] = state.day;
  });
}

// grades quietly slip if a course hasn't been engaged with in a while
function applyNeglect(courses) {
  courses.forEach(c => {
    const gap = state.day - (state.courseLastTouched[c] ?? state.day);
    if (gap > NEGLECT_THRESHOLD) {
      state.courseProgress[c] = Math.max(0, (state.courseProgress[c] ?? BASE_MASTERY) - NEGLECT_RATE);
    }
  });
}

function letterGrade(mastery) {
  if (mastery >= 93) return "A";
  if (mastery >= 90) return "A-";
  if (mastery >= 87) return "B+";
  if (mastery >= 83) return "B";
  if (mastery >= 80) return "B-";
  if (mastery >= 77) return "C+";
  if (mastery >= 73) return "C";
  if (mastery >= 70) return "C-";
  if (mastery >= 67) return "D+";
  if (mastery >= 63) return "D";
  if (mastery >= 60) return "D-";
  return "F";
}

// Converts 0-100 mastery into a standard 4.0 scale point value
function masteryToGPA(mastery) {
  if (mastery >= 93) return 4.0;
  if (mastery >= 90) return 3.7;
  if (mastery >= 87) return 3.3;
  if (mastery >= 83) return 3.0;
  if (mastery >= 80) return 2.7;
  if (mastery >= 77) return 2.3;
  if (mastery >= 73) return 2.0;
  if (mastery >= 70) return 1.7;
  if (mastery >= 67) return 1.3;
  if (mastery >= 63) return 1.0;
  if (mastery >= 60) return 0.5;
  return 0.0;
}

// Calculates the real-time GPA using course credit weights
function calculateProjectedGPA() {
  const courses = currentCourses();
  let totalGradePoints = state.completedGradePoints;
  let totalCredits = state.completedCredits;

  courses.forEach(c => {
    const mastery = state.courseProgress[c] ?? BASE_MASTERY;
    const gradePoint = masteryToGPA(mastery);
    const credits = COURSE_WEIGHTS[c] || 3;
    totalGradePoints += gradePoint * credits;
    totalCredits += credits;
  });

  return totalCredits === 0 ? state.gpa : totalGradePoints / totalCredits;
}

function gradeColor(letter) {
  if (letter.startsWith("A") || letter.startsWith("B")) return "var(--good)";
  if (letter.startsWith("C")) return "var(--accent)";
  return "var(--danger)";
}

function renderTrack(t) {
  const midpoint = Math.floor(SEMESTER_LENGTH / 2);
  const pct = d => ((d - 1) / (SEMESTER_LENGTH - 1)) * 100;
  const dotPct = pct(t.dayInSemester);

  const milestones = [
    { day: 1, label: "start" },
    { day: midpoint, label: "midterms" },
    { day: SEMESTER_LENGTH, label: "finals" }
  ];

  const ticks = milestones.map(m => `
    <div class="track-tick ${t.dayInSemester >= m.day ? "passed" : ""}" style="left:${pct(m.day)}%">
      <span class="track-label">${m.label}</span>
    </div>`).join("");

  document.getElementById("track").innerHTML = `
    <div class="track-line"></div>
    <div class="track-fill" style="width:${dotPct}%"></div>
    ${ticks}
    <div class="track-dot" style="left:${dotPct}%"></div>`;
}

function statCard(label, value, pct, color) {
  const width = Math.round(clamp01(pct) * 100);
  return `
    <div class="stat">
      <div class="stat-label">${label}</div>
      <div class="stat-value">${value}</div>
      <div class="stat-track"><div class="stat-fill" style="width:${width}%; background:${color};"></div></div>
    </div>`;
}

function colorFor(key, value) {
  if (key === "sanity") return value < 30 ? "var(--danger)" : value < 60 ? "var(--accent)" : "var(--good)";
  if (key === "gpa") return value < 1.8 ? "var(--danger)" : value < 3 ? "var(--accent)" : "var(--good)";
  if (key === "budget") return value < 0 ? "var(--danger)" : value < 150 ? "var(--accent)" : "var(--good)";
  if (key === "social") return value < 20 ? "var(--danger)" : value < 50 ? "var(--accent)" : "var(--good)";
  return "var(--accent)";
}

function clamp01(n) { return Math.max(0, Math.min(1, n)); }
function pickFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---- scene flow ----
function rollScene() {
  const t = getTime();

  if (t.year > MAX_YEARS) {
    if (!state.minigamePlayed) {
      state.minigamePlayed = true;
      renderMinigamePopup(renderEnding);
      return;
    }
    renderEnding();
    return;
  }

  const semesterKey = `${t.year}-${t.semester}`;
  if (semesterKey !== lastSemesterKey) {
    usedThisSemester.clear();
    lastSemesterKey = semesterKey;
  }

  ensureCourseProgress(currentCourses());
  if (t.dayInSemester > 1) applyNeglect(currentCourses());
  renderTopBar();

  if (t.dayInSemester === 1) {
    renderWelcome(t);
    return;
  }

  const midpoint = Math.floor(SEMESTER_LENGTH / 2);
  const finalsDay = SEMESTER_LENGTH - 1;
  if (t.dayInSemester === midpoint) {
    renderExamPeriod(t, "Midterms");
    return;
  }
  if (t.dayInSemester === finalsDay) {
    renderExamPeriod(t, "Finals");
    return;
  }
  if (t.dayInSemester === SEMESTER_LENGTH) {
    renderGradesPosted(t);
    return;
  }

  const courses = currentCourses();
  const eligible = eventPool.filter(e => {
    if (!meetsRequirements(e)) return false;
    if (!e.repeatable && usedThisSemester.has(e.id)) return false;
    if (e.courses) return e.courses.some(c => courses.includes(c));
    if (e.course) return courses.includes(e.course);
    return true;
  });
  const available = eligible.filter(e => !recentEventIds.includes(e.id));
  const pool = available.length ? available : eligible;

  const fireEvent = pool.length > 0 && Math.random() < EVENT_CHANCE;

  if (fireEvent) {
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    
    currentEvent = chosen;
    usedThisSemester.add(chosen.id);
    recentEventIds.push(chosen.id);
    if (recentEventIds.length > 3) recentEventIds.shift();
    
    const tag = chosen.course || (chosen.courses && chosen.courses[0]);
    renderChoiceScene(
      chosen.text, 
      chosen.choices, 
      tag ? `${tag.toLowerCase()}_lab.log` : "random_event.log",
      advanceDay
    );
  } 
  else {
    currentEvent = null; // Flush active event data
    renderChoiceScene(
      "Another day. What do you do with it?", 
      actions, 
      "daily_menu.sh",
      advanceDay
    );
  }
}

function renderWelcome(t) {
  document.getElementById("window-title").textContent = "welcome.txt";
  document.getElementById("hint").textContent = "";

  const isVeryFirst = t.year === 1 && t.semester === 1;
  const text = isVeryFirst
    ? "Welcome to your first semester as a CS student. Check the sidebar for what you're taking this term. Good luck."
    : `Welcome to year ${t.year}, semester ${t.semester}. New term, new courses, same amount of sleep deprivation.`;

  const body = document.getElementById("window-body");
  body.innerHTML = `
    <p class="scene-text">${text}</p>
    <button class="primary" id="start-semester">start the semester →</button>`;
  document.getElementById("start-semester").onclick = advanceDay;
}

// walks through every course in the current semester, one study-decision each,
// before letting the day advance — used for both midterms and finals
function renderExamPeriod(t, period) {
  examQueue = [...currentCourses()];
  examFocusPoints = EXAM_FOCUS_SLOTS;
  showNextExam(t, period);
}

function showNextExam(t, period) {
  if (examQueue.length === 0) {
    advanceDay();
    return;
  }
  const course = examQueue.shift();
  const choices = examChoices(course, period, examFocusPoints);
  const focusNote = examFocusPoints > 0
    ? `You have ${examFocusPoints} all-out cram session${examFocusPoints === 1 ? "" : "s"} left to spend this ${period.toLowerCase()} period.`
    : `You're out of all-out cram sessions for this period — pick your battles.`;
  renderChoiceScene(
    `${period} are coming for ${course}. ${focusNote}`,
    choices,
    `${period.toLowerCase()}.txt`,
    () => showNextExam(t, period)
  );
}

function examChoices(course, period, focusAvailable) {
  const examWord = period === "Finals" ? "final" : "midterm";
  return [
    {
      label: "Grind it out",
      courseTarget: course,
      costsFocus: true,
      disabled: focusAvailable <= 0,
      effects: { gpa: 0.08, sanity: -20, social: -5 },
      results: [`You brute-force every past exam you can find for ${course}. It works, but at a cost.`]
    },
    {
      label: "Study smart — spaced review, focus on patterns",
      courseTarget: course,
      effects: { gpa: 0.06, sanity: -8, social: -5 },
      results: [`You skip the panic and just review what actually gets tested in ${course}. Efficient.`]
    },
    {
      label: "Wing it",
      courseTarget: course,
      outcomes: [
        { weight: 0.4, effects: { gpa: 0.1, sanity: -2, social: -5 }, results: [`Somehow your guesses on the ${course} ${examWord} land. You will never be able to explain how.`] },
        { weight: 0.6, effects: { gpa: -0.1, sanity: -15, social: -5 }, results: [`The ${course} ${examWord} was not a guessing exercise. You find this out the hard way.`] }
      ]
    }
  ];
}

function renderGradesPosted(t) {
  const courses = currentCourses();
  const failed = courses.filter(c => (state.courseProgress[c] ?? BASE_MASTERY) < 60);

  if (failed.length > 0) {
    state.sanity = Math.max(0, state.sanity - failed.length * 8);
    renderTopBar();
    if (state.sanity <= 0) { renderBreakdown(); return; }
  }

  const choices = [
    {
      label: "Accept the curve",
      outcomes: [
        { weight: 0.5, effects: { sanity: 3, gpa: 0.01 }, results: ["Somehow the curve is kind this time. You take the win without asking questions."] },
        { weight: 0.5, effects: { sanity: 3, gpa: -0.02 }, results: ["The class average was a C+. It was, once again, designed by someone who dislikes joy."] }
      ]
    },
    {
      label: "Email the instructor about your grade",
      effects: { sanity: -4 },
      results: ["You get a reply three weeks later. It does not change anything, but at least you asked."]
    }
  ];

  const showGradesScene = () => {
      const warningText = (t.semester === 1 && state.gpa < 2.0)
    ? `<br><span class="scene-warning">⚠ Your GPA is under 2.0 at the halfway point — bring it up next semester or you'll be repeating the year.</span>`
    : "";
    renderChoiceScene(`Semester ${t.semester} grades are posted.${warningText}`, choices, "grades_posted.txt", () => afterGrades(t));
  }

  if (failed.length > 0) {
    renderFailedCoursePopup(failed, showGradesScene);
  } 
  else {
    showGradesScene();
  }
}

function afterGrades(t) {
  const courses = currentCourses();
  courses.forEach(c => {
    const mastery = state.courseProgress[c] ?? BASE_MASTERY;
    const gradePoint = masteryToGPA(mastery);
    const credits = COURSE_WEIGHTS[c] || 3;
    state.completedGradePoints += gradePoint * credits;
    state.completedCredits += credits;
  });

  const isEndOfYear = t.semester === 2;

  if (isEndOfYear && state.gpa < 2.0) {
    repeatYear(t);
  } else {
    advanceDay();
  }
}

function repeatYear(t) {
  state.sanity = Math.max(0, state.sanity - PROBATION_SANITY_PENALTY);
  renderTopBar();

  const newSemesterIndex = (t.year - 1) * 2;
  state.day = newSemesterIndex * SEMESTER_LENGTH + 1;

  renderProbationPopup(t, state.sanity <= 0);
}

function renderProbationPopup(t, willBreakdown) {
  const overlay = document.createElement("div");
  overlay.className = "fail-popup-overlay";
  overlay.innerHTML = `
    <div class="fail-popup-card">
      <div class="fail-popup-title" style="color:var(--danger)">academic probation</div>
      <p class="fail-popup-note" style="font-size:14px; color:var(--ink-soft); margin-bottom:1rem;">
        Your GPA fell below 2.0 for year ${t.year}. Same courses, same mistakes, less patience left for either.
      </p>
      <p class="fail-popup-red" style="display:block; margin-bottom:1.5rem;">sanity -${PROBATION_SANITY_PENALTY}</p>
      <button class="primary" id="probation-continue">${willBreakdown ? "..." : "start the year again →"}</button>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById("probation-continue").onclick = () => {
    document.body.removeChild(overlay);
    willBreakdown ? renderBreakdown() : rollScene();
  };
}

function renderChoiceScene(text, choices, windowTitle, continueOverride) {
  document.getElementById("window-title").textContent = windowTitle;
  document.getElementById("hint").textContent = "choose an action to advance the day";

  const body = document.getElementById("window-body");
  body.innerHTML = `
    <p class="scene-text">${text}</p>
    <div class="choices">
      ${choices.map((c, i) => `
        <button data-i="${i}" ${c.disabled ? "disabled" : ""}>${c.label}${c.disabled ? '<span class="choice-disabled-note">no cram sessions left</span>' : ""}</button>`).join("")}
    </div>`;

  body.querySelectorAll("button").forEach(btn => {
    if (btn.disabled) return;
    btn.onclick = () => {
      const choice = choices[parseInt(btn.dataset.i)];
      if (choice.id === "study") { renderStudyPicker(continueOverride); return; }
      applyChoice(choice, continueOverride);
    };
  });
}

function renderStudyPicker(continueOverride) {
  const courses = currentCourses();
  ensureCourseProgress(courses);

  document.getElementById("window-title").textContent = "choose_course.txt";
  document.getElementById("hint").textContent = "choose an action to advance the day";

  const body = document.getElementById("window-body");
  body.innerHTML = `
    <p class="scene-text">Which course are you spending time on today?</p>
    <div class="choices">
      ${courses.map(c => {
        const g = letterGrade(state.courseProgress[c]);
        return `<button data-c="${c}">${c} <span class="choice-grade" style="color:${gradeColor(g)}">${g}</span></button>`;
      }).join("")}
    </div>`;

  body.querySelectorAll("button").forEach(btn => {
    btn.onclick = () => {
      const course = btn.dataset.c;
      const choice = {
        courseTarget: course,
        effects: { gpa: 0.05, sanity: -6, social: -10, budget: 20 },
        results: [
          `You spend the day buried in ${course}'s tasks. Progress, probably.`,
          `${course} finally starts clicking. Or you're just too tired to notice it doesn't.`,
          `You review ${course} notes until the words stop meaning anything.`
        ]
      };
      applyChoice(choice, continueOverride);
    };
  });
}

// resolves a choice — handles fixed-effect, weighted-outcome, and stat-conditional choices
function resolveChoice(choice) {
  if (choice.condition) {
    const value = state[choice.condition.stat];
    const branch = value >= choice.condition.min ? choice.condition.pass : choice.condition.fail;
    return { effects: branch.effects || {}, result: pickFrom(branch.results) };
  }
  if (choice.outcomes) {
    let r = Math.random();
    for (const o of choice.outcomes) {
      if (r < o.weight) return { effects: o.effects, result: pickFrom(o.results) };
      r -= o.weight;
    }
    const last = choice.outcomes[choice.outcomes.length - 1];
    return { effects: last.effects, result: pickFrom(last.results) };
  }
  const results = choice.results || (choice.result ? [choice.result] : ["..."]);
  return { effects: choice.effects || {}, result: pickFrom(results) };
}

function applyChoice(choice, continueOverride) {
  const { effects, result } = resolveChoice(choice);
  if (currentEvent && currentEvent.id) {
    state.completedEvents.push(currentEvent.id);
  }
  if (effects.sanity) state.sanity += effects.sanity;
  if (effects.budget) state.budget += effects.budget;
  if (effects.social) state.social += effects.social;
  if (effects.setHarassmentChain) state.harassmentChain = true;
  if (effects.gpa) {
    const targetCourse = choice.courseTarget || pickFrom(currentCourses());
    const masteryDelta = Math.round(effects.gpa * 100); 
    
    const cur = state.courseProgress[targetCourse] ?? BASE_MASTERY;
    state.courseProgress[targetCourse] = Math.max(0, Math.min(100, cur + masteryDelta));
    state.courseLastTouched[targetCourse] = state.day;
  }

  // Bound checks
  state.sanity = Math.max(0, Math.min(100, Math.round(state.sanity)));
  state.budget = Math.round(state.budget);
  state.social = Math.max(0, Math.min(100, Math.round(state.social)));

  if (choice.costsFocus) {
    examFocusPoints = Math.max(0, examFocusPoints - 1);
  }

  // Rerender the UI
  renderTopBar();

  // Endings check
  if (state.sanity <= 0) { renderBreakdown(); return; }
  if (state.budget <= 0) { renderBankruptcy(); return; }
  if (state.social <= 0) { renderIsolation(); return; }

  renderResult(result, effects, continueOverride || advanceDay);
}

function renderResult(resultText, effects, onContinue) {
  document.getElementById("window-title").textContent = "system_message.log";
  document.getElementById("hint").textContent = "";
  const body = document.getElementById("window-body");
  let effectsHtml = "";
  
  for (const stat in effects) {
    if (stat === "gpa" || stat === "sanity" || stat === "budget" || stat === "social") {
      const val = effects[stat];
      if (val !== 0) {
        const isPositive = val > 0;
        const sign = isPositive ? "+" : "";
        const className = isPositive ? "stat-up" : "stat-down";
        const displayVal = stat === "gpa" ? val.toFixed(2) : Math.round(val);
        const suffix = stat === "budget" ? " TL" : "";
        
        effectsHtml += `<div class="${className}">${stat.toUpperCase()}: ${sign}${displayVal}${suffix}</div>`;
      }
    }
  }

  body.innerHTML = `
    <div class="result-scene">
      <p class="scene-result">${resultText}</p>
      <div class="effects-list" style="margin: 15px 0;">
        ${effectsHtml}
      </div>
      <button class="primary" id="continue-btn">continue →</button>
    </div>
  `;
  
  document.getElementById("continue-btn").onclick = () => {
    onContinue();
  };
}

function formatEffects(effects) {
  return Object.entries(effects || {})
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`)
    .join("   ");
}

function advanceDay() {
  state.day += 1;
  rollScene();
}

// ---- mini-game popup (job hunt, shown once before the Year 2 ending) ----
const MINIGAME_OUTCOMES = {
  win: {
    statusReady: "Offer received. Ready to move on.",
    effects: { gpa: 0.05, budget: 300, sanity: 10 },
    summary: "You landed the offer. GPA +0.05 · Budget +300 TL · Sanity +10"
  },
  "no-skills": {
    statusReady: "Survived, but under-qualified. Ready to move on.",
    effects: { budget: 50, sanity: -5 },
    summary: "You survived but didn't qualify. Budget +50 TL · Sanity -5"
  },
  rejected: {
    statusReady: "Rejected. Ready to move on.",
    effects: { sanity: -15 },
    summary: "Rejected outright. Sanity -15"
  }
};

function renderMinigamePopup(onComplete) {
  const MAX_TRIES = 15;
  let finalResult = null;
  let tries = 0;

  const overlay = document.createElement("div");
  overlay.className = "minigame-overlay";
  overlay.innerHTML = `
    <div class="minigame-frame-wrap">
      <iframe id="minigame-frame" src="cvhunt.html"></iframe>
    </div>
    <div class="minigame-status" id="minigame-status">graduation is here — land the offer, or you're out after ${MAX_TRIES} attempts.</div>
    <button class="primary minigame-continue" id="minigame-continue">continue →</button>`;
  document.body.appendChild(overlay);

  const statusEl = overlay.querySelector("#minigame-status");
  const continueBtn = overlay.querySelector("#minigame-continue");
  const frameWrap = overlay.querySelector(".minigame-frame-wrap");   // NEW: reference to the wrapper so we can lock it
  const frame = overlay.querySelector("#minigame-frame");            // NEW: reference to the iframe itself

  function lockGame() {
    frame.style.pointerEvents = "none";
    frameWrap.classList.add("locked");
  }

  function handleMessage(e) {
    const data = e.data;
    if (!data || data.source !== "cvhunt") return;
    if (finalResult) return; // NEW: already locked in — ignore any further messages from the iframe
    const outcomeInfo = MINIGAME_OUTCOMES[data.outcome];
    if (!outcomeInfo) return;

    if (data.outcome === "win") {
      finalResult = outcomeInfo;
      statusEl.textContent = finalResult.statusReady;
      continueBtn.classList.add("ready");
      lockGame(); // NEW: block retrying once attempts are exhausted
      return;
    }

    tries++;
    if (tries >= MAX_TRIES) {
      finalResult = outcomeInfo;
      statusEl.textContent = `Out of attempts (${MAX_TRIES}/${MAX_TRIES}). ${finalResult.statusReady}`;
      continueBtn.classList.add("ready");
      lockGame(); // NEW: block retrying after a win
    } else {
      statusEl.textContent = `Attempt ${tries}/${MAX_TRIES} — didn't land it. Try again.`;
    }
  }
  window.addEventListener("message", handleMessage);

  continueBtn.onclick = () => {
    if (!finalResult) return; // locked until a win or the 15th attempt
    window.removeEventListener("message", handleMessage);
    document.body.removeChild(overlay);

    const effects = finalResult.effects;
    if (effects.sanity) state.sanity += effects.sanity;
    if (effects.budget) state.budget += effects.budget;
    if (effects.social) state.social += effects.social;
    if (effects.gpa) {
      const targetCourse = pickFrom(currentCourses());
      const masteryDelta = Math.round(effects.gpa * 100);
      const cur = state.courseProgress[targetCourse] ?? BASE_MASTERY;
      state.courseProgress[targetCourse] = Math.max(0, Math.min(100, cur + masteryDelta));
    }
    state.sanity = Math.max(0, Math.min(100, Math.round(state.sanity)));
    state.budget = Math.round(state.budget);
    state.social = Math.max(0, Math.min(100, Math.round(state.social)));

    renderTopBar();
    if (state.sanity <= 0) { renderBreakdown(); return; }
    if (state.budget <= 0) { renderBankruptcy(); return; }
    if (state.social <= 0) { renderIsolation(); return; }

    renderResult(finalResult.summary, effects, onComplete);
  };
}

function renderEnding() {
  document.getElementById("window-title").textContent = "end_of_data.txt";
  document.getElementById("hint").textContent = "";
  document.getElementById("courses").innerHTML = "";
  const body = document.getElementById("window-body");
  body.innerHTML = `
    <div class="ending">
      <div class="ending-title">Year 2 complete</div>
      <p class="scene-result">
        Final GPA: ${state.gpa.toFixed(2)} · Sanity: ${Math.round(state.sanity)} · Budget: ${Math.round(state.budget)} TL<br><br>
        The game's data ends here — same as the developers, who haven't lived through year 3 yet.
        Check back once they have.
      </p>
    </div>`;
}

function renderBreakdown() {
  gameOver = true;
  document.getElementById("window-title").textContent = "core_dumped.txt";
  document.getElementById("hint").textContent = "";
  document.getElementById("courses").innerHTML = "";
  const body = document.getElementById("window-body");
  body.innerHTML = `
    <div class="ending">
      <div class="ending-title ending-danger">you lose your mind</div>
      <p class="scene-result">
        Sanity hit zero. Somewhere between the FPGA, the group project, and the third all-nighter this week,
        something quietly gave out. You take the semester off.
      </p>
      <button class="primary" id="restart-game">start over →</button>
    </div>`;
  document.getElementById("restart-game").onclick = () => location.reload();
}

function renderBankruptcy() {
  gameOver = true;
  document.getElementById("window-title").textContent = "insufficient_funds.txt";
  document.getElementById("hint").textContent = "";
  document.getElementById("courses").innerHTML = "";
  const body = document.getElementById("window-body");
  body.innerHTML = `
    <div class="ending">
      <div class="ending-title ending-danger">you run out of money</div>
      <p class="scene-result">
        Budget hit zero. No more ramen, no more shuttle fare, no more pretending the tea-shop trips were sustainable.
        You have to withdraw for the semester and figure out a job.
      </p>
      <button class="primary" id="restart-game">start over →</button>
    </div>`;
  document.getElementById("restart-game").onclick = () => location.reload();
}

function renderIsolation() {
  gameOver = true;
  document.getElementById("window-title").textContent = "insufficient_interest.txt";
  document.getElementById("hint").textContent = "";
  document.getElementById("courses").innerHTML = "";
  const body = document.getElementById("window-body");
  body.innerHTML = `
    <div class="ending">
      <div class="ending-title ending-danger">you are completely alone</div>
      <p class="scene-result">
        Social hit zero. You lost all <em>interest</em> in hanging out, so your friends <em>withdrawn</em> all their invites. You are officially socially bankrupt.
      </p>
      <button class="primary" id="restart-game">start over →</button>
    </div>`;
  document.getElementById("restart-game").onclick = () => location.reload();
}

function renderFailedCoursePopup(failedCourses, onContinue) {
  const overlay = document.createElement("div");
  overlay.className = "fail-popup-overlay";
  overlay.innerHTML = `
    <div class="fail-popup-card">
      <div class="fail-popup-title">semester results</div>
      <div class="fail-popup-list">
        ${failedCourses.map(c => `
          <div class="fail-popup-item">${c} — <span class="fail-popup-red">this course is failed</span></div>
        `).join("")}
      </div>
      <p class="fail-popup-note">(a retake challenge may show up here in a future update)</p>
      <button class="primary" id="fail-popup-continue">continue →</button>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById("fail-popup-continue").onclick = () => {
    document.body.removeChild(overlay);
    onContinue();
  };
}

function restartGame() {
  location.reload();
}

boot();