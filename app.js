// =======================
// 1) Storage + Helpers
// =======================
const LS_KEY = "anon_grading_db_v1";

function loadDB() {
  const raw = localStorage.getItem(LS_KEY);
  if (raw) return JSON.parse(raw);

  // First time: create empty database
  const db = {
    users: [],        // { id, username, role }
    projects: [],     // { id, title, teamUsernames:[], createdBy }
    deliverables: [], // { id, projectId, title, dueAt, jurySize, editWindowMin, link, juryUserIds:[] }
    grades: [],       // { id, deliverableId, evaluatorId, value, createdAt, updatedAt }
    session: null     // { userId }
  };
  localStorage.setItem(LS_KEY, JSON.stringify(db));
  return db;
}

function saveDB(db) {
  localStorage.setItem(LS_KEY, JSON.stringify(db));
}

function uid(prefix="id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function nowMs() { return Date.now(); }

function clamp2Decimals(num) {
  // keep max 2 decimals, no rounding weirdness
  return Math.round(num * 100) / 100;
}

function isValidGrade(x) {
  if (Number.isNaN(x)) return false;
  if (x < 1 || x > 10) return false;
  // max 2 fractional digits
  const s = x.toString();
  if (!s.includes(".")) return true;
  return s.split(".")[1].length <= 2;
}

function byId(list, id) {
  return list.find(x => x.id === id);
}

function formatDT(ms) {
  const d = new Date(ms);
  return d.toLocaleString();
}

// =======================
// 2) DOM references
// =======================
const authView = document.getElementById("authView");
const studentView = document.getElementById("studentView");
const professorView = document.getElementById("professorView");
const sessionBar = document.getElementById("sessionBar");

const regUsername = document.getElementById("regUsername");
const regRole = document.getElementById("regRole");
const btnRegister = document.getElementById("btnRegister");

const loginUsername = document.getElementById("loginUsername");
const btnLogin = document.getElementById("btnLogin");

const projTitle = document.getElementById("projTitle");
const projTeam = document.getElementById("projTeam");
const btnCreateProject = document.getElementById("btnCreateProject");

const deliverableProject = document.getElementById("deliverableProject");
const delTitle = document.getElementById("delTitle");
const delDue = document.getElementById("delDue");
const delJurySize = document.getElementById("delJurySize");
const delEditWindow = document.getElementById("delEditWindow");
const btnCreateDeliverable = document.getElementById("btnCreateDeliverable");

const studentProjects = document.getElementById("studentProjects");
const juryTasks = document.getElementById("juryTasks");

const profProjects = document.getElementById("profProjects");

// =======================
// 3) Session helpers
// =======================
function getCurrentUser(db) {
  if (!db.session) return null;
  return byId(db.users, db.session.userId) || null;
}

function logout() {
  const db = loadDB();
  db.session = null;
  saveDB(db);
  render();
}

function loginAs(userId) {
  const db = loadDB();
  db.session = { userId };
  saveDB(db);
  render();
}

// =======================
// 4) Core logic (projects, deliverables, jury, grades)
// =======================
function parseTeamUsernames(raw) {
  // "ana, bogdan" -> ["ana","bogdan"]
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  // remove duplicates
  return Array.from(new Set(list));
}

function userByUsername(db, username) {
  return db.users.find(u => u.username.toLowerCase() === username.toLowerCase()) || null;
}

function isUserInTeam(project, username) {
  return project.teamUsernames.some(u => u.toLowerCase() === username.toLowerCase());
}

function eligibleEvaluatorsForDeliverable(db, deliverable) {
  const project = byId(db.projects, deliverable.projectId);
  if (!project) return [];

  // Eligible: all students, except PM team members of this project
  return db.users.filter(u => {
    if (u.role !== "student") return false;
    const inTeam = isUserInTeam(project, u.username);
    return !inTeam;
  });
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignJuryIfDue(db, deliverable) {
  // Only assign if due and not assigned yet
  if (deliverable.juryUserIds && deliverable.juryUserIds.length > 0) return;

  if (nowMs() < deliverable.dueAt) return; // not due yet

  const eligible = eligibleEvaluatorsForDeliverable(db, deliverable);
  const wanted = Math.max(3, Number(deliverable.jurySize) || 3);
  const chosen = shuffle(eligible).slice(0, Math.min(wanted, eligible.length)).map(u => u.id);

  deliverable.juryUserIds = chosen;
}

function canEditGrade(deliverable) {
  // Grade can be modified only until dueAt + editWindowMin
  const end = deliverable.dueAt + (deliverable.editWindowMin * 60 * 1000);
  return nowMs() <= end;
}

function getGradesForDeliverable(db, deliverableId) {
  return db.grades.filter(g => g.deliverableId === deliverableId);
}

function computeFinalGradeFromValues(values) {
  // omit lowest + highest, average remaining
  if (values.length < 3) return null; // not enough to omit min/max
  const sorted = [...values].sort((a,b) => a - b);
  const trimmed = sorted.slice(1, sorted.length - 1);
  const avg = trimmed.reduce((s,x)=>s+x,0) / trimmed.length;
  return clamp2Decimals(avg);
}

// =======================
// 5) UI Rendering
// =======================
function renderSessionBar(db, user) {
  if (!user) {
    sessionBar.innerHTML = `<span class="badge">Not logged in</span>`;
    return;
  }
  sessionBar.innerHTML = `
    <span class="badge">Logged in: ${user.username} (${user.role})</span>
    <button class="secondary" id="btnLogout">Logout</button>
    <button class="danger" id="btnReset">Reset Demo Data</button>
  `;

  document.getElementById("btnLogout").onclick = logout;
  document.getElementById("btnReset").onclick = () => {
    if (!confirm("Reset EVERYTHING from localStorage?")) return;
    localStorage.removeItem(LS_KEY);
    render();
  };
}

function show(view) {
  authView.classList.add("hidden");
  studentView.classList.add("hidden");
  professorView.classList.add("hidden");
  view.classList.remove("hidden");
}

function renderProjectOptions(db, user) {
  // Student can select projects where they are in team (PM) for creating deliverables
  deliverableProject.innerHTML = "";
  const myProjects = db.projects.filter(p => isUserInTeam(p, user.username));
  for (const p of myProjects) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.title;
    deliverableProject.appendChild(opt);
  }
  if (myProjects.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No projects yet (create one first)";
    deliverableProject.appendChild(opt);
  }
}

function renderStudentProjects(db, user) {
  const myProjects = db.projects.filter(p => isUserInTeam(p, user.username));

  if (myProjects.length === 0) {
    studentProjects.innerHTML = `<p class="small">You are not PM in any project yet.</p>`;
    return;
  }

  const html = myProjects.map(p => {
    const dels = db.deliverables.filter(d => d.projectId === p.id);
    const delHtml = dels.map(d => {
      // auto-assign jury if due
      assignJuryIfDue(db, d);

      const dueText = formatDT(d.dueAt);
      const isDue = nowMs() >= d.dueAt;
      const juryCount = (d.juryUserIds || []).length;

      return `
        <div class="subcard">
          <div class="row">
            <strong>${d.title}</strong>
            <span class="badge">Due: ${dueText}</span>
            <span class="badge">Jury: ${juryCount}/${d.jurySize}</span>
            <span class="badge">Edit window: ${d.editWindowMin} min</span>
          </div>

          <div class="row" style="margin-top:8px;">
            <input id="link_${d.id}" placeholder="Video or deployed link (https://...)" value="${d.link || ""}" />
            <button class="secondary" data-save-link="${d.id}">Save link</button>
          </div>

          <div class="hr"></div>

          <div class="row">
            <button ${isDue ? "" : "disabled"} class="secondary" data-force-assign="${d.id}">
              Force jury selection (demo)
            </button>
            <span class="small">${isDue ? "Due reached: jury can be assigned." : "Not due yet: jury won't auto-assign."}</span>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="subcard">
        <div class="row">
          <strong>${p.title}</strong>
          <span class="badge">Team: ${p.teamUsernames.join(", ")}</span>
        </div>
        ${dels.length ? delHtml : `<p class="small">No deliverables yet.</p>`}
      </div>
    `;
  }).join("");

  studentProjects.innerHTML = html;

  // Link save handlers
  studentProjects.querySelectorAll("[data-save-link]").forEach(btn => {
    btn.onclick = () => {
      const db2 = loadDB();
      const dId = btn.getAttribute("data-save-link");
      const d = byId(db2.deliverables, dId);
      if (!d) return;

      const proj = byId(db2.projects, d.projectId);
      const me = getCurrentUser(db2);
      if (!proj || !me) return;

      // permission: only PM team can edit link
      if (!isUserInTeam(proj, me.username)) {
        alert("Only PM team members can update links.");
        return;
      }

      const input = document.getElementById(`link_${dId}`);
      d.link = (input.value || "").trim();
      saveDB(db2);
      render();
    };
  });

  // Force assign jury (demo button)
  studentProjects.querySelectorAll("[data-force-assign]").forEach(btn => {
    btn.onclick = () => {
      const db2 = loadDB();
      const dId = btn.getAttribute("data-force-assign");
      const d = byId(db2.deliverables, dId);
      if (!d) return;

      // for demo: set dueAt in past if not due yet
      if (nowMs() < d.dueAt) d.dueAt = nowMs() - 1000;

      assignJuryIfDue(db2, d);
      saveDB(db2);
      render();
    };
  });
}

function renderJuryTasks(db, user) {
  // tasks where user is in jury
  const tasks = db.deliverables.filter(d => (d.juryUserIds || []).includes(user.id));

  if (tasks.length === 0) {
    juryTasks.innerHTML = `<p class="small">No deliverables assigned to you as jury.</p>`;
    return;
  }

  const html = tasks.map(d => {
    const project = byId(db.projects, d.projectId);
    const myGrade = db.grades.find(g => g.deliverableId === d.id && g.evaluatorId === user.id) || null;

    const editable = canEditGrade(d);
    const status = editable ? "Editing allowed" : "Editing closed";

    return `
      <div class="subcard">
        <div class="row">
          <strong>${project ? project.title : "Unknown project"}</strong>
          <span class="badge">${d.title}</span>
          <span class="badge">${status}</span>
        </div>

        <p class="small">Link: ${d.link ? `<a href="${d.link}" target="_blank" rel="noreferrer">${d.link}</a>` : "<em>no link yet</em>"}</p>

        <div class="row">
          <label style="flex:1;">Your grade (1-10, max 2 decimals)
            <input id="grade_${d.id}" type="number" min="1" max="10" step="0.01" value="${myGrade ? myGrade.value : ""}" />
          </label>
          <button ${editable ? "" : "disabled"} data-save-grade="${d.id}">
            ${myGrade ? "Update grade" : "Submit grade"}
          </button>
        </div>

        <p class="hint mono">You can only edit your own grade, until: ${formatDT(d.dueAt + d.editWindowMin*60*1000)}</p>
      </div>
    `;
  }).join("");

  juryTasks.innerHTML = html;

  juryTasks.querySelectorAll("[data-save-grade]").forEach(btn => {
    btn.onclick = () => {
      const db2 = loadDB();
      const me = getCurrentUser(db2);
      const dId = btn.getAttribute("data-save-grade");
      const d = byId(db2.deliverables, dId);
      if (!me || !d) return;

      if (!(d.juryUserIds || []).includes(me.id)) {
        alert("Only jury members can grade this deliverable.");
        return;
      }
      if (!canEditGrade(d)) {
        alert("Editing time expired for this deliverable.");
        return;
      }

      const input = document.getElementById(`grade_${dId}`);
      const val = clamp2Decimals(Number(input.value));

      if (!isValidGrade(val)) {
        alert("Invalid grade. Must be between 1 and 10, with at most 2 decimals.");
        return;
      }

      let g = db2.grades.find(x => x.deliverableId === dId && x.evaluatorId === me.id);
      if (!g) {
        g = { id: uid("g"), deliverableId: dId, evaluatorId: me.id, value: val, createdAt: nowMs(), updatedAt: nowMs() };
        db2.grades.push(g);
      } else {
        g.value = val;
        g.updatedAt = nowMs();
      }

      saveDB(db2);
      render();
    };
  });
}

function renderProfessor(db) {
  if (db.projects.length === 0) {
    profProjects.innerHTML = `<p class="small">No projects yet.</p>`;
    return;
  }

  // professor sees projects, deliverables, grades summary (anonymous)
  const html = db.projects.map(p => {
    const dels = db.deliverables.filter(d => d.projectId === p.id);

    const delsHtml = dels.map(d => {
      // ensure jury assigned if due
      assignJuryIfDue(db, d);

      const grades = getGradesForDeliverable(db, d.id);
      const values = grades.map(g => Number(g.value)).filter(x => !Number.isNaN(x));
      const final = computeFinalGradeFromValues(values);

      // IMPORTANT: no jury identities shown
      return `
        <div class="subcard">
          <div class="row">
            <strong>${d.title}</strong>
            <span class="badge">Due: ${formatDT(d.dueAt)}</span>
            <span class="badge">Grades: ${values.length}/${(d.juryUserIds||[]).length}</span>
          </div>

          <p class="small">Link: ${d.link ? `<a href="${d.link}" target="_blank" rel="noreferrer">${d.link}</a>` : "<em>no link</em>"}</p>

          <p class="small">Submitted grade values (anonymous): <span class="mono">${values.length ? values.join(", ") : "none"}</span></p>

          <p class="small"><strong>Final grade (drop min & max):</strong> ${final === null ? "<em>need at least 3 grades</em>" : final}</p>
        </div>
      `;
    }).join("");

    return `
      <div class="subcard">
        <div class="row">
          <strong>${p.title}</strong>
          <span class="badge">Team: ${p.teamUsernames.join(", ")}</span>
        </div>
        ${dels.length ? delsHtml : `<p class="small">No deliverables.</p>`}
      </div>
    `;
  }).join("");

  profProjects.innerHTML = html;
}

// =======================
// 6) Main render
// =======================
function render() {
  const db = loadDB();
  const user = getCurrentUser(db);

  // auto-assign juries for due deliverables (on every render)
  for (const d of db.deliverables) assignJuryIfDue(db, d);
  saveDB(db);

  renderSessionBar(db, user);

  if (!user) {
    show(authView);
    return;
  }

  if (user.role === "student") {
    show(studentView);
    renderProjectOptions(db, user);
    renderStudentProjects(db, user);
    renderJuryTasks(db, user);
  } else {
    show(professorView);
    renderProfessor(db);
  }
}

// =======================
// 7) Buttons: Register / Login / Create
// =======================
btnRegister.onclick = () => {
  const db = loadDB();
  const username = (regUsername.value || "").trim();
  const role = regRole.value;

  if (!username) return alert("Username required.");
  if (userByUsername(db, username)) return alert("Username already exists.");

  const user = { id: uid("u"), username, role };
  db.users.push(user);
  db.session = { userId: user.id };
  saveDB(db);
  render();
};

btnLogin.onclick = () => {
  const db = loadDB();
  const username = (loginUsername.value || "").trim();
  const user = userByUsername(db, username);
  if (!user) return alert("No such user. Register first.");
  loginAs(user.id);
};

btnCreateProject.onclick = () => {
  const db = loadDB();
  const me = getCurrentUser(db);
  if (!me || me.role !== "student") return;

  const title = (projTitle.value || "").trim();
  const team = parseTeamUsernames(projTeam.value || "");

  if (!title) return alert("Project title required.");
  if (team.length === 0) return alert("Team must have at least 1 username.");
  if (!team.some(u => u.toLowerCase() === me.username.toLowerCase())) {
    return alert("Your username must be included in the team (so you are PM).");
  }

  // ensure all team members exist (simplify: require they are registered)
  for (const name of team) {
    const u = userByUsername(db, name);
    if (!u) return alert(`Team member "${name}" is not registered yet.`);
    if (u.role !== "student") return alert(`"${name}" is not a student user.`);
  }

  const project = { id: uid("p"), title, teamUsernames: team, createdBy: me.id };
  db.projects.push(project);
  saveDB(db);
  projTitle.value = "";
  projTeam.value = "";
  render();
};

btnCreateDeliverable.onclick = () => {
  const db = loadDB();
  const me = getCurrentUser(db);
  if (!me || me.role !== "student") return;

  const projectId = deliverableProject.value;
  const project = byId(db.projects, projectId);
  if (!project) return alert("Select a valid project first.");

  // permission: only PM team can create deliverable
  if (!isUserInTeam(project, me.username)) return alert("Only PM team can create deliverables.");

  const title = (delTitle.value || "").trim();
  const dueStr = delDue.value; // "YYYY-MM-DDTHH:mm"
  const jurySize = Number(delJurySize.value);
  const editWindowMin = Number(delEditWindow.value);

  if (!title) return alert("Deliverable title required.");
  if (!dueStr) return alert("Due date required.");
  const dueAt = new Date(dueStr).getTime();
  if (Number.isNaN(dueAt)) return alert("Invalid due date.");

  if (!Number.isFinite(jurySize) || jurySize < 3) return alert("Jury size must be at least 3.");
  if (!Number.isFinite(editWindowMin) || editWindowMin < 1) return alert("Edit window must be >= 1 minute.");

  const d = {
    id: uid("d"),
    projectId,
    title,
    dueAt,
    jurySize,
    editWindowMin,
    link: "",
    juryUserIds: []
  };

  db.deliverables.push(d);
  saveDB(db);

  delTitle.value = "";
  delDue.value = "";
  render();
};

// Start
render();
