const SEMESTER_LENGTH = 16;  // days per semester
const MAX_YEARS = 2;         // scope: only years 1-2 are built right now
const EVENT_CHANCE = 0.45;   // chance a random event fires on an ordinary day

const EXAM_FOCUS_SLOTS = 2;  // how many courses you can "grind it out" for per exam period 
const BASE_MASTERY = 70;     // starting per-course grade bar (0-100), roughly a C- — matches the starting 2.0 GPA
const NEGLECT_THRESHOLD = 5; // days a course can go untouched before its grade starts slipping
const NEGLECT_RATE = 2;      // mastery points lost per day beyond the threshold

// courses per "year-semester" key
const COURSES = {
  "1-1": ["CS101", "MATH101", "MBG110", "ENG101", "TURK101"],
  "1-2": ["CS102", "MATH102", "MATH132", "ENG102", "TURK102"],
  "2-1": ["CS201", "CS223", "HIST200", "PHYS101", "HUM111"],
  "2-2": ["CS202", "CS224", "MATH225", "PHYS102", "HUM112"]
};

// ---- state ----
const state = {
  gpa: 2.5,
  sanity: 70,
  social: 50,
  budget: 500,
  day: 1,
  courseProgress: {},
  courseLastTouched: {}
};

let eventPool = [];
let recentEventIds = [];
let usedThisSemester = new Set();
let lastSemesterKey = null;
let examQueue = [];
let examFocusPoints = 0;
let gameOver = false;

const actions = [
  {
    id: "study",
    label: "Study"
  },
  {
    id: "sleep",
    label: "Sleep",
    effects: { gpa: -0.02, sanity: 20 },
    results: [
      "A full eight hours. It feels vaguely illegal at this point in the semester.",
      "You wake up before noon. A personal record.",
      "You dream about a deadline. You wake up relieved it was a dream, then remember it wasn't."
    ]
  },
  {
    id: "goout",
    label: "Go out",
    effects: { gpa: -0.03, sanity: 10, budget: -60 },
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
  rollScene();
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

  const el = document.getElementById("stats");
  el.innerHTML =
    statCard("gpa", state.gpa.toFixed(2), state.gpa / 4, colorFor("gpa", state.gpa)) +
    statCard("sanity", Math.round(state.sanity), state.sanity / 100, colorFor("sanity", state.sanity)) +
    statCard("budget", Math.round(state.budget) + " TL", clamp01(state.budget / 1000), colorFor("budget", state.budget)) +
    statCard("social", Math.round(state.social), state.social / 100, colorFor("social", state.social)); // <-- Add this line

  ensureCourseProgress(currentCourses());
  document.getElementById("courses").innerHTML = currentCourses()
    .map(c => {
      const g = letterGrade(state.courseProgress[c]);
      return `<div class="course-item">${c} <span class="course-grade" style="color:${gradeColor(g)}">${g}</span></div>`;
    }).join("");

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
    usedThisSemester.add(chosen.id);
    recentEventIds.push(chosen.id);
    if (recentEventIds.length > 3) recentEventIds.shift();
    const tag = chosen.course || (chosen.courses && chosen.courses[0]);
    renderChoiceScene(chosen.text, chosen.choices, tag ? `${tag.toLowerCase()}_lab.log` : "random_event.log");
  } else {
    renderChoiceScene("Another day. What do you do with it?", actions, "daily_menu.sh");
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
      effects: { gpa: 0.08, sanity: -20 },
      results: [`You brute-force every past exam you can find for ${course}. It works, but at a cost.`]
    },
    {
      label: "Study smart — spaced review, focus on patterns",
      courseTarget: course,
      effects: { gpa: 0.06, sanity: -8 },
      results: [`You skip the panic and just review what actually gets tested in ${course}. Efficient.`]
    },
    {
      label: "Wing it",
      courseTarget: course,
      outcomes: [
        { weight: 0.4, effects: { gpa: 0.1, sanity: -2 }, results: [`Somehow your guesses on the ${course} ${examWord} land. You will never be able to explain how.`] },
        { weight: 0.6, effects: { gpa: -0.1, sanity: -15 }, results: [`The ${course} ${examWord} was not a guessing exercise. You find this out the hard way.`] }
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

  const failText = failed.length
    ? ` You failed ${failed.join(", ")} — it drags your average down hard, and you already feel it.`
    : "";

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

  renderChoiceScene(`Semester ${t.semester} grades are posted.${failText}`, choices, "grades_posted.txt", () => afterGrades(t));
}

function afterGrades(t) {
  if (state.gpa < 2.0) {
    repeatYear(t);
  } else {
    advanceDay();
  }
}

function repeatYear(t) {
  state.sanity = Math.max(0, state.sanity - 20);
  if (state.sanity <= 0) { renderTopBar(); renderBreakdown(); return; }

  const newSemesterIndex = (t.year - 1) * 2;
  state.day = newSemesterIndex * SEMESTER_LENGTH + 1;
  renderTopBar();
  renderProbation(t);
}

function renderProbation(t) {
  document.getElementById("window-title").textContent = "probation_notice.txt";
  document.getElementById("hint").textContent = "";
  const body = document.getElementById("window-body");
  body.innerHTML = `
    <p class="scene-text">Your GPA fell below 2.0 for year ${t.year}. Academic probation — you'll need to retake the year in full.</p>
    <p class="scene-delta">sanity -20</p>
    <button class="primary" id="restart-year">start the year again →</button>`;
  document.getElementById("restart-year").onclick = rollScene;
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
    <p class="scene-text">Which class are you spending today on?</p>
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
        effects: { gpa: 0.05, sanity: -6 },
        results: [
          `You spend the day buried in ${course} problem sets. Progress, probably.`,
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

  for (const key in effects) {
    state[key] = state[key] + effects[key];
  }
  state.gpa = Math.max(0, Math.min(4, Math.round(state.gpa * 100) / 100));
  state.sanity = Math.max(0, Math.min(100, Math.round(state.sanity)));
  state.budget = Math.round(state.budget);

  if (choice.courseTarget && effects.gpa) {
    const delta = Math.round(effects.gpa * 100);
    const cur = state.courseProgress[choice.courseTarget] ?? BASE_MASTERY;
    state.courseProgress[choice.courseTarget] = Math.max(0, Math.min(100, cur + delta));
  }
  if (choice.courseTarget) {
    state.courseLastTouched[choice.courseTarget] = state.day;
  }
  if (choice.costsFocus) {
    examFocusPoints = Math.max(0, examFocusPoints - 1);
  }

  renderTopBar();

  if (state.sanity <= 0) { renderBreakdown(); return; }
  if (state.budget <= 0) { renderBankruptcy(); return; }

  renderResult(result, effects, continueOverride || advanceDay);
}

function renderResult(text, effects, continueFn) {
  document.getElementById("hint").textContent = "";
  const body = document.getElementById("window-body");
  body.innerHTML = `
    <p class="scene-result">${text}</p>
    <p class="scene-delta">${formatEffects(effects)}</p>
    <button class="primary" id="next-day">continue →</button>`;
  document.getElementById("next-day").onclick = continueFn || advanceDay;
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

boot();